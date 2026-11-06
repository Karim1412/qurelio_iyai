"""Strict scope and input-quality gates for product conformity evaluation.

This module is intentionally read-only and sits inside the Compliance Engine.  It
consumes the already extracted Standard/Regulation requirement and decides whether
that requirement is safe to evaluate against a Product.  It does NOT alter Product
Management or the Standards/Regulations extraction pipeline.
"""
from __future__ import annotations

import re
from typing import Any


_VALID_CLAUSE_REF_RE = re.compile(
    r"^(?:(?:\d{1,3}(?:\.\d{1,3}){0,8})|[IVXLC]{1,6}|"
    r"(?:(?:Article|Annex|Section|Clause|Part|Chapter|Schedule)\s+(?:\d{1,3}(?:\.\d{1,3}){0,8}|[A-Z]{1,8}(?:\.\d{1,3}){0,8})))"
    r"(?:\s*\([0-9A-Za-z]{1,3}\))?$",
    re.IGNORECASE,
)
_DATE_REF_RE = re.compile(r"^(?:0?[1-9]|[12]\d|3[01])\.(?:0?[1-9]|1[0-2])\.(?:19|20)\d{2}$")
_DATE_TEXT_RE = re.compile(r"\b(?:0?[1-9]|[12]\d|3[01])\.(?:0?[1-9]|1[0-2])\.(?:19|20)\d{2}\b")
_OJ_PAGE_RE = re.compile(r"\bL\s*\d{1,4}\s*/\s*\d{1,4}\b", re.IGNORECASE)
_NORMATIVE_RE = re.compile(
    r"\b(?:shall(?:\s+not)?|must(?:\s+not)?|is\s+required\s+to|are\s+required\s+to|"
    r"is\s+prohibited\s+to|are\s+prohibited\s+to|doit|doivent|est\s+tenu(?:e)?\s+de|"
    r"sont\s+tenus\s+de|ne\s+doit\s+pas|may\s+not|deve|devono|debe|deben|"
    r"muss|müssen|darf\s+nicht|vietato)\b|يجب|يتعين|يلتزم|يحظر|لا\s+يجوز",
    re.IGNORECASE,
)
_RECOMMENDED_RE = re.compile(r"\bshould(?:\s+not)?\b|\bdevrait\b|\bdevraient\b", re.IGNORECASE)
_CONTEXT_ONLY_RE = re.compile(
    r"^(?:whereas\b|having\s+regard\s+to\b|considering\b|taking\s+into\s+account\b|"
    r"it\s+is\s+(?:appropriate|necessary|important)\s+to\b)",
    re.IGNORECASE,
)
_NON_NORMATIVE_DECLARATIVE_RE = re.compile(
    r"^(?:this\s+(?:directive|regulation|standard|part|document)\s+"
    r"(?:establishes|sets\s+out|specifies|describes|provides|defines|lays\s+down)\b|"
    r"this\s+(?:section|clause)\s+(?:describes|provides|contains)\b)",
    re.IGNORECASE,
)

# Actors that are explicitly outside a product/manufacturer conformity assessment.
_OUT_OF_SCOPE_ACTORS: tuple[tuple[str, re.Pattern[str]], ...] = (
    ("MEMBER_STATE", re.compile(r"\bmember\s+states?\b", re.IGNORECASE)),
    ("EUROPEAN_COMMISSION", re.compile(r"\b(?:the\s+)?(?:european\s+)?commission\b", re.IGNORECASE)),
    ("CONFORMITY_ASSESSMENT_BODY", re.compile(r"\bconformity\s+assessment\s+bodies?\b", re.IGNORECASE)),
    ("NOTIFIED_BODY", re.compile(r"\bnotified\s+bodies?\b", re.IGNORECASE)),
    ("MARKET_SURVEILLANCE", re.compile(r"\bmarket\s+surveillance\s+(?:authorit(?:y|ies)|authorities|body|bodies)\b", re.IGNORECASE)),
    ("COMPETENT_AUTHORITY", re.compile(r"\bcompetent\s+authorit(?:y|ies)\b", re.IGNORECASE)),
    ("STANDARDISATION_ORGANISATION", re.compile(r"\b(?:european\s+)?standardisation\s+organisations?\b", re.IGNORECASE)),
    ("IMPORTER", re.compile(r"\bimporters?\b", re.IGNORECASE)),
    ("DISTRIBUTOR", re.compile(r"\bdistributors?\b", re.IGNORECASE)),
    ("CUSTOMS", re.compile(r"\bcustoms\b", re.IGNORECASE)),
    ("AUTHORIZED_REPRESENTATIVE", re.compile(r"\bauthorized\s+representatives?\b|\bauthorized\s+representative\b", re.IGNORECASE)),
    ("DESIGNATED_AUTHORITY", re.compile(r"\b(?:designated|competent)\s+authorit(?:y|ies)\b", re.IGNORECASE)),
)
_IN_SCOPE_ACTORS: tuple[tuple[str, re.Pattern[str]], ...] = (
    ("MANUFACTURER", re.compile(r"\bmanufacturers?\b", re.IGNORECASE)),
    ("PRODUCT", re.compile(r"\b(?:apparatus|equipment|device|product|machinery|machine|system|installation|component|sub-assembly|assembly|material)\b", re.IGNORECASE)),
)


def _norm(value: Any) -> str:
    return re.sub(r"\s+", " ", str(value or "").strip())


def clause_reference_quality(ref: Any) -> dict[str, Any]:
    """Validate a clause/article reference without assuming a particular standard."""
    value = _norm(ref)
    if not value:
        return {"valid": False, "kind": "MISSING", "reason": "The requirement has no clause/article reference."}
    if _DATE_REF_RE.fullmatch(value):
        return {
            "valid": False,
            "kind": "DATE_METADATA",
            "reason": "The reference is a calendar date, not a normative clause/article identifier.",
        }
    if _OJ_PAGE_RE.search(value) or _DATE_TEXT_RE.search(value):
        return {
            "valid": False,
            "kind": "DOCUMENT_METADATA",
            "reason": "The reference contains Official Journal/page/date metadata rather than a normative clause identifier.",
        }
    if not _VALID_CLAUSE_REF_RE.fullmatch(value):
        return {
            "valid": False,
            "kind": "UNRECOGNIZED",
            "reason": "The reference format is not a recognized Article/Annex/numbered-clause identifier.",
        }
    return {"valid": True, "kind": "NORMATIVE_REFERENCE", "reason": "Reference format is plausible."}


def _subject_region(text: str) -> str:
    """Return the likely grammatical subject area before the first normative modal."""
    m = _NORMATIVE_RE.search(text or "")
    if m:
        return (text or "")[: m.start()]
    # If no modal exists, the whole sentence is only a weak scope signal.
    return (text or "")[:280]


def requirement_scope(requirement: dict[str, Any], *, clause_ref: str = "", clause_title: str = "", clause_text: str = "", section_type: str = "") -> dict[str, Any]:
    """Return a strict applicability decision for a product-level conformity run.

    Outcomes:
      * IN_SCOPE  -> safe to evaluate against the Product.
      * OUT_OF_SCOPE -> deterministically not a Product conformity obligation.
      * REVIEW -> potentially relevant, but the engine must not auto-decide.
    """
    text = _norm(requirement.get("text"))
    rtype = _norm(requirement.get("type") or "mandatory").lower()
    modal = _norm(requirement.get("modalVerb")).lower()
    ref = _norm(clause_ref or requirement.get("clauseRef") or requirement.get("reference"))
    title = _norm(clause_title)
    stype = _norm(section_type).lower()

    if not text:
        return {"scope": "OUT_OF_SCOPE", "kind": "EMPTY", "confidence": 1.0, "reason": "Empty requirement text cannot be evaluated."}

    ref_info = clause_reference_quality(ref)
    if ref_info["kind"] in {"DATE_METADATA", "DOCUMENT_METADATA"}:
        # A date/footer carrying only explanatory prose should be ignored; if it
        # contains a real mandatory modal, stop the evaluation instead of judging a
        # possibly misattributed requirement under a corrupt clause reference.
        if _NORMATIVE_RE.search(text):
            return {"scope": "REVIEW", "kind": "INVALID_CLAUSE_WITH_NORMATIVE_TEXT", "confidence": 0.99, "reason": ref_info["reason"] + " Mandatory wording is present, so the requirement needs clause-mapping review before conformity can be decided."}
        return {"scope": "OUT_OF_SCOPE", "kind": "DOCUMENT_METADATA", "confidence": 1.0, "reason": ref_info["reason"]}
    if ref_info["kind"] == "UNRECOGNIZED":
        if _NORMATIVE_RE.search(text):
            return {
                "scope": "REVIEW",
                "kind": "UNRECOGNIZED_CLAUSE_REFERENCE",
                "confidence": 0.96,
                "reason": ref_info["reason"] + " The requirement contains normative wording, but its clause/article mapping is not trustworthy enough for automatic Product conformity judgment.",
            }
        return {"scope": "OUT_OF_SCOPE", "kind": "STRUCTURAL_NOISE", "confidence": 0.97, "reason": ref_info["reason"]}

    non_normative_sections = {
        "foreword", "preamble", "recital", "recitals", "contents",
        "table_of_contents", "bibliography", "references", "index",
    }
    if stype in non_normative_sections:
        return {"scope": "OUT_OF_SCOPE", "kind": "NON_NORMATIVE_SECTION", "confidence": 0.99, "reason": f"The Portal classified this item as a {stype} section, which is not a product conformity obligation."}

    if rtype in {"informative", "information", "informational", "recommended", "recommendation"}:
        return {"scope": "OUT_OF_SCOPE", "kind": "NON_MANDATORY", "confidence": 0.99, "reason": "This item is informative/recommended and is not an auditable mandatory conformity obligation."}
    if modal and ("should" in modal or "devrait" in modal):
        return {"scope": "OUT_OF_SCOPE", "kind": "NON_MANDATORY", "confidence": 0.99, "reason": "The extracted modal is recommended rather than mandatory; it is excluded from mandatory conformity scoring."}
    if _CONTEXT_ONLY_RE.search(text) and not _NORMATIVE_RE.search(text):
        return {"scope": "OUT_OF_SCOPE", "kind": "CONTEXT_ONLY", "confidence": 0.96, "reason": "The text reads as legislative context/preamble rather than an auditable obligation."}

    # A Product conformity run should only assess normative obligations. A semantic
    # paragraph without a mandatory/restrictive modal is context unless an upstream
    # extraction explicitly classified it as conditional with a normative signal.
    if not _NORMATIVE_RE.search(text):
        if _NON_NORMATIVE_DECLARATIVE_RE.search(text) or _CONTEXT_ONLY_RE.search(text):
            return {
                "scope": "OUT_OF_SCOPE",
                "kind": "NO_NORMATIVE_SIGNAL",
                "confidence": 0.97,
                "reason": "The text is a declarative/context statement about the standard or regulation, not an auditable Product conformity obligation.",
            }
        if rtype in {"mandatory", "requirement", "normative", "conditional"} or modal:
            return {
                "scope": "REVIEW",
                "kind": "NO_NORMATIVE_SIGNAL_IN_MANDATORY_RECORD",
                "confidence": 0.86,
                "reason": "The Standards & Regulations Portal marked this record as mandatory/conditional, but its text has no explicit normative modal; table-fragment or extraction semantics require review before conformity is decided.",
            }
        return {"scope": "OUT_OF_SCOPE", "kind": "NO_NORMATIVE_SIGNAL", "confidence": 0.94, "reason": "No mandatory/restrictive normative signal is present in the requirement text."}

    subject = _subject_region(text)
    title_region = f"{title} {clause_title}".strip()

    # A manufacturer may also be an economic operator. This umbrella term is
    # not evidence that a requirement is outside the selected product's scope.
    if re.search(r"\beconomic\s+operators?\b", subject, re.I):
        return {"scope": "REVIEW", "kind": "ECONOMIC_OPERATOR_ROLE", "confidence": 0.0,
                "reason": "Economic operator can include the manufacturer; confirm the assessed organisation's role and the provision's scope."}

    outside_in_subject = [(name, rx) for name, rx in _OUT_OF_SCOPE_ACTORS if rx.search(subject)]
    inside_in_subject = [(name, rx) for name, rx in _IN_SCOPE_ACTORS if rx.search(subject)]

    outside_names = [name for name, _ in outside_in_subject]
    inside_names = [name for name, _ in inside_in_subject]

    if outside_names and inside_names:
        return {
            "scope": "REVIEW",
            "kind": "MIXED_ACTORS",
            "actor": ",".join(dict.fromkeys(outside_names + inside_names)),
            "confidence": 0.98,
            "reason": "The normative subject contains both in-scope and out-of-scope actors; the engine will not guess which obligation belongs to the Product evaluation.",
        }
    if outside_names:
        return {
            "scope": "OUT_OF_SCOPE",
            "kind": outside_names[0],
            "actor": outside_names[0],
            "confidence": 0.99,
            "reason": f"The requirement is directed to {outside_names[0].replace('_', ' ').lower()}, not to the Product/manufacturer conformity scope being evaluated.",
        }

    # If the title itself clearly names an out-of-scope institution and the sentence
    # has no explicit product/manufacturer subject, require review rather than guess.
    title_outside = [name for name, rx in _OUT_OF_SCOPE_ACTORS if rx.search(title_region)]
    if title_outside and not inside_names:
        return {
            "scope": "REVIEW",
            "kind": "OUT_OF_SCOPE_TITLE_ACTOR",
            "actor": title_outside[0],
            "confidence": 0.90,
            "reason": "Clause title suggests an actor outside the Product evaluation scope; the requirement needs semantic scope confirmation.",
        }

    return {
        "scope": "IN_SCOPE",
        "kind": inside_names[0] if inside_names else "PRODUCT_OR_GENERAL",
        "actor": inside_names[0] if inside_names else "PRODUCT_OR_GENERAL",
        "confidence": 0.94 if inside_names else 0.82,
        "reason": "The requirement has mandatory normative wording and no explicit out-of-scope actor was detected.",
    }
