import asyncio
import json
import logging
import math
import re
import time
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

import httpx
from langchain_openai import ChatOpenAI
from langchain.prompts import ChatPromptTemplate

from app.config import get_settings
from app.models.schemas import ClauseResult, EvaluateResponse, EvidenceExcerpt
from app.services.event_bus import get_event_bus
from app.services.ingestion import IngestionService
from app.services.compliance_rules import ProductSnapshot, build_product_snapshot
from app.services.compliance_comparator import compare_requirement, comparison_context, reconcile_llm_judgment, rank_product_facts
from app.services.compliance_guard import clause_reference_quality, requirement_scope
from app.services.compliance_result_explainer import build_clause_presentation
from app.services.rate_limit import retry_with_backoff, run_compliance_limited

logger = logging.getLogger(__name__)
settings = get_settings()


UUID_PATTERN = re.compile(
    r"\[?[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\]?,?\s*[:;]?\s*\d*\s*",
    re.IGNORECASE,
)
PATH_ENCODED = re.compile(r"/[a-z0-9]{2,4}(?:/[a-z0-9]{2,4})+\s*", re.IGNORECASE)


def _clean_excerpt(text: str) -> str:
    """Remove UUIDs, path-encoded noise, and page-number markers from raw chunk text."""
    s = (text or "").strip()
    s = UUID_PATTERN.sub("", s).strip()
    s = PATH_ENCODED.sub("", s).strip()
    s = re.sub(r"^\d{1,2}/\d{1,2}\s*$", "", s).strip()
    s = re.sub(r"^\d+$", "", s).strip()
    s = re.sub(r"\n{2,}", "\n", s)
    return s.strip()


def _dedupe_repeat(value: str) -> str:
    """Collapse repeated token sequences such as ``ANNEX VIII ANNEX VIII``.

    This is a module-level helper because both the global extraction/mapping
    functions and ``EvaluationEngine`` use it. Keeping it outside the class
    prevents a NameError when clause-reference recovery runs before an engine
    instance method is available.
    """
    v = " ".join((value or "").split())
    if not v:
        return ""
    words = v.split(" ")
    n = len(words)
    # Find the smallest repeating unit that tiles the full sequence.
    for size in range(1, n // 2 + 1):
        if n % size:
            continue
        unit = [w.casefold() for w in words[:size]]
        if all(
            [w.casefold() for w in words[i : i + size]] == unit
            for i in range(0, n, size)
        ):
            return " ".join(words[:size])
    return v

# Verdict used when a clause could not be assessed at all (retrieval down, LLM 401,
# timeout…). It is NOT a compliance finding: it never becomes an NC draft and is
# excluded from the conformity score.
VERDICT_INCONCLUSIVE = "INCONCLUSIVE"


class EvidenceRetrievalError(RuntimeError):
    """Evidence search failed; this is not evidence that a client lacks records."""

# NOTE: there is intentionally no built-in clause list here. Clauses always come
# from the standard selected in the Standards & Regulations Portal (see
# EvaluationEngine._derive_clauses). A hardcoded ISO 9001 list previously acted as
# a silent fallback, which meant every standard was audited as if it were ISO 9001.

PROMPT = ChatPromptTemplate.from_template(
    """You are a lead auditor performing a rigorous clause-by-clause conformity assessment.
Assess ONLY against the requirement text supplied below, do not import requirements
from any other standard you happen to know.

STANDARD CLAUSE: {clause_reference}

REQUIREMENT TEXT (excerpt):
{standard_excerpt}

EVIDENCE (structured product facts with provenance plus retrieved evidence documents):
{evidence_chunks}

TASK: produce a conformity matrix for this clause:
1. SPLIT the clause into each SEPARATE normative requirement (every distinct "SHALL"
   / "DOIT" statement). One clause often states several: emit ONE row per requirement.
   Lettered or numbered sub-items become their own rows ("7.2.3 (a)", "7.2.3 (b)").
2. For each requirement, decide whether it APPLIES to this product at all.
3. Judge each applicable requirement against the evidence and justify it.

RESPOND ONLY WITH VALID JSON:
{{
  "clause_title": "Short title from the standard text. NEVER write 'Clause X.X'",
  "reasoning": "Audit trail: how you split the clause and weighed the evidence",
  "requirements": [
    {{
      "reference": "{clause_reference}",
      "summary": "The requirement restated as one normative sentence",
      "applicable_if": "IF: <condition>  (empty when unconditional)",
      "conditional_clauses": "clauses whose conditions gate this one, else empty",
      "references": "cross-references cited, e.g. '7.2.10' or 'IEC 60364-5-52:2009, 524', else empty",
      "status": "PASS|FAIL|N/A|MISSING_INFO",
      "justification": "<STATUS>: 2-4 specific sentences explaining the criterion, what cited evidence shows, and why that supports the result",
      "missing_information": ["Specific missing or conflicting fact/document required to decide; empty when none"],
      "recommended_action": "One concrete next step grounded in the requirement and supplied evidence",
      "confidence": 0.0-1.0,
      "evidence_refs": [1, 3],
      "requirement_elements": [
        {"element": "property/condition/threshold/action", "status": "covered|partial|contradicted|missing", "evidence_refs": [1], "notes": "..."}
      ],
      "evidence_assessment": [
        {"evidence_ref": 1, "relevance": "high|medium|low", "supports": true, "contradicts": false, "notes": "..."}
      ]
    }}
  ]
}}

STATUS: choose exactly one per requirement:
- "PASS": the evidence positively demonstrates conformity.
- "FAIL": the evidence shows the requirement is NOT met, or contradicts it.
- "N/A": the requirement does not apply to this product (condition not met, feature
  absent), OR the clause is a heading with no normative content.
- "MISSING_INFO": the requirement applies but the file does not contain enough
  information to decide, or the information is contradictory. Do NOT guess PASS or
  FAIL when the evidence is simply absent.

RULES:
- A heading-only clause yields exactly one row: status "N/A", justification
  "N/A: heading clause, not normative" (in the language of the standard).
- "reference": repeat the clause number; append the sub-item marker when the
  requirement comes from a lettered item, e.g. "{clause_reference} (a)".
- "justification" MUST start with the status followed by ": ", and MUST cite the
  evidence exactly as given in its source="…" field, copying the page when present,
  e.g. 'PASS: the wiring diagram (Manuel_FA1002.pdf, p. 26) shows …'. Never cite a
  chunk by its index ("Evidence Chunk 1") and never cite a UUID.
- "clause_title" is the clause's SUBJECT taken from the standard text (e.g.
  "Overcurrent protection"), never a repeat of the number ("Article 6").
- Write summary and justification in the SAME LANGUAGE as the requirement text above.
- Never invent evidence. Absent evidence is "MISSING_INFO", never "PASS".
- Write a clause-specific explanation, not a generic sentence. State which requirement element is being assessed, cite the selected source and page where available, and explain what that evidence demonstrates or fails to demonstrate.
- For MISSING_INFO, populate "missing_information" with the exact field, record, test, procedure or document needed. Avoid vague phrases such as "more information required" when the requirement identifies a specific evidence type. Use an empty list when the status is not MISSING_INFO.
- Populate "recommended_action" with one practical, requirement-specific next step. Do not invent deadlines, laws, documents, test results or obligations absent from the supplied clause/evidence. If no reliable specific action can be derived, recommend qualified manual review.
- A product profile/declaration that merely names a standard is not proof that every technical requirement is satisfied.
- When evidence conflicts, choose "MISSING_INFO" unless one authoritative source clearly resolves the conflict.
- evidence_refs: 1-based indices into the evidence chunks provided.
- Emit at least one requirement row. """
)


STATUS_PASS = "PASS"
STATUS_FAIL = "FAIL"
STATUS_NA = "N/A"
STATUS_MISSING_INFO = "MISSING_INFO"

# Statuses that carry no conformity judgement and are therefore excluded from the
# score: N/A means the requirement does not apply, INCONCLUSIVE means the engine
# itself failed. MISSING_INFO *is* scored: an undemonstrated requirement is not a
# conforming one.
_UNSCORED_STATUSES = {STATUS_NA, VERDICT_INCONCLUSIVE}


def _normalise_status(raw: str) -> str:
    """Map free-form model output onto the four worksheet statuses."""
    u = (raw or "").strip().upper().replace("-", "_").replace(" ", "_")
    if u in {"PASS", "PASSED", "CONFORM", "CONFORME", "SATISFIED"}:
        return STATUS_PASS
    if u in {"FAIL", "FAILED", "NON_CONFORME", "NOT_SATISFIED"}:
        return STATUS_FAIL
    if u in {"N/A", "NA", "N_A", "NOT_APPLICABLE", "NON_APPLICABLE"}:
        return STATUS_NA
    if u in {"MISSING_INFO", "MISSING", "INFO_MANQUANTE", "UNKNOWN", "PARTIALLY_SATISFIED"}:
        return STATUS_MISSING_INFO
    return STATUS_MISSING_INFO


def _status_to_verdict(status: str) -> str:
    """Legacy verdict kept so existing consumers (NC drafts, UI) keep working."""
    if status == STATUS_PASS:
        return "SATISFIED"
    if status == STATUS_FAIL:
        return "NOT_SATISFIED"
    if status == STATUS_MISSING_INFO:
        return "PARTIALLY_SATISFIED"
    return VERDICT_INCONCLUSIVE  # N/A: carries no conformity judgement


def _verdict_weight(v: str) -> float:
    u = (v or "").upper()
    if u == "SATISFIED":
        return 1.0
    if u == "PARTIALLY_SATISFIED":
        return 0.5
    return 0.0


def _status_weight(status: str) -> float:
    """PASS counts fully; FAIL and MISSING_INFO count as zero (undemonstrated)."""
    return 1.0 if status == STATUS_PASS else 0.0


def _resolve_clause_weight(ref: str, clause_weights: Optional[dict[str, Any]]) -> float:
    """EVAL-004: exact id, `4.*`, section `4`, or `group:4.1`, most specific match wins."""
    if not clause_weights:
        return 1.0
    if ref in clause_weights:
        try:
            direct = float(clause_weights[ref])
            return direct if math.isfinite(direct) and direct > 0 else 1.0
        except (TypeError, ValueError):
            return 1.0
    best_spec = -1
    best_w = 1.0
    for k, v in clause_weights.items():
        if not isinstance(k, str):
            continue
        try:
            w = float(v)
        except (TypeError, ValueError):
            continue
        if not math.isfinite(w) or w <= 0:
            continue
        spec = -1
        if k.endswith(".*"):
            p = k[:-2]
            if ref == p or ref.startswith(p + "."):
                spec = len(p)
        elif k.startswith("group:"):
            g = k[6:]
            if ref == g or ref.startswith(g + "."):
                spec = 1000 + len(g)
        elif "." not in k:
            if ref == k or ref.startswith(k + "."):
                spec = len(k)
        if spec > best_spec:
            best_spec = spec
            best_w = w
    return best_w if best_spec >= 0 else 1.0


def _weighted_overall(
    results: List[ClauseResult],
    clause_weights: Optional[dict[str, Any]],
) -> Optional[float]:
    """Withhold the score when any applicable result is unresolved.

    A score is not evidence of full compliance. It becomes meaningful only after
    every in-scope row has a PASS/FAIL decision; an empty scope has no score.
    """
    if any((r.status or "") not in {STATUS_PASS, STATUS_FAIL, STATUS_NA} for r in results):
        return None
    scored = [r for r in results if (r.status or "") in {STATUS_PASS, STATUS_FAIL}]
    if not scored:
        return None
    if clause_weights:
        grouped: dict[str, list[ClauseResult]] = {}
        for r in scored:
            base = re.sub(r"\s*\([^)]*\)\s*$", "", r.clause_reference or "")
            grouped.setdefault(base, []).append(r)
        tw = 0.0
        acc = 0.0
        for ref, group in grouped.items():
            w = _resolve_clause_weight(ref, clause_weights)
            clause_score = sum(_status_weight(r.status) for r in group) / len(group)
            tw += w
            acc += w * clause_score
        return round(100.0 * acc / tw, 2) if tw > 0 else None
    n = len(scored)
    acc = sum(_status_weight(r.status) for r in scored)
    return round(100.0 * acc / n, 2) if n else None


def _parse_json_array_lenient(text: str) -> list:
    """Parse a JSON array, salvaging the complete items when it was truncated.

    A cut-off response is still useful: the clauses that did arrive are valid,
    so trim back to the last complete object and close the array.
    """
    s = (text or "").strip()
    if not s:
        return []
    try:
        out = json.loads(s)
        return out if isinstance(out, list) else []
    except json.JSONDecodeError:
        pass
    end = s.rfind("}")
    if end == -1:
        return []
    try:
        out = json.loads(s[: end + 1] + "]")
        return out if isinstance(out, list) else []
    except json.JSONDecodeError:
        return []


def _parse_llm_json(content: str) -> dict[str, Any]:
    """Parse an LLM chat completion into a dict, never None/list/str.

    Hardened against two real-world failure modes seen with reasoning models
    (e.g. Qwen3) served through OpenAI-compatible gateways (Groq, OpenRouter):
      - the model prepends a <think>...</think> trace before the JSON, which
        used to make json.loads() either fail outright or, worse, succeed on
        something that isn't the object we expect;
      - the model gives up and emits the bare token `null`, which json.loads
        happily parses to Python None -- callers used to do `data.get(...)`
        on that and crash with AttributeError: 'NoneType' has no attribute 'get'.
    """
    text = (content or "").strip()
    text = re.sub(r"<think>.*?</think>", "", text, flags=re.DOTALL).strip()
    if text.startswith("```"):
        text = re.sub(r"^```[a-zA-Z0-9]*\s*\n?", "", text)
        text = re.sub(r"\n?```\s*$", "", text).strip()
    if not text:
        return {}
    try:
        parsed = json.loads(text)
    except json.JSONDecodeError:
        return {}
    return parsed if isinstance(parsed, dict) else {}


_VALID_STATUSES = {STATUS_PASS, STATUS_FAIL, STATUS_NA, STATUS_MISSING_INFO}


def _validate_llm_response(data: dict[str, Any]) -> tuple[bool, str]:
    """Validate the conformity-matrix response: a clause title plus requirement rows."""
    if not isinstance(data, dict):
        return False, f"top-level response was {type(data).__name__}, not an object"
    if "clause_title" not in data:
        return False, "Missing required field: clause_title"

    requirements = data.get("requirements")
    if not isinstance(requirements, list):
        return False, "requirements must be a list"
    if not requirements:
        return False, "requirements must contain at least one row"

    for i, item in enumerate(requirements):
        if not isinstance(item, dict):
            return False, f"requirements[{i}] must be an object"
        for field in ("summary", "status", "justification"):
            if field not in item:
                return False, f"requirements[{i}] missing field: {field}"
        if _normalise_status(str(item.get("status"))) not in _VALID_STATUSES:
            return False, f"requirements[{i}] invalid status: {item.get('status')}"
        conf = item.get("confidence")
        if conf is not None and (
            not isinstance(conf, (int, float)) or not (0.0 <= float(conf) <= 1.0)
        ):
            return False, f"requirements[{i}] invalid confidence: {conf}"

    evidence_assessment = data.get("evidence_assessment")
    if evidence_assessment is not None and not isinstance(evidence_assessment, list):
        return False, "evidence_assessment must be a list"

    return True, "OK"


CLAUSE_CONCURRENCY = 4
DEFAULT_SEARCH_TIMEOUT_SEC = 8.0
DEFAULT_SEARCH_CONCURRENCY = 6
DEFAULT_MAX_EVIDENCE_CHUNKS = 16
JUDGE_BATCH_SIZE = 6
MAX_CLAUSE_TIMEOUT_SEC = 1800.0


def _estimated_judge_batch_count(requirements: Any, max_items: int = JUDGE_BATCH_SIZE, max_chars: int = 10_000) -> int:
    """Estimate dynamic batches by both item count and full requirement size.

    Each requirement is kept verbatim in the prompt. Long requirements therefore
    create smaller batches rather than being truncated to fit an arbitrary global
    character slice.
    """
    if isinstance(requirements, int):
        count = max(0, requirements)
        return max(1, (count + max_items - 1) // max_items)
    if not isinstance(requirements, (list, tuple)):
        return 1
    batches = 0
    count = 0
    chars = 0
    for req in requirements:
        req = req if isinstance(req, dict) else {}
        text = re.sub(r"\s+", " ", str(req.get("text") or "").strip())
        cross_refs = req.get("crossReferences")
        refs = ", ".join(str(x).strip() for x in cross_refs if str(x).strip()) if isinstance(cross_refs, list) else str(cross_refs or "")
        # Requirement text plus a compact (~600-char) comparison context and labels.
        cost = len(text) + min(600, len(text) + 220) + min(len(refs), 240) + 260
        if count and (count >= max_items or chars + cost > max_chars):
            batches += 1
            count = 0
            chars = 0
        count += 1
        chars += cost
    if count or not batches:
        batches += 1
    return max(1, batches)


def _clause_timeout_for_requirement_count(requirement_count: Any, base_timeout: Optional[float] = None) -> float:
    """Give a clause enough wall-clock budget for every sequential judge batch.

    The former budget stayed at 8 minutes for as many as six batches. In practice,
    each batch can include a provider timeout, retry/backoff, a fallback model call,
    and one JSON-repair call. The outer timeout could therefore cancel an otherwise
    healthy long clause before its final batches were attempted. Budget up to four
    minutes per batch, retain the configured floor for short clauses, and cap the
    total at 30 minutes. Normal calls finish much sooner; this is a safety ceiling,
    not a deliberate delay.

    `requirement_count` accepts a count or requirement records for size-aware sizing.
    """
    try:
        configured = float(base_timeout if base_timeout is not None else getattr(settings, "CLAUSE_TIMEOUT_SEC", 480.0))
    except (TypeError, ValueError):
        configured = 480.0
    base = max(120.0, configured)
    batches = _estimated_judge_batch_count(requirement_count)
    per_batch_budget = 240.0
    return min(MAX_CLAUSE_TIMEOUT_SEC, max(base, batches * per_batch_budget))


@dataclass
class ClauseRecord:
    """One clause exactly as the Standards Portal extracted and displays it.

    This is the bridge the compliance engine was missing: standard_pipeline.py /
    structure_openai.py already split each clause into verbatim, pre-classified
    requirement rows (deterministic modal-verb extraction, LLM-annotated only for
    genuinely ambiguous wording). Evaluating straight from this record means a
    clause splits into the same requirement rows whether you're looking at the
    Standards Portal or an evaluation report, and the judgment LLM below never
    has to re-discover what a requirement says — only whether the evidence
    satisfies it.
    """
    ref: str
    title: str
    text: str
    section_type: str
    requirements: List[Dict[str, Any]] = field(default_factory=list)
    standard_quality_flags: Dict[str, Any] = field(default_factory=dict)


def _normalize_clause_reference(value: Any) -> str:
    """Normalize the presentation of a clause reference for safe equality checks."""
    text = re.sub(r"\s+", " ", str(value or "").strip())
    text = re.sub(r"^(?:Clause|Section)\s+(?=\d)", "", text, flags=re.IGNORECASE)
    return text.rstrip(" .:-—–").casefold()


def _is_clause_descendant_reference(parent: Any, child: Any) -> bool:
    parent_ref = _normalize_clause_reference(parent)
    child_ref = _normalize_clause_reference(child)
    if not parent_ref or not child_ref or parent_ref.startswith("part "):
        return False
    return child_ref.startswith(parent_ref + ".")


def _leading_clause_reference(value: Any) -> Optional[str]:
    """Return a clause reference only when it appears at the start of a requirement.

    Unlike a search anywhere in a paragraph, an anchored match avoids mistaking a
    cross-reference or a measurement (for example, ``1.5 mm``) for the requirement's
    own clause. Multi-level numeric references are accepted with lowercase OCR titles;
    two-level references require a title-like capitalized word after the number.
    """
    text = re.sub(r"^\s*(?:[-•*]\s+|\([a-z0-9]+\)\s+)?", "", str(value or ""))
    match = re.match(
        r"^(?:(?:Clause|Section)\s+)?(?P<ref>(?:\d{1,2}(?:\.\d{1,3}){1,3}|[A-Z]\.\d{1,3}(?:\.\d{1,3}){0,2}|Annex\s+[A-Z0-9]{1,6}(?:\.\d{1,3}){0,3}))\b",
        text,
        re.IGNORECASE,
    )
    if not match:
        return None
    ref = match.group("ref").strip()
    rest = text[match.end():]
    numeric_parts = re.findall(r"\d+", ref)
    is_deep_numeric = "." in ref and len(numeric_parts) >= 3
    if not re.match(r"^\s+[A-ZÀ-Þ]", rest, re.UNICODE) and not (is_deep_numeric and re.match(r"^\s+[a-zà-ÿ]", rest, re.UNICODE)):
        return None
    if ref.lower().startswith("annex"):
        return re.sub(r"^annex\s+", "Annex ", ref, flags=re.IGNORECASE)
    # Explicit labels are stripped to match the numeric references used by sections.
    return re.sub(r"^(?:Clause|Section)\s+(?=\d)", "", ref, flags=re.IGNORECASE)


def _is_generic_clause_title(value: Any) -> bool:
    text = re.sub(r"\s+", " ", str(value or "").strip())
    return (not text
            or bool(re.fullmatch(r"(?:Clause\s+)?(?:Part\s+\d+|\d+(?:\.\d+){0,3})", text, re.I))
            or bool(re.fullmatch(r"Clause\s+Part\s+\d+", text, re.I)))


def _is_weak_clause_reference(value: Any) -> bool:
    text = re.sub(r"\s+", " ", str(value or "").strip())
    return (not text or _is_generic_part_reference(text)
            or bool(re.fullmatch(r"Clause\s+(?:Part\s+)?\d{1,2}", text, re.I)))


def _title_from_leading_requirement(value: Any, ref: str) -> str:
    text = str(value or "").strip()
    leading = _leading_clause_reference(text)
    if not leading or _normalize_clause_reference(leading) != _normalize_clause_reference(ref):
        return ""
    # Remove the clause token, then use the heading-like phrase before the first
    # obligation verb or sentence break. This is a display fallback, not a legal summary.
    match = re.match(r"^\s*(?:(?:Clause|Section)\s+)?(?:\d{1,2}(?:\.\d{1,3}){1,3}|[A-Z]\.\d{1,3}(?:\.\d{1,3}){0,2}|Annex\s+[A-Z0-9]{1,6}(?:\.\d{1,3}){0,3})\b", text, re.I)
    tail = text[match.end():] if match else text
    tail = tail.splitlines()[0].strip(" \t:.-—–")
    tail = re.split(r"\b(?:shall|must|should|may|can|is required to|are required to)\b", tail, maxsplit=1, flags=re.I)[0]
    tail = re.split(r"[.!?;]", tail, maxsplit=1)[0].strip(" \t:.-—–")
    return tail[:100].strip()


def _section_context_is_specific(content: Any) -> bool:
    """Reject a whole-document or multi-clause blob as evidence for a local clause."""
    text = str(content or "").strip()
    if not text or len(text) > 8000:
        return False
    if sum(bool(re.search(pattern, text, re.I)) for pattern in (r"\bFOREWORD\b", r"\bCONTENTS\b", r"\bINTRODUCTION\b", r"\bSCOPE\b")) >= 3:
        return False
    # Count heading-shaped lines, not every numeric reference in normal prose.
    heads = re.findall(r"(?m)^\s*(?:\d{1,2}(?:\.\d{1,3}){1,3}|[A-Z]\.\d{1,3}(?:\.\d{1,3}){0,2})\s+[A-Z][^\n]{0,100}$", text)
    return len(heads) <= 6


def _reference_from_text(value: Any) -> Optional[str]:
    """Extract a plausible normative clause/article reference from free metadata."""
    text = str(value or "").strip()
    if not text:
        return None
    patterns = [
        re.compile(r"\b(?:Article\s+\d{1,3}(?:\.\d{1,3})*|Annex\s+[A-Z0-9]{1,6}(?:\.\d{1,3}){0,3}|(?:Section|Clause|Part)\s+\d{1,3}(?:\.\d{1,3}){0,3}|\d{1,3}(?:\.\d{1,3}){0,3})(?:\s*\([0-9a-z]{1,3}\))?\b", re.I),
    ]
    for rx in patterns:
        m = rx.search(text)
        if m:
            candidate = _dedupe_repeat(m.group(0)).strip(" .:-—–")
            # Canonicalize explicit "Clause 7.2.4" metadata to the same key
            # used by extracted section records ("7.2.4"). Keep Article,
            # Annex, Section and other labels because they carry reference type.
            candidate = re.sub(r"^Clause\s+(?=\d)", "", candidate, flags=re.IGNORECASE)
            return candidate
    return None


def _is_generic_part_reference(ref: Any) -> bool:
    value = str(ref or "").strip()
    return bool(re.fullmatch(r"Part\s+\d+", value, re.I))


def _text_overlap(a: Any, b: Any) -> float:
    ta = {x for x in re.findall(r"[\wÀ-ÿµ°]{3,}", str(a or "").lower()) if x not in {"the", "and", "for", "shall", "must", "with", "from", "that", "this", "les", "des", "une", "un", "avec", "dans", "pour"}}
    tb = {x for x in re.findall(r"[\wÀ-ÿµ°]{3,}", str(b or "").lower()) if x not in {"the", "and", "for", "shall", "must", "with", "from", "that", "this", "les", "des", "une", "un", "avec", "dans", "pour"}}
    if not ta or not tb:
        return 0.0
    return len(ta & tb) / max(1, len(ta))


def _recover_requirement_clause_ref(req: dict[str, Any], sections: dict[str, dict[str, Any]]) -> tuple[str, float, str]:
    """Repair weak requirement references inside the Compliance Engine only.

    The Standards Portal JSON is never modified. When a requirement arrives with a
    generic reference such as ``Part 1`` (seen in real evaluations), try reliable
    metadata first, then match its title/text to the exact extracted section body.
    """
    current = str(req.get("clauseRef") or req.get("clause_ref") or req.get("reference") or "").strip()
    explicit = _leading_clause_reference(req.get("text"))
    if explicit:
        same = _normalize_clause_reference(explicit) == _normalize_clause_reference(current)
        return explicit, 0.98 if same else 0.96, "leading_reference_match" if same else "leading_reference_override"
    weak = _is_weak_clause_reference(current) or not clause_reference_quality(current).get("valid", False)

    # Strong metadata candidates are checked before accepting a valid-looking but
    # generic parent such as “Clause 1”. Prefer a more specific nested reference; do
    # not let less-specific metadata overwrite a precise current clause.
    for key in ("clauseNumber", "sectionNumber", "sectionRef", "clause", "standardClause", "article", "location", "sourceLocation"):
        candidate = _reference_from_text(req.get(key))
        if not candidate or _is_generic_part_reference(candidate) or not clause_reference_quality(candidate).get("valid", False):
            continue
        if weak:
            return candidate, 0.96, f"metadata:{key}"
        if _normalize_clause_reference(candidate) == _normalize_clause_reference(current):
            continue
        if _is_clause_descendant_reference(current, candidate) or _is_generic_clause_title(current):
            return candidate, 0.94, f"metadata:{key}"

    if not weak:
        return current, 1.0, "original_reference"

    for key in ("id", "requirementId", "requirement_id"):
        candidate = _reference_from_text(req.get(key))
        if candidate and not _is_generic_part_reference(candidate) and clause_reference_quality(candidate).get("valid", False):
            return candidate, 0.90, f"id:{key}"

    req_text = str(req.get("text") or "")
    req_title = str(req.get("clauseTitle") or req.get("clause_title") or "")
    req_page = req.get("page") or req.get("pageNumber") or req.get("sourcePage")
    try:
        req_page_num = int(req_page) if req_page is not None and str(req_page).strip() else None
    except (TypeError, ValueError):
        req_page_num = None

    candidates: list[tuple[float, str, float]] = []
    for ref, sec in sections.items():
        if _is_generic_part_reference(ref) or not clause_reference_quality(ref).get("valid", False):
            continue
        title = str(sec.get("title") or "")
        content = str(sec.get("content") or "")
        if not _section_context_is_specific(content):
            content = ""
        score_title = _text_overlap(req_title, title) if req_title and not _is_generic_clause_title(req_title) else 0.0
        score_body = _text_overlap(req_text, content)
        # Similarity is only a last-resort recovery. A title-only hit can attach a
        # requirement to a neighboring clause with a generic heading like “General”.
        score = 0.40 * score_title + 0.60 * score_body
        if req_page_num is not None:
            try:
                p0 = int(sec.get("pageStart")) if sec.get("pageStart") is not None else None
                p1 = int(sec.get("pageEnd")) if sec.get("pageEnd") is not None else None
            except (TypeError, ValueError):
                p0 = p1 = None
            if p0 is not None and p1 is not None and p0 <= req_page_num <= p1:
                score += 0.15
        candidates.append((score, ref, score_body))

    candidates.sort(reverse=True)
    best = candidates[0] if candidates else (0.0, "", 0.0)
    runner_up = candidates[1][0] if len(candidates) > 1 else 0.0
    if best[0] >= 0.68 and best[2] >= 0.55 and (len(candidates) == 1 or best[0] - runner_up >= 0.10):
        return best[1], min(0.86, 0.60 + best[0] * 0.30), "section_similarity"
    return current or "UNMAPPED", min(0.20, best[0]), "unresolved"


def _structured_clause_records(structured: Optional[dict]) -> List[ClauseRecord]:
    """Build Compliance Engine clause records from the exact Standards extraction.

    IMPORTANT: the current Standards pipeline stores the canonical requirement list
    in ``requirementsSummary.requirements`` rather than duplicating those rows inside
    every section object. The previous compliance implementation read only
    ``section.requirements`` and therefore treated every clause as a heading/N/A,
    producing a false 0% score. This function joins the two representations by
    ``clauseRef`` and makes ``requirementsSummary`` the authoritative requirement
    source.
    """
    if not isinstance(structured, dict):
        return []

    sections = structured.get("sections")
    sections = sections if isinstance(sections, list) else []

    # Metadata lookup: section title/content/page provenance. Keep the most useful
    # representation when the extractor produced duplicate section references.
    section_by_ref: dict[str, dict[str, Any]] = {}
    for sec in sections:
        if not isinstance(sec, dict):
            continue
        ref = str(sec.get("clauseNumber") or "").strip()
        if not ref:
            continue
        title = str(sec.get("title") or "").strip()
        heading = str(sec.get("heading") or "").strip()
        if not title:
            title = heading
            if heading.lower().startswith(ref.lower()):
                title = heading[len(ref):].strip(" .:-–—") or heading
        current = section_by_ref.get(ref)
        candidate = {
            "title": title,
            "heading": heading,
            "content": str(sec.get("content") or "").strip(),
            "section_type": str(sec.get("sectionType") or "clause").strip().lower() or "clause",
            "requirements": sec.get("requirements") if isinstance(sec.get("requirements"), list) else [],
            "pageStart": sec.get("pageStart") or sec.get("page") or sec.get("startPage"),
            "pageEnd": sec.get("pageEnd") or sec.get("page") or sec.get("endPage"),
        }
        if current is None:
            section_by_ref[ref] = candidate
        else:
            # Prefer a richer title/body while keeping the same canonical reference.
            if len(candidate["title"]) > len(current["title"]):
                current["title"] = candidate["title"]
            if len(candidate["content"]) > len(current["content"]):
                current["content"] = candidate["content"]
            if current["section_type"] == "clause" and candidate["section_type"] == "annex":
                current["section_type"] = "annex"

    # Canonical requirement source: requirementsSummary.requirements.
    summary = structured.get("requirementsSummary")
    summary_reqs = summary.get("requirements") if isinstance(summary, dict) else None
    summary_reqs = summary_reqs if isinstance(summary_reqs, list) else []
    possibly_incomplete = {str(x).strip() for x in (summary.get("possiblyIncompleteClauses") or []) if str(x).strip()} if isinstance(summary, dict) else set()
    mandatory_empty = {str(x).strip() for x in (summary.get("clausesFlaggedMandatoryButEmpty") or []) if str(x).strip()} if isinstance(summary, dict) else set()
    ungrounded_total = int(summary.get("ungroundedRequirementCount") or 0) if isinstance(summary, dict) else 0
    # Detect parent references that disagree with explicit clause identifiers in the
    # requirement text. Older persisted extractions do not have the new mapping metadata,
    # so the Compliance Engine repairs them here as well as in the extraction pipeline.
    suspect_parent_refs: set[str] = set()
    for item in summary_reqs:
        if not isinstance(item, dict):
            continue
        parent = str(item.get("originalClauseRef") or item.get("clauseRef") or item.get("clause_ref") or "").strip()
        parent_norm = _normalize_clause_reference(parent)
        explicit = _leading_clause_reference(item.get("text"))
        if _is_generic_part_reference(parent) or (explicit and _normalize_clause_reference(explicit) != parent_norm and not _is_clause_descendant_reference(parent, explicit)):
            suspect_parent_refs.add(parent_norm)

    grouped: dict[str, list[dict[str, Any]]] = {}
    mapping_meta: dict[str, list[dict[str, Any]]] = {}
    last_explicit_by_parent: dict[str, str] = {}
    seen_requirement_signatures: set[tuple[str, str, str, str, str]] = set()
    duplicate_requirements_removed = 0
    for req in summary_reqs:
        if not isinstance(req, dict):
            continue
        original_ref = str(req.get("originalClauseRef") or req.get("clauseRef") or req.get("clause_ref") or req.get("reference") or "").strip()
        parent_norm = _normalize_clause_reference(original_ref)
        explicit = _leading_clause_reference(req.get("text"))

        # Trust a strong explicit reference at the start of the requirement, even when
        # the source extraction attached it to a generic or conflicting parent clause.
        if explicit:
            ref = explicit
            same_parent = _normalize_clause_reference(explicit) == parent_norm
            nested_child = _is_clause_descendant_reference(original_ref, explicit)
            mapping_conf = 0.99 if same_parent else (0.97 if nested_child else 0.96)
            mapping_method = "leading_reference_match" if same_parent else ("nested_leading_reference" if nested_child else "leading_reference_override")
            last_explicit_by_parent[parent_norm] = explicit
        else:
            persisted_ref = str(req.get("clauseRef") or req.get("clause_ref") or "").strip()
            persisted_method = str(req.get("clauseMappingMethod") or "").strip()
            try:
                persisted_conf = float(req.get("clauseMappingConfidence"))
            except (TypeError, ValueError):
                persisted_conf = None
            if persisted_method and persisted_conf is not None:
                ref, mapping_conf, mapping_method = persisted_ref or original_ref or "UNMAPPED", persisted_conf, persisted_method
            else:
                recovered_ref, recovered_conf, recovered_method = _recover_requirement_clause_ref(req, section_by_ref)
                strong_recovery = recovered_method.startswith(("metadata:", "id:")) or recovered_method == "sectionNumber"
                if strong_recovery:
                    ref, mapping_conf, mapping_method = recovered_ref, recovered_conf, recovered_method
                elif parent_norm in suspect_parent_refs:
                    inherited = last_explicit_by_parent.get(parent_norm)
                    if inherited:
                        ref, mapping_conf, mapping_method = inherited, 0.78, "sequential_clause_context"
                    else:
                        ref, mapping_conf, mapping_method = "UNMAPPED", 0.10, "unresolved_misattributed_section"
                else:
                    ref, mapping_conf, mapping_method = recovered_ref, recovered_conf, recovered_method
        if not ref:
            ref = "UNMAPPED"
        req_text = re.sub(r"\s+", " ", str(req.get("text") or "").strip()).casefold()
        req_type = str(req.get("type") or "mandatory").strip().casefold()
        subref = str(req.get("subReference") or req.get("sub_reference") or req.get("marker") or req.get("itemMarker") or "").strip().casefold()
        applies_if = re.sub(r"\s+", " ", str(req.get("appliesIf") or req.get("applies_if") or "").strip()).casefold()
        signature_ref = _normalize_clause_reference(ref)
        # Exact duplicates are common when overlapping PDF chunks return the same
        # requirement twice. Deduplicate only within the same resolved clause/type and
        # preserve distinct sub-item markers or applicability conditions. For unresolved
        # rows keep the original parent in the key so unrelated unknown clauses don't merge.
        if signature_ref == "unmapped":
            signature_ref = f"unmapped|{parent_norm}"
        signature = (signature_ref, req_text, req_type, subref, applies_if)
        if req_text and signature in seen_requirement_signatures:
            duplicate_requirements_removed += 1
            continue
        if req_text:
            seen_requirement_signatures.add(signature)

        req_copy = dict(req)
        req_copy["_originalClauseRef"] = original_ref or None
        req_copy["_duplicateRequirementsRemoved"] = duplicate_requirements_removed
        req_copy["clauseRef"] = ref
        req_copy["_clauseMappingConfidence"] = mapping_conf
        req_copy["_clauseMappingMethod"] = mapping_method
        grouped.setdefault(ref, []).append(req_copy)
        mapping_meta.setdefault(ref, []).append({"confidence": mapping_conf, "method": mapping_method, "originalRef": original_ref})

    # Backward compatibility with older extraction exports that embedded requirements
    # inside each section. Apply the same reference repair and quality metadata instead
    # of trusting the old parent clause blindly.
    if not grouped:
        for parent_ref, sec in section_by_ref.items():
            reqs = sec.get("requirements") if isinstance(sec.get("requirements"), list) else []
            if not reqs:
                continue
            parent_norm = _normalize_clause_reference(parent_ref)
            explicit_refs = [_leading_clause_reference(item.get("text")) for item in reqs if isinstance(item, dict)]
            suspect_parent = _is_generic_part_reference(parent_ref) or any(
                explicit and _normalize_clause_reference(explicit) != parent_norm and not _is_clause_descendant_reference(parent_ref, explicit)
                for explicit in explicit_refs
            )
            last_explicit: Optional[str] = None
            for item in reqs:
                if not isinstance(item, dict):
                    continue
                explicit = _leading_clause_reference(item.get("text"))
                if explicit:
                    ref = explicit
                    nested = _is_clause_descendant_reference(parent_ref, explicit)
                    same = _normalize_clause_reference(explicit) == parent_norm
                    confidence = 0.99 if same else (0.97 if nested else 0.96)
                    method = "leading_reference_match" if same else ("nested_leading_reference" if nested else "leading_reference_override")
                    last_explicit = explicit
                else:
                    recovered_ref, recovered_conf, recovered_method = _recover_requirement_clause_ref(item, section_by_ref)
                    if recovered_method.startswith(("metadata:", "id:")):
                        ref, confidence, method = recovered_ref, recovered_conf, recovered_method
                    elif suspect_parent and last_explicit:
                        ref, confidence, method = last_explicit, 0.78, "sequential_clause_context"
                    elif suspect_parent:
                        ref, confidence, method = "UNMAPPED", 0.10, "unresolved_misattributed_section"
                    else:
                        ref, confidence, method = recovered_ref, recovered_conf, recovered_method
                req_copy = dict(item)
                req_copy["_originalClauseRef"] = parent_ref
                req_copy["clauseRef"] = ref or "UNMAPPED"
                req_copy["_clauseMappingConfidence"] = confidence
                req_copy["_clauseMappingMethod"] = method
                grouped.setdefault(req_copy["clauseRef"], []).append(req_copy)
                mapping_meta.setdefault(req_copy["clauseRef"], []).append({"confidence": confidence, "method": method, "originalRef": parent_ref})

    # No requirements means there is nothing the engine can assess. Returning an empty
    # record set forces the evaluation to fail clearly instead of returning a false 0%.
    if not grouped:
        return []

    out: list[ClauseRecord] = []
    seen_refs: set[str] = set()
    for ref, reqs in grouped.items():
        if ref in seen_refs:
            continue
        seen_refs.add(ref)
        sec = section_by_ref.get(ref, {})
        section_type = str(sec.get("section_type") or "clause")
        title = str(sec.get("title") or "").strip()
        # Modern extraction stores the semantic clause title on each requirement.
        # Prefer that value over TOC/header fragments such as
        # "General................................27" or OCR-garbled page leaders.
        req_titles = [
            str(req.get("clauseTitle") or req.get("clause_title") or "").strip()
            for req in reqs
            if isinstance(req, dict)
        ]
        req_titles = [t for t in req_titles if t and not _is_generic_clause_title(t)]
        prefix_titles = [_title_from_leading_requirement(req.get("text"), ref) for req in reqs if isinstance(req, dict)]
        prefix_titles = [t for t in prefix_titles if t]
        preferred_req_title = max(set(req_titles), key=lambda t: (req_titles.count(t), len(t))) if req_titles else ""
        preferred_prefix_title = max(set(prefix_titles), key=lambda t: (prefix_titles.count(t), len(t))) if prefix_titles else ""
        looks_like_toc = bool(re.search(r"(?:\.{3,}|…{2,}|\s+\d{1,3}$)", title))
        if preferred_prefix_title and (not title or _is_generic_clause_title(title) or looks_like_toc or len(preferred_prefix_title) < len(title) * 0.65):
            title = preferred_prefix_title
        elif preferred_req_title and (not title or _is_generic_clause_title(title) or looks_like_toc or len(preferred_req_title) < len(title) * 0.65):
            title = preferred_req_title
        if not title or _is_generic_clause_title(title):
            title = preferred_prefix_title or preferred_req_title or ref
        source_context = str(sec.get("content") or "").strip()
        source_context_specific = _section_context_is_specific(source_context)
        # Never pass a whole-standard/ambiguous block to the clause comparator. If
        # section provenance is weak, provide only the requirement text assigned to this ref.
        text = source_context if source_context_specific else "\n".join(
            str(req.get("text") or "").strip() for req in reqs if isinstance(req, dict) and str(req.get("text") or "").strip()
        )[:8000]
        out.append(ClauseRecord(
            ref=ref,
            title=title,
            text=text,
            section_type=section_type,
            requirements=reqs,
            standard_quality_flags={
                "sourcePageStart": sec.get("pageStart"),
                "sourcePageEnd": sec.get("pageEnd"),
                "clausePossiblyIncomplete": ref in possibly_incomplete,
                "clauseMandatoryButEmpty": ref in mandatory_empty,
                "standardUngroundedRequirementCount": ungrounded_total,
                "clauseReferenceQuality": clause_reference_quality(ref),
                "requirementClauseMapping": {
                    "minConfidence": round(min((float(x.get("confidence", 0.0)) for x in mapping_meta.get(ref, [])), default=1.0), 4),
                    "methods": sorted({str(x.get("method") or "") for x in mapping_meta.get(ref, [])}),
                    "correctedParentReferenceCount": sum(1 for x in mapping_meta.get(ref, []) if x.get("originalRef") and _normalize_clause_reference(x.get("originalRef")) != _normalize_clause_reference(ref) and not _is_clause_descendant_reference(x.get("originalRef"), ref)),
                    "unresolvedCount": sum(1 for x in mapping_meta.get(ref, []) if float(x.get("confidence", 0.0)) < 0.38),
                },
                "sourceContextSpecific": source_context_specific,
                "sourceContextNeedsReview": not source_context_specific,
                "duplicateRequirementsRemoved": duplicate_requirements_removed,
            },
        ))

    for record in out:
        record.standard_quality_flags["duplicateRequirementsRemoved"] = duplicate_requirements_removed
    return out


def _validate_standard_records_for_compliance(records: List[ClauseRecord]) -> dict[str, Any]:
    """Refuse to score an obviously corrupted/non-normative Standard extraction.

    This is intentionally a Compliance Engine gate, not a modification of the
    Standards & Regulations pipeline. It prevents document dates, recitals and
    unrelated economic-operator obligations from becoming Product failures.
    """
    if not records:
        raise RuntimeError("No usable Standard/Regulation clauses were extracted for compliance evaluation.")

    total_records = len(records)
    date_metadata = 0
    invalid_refs = 0
    normative_requirements = 0
    in_scope_requirements = 0
    out_scope_requirements = 0
    review_requirements = 0
    requirement_count = 0
    low_confidence_mappings = 0
    corrected_parent_mappings = 0
    non_specific_context_count = 0

    for rec in records:
        if rec.standard_quality_flags.get("sourceContextNeedsReview"):
            non_specific_context_count += 1
        ref_quality = clause_reference_quality(rec.ref)
        if ref_quality.get("kind") in {"DATE_METADATA", "DOCUMENT_METADATA"}:
            date_metadata += 1
        if ref_quality.get("valid") is False:
            invalid_refs += 1
        for req in rec.requirements:
            if not isinstance(req, dict):
                continue
            requirement_count += 1
            try:
                mapping_confidence = float(req.get("_clauseMappingConfidence", req.get("clauseMappingConfidence", 1.0)))
            except (TypeError, ValueError):
                mapping_confidence = 0.0
            if mapping_confidence < 0.38 or str(rec.ref).upper() == "UNMAPPED":
                low_confidence_mappings += 1
            if str(req.get("_clauseMappingMethod") or req.get("clauseMappingMethod") or "").endswith("override"):
                corrected_parent_mappings += 1
            scope = requirement_scope(
                req,
                clause_ref=rec.ref,
                clause_title=rec.title,
                clause_text=rec.text,
                section_type=rec.section_type,
            )
            if scope.get("scope") == "IN_SCOPE":
                in_scope_requirements += 1
                normative_requirements += 1
            elif scope.get("scope") == "OUT_OF_SCOPE":
                out_scope_requirements += 1
            else:
                review_requirements += 1

    # A few bad metadata rows are recoverable and are shown as N/A. A standard
    # dominated by date/page metadata is not safe to score because it indicates
    # the structural extraction is misaligned with the source document.
    date_ratio = date_metadata / max(1, total_records)
    if date_metadata >= 3 and date_ratio >= 0.15:
        raise RuntimeError(
            f"The selected Standard/Regulation extraction contains {date_metadata}/{total_records} "
            "date/Official-Journal metadata references. Compliance scoring is blocked because the "
            "requirement-to-clause mapping is not trustworthy; re-process or manually verify the exact source document."
        )
    if not in_scope_requirements:
        raise RuntimeError(
            "The selected Standard/Regulation extraction contains no auditable Product/manufacturer requirements. "
            "Compliance scoring is blocked rather than treating unrelated institutional obligations as Product findings."
        )

    low_mapping_ratio = low_confidence_mappings / max(1, requirement_count)
    if low_confidence_mappings >= max(2, int(requirement_count * 0.10)):
        raise RuntimeError(
            f"The selected Standard/Regulation extraction has unreliable clause mapping for "
            f"{low_confidence_mappings}/{requirement_count} requirements ({low_mapping_ratio:.0%}). "
            "Compliance scoring is blocked to avoid reporting conformity against incorrectly assigned clauses. "
            "Re-process the Standard extraction or correct the clause references before rerunning the evaluation."
        )

    return {
        "clauseCount": total_records,
        "requirementCount": requirement_count,
        "normativeInScopeRequirements": normative_requirements,
        "outOfScopeRequirements": out_scope_requirements,
        "reviewRequirements": review_requirements,
        "invalidReferenceCount": invalid_refs,
        "dateMetadataClauseCount": date_metadata,
        "dateMetadataRatio": round(date_ratio, 4),
        "lowConfidenceClauseMappings": low_confidence_mappings,
        "lowConfidenceClauseMappingRatio": round(low_mapping_ratio, 4),
        "correctedParentReferenceCount": corrected_parent_mappings,
        "sourceContextNeedsReviewClauseCount": non_specific_context_count,
        "mappingIntegrity": "NEEDS_REVIEW" if low_confidence_mappings or corrected_parent_mappings else "OK",
    }


async def _fetch_structured_extraction(company_id: str, document_id: str) -> Optional[dict]:
    """Pull the Standards Portal's own structured extraction for this document.

    Preferred over any form of clause rediscovery: it is the same JSON the
    portal shows an operator, already validated there. Returns None (never
    raises) so callers fall back to the legacy vector-index recovery chain —
    this must never be the reason an evaluation fails outright.
    """
    base = (settings.DOCUMENT_SERVICE_URL or "").rstrip("/")
    token = (settings.DOCUMENT_INTERNAL_TOKEN or "").strip()
    if not base:
        return None
    url = f"{base}/api/documents/internal/structured/{document_id}"
    try:
        async with httpx.AsyncClient() as client:
            r = await client.get(
                url,
                params={"company_id": company_id},
                headers={"X-Internal-Token": token},
                timeout=20.0,
            )
        if r.status_code >= 400:
            logger.warning(
                "Structured extraction fetch failed for %s: HTTP %d", document_id, r.status_code
            )
            return None
        body = r.json()
        structured = body.get("extractedStructured") if isinstance(body, dict) else None
        return structured if isinstance(structured, dict) else None
    except Exception as e:
        logger.warning("Structured extraction fetch error for %s: %s", document_id, e)
        return None


async def _fetch_product_snapshot(company_id: str, document_id: str,
                                  evidence_document_ids: Optional[List[str]] = None) -> Optional[ProductSnapshot]:
    """Fetch the structured product extraction + merged product profile.

    Product extraction is the authoritative fact source for Compliance Engine.
    RAG/LLM should only fill gaps, never re-infer basic product facts when the
    structured extraction already contains them.
    """
    if not document_id:
        raise RuntimeError("The selected product document is missing.")
    base = (settings.DOCUMENT_SERVICE_URL or "").rstrip("/")
    token = (settings.DOCUMENT_INTERNAL_TOKEN or "").strip()
    if not base or not token:
        raise RuntimeError("Product Management connection or internal token is not configured.")
    try:
        async with httpx.AsyncClient() as client:
            r = await client.get(
                f"{base}/api/documents/internal/structured/{document_id}",
                params={"company_id": company_id},
                headers={"X-Internal-Token": token},
                timeout=20.0,
            )
        if r.status_code >= 400:
            raise RuntimeError(f"Product Management could not provide the selected product data (HTTP {r.status_code}).")
        body = r.json()
        if not isinstance(body, dict):
            raise RuntimeError("Product Management returned an invalid product extraction.")
        return build_product_snapshot(body, document_id, evidence_document_ids)
    except Exception as e:
        logger.warning("Product structured fetch error for %s: %s", document_id, e)
        raise RuntimeError(f"Could not load the selected Product Management data: {e}") from e


def _build_requirements_block(
    requirements: List[Dict[str, Any]],
    comparisons: Optional[List[dict]] = None,
    *,
    comparison_max_chars: int = 650,
    requirement_max_chars: Optional[int] = None,
) -> str:
    """Render every requested requirement without cutting the block mid-item.

    The old caller appended as much as 3,200 chars of comparison context for each
    requirement and then sliced the complete prompt block to 4,500 chars. With a
    six-requirement batch this truncated later requirements completely, while the
    judge was still asked to return a decision for all six. Keep each item bounded
    instead, so every requirement remains visible to the model.
    """
    lines = []
    comparisons = comparisons or []
    for i, req in enumerate(requirements, start=1):
        rtype = str(req.get("type") or "mandatory")
        modal = str(req.get("modalVerb") or "").strip()
        text = re.sub(r"\s+", " ", str(req.get("text") or "").strip())
        if requirement_max_chars is not None:
            text = text[:max(100, int(requirement_max_chars))]
        applies_if = re.sub(r"\s+", " ", str(req.get("appliesIf") or "").strip())[:240]
        refs = req.get("crossReferences")
        ref_text = ", ".join(str(x).strip() for x in refs if str(x).strip()) if isinstance(refs, list) else str(refs or "").strip()
        ref_text = ref_text[:240]
        tag = f'{rtype}, "{modal}"' if modal else rtype
        cond = f" [applies if: {applies_if}]" if applies_if else ""
        cross = f" [cross-references: {ref_text}]" if ref_text else ""
        rid = str(req.get("id") or req.get("requirementId") or req.get("requirement_id") or "").strip()[:100]
        ident = f" id={rid}" if rid else ""
        lines.append(f"[{i}]{ident} ({tag}){cond}{cross} {text}")
        if i <= len(comparisons):
            lines.append(comparison_context(comparisons[i - 1], max_chars=max(250, comparison_max_chars)))
    return "\n".join(lines)


def _pack_judge_batches(
    requirements_with_index: List[tuple[int, Dict[str, Any]]],
    comparisons_by_index: Dict[int, dict],
    *,
    max_items: int = JUDGE_BATCH_SIZE,
    max_chars: int = 10_000,
) -> List[List[tuple[int, Dict[str, Any]]]]:
    """Group semantic requirements without dropping or truncating requirement text.

    The original source index is retained so responses can be mapped back to the
    clause result row even when deterministic requirements are interleaved.
    """
    max_items = max(1, int(max_items))
    max_chars = max(1, int(max_chars))
    batches: List[List[tuple[int, Dict[str, Any]]]] = []
    current: List[tuple[int, Dict[str, Any]]] = []
    current_chars = 0
    for pair in requirements_with_index:
        original_i, requirement = pair
        comparison = comparisons_by_index.get(original_i, {})
        item_chars = len(_build_requirements_block(
            [requirement], [comparison], comparison_max_chars=650,
        )) + 100
        if current and (len(current) >= max_items or current_chars + item_chars > max_chars):
            batches.append(current)
            current = []
            current_chars = 0
        # A single unusually long requirement is retained in its own batch. It is
        # safer to spend more context on that one requirement than silently truncate
        # normative text and produce a judgment against only part of the clause.
        current.append(pair)
        current_chars += item_chars
    if current:
        batches.append(current)
    return batches


def _resolve_evidence_reference_indexes(
    evidence_refs: Any,
    rendered_global_indexes: Optional[List[int]],
    evidence_count: int,
) -> List[int]:
    """Map 1-based model references to only the evidence actually shown in its prompt.

    When a prompt-index map is provided, an out-of-range reference is rejected. It
    must never fall back to the same numeric index in the full retrieved evidence
    list, since that would silently cite a chunk the model never saw.
    """
    if not isinstance(evidence_refs, list):
        return []
    mapped: List[int] = []
    for raw in evidence_refs:
        try:
            local_index = int(raw) - 1
        except (TypeError, ValueError):
            continue
        if isinstance(rendered_global_indexes, list):
            if not 0 <= local_index < len(rendered_global_indexes):
                continue
            global_index = rendered_global_indexes[local_index]
        else:
            # Compatibility with the older, non-batched prompt format where the
            # evidence index directly addressed the full retrieved list.
            global_index = local_index
        if 0 <= global_index < evidence_count and global_index not in mapped:
            mapped.append(global_index)
    return mapped


JUDGE_PROMPT = ChatPromptTemplate.from_template(
    """You are a lead auditor performing conformity judgment. The requirements listed
below were already identified and verified verbatim from the standard's own text by a
separate extraction step — do NOT rewrite, merge, split, renumber, or add requirements.
Judge exactly the ones listed, one judgment per requirement index.

STANDARD CLAUSE: {clause_reference} — {clause_title}

REQUIREMENTS TO JUDGE:
{requirements_block}

EVIDENCE (structured product facts with provenance plus retrieved evidence documents):
{evidence_chunks}

TASK: for EACH requirement above, decide whether the evidence demonstrates conformity.

RESPOND ONLY WITH VALID JSON:
{{
  "judgments": [
    {{
      "requirement_index": 1,
      "status": "PASS|FAIL|N/A|MISSING_INFO",
      "justification": "<STATUS>: rationale citing the source document and page",
      "confidence": 0.0-1.0,
      "evidence_refs": [1, 3],
      "requirement_elements": [
        {{"element": "property/condition/threshold/action", "status": "covered|partial|contradicted|missing", "evidence_refs": [1], "notes": "..."}}
      ],
      "evidence_assessment": [
        {{"evidence_ref": 1, "relevance": "high|medium|low", "supports": true, "contradicts": false, "notes": "..."}}
      ]
    }}
  ]
}}

STATUS: choose exactly one per requirement:
- "PASS": the evidence positively demonstrates conformity.
- "FAIL": the evidence shows the requirement is NOT met, or contradicts it.
- "N/A": the requirement's own applicability condition is not met for this product.
- "MISSING_INFO": the requirement applies but the file does not contain enough
  information to decide, or the information is contradictory. Do NOT guess PASS or
  FAIL when the evidence is simply absent.

RULES:
- "justification" MUST start with the status followed by ": ", and MUST cite the
  evidence exactly as given in its source="…" field, copying the page when present,
  e.g. 'PASS: the wiring diagram (Manuel_FA1002.pdf, p. 26) shows …'. Never cite a
  chunk by its index ("Evidence Chunk 1") and never cite a UUID.
- Never invent evidence. Absent evidence is "MISSING_INFO", never "PASS".
- A product profile/declaration that merely names a standard is not proof that every technical requirement is satisfied.
- When evidence conflicts, choose "MISSING_INFO" unless one authoritative source clearly resolves the conflict.
- evidence_refs: 1-based indices into the evidence chunks provided.
- requirement_elements: split the requirement into the smallest auditable obligations or constraints and explicitly compare each one against Product data.
- evidence_assessment: assess only evidence you actually relied on; distinguish support from contradiction and irrelevance.
- The Product↔Standard/Regulation comparison block is a deterministic cross-check created from the exact requirement extracted by the Standards & Regulations Portal and the structured Product data already extracted by Product Management. Treat it as a machine-checkable cross-check, not as model-generated prose.
- For numeric limits, ranges, units, and explicit Product attributes, do not contradict a high-confidence comparison unless the cited Product evidence directly disproves it. If the comparison is PARTIAL/CONFLICTING, do not manufacture a PASS or FAIL; use MISSING_INFO unless the evidence clearly resolves the uncertainty.
- All independently identified requirement elements must be considered. A multi-part requirement is PASS only when every applicable element is positively evidenced; one matching element is not sufficient.
- An ungrounded Product Management profile declaration cannot by itself prove certification or conformity.
- A standard/regulation identifier, certificate number, or claim of compliance is not proof of compliance with every technical requirement; documentary evidence must support the claim.
- Write justification in the SAME LANGUAGE as the requirement text above.
- Return exactly one judgment per requirement listed above — same count, same
  requirement_index values, no more, no fewer."""
)


def _validate_judge_response(data: dict[str, Any], expected_count: int) -> tuple[bool, str]:
    """Validate a judge response.

    Deliberately does NOT hard-fail the whole batch just because the model
    returned a different item count than expected (dropped/duplicated one
    index) -- that used to discard every correct judgment in the batch along
    with the bad one. Missing indices are handled downstream (they fall back
    to MISSING_INFO/INCONCLUSIVE per-row via by_index.get()), and extras are
    ignored. We still fail hard on genuinely malformed items, since those
    can't be salvaged.
    """
    if not isinstance(data, dict):
        return False, f"top-level response was {type(data).__name__}, not an object"
    judgments = data.get("judgments")
    if not isinstance(judgments, list) or not judgments:
        return False, "judgments must be a non-empty list"
    for i, item in enumerate(judgments):
        if not isinstance(item, dict):
            return False, f"judgments[{i}] must be an object, got {type(item).__name__}"
        for f in ("requirement_index", "status", "justification"):
            if f not in item:
                return False, f"judgments[{i}] missing field: {f}"
        raw_status = str(item.get("status") or "").strip().upper().replace("-", "_").replace(" ", "_")
        # _normalise_status deliberately falls back to MISSING_INFO. Validate
        # the original value first, otherwise an invented status is silently
        # mislabeled as a product evidence gap.
        known_statuses = {
            "PASS", "PASSED", "CONFORM", "CONFORME", "SATISFIED",
            "FAIL", "FAILED", "NON_CONFORME", "NOT_SATISFIED",
            "N/A", "NA", "N_A", "NOT_APPLICABLE", "NON_APPLICABLE",
            "MISSING_INFO", "MISSING", "INFO_MANQUANTE", "UNKNOWN", "PARTIALLY_SATISFIED", "INCONCLUSIVE",
        }
        if raw_status not in known_statuses:
            return False, f"judgments[{i}] invalid status: {item.get('status')}"
        try:
            original_index = item["requirement_index"]
            if isinstance(original_index, bool) or not (isinstance(original_index, int) or (isinstance(original_index, str) and original_index.isdigit())):
                raise ValueError()
            index = int(original_index)
            if not 1 <= index <= expected_count:
                raise ValueError()
        except (TypeError, ValueError):
            return False, f"judgments[{i}] invalid requirement_index"
        if not isinstance(item.get("justification"), str):
            return False, f"judgments[{i}] justification must be text"
        if item.get("confidence") is not None:
            try:
                if isinstance(item["confidence"], bool):
                    raise ValueError()
                confidence = float(item["confidence"])
                if not math.isfinite(confidence) or not 0 <= confidence <= 1:
                    raise ValueError()
            except (TypeError, ValueError):
                return False, f"judgments[{i}] invalid confidence"
        if item.get("evidence_refs") is not None and not isinstance(item.get("evidence_refs"), list):
            return False, f"judgments[{i}] evidence_refs must be a list"
        if isinstance(item.get("evidence_refs"), list) and any(
            isinstance(ref, bool) or not (isinstance(ref, int) or (isinstance(ref, str) and ref.isdigit()))
            for ref in item["evidence_refs"]
        ):
            return False, f"judgments[{i}] evidence_refs must contain numeric references"
        if item.get("evidence_assessment") is not None:
            if not isinstance(item["evidence_assessment"], list):
                return False, f"judgments[{i}] evidence_assessment must be a list"
            for entry in item["evidence_assessment"]:
                if not isinstance(entry, dict) or any(k in entry and not isinstance(entry[k], bool) for k in ("supports", "contradicts")):
                    return False, f"judgments[{i}] evidence assessment flags must be booleans"
    if len(judgments) != expected_count:
        logger.info(
            "judge response item count mismatch: expected %d, got %d (salvaging matched indices)",
            expected_count, len(judgments),
        )
    return True, "OK"


# Accepts the numbering styles real standards use: dotted ISO clauses (4.1, 7.5.3),
# EU-regulation Articles (Article 49), and Annexes (Annex X, Annex VI). Anything
# else is rejected so page numbers and stray digits cannot become "clauses".
CLAUSE_REF_RE = re.compile(
    r"^(?:(?:Article|Annex|Section|Clause|Part)\s+)?"
    r"(?:\d{1,3}(?:\.\d{1,3}){0,3}|[IVXLC]{1,6})"
    r"(?:\s*\([0-9a-z]{1,3}\))?$",
    re.IGNORECASE,
)

# Structural probes used to pull a representative sample of the standard's own
# text out of the vector store before asking the LLM for its clause list.
CLAUSE_DISCOVERY_QUERIES = [
    "table of contents clauses sections",
    "requirements shall clause",
    "scope normative references terms definitions",
    "management responsibility planning support operation",
    "performance evaluation improvement audit",
]


class EvaluationEngine:
    def __init__(self, ingestion: IngestionService):
        self.ingestion = ingestion
        _reasoning_effort = (settings.COMPLIANCE_REASONING_EFFORT or "").strip()
        _extra_kwargs = {"reasoning_effort": _reasoning_effort} if _reasoning_effort else {}
        self.llm = ChatOpenAI(
            api_key=settings.OPENAI_API_KEY,
            base_url=settings.OPENAI_BASE_URL,
            model=settings.OPENAI_MODEL,
            temperature=0.1,
            max_tokens=settings.COMPLIANCE_MAX_TOKENS,
            model_kwargs=_extra_kwargs,
        )
        # The evaluator uses a separate chat fallback when configured. Previously
        # fallback support existed for chat/structuring but not for compliance, so a
        # single provider quota/rate-limit failure could turn most requirements into
        # INCONCLUSIVE.
        fallback_key = (settings.CHAT_LLM_FALLBACK_API_KEY or "").strip()
        fallback_base = (settings.CHAT_LLM_FALLBACK_BASE_URL or "").strip()
        fallback_model = (settings.CHAT_LLM_FALLBACK_MODEL or "").strip()
        primary_tuple = (settings.OPENAI_API_KEY or "", settings.OPENAI_BASE_URL or "", settings.OPENAI_MODEL or "")
        fallback_tuple = (fallback_key, fallback_base, fallback_model)
        self.fallback_llm = None
        if fallback_key and fallback_base and fallback_model and fallback_tuple != primary_tuple:
            self.fallback_llm = ChatOpenAI(
                api_key=fallback_key,
                base_url=fallback_base,
                model=fallback_model,
                temperature=0.1,
                max_tokens=settings.COMPLIANCE_MAX_TOKENS,
            )
        # Clause discovery emits a whole clause list in one response, which does not
        # fit the per-clause token budget above.
        self.clause_llm = ChatOpenAI(
            api_key=settings.OPENAI_API_KEY,
            base_url=settings.OPENAI_BASE_URL,
            model=settings.OPENAI_MODEL,
            temperature=0.0,
            max_tokens=max(4000, settings.LLM_MAX_TOKENS),
        )
        # (company_id, iso_document_id) -> [(ref, title), …]
        self._clause_cache: dict[tuple[str, str], List[tuple[str, str]]] = {}
        # (company_id, iso_document_id) -> ProductComplianceSnapshot is loaded per evaluation.
        self._product_snapshot_cache: dict[tuple[str, str], ProductSnapshot] = {}
        # (company_id, iso_document_id) -> {ref: ClauseRecord}, populated only when
        # clauses came from the Standards Portal's structured extraction (see
        # _derive_clauses). Looked up per-clause in _eval_clause so each clause
        # independently uses the judgment-only path when its data is available.
        self._clause_records_cache: dict[tuple[str, str], Dict[str, ClauseRecord]] = {}

    async def _llm_invoke_reliable(self, chain, payload: dict[str, Any], label: str, attempts: Optional[int] = None):
        """Run a compliance LLM call with bounded retry/fallback."""
        configured_timeout = float(
            getattr(settings, "COMPLIANCE_LLM_TIMEOUT_SEC", 75.0)
            or getattr(settings, "LLM_REQUEST_TIMEOUT_SEC", 75.0)
            or 75.0
        )
        timeout = max(20.0, min(configured_timeout, 120.0))
        attempts = int(
            attempts if attempts is not None
            else getattr(settings, "COMPLIANCE_LLM_ATTEMPTS", 2)
            or 2
        )
        attempts = max(1, min(attempts, 3))

        async def call_once(active_chain):
            return await run_compliance_limited(active_chain.ainvoke(payload), timeout=timeout)

        try:
            return await retry_with_backoff(lambda: call_once(chain), max_attempts=attempts)
        except Exception as primary_exc:
            logger.warning("Primary compliance LLM failed (%s): %s", label, primary_exc)
            if self.fallback_llm is None:
                raise

            # Rebuild the same prompt with the fallback model.
            prompt = JUDGE_PROMPT if label.startswith("structured:") else PROMPT
            fallback_chain = prompt | self.fallback_llm
            try:
                logger.info("Trying fallback compliance LLM (%s)", label)
                return await retry_with_backoff(
                    lambda: call_once(fallback_chain),
                    max_attempts=1,
                )
            except Exception as fallback_exc:
                logger.warning("Fallback compliance LLM failed (%s): %s", label, fallback_exc)
                raise fallback_exc from primary_exc

    async def _judge_with_repair(
        self,
        chain,
        payload: dict[str, Any],
        expected_count: int,
        label: str,
        repair_attempts: int = 1,
    ) -> tuple[Optional[dict[str, Any]], Optional[str]]:
        """Invoke a judge-style prompt and validate the JSON, retrying on
        schema-mismatch / truncation instead of giving up after one parse.

        This is the piece that was missing before: `_llm_invoke_reliable`
        already retries when the HTTP call itself fails (429/5xx/timeout),
        but until now a 200 OK response with malformed or truncated JSON was
        treated as a permanent failure after a single attempt. Most
        schema-mismatch/truncation errors are stochastic — asking again
        (optionally with the validator's own error message fed back to the
        model) recovers the large majority of them. Kept to 1 repair attempt
        by default: each extra attempt queues behind COMPLIANCE_WORKERS and
        adds to the clause's wall-clock budget (CLAUSE_TIMEOUT_SEC), and one
        retry recovers most stochastic failures already.
        """
        last_error = "unknown"
        current_payload = dict(payload)
        for attempt in range(1 + max(0, repair_attempts)):
            try:
                result = await self._llm_invoke_reliable(chain, current_payload, label=label)
            except Exception as e:
                last_error = f"{type(e).__name__}: {e}"
                # A transport-level failure already retried internally (and tried
                # the fallback provider); another local attempt won't help.
                break
            data = _parse_llm_json(str(result.content))
            valid, error = _validate_judge_response(data, expected_count)
            if valid:
                return data, None
            last_error = error
            logger.info("judge response invalid on attempt %d (%s): %s", attempt + 1, label, error)
            if attempt < repair_attempts:
                current_payload = {
                    **payload,
                    "requirements_block": payload["requirements_block"]
                    + (
                        f"\n\nYOUR PREVIOUS RESPONSE WAS INVALID ({error}). "
                        f"Return ONLY corrected JSON. Every item in \"judgments\" MUST be an "
                        f"object (not a string), and you must return one judgment per "
                        f"requirement listed above."
                    ),
                }
        return None, last_error

    @staticmethod
    def _dedupe_repeat(value: str) -> str:
        """Delegate to the shared module-level duplicate-token normalizer."""
        return _dedupe_repeat(value)

    @staticmethod
    def _clause_sort_key(ref: str) -> tuple:
        """Document order for dotted refs: 7.2 before 7.10, headings before leaves."""
        parts = re.findall(r"\d+", ref or "")
        return tuple(int(p) for p in parts) if parts else (9999,)

    async def _clauses_from_index(
        self, company_id: str, iso_document_id: str
    ) -> List[tuple[str, str]]:
        """Clause list straight from the clause-aligned vectors of the standard.

        Returns [] when the standard predates clause-aware indexing, in which case
        the caller falls back to LLM extraction.
        """
        found: dict[str, str] = {}
        # Several probes because one query returns at most top_k neighbours; the
        # union covers the document far better than any single vector would.
        for q in CLAUSE_DISCOVERY_QUERIES:
            try:
                matches = await self.ingestion.search(
                    q, company_id, top_k=100, filter={"document_id": iso_document_id}
                )
            except Exception as e:
                logger.warning("Clause structure probe failed (%s): %s", q, e)
                continue
            for m in matches:
                meta = m.metadata or {}
                ref = self._dedupe_repeat(str(meta.get("clause_ref") or ""))
                if not ref or len(ref) > 24:
                    continue
                title = self._dedupe_repeat(str(meta.get("clause_title") or ""))
                # A heading with no text of its own leaves title == ref; blank it
                # so the worksheet shows the number once, not "ANNEX I ANNEX I".
                if title.lower() == ref.lower():
                    title = ""
                # Keep the most informative heading seen for this clause.
                if ref not in found or (title and len(title) > len(found[ref])):
                    found[ref] = title
        if not found:
            return []

        # Prefer the standard's numbered clauses (7.2.1, 16.4). Annexes, figures and
        # tables are only used when the document has no numbered clauses at all,
        # otherwise an annex heading crowds out the requirements that matter.
        # "7", "7.2", "7.2.3" and lettered sub-items "7.2.3 (a)" all count as
        # numbered clauses; annex/article headers do not.
        numbered = {
            ref: title
            for ref, title in found.items()
            if re.match(r"^\d{1,2}(\.\d{1,3})*(\s*\([a-z0-9]\))?$", ref.strip(), re.IGNORECASE)
        }
        selected = numbered or {
            ref: title
            for ref, title in found.items()
            if not re.match(r"^(?:figure|fig\.|table)\b", ref.strip(), re.IGNORECASE)
        }
        if numbered and len(found) > len(numbered):
            logger.info(
                "Clause list: kept %d numbered clause(s), dropped %d annex/figure heading(s)",
                len(numbered),
                len(found) - len(numbered),
            )
        ordered = sorted(selected.items(), key=lambda kv: self._clause_sort_key(kv[0]))
        return [(ref, title) for ref, title in ordered]

    async def _clauses_from_model_knowledge(self, iso_standard: str) -> List[tuple[str, str]]:
        """Disabled in production compliance evaluation.

        Compliance must never be based on the model's memory of a standard edition.
        If the selected standard has no usable structured extraction/index, the
        evaluation must stop and request re-processing of that exact document.
        """
        logger.error(
            "Refusing model-knowledge clause recovery for %s: compliance must use the uploaded standard only.",
            iso_standard,
        )
        return []

    def _clauses_from_raw_text(self, corpus: str) -> List[tuple[str, str]]:
        """Clause headings scraped straight from the standard's text.

        Numbered headings win; annex/article headings are used only when the
        document has no numbered ones, mirroring _clauses_from_index.
        """
        numbered: dict[str, str] = {}
        other: dict[str, str] = {}
        heading = re.compile(
            r"(?:^|\n)\s*("
            r"\d{1,2}(?:\.\d{1,3}){0,3}"
            r"|(?:Annex|ANNEX|Article|Section)\s+[A-Z0-9]{1,6}"
            r")[.)]?\s+([^\n]{3,120})"
        )
        for m in heading.finditer(corpus or ""):
            ref = self._dedupe_repeat(m.group(1))
            title = self._dedupe_repeat(m.group(2)).strip(" .:-—–")
            if not ref or len(ref) > 24:
                continue
            # A "heading" whose text runs on like prose is a sentence, not a title.
            if len(title.split()) > 14:
                continue
            bucket = numbered if re.match(r"^\d", ref) else other
            if ref not in bucket or len(title) > len(bucket[ref]):
                bucket[ref] = title
        selected = numbered or other
        if not selected:
            return []
        ordered = sorted(selected.items(), key=lambda kv: self._clause_sort_key(kv[0]))
        return [(r, t) for r, t in ordered]

    async def _derive_clauses(
        self,
        company_id: str,
        iso_document_id: str,
        iso_standard: str,
    ) -> List[tuple[str, str]]:
        """Clause list for the standard the user actually selected.

        Reads the indexed text of `iso_document_id` and recovers its clause
        structure. There is deliberately no ISO 9001 fallback: the product compares
        product documents against the standard picked in the Standards & Regulations
        Portal, so substituting a different standard's clauses would produce a
        confident, wrong audit. If the structure cannot be recovered we raise, and
        the evaluation is reported as FAILED with an actionable message.
        """
        cache_key = (company_id, iso_document_id)
        # Always re-read the exact source on every assessment. A document can be
        # re-extracted under the same ID; a process-wide ID-only cache would assess
        # stale requirements even when the new document version was validated.
        structured = await _fetch_structured_extraction(company_id, iso_document_id)
        records = _structured_clause_records(structured)
        if records:
            quality = _validate_standard_records_for_compliance(records)
            for record in records:
                record.standard_quality_flags["complianceStandardQuality"] = quality
            self._clause_records_cache[cache_key] = {r.ref: r for r in records}
            ordered = sorted(records, key=lambda r: self._clause_sort_key(r.ref))
            clauses = [(r.ref, r.title) for r in ordered]
            logger.info(
                "Derived %d clause(s) for %s (doc %s) directly from the Standards Portal "
                "extraction (%d with pre-extracted requirements)",
                len(clauses), iso_standard, iso_document_id,
                sum(1 for r in records if r.requirements),
            )
            self._clause_cache[cache_key] = clauses
            return clauses

        raise RuntimeError(
            f"The selected standard '{iso_standard}' has no usable structured extraction. "
            "Run/finish Standards & Regulations extraction for the exact uploaded document before starting compliance evaluation."
        )

    async def evaluate(
        self,
        evaluation_id: str,
        company_id: str,
        iso_document_id: str,
        product_document_id: str,
        iso_standard: str,
        evidence_document_ids: Optional[List[str]] = None,
        scoring_method: str = "AI_AUTOMATIC",
        clause_weights: Optional[dict] = None,
        assessment_provisional: bool = False,
    ) -> EvaluateResponse:
        del scoring_method  # reserved for future templates; weights drive scoring when set
        evidence_ids = evidence_document_ids or [product_document_id]
        product_snapshot = await _fetch_product_snapshot(company_id, product_document_id, evidence_ids)
        if product_snapshot is None or not product_snapshot.facts:
            logger.warning("No usable structured product extraction for %s; ambiguous rules will rely on RAG evidence and may require review.", product_document_id)
        # Clauses come from the standard the user selected, not a hardcoded list.
        clauses = await self._derive_clauses(company_id, iso_document_id, iso_standard)
        sem = asyncio.Semaphore(CLAUSE_CONCURRENCY)

        bus = get_event_bus()
        try:
            await bus.publish(
                evaluation_id,
                "started",
                iso_standard=iso_standard,
                iso_document_id=iso_document_id,
                product_document_id=product_document_id,
                evidence_document_ids=evidence_ids,
                total_clauses=len(clauses),
            )
        except Exception:
            logger.exception("event_bus publish 'started' failed")

        # Each clause yields one row per requirement. Never allow one hanging/cancelled
        # task to cancel the entire evaluation; a clause-level timeout is an
        # inconclusive engine result, not a failed audit.
        async def _one_safe(clause_id: str, clause_title: str = "") -> List[ClauseResult]:
            # Queue for a clause slot before beginning the wall-clock timeout. Waiting
            # for another clause must never consume the clause's evaluation budget.
            await sem.acquire()
            clause_record = self._clause_records_cache.get((company_id, iso_document_id), {}).get(clause_id)
            clause_timeout = _clause_timeout_for_requirement_count(
                clause_record.requirements if clause_record is not None else 0,
            )
            try:
                rows = await asyncio.wait_for(
                    self._eval_clause(
                        evaluation_id, company_id, clause_id, iso_document_id, evidence_ids,
                        clause_record=clause_record,
                        product_snapshot=product_snapshot,
                    ),
                    timeout=clause_timeout,
                )
                if clause_title:
                    for row in rows:
                        row.clause_title = clause_title
                return rows
            except asyncio.CancelledError:
                raise
            except Exception as exc:
                logger.exception("Clause %s hard-failed outside clause handler: %s", clause_id, exc)
                try:
                    await bus.publish(evaluation_id, "clause_failed", clause_reference=clause_id, error=str(exc)[:300])
                except Exception:
                    logger.exception("event_bus publish hard clause_failed failed")
                return [ClauseResult(
                    clause_reference=clause_id, clause_title=clause_title,
                    clause_summary="", clause_text_excerpt="", status=VERDICT_INCONCLUSIVE,
                    justification=f"INCONCLUSIVE: clause timed out or failed safely. {type(exc).__name__}: {exc}"[:500],
                    verdict=VERDICT_INCONCLUSIVE, confidence=0.0, supporting_evidence=[], gaps=[],
                    suggestions=["Review this clause manually or re-run the evaluation."],
                    legacy_score=0.0, legacy_status="INCONCLUSIVE", reasoning=str(exc)[:500],
                    requirement_elements=[], evidence_assessment=[],
                    applicability={"scope": "REVIEW", "kind": "ENGINE_FAILURE", "confidence": 0.0, "reason": "The clause did not complete."},
                    inconclusive_reason=f"{type(exc).__name__}: {exc}"[:500],
                )]
            finally:
                sem.release()

        per_clause = await asyncio.gather(
            *[_one_safe(cid, title) for cid, title in clauses],
            return_exceptions=False,
        )
        results: List[ClauseResult] = [row for rows in per_clause for row in rows]

        inconclusive = [r for r in results if (r.status or "") == VERDICT_INCONCLUSIVE]
        if inconclusive and len(inconclusive) == len(results):
            # Nothing was assessable: surface a failed evaluation instead of
            # persisting a meaningless 0% that reads as a real audit verdict.
            raise RuntimeError(
                f"All {len(clauses)} clauses failed to evaluate. "
                f"the evaluation could not be performed. "
                f"First error: {inconclusive[0].reasoning or 'unknown'}"
            )
        if inconclusive:
            logger.warning(
                "%d/%d requirement rows inconclusive: excluded from the conformity score",
                len(inconclusive),
                len(results),
            )

        # Add deterministic, client-facing explanations once per result. Canonical
        # statuses (including internal N/A) remain unchanged for scoring and legacy
        # consumers; the UI/exports use these explanation fields instead of raw codes.
        for row in results:
            presentation = build_clause_presentation(
                status=row.status,
                clause_reference=row.clause_reference,
                clause_title=row.clause_title,
                clause_summary=row.clause_summary,
                justification=row.justification,
                inconclusive_reason=row.inconclusive_reason,
                applicability=row.applicability,
                product_standard_comparison=row.product_standard_comparison,
                evidence_coverage=row.evidence_coverage,
                gaps=row.gaps,
                suggestions=row.suggestions,
                supporting_evidence=row.supporting_evidence,
                missing_information=row.missing_information,
                model_recommended_action=row.recommended_action,
            )
            row.display_status = presentation["display_status"]
            row.status_explanation = presentation["status_explanation"]
            row.recommended_action = presentation["recommended_action"]
            row.missing_information = presentation["missing_information"]

        status_counts = {
            STATUS_PASS: sum(1 for r in results if (r.status or "") == STATUS_PASS),
            STATUS_FAIL: sum(1 for r in results if (r.status or "") == STATUS_FAIL),
            STATUS_MISSING_INFO: sum(1 for r in results if (r.status or "") == STATUS_MISSING_INFO),
            STATUS_NA: sum(1 for r in results if (r.status or "") == STATUS_NA),
            VERDICT_INCONCLUSIVE: sum(1 for r in results if (r.status or "") == VERDICT_INCONCLUSIVE),
        }
        logger.info(
            "Compliance evaluation %s result distribution: total=%d PASS=%d FAIL=%d MISSING_INFO=%d N/A=%d INCONCLUSIVE=%d",
            evaluation_id,
            len(results),
            status_counts[STATUS_PASS],
            status_counts[STATUS_FAIL],
            status_counts[STATUS_MISSING_INFO],
            status_counts[STATUS_NA],
            status_counts[VERDICT_INCONCLUSIVE],
        )
        conformity_score = None if assessment_provisional else _weighted_overall(results, clause_weights)
        try:
            await bus.publish(
                evaluation_id,
                "summary_started",
                conformity_score=conformity_score,
                result_count=len(results),
                status_counts=status_counts,
            )
        except Exception:
            logger.exception("event_bus publish 'summary_started' failed")

        summary = await self._summary(conformity_score, results, iso_standard)

        # Validate the complete response before signaling the stream as done.
        # Previously `done` was emitted before Pydantic response validation and
        # before the HTTP response was serialized. A late serialization/validation
        # error could therefore show ~99% in the UI, emit `done`, and then make the
        # evaluation-service mark the database row FAILED.
        response = EvaluateResponse(
            evaluation_id=evaluation_id,
            conformity_score=conformity_score,
            summary=summary,
            results=results,
        )
        try:
            await bus.publish(
                evaluation_id,
                "engine_complete",
                conformity_score=conformity_score,
                summary=summary,
                result_count=len(results),
                status_counts=status_counts,
            )
            await bus.close(evaluation_id)
        except Exception:
            logger.exception("event_bus publish/close 'engine_complete' failed")

        return response

    @staticmethod
    def _evidence_relevance(req_text: str, evidence: EvidenceExcerpt) -> float:
        """Estimate whether an evidence excerpt materially addresses a requirement."""
        req = set(re.findall(r"[\wÀ-ÿµ°]{3,}", (req_text or "").lower()))
        ev = set(re.findall(r"[\wÀ-ÿµ°]{3,}", (evidence.excerpt or "").lower()))
        stop = {
            "shall", "must", "should", "where", "when", "which", "with", "from",
            "this", "that", "their", "there", "into", "only", "than", "required",
            "equipment", "product", "device", "machine", "the", "and", "for", "not",
        }
        req -= stop
        ev -= stop
        overlap = len(req & ev) / max(1, min(12, len(req)))
        sim = max(0.0, min(1.0, float(evidence.similarity_score or 0.0)))
        # Combine lexical agreement with vector relevance instead of treating either
        # one as sufficient. This is especially important for Product facts, where
        # the fact's extraction confidence is intentionally kept separate from its
        # relevance to the current requirement.
        return max(0.65 * overlap + 0.35 * sim, min(overlap, sim + 0.15))

    @staticmethod
    def _select_requirement_evidence(requirement_text: str, supporting: List[EvidenceExcerpt], limit: int = 5) -> list[int]:
        scored = [
            (EvaluationEngine._evidence_relevance(requirement_text, ev), idx)
            for idx, ev in enumerate(supporting)
        ]
        scored.sort(reverse=True)
        return [idx for score, idx in scored if score >= 0.32][:limit]

    @staticmethod
    def _render_evidence_items_with_indexes(
        supporting: List[EvidenceExcerpt], indexes: List[int], max_chars: int = 6500,
    ) -> tuple[str, List[int]]:
        """Render only complete, numbered evidence records and return their global indexes.

        The previous implementation sliced the final concatenated string, while the
        caller kept a map for every requested chunk. If the slice removed later lines,
        a model reference could accidentally resolve to a chunk it had never seen.
        This version reserves only the text that actually appears in the prompt.
        """
        lines: list[str] = []
        rendered_global_indexes: List[int] = []
        used_chars = 0
        max_chars = max(64, int(max_chars))
        for global_idx in indexes:
            if not 0 <= global_idx < len(supporting):
                continue
            item = supporting[global_idx]
            source = str(item.source_label or item.document_id or "Product evidence")
            prefix = f'[{len(lines) + 1}] source="{source}" :: '
            excerpt = _clean_excerpt(item.excerpt)[:900]
            separator_chars = 1 if lines else 0
            available = max_chars - used_chars - separator_chars
            if available <= len(prefix) + 8:
                break
            line = prefix + excerpt
            if len(line) > available:
                # Keep the source label and a visible excerpt fragment; never create a
                # hidden evidence index for an item whose line was omitted entirely.
                line = prefix + excerpt[:max(0, available - len(prefix) - 1)].rstrip() + "…"
                lines.append(line)
                rendered_global_indexes.append(global_idx)
                break
            lines.append(line)
            rendered_global_indexes.append(global_idx)
            used_chars += len(line) + separator_chars
        if not lines:
            return "(no relevant evidence retrieved)", []
        return "\n".join(lines), rendered_global_indexes

    @staticmethod
    def _render_evidence_items(supporting: List[EvidenceExcerpt], indexes: List[int], max_chars: int = 6500) -> str:
        block, _rendered_indexes = EvaluationEngine._render_evidence_items_with_indexes(
            supporting, indexes, max_chars=max_chars,
        )
        return block

    async def _retrieve_evidence(
        self,
        evaluation_id: str,
        company_id: str,
        clause_id: str,
        evidence_ids: List[str],
        queries: List[str],
        product_snapshot: Optional[ProductSnapshot] = None,
    ) -> tuple[str, List[EvidenceExcerpt], List[dict]]:
        """Fast, bounded multi-query retrieval.

        Vector searches run concurrently with a small dedicated semaphore. This
        avoids the previous sequential 25s-per-query path that could spend minutes
        waiting for evidence before the LLM was even contacted.
        """
        bus = get_event_bus()
        try:
            await bus.publish(evaluation_id, "clause_retrieving", clause_reference=clause_id, source="EVIDENCE")
        except Exception:
            logger.exception("event_bus publish 'clause_retrieving' (evidence) failed")

        search_timeout = max(3.0, min(float(getattr(settings, "COMPLIANCE_SEARCH_TIMEOUT_SEC", DEFAULT_SEARCH_TIMEOUT_SEC) or DEFAULT_SEARCH_TIMEOUT_SEC), 20.0))
        search_concurrency = max(1, min(int(getattr(settings, "COMPLIANCE_SEARCH_CONCURRENCY", DEFAULT_SEARCH_CONCURRENCY) or DEFAULT_SEARCH_CONCURRENCY), 8))
        unique_queries: list[str] = []
        seen_queries: set[str] = set()
        for q in queries:
            q = re.sub(r"\s+", " ", str(q or "")).strip()
            if not q:
                continue
            key = q.lower()
            if key in seen_queries:
                continue
            seen_queries.add(key)
            unique_queries.append(q[:420])
            # Keep every distinct requirement query; batching below controls concurrency.

        query_sem = asyncio.Semaphore(search_concurrency)

        async def search_one(q: str):
            async with query_sem:
                try:
                    return (await asyncio.wait_for(
                        self.ingestion.search(q, company_id, top_k=6, document_ids_in=evidence_ids),
                        timeout=search_timeout,
                    ), None)
                except asyncio.TimeoutError:
                    logger.warning("Evidence search timed out for clause %s query=%r", clause_id, q[:100])
                    return ([], "Evidence search timed out")
                except Exception as exc:
                    logger.warning("Evidence search failed for clause %s query=%r: %s", clause_id, q[:100], exc)
                    return ([], f"Evidence search failed: {type(exc).__name__}")

        # Batch request scheduling without silently discarding later requirements.
        searched = []
        for start in range(0, len(unique_queries), 16):
            searched.extend(await asyncio.gather(*(search_one(q) for q in unique_queries[start:start + 16]), return_exceptions=False))
        errors = [error for _, error in searched if error]
        if errors:
            raise EvidenceRetrievalError(f"{len(errors)} evidence search(es) failed or timed out; retry the assessment.")
        search_results = [items for items, _ in searched]
        # Keep retrieval query diversity. A single high-scoring query used to occupy
        # the entire final evidence window, which could leave other requirements in a
        # multi-requirement clause with no source chunk and inflate MISSING_INFO.
        # Round-robin across ranked query results improves recall while retaining a
        # evidence window proportional to the number of distinct queries.
        max_chunks = max(4, int(getattr(settings, "COMPLIANCE_MAX_EVIDENCE_CHUNKS", DEFAULT_MAX_EVIDENCE_CHUNKS) or DEFAULT_MAX_EVIDENCE_CHUNKS), len(unique_queries) * 2)
        ranked_results = [
            sorted(list(chunks or []), key=lambda c: float(getattr(c, "score", 0.0) or 0.0), reverse=True)
            for chunks in search_results
        ]
        all_chunks = []
        seen: set[str] = set()
        depth = 0
        made_progress = True
        while len(all_chunks) < max_chunks and made_progress:
            made_progress = False
            for query_chunks in ranked_results:
                if depth >= len(query_chunks):
                    continue
                # Advance past duplicates or rejected chunks as well. Otherwise a
                # top-ranked invalid result in every query hides valid lower hits.
                made_progress = True
                chunk = query_chunks[depth]
                meta = chunk.metadata or {}
                doc_id = str(meta.get("document_id", ""))
                if doc_id not in evidence_ids:
                    logger.warning("Discarding retrieved chunk outside the validated evidence set")
                    continue
                txt = _clean_excerpt(str(meta.get("text") or "")[:900])
                key = f"{doc_id}:{txt.casefold()}"
                if txt and key not in seen:
                    seen.add(key)
                    all_chunks.append(chunk)
                    if len(all_chunks) >= max_chunks:
                        break
            depth += 1
        prod_m = all_chunks

        evidence_chunks_lines: List[str] = []
        supporting: List[EvidenceExcerpt] = []
        evidence_payload: List[dict] = []

        if product_snapshot is not None:
            ranked_by_key: dict[str, tuple[float, Any]] = {}
            for query in unique_queries:
                for item in rank_product_facts({"text": query}, product_snapshot, limit=6):
                    fact = item["fact"]
                    key = f"{fact.field}|{fact.value}|{fact.document_id}"
                    score = float(item.get("matchScore", 0.0) or 0.0)
                    previous = ranked_by_key.get(key)
                    if previous is None or score > previous[0]:
                        ranked_by_key[key] = (score, fact)
            chosen = sorted(ranked_by_key.values(), key=lambda pair: pair[0], reverse=True)[:12]
            for idx, (score, fact) in enumerate(chosen, start=1):
                # A profile assertion without an actual source excerpt is useful
                # context, but cannot stand in for evidence selected by the model.
                if str(getattr(fact, "document_id", "") or "") not in evidence_ids or not getattr(fact, "evidence", None) or getattr(fact, "grounded", None) is False:
                    continue
                source = getattr(fact, "source", None) or "Product extraction"
                page = getattr(fact, "page", None)
                label = f"{source}, p. {page}" if page else str(source)
                doc_id = str(getattr(fact, "document_id", "") or "product")
                exact = getattr(fact, "evidence", None)
                txt = str(exact).strip() if exact else f"{fact.field}: {fact.display}"
                prefix = "[CONFLICTING PRODUCT FACT] " if getattr(fact, "conflict", False) else ""
                excerpt = prefix + _clean_excerpt(txt)[:700]
                evidence_chunks_lines.append(f'[PF{idx}] source="{label}" :: {excerpt}')
                # For Product facts, similarity_score must represent how relevant
                # this fact is to the current requirement query. Fact confidence is
                # a separate quality dimension and must not make an unrelated fact
                # appear relevant enough to pass the evidence gate.
                supporting.append(EvidenceExcerpt(
                    document_id=doc_id, excerpt=excerpt,
                    similarity_score=min(1.0, max(0.0, score)),
                    source_label=label,
                ))
                evidence_payload.append({
                    "document_id": doc_id, "source_label": label, "excerpt": excerpt[:280],
                    "similarity_score": round(min(1.0, max(0.0, score)), 4),
                    "evidence_type": "PRODUCT_FACT", "conflict": bool(getattr(fact, "conflict", False)),
                })

        product_offset = len(supporting)
        for i, match in enumerate(prod_m, start=1):
            meta = match.metadata or {}
            doc_id = meta.get("document_id", "?")
            txt = _clean_excerpt(meta.get("text") or "")[:900]
            if not txt:
                continue
            score = float(getattr(match, "score", 0.0) or 0.0)
            src = meta.get("file_name") or meta.get("source_file") or meta.get("title")
            label = str(src) if src else f"doc {doc_id}"
            try:
                page_no = int(meta.get("page") or 0)
            except (TypeError, ValueError):
                page_no = 0
            cite = f"{label}, p. {page_no}" if page_no else label
            evidence_chunks_lines.append(f'[{product_offset + i}] source="{cite}" :: {txt}')
            supporting.append(EvidenceExcerpt(document_id=str(doc_id), excerpt=txt, similarity_score=score, source_label=cite))
            evidence_payload.append({
                "document_id": str(doc_id), "source_label": cite, "excerpt": txt[:280],
                "similarity_score": round(score, 4), "evidence_type": "DOCUMENT_CHUNK",
            })

        try:
            await bus.publish(evaluation_id, "evidence_found", clause_reference=clause_id, count=len(evidence_payload), excerpts=evidence_payload[:5])
        except Exception:
            logger.exception("event_bus publish 'evidence_found' failed")

        ev_block = "\n".join(evidence_chunks_lines) if evidence_chunks_lines else "(no evidence chunks retrieved)"
        return ev_block[:9000], supporting, evidence_payload

    async def _eval_clause(
        self,
        evaluation_id: str,
        company_id: str,
        clause_id: str,
        iso_doc_id: str,
        evidence_ids: List[str],
        clause_record: Optional[ClauseRecord] = None,
        product_snapshot: Optional[ProductSnapshot] = None,
    ) -> List[ClauseResult]:
        bus = get_event_bus()
        try:
            await bus.publish(evaluation_id, "clause_started", clause_reference=clause_id)
        except Exception:
            logger.exception("event_bus publish 'clause_started' failed")

        if clause_record is not None:
            if not clause_record.requirements:
                # A mandatory clause with zero extracted requirements is NOT a
                # heading. Treat it as an extraction gap so the Product is never
                # incorrectly rewarded/penalised for a clause the Standard Portal
                # failed to decompose. Genuine headings remain N/A.
                if clause_record.standard_quality_flags.get("clauseMandatoryButEmpty"):
                    return [
                        ClauseResult(
                            requirement_id="",
                            clause_reference=clause_record.ref,
                            clause_title=clause_record.title,
                            clause_summary="",
                            clause_text_excerpt=clause_record.text[:1200],
                            status=VERDICT_INCONCLUSIVE,
                            justification="INCONCLUSIVE: the Standards & Regulations extraction marked this clause as mandatory but produced no auditable requirement rows.",
                            verdict=VERDICT_INCONCLUSIVE,
                            confidence=0.0,
                            supporting_evidence=[],
                            gaps=["Standard requirement extraction gap; re-process or manually inspect this clause before assessing conformity."],
                            suggestions=["Re-process the exact Standard/Regulation document or review this clause manually."],
                            legacy_score=0.0,
                            legacy_status="INCONCLUSIVE",
                            reasoning="Mandatory clause without extracted requirements; automatic conformity assessment is blocked.",
                            requirement_elements=[],
                            evidence_assessment=[],
                            decision_source="STANDARD_EXTRACTION_GAP",
                            evidence_coverage="NONE",
                            product_standard_comparison={
                                "version": 4,
                                "coverage": "NONE",
                                "decision": "INCONCLUSIVE",
                                "method": "mandatory_clause_without_requirements",
                                "confidence": 0.0,
                                "standardContext": {"clauseRef": clause_record.ref, "clauseTitle": clause_record.title},
                            },
                        )
                    ]
                # Genuine heading-only clause.
                return [
                    ClauseResult(
                        requirement_id="",
                        clause_reference=clause_record.ref,
                        clause_title=clause_record.title,
                        clause_summary="",
                        clause_text_excerpt=clause_record.text[:1200],
                        status=STATUS_NA,
                        justification="N/A: heading clause, not normative",
                        verdict=_status_to_verdict(STATUS_NA),
                        confidence=1.0,
                        supporting_evidence=[],
                        gaps=[],
                        suggestions=[],
                        legacy_score=0.0,
                        legacy_status="NOT_APPLICABLE",
                        reasoning="No normative requirement was extracted for this clause.",
                        requirement_elements=[],
                        evidence_assessment=[],
                        decision_source="SCOPE_GATE",
                        evidence_coverage="NOT_APPLICABLE",
                        product_standard_comparison={"version": 4, "decision": "N/A", "method": "heading_only_clause", "coverage": "NOT_APPLICABLE", "confidence": 1.0},
                    )
                ]
            return await self._eval_clause_from_record(
                evaluation_id,
                company_id,
                clause_record,
                evidence_ids,
                iso_doc_id=iso_doc_id,
                product_snapshot=product_snapshot,
            )

        return await self._eval_clause_legacy(evaluation_id, company_id, clause_id, iso_doc_id, evidence_ids)

    @staticmethod
    def _comparison_evidence(elements: List[dict[str, Any]]) -> List[EvidenceExcerpt]:
        """Convert deterministic Product↔Requirement comparisons into auditable evidence rows."""
        out: List[EvidenceExcerpt] = []
        seen: set[tuple[str, str]] = set()
        for element in elements or []:
            if not isinstance(element, dict):
                continue
            field = str(element.get("productField") or "").strip()
            observed = str(element.get("observedValue") or "").strip()
            source = str(element.get("source") or "Product extraction").strip()
            evidence = str(element.get("evidence") or "").strip()
            if not field and not evidence and not observed:
                continue
            page = element.get("page")
            label = f"{source}, p. {page}" if page else source
            excerpt = evidence or f"{field}: {observed}" if observed else evidence
            key = (label.lower(), excerpt.lower())
            if key in seen:
                continue
            seen.add(key)
            out.append(EvidenceExcerpt(
                document_id=str(element.get("documentId") or "product"),
                excerpt=excerpt[:1200],
                similarity_score=float(element.get("matchScore") or element.get("confidence") or 0.0),
                source_label=label,
            ))
        return out[:6]

    @staticmethod
    def _fact_evidence(fact: Any) -> List[EvidenceExcerpt]:
        if not fact:
            return []
        source = getattr(fact, "source", None) or "Product extraction"
        page = getattr(fact, "page", None)
        label = f"{source}, p. {page}" if page else str(source)
        doc_id = str(getattr(fact, "document_id", "") or "")
        exact = getattr(fact, "evidence", None)
        excerpt = str(exact).strip() if exact else f"{getattr(fact, 'field', 'Product field')}: {getattr(fact, 'display', getattr(fact, 'value', ''))}"
        return [EvidenceExcerpt(document_id=doc_id or "product", excerpt=excerpt, similarity_score=1.0, source_label=label)]

    @staticmethod
    def _relevant_product_context(requirement: Dict[str, Any], snapshot: Optional[ProductSnapshot]) -> str:
        if not snapshot:
            return "No structured product extraction is available."
        text = str(requirement.get("text") or "").lower()
        tokens = [t for t in re.findall(r"[a-zA-Z]{4,}", text) if t not in {"shall", "must", "required", "where", "following", "provided", "equipment", "product"}]
        picked: List[str] = []
        for fact in snapshot.facts.values():
            ftxt = f"{fact.field} {fact.value}".lower()
            if any(t in ftxt or t in text for t in tokens[:12]):
                picked.append(f"- {fact.field}: {fact.display} (source: {fact.source}{', p. '+str(fact.page) if fact.page else ''})")
            if len(picked) >= 12:
                break
        if not picked:
            for fact in list(snapshot.facts.values())[:12]:
                picked.append(f"- {fact.field}: {fact.display} (source: {fact.source}{', p. '+str(fact.page) if fact.page else ''})")
        return "\n".join(picked) if picked else "No relevant structured product facts were found."

    async def _eval_clause_from_record(
        self,
        evaluation_id: str,
        company_id: str,
        clause_record: ClauseRecord,
        evidence_ids: List[str],
        iso_doc_id: str,
        product_snapshot: Optional[ProductSnapshot] = None,
    ) -> List[ClauseResult]:
        """Judgment-only path: the requirement rows already exist, verbatim and
        pre-classified, from the Standards Portal extraction. The LLM's only job
        here is to decide PASS/FAIL/N/A/MISSING_INFO per requirement against
        retrieved evidence — it never re-discovers or re-splits the requirement.
        """
        bus = get_event_bus()
        clause_started_at = time.monotonic()
        clause_id = clause_record.ref
        requirements = clause_record.requirements

        # First compare the exact requirement extracted by the Standards & Regulations
        # Portal against the Product Management data already available to the engine.
        # This is a read-only comparison layer; it does not modify either upstream flow.
        comparisons_by_index: Dict[int, dict] = {}
        deterministic_rows: Dict[int, ClauseResult] = {}
        ambiguous: List[tuple[int, Dict[str, Any]]] = []
        for i, req in enumerate(requirements, start=1):
            # Read-only enrichment from the exact Standard/Regulation Portal record.
            # The source JSON itself is not modified; this context is carried only
            mapping_conf = float(req.get("_clauseMappingConfidence", 1.0) or 1.0)
            if mapping_conf < 0.38 or str(clause_record.ref).upper() == "UNMAPPED":
                comparisons_by_index[i] = {
                    "version": 4,
                    "requirementId": str(req.get("id") or req.get("requirementId") or req.get("requirement_id") or ""),
                    "clauseRef": clause_record.ref,
                    "standardRequirement": str(req.get("text") or "")[:1200],
                    "coverage": "SCOPE_REVIEW",
                    "decision": "INCONCLUSIVE",
                    "method": "clause_mapping_review",
                    "confidence": mapping_conf,
                    "elements": [],
                    "reason": "The source Standard/Regulation requirement could not be mapped confidently to a normative clause; automatic conformity judgment is blocked.",
                    "applicability": {"scope": "REVIEW", "kind": "CLAUSE_MAPPING_REVIEW", "confidence": mapping_conf, "reason": "Clause mapping is not trustworthy enough for automatic conformity evaluation."},
                }
                deterministic_rows[i] = ClauseResult(
                    requirement_id=str(req.get("id") or req.get("requirementId") or req.get("requirement_id") or ""),
                    clause_reference=clause_record.ref,
                    clause_title=clause_record.title,
                    clause_summary=str(req.get("text") or "")[:300],
                    clause_text_excerpt=str(req.get("text") or "")[:1200],
                    applicable_if=str(req.get("appliesIf") or "").strip(),
                    conditional_clauses="",
                    references=", ".join(req.get("crossReferences") or []) if isinstance(req.get("crossReferences"), list) else "",
                    status=VERDICT_INCONCLUSIVE,
                    justification="INCONCLUSIVE: the requirement-to-clause mapping is not reliable enough for automatic conformity judgment.",
                    verdict=VERDICT_INCONCLUSIVE,
                    confidence=max(0.0, min(1.0, mapping_conf)),
                    supporting_evidence=[],
                    gaps=["Clause mapping requires review."],
                    suggestions=["Verify the requirement's clause/article in the source Standard/Regulation document and re-run the evaluation."],
                    legacy_score=0.0,
                    legacy_status="INCONCLUSIVE",
                    reasoning="Clause mapping quality gate.",
                    requirement_elements=[],
                    evidence_assessment=[],
                    decision_source="STANDARD_MAPPING_GATE",
                    evidence_coverage="NONE",
                    applicability=comparisons_by_index[i]["applicability"],
                    inconclusive_reason="The requirement-to-clause mapping is not reliable enough for automatic conformity judgment.",
                    product_standard_comparison=comparisons_by_index[i],
                )
                continue
            # Read-only enrichment from the exact Standard/Regulation Portal record.
            # The source JSON itself is not modified; this context is carried only
            # into the comparison/audit result so the judge can compare Product data
            # against the clause text that produced the requirement.
            source_context_is_specific = bool(clause_record.standard_quality_flags.get("sourceContextSpecific", True))
            clause_context = clause_record.text if source_context_is_specific else str(req.get("text") or clause_record.text)
            comparison_req = {
                **req,
                # When the source section is a global/ambiguous blob, compare against
                # only this verbatim requirement; never repeat unrelated standard text
                # as if it were the clause-level context.
                "_standardClauseText": str(clause_context or "")[:2200],
                "_standardSectionType": clause_record.section_type,
                "_standardQualityFlags": clause_record.standard_quality_flags,
            }
            comparison = compare_requirement(comparison_req, product_snapshot) if product_snapshot else {
                "version": 1,
                "requirementId": str(req.get("id") or req.get("requirementId") or ""),
                "clauseRef": clause_record.ref,
                "standardRequirement": str(req.get("text") or ""),
                "coverage": "NONE",
                "decision": None,
                "method": "no_product_snapshot",
                "confidence": 0.0,
                "elements": [],
                "reason": "No structured Product extraction is available.",
                "applicability": {"scope": "REVIEW", "kind": "NO_PRODUCT_SNAPSHOT", "confidence": 0.20, "reason": "Product evidence could not be loaded for this evaluation."},
            }
            comparisons_by_index[i] = comparison

            decision = None
            comparison_decision = str(comparison.get("decision") or "").upper()
            if comparison_decision in {STATUS_NA, VERDICT_INCONCLUSIVE}:
                # Scope/grounding gates have priority over every later rule. This
                # prevents an out-of-scope Article from becoming a Product PASS/FAIL.
                decision = {
                    "status": comparison_decision,
                    "confidence": float(comparison.get("confidence", 0.0) or 0.0),
                    "reason": comparison.get("reason") or "Compliance scope/standard-quality gate blocked automatic assessment.",
                }
            elif product_snapshot:
                # The structured Compliance Engine uses the strict, source-aware
                # comparator as the only deterministic authority. The legacy
                # deterministic_check() remains available for backwards-compatible
                # callers/tests, but is intentionally not used here because it can
                # match unrelated numeric Product fields to a requirement.
                if comparison_decision in {STATUS_PASS, STATUS_FAIL} and float(comparison.get("confidence", 0) or 0) >= 0.84:
                    decision = {
                        "status": comparison_decision,
                        "confidence": float(comparison.get("confidence", 0.84)),
                        "reason": comparison.get("reason") or "Direct Product↔Standard/Regulation comparison.",
                    }

            if decision is None:
                ambiguous.append((i, req))
                continue

            sub = req.get("subReference") or req.get("marker")
            ref = clause_record.ref if not sub else f"{clause_record.ref} ({sub})"
            # Deterministic results must expose only the evidence that the strict
            # comparator actually used. Do not fall back to a loosely matched Product
            # fact here, because that can make an unrelated value appear to support a
            # PASS/FAIL decision in the exported result.
            comp_elements = comparison.get("elements") or []
            evidence = self._comparison_evidence(comp_elements)

            status = str(decision["status"])
            deterministic_rows[i] = ClauseResult(
                requirement_id=str(req.get("id") or req.get("requirementId") or req.get("requirement_id") or ""),
                clause_reference=ref,
                clause_title=clause_record.title,
                clause_summary=str(req.get("text") or "")[:300],
                clause_text_excerpt=str(req.get("text") or "")[:1200],
                applicable_if=str(req.get("appliesIf") or "").strip(),
                conditional_clauses="",
                references=", ".join(req.get("crossReferences") or []) if isinstance(req.get("crossReferences"), list) else "",
                status=status,
                justification=f"{status}: {decision['reason']}",
                verdict=_status_to_verdict(status),
                confidence=float(decision.get("confidence", 0.9)),
                supporting_evidence=evidence if status != STATUS_NA else [],
                gaps=[decision["reason"]] if status in (STATUS_FAIL, STATUS_MISSING_INFO, VERDICT_INCONCLUSIVE) else [],
                suggestions=["Manual review required before treating this result as authoritative."] if status == VERDICT_INCONCLUSIVE else [],
                legacy_score=100.0 if status == STATUS_PASS else 0.0,
                legacy_status=(
                    "CONFORMANT" if status == STATUS_PASS
                    else "NOT_SATISFIED" if status == STATUS_FAIL
                    else "MISSING_INFO" if status == STATUS_MISSING_INFO
                    else "NOT_APPLICABLE" if status == STATUS_NA
                    else "INCONCLUSIVE"
                ),
                reasoning="Deterministic Product↔Standard/Regulation comparison; no LLM required.",
                requirement_elements=comp_elements[:8],
                evidence_assessment=[
                    {
                        "source": e.get("source"),
                        "page": e.get("page"),
                        "document_id": e.get("documentId"),
                        "relevance": "high" if e.get("status") == "covered" else "medium",
                        "supports": e.get("status") == "covered",
                        "contradicts": e.get("status") == "contradictory",
                        "notes": e.get("notes") or e.get("comparison") or "",
                    }
                    for e in comp_elements[:8]
                ],
                decision_source="PRODUCT_STANDARD_COMPARISON",
                evidence_coverage=("COMPLETE" if evidence and status in {STATUS_PASS, STATUS_FAIL} else str(comparison.get("coverage") or "NONE")),
                applicability=comparison.get("applicability") if isinstance(comparison.get("applicability"), dict) else None,
                inconclusive_reason=(str(comparison.get("reason") or "") if status == VERDICT_INCONCLUSIVE else ""),
                product_standard_comparison=comparison,
            )

        if not ambiguous:
            return [deterministic_rows[i] for i in range(1, len(requirements) + 1)]

        # Retrieve evidence once for the unresolved requirements, then apply a
        # requirement-level evidence gate.  If neither the Product knowledge base nor
        # the Product evidence documents contain anything materially relevant, there
        # is nothing for an LLM to reason about: return MISSING_INFO directly and save
        # a provider call. This is both more accurate and much cheaper than asking a
        # model to infer from an empty context.
        queries = [str(r.get("text") or "")[:420] for _, r in ambiguous if str(r.get("text") or "").strip()]
        if clause_record.title:
            queries.append(f"{clause_record.ref} {clause_record.title}")
        try:
            ev_block, supporting, _ = await self._retrieve_evidence(
                evaluation_id, company_id, clause_id, evidence_ids, queries, product_snapshot=product_snapshot
            )
        except EvidenceRetrievalError as exc:
            # Keep the deterministic decisions already made and one explicit
            # technical-review row per remaining requirement.
            for original_i, req in ambiguous:
                comparison = comparisons_by_index.get(original_i, {})
                deterministic_rows[original_i] = ClauseResult(
                    requirement_id=str(req.get("id") or req.get("requirementId") or req.get("requirement_id") or ""),
                    clause_reference=clause_id, clause_title=clause_record.title,
                    clause_summary=str(req.get("text") or "")[:300], clause_text_excerpt=str(req.get("text") or "")[:1200],
                    status=VERDICT_INCONCLUSIVE, justification=f"INCONCLUSIVE: {exc}", verdict=VERDICT_INCONCLUSIVE,
                    confidence=0.0, supporting_evidence=[], gaps=[],
                    suggestions=["Retry the evidence search or complete a qualified manual review."],
                    legacy_score=0.0, legacy_status="INCONCLUSIVE", reasoning=str(exc),
                    decision_source="EVIDENCE_SEARCH_ERROR", evidence_coverage="UNKNOWN",
                    applicability=comparison.get("applicability") if isinstance(comparison.get("applicability"), dict) else {},
                    inconclusive_reason=str(exc), product_standard_comparison=comparison,
                )
            return [deterministic_rows[i] for i in range(1, len(requirements) + 1)]

        semantic_ambiguous: list[tuple[int, Dict[str, Any]]] = []
        evidence_indexes_by_requirement: dict[int, list[int]] = {}
        for original_i, req in ambiguous:
            comparison = comparisons_by_index.get(original_i, {})
            relevant_indexes = self._select_requirement_evidence(str(req.get("text") or ""), supporting, limit=4)
            comparison_elements = comparison.get("elements") or []
            strong_comparison_evidence = any(
                isinstance(e, dict)
                and e.get("status") in {"covered", "contradictory"}
                and float(e.get("confidence", 0.0) or 0.0) >= 0.70
                and not e.get("conflict")
                and (e.get("grounded") is True or bool(e.get("sourceVerified")))
                for e in comparison_elements
            )
            if not relevant_indexes and not strong_comparison_evidence:
                reason = (
                    "MISSING_INFO: no relevant, traceable Product fact or Product evidence "
                    "was found for this requirement after targeted retrieval; the engine did "
                    "not call the LLM because there is no evidentiary basis for a conformity judgment."
                )
                sub_ref = req.get("subReference") or req.get("marker")
                req_ref = f"{clause_record.ref} ({sub_ref})" if sub_ref else clause_record.ref
                deterministic_rows[original_i] = ClauseResult(
                    requirement_id=str(req.get("id") or req.get("requirementId") or req.get("requirement_id") or ""),
                    clause_reference=req_ref,
                    clause_title=clause_record.title,
                    clause_summary=str(req.get("text") or "")[:300],
                    clause_text_excerpt=str(req.get("text") or "")[:1200],
                    applicable_if=str(req.get("appliesIf") or "").strip(),
                    conditional_clauses="",
                    references=", ".join(req.get("crossReferences") or []) if isinstance(req.get("crossReferences"), list) else "",
                    status=STATUS_MISSING_INFO,
                    justification=reason,
                    verdict=_status_to_verdict(STATUS_MISSING_INFO),
                    confidence=0.0,  # no conformity judgment was made; do not label evidence absence as confidence
                    supporting_evidence=[],
                    gaps=["No relevant traceable evidence was retrieved for this requirement."],
                    suggestions=["Add or upload the Product document/evidence that demonstrates this requirement, then re-run the evaluation."],
                    legacy_score=0.0,
                    legacy_status="MISSING_INFO",
                    reasoning="Evidence sufficiency gate: semantic judgment skipped because the requirement has no relevant traceable evidence.",
                    requirement_elements=comparison_elements[:8],
                    evidence_assessment=[],
                    decision_source="EVIDENCE_SUFFICIENCY_GATE",
                    evidence_coverage="NONE",
                    applicability=comparison.get("applicability") if isinstance(comparison.get("applicability"), dict) else None,
                    product_standard_comparison={**comparison, "postJudgmentStatus": STATUS_MISSING_INFO, "reconciliation": "LLM skipped: no relevant traceable evidence."},
                )
            else:
                semantic_ambiguous.append((original_i, req))
                evidence_indexes_by_requirement[original_i] = relevant_indexes

        ambiguous = semantic_ambiguous
        if not ambiguous:
            return [deterministic_rows[i] for i in range(1, len(requirements) + 1)]

        try:
            await bus.publish(evaluation_id, "clause_llm_calling", clause_reference=clause_id, evidence_count=len(supporting), ambiguous_requirements=len(ambiguous))
        except Exception:
            logger.exception("event_bus publish 'clause_llm_calling' failed")

        product_context = "Relevant Product facts are included below through requirement-specific retrieval and in each Product↔Standard/Regulation comparison block."
        chain = JUDGE_PROMPT | self.llm

        # Judge in bounded batches rather than one large response. Batches are
        # deliberately processed sequentially within a clause: launching every batch
        # at once caused them to queue behind COMPLIANCE_WORKERS while their timeout
        # clocks were already running. On long clauses, later batches timed out before
        # they even reached the provider. Separate clauses still run concurrently.
        data: Optional[dict] = None
        engine_failure: Optional[str] = None
        combined_judgments: list[dict] = []
        failure_by_position: dict[int, str] = {}
        ambiguous_pos = {original_i: pos for pos, (original_i, _) in enumerate(ambiguous, start=1)}

        # Pack complete requirement records into bounded batches; the helper is
        # directly regression-tested to guarantee no requirement disappears.
        batch_groups = _pack_judge_batches(ambiguous, comparisons_by_index)
        n_batches = len(batch_groups)
        clause_timeout = _clause_timeout_for_requirement_count(requirements)
        # Keep only a small safety margin for the outer clause guard. The budget
        # starts at function entry, so retrieval and prompt preparation count too.
        clause_deadline = clause_started_at + max(30.0, clause_timeout - 10.0)

        async def _judge_batch(batch_no: int, remaining: float):
            batch_pairs = batch_groups[batch_no]
            batch = [req for _, req in batch_pairs]
            if not batch:
                return batch_no, [], "", []
            batch_comparisons = [comparisons_by_index[original_i] for original_i, _ in batch_pairs]
            # Bound each comparison context, not the full concatenated block. The old
            # `batch_block[:4500]` sliced through the six-item prompt and often removed
            # later requirements, even though the model was still asked to judge them.
            batch_block = _build_requirements_block(
                batch,
                batch_comparisons,
                comparison_max_chars=650,
            )
            batch_evidence_indexes: list[int] = []
            seen_batch_evidence: set[int] = set()
            for original_i, _req in batch_pairs:
                for evidence_index in evidence_indexes_by_requirement.get(original_i, []):
                    if evidence_index not in seen_batch_evidence:
                        seen_batch_evidence.add(evidence_index)
                        batch_evidence_indexes.append(evidence_index)
            batch_evidence_indexes = batch_evidence_indexes[:18]
            batch_ev_block, rendered_global_indexes = self._render_evidence_items_with_indexes(
                supporting, batch_evidence_indexes, max_chars=6500,
            )
            try:
                batch_data, batch_error = await asyncio.wait_for(
                    self._judge_with_repair(
                        chain,
                        {
                            "clause_reference": clause_id,
                            "clause_title": clause_record.title,
                            "requirements_block": batch_block,
                            "evidence_chunks": (
                                f"STRUCTURED PRODUCT FACTS:\n{product_context}\n\n"
                                f"REQUIREMENT-SPECIFIC EVIDENCE:\n{batch_ev_block}"
                            )[:12000],
                        },
                        expected_count=len(batch),
                        label=f"structured:{clause_id}:batch{batch_no}",
                    ),
                    timeout=max(1.0, remaining),
                )
            except asyncio.TimeoutError:
                return batch_no, [], "batch semantic evaluation timed out before producing a validated response", []
            except Exception as exc:
                logger.exception("Judge batch %s for clause %s failed", batch_no, clause_id)
                return batch_no, [], f"batch semantic evaluation failed: {type(exc).__name__}: {exc}", []
            if batch_data is None:
                return batch_no, [], batch_error or "semantic evaluator returned invalid or incomplete JSON", []
            return batch_no, batch_data.get("judgments") or [], "", rendered_global_indexes

        for batch_no in range(n_batches):
            batch_pairs = batch_groups[batch_no]
            batch = [req for _, req in batch_pairs]
            remaining = clause_deadline - time.monotonic()
            batches_remaining = n_batches - batch_no
            # Divide remaining time across remaining batches. Without this cap, the
            # first slow provider response could consume the entire clause budget and
            # leave later requirements unattempted even though the engine was healthy.
            batch_budget = remaining / max(1, batches_remaining)
            if remaining <= 1.0:
                reason = "Clause time budget exhausted before this requirement batch could be evaluated; retry the evaluation or complete a qualified manual review."
                for original_i, _req in batch_pairs:
                    position = ambiguous_pos[original_i]
                    failure_by_position[position] = reason
                engine_failure = engine_failure or reason
                # Mark all later batches too; no further provider calls are started
                # after the shared clause deadline has expired.
                for later_no in range(batch_no + 1, n_batches):
                    later_batch = batch_groups[later_no]
                    for original_i, _req in later_batch:
                        position = ambiguous_pos[original_i]
                        failure_by_position[position] = reason
                break

            _batch_no, batch_judgments, batch_error, batch_evidence_indexes = await _judge_batch(
                batch_no, max(1.0, min(remaining, batch_budget))
            )
            if batch_error:
                engine_failure = engine_failure or batch_error
                for original_i, _req in batch_pairs:
                    position = ambiguous_pos[original_i]
                    failure_by_position[position] = batch_error
                continue

            # Salvage valid judgments returned by a partially complete model response,
            # but explicitly mark each omitted/invalid index as an engine failure. It
            # must not be mislabeled as a product evidence gap (MISSING_INFO).
            valid_local: dict[int, dict] = {}
            duplicate_local: set[int] = set()
            for judgment in batch_judgments:
                if not isinstance(judgment, dict) or "requirement_index" not in judgment:
                    continue
                try:
                    local_index = int(judgment["requirement_index"])
                except (TypeError, ValueError):
                    continue
                if 1 <= local_index <= len(batch):
                    if local_index in valid_local:
                        duplicate_local.add(local_index)
                    else:
                        valid_local[local_index] = judgment
            for local_index in range(1, len(batch) + 1):
                original_i = batch_pairs[local_index - 1][0]
                position = ambiguous_pos[original_i]
                judgment = None if local_index in duplicate_local else valid_local.get(local_index)
                if judgment is None:
                    reason = f"The semantic evaluator did not return a valid judgment for requirement {position} in clause {clause_id}; retry this assessment or review it manually."
                    failure_by_position[position] = reason
                    engine_failure = engine_failure or reason
                    continue
                combined_judgments.append({
                    **judgment,
                    "requirement_index": position,
                    "_evidence_global_indexes": list(batch_evidence_indexes),
                })

        data = {"judgments": combined_judgments}
        if not combined_judgments and not engine_failure:
            engine_failure = "semantic evaluator returned no judgments"
        by_index = {}
        for j in (data or {}).get("judgments") or []:
            if isinstance(j, dict) and "requirement_index" in j:
                try:
                    by_index[int(j["requirement_index"])] = j
                except (TypeError, ValueError):
                    continue

        rows: List[ClauseResult] = []
        for i, req in enumerate(requirements, start=1):
            if i in deterministic_rows:
                rows.append(deterministic_rows[i])
                continue
            pos = ambiguous_pos[i]
            j = by_index.get(pos, {})
            row_failure_reason = failure_by_position.get(pos, "")
            if not j and row_failure_reason:
                # The engine didn't complete this judgment. Keep it distinct from a
                # completed assessment that lacks product evidence.
                status = VERDICT_INCONCLUSIVE
                conf = 0.0
            else:
                raw_status = str(j.get("status") or STATUS_MISSING_INFO)
                status = "INCONCLUSIVE" if raw_status.strip().upper() == "INCONCLUSIVE" else _normalise_status(raw_status)
                conf = max(0.0, min(1.0, float(j.get("confidence", 0.5) or 0.0)))
            # Preserve the model's initial judgment so any later evidence/scope gate
            # can invalidate model-proposed missing items or actions that no longer
            # match the final status.
            judge_status = status
            comparison = comparisons_by_index.get(i) or {"coverage": "NONE", "confidence": 0.0, "decision": None, "elements": []}
            raw_refs = j.get("evidence_refs")
            # Semantic judgments are trusted only against evidence references the
            # model actually saw and selected. An out-of-range model reference must
            # be ignored, not reinterpreted as an index into all retrieved evidence.
            # Deterministic comparisons remain independent because they carry their
            # own field-level provenance.
            selected_evidence: List[EvidenceExcerpt] = []
            global_map = j.get("_evidence_global_indexes") if isinstance(j, dict) else None
            indexes = _resolve_evidence_reference_indexes(raw_refs, global_map, len(supporting))
            if indexes:
                selected_evidence = [supporting[ix] for ix in indexes]
            selected_local = set()
            for ref in raw_refs if isinstance(raw_refs, list) else []:
                try:
                    local = int(ref)
                    if _resolve_evidence_reference_indexes([local], global_map, len(supporting)):
                        selected_local.add(local)
                except (TypeError, ValueError):
                    continue
            model_assessment = j.get("evidence_assessment") if isinstance(j.get("evidence_assessment"), list) else []
            llm_assessment = []
            for entry in model_assessment:
                if not isinstance(entry, dict):
                    continue
                try:
                    if int(entry.get("evidence_ref")) in selected_local:
                        llm_assessment.append(entry)
                except (TypeError, ValueError):
                    continue
            max_selected_relevance = max(
                (self._evidence_relevance(str(req.get("text") or ""), ev) for ev in selected_evidence),
                default=0.0,
            )
            if status in {STATUS_PASS, STATUS_FAIL} and max_selected_relevance < 0.38:
                status = STATUS_MISSING_INFO
                conf = min(conf, 0.55)
                relevance_note = (
                    "The selected evidence did not meet the Compliance Engine's independent relevance threshold "
                    f"(max relevance {max_selected_relevance:.2f}); the cited evidence is not sufficiently related to this requirement."
                )
            else:
                relevance_note = ""

            # A semantic PASS/FAIL must explain which selected evidence supports or
            # contradicts the requirement. If the model omits that assessment and the
            # deterministic comparator did not independently prove the same result,
            # the engine keeps the case non-authoritative instead of guessing.
            if status in {STATUS_PASS, STATUS_FAIL}:
                independent_same_decision = (
                    str(comparison.get("decision") or "").upper() == status
                    and str(comparison.get("coverage") or "").upper() == "COMPLETE"
                    and float(comparison.get("confidence", 0.0) or 0.0) >= 0.84
                )
                original_semantic_status = status
                expected_flag = "supports" if original_semantic_status == STATUS_PASS else "contradicts"
                assessment_ok = any(
                    isinstance(a, dict)
                    and str(a.get("relevance") or "").lower() in {"high", "medium"}
                    and bool(a.get(expected_flag))
                    and not bool(a.get("contradicts" if status == STATUS_PASS else "supports"))
                    for a in llm_assessment
                )
                if status == STATUS_PASS and not independent_same_decision:
                    elements = j.get("requirement_elements") if isinstance(j.get("requirement_elements"), list) else []
                    # A multi-part obligation needs traceable coverage for each
                    # reported element, not just one topical evidence excerpt.
                    def element_covered(element: Any) -> bool:
                        if not isinstance(element, dict) or str(element.get("status") or "").lower() != "covered":
                            return False
                        refs = element.get("evidence_refs")
                        if not isinstance(refs, list):
                            return False
                        return any(str(ref).isdigit() and int(ref) in selected_local for ref in refs)
                    assessment_ok = assessment_ok and bool(elements) and all(element_covered(element) for element in elements)
                if not independent_same_decision and not assessment_ok:
                    status = STATUS_MISSING_INFO
                    conf = min(conf, 0.58)
                    assessment_note = (
                        "The semantic model did not provide a traceable evidence assessment that "
                        f"{expected_flag} the {original_semantic_status} decision; conformity is not treated as authoritative."
                    )
                else:
                    assessment_note = ""
            else:
                assessment_note = ""

            status, conf, reconciliation_note = reconcile_llm_judgment(
                status,
                conf,
                comparison,
                len(selected_evidence),
                len(selected_evidence),
                selected_evidence=selected_evidence,
                llm_requirement_elements=j.get("requirement_elements") if isinstance(j.get("requirement_elements"), list) else [],
                llm_evidence_assessment=llm_assessment,
            )
            if assessment_note:
                reconciliation_note = f"{reconciliation_note} {assessment_note}".strip() if reconciliation_note else assessment_note
            if req.get("grounded") is False:
                status = VERDICT_INCONCLUSIVE
                conf = min(conf, 0.30)
                reconciliation_note = "The Standards & Regulations Portal could not ground this requirement in its source text; manual review is required."
            verdict = _status_to_verdict(status)
            justification = str(j.get("justification") or row_failure_reason or "").strip()
            if justification and not justification.upper().startswith(status.upper()):
                justification = f"{status}: {justification}"
            if relevance_note:
                reconciliation_note = f"{reconciliation_note} {relevance_note}".strip() if reconciliation_note else relevance_note
            if reconciliation_note:
                if justification and reconciliation_note.lower() not in justification.lower():
                    justification = f"{justification} {reconciliation_note}"
                elif not justification:
                    justification = reconciliation_note
            if not justification:
                justification = f"{status}: no judgment returned for this requirement."
            if not justification.upper().startswith(status.upper()):
                justification = f"{status}: {justification}"
            if status in {STATUS_PASS, STATUS_FAIL} and not selected_evidence and str(comparison.get("decision") or "").upper() == status:
                selected_evidence = self._comparison_evidence(comparison.get("elements") or [])
            ref = clause_record.ref
            sub = req.get("subReference") or req.get("marker")
            if sub:
                ref = f"{ref} ({sub})"
            model_missing = j.get("missing_information") if isinstance(j.get("missing_information"), list) and status == judge_status == STATUS_MISSING_INFO else []
            model_missing = [str(item).strip()[:500] for item in model_missing if str(item or "").strip()][:6]
            model_action = str(j.get("recommended_action") or "").strip()[:500] if status == judge_status and status in {STATUS_MISSING_INFO, STATUS_FAIL} else ""
            rows.append(
                ClauseResult(
                    requirement_id=str(req.get("id") or req.get("requirementId") or req.get("requirement_id") or ""),
                    clause_reference=ref,
                    clause_title=clause_record.title,
                    clause_summary=str(req.get("text") or "")[:300],
                    clause_text_excerpt=str(req.get("text") or "")[:1200],
                    applicable_if=str(req.get("appliesIf") or "").strip(),
                    conditional_clauses="",
                    references=", ".join(req.get("crossReferences") or []) if isinstance(req.get("crossReferences"), list) else "",
                    status=status,
                    justification=justification,
                    verdict=verdict,
                    confidence=conf,
                    supporting_evidence=[] if status in (STATUS_NA, VERDICT_INCONCLUSIVE) else selected_evidence,
                    gaps=[justification] if status in (STATUS_FAIL, STATUS_MISSING_INFO) else [],
                    suggestions=["Retry semantic assessment or request manual review."] if status == VERDICT_INCONCLUSIVE else [],
                    legacy_score=100.0 if status == STATUS_PASS else 0.0 if status in (STATUS_FAIL, STATUS_MISSING_INFO, VERDICT_INCONCLUSIVE) else 0.0,
                    legacy_status=(
                        "CONFORMANT" if status == STATUS_PASS
                        else "NOT_SATISFIED" if status == STATUS_FAIL
                        else "MISSING_INFO" if status == STATUS_MISSING_INFO
                        else "NOT_APPLICABLE" if status == STATUS_NA
                        else "INCONCLUSIVE"
                    ),
                    reasoning=str((data or {}).get("reasoning") or row_failure_reason or engine_failure or "").strip(),
                    requirement_elements=(j.get("requirement_elements") if isinstance(j.get("requirement_elements"), list) else comparison.get("elements") or [])[:8],
                    evidence_assessment=(j.get("evidence_assessment") if isinstance(j.get("evidence_assessment"), list) else [])[:12],
                    decision_source="HYBRID_PRODUCT_STANDARD_EVIDENCE" if comparison.get("decision") else "EVIDENCE_LLM",
                    evidence_coverage=str(comparison.get("coverage") or ("COMPLETE" if selected_evidence else "NONE")),
                    applicability=comparison.get("applicability") if isinstance(comparison.get("applicability"), dict) else None,
                    inconclusive_reason=(
                        str(row_failure_reason or reconciliation_note or engine_failure or "semantic evaluator did not produce an authoritative decision")[:600]
                        if status == VERDICT_INCONCLUSIVE else ""
                    ),
                    missing_information=model_missing if status == STATUS_MISSING_INFO else [],
                    recommended_action=model_action if status in {STATUS_MISSING_INFO, STATUS_FAIL} else "",
                    product_standard_comparison={
                        **comparison,
                        "postJudgmentStatus": status,
                        "reconciliation": reconciliation_note,
                        "selectedEvidenceCount": len(selected_evidence),
                    },
                )
            )

        counts = ", ".join(f"{s}={sum(1 for r in rows if r.status == s)}" for s in (STATUS_PASS, STATUS_FAIL, STATUS_NA, STATUS_MISSING_INFO, VERDICT_INCONCLUSIVE))
        logger.info("Clause %s → %d requirement(s) [structured]: %s", clause_id, len(rows), counts)

        try:
            await bus.publish(
                evaluation_id, "verdict_emitted", clause_reference=clause_id, clause_title=clause_record.title,
                verdict=rows[0].verdict if rows else VERDICT_INCONCLUSIVE, requirement_count=len(rows),
                confidence=round(rows[0].confidence, 4) if rows else 0.0,
                gaps_count=sum(len(r.gaps) for r in rows), suggestions_count=0,
                gap_preview=(rows[0].gaps[0][:200] if rows and rows[0].gaps else None),
            )
        except Exception:
            logger.exception("event_bus publish 'verdict_emitted' failed")

        return rows

    async def _eval_clause_legacy(
        self,
        evaluation_id: str,
        company_id: str,
        clause_id: str,
        iso_doc_id: str,
        evidence_ids: List[str],
    ) -> List[ClauseResult]:
        """Pre-existing path: standards with no usable structured extraction yet.

        Kept verbatim as a fallback (vector-recovered clause text, LLM splits AND
        judges in one call) so older/degraded standards can still be evaluated —
        just without the consistency guarantee the structured path provides.
        """
        bus = get_event_bus()
        try:
            await bus.publish(
                evaluation_id,
                "clause_retrieving",
                clause_reference=clause_id,
                source="ISO_NORM",
            )
        except Exception:
            logger.exception("event_bus publish 'clause_retrieving' failed")
        # Exact-reference lookup first: the clause's OWN text, not whatever is
        # semantically nearby. Similarity search here used to return neighbouring
        # clauses and cross-references, so the auditor judged the wrong requirement.
        iso_m = []
        try:
            iso_m = await self.ingestion.search(
                f"clause {clause_id}",
                company_id,
                top_k=8,
                filter={"document_id": iso_doc_id, "clause_ref": clause_id},
            )
        except Exception as e:
            logger.warning("Exact clause lookup failed for %s: %s", clause_id, e)
        if not iso_m:
            # Standard indexed before clause-aware ingestion, fall back to similarity.
            iso_m = await self.ingestion.search(
                f"clause {clause_id}",
                company_id,
                top_k=4,
                filter={"document_id": iso_doc_id},
            )
            logger.info("Clause %s: no clause-aligned chunk, used similarity", clause_id)

        search_queries = [
            f"clause {clause_id} requirement",
            f"clause {clause_id} evidence compliance",
            f"{clause_id} audit conformity",
            f"{clause_id} implementation proof",
        ]
        ev_block, supporting, _ = await self._retrieve_evidence(evaluation_id, company_id, clause_id, evidence_ids, search_queries)

        iso_text = "\n".join(
            (m.metadata or {}).get("text", "") for m in iso_m
        ) or "Not found"
        clause_excerpt = (iso_text[:1200] + ("…" if len(iso_text) > 1200 else "")).strip()

        logger.info(
            "Clause %s: iso_chunks=%d [legacy path]",
            clause_id, len(iso_m),
        )

        try:
            await bus.publish(
                evaluation_id,
                "clause_llm_calling",
                clause_reference=clause_id,
                evidence_count=len(supporting),
            )
        except Exception:
            logger.exception("event_bus publish 'clause_llm_calling' failed")

        chain = PROMPT | self.llm
        data = None
        try:
            result = await self._llm_invoke_reliable(
                chain,
                {
                    "clause_reference": clause_id,
                    "standard_excerpt": iso_text[:2500],
                    "evidence_chunks": ev_block[:6000],
                },
                label=f"legacy:{clause_id}",
                attempts=3,
            )
            data = _parse_llm_json(str(result.content))
            valid, error = _validate_llm_response(data)
            if not valid:
                raise ValueError(error)
        except Exception as e:
            logger.warning("Clause %s: semantic assessment unavailable: %s", clause_id, e)
            data = {
                "clause_title": "",
                "reasoning": "The AI service did not return a usable assessment.",
                "evidence_assessment": [],
                "requirements": [
                    {
                        "reference": clause_id,
                        "summary": "",
                        "status": STATUS_MISSING_INFO,
                        "justification": "INCONCLUSIVE: semantic evaluator unavailable; manual review required.",
                        "confidence": 0.0,
                    }
                ],
            }

        clause_title_text = str(data.get("clause_title") or "").strip()
        reasoning_text = str(data.get("reasoning") or "").strip()
        evidence_assessment = list(data.get("evidence_assessment") or [])

        raw_requirements = data.get("requirements")
        if not isinstance(raw_requirements, list) or not raw_requirements:
            # Older/degraded output shape: treat the clause as a single requirement.
            raw_requirements = [
                {
                    "reference": clause_id,
                    "summary": str(data.get("clause_summary") or "").strip(),
                    "status": data.get("status") or data.get("verdict") or STATUS_MISSING_INFO,
                    "justification": reasoning_text,
                    "confidence": data.get("confidence", 0.5),
                }
            ]

        rows: List[ClauseResult] = []
        for item in raw_requirements:
            if not isinstance(item, dict):
                continue
            status = _normalise_status(str(item.get("status") or ""))
            verdict = _status_to_verdict(status)
            conf = float(item.get("confidence", data.get("confidence", 0.5)) or 0.0)
            conf = max(0.0, min(1.0, conf))

            justification = str(item.get("justification") or "").strip()
            # The worksheet convention is "<STATUS>: <rationale>".
            if justification and not justification.upper().startswith(status.upper()):
                justification = f"{status}: {justification}"

            ref = str(item.get("reference") or clause_id).strip() or clause_id
            legacy_score = (
                100.0 if status == STATUS_PASS
                else 0.0 if status == STATUS_FAIL
                else 50.0 if status == STATUS_MISSING_INFO
                else 0.0
            )
            legacy_status = (
                "CONFORMANT" if status == STATUS_PASS
                else "NOT_SATISFIED" if status == STATUS_FAIL
                else "MISSING_INFO" if status == STATUS_MISSING_INFO
                else "NOT_APPLICABLE"
            )

            rows.append(
                ClauseResult(
                    clause_reference=ref,
                    clause_title=clause_title_text,
                    clause_summary=str(item.get("summary") or "").strip(),
                    clause_text_excerpt=clause_excerpt,
                    applicable_if=str(item.get("applicable_if") or "").strip(),
                    conditional_clauses=str(item.get("conditional_clauses") or "").strip(),
                    references=str(item.get("references") or "").strip(),
                    status=status,
                    justification=justification,
                    verdict=verdict,
                    confidence=conf,
                    # N/A rows carry no finding, so they show no evidence or gaps.
                    supporting_evidence=[] if status == STATUS_NA else supporting,
                    gaps=[justification] if status in (STATUS_FAIL, STATUS_MISSING_INFO) else [],
                    suggestions=[],
                    legacy_score=legacy_score,
                    legacy_status=legacy_status,
                    reasoning=reasoning_text,
                    requirement_elements=[],
                    evidence_assessment=evidence_assessment,
                )
            )

        if not rows:
            raise ValueError(f"Clause {clause_id}: no requirement rows produced")

        counts = ", ".join(
            f"{s}={sum(1 for r in rows if r.status == s)}"
            for s in (STATUS_PASS, STATUS_FAIL, STATUS_NA, STATUS_MISSING_INFO)
        )
        logger.info("Clause %s → %d requirement(s) [legacy]: %s", clause_id, len(rows), counts)

        try:
            await bus.publish(
                evaluation_id,
                "verdict_emitted",
                clause_reference=clause_id,
                clause_title=clause_title_text,
                verdict=rows[0].verdict,
                requirement_count=len(rows),
                confidence=round(rows[0].confidence, 4),
                gaps_count=sum(len(r.gaps) for r in rows),
                suggestions_count=0,
                gap_preview=(rows[0].gaps[0][:200] if rows[0].gaps else None),
            )
        except Exception:
            logger.exception("event_bus publish 'verdict_emitted' failed")

        return rows

    async def _summary(self, score: Optional[float], results: list, iso_standard: str) -> str:
        """Build the final summary deterministically.

        The summary must never be able to turn a completed technical evaluation
        into a failed evaluation because a non-essential LLM request timed out.
        """
        def count(status: str) -> int:
            return sum(1 for r in results if (r.status or "") == status)

        n_pass = count(STATUS_PASS)
        n_fail = count(STATUS_FAIL)
        n_na = count(STATUS_NA)
        n_missing = count(STATUS_MISSING_INFO)
        n_inconclusive = count(VERDICT_INCONCLUSIVE)
        n_scope_confirmation = sum(
            1 for r in results
            if (r.status or "") == STATUS_NA and getattr(r, "display_status", "") == "Applicability needs confirmation"
        )
        assessed = n_pass + n_fail + n_missing
        failing_refs = list(dict.fromkeys(r.clause_reference for r in results if (r.status or "") == STATUS_FAIL))[:5]
        missing_refs = list(dict.fromkeys(r.clause_reference for r in results if (r.status or "") == STATUS_MISSING_INFO))[:5]
        comparison_rows = [
            r for r in results
            if isinstance(getattr(r, "product_standard_comparison", None), dict)
            and getattr(r, "product_standard_comparison", {})
        ]
        direct_comparisons = sum(
            1 for r in comparison_rows
            if getattr(r, "decision_source", "") == "PRODUCT_STANDARD_COMPARISON"
            or str(getattr(r, "product_standard_comparison", {}).get("method") or "").startswith("deterministic_product_standard_")
        )
        comparison_conflicts = sum(
            1 for r in comparison_rows
            if str(getattr(r, "product_standard_comparison", {}).get("coverage") or "").upper() == "CONFLICTING"
        )
        comparison_partial = sum(
            1 for r in comparison_rows
            if str(getattr(r, "product_standard_comparison", {}).get("coverage") or "").upper() == "PARTIAL"
        )
        score_text = (f"score {score:.1f}%" if score is not None else
                      "overall score unavailable: no requirement received an assessable decision" if not (n_pass + n_fail + n_missing + n_inconclusive) else
                      "overall score withheld until unresolved items are reviewed")
        parts = [
            f"{iso_standard}: {score_text} across {assessed} assessed requirement(s).",
            f"Conformity supported {n_pass}; requirements not met {n_fail}; evidence needed {n_missing}; "
            f"not-scored rows {n_na} (including {n_scope_confirmation} that need applicability-scope confirmation); "
            f"assessments needing review {n_inconclusive}.",
        ]
        if comparison_rows:
            parts.append(
                f"Product↔Standard/Regulation comparison checked {len(comparison_rows)} requirement(s) directly; "
                f"{direct_comparisons} received deterministic decisions, {comparison_partial} remained partial, and {comparison_conflicts} had conflicting Product sources."
            )
        if failing_refs:
            parts.append("Potential non-conformities requiring reviewer confirmation: " + ", ".join(failing_refs) + ".")
        elif missing_refs:
            parts.append("Unresolved requirements requiring evidence/review: " + ", ".join(missing_refs) + ".")
        else:
            parts.append("No confirmed non-conformity was identified in the assessed requirements.")
        return " ".join(parts)
