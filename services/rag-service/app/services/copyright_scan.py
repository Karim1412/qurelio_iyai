"""
Copyright guardrail: content-level scan.

The upload form already checks the title and filename, but a scanned copy of a
licensed standard saved as ``scan001.pdf`` and titled "Quality manual" passes
that check untouched. This scans the OCR'd text instead, and runs *before*
anything is written to the vector store, so copyrighted material never reaches
Pinecone.

Precision matters more than recall here. A company's own quality manual cites
"ISO 13485" on nearly every page and must NOT be flagged; the reproduced
standard itself carries publisher boilerplate that a manual never does. So a
bare designation is not enough on its own: the scan looks for the boilerplate,
and only treats designations as corroborating evidence.
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Optional

# Only the opening pages carry the copyright/licence front matter, and scanning
# the whole of a 300-page standard costs time for no extra signal.
SCAN_WINDOW_CHARS = 60_000


@dataclass
class CopyrightFinding:
    """One reason the document looks like a licensed standard."""
    rule: str          # short id, e.g. "reproduction_prohibited"
    evidence: str      # the matched text, trimmed for display
    body: Optional[str] = None  # standards body when identifiable


# Publisher boilerplate. Any single hit is decisive: these phrases do not occur
# in a company's own documentation.
STRONG_PATTERNS: list[tuple[str, re.Pattern[str]]] = [
    ("iso_copyright_office", re.compile(r"ISO\s+copyright\s+office", re.I)),
    ("reproduction_prohibited", re.compile(
        r"no\s+part\s+of\s+this\s+publication\s+may\s+be\s+reproduced", re.I)),
    ("reproduction_prohibited", re.compile(
        r"(?:shall|may)\s+not\s+be\s+reproduced(?:\s+or\s+utilized)?", re.I)),
    ("single_user_licence", re.compile(
        r"single[-\s]?user\s+licen[cs]e|licensed\s+to\s+[^\n]{3,60}", re.I)),
    # Resellers (EVS, SIS, …) stamp preview copies with this wording.
    ("preview_watermark", re.compile(r"\bpreview\s+generated\s+by\b", re.I)),
    ("copyright_body", re.compile(
        r"(?:©|\(c\)|copyright)\s*[^\n]{0,20}\b"
        r"(ISO|IEC|CEN|CENELEC|ASTM|ANSI|BSI|DIN|AFNOR|IEEE|UL|AAMI|ISPE|EDQM|USP)\b", re.I)),
    ("all_rights_reserved_body", re.compile(
        r"\b(ISO|IEC|CEN|CENELEC|ASTM|ANSI|BSI|DIN|AFNOR|IEEE|UL|AAMI)\b[^\n]{0,40}"
        r"all\s+rights\s+reserved", re.I)),
    ("reference_number", re.compile(r"Reference\s+number\s*:?\s*(?:ISO|IEC|EN)\b", re.I)),
]

# Corroborating only: a designation repeated many times *and* a copyright token
# somewhere in the window. Neither alone is enough.
DESIGNATION = re.compile(
    r"\b(?:ISO|IEC|EN|ASTM|ANSI|DIN|BS|NF|JIS|IEEE)\s?/?\s?(?:IEC\s?)?\d{3,5}\b", re.I)
COPYRIGHT_TOKEN = re.compile(r"©|\bcopyright\b|\ball\s+rights\s+reserved\b", re.I)

# How many designation hits count as "this is the standard, not a doc citing it".
DESIGNATION_THRESHOLD = 12


def _snippet(text: str, start: int, end: int, pad: int = 40) -> str:
    lo = max(0, start - pad)
    hi = min(len(text), end + pad)
    return " ".join(text[lo:hi].split())[:200]


def scan_for_licensed_content(raw_text: str) -> Optional[CopyrightFinding]:
    """
    Return a finding when the text looks like a reproduced licensed standard,
    or None when it looks like ordinary company documentation.
    """
    if not raw_text:
        return None
    window = raw_text[:SCAN_WINDOW_CHARS]

    for rule, pattern in STRONG_PATTERNS:
        m = pattern.search(window)
        if m:
            body = None
            if m.groups():
                body = next((g for g in m.groups() if g), None)
            return CopyrightFinding(
                rule=rule,
                evidence=_snippet(window, m.start(), m.end()),
                body=body.upper() if body else None,
            )

    hits = DESIGNATION.findall(window)
    if len(hits) >= DESIGNATION_THRESHOLD and COPYRIGHT_TOKEN.search(window):
        m = DESIGNATION.search(window)
        return CopyrightFinding(
            rule="repeated_designation",
            evidence=_snippet(window, m.start(), m.end()) if m else f"{len(hits)} standard references",
        )

    return None


def describe(finding: CopyrightFinding) -> str:
    """Human explanation stored on the document and shown to the Quality Manager."""
    reasons = {
        "iso_copyright_office": "the text names the ISO copyright office",
        "reproduction_prohibited": "the text states it may not be reproduced",
        "single_user_licence": "the text carries a single-user licence statement",
        "preview_watermark": "the text carries a publisher preview watermark",
        "copyright_body": "the text carries a standards body copyright notice",
        "all_rights_reserved_body": "the text reserves all rights to a standards body",
        "reference_number": "the text carries a standards reference number block",
        "repeated_designation": "the text repeats standard designations like a published standard",
    }
    reason = reasons.get(finding.rule, "the text matches a licensed standard pattern")
    body = f" ({finding.body})" if finding.body else ""
    return f"Quarantined: {reason}{body}. Evidence: “{finding.evidence}”"
