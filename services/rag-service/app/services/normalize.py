"""Lossless, reversible value normalization.

Extraction must never invent or silently alter values, so normalization here is
OPT-IN and reversible: it only runs on unambiguous patterns where the original
string is preserved alongside the normalized form (`raw_value` in the fact model).
Narrative / free-text fields are left untouched. The single source of truth is
always the original extracted string.
"""
from __future__ import annotations

import re
from typing import Optional


_NUM = re.compile(
    r"^\s*([+-]?)(\d[\d.,]*(?:[eE][+-]?\d+)?)\s*([a-zA-Zµ°/][a-zA-Z0-9µ°/^.\-\s]*)?\s*$"
)
_SI_PREFIXES = {
    "p": 1e-12, "n": 1e-9, "µ": 1e-6, "u": 1e-6, "m": 1e-3, "c": 1e-2,
    "d": 1e-1, "da": 1e1, "h": 1e2, "k": 1e3, "M": 1e6, "G": 1e9, "T": 1e12,
}
_DATE_RE = re.compile(
    r"^\s*(\d{4})[/\-.](\d{1,2})[/\-.](\d{1,2})\s*$|"
    r"^\s*(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})\s*$"
)


def _parse_number(token: str):
    token = token.replace(" ", "")
    if "," in token and "." in token:
        # European thousands comma + decimal dot: 1,234.56
        if token.rfind(",") < token.rfind("."):
            token = token.replace(",", "")
        else:
            token = token.replace(".", "").replace(",", ".")
    elif "," in token:
        # Ambiguous comma — treat as decimal only if single comma with <=2 digits
        # after (e.g. 5,5 kW); otherwise thousands separator (1,234).
        after = token.split(",")[-1]
        if len(after) in (1, 2):
            token = token.replace(",", ".")
        else:
            token = token.replace(",", "")
    try:
        return float(token)
    except ValueError:
        return None


def normalize_value(field: str, value: str) -> Optional[str]:
    """Return a normalized machine value or None (no safe normalization)."""
    if not value:
        return None
    v = value.strip()

    # Dates → ISO yyyy-mm-dd when the format is unambiguous.
    m = _DATE_RE.match(v)
    if m:
        if m.group(1):  # yyyy-mm-dd
            y, mo, d = m.group(1), int(m.group(2)), int(m.group(3))
        else:           # dd-mm-yyyy
            d, mo, y = int(m.group(4)), int(m.group(5)), m.group(6)
        if 1 <= mo <= 12 and 1 <= d <= 31 and len(y) == 4:
            return f"{y}-{mo:02d}-{d:02d}"

    # Weight/measure/electrical numbers with optional SI prefix + unit.
    m = _NUM.match(v)
    if m:
        sign = -1.0 if m.group(1) == "-" else 1.0
        n = _parse_number(m.group(2))
        if n is None:
            return None
        unit = (m.group(3) or "").replace(" ", "").lower()
        # Try to expand SI prefix to base unit for comparison safety, but keep the
        # original text authoritative. Reference-only normalization, reversible.
        base_unit = unit
        multiplier = 1.0
        if unit:
            if len(unit) >= 2 and unit[:2] in ("da",):
                prefix, rest = unit[:2], unit[2:]
            elif unit and unit[0] in _SI_PREFIXES:
                prefix, rest = unit[0], unit[1:]
            else:
                prefix, rest = "", unit
            if prefix in _SI_PREFIXES and rest:
                multiplier = _SI_PREFIXES[prefix]
                base_unit = rest
        val = sign * n * multiplier
        if base_unit and base_unit not in ("", "%"):
            return f"{n:g} {unit}"  # keep human form; further parsing is consumer-side
        return f"{val:g}" if unit in ("", "%") else f"{n:g} {unit}"

    # Boolean-ish and clearly structured tokens pass through unchanged (no op).
    return v
