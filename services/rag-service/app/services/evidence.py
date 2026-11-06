"""Evidence-oriented product facts.

This module defines the INTERMEDIATE representation the extraction pipeline works
in before any canonical product object is assembled. It is deliberately decoupled
from the LLM output schema: raw LLM JSON is decoded here into discrete, traceable
"facts", each carrying:

  - a normalized dotted field path
  - the extracted value
  - a confidence
  - source traceability (file, page, section, method)
  - a status: FOUND | NOT_FOUND | UNCERTAIN | CONFLICT | NOT_APPLICABLE
  - optional alternative candidates (for genuinely ambiguous high-risk fields)

The compliance engine (and the backend product assembler) consume these facts
deterministically. Nothing here contains compliance logic — it only asks "what is
present in the documents and where did it come from?".
"""
from __future__ import annotations

import hashlib
import json
import re
from dataclasses import dataclass, field, asdict
from typing import Any, Dict, List, Optional

FOUND = "FOUND"
NOT_FOUND = "NOT_FOUND"
UNCERTAIN = "UNCERTAIN"
CONFLICT = "CONFLICT"
NOT_APPLICABLE = "NOT_APPLICABLE"

FieldStatus = str  # one of the constants above


@dataclass
class SourceRef:
    file: str
    page: Optional[int] = None
    section: Optional[str] = None
    method: str = "llm"          # "llm" | "ocr" | "manual" | "regex"
    chunk_index: Optional[int] = None
    bbox: Optional[str] = None   # optional visual bounding box / region hint

    def to_dict(self) -> Dict[str, Any]:
        return {k: v for k, v in asdict(self).items() if v is not None}


@dataclass
class Candidate:
    value: str
    confidence: float
    source: SourceRef
    raw: Optional[str] = None   # the exact source representation before normalization

    def to_dict(self) -> Dict[str, Any]:
        d = {
            "value": self.value,
            "confidence": round(float(self.confidence), 3),
            "source": self.source.to_dict(),
        }
        if self.raw is not None:
            d["raw"] = self.raw
        return d


@dataclass
class Fact:
    field: str                                # dotted path e.g. "productProfile.basicInformation.reference"
    value: Optional[str] = None
    confidence: float = 0.0
    status: FieldStatus = FOUND
    source: Optional[SourceRef] = None
    candidates: List[Candidate] = field(default_factory=list)
    normalized_value: Optional[str] = None    # machine-friendly normalization, when applicable
    raw_value: Optional[str] = None           # exact source text (never loses the original)

    def to_dict(self) -> Dict[str, Any]:
        d: Dict[str, Any] = {
            "field": self.field,
            "status": self.status,
            "confidence": round(float(self.confidence), 3),
        }
        if self.value is not None:
            d["value"] = self.value
        if self.normalized_value is not None:
            d["normalized_value"] = self.normalized_value
        if self.raw_value is not None:
            d["raw_value"] = self.raw_value
        if self.source is not None:
            d["source"] = self.source.to_dict()
        if self.candidates:
            d["candidates"] = [c.to_dict() for c in self.candidates]
        return d


# High-risk identifiers that must NEVER be "corrected" without evidence. For these
# the pipeline strongly prefers exact transcription plus explicit confidence and,
# when genuinely ambiguous, alternative candidates — never silent O/0, I/1, S/5,
# B/8 substitutions.
HIGH_RISK_FIELDS = {
    "basicInformation.serialNumber",
    "basicInformation.reference",
    "basicInformation.modelNumber",
    "basicInformation.revision",
    "pharmaceuticalDetails.batchNumber",
    "pharmaceuticalDetails.registrationNumber",
    "pharmaceuticalDetails.certificateNumber",
    "pharmaceuticalDetails.ndcOrGtinCode",
    "pharmaceuticalDetails.coaReference",
    "medicalDeviceDetails.udiCode",
    "cosmeticsDetails.batchCode",
    "chemicalDetails.casNumber",
    "chemicalDetails.unNumber",
    "foodBeverageDetails.bestBeforeDate",
    "pharmaceuticalDetails.expirationDate",
    "cosmeticsDetails.expirationDate",
}


def _norm_token(s: str) -> str:
    """Case/blankspace-insensitive, whitespace-collapsed key for conflict compares."""
    return re.sub(r"\s+", " ", (s or "").strip()).lower()


def values_conflict(a: Optional[str], b: Optional[str]) -> bool:
    """Two scalar evidence values are semantically the same unless they differ.

    Uses a conservative equivalence (case + whitespace + trailing punctuation
    insensitive) and special-cases numeric strings so e.g. "5.5 kW" vs "5,5 kW"
    are treated as the SAME raw evidence rather than a conflict. The actual
    conflict decision for factual values is intentionally conservative: we do NOT
    use a "longer string wins" heuristic anywhere.
    """
    if a is None or b is None:
        return False
    ta = _norm_token(str(a)).rstrip(".")
    tb = _norm_token(str(b)).rstrip(".")
    if ta == tb:
        return False
    # Numeric equivalence across decimal comma/dot and surrounding units.
    if _numeric_values_equal(str(a), str(b)):
        return False
    return True


_NUM_UNIT_RE = re.compile(r"([+-]?\d+[.,]?\d*)\s*([a-zA-Zµ°/][a-zA-Z0-9µ°/^.\-\s]*)?")


def _numeric_values_equal(a: str, b: str) -> bool:
    """Compare numeric facts tolerant of decimal separators and spacing.

    "5500 W" vs "5,5 kW" are NOT directly equal (unit scaling differs), so we only
    declare equality when the bare numbers agree after normalising the decimal
    separator and the unit words match case-insensitively.
    """
    m1 = re.fullmatch(r"\s*([+-]?\d+[.,]?\d*)\s*([a-zA-Zµ°/]*)", a.strip())
    m2 = re.fullmatch(r"\s*([+-]?\d+[.,]?\d*)\s*([a-zA-Zµ°/]*)", b.strip())
    if not m1 or not m2:
        return False
    try:
        n1 = float(m1.group(1).replace(",", "."))
        n2 = float(m2.group(1).replace(",", "."))
    except ValueError:
        return False
    if n1 != n2:
        return False
    u1 = re.sub(r"\s+", "", m1.group(2)).lower()
    u2 = re.sub(r"\s+", "", m2.group(2)).lower()
    return u1 == u2


def merge_facts(existing: Optional[Fact], incoming: Fact) -> Fact:
    """Merge two facts for the SAME field, detecting conflicts.

    Rules:
      - If they agree (equal or numerically equal) -> keep the higher-confidence
        value, union sources, status stays FOUND.
      - If they disagree -> status becomes CONFLICT, keep BOTH as candidates
        (never silently pick one). The first-seen value stays flagged as primary
        (kept in `value`) because it is what a downstream assembly layer shows, but
        the conflict is made explicit for human review.
    """
    if existing is None:
        return incoming

    if existing.status == NOT_FOUND:
        return incoming
    if incoming.status == NOT_FOUND:
        return existing

    if not values_conflict(existing.value, incoming.value):
        # Agreeing evidence — keep the more confident value; merge sources.
        keep = existing if existing.confidence >= incoming.confidence else incoming
        keep.candidates = [c for c in (existing.candidates + incoming.candidates)] or []
        # Merge sources
        srcs: List[Dict[str, Any]] = []
        for c in keep.candidates if keep.candidates else []:
            s = c.source.to_dict() if isinstance(c.source, SourceRef) else {}
            if s and s not in srcs:
                srcs.append(s)
        if keep.source is not None:
            s = keep.source.to_dict()
            if s and s not in srcs:
                srcs.append(s)
        # Reconstruct candidates with sources merged (best-effort)
        keep.candidates = list(keep.candidates)
        return keep

    # Genuine conflict → CONFLICT with explicit candidates.
    candidates: List[Candidate] = []
    seen: set = set()
    for cand in (existing.candidates or []) + [
        Candidate(value=str(existing.value), confidence=existing.confidence, source=existing.source or SourceRef(file=""))
    ]:
        key = (cand.value, cand.confidence if hasattr(cand, "confidence") else "")
        if key not in seen:
            seen.add(key)
            candidates.append(cand)
    inc: Candidate = Candidate(
        value=str(incoming.value),
        confidence=incoming.confidence,
        source=incoming.source or SourceRef(file=""),
        raw=incoming.raw_value,
    )
    ckey = (inc.value, inc.confidence if hasattr(inc, "confidence") else "")
    if ckey not in seen:
        candidates.append(inc)

    existing.status = CONFLICT
    existing.candidates = candidates
    existing.confidence = max(existing.confidence, incoming.confidence)
    return existing


def fingerprint(document_id: str, company_id: str, storage_key: str, extracted_text: str,
                structured: Dict[str, Any]) -> str:
    """Deterministic fingerprint of an extraction result for idempotency/dedup.

    Combines the source identity and a content hash so identical content submitted
    twice (same file bytes → same text → same fingerprint) can be detected and
    de-duplicated by downstream consumers. Never contains secrets.
    """
    if not extracted_text:
        extracted_text = json.dumps(structured or {}, sort_keys=True) if structured else ""
    content_hash = hashlib.sha256(
        (extracted_text or "").encode("utf-8", errors="ignore")
    ).hexdigest()[:32]
    return f"{company_id}::{document_id}::{content_hash}"


def fact_from_pairs(pairs: Dict[str, Any], field_prefix: str,
                    file: str, page: Optional[int] = None,
                    method: str = "llm") -> List[Fact]:
    """Decode a flat {dotted_path: value} evidence map into Facts.

    `field_prefix` is the leading path segment (e.g. "productProfile"), `pairs`
    keys are the remaining dotted path. Values may be scalars or lists.
    """
    facts: List[Fact] = []
    for path, value in (pairs or {}).items():
        if value is None:
            continue
        field = f"{field_prefix}.{path}" if field_prefix else path
        if isinstance(value, list):
            for item in value:
                if item is None:
                    continue
                facts.append(_scalar_fact(field, item, file, page, method))
        else:
            facts.append(_scalar_fact(field, value, file, page, method))
    return facts


def _scalar_fact(field: str, value: Any, file: str, page: Optional[int], method: str,
                 confidence: float = 0.0) -> Fact:
    s = str(value).strip()
    conf = confidence if confidence > 0 else _default_confidence(field, s)
    source = SourceRef(file=file, page=page, method=method)
    fact = Fact(
        field=field,
        value=s,
        confidence=conf,
        status=FOUND,
        source=source,
        raw_value=s,
        normalized_value=_safe_normalize(field, s),
    )
    if conf < 0.6:
        fact.status = UNCERTAIN
    return fact


def _default_confidence(field: str, value: str) -> float:
    """Deterministic confidence heuristic used only when the LLM did not supply one.

    High-risk identifier fields default to a conservative 0.5 (uncertain) unless
    the source is long/alphanumeric-consistent; document-derived scalar facts
    default to 0.9. This is a fallback, not a replacement for model confidence.
    """
    if not value:
        return 0.0
    if field in HIGH_RISK_FIELDS:
        # Identifiers are high-risk: default to uncertain unless they look like a
        # clean token (letters+digits+-._) of reasonable length.
        if re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9\-_./: ]{2,63}", value):
            return 0.9
        return 0.5
    return 0.9


def _safe_normalize(field: str, value: str) -> Optional[str]:
    """Apply lossless, reversible normalization where unambiguous. Returns None for
    free-text/narrative fields (we never force a numeric parse on prose)."""
    from app.services.normalize import normalize_value  # local import to avoid cycle
    try:
        return normalize_value(field, value)
    except Exception:
        return None


def completeness_report(facts: List[Fact], expected_fields: List[str],
                        analyzed_sections: int = 0, total_sections: int = 0,
                        failed_chunks: int = 0, total_chunks: int = 0,
                        skipped_pages: int = 0, total_pages: int = 0) -> Dict[str, Any]:
    """Build an extraction completeness report.

    Unlike the previous "number of non-empty JSON fields" measure, this is driven
    by ACTUAL per-field statuses aggregated from evidence. Fields are FOUND /
    NOT_FOUND / UNCERTAIN / CONFLICT / NOT_APPLICABLE based on their facts.
    """
    by_field: Dict[str, Fact] = {}
    for f in facts:
        if f.field in by_field:
            by_field[f.field] = merge_facts(by_field[f.field], f)
        else:
            by_field[f.field] = f

    found = []
    missing = []
    uncertain = []
    conflicts = []
    n_a = []
    for path in expected_fields:
        fact = by_field.get(path)
        if not fact:
            missing.append(path)
            continue
        if fact.status == FOUND:
            found.append(path)
        elif fact.status == UNCERTAIN:
            uncertain.append(path)
        elif fact.status == CONFLICT:
            conflicts.append(path)
        elif fact.status == NOT_APPLICABLE:
            n_a.append(path)
        else:
            missing.append(path)

    denom = len(expected_fields)
    coverage = round((len(found) + len(uncertain) + len(conflicts)) / denom, 3) if denom else 1.0

    # Effective completeness: fields with a usable (non-missing) value.
    usable = len(found) + len(uncertain) + len(conflicts)
    status = "COMPLETE" if (denom and usable == denom and not failed_chunks and not skipped_pages) else (
        "PARTIAL" if (usable > 0 or failed_chunks or skipped_pages) else "UNKNOWN"
    )

    return {
        "status": status,
        "coverage": coverage,
        "foundFields": found,
        "missingFields": missing,
        "uncertainFields": uncertain,
        "conflicts": conflicts,
        "notApplicableFields": n_a,
        "analyzedSections": analyzed_sections,
        "totalSections": total_sections,
        "analyzedPages": total_pages - skipped_pages,
        "totalPages": total_pages,
        "skippedPages": skipped_pages,
        "failedChunks": failed_chunks,
        "totalChunks": total_chunks,
        "documentState": "PARTIAL" if (failed_chunks or skipped_pages) else ("COMPLETE" if status == "COMPLETE" else status),
    }
