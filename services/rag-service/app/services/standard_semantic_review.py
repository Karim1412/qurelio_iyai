"""Coverage and response validation for standards requirement extraction.

This module is deliberately provider independent. The model classifies source
passages; it never supplies the requirement wording that we store.
"""
from __future__ import annotations

import re
from typing import Any

from app.services.standard_pipeline import _page_furniture


_SPLIT = re.compile(
    r"(?<=[.!?؟])\s+(?=[^\W_]|\d)|\n(?=\s*(?:[-–—•●▪◦*]|\([A-Za-z0-9]+\)|(?:[A-Za-z]|\d+)[.)])\s+)|\n\s*\n",
    re.UNICODE,
)
_LIST_ITEM = re.compile(r"^(?:[-–—•●▪◦*]|\([A-Za-z0-9]+\)|(?:[A-Za-z]|\d+)[.)])\s+")
_NOISE = re.compile(
    r"^(?:page\s+\d+(?:\s+of\s+\d+)?|©\s*\d{4}.*|all rights reserved[.]?"
    r"|no copying without.*permission.*|copyright\b.*)$", re.I,
)
_KINDS = {"mandatory", "recommended", "conditional", "informative", "non_requirement", "uncertain"}


def _normal(value: Any) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip()


def _source_passage(value: str) -> str:
    lines = [_normal(line) for line in value.splitlines() if _normal(line)]
    # A detected table is one candidate so its headers and rows remain related.
    # Keep row breaks for the model and the requirements view.
    if len(lines) >= 2 and all(" | " in line for line in lines):
        return "\n".join(lines)
    return _normal(value)


def review_candidates(text: str) -> list[str]:
    """Return source passages in order, including sentences without modal verbs.

    No candidate is truncated or deduplicated: identical text in different parts
    of a clause may have a different context. The model is asked to reject notes,
    headings and other non-obligations, rather than an English-only keyword filter
    silently excluding requirements in another language.
    """
    parts = []
    for part in _SPLIT.split(text or ""):
        value = _source_passage(part)
        if len(value) < 3 or _page_furniture(value) or _NOISE.fullmatch(value):
            continue
        parts.append(value)
    candidates = []
    index = 0
    while index < len(parts):
        current = parts[index]
        # A colon followed by enumerated items is one source passage. Keeping
        # the stem, alternatives, exceptions and items together avoids making
        # each alternative an independent mandatory requirement.
        if current.endswith((":", "：")) and index + 1 < len(parts) and _LIST_ITEM.match(parts[index + 1]):
            grouped = [current]
            index += 1
            while index < len(parts):
                if _LIST_ITEM.match(parts[index]):
                    grouped.append(parts[index])
                    index += 1
                elif index + 1 < len(parts) and _LIST_ITEM.match(parts[index + 1]):
                    # A sentence split within an item before the next list marker.
                    grouped.append(parts[index])
                    index += 1
                else:
                    break
            current = " ".join(grouped)
            candidates.append(current)
            continue
        candidates.append(current)
        index += 1
    return candidates


def make_review_jobs(sections: list[Any], max_chars: int = 2200, max_candidates: int = 8) -> list[dict[str, Any]]:
    jobs: list[dict[str, Any]] = []
    for sec in sections:
        # Front matter/definitions can contain real obligations too. Sending
        # their text to the model is safer than dropping a whole section.
        candidates = review_candidates(sec.text)
        start = 0
        part = 0
        while start < len(candidates):
            selected = []
            size = 0
            while start + len(selected) < len(candidates) and len(selected) < max_candidates:
                candidate = candidates[start + len(selected)]
                if selected and size + len(candidate) > max_chars:
                    break
                selected.append(candidate)
                size += len(candidate)
            part += 1
            jobs.append({
                "id": f"section-{sec.order + 1}-part-{part}",
                "order": sec.order,
                "clause": sec.clause_number or f"section-{sec.order + 1}",
                "heading": sec.heading,
                "context": candidates[start - 1] if start else "",
                "candidates": selected,
            })
            start += len(selected)
    return jobs


def group_review_jobs(jobs: list[dict[str, Any]], max_chars: int, max_jobs: int) -> list[list[dict[str, Any]]]:
    groups: list[list[dict[str, Any]]] = []
    group: list[dict[str, Any]] = []
    size = 0
    for job in jobs:
        job_size = sum(map(len, job["candidates"])) + len(job["context"]) + len(job["heading"]) + 150
        if group and (len(group) >= max_jobs or size + job_size > max_chars):
            groups.append(group)
            group, size = [], 0
        group.append(job)
        size += job_size
    if group:
        groups.append(group)
    return groups


def validate_review_response(payload: Any, jobs: list[dict[str, Any]]) -> dict[str, list[dict[str, Any]]]:
    """Reject partial, duplicated or invented IDs instead of calling them done."""
    rows = payload.get("sections") if isinstance(payload, dict) else None
    if not isinstance(rows, list):
        raise ValueError("semantic response is missing sections[]")
    expected = {job["id"]: job for job in jobs}
    actual: dict[str, list[dict[str, Any]]] = {}
    for row in rows:
        if not isinstance(row, dict):
            raise ValueError("semantic response contains an invalid section")
        key = str(row.get("jobId") or "").strip()
        if key not in expected or key in actual:
            raise ValueError("semantic response has an unexpected or duplicated jobId")
        annotations = row.get("annotations")
        if not isinstance(annotations, list):
            raise ValueError(f"semantic response is missing annotations for {key}")
        count = len(expected[key]["candidates"])
        seen = set()
        checked = []
        for ann in annotations:
            if not isinstance(ann, dict):
                raise ValueError(f"invalid annotation in {key}")
            cid = str(ann.get("candidateId") or "").strip()
            if not cid.isdigit() or not 1 <= int(cid) <= count or int(cid) in seen:
                raise ValueError(f"invalid or duplicated candidateId in {key}")
            kind = str(ann.get("type") or "").strip().lower()
            if kind not in _KINDS:
                raise ValueError(f"invalid candidate classification in {key}")
            seen.add(int(cid))
            checked.append({**ann, "candidateId": int(cid), "type": kind})
        if len(seen) != count:
            raise ValueError(f"semantic response omitted candidates for {key}")
        actual[key] = checked
    if set(actual) != set(expected):
        raise ValueError("semantic response omitted one or more sections")
    return actual


def grounded_detail(value: Any, source: str) -> str | None:
    """Accept optional model details only when their wording exists in source."""
    value = _normal(value)
    return value if value and value.casefold() in _normal(source).casefold() else None
