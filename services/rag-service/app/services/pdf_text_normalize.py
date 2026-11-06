"""
Repair PDF text where extractors emit spaces between individual glyphs
(e.g. "C o n t r o l" / "9 . 2 . 1"): common with some IEC/BS EN PDF encodings.
"""
from __future__ import annotations

import re
from typing import Final

# Unlikely in normative text; used only while collapsing intra-line spaces.
_BOUND: Final[str] = " \u2060PDFX\u2060 "

# Single ASCII space between two "word" characters (glyph-split heuristic).
_SPACED_PAIR: Final[re.Pattern[str]] = re.compile(
    r"(?<=[A-Za-z0-9À-ÿ\u00A0-\u024F.]) (?=[A-Za-z0-9À-ÿ\u00A0-\u024F.])"
)


def spaced_glyph_line_score(line: str) -> float:
    """Legacy density metric (single ASCII spaces between alnum); kept for layout/plain comparison."""
    s = line.strip()
    if len(s) < 12:
        return 0.0
    hits = len(_SPACED_PAIR.findall(s))
    return hits / max(len(s), 1)


def _line_needs_glyph_collapse(line: str) -> bool:
    """
    True when the line is mostly single-glyph tokens (e.g. "C o n t r o l" / "9 . 2 . 1").
    Avoids normal prose like "The quick" where only word boundaries match pair heuristics.
    """
    s = line.strip()
    if len(s) < 8:
        return False
    parts = s.split()
    if len(parts) < 5:
        return False
    singles = sum(1 for p in parts if len(p) == 1 and (p.isalnum() or p == "."))
    if singles < 4:
        return False
    return (singles / len(parts)) >= 0.30


def _collapse_spaced_glyphs_line(line: str) -> str:
    if not line.strip():
        return line

    # Do not merge page "51" into clause "9.2": keep space before a dotted subclause anchor.
    _PL_CLAUSE = "\ufdffCLAUSE\ufdff"
    line = re.sub(r"(?<=[0-9])\s+(?=[0-9](?:\s*\.){1,}\s*[0-9])", _PL_CLAUSE, line)

    # Merge spaces between adjacent digits / dots (IEC refs, spaced page numbers, etc.)
    prev = None
    while prev != line:
        prev = line
        line = re.sub(r"(?<=[0-9.])\s+(?=[0-9.])", "", line)

    line = line.replace(_PL_CLAUSE, " ")

    # Keep a real space between number↔word (clause ↔ title, "IEC 60204", etc.)
    line = re.sub(r"(?<=[0-9])\s+(?=[A-Za-zÀ-ÿ\u00A0-\u024F])", _BOUND, line)
    line = re.sub(r"(?<=[A-Za-zÀ-ÿ\u00A0-\u024F])\s+(?=[0-9])", _BOUND, line)

    prev = None
    while prev != line:
        prev = line
        line = re.sub(
            r"(?<=[A-Za-zÀ-ÿ\u00A0-\u024F]) (?=[A-Za-zÀ-ÿ\u00A0-\u024F])",
            "",
            line,
        )

    line = line.replace(_BOUND, " ")

    # TOC dot leaders often survive as ". . . ." or long runs of dots
    line = re.sub(r"(?:\s*\.){6,}\s*", " … ", line)
    line = re.sub(r"\.{8,}", " … ", line)

    line = re.sub(r"[ \t]{2,}", " ", line)
    # Repair punctuation where a glyph-spaced PDF lost the normal word gap.
    # Do not touch decimal numbers or terminal punctuation.
    line = re.sub(r",(?=[A-Za-zÀ-ÿ])", ", ", line)
    line = re.sub(r";(?=[A-Za-zÀ-ÿ])", "; ", line)
    line = re.sub(r":(?=[A-Za-zÀ-ÿ])", ": ", line)
    return line.rstrip()



_COMMON_JOINED_REPAIRS = (
    (r"\bNormativereferences\b", "Normative references"),
    (r"\bInformativereferences\b", "Informative references"),
    (r"\bGeneralrequirements\b", "General requirements"),
    (r"\bGeneralconsiderations\b", "General considerations"),
    (r"\bTermsanddefinitions\b", "Terms and definitions"),
    (r"\bTerms,definitionsandabbreviatedterms\b", "Terms, definitions and abbreviated terms"),
    (r"\bAmbientairtemperature\b", "Ambient air temperature"),
    (r"\bThisEuropeanStandard\b", "This European Standard"),
    (r"\bThisBritishStandard\b", "This British Standard"),
    (r"\bInCENELEC\b", "In CENELEC"),
    (r"\bAnnexZA\b", "Annex ZA"),
    (r"\bAnnexZZA\b", "Annex ZZA"),
    (r"\bAnnexZZB\b", "Annex ZZB"),
    (r"\bControlcircuits\b", "Control circuits"),
    (r"\bDatacommunication\b", "Data communication"),
)


def _repair_common_joined_terms(line: str) -> str:
    for pattern, replacement in _COMMON_JOINED_REPAIRS:
        line = re.sub(pattern, replacement, line, flags=re.I)
    return line

def normalize_pdf_extracted_text(text: str) -> str:
    if not text or not text.strip():
        return text
    out_lines: list[str] = []
    for line in text.splitlines():
        if _line_needs_glyph_collapse(line):
            line = _collapse_spaced_glyphs_line(line)
        line = _repair_common_joined_terms(line)
        out_lines.append(line)
    return "\n".join(out_lines)


def _page_glyph_penalty(page_text: str) -> float:
    """Share of long lines that look glyph-spaced (lower is better)."""
    lines = [ln for ln in page_text.splitlines() if len(ln.strip()) >= 14]
    if not lines:
        return 0.0
    bad = sum(1 for ln in lines if _line_needs_glyph_collapse(ln))
    return bad / len(lines)


def pick_best_pypdf_page_text(page: object) -> str:
    """Prefer plain or layout extract depending on which looks less glyph-split."""
    plain = ""
    layout = ""
    try:
        plain = page.extract_text() or ""
    except Exception:
        plain = ""
    try:
        layout = page.extract_text(extraction_mode="layout") or ""
    except Exception:
        layout = ""

    if not layout.strip():
        return plain
    if not plain.strip():
        return layout

    p_plain = _page_glyph_penalty(plain)
    p_layout = _page_glyph_penalty(layout)
    if p_layout + 0.02 < p_plain:
        return layout
    return plain
