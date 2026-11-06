#!/usr/bin/env python3
"""Compare exported requirements with a human-annotated JSON reference.

Usage: python scripts/evaluate_standard_extraction.py reference.json export.json
Reference and export can be {"sections": [...]} or a portal export containing
{"extraction": {"sections": [...]}}. Each section has clauseNumber and a
requirements list containing objects with text and type.
"""
from __future__ import annotations

import argparse
import json
import re
from collections import Counter
from pathlib import Path


def _normalize(value: object) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip().casefold()


def _requirements(document: dict) -> Counter:
    body = document.get("extraction", document)
    if not isinstance(body, dict) or not isinstance(body.get("sections"), list):
        raise ValueError("Expected a JSON object with a sections array")
    found = Counter()
    for section in body["sections"]:
        if not isinstance(section, dict):
            continue
        clause = _normalize(section.get("clauseNumber"))
        for req in section.get("requirements") or []:
            if isinstance(req, dict) and _normalize(req.get("text")):
                found[(clause, _normalize(req["text"]), _normalize(req.get("type")))] += 1
    return found


def compare(reference: dict, extraction: dict) -> dict:
    expected, actual = _requirements(reference), _requirements(extraction)
    correct = sum((expected & actual).values())
    missed, extra = expected - actual, actual - expected
    precision = correct / sum(actual.values()) if actual else 0.0
    recall = correct / sum(expected.values()) if expected else 0.0
    return {
        "referenceCount": sum(expected.values()), "extractedCount": sum(actual.values()),
        "exactMatches": correct, "precision": round(precision, 4), "recall": round(recall, 4),
        "f1": round(2 * precision * recall / (precision + recall), 4) if precision + recall else 0.0,
        "missed": [{"clauseNumber": key[0], "text": key[1], "type": key[2], "count": count} for key, count in missed.items()],
        "extraOrDifferent": [{"clauseNumber": key[0], "text": key[1], "type": key[2], "count": count} for key, count in extra.items()],
        "note": "Exact wording, clause and type comparison; meaningful only with a complete, independently reviewed reference.",
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("reference")
    parser.add_argument("extraction")
    args = parser.parse_args()
    reference = json.loads(Path(args.reference).read_text(encoding="utf-8"))
    extraction = json.loads(Path(args.extraction).read_text(encoding="utf-8"))
    print(json.dumps(compare(reference, extraction), ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
