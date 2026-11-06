"""
STD-002: Detect clause/section boundaries from structural patterns (numbered headings, titles).
Merge with LLM-structured sections so clause titles + normative body stay detailed for audits.
"""
from __future__ import annotations

import re
from typing import Any, Dict, List, Optional

# Keep merged ISO sections under Express default / reasonable API size (RAG → document-service PATCH).
_MAX_SECTIONS = 2000
_MAX_SECTION_BODY_CHARS = 80_000

# Starts a new section: Annex, Figure, Table, dotted clause (4.1.2), top-level "4 Title" (single digit + title),
# or regulatory clauses like "Article X", "Section Y", "Scope", "Foreword", "Introduction"
_SECTION_START = re.compile(
    r"^\s*("
    r"(?:Annex|Appendix|Schedule)\s+[A-Z0-9][A-Z0-9.\s:_()\-/]*"
    r"|(?:Article|Section|Clause|Chapter|Part)\s+[A-Z0-9][A-Z0-9.\s:_()\-/]*"
    r"|(?:Foreword|Introduction|Scope|Purpose|Definitions?|Normative\s+References?|Informative\s+References?|Conformance|Compliance)\b.*"
    r"|[A-Z]?(?:\d{1,4}(?:\.\d{1,4}){0,6})(?:[.)])?\s+.+"
    r"|[A-Z](?:[.)])\s+.+"
    r")$",
    re.IGNORECASE,
)


def _norm_clause_key(raw: Optional[str]) -> str:
    if not raw:
        return ""
    s = str(raw).strip().replace("（", "(").replace("）", ")")
    s = re.sub(r"\s+", "", s)
    return s.lower()


def _extract_clause_id_from_line(line: str) -> str:
    """Clause id from start of a heading line (same logic as segment split)."""
    line = (line or "").strip()
    if not line:
        return ""
    m = re.match(
        r"^\s*((?:Annex|ANNEX)\s+[A-Z0-9][A-Z0-9.\s]*|(?:Figure|Fig\.|Table)\s+\d+(?:\.\d+)*|\d{1,2}(?:\.\d+)*)\b",
        line,
        re.IGNORECASE,
    )
    return _norm_clause_key(m.group(1)) if m else ""


def _merge_normative_body(a: str, b: str) -> str:
    """Prefer the richer body; concatenate only when both add non-overlapping detail."""
    a = (a or "").strip()
    b = (b or "").strip()
    if not a:
        return b
    if not b:
        return a
    shorter, longer = (a, b) if len(a) <= len(b) else (b, a)
    if len(shorter) > 80 and shorter in longer:
        return longer
    if len(b) > len(a) * 1.18:
        return b
    if len(a) > len(b) * 1.18:
        return a
    if a == b:
        return a
    return f"{a}\n\n---\n{b}".strip()


def _pick_heading(pattern_heading: str, llm_heading: str) -> str:
    p = (pattern_heading or "").strip()
    l = (llm_heading or "").strip()
    if len(l) > 15 and (not p or len(l) >= len(p) - 5):
        return l
    return p if p else l


def _merge_bullets(a: List[Any], b: List[Any]) -> List[str]:
    out: List[str] = []
    for src in (a or [], b or []):
        for x in src:
            s = str(x).strip()
            if s and s not in out:
                out.append(s)
            if len(out) >= 80:
                return out
    return out


def segment_by_numbered_headings(raw_text: str, min_sections: int = 2) -> List[Dict[str, Any]]:
    text = (raw_text or "").strip()
    if len(text) < 200:
        return []

    lines = text.splitlines()
    starts: List[int] = []
    for i, line in enumerate(lines):
        s = line.strip()
        if not s or len(s) > 300:
            continue
        if _SECTION_START.match(s):
            starts.append(i)

    if len(starts) < min_sections:
        return []

    out: List[Dict[str, Any]] = []
    for k, start_idx in enumerate(starts):
        end_idx = starts[k + 1] if k + 1 < len(starts) else len(lines)
        header_line = lines[start_idx].strip()
        body_lines = lines[start_idx + 1 : end_idx]
        body = "\n".join(body_lines).strip()

        clause_number: str | None = None
        heading = header_line
        m = re.match(
            r"^\s*((?:Annex|ANNEX)\s+[A-Z0-9][A-Z0-9.\s]*|(?:Figure|Fig\.|Table)\s+\d+(?:\.\d+)*|\d{1,2}(?:\.\d+)*)\s*(.*)$",
            header_line,
            re.IGNORECASE,
        )
        if m:
            clause_number = m.group(1).strip()
            rest = (m.group(2) or "").strip()
            heading = rest if rest else header_line

        if not body and end_idx > start_idx + 1:
            body = "\n".join(lines[start_idx:end_idx]).strip()

        if len(body) > _MAX_SECTION_BODY_CHARS:
            body = body[:_MAX_SECTION_BODY_CHARS] + "…"

        out.append(
            {
                "clauseNumber": clause_number,
                "heading": heading[:512],
                "content": body,
                "bullets": [],
                "summary": None,
                "importantNotes": None,
            }
        )
        if len(out) >= _MAX_SECTIONS:
            break

    return out


def merge_iso_sections(
    llm_sections: List[Dict[str, Any]] | None,
    pattern_sections: List[Dict[str, Any]] | None,
) -> List[Dict[str, Any]]:
    """
    Combine regex-split PDF text (good boundaries, full local body) with LLM JSON (clean titles, bullets).

    Never discard the LLM entirely when it has sections: pattern rows are enriched per clause id,
    then remaining LLM-only clauses are appended (audit checklist needs both structure and detail).
    """
    llm_raw = llm_sections if isinstance(llm_sections, list) else []
    pat_raw = pattern_sections if isinstance(pattern_sections, list) else []

    llm_norm: List[Dict[str, Any]] = []
    for raw in llm_raw:
        if not isinstance(raw, dict):
            continue
        llm_norm.append(
            {
                "clauseNumber": raw.get("clauseNumber"),
                "heading": (raw.get("heading") or "").strip(),
                "content": (raw.get("content") or "").strip(),
                "bullets": raw.get("bullets") if isinstance(raw.get("bullets"), list) else [],
                "summary": (raw.get("summary") or "").strip() or None,
                "importantNotes": raw.get("importantNotes") if isinstance(raw.get("importantNotes"), list) else None,
            }
        )

    if not pat_raw:
        return llm_norm
    if not llm_norm:
        return pat_raw

    # Collapse chunked LLM duplicates by clause key
    llm_by_key: Dict[str, Dict[str, Any]] = {}
    llm_key_order: List[str] = []
    llm_orphans: List[Dict[str, Any]] = []

    for s in llm_norm:
        k = _norm_clause_key(s.get("clauseNumber")) or _extract_clause_id_from_line(s.get("heading") or "")
        if not k:
            llm_orphans.append(s)
            continue
        if k not in llm_by_key:
            llm_by_key[k] = {**s, "bullets": list(s.get("bullets") or [])}
            llm_key_order.append(k)
        else:
            cur = llm_by_key[k]
            cur["content"] = _merge_normative_body(cur.get("content") or "", s.get("content") or "")
            h0, h1 = (cur.get("heading") or "").strip(), (s.get("heading") or "").strip()
            cur["heading"] = h1 if len(h1) > len(h0) else h0
            cur["bullets"] = _merge_bullets(cur.get("bullets"), s.get("bullets"))

    used_llm: set[str] = set()
    merged: List[Dict[str, Any]] = []

    for p in pat_raw:
        if not isinstance(p, dict):
            continue
        pk = _norm_clause_key(p.get("clauseNumber")) or _extract_clause_id_from_line(p.get("heading") or "")
        L = llm_by_key.get(pk) if pk else None
        if L:
            used_llm.add(pk)
            merged.append(
                {
                    "clauseNumber": p.get("clauseNumber") or L.get("clauseNumber"),
                    "heading": _pick_heading((p.get("heading") or "").strip(), (L.get("heading") or "").strip())[:512],
                    "content": _merge_normative_body((p.get("content") or "").strip(), (L.get("content") or "").strip()),
                    "bullets": _merge_bullets(p.get("bullets") if isinstance(p.get("bullets"), list) else [], L.get("bullets")),
                    "summary": L.get("summary"),
                    "importantNotes": L.get("importantNotes"),
                }
            )
        else:
            merged.append(
                {
                    "clauseNumber": p.get("clauseNumber"),
                    "heading": str(p.get("heading") or "")[:512],
                    "content": str(p.get("content") or ""),
                    "bullets": p.get("bullets") if isinstance(p.get("bullets"), list) else [],
                    "summary": p.get("summary"),
                    "importantNotes": p.get("importantNotes"),
                }
            )
        if len(merged) >= _MAX_SECTIONS:
            break

    # LLM clauses not aligned to a pattern boundary (still valuable for audit)
    for k in llm_key_order:
        if k in used_llm:
            continue
        merged.append(llm_by_key[k])
        if len(merged) >= _MAX_SECTIONS:
            break

    for o in llm_orphans:
        if len(merged) >= _MAX_SECTIONS:
            break
        merged.append(o)

    return merged if merged else llm_norm
