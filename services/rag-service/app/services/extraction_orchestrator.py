"""Evidence-oriented extraction orchestrator (PRODUCT_DOC / EVIDENCE).

This sits between the new per-format `extractors` and the LLM `structure_content`
call, and produces a documentState + evidence block. Its responsibilities:

  1. Detect scanned / image-only PDFs and route those pages through page-tagged
     vision extraction instead of returning "no usable text" to the LLM.
  2. Decode LLM structured output into discrete evidence facts (see evidence.py),
     attach per-fact source (file / page / section / method) and per-field status
     (FOUND / NOT_FOUND / UNCERTAIN / CONFLICT / NOT_APPLICABLE).
  3. Compute a completeness report and a PARTIAL / COMPLETE documentState so a
     partially-processable document is never reported READY as if it were clean.
  4. Never silently drops content: pages/chunks that cannot be processed are
     counted and marked PARTIAL, never assumed away.

The compliance engine consuming these facts remains separate; this module only
answers "what is present, where did it come from, and how complete is it?".
"""
from __future__ import annotations

import asyncio
import logging
from typing import Any, Dict, List, Optional, Tuple

from app.services import evidence as evidence_mod
from app.services.evidence import Fact, SourceRef, merge_facts
from app.services.pdf_pipeline import render_pdf_pages
from app.services.structure_openai import (
    structure_content,
    CATEGORY_REGISTRY,
    PREDEFINED_PRODUCT_FIELDS,
)

logger = logging.getLogger(__name__)

PRODUCT_STATE_COMPLETE = "COMPLETE"
PRODUCT_STATE_PARTIAL = "PARTIAL"
PRODUCT_STATE_FAILED = "FAILED"
PRODUCT_STATE_UNKNOWN = "UNKNOWN"


def category_expected_fields(detected_categories: List[str]) -> List[str]:
    """Full dotted-path checklist: general predefined fields + every detected
    category's fields. Mirrors compute_extraction_quality's coverage so the
    evidence completeness report is consistent with the checklist the UI shows."""
    fields = [p for p, _ in PREDEFINED_PRODUCT_FIELDS]
    for key in detected_categories or []:
        cat = CATEGORY_REGISTRY.get(key)
        if cat:
            for path, _ in cat["fields"]:
                fields.append(path)
    # Dedupe preserving order.
    seen: set[str] = set()
    out: List[str] = []
    for f in fields:
        if f not in seen:
            seen.add(f)
            out.append(f)
    return out


def facts_from_product_profile(
    pp: Dict[str, Any],
    field_sources: Dict[str, str],
    file: str,
    page: Optional[int] = None,
    chunk_index: Optional[int] = None,
) -> List[Fact]:
    """Decode a productProfile dict + per-field source hints into evidence facts.

    Each leaf (scalar) becomes a Fact; arrays become one Fact per array item so
    traceability/conflict is preserved per item. Source hints from the model's
    `fieldSources` are attached where present; page/method are best-effort.
    """
    facts: List[Fact] = []
    if not isinstance(pp, dict):
        return facts

    def walk(node: Any, path: str):
        if node is None:
            return
        if isinstance(node, dict):
            for k, v in node.items():
                walk(v, f"{path}.{k}" if path else k)
        elif isinstance(node, list):
            for item in node:
                if isinstance(item, dict):
                    walk(item, path)      # e.g. traceabilityRows — recurse
                else:
                    facts.append(_leaf_fact(path, item, file, page, field_sources, chunk_index))
        else:
            facts.append(_leaf_fact(path, node, file, page, field_sources, chunk_index))

    walk(pp, "")
    return facts


def _leaf_fact(path: str, value: Any, file: str, page: Optional[int],
               field_sources: Dict[str, str], chunk_index: Optional[int]) -> Fact:
    s = str(value).strip()
    conf = 0.9
    if path in evidence_mod.HIGH_RISK_FIELDS:
        conf = 0.5 if not any(c.isdigit() for c in s) else 0.9
    section_hint = field_sources.get(path)
    source = SourceRef(file=file, page=page, section=section_hint, method="llm",
                       chunk_index=chunk_index)
    normalized = _safe_normalize(path, s)
    fact = Fact(
        field=path,
        value=s,
        confidence=conf,
        status=evidence_mod.FOUND if conf >= 0.5 else evidence_mod.UNCERTAIN,
        source=source,
        normalized_value=normalized,
        raw_value=s,
    )
    return fact


def _safe_normalize(field: str, value: str) -> Optional[str]:
    from app.services.normalize import normalize_value
    try:
        return normalize_value(field, value)
    except Exception:
        return None


async def extract_scanned_pdf_pages(
    raw_pdf: bytes,
    page_numbers: List[int],
    file_name: str,
    doc_type: str,
    iso_hint: Optional[str],
    description_hint: Optional[str],
    max_pages_per_request: int = 6,
) -> Tuple[Dict[str, Any], List[str]]:
    """Render scanned PDF pages and run the vision / structure path over them.

    Returns (augmented_structured, errors). `errors` are pages the vision model
    could not process; callers must mark the document PARTIAL, not READY."""
    rendered, render_errors = render_pdf_pages(raw_pdf, page_numbers)
    errors: List[str] = list(render_errors)

    merged: Dict[str, Any] = {}
    if not rendered:
        return merged, errors or ["no pdf renderer available"]

    # Group rendered pages into batches that each fit one vision request.
    for start in range(0, len(rendered), max_pages_per_request):
        batch = rendered[start:start + max_pages_per_request]
        # Build a single composite prompt describing all pages in the batch; the
        # vision-capable structure call accepts inline images, so pass each page.
        page_labels = ", ".join(f"p.{p['page']}" for p in batch)
        combo_text = (
            f"Scanned pages of a product document ({page_labels}). The text layer of "
            "these pages was empty/illegible, so I am providing the page images for "
            "you to read. Extract every visible identifier, label, table, and warning "
            "as if reading the page directly."
        )
        try:
            part = await structure_content(
                raw_text=combo_text,
                buffer=batch[0]["data_url"].encode("ascii"),
                mime_type="image/png",
                file_name=f"{file_name} (scanned {page_labels})",
                doc_type=doc_type,
                iso_hint=iso_hint,
                description_hint=description_hint,
                use_fallback=False,
            )
            merged = _merge_loose(merged, part)
            for pg in batch:
                _tag_page_sources(merged, pg["page"])
        except Exception as exc:
            errors.append(f"vision extraction failed for {page_labels}: {exc}")
    return merged, errors


def _merge_loose(acc: Dict[str, Any], part: Dict[str, Any]) -> Dict[str, Any]:
    """Minimal additive merge used only for scanned-page vision results. The
    canonical merge for chunked text is `_merge_structured` inside structure.py;
    here we only need to accumulate productProfile + section lists without losing
    any page's contribution."""
    out = dict(acc)
    acc_pp = acc.get("productProfile") if isinstance(acc.get("productProfile"), dict) else {}
    part_pp = part.get("productProfile") if isinstance(part.get("productProfile"), dict) else {}
    out["productProfile"] = _deep_merge(acc_pp, part_pp)
    secs = list(acc.get("sections") or [])
    for s in part.get("sections") or []:
        if isinstance(s, dict) and s not in secs:
            secs.append(s)
    out["sections"] = secs
    for k in ("fileSummary", "visualDescription"):
        if part.get(k):
            out[k] = (out.get(k) or "") + ("\n\n---\n" + str(part[k]) if out.get(k) else str(part[k]))
    # fieldSources: union, first-wins per key (lowest page wins keeps earliest evidence).
    srcs = dict(out.get("fieldSources") or {})
    for k, v in (part.get("fieldSources") or {}).items():
        srcs.setdefault(k, v)
    out["fieldSources"] = srcs
    return out


def _deep_merge(a: Dict[str, Any], b: Dict[str, Any]) -> Dict[str, Any]:
    out = dict(a)
    for k, v in b.items():
        if v is None:
            continue
        if k in out and isinstance(out[k], dict) and isinstance(v, dict):
            out[k] = _deep_merge(out[k], v)
        elif k in out and isinstance(out[k], list) and isinstance(v, list):
            combined = list(out[k])
            for item in v:
                if item not in combined:
                    combined.append(item)
            out[k] = combined
        else:
            out[k] = v
    return out


def _tag_page_sources(structured: Dict[str, Any], page: int) -> None:
    """Fan out a page-sourced fieldSources hint (key -> "scanned pages") so that
    facts built later can cite the page without extra bookkeeping."""
    for k in list((structured.get("fieldSources") or {}).keys()):
        v = structured["fieldSources"][k]
        if isinstance(v, str) and "scanned" not in v:
            structured["fieldSources"][k] = f"{v} (p.{page})"


def build_evidence_report(
    structured: Dict[str, Any],
    *,
    file: str,
    total_pages: int,
    processed_pages: int,
    skipped_pages: int,
    failed_chunks: int,
    total_chunks: int,
    detected_categories: List[str],
) -> Tuple[Dict[str, Any], str]:
    """Build the evidence block and resolve the document state. Returns
    (evidence_block, document_state)."""
    pp = structured.get("productProfile") if isinstance(structured.get("productProfile"), dict) else {}
    field_sources = structured.get("fieldSources") if isinstance(structured.get("fieldSources"), dict) else {}
    facts = facts_from_product_profile(pp, field_sources, file=file, page=_dominant_page(field_sources))
    expected = category_expected_fields(detected_categories)
    report = evidence_mod.completeness_report(
        facts,
        expected,
        analyzed_sections=len(structured.get("sections") or []),
        total_sections=len(structured.get("sections") or []),
        failed_chunks=failed_chunks,
        total_chunks=total_chunks,
        skipped_pages=skipped_pages,
        total_pages=total_pages,
    )

    if failed_chunks > 0 or skipped_pages > 0:
        state = PRODUCT_STATE_PARTIAL
    elif expected and report["status"] == "COMPLETE":
        state = PRODUCT_STATE_COMPLETE
    elif expected:
        # Some fields missing → usable partial data.
        state = PRODUCT_STATE_PARTIAL
    else:
        state = PRODUCT_STATE_UNKNOWN

    evidence_block = {
        "schemaVersion": "1.0",
        "facts": [f.to_dict() for f in facts],
        "completeness": report,
        "documentState": state,
    }
    return evidence_block, state


def _dominant_page(field_sources: Dict[str, str]) -> Optional[int]:
    """Best-effort single page for facts when per-chunk page tagging is absent."""
    pages: List[int] = []
    for v in field_sources.values():
        if v and ("p." in v):
            import re
            m = re.search(r"p\.(\d+)", v)
            if m:
                try:
                    pages.append(int(m.group(1)))
                except ValueError:
                    pass
    return min(pages) if pages else None
