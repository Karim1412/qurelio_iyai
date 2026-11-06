"""Deterministic, client-facing explanations for Compliance Engine clause results.

This module does not change conformity decisions or scores. It translates the
engine's internal statuses into actionable language and surfaces known evidence
limitations without inventing missing facts.
"""
from __future__ import annotations

import json
import re
from typing import Any

_STATUS_PREFIX = re.compile(r"^\s*(?:PASS|FAIL|N/?A|MISSING[_ ]INFO|INCONCLUSIVE|SATISFIED|NOT[_ ]SATISFIED)\s*:\s*", re.I)


def _text(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, (str, int, float, bool)):
        return str(value).strip()
    if isinstance(value, (dict, list)):
        try:
            return json.dumps(value, ensure_ascii=False, sort_keys=True)
        except (TypeError, ValueError):
            return ""
    return ""


def _strip_status_prefix(value: Any) -> str:
    text = _text(value)
    return _STATUS_PREFIX.sub("", text).strip()


def _dedupe(values: list[str], limit: int = 6) -> list[str]:
    out: list[str] = []
    seen: set[str] = set()
    for value in values:
        cleaned = re.sub(r"\s+", " ", str(value or "")).strip(" .;\n\t")
        key = cleaned.casefold()
        if cleaned and key not in seen:
            seen.add(key)
            out.append(cleaned[:260])
        if len(out) >= limit:
            break
    return out


def _missing_items(comparison: dict[str, Any], gaps: Any, evidence_coverage: str, supplied_missing: Any = None) -> list[str]:
    messages: list[str] = []
    if isinstance(supplied_missing, list):
        messages.extend(str(item) for item in supplied_missing if str(item or "").strip())
    elements = comparison.get("elements") if isinstance(comparison.get("elements"), list) else []
    for element in elements:
        if not isinstance(element, dict):
            continue
        field = _text(element.get("productField") or element.get("field") or element.get("feature"))
        observed = _text(element.get("observedValue"))
        required = _text(element.get("standardConstraint") or element.get("requiredValue") or element.get("feature"))
        state = _text(element.get("status") or element.get("comparison")).casefold()
        conflict = bool(element.get("conflict")) or state in {"conflict", "conflicting", "contradictory"}
        if conflict:
            label = field or "a product attribute"
            detail = f" Current recorded value: {observed}." if observed else ""
            messages.append(f"Resolve conflicting source information for {label}.{detail}")
        elif state in {"partial", "missing", "unverified", "unknown", "uncertain"} or element.get("grounded") is False:
            label = field or required or "the required product attribute"
            requirement = f" against {required}" if required and required.casefold() != label.casefold() else ""
            observed_text = f" Recorded value: {observed}." if observed else ""
            messages.append(f"Provide traceable evidence for {label}{requirement}; the current record does not fully demonstrate this requirement.{observed_text}")

    if isinstance(gaps, list):
        for gap in gaps:
            cleaned = _strip_status_prefix(gap)
            if cleaned and not any(cleaned.casefold() in x.casefold() or x.casefold() in cleaned.casefold() for x in messages):
                messages.append(cleaned)

    if not messages and evidence_coverage.upper() in {"", "NONE", "NO_EVIDENCE"}:
        messages.append("No relevant, traceable product evidence was linked to this requirement.")
    return _dedupe(messages)


def build_clause_presentation(
    *,
    status: Any,
    clause_reference: Any = "",
    clause_title: Any = "",
    justification: Any = "",
    inconclusive_reason: Any = "",
    applicability: Any = None,
    product_standard_comparison: Any = None,
    evidence_coverage: Any = "",
    gaps: Any = None,
    suggestions: Any = None,
    supporting_evidence: Any = None,
    clause_summary: Any = "",
    missing_information: Any = None,
    model_recommended_action: Any = "",
) -> dict[str, Any]:
    """Return stable fields for UI and exports while preserving the engine status."""
    normalized = _text(status).upper().replace("-", "_").replace(" ", "_")
    if normalized in {"SATISFIED", "CONFORMANT"}:
        normalized = "PASS"
    elif normalized in {"NOT_SATISFIED", "MINOR_NC", "MAJOR_NC", "CRITICAL_NC"}:
        normalized = "FAIL"
    elif normalized in {"PARTIALLY_SATISFIED", "MISSING", "UNKNOWN"}:
        normalized = "MISSING_INFO"
    elif normalized in {"NA", "NOT_APPLICABLE", "NON_APPLICABLE"}:
        normalized = "N/A"

    app = applicability if isinstance(applicability, dict) else {}
    comparison = product_standard_comparison if isinstance(product_standard_comparison, dict) else {}
    scope = _text(app.get("scope")).upper()
    kind = _text(app.get("kind")).upper()
    method = _text(comparison.get("method")).lower()
    if normalized in {"PASS", "FAIL", "MISSING_INFO"}:
        # The per-requirement rationale is the best place for the exact evidence
        # citation. Prefer it over generic comparator metadata when available.
        reason_source = _text(justification) or _text(comparison.get("reason")) or _text(app.get("reason"))
    elif normalized == "INCONCLUSIVE":
        reason_source = _text(inconclusive_reason) or _text(justification) or _text(comparison.get("reason"))
    else:
        reason_source = _text(app.get("reason")) or _text(comparison.get("reason")) or _text(justification)
    reason = _strip_status_prefix(reason_source)
    summary = _text(clause_summary)
    title = _text(clause_title)
    ref = _text(clause_reference)
    heading = f"Clause {ref}" if ref else ""
    if title and title.casefold() not in heading.casefold():
        heading = f"{heading} — {title}".strip(" —") if heading else title
    gaps_list = gaps if isinstance(gaps, list) else []
    coverage = _text(evidence_coverage or comparison.get("coverage"))

    if normalized == "PASS":
        label = "Conformity supported"
        explanation = "The available evidence supports the requirement."
        if reason:
            explanation += f" {reason}"
        action = "Keep the cited evidence linked to the product and confirm it remains current when the product or requirement changes."
        missing: list[str] = []
    elif normalized == "FAIL":
        label = "Requirement not met"
        explanation = "The available evidence indicates that one or more parts of this requirement are not met."
        if reason:
            explanation += f" {reason}"
        action = "Verify the cited contradiction. If confirmed, record a non-conformity and assign corrective action."
        missing = []
    elif normalized == "MISSING_INFO":
        label = "Evidence needed"
        missing = _missing_items(comparison, gaps_list, coverage, missing_information)
        explanation = "The available record does not demonstrate every part of this requirement; this is an evidence gap, not by itself proof of non-conformity."
        if reason:
            explanation += f" {reason}"
        action = "Provide traceable evidence for the items below, resolve conflicting product records, and rerun the evaluation."
        if not missing:
            missing = ["Identify the product record, test result, procedure, certificate or other evidence needed to demonstrate this requirement."]
    elif normalized == "INCONCLUSIVE":
        label = "Assessment needs review"
        explanation = "The engine could not produce a reliable conformity decision for this requirement."
        if reason:
            explanation += f" {reason}"
        action = "Check the source extraction, clause mapping, evidence retrieval and any service error; correct the issue and rerun or complete a qualified manual review."
        missing = []
    elif normalized == "N/A":
        missing = []
        if method == "heading_only_clause" or kind in {"STRUCTURAL_HEADING", "HEADING_ONLY"}:
            label = "Heading only — not scored"
            explanation = "This row represents a clause heading rather than a standalone auditable requirement. No product conformity decision was made for the heading itself."
            action = "No product evidence is required for the heading. If it should contain a normative requirement, correct the standard extraction and rerun the evaluation."
        elif scope == "OUT_OF_SCOPE":
            label = "Outside product scope"
            explanation = reason or "The recorded scope analysis indicates that this requirement is not a product/manufacturer conformity obligation for the current evaluation."
            action = "No product conformity action is indicated for the current scope. Reassess if the product, responsible economic role or target market changes."
        elif "INFORMATIVE" in kind or "INFORMATIVE" in method or "informative" in reason.casefold():
            label = "Informative content"
            explanation = reason or "This source text is informative rather than a mandatory, independently auditable product requirement."
            action = "No conformity action is indicated for this text. Check that the source was correctly classified as informative."
        else:
            label = "Applicability needs confirmation"
            explanation = "The engine returned a not-applicable result, but the record does not contain a sufficiently explicit scope rationale to confirm the exclusion."
            if reason:
                explanation += f" Recorded rationale: {reason}"
            action = "Verify the applicable condition and product scope with the cited source before treating this requirement as excluded."
    else:
        normalized = "INCONCLUSIVE"
        label = "Assessment needs review"
        explanation = "The result did not map to a recognized assessment status, so Qurelio has not treated it as a conformity decision."
        action = "Review the source result and rerun the evaluation."
        missing = []

    # A model-proposed action can be more specific than a generic fallback. Use it
    # only for evidence gaps or failed requirements, bound its length, and preserve
    # the deterministic safe action if the proposal is empty or too short.
    proposed_action = _text(model_recommended_action)
    if normalized in {"FAIL", "MISSING_INFO"} and len(proposed_action) >= 18:
        action = proposed_action[:500]

    # Add the clause identity and a concise requirement context so each row is
    # understandable when exported or viewed outside the surrounding table.
    if heading and label != "Heading only — not scored":
        explanation = f"{heading}: {explanation}"
    if summary and label != "Heading only — not scored" and summary.casefold() not in explanation.casefold():
        concise_summary = re.sub(r"\s+", " ", summary).strip()
        if len(concise_summary) > 420:
            concise_summary = concise_summary[:417].rstrip() + "..."
        if concise_summary:
            explanation += f" Requirement context: {concise_summary}"

    return {
        "display_status": label,
        "status_explanation": explanation[:1800],
        "recommended_action": action,
        "missing_information": missing[:6],
    }
