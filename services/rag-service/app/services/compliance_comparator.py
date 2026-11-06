"""Read-only Product ↔ Standards/Regulations comparison for the Compliance Engine.

This module does not change Product Management or Standards/Regulations ingestion.
It consumes their already-produced structured data and adds a deterministic,
source-aware comparison layer before/after semantic LLM judgment.
"""
from __future__ import annotations

import math
import re
from typing import Any, Optional

from app.services.compliance_rules import Fact, ProductSnapshot, _convert
from app.services.compliance_guard import requirement_scope


# Canonical units + conversion factors. Only dimensionally obvious conversions are
# normalized; unknown units are kept verbatim so the engine will not guess.
_UNIT_FACTORS_EXTENDED: dict[str, tuple[str, float]] = {
    "pa": ("pa", 1.0), "kpa": ("pa", 1e3), "mpa": ("pa", 1e6), "bar": ("pa", 1e5), "mbar": ("pa", 100.0),
    "n": ("n", 1.0), "kn": ("n", 1e3),
    "nm": ("nm", 1.0),
    "db": ("db", 1.0), "db(a)": ("db", 1.0),
    "ml": ("ml", 1.0), "l": ("ml", 1000.0), "ul": ("ml", 1e-3),
    "ppm": ("ppm", 1.0), "mol/l": ("mol/l", 1.0),
    "m": ("mm", 1000.0), "cm": ("mm", 10.0), "mm": ("mm", 1.0), "µm": ("mm", 1e-3), "um": ("mm", 1e-3),
    "kg": ("g", 1000.0), "g": ("g", 1.0),
    "kw": ("w", 1000.0), "w": ("w", 1.0), "mw": ("w", 1e-3),
    "kv": ("v", 1000.0), "v": ("v", 1.0), "mv": ("v", 1e-3),
    "ma": ("a", 1e-3), "a": ("a", 1.0),
    "mhz": ("hz", 1e6), "khz": ("hz", 1e3), "hz": ("hz", 1.0),
    "°c": ("c", 1.0), "c": ("c", 1.0),
    "%": ("%", 1.0),
    "ω": ("ohm", 1.0), "Ω": ("ohm", 1.0), "mω": ("ohm", 1e-3), "kω": ("ohm", 1e3),
    "mΩ": ("ohm", 1e-3), "kΩ": ("ohm", 1e3), "MΩ": ("ohm", 1e6),
    "mohm": ("ohm", 1e-3), "kohm": ("ohm", 1e3), "Mohm": ("ohm", 1e6),
    "ms": ("s", 1e-3), "s": ("s", 1.0), "min": ("s", 60.0), "h": ("s", 3600.0),
}

_NUMBER = r"-?\d+(?:[ \u00A0]\d{3})*(?:[.,]\d+)?"
_UNIT = r"(?:kPa|MPa|mbar|bar|Pa|kN|N|dB(?:\(A\))?|µm|um|mm|cm|mL|µL|uL|L|kg|g|kW|MW|mW|W|kV|mV|V|mA|A|MHz|kHz|Hz|°C|C|%|ppm|mol/L|MΩ|kΩ|mΩ|Ω|Mohm|kohm|mohm|ms|s|min|h|Nm)?"
_NUM_WITH_UNIT_RE = re.compile(
    rf"(?<![A-Za-z0-9])(?P<value>{_NUMBER})\s*(?P<unit>{_UNIT})(?![A-Za-z])",
    re.I,
)

_STOPWORDS = {
    "shall", "must", "should", "may", "required", "requirement", "requirements", "with", "from", "that", "this",
    "these", "those", "where", "when", "which", "into", "only", "than", "then", "each", "being", "have", "been",
    "will", "the", "and", "for", "not", "des", "les", "une", "un", "avec", "dans", "pour", "être", "doit",
    "doivent", "devrait", "peut", "peuvent", "selon", "au", "aux", "est", "sont", "être", "afin", "shallnot",
}

_PROPERTY_ALIASES: dict[str, set[str]] = {
    "voltage": {"voltage", "volt", "rated voltage", "voltage rating", "tension", "ratedvoltage"},
    "test_voltage": {"test voltage", "proof voltage", "withstand voltage", "dielectric test voltage", "hipot voltage", "tension d'essai"},
    "test_frequency": {"test frequency", "test frequencies", "nominal frequency of the test", "nominal test frequency", "fréquence d'essai"},
    "test_current": {"test current", "current used for the measurement", "measured with a current", "courant d'essai", "courant de mesure"},
    "test_duration": {"test duration", "duration of the test", "test time", "durée d'essai", "temps d'essai"},
    "current": {"current", "current rating", "amperage", "courant", "ratedcurrent"},
    "power": {"power", "power rating", "power consumption", "puissance", "ratedpower"},
    "frequency": {"frequency", "frequency range", "hz", "fréquence", "ratedfrequency"},
    "temperature": {"temperature", "operating temperature", "ambient temperature", "température"},
    "pressure": {"pressure", "operating pressure", "working pressure", "pression"},
    "resistance": {"resistance", "electrical resistance", "ohmic resistance", "résistance"},
    "insulation_resistance": {"insulation resistance", "insulation-resistance", "résistance d'isolement"},
    "protective_bonding_resistance": {"protective bonding resistance", "protective conductor resistance", "pe conductor resistance", "bonding conductor resistance"},
    "fault_loop_impedance": {"fault loop impedance", "loop impedance", "impedance of the fault loop", "impédance de boucle"},
    "disconnection_time": {"disconnection time", "disconnecting time", "trip time", "automatic disconnection time", "temps de coupure", "temps de déconnexion"},
    "touch_voltage": {"touch voltage", "prospective touch voltage", "voltage between simultaneously accessible conductive parts", "tension de contact"},
    "flow": {"flow", "flow rate", "debit", "débit"},
    "speed": {"speed", "operating speed", "rpm", "vitesse"},
    "weight": {"weight", "mass", "poids", "masse"},
    "capacity": {"capacity", "load capacity", "weight capacity", "capacité"},
    "dimension": {"dimension", "dimensions", "length", "width", "height", "diameter", "thickness", "longueur", "largeur", "hauteur", "diamètre", "épaisseur"},
    "cross_section": {"cross section", "cross-section", "cross sectional", "cross-sectional", "sectional area", "conductor cross-section", "conductor size", "wire size", "cable size", "section de conducteur", "mm²", "mm2"},
    "terminal_dimension": {"terminal dimension", "terminal size", "terminal opening", "borne", "terminal dimensions"},
    "bending_radius": {"bending radius", "bend radius", "rayon de courbure"},
    "clearance": {"clearance", "air clearance", "distance in air", "clearance distance"},
    "creepage": {"creepage", "creepage distance", "surface distance"},
    "tightening_torque": {"tightening torque", "torque", "couple de serrage"},
    "breaking_capacity": {"breaking capacity", "interrupting capacity", "short-circuit breaking capacity", "pouvoir de coupure"},
    "fault_current": {"fault current", "prospective fault current", "short circuit current", "courant de défaut"},
    "humidity": {"humidity", "relative humidity", "humidity range", "humidité"},
    "ph": {"ph", "acidity", "alkalinity"},
    "concentration": {"concentration", "strength", "dosage", "teneur"},
    "shelf_life": {"shelf life", "shelflife", "expiry", "expiration", "durée de conservation"},
    "ip": {"ip rating", "iprating", "protection rating", "indice de protection"},
    "noise": {"noise", "noise level", "sound level", "bruit"},
    "flammability": {"flammability", "fire rating", "flame", "inflammability", "inflammabilité", "feu"},
    "material": {"material", "materials", "composition", "grade", "matière", "matériau"},
    "certificate": {"certificate", "certification", "conformity", "declaration", "approval", "approval number", "certificat", "conformité", "approbation"},
    "standard": {"standard", "norm", "norme", "specification"},
    "safety": {"safety", "warning", "hazard", "protective", "sécurité", "avertissement", "danger"},
    "traceability": {"traceability", "traceable", "serial number", "batch number", "lot number", "traçabilité"},
    "manufacturer": {"manufacturer", "manufactured by", "fabricant", "maker"},
    "country": {"country of origin", "origin", "made in", "pays d'origine"},
}

_REF_PATTERNS = [
    re.compile(r"\b(?:ISO|IEC|EN|ASTM|ANSI|DIN|IEEE|UL|NF)\s*\d{3,6}(?:[-/][A-Z0-9]+)*(?:\s*[:/-]\s*\d{2,4})?(?:\s*\+\s*A\d+)?\b", re.I),
    re.compile(r"\bRegulation\s*\((?:EU|EC)\)\s*\d{4}/\d{1,5}\b", re.I),
    re.compile(r"\bDirective\s*\((?:EU|EC)\)\s*\d{4}/\d{1,5}\b", re.I),
    re.compile(r"\b\d{2}\s+CFR\s+\d+(?:\.\d+)*\b", re.I),
    re.compile(r"\b(?:REACH|RoHS|GMP|HACCP|GHS|CLP|CE)\b", re.I),
]

_PRESENCE_PATTERNS = [
    re.compile(r"\b(?:shall|must|is required to)\s+(?:include|contain|provide|carry|be equipped with)\s+(?P<feature>[^.;:,]+)", re.I),
    re.compile(r"\b(?:shall|must|is required to)\s+be fitted with\s+(?P<feature>[^.;:,]+)", re.I),
]

_NEGATIVE_PRESENCE_PATTERNS = [
    re.compile(r"\b(?:shall|must)\s+not\s+(?:contain|include|use|have)\s+(?P<feature>[^.;:,]+)", re.I),
    re.compile(r"\b(?:shall|must)\s+be\s+free\s+from\s+(?P<feature>[^.;:,]+)", re.I),
]

_QUALITATIVE_VALUE_PATTERNS = [
    re.compile(r"\b(?:shall|must|is required to)\s+be\s+(?P<value>[A-Za-z0-9][^.;:,]{1,90})", re.I),
    re.compile(r"\b(?:shall|must|is required to)\s+have\s+(?:a|an)?\s*(?:value|rating|level|grade)?\s*(?:of)?\s*(?P<value>[A-Za-z0-9][^.;:,]{1,90})", re.I),
]

_STRICT_CERT_TERMS = {
    "certificate", "certification", "certified", "conformity", "conform", "declaration of conformity", "approved", "approval",
    "certificat", "certification", "conformité", "déclaration de conformité",
}

_PROCEDURAL_NUMERIC_RE = re.compile(
    r"\b(?:test|testing|tested|measurement|measured|measuring|verify|verified|verification|inspection|inspected|proof test|dielectric)\b",
    re.IGNORECASE,
)
_DERIVED_NUMERIC_RE = re.compile(
    r"\b(?:twice|double|whichever\s+is\s+(?:greater|less)|according to|as a function of|depending on|calculated|calculation|equation|formula|derived from)\b",
    re.IGNORECASE,
)

def _numeric_semantic_property(text: str) -> Optional[str]:
    low = _norm(text)
    ordered = [
        ("insulation_resistance", ("insulation resistance", "résistance d'isolement")),
        ("protective_bonding_resistance", ("protective bonding resistance", "protective conductor resistance", "protective bonding conductor")),
        ("fault_loop_impedance", ("fault loop impedance", "loop impedance", "impedance of the fault loop")),
        ("disconnection_time", ("disconnection time", "disconnecting time", "trip time", "automatic disconnection time")),
        ("touch_voltage", ("touch voltage", "prospective touch voltage")),
        ("test_voltage", ("test voltage", "proof voltage", "withstand voltage", "dielectric test voltage")),
        ("test_frequency", ("test frequency", "nominal frequency of the test", "nominal test frequency")),
        ("test_current", ("test current", "measured with a current", "current used for the measurement")),
        ("test_duration", ("test duration", "duration of the test", "for at least")),
        ("cross_section", ("cross sectional area", "cross-sectional area", "conductor cross-section", "conductor size", "sectional area")),
        ("tightening_torque", ("tightening torque", "torque")),
        ("breaking_capacity", ("breaking capacity", "interrupting capacity")),
        ("fault_current", ("fault current", "prospective fault current", "short circuit current")),
        ("voltage", ("rated voltage", "supply voltage", "nominal voltage", "voltage")),
        ("current", ("rated current", "nominal current", "current")),
        ("frequency", ("frequency", "fréquence")),
        ("pressure", ("pressure", "pression")),
        ("temperature", ("temperature", "ambient temperature", "operating temperature")),
        ("power", ("power", "puissance")),
        ("flow", ("flow rate", "flow", "débit")),
        ("speed", ("speed", "rpm", "vitesse")),
        ("weight", ("weight", "mass", "poids", "masse")),
        ("bending_radius", ("bending radius", "bend radius")),
        ("clearance", ("clearance", "air clearance", "distance in air")),
        ("creepage", ("creepage", "creepage distance")),
        ("ip", ("ip rating", "protection rating")),
    ]
    for key, aliases in ordered:
        if any(_norm(alias) in low for alias in aliases):
            return key
    return None

def _is_procedural_numeric_requirement(text: str) -> bool:
    low = str(text or "").lower()
    return bool(_PROCEDURAL_NUMERIC_RE.search(low) or re.search(
        r"\b(?:shall|must)\s+(?:be\s+)?(?:measured|tested|verified|inspected|applied|recorded)\b", low
    ))



def _norm(s: Any) -> str:
    s = str(s or "").strip().lower()
    s = s.replace("−", "-").replace("–", "-").replace("—", "-")
    s = re.sub(r"[^\w%µ°/+.-]+", " ", s, flags=re.UNICODE)
    return re.sub(r"\s+", " ", s).strip()


def _tokens(s: Any) -> set[str]:
    return {
        x.lower()
        for x in re.findall(r"[\wÀ-ÿµ°]{3,}", str(s or ""), flags=re.UNICODE)
        if x.lower() not in _STOPWORDS
    }


def _extract_numbers(value: Any) -> list[tuple[float, str]]:
    """Extract numeric values while preserving units across value ranges."""
    text = str(value or "").replace("–", "-").replace("—", "-")
    out: list[tuple[float, str]] = []
    covered: list[tuple[int, int]] = []

    range_rx = re.compile(
        rf"(?<![A-Za-z0-9])(?P<a>{_NUMBER})\s*(?:-|to)\s*(?P<b>{_NUMBER})\s*(?P<unit>{_UNIT})(?![A-Za-z])",
        re.I,
    )
    for m in range_rx.finditer(text):
        try:
            a = float(m.group("a").replace(" ", "").replace("\u00a0", "").replace(",", "."))
            b = float(m.group("b").replace(" ", "").replace("\u00a0", "").replace(",", "."))
        except ValueError:
            continue
        unit = (m.group("unit") or "").lower().replace(" ", "")
        out.extend([(a, unit), (b, unit)])
        covered.append((m.start(), m.end()))

    for m in _NUM_WITH_UNIT_RE.finditer(text):
        if any(st <= m.start() < en for st, en in covered):
            continue
        try:
            num = float(m.group("value").replace(" ", "").replace("\u00a0", "").replace(",", "."))
        except ValueError:
            continue
        out.append((num, (m.group("unit") or "").lower().replace(" ", "")))
    return out


def _convert_ext(value: float, unit: str) -> tuple[str, float]:
    # Preserve SI prefix case for ohms: mΩ (milli-ohm) and MΩ (mega-ohm)
    # collapse to the same lowercase string if case is discarded too early.
    raw = str(unit or "").strip()
    raw_compact = raw.replace(" ", "")
    if raw_compact in {"MΩ", "Mohm", "MOhm"}:
        return "ohm", value * 1e6
    if raw_compact in {"kΩ", "kohm", "kOhm"}:
        return "ohm", value * 1e3
    if raw_compact in {"mΩ", "mohm", "mOhm"}:
        return "ohm", value * 1e-3
    u = raw.lower().replace(" ", "")
    if u in _UNIT_FACTORS_EXTENDED:
        base, factor = _UNIT_FACTORS_EXTENDED[u]
        return base, value * factor
    try:
        return _convert(value, unit)
    except Exception:
        return u, value


def _convert_numeric_capture(value_raw: str, unit_raw: str) -> dict[str, Any]:
    raw_v = float(value_raw.replace(" ", "").replace("\u00a0", "").replace(",", "."))
    base, value = _convert_ext(raw_v, unit_raw or "")
    return {"value": value, "unit": base}


def _nearest_numeric_property(text: str, start: int, end: int, unit: str = "") -> tuple[Optional[str], str]:
    """Bind one numeric constraint to the correct semantic Product property.

    Specific engineering properties outrank generic words. The binding also uses
    the numeric unit and local wording so values such as 500 V (test condition) and
    1 MΩ (insulation resistance) are not accidentally mapped to the same field.
    """
    full = str(text or "")
    window_start = max(0, start - 150)
    window_end = min(len(full), end + 80)
    window = full[window_start:window_end]
    low_window = _norm(window)
    low_full = _norm(full)
    raw_unit = str(unit or "").strip()
    unit_low = raw_unit.lower().replace(" ", "")

    specific_checks: list[tuple[str, tuple[str, ...]]] = [
        ("insulation_resistance", ("insulation resistance", "résistance d'isolement")),
        ("protective_bonding_resistance", ("protective bonding resistance", "protective conductor resistance", "protective bonding conductor")),
        ("fault_loop_impedance", ("fault loop impedance", "loop impedance", "impedance of the fault loop")),
        ("disconnection_time", ("disconnection time", "disconnecting time", "trip time", "automatic disconnection time")),
        ("touch_voltage", ("touch voltage", "prospective touch voltage")),
        ("test_voltage", ("test voltage", "proof voltage", "withstand voltage", "dielectric test voltage")),
        ("test_frequency", ("test frequency", "nominal frequency of the test", "nominal test frequency")),
        ("test_current", ("test current", "measured with a current", "current used for the measurement")),
        ("test_duration", ("test duration", "duration of the test", "for at least", "for not less than")),
        ("cross_section", ("cross sectional area", "cross-sectional area", "conductor cross-section", "conductor size", "sectional area")),
        ("tightening_torque", ("tightening torque", "torque")),
        ("breaking_capacity", ("breaking capacity", "interrupting capacity")),
        ("fault_current", ("fault current", "prospective fault current", "short circuit current")),
    ]
    # Strong unit/context shortcuts for engineering test quantities.
    if unit_low in {"mω", "kω", "ω", "mohm", "kohm", "mω", "ohm"} and any(x in low_full for x in ("insulation resistance", "résistance d'isolement")):
        return "insulation_resistance", window
    if unit_low in {"s", "ms", "min", "h"} and any(x in low_window for x in ("disconnection time", "disconnecting time", "trip time")):
        return "disconnection_time", window
    if unit_low in {"s", "ms", "min", "h"} and any(x in low_window for x in ("test duration", "duration of the test", "for at least", "for not less than")):
        return "test_duration", window
    if unit_low in {"hz", "khz", "mhz"} and any(x in low_window for x in ("test frequency", "nominal test frequency")):
        return "test_frequency", window
    if unit_low in {"hz", "khz", "mhz"} and "nominal frequency" in low_window and "test voltage" in low_full:
        return "test_frequency", window
    if unit_low in {"v", "mv", "kv"} and any(x in low_window for x in ("test voltage", "proof voltage", "withstand voltage", "dielectric test voltage")):
        return "test_voltage", window
    if unit_low in {"a", "ma"} and any(x in low_window for x in ("measured with a current", "test current", "current used for the measurement")):
        return "test_current", window

    candidates: list[tuple[int, int, str, str]] = []
    for priority, (key, aliases) in enumerate(specific_checks):
        for alias in aliases:
            a = _norm(alias)
            pos = low_window.find(a)
            if pos >= 0:
                absolute = window_start + pos
                distance = abs(start - (absolute + len(a) // 2))
                candidates.append((distance, priority, key, alias))
    # Generic properties are evaluated only after all specific engineering terms.
    generic = [
        ("voltage", ("rated voltage", "supply voltage", "nominal voltage", "voltage")),
        ("current", ("rated current", "nominal current", "current")),
        ("frequency", ("frequency", "fréquence")),
        ("pressure", ("pressure", "pression")),
        ("temperature", ("temperature", "ambient temperature", "operating temperature")),
        ("power", ("rated power", "power rating", "power consumption", "puissance nominale")),
        ("flow", ("flow rate", "flow", "débit")),
        ("speed", ("speed", "rpm", "vitesse")),
        ("weight", ("weight", "mass", "poids", "masse")),
    ]
    offset=100
    for priority, (key, aliases) in enumerate(generic, start=offset):
        for alias in aliases:
            a=_norm(alias)
            pos=low_window.find(a)
            if pos>=0:
                absolute=window_start+pos
                distance=abs(start-(absolute+len(a)//2))
                candidates.append((distance,priority,key,alias))
    if not candidates:
        local=full[max(0,start-80):min(len(full),end+35)]
        return None, local
    candidates.sort(key=lambda x:(x[0],x[1]))
    _,_,key,_=candidates[0]
    local=full[max(0,start-110):min(len(full),end+50)]
    return key, local

def _extract_requirement_numerics(text: str) -> list[dict[str, Any]]:
    """Extract all safely recognizable numeric constraints, preserving context.

    A single normative sentence may contain several independent constraints (for
    example voltage + frequency). The Compliance Engine must not mark the whole
    requirement PASS just because one of them matched.
    """
    t = (text or "").replace("≤", "<=").replace("≥", ">=").replace("−", "-")
    single = rf"(?P<value>{_NUMBER})\s*(?P<unit>{_UNIT})"
    candidates: list[tuple[int, int, dict[str, Any]]] = []
    patterns = [
        (rf"(?:up\s+to|maximum(?:\s+of)?|not\s+(?:exceed|greater\s+than)|less\s+than\s+or\s+equal\s+to|no\s+greater\s+than|at\s+most|<=)\s*{single}", "max"),
        (rf"(?:less\s+than|<)\s*{single}", "max_strict"),
        (rf"(?:at\s+least|not\s+less\s+than|greater\s+than\s+or\s+equal\s+to|minimum(?:\s+of)?|>=)\s*{single}", "min"),
        (rf"(?:greater\s+than|>)\s*{single}", "min_strict"),
        (rf"(?:shall|must|is\s+required\s+to)\s+(?:be|have\s+(?:a|an)?\s*[A-Za-z][A-Za-z0-9 /_-]{{0,50}}?\s+of)\s*{single}", "eq"),
        (rf"(?:shall|must|is\s+required\s+to)\s+(?:be|have)\s*[:=]?\s*{single}", "eq"),
    ]
    for pattern, kind in patterns:
        for m in re.finditer(pattern, t, re.I):
            try:
                parsed = _convert_numeric_capture(m.group("value"), m.group("unit") or "")
            except ValueError:
                continue
            candidates.append((m.start(), m.end(), {"operator": kind, **parsed}))

    allowed_single_a = rf"(?P<avalue>{_NUMBER})\s*(?P<aunit>{_UNIT})"
    allowed_single_b = rf"(?P<bvalue>{_NUMBER})\s*(?P<bunit>{_UNIT})"
    allowed_rx = re.compile(
        rf"\b(?:shall|must|is\s+required\s+to)\b(?P<context>.{{0,90}}?){allowed_single_a}\s+(?:or|and/or)\s+{allowed_single_b}(?![A-Za-z])",
        re.I,
    )
    for m in allowed_rx.finditer(t):
        try:
            # Parse the two captures independently because each includes its own unit.
            aa = _convert_numeric_capture(m.group("avalue"), m.group("aunit") or "")
            bb = _convert_numeric_capture(m.group("bvalue"), m.group("bunit") or "")
        except ValueError:
            continue
        if aa["unit"] == bb["unit"]:
            context = (m.group("context") or "") + " " + t[max(0, m.start()-40):m.end()]
            candidates.append((m.start(), m.end(), {
                "operator": "allowed",
                "values": [aa["value"], bb["value"]],
                "unit": aa["unit"],
                "allowedContext": context.strip(),
            }))

    tol_rx = re.compile(
        rf"(?P<value>{_NUMBER})\s*(?P<unit>{_UNIT})\s*±\s*(?P<tolerance>{_NUMBER})\s*(?P<tunit>{_UNIT})",
        re.I,
    )
    for m in tol_rx.finditer(t):
        try:
            left = _convert_numeric_capture(m.group("value"), m.group("unit") or "")
            tol = _convert_numeric_capture(m.group("tolerance"), m.group("tunit") or m.group("unit") or "")
        except ValueError:
            continue
        if left["unit"] == tol["unit"]:
            candidates.append((m.start(), m.end(), {
                "operator": "range",
                "lower": left["value"] - tol["value"],
                "upper": left["value"] + tol["value"],
                "unit": left["unit"],
            }))

    range_rx = re.compile(
        rf"(?:between|from)\s*(?P<a>{_NUMBER})\s*(?P<ua>{_UNIT})\s*(?:and|to)\s*(?P<b>{_NUMBER})\s*(?P<ub>{_UNIT})",
        re.I,
    )
    for m in range_rx.finditer(t):
        try:
            a = float(m.group("a").replace(" ", "").replace("\u00a0", "").replace(",", "."))
            b = float(m.group("b").replace(" ", "").replace("\u00a0", "").replace(",", "."))
        except ValueError:
            continue
        ua = m.group("ua") or m.group("ub") or ""
        ub = m.group("ub") or ua
        base_a, va = _convert_ext(a, ua)
        base_b, vb = _convert_ext(b, ub)
        if base_a == base_b:
            candidates.append((m.start(), m.end(), {
                "operator": "range",
                "lower": min(va, vb),
                "upper": max(va, vb),
                "unit": base_a,
            }))

    # Deduplicate overlapping matches and restore textual order.
    candidates.sort(key=lambda item: (item[0], -(item[1] - item[0])))
    kept: list[tuple[int, int, dict[str, Any]]] = []
    for start_pos, end_pos, data in candidates:
        if any(start_pos < e and end_pos > st for st, e, _ in kept):
            continue
        kept.append((start_pos, end_pos, data))

    out: list[dict[str, Any]] = []
    for index, (start_pos, end_pos, data) in enumerate(kept, start=1):
        context_start = max(0, start_pos - 90)
        context_end = min(len(t), end_pos + 90)
        # Keep the local property cue tight enough that a multi-constraint sentence
        # such as "voltage ... and frequency ..." does not rank the voltage fact
        # as the best candidate for the frequency constraint.
        canonical_property, property_context = _nearest_numeric_property(t, start_pos, end_pos, str(data.get("unit") or ""))
        out.append({
            **data,
            "index": index,
            "spanStart": start_pos,
            "spanEnd": end_pos,
            "context": t[context_start:context_end],
            "propertyContext": property_context,
            "canonicalProperty": canonical_property or _numeric_semantic_property(property_context),
            "procedural": _is_procedural_numeric_requirement(property_context) or _is_procedural_numeric_requirement(t),
            "derived": bool(_DERIVED_NUMERIC_RE.search(t)),
        })
    return out


def _extract_requirement_numeric(text: str) -> Optional[dict[str, Any]]:
    """Backward-compatible first numeric constraint helper."""
    numerics = _extract_requirement_numerics(text)
    return numerics[0] if numerics else None


def _extract_references(text: str) -> list[str]:
    refs: list[str] = []
    seen: set[str] = set()
    for rx in _REF_PATTERNS:
        for m in rx.finditer(text or ""):
            ref = re.sub(r"\s+", " ", m.group(0)).strip()
            key = _norm(ref)
            if key and key not in seen:
                seen.add(key)
                refs.append(ref)
    return refs[:16]


def _property_keys(text: str) -> set[str]:
    low = _norm(text)
    hits: set[str] = set()
    for key, aliases in _PROPERTY_ALIASES.items():
        if any(_norm(alias) in low for alias in aliases):
            hits.add(key)
    return hits


def _is_certification_requirement(text: str) -> bool:
    low = _norm(text)
    return any(term in low for term in _STRICT_CERT_TERMS)


def _fact_text(fact: Fact) -> str:
    return f"{fact.field} {fact.value} {getattr(fact, 'category', '')}".strip()


def _source_authority(fact: Fact) -> float:
    source = _norm(getattr(fact, "source", ""))
    if any(k in source for k in ("certificate", "test report", "test_report", "declaration", "approval")):
        return 0.14
    if any(k in source for k in ("datasheet", "specification", "technical")):
        return 0.12
    if any(k in source for k in ("label", "marking", "manual", "procedure")):
        return 0.07
    if "product management profile" in source:
        return 0.0
    return 0.04


def _fact_quality(fact: Fact) -> float:
    grounded = getattr(fact, "grounded", None)
    conf = float(getattr(fact, "confidence", 0.55) or 0.55)
    if grounded is True:
        conf = min(1.0, conf + 0.10)
    elif grounded is False:
        conf *= 0.50
    if getattr(fact, "conflict", False):
        conf *= 0.55
    conf = min(1.0, conf + _source_authority(fact) * 0.35)
    return max(0.0, min(1.0, conf))


def _field_property_hits(fact: Fact, props: set[str]) -> set[str]:
    if not props:
        return set()
    field_text = _norm(fact.field)
    value_text = _norm(fact.value)
    hits: set[str] = set()
    for prop in props:
        if any(_norm(alias) in field_text for alias in _PROPERTY_ALIASES[prop]):
            hits.add(prop)
        elif prop in {"material", "certificate", "standard", "safety", "traceability", "manufacturer", "country", "flammability"}:
            if any(_norm(alias) in value_text for alias in _PROPERTY_ALIASES[prop]):
                hits.add(prop)
    return hits


def _numeric_fact_semantic_match(fact: Fact, requirement_text: str, constraint: Optional[dict[str, Any]] = None) -> float:
    """Require semantic property alignment before numeric conformity comparison.

    Unit compatibility alone is never sufficient. In EN/IEC requirements, two values
    may both be expressed in mm or A while representing unrelated properties.
    """
    context = str((constraint or {}).get("propertyContext") or (constraint or {}).get("context") or requirement_text or "")
    req_props = _property_keys(context)
    canonical = str((constraint or {}).get("canonicalProperty") or "")
    if canonical:
        req_props = {canonical}
    field = _norm(fact.field)
    value = _norm(fact.value)
    combined = f"{field} {value}"
    if req_props:
        hits = _field_property_hits(fact, req_props)
        if not hits:
            return 0.0
        # Specific requirement properties must be matched specifically; do not allow
        # a broad generic ``dimension`` alias to satisfy a more precise property.
        specific = req_props - {"dimension"}
        if specific and not (hits & specific):
            return 0.0
        if "dimension" in req_props:
            precision_terms = {"cross", "section", "conductor", "terminal", "bending", "radius", "clearance", "creepage", "torque"}
            req_tokens = _tokens(context)
            cues = req_tokens & precision_terms
            if cues and not any(c in _tokens(combined) for c in cues):
                return 0.0
        return 0.86 if (hits & (req_props - {"dimension"})) else 0.70
    # No recognized property: fall back to a stronger field/text overlap, but never
    # use unit compatibility alone.
    req_tokens = _tokens(context)
    field_tokens = _tokens(field)
    if not req_tokens or not field_tokens:
        return 0.0
    overlap = len(req_tokens & field_tokens) / max(1, len(req_tokens))
    return min(0.75, overlap * 1.25)


def rank_product_facts(requirement: dict[str, Any], snapshot: Optional[ProductSnapshot], limit: int = 8) -> list[dict[str, Any]]:
    """Rank only materially relevant Product facts for one exact requirement."""
    if not snapshot:
        return []
    text = str(requirement.get("text") or "")
    req_tokens = _tokens(text)
    props = _property_keys(text)
    explicit_numeric = requirement.get("_numericConstraint")
    numeric = explicit_numeric if isinstance(explicit_numeric, dict) else _extract_requirement_numeric(text)
    req_refs = {_norm(x) for x in _extract_references(text)}
    scored: list[tuple[float, Fact, dict[str, Any]]] = []

    for fact in snapshot.facts.values():
        ftxt = _fact_text(fact)
        ftokens = _tokens(ftxt)
        overlap = len(req_tokens & ftokens) / max(1, len(req_tokens))
        prop_hits = _field_property_hits(fact, props)
        prop_score = 0.46 if prop_hits else 0.0
        if numeric:
            semantic_numeric = _numeric_fact_semantic_match(fact, text, numeric)
            if semantic_numeric <= 0.0:
                # Numeric values with compatible units but the wrong semantic property
                # must never become comparison candidates.
                continue
            prop_score = max(prop_score, 0.38 + 0.20 * semantic_numeric)
        ref_score = 0.0
        if req_refs:
            freqs = {_norm(x) for x in _extract_references(ftxt)}
            ref_score = 0.48 if req_refs & freqs else 0.0

        numeric_score = 0.0
        if numeric and not props:
            # When the requirement context already identifies a property, do not
            # let an unrelated earlier number/unit in the sentence drive candidate
            # selection. Property semantics are the primary gate; unit matching is
            # only a secondary ranking signal.
            fact_nums = _extract_numbers(fact.value)
            for n, u in fact_nums:
                base, _ = _convert_ext(n, u)
                if not numeric.get("unit") or base == numeric.get("unit"):
                    numeric_score = max(numeric_score, 0.20)

        exact_field = _norm(fact.field) in req_tokens or _norm(fact.field) in _norm(text)
        exact_score = 0.18 if exact_field else 0.0
        quality = _fact_quality(fact)
        source_bonus = _source_authority(fact)
        has_signal = bool(prop_hits or ref_score or numeric_score or exact_score or overlap >= 0.16)
        if not has_signal:
            continue

        score = min(1.0, overlap * 0.42 + prop_score + ref_score + numeric_score + exact_score + quality * 0.18 + source_bonus)
        if score < 0.32:
            continue
        note = ""
        if getattr(fact, "conflict", False):
            note = "conflicting Product sources"
        elif getattr(fact, "grounded", None) is False:
            note = "Product source grounding not verified"
        scored.append((score, fact, {"matchScore": round(score, 4), "note": note}))

    scored.sort(key=lambda item: item[0], reverse=True)
    return [{"fact": fact, **meta} for _, fact, meta in scored[:limit]]


def _normalize_observed_text(value: Any) -> str:
    s = _norm(value)
    # Remove common punctuation around list-style values while preserving meaning.
    return re.sub(r"[()\[\]{}]", " ", s).strip()


def _feature_present(feature: str, fact: Fact) -> bool:
    """Require explicit positive evidence for a required feature.

    A common failure mode in text matching is treating phrases such as ``not fitted``
    or ``optional`` as proof that a required feature is present. Negative/optional
    wording is rejected here so the comparator remains conservative.
    """
    feat = _tokens(feature)
    if not feat:
        return False
    raw = _norm(f"{fact.field} {fact.value}")
    ft = _tokens(raw)
    if len(feat & ft) / max(1, len(feat)) < 0.72:
        return False
    neg_patterns = (
        r"\b(?:not|no|without|absent|missing|removed|unavailable)\b",
        r"\b(?:not\s+(?:fitted|installed|included|present|provided|equipped))\b",
        r"\b(?:optional|optionally)\b",
    )
    # Only treat negative wording as disqualifying when it occurs in the same
    # local fact string; a generic ``not`` elsewhere must not suppress a true value.
    if any(re.search(rx, raw, re.IGNORECASE) for rx in neg_patterns):
        return False
    return True


def _feature_absent_explicit(feature: str, fact: Fact) -> bool:
    """Recognize explicit proof that a prohibited feature is absent."""
    feat = _tokens(feature)
    if not feat:
        return False
    raw = _norm(f"{fact.field} {fact.value}")
    if len(feat & _tokens(raw)) / max(1, len(feat)) < 0.72:
        return False
    escaped = r"\s+".join(re.escape(t) for t in sorted(feat, key=len, reverse=True))
    return bool(re.search(
        rf"(?:\b(?:does not|do not|not|no|without|free from|free of|contains no|absent)\b[^.;:]{{0,80}}\b{escaped}\b|\b{escaped}\b[^.;:]{{0,80}}\b(?:does not|do not|not|without|absent)\b)",
        raw,
        re.IGNORECASE,
    ))


def _qualitative_required_value(text: str) -> Optional[str]:
    """Extract only explicit qualitative target values; reject procedural prose."""
    patterns = [
        re.compile(r"\b(?:shall|must|is\s+required\s+to)\s+be\s+(?P<value>(?:[A-Za-z0-9][^.;:,]{1,40}))\s*$", re.I),
        re.compile(r"\b(?:shall|must|is\s+required\s+to)\s+have\s+(?:a|an)?\s*(?:value|rating|level|grade)?\s*(?:of)?\s*(?P<value>[A-Za-z0-9][^.;:,]{1,40})\s*$", re.I),
    ]
    blocked = {"in the expected range", "in the range", "provided", "necessary", "appropriate", "suitable", "required", "compliant", "used"}
    for rx in patterns:
        m=rx.search(text or "")
        if not m:
            continue
        value=(m.group("value") or "").strip()
        low=value.lower()
        if low in blocked or any(x in low for x in ("according to", "as appropriate", "as necessary")):
            continue
        if 1 <= len(_tokens(value)) <= 6:
            return value
    return None


def _evaluate_numeric_constraint(fact: Fact, constraint: dict[str, Any]) -> tuple[str, Optional[dict[str, Any]]]:
    """Return (comparison_label, normalized_detail) for one Product fact."""
    compatible: list[tuple[float, str, str]] = []
    for val, unit in _extract_numbers(fact.value):
        base, converted = _convert_ext(val, unit)
        if constraint.get("unit") and base != constraint.get("unit"):
            continue
        compatible.append((converted, base, unit))
    if not compatible:
        return "unit_or_dimension_mismatch", None

    values = [v for v, _, _ in compatible]
    op = constraint["operator"]
    ok: Optional[bool] = None
    label = "within_limit"
    if op == "max":
        ok = max(values) <= constraint["value"] + 1e-9
    elif op == "max_strict":
        ok = max(values) < constraint["value"] - 1e-9
    elif op == "min":
        ok = min(values) >= constraint["value"] - 1e-9
    elif op == "min_strict":
        ok = min(values) > constraint["value"] + 1e-9
    elif op == "eq":
        # A range is not equivalent to one exact required value merely because it
        # contains that value. All observed numeric values must equal the target.
        ok = len(values) == 1 and math.isclose(values[0], constraint["value"], rel_tol=1e-6, abs_tol=1e-9)
        label = "exact_match" if ok else "exact_value_mismatch"
    elif op == "allowed":
        allowed = constraint.get("values") or []
        ok = bool(allowed) and len(values) == 1 and any(
            math.isclose(values[0], float(v), rel_tol=1e-6, abs_tol=1e-9) for v in allowed
        )
        label = "allowed_value_match" if ok else "allowed_value_mismatch"
    else:
        ok = min(values) >= constraint["lower"] - 1e-9 and max(values) <= constraint["upper"] + 1e-9
    return ("within_limit" if ok else "outside_limit") if op != "eq" else label, {
        "values": values,
        "unit": compatible[0][1],
    }


def _build_comparison_element(fact: Fact, requirement_text: str, item: dict[str, Any]) -> dict[str, Any]:
    return {
        "standardRequirement": requirement_text[:900],
        "productField": fact.field,
        "observedValue": fact.display[:500],
        "unit": getattr(fact, "unit", None),
        "comparison": "potential_match",
        "status": "partial",
        "confidence": round(_fact_quality(fact), 4),
        "source": fact.source,
        "page": fact.page,
        "documentId": fact.document_id,
        "evidence": fact.evidence,
        "conflict": bool(fact.conflict),
        "grounded": getattr(fact, "grounded", None),
        "sourceVerified": bool(
            getattr(fact, "document_id", None)
            and str(getattr(fact, "source", "") or "").strip().lower() != "product management profile"
            and (getattr(fact, "grounded", None) is True or bool(getattr(fact, "evidence", None)))
        ),
        "sourceCount": len(getattr(fact, "sources", []) or []),
        "matchScore": item["matchScore"],
        "notes": item.get("note") or "",
    }


def compare_requirement(requirement: dict[str, Any], snapshot: Optional[ProductSnapshot]) -> dict[str, Any]:
    """Compare the exact Portal-extracted requirement against Product data.

    The comparator is deliberately conservative: every independently recognized
    numeric/feature obligation must be covered before automatic PASS is allowed.
    Certification/conformity claims still require documentary proof. A strict scope
    gate runs first so legal obligations aimed at Member States, importers, notified
    bodies, etc. cannot be evaluated as Product failures.
    """
    text = str(requirement.get("text") or "").strip()
    req_type = str(requirement.get("type") or "mandatory").strip().lower()
    refs = _extract_references(text)
    scope = requirement_scope(
        requirement,
        clause_ref=str(requirement.get("clauseRef") or requirement.get("reference") or ""),
        clause_title=str(requirement.get("clauseTitle") or requirement.get("clause_title") or ""),
        clause_text=str(requirement.get("_standardClauseText") or ""),
        section_type=str(requirement.get("_standardSectionType") or ""),
    )
    is_cert = _is_certification_requirement(text)
    numeric_constraints = _extract_requirement_numerics(text)
    props = _property_keys(text)
    qualitative = None if is_cert else _qualitative_required_value(text)
    positive_presence = [m.group("feature").strip() for rx in _PRESENCE_PATTERNS for m in rx.finditer(text or "")]
    negative_presence = [m.group("feature").strip() for rx in _NEGATIVE_PRESENCE_PATTERNS for m in rx.finditer(text or "")]

    base_payload = {
        "version": 3,
        "requirementId": str(requirement.get("id") or requirement.get("requirementId") or ""),
        "clauseRef": str(requirement.get("clauseRef") or requirement.get("reference") or ""),
        "standardRequirement": text[:1200],
        "requirementType": req_type,
        "modalVerb": str(requirement.get("modalVerb") or ""),
        "appliesIf": str(requirement.get("appliesIf") or ""),
        "crossReferences": list(requirement.get("crossReferences") or []) if isinstance(requirement.get("crossReferences"), list) else [],
        "standardReferencesDetected": refs,
        "standardContext": {
            "portal": "Standards & Regulations Portal",
            "clauseTextExcerpt": str(requirement.get("_standardClauseText") or "")[:2200],
            "sectionType": str(requirement.get("_standardSectionType") or ""),
            "qualityFlags": requirement.get("_standardQualityFlags") if isinstance(requirement.get("_standardQualityFlags"), dict) else {},
        },
        "applicability": scope,
    }

    if scope.get("scope") == "OUT_OF_SCOPE":
        return {
            **base_payload,
            "productFactsCompared": 0,
            "matchedProductFields": [],
            "elements": [],
            "coverage": "NOT_APPLICABLE",
            "decision": "N/A",
            "method": f"scope_gate_{str(scope.get('kind') or 'out_of_scope').lower()}",
            "confidence": float(scope.get("confidence", 0.99) or 0.99),
            "reason": str(scope.get("reason") or "Requirement is outside Product conformity scope."),
        }

    if scope.get("scope") == "REVIEW":
        # High-precision mode: an ambiguous actor/scope must never reach the LLM
        # as if it were a normal Product requirement. Return a non-authoritative
        # engine state and require clause/scope review first.
        return {
            **base_payload,
            "productFactsCompared": 0,
            "matchedProductFields": [],
            "elements": [],
            "coverage": "SCOPE_REVIEW",
            "decision": "INCONCLUSIVE",
            "method": "scope_gate_review",
            "confidence": float(scope.get("confidence", 0.0) or 0.0),
            "reason": str(scope.get("reason") or "Requirement applicability is ambiguous; automatic Product conformity judgment is blocked."),
        }

    if req_type in {"informative", "information", "informational"}:
        return {
            **base_payload,
            "productFactsCompared": 0,
            "matchedProductFields": [],
            "elements": [],
            "coverage": "NOT_APPLICABLE",
            "decision": "N/A",
            "method": "informative_requirement",
            "confidence": 0.99,
            "reason": "The Standards & Regulations Portal classified this item as informative rather than an auditable conformity requirement.",
        }

    if requirement.get("grounded") is False:
        return {
            **base_payload,
            "productFactsCompared": 0,
            "matchedProductFields": [],
            "elements": [],
            "coverage": "NONE",
            "decision": None,
            "method": "standard_requirement_not_grounded",
            "confidence": 0.0,
            "reason": "The Standards & Regulations Portal could not ground this requirement in its source text; automatic conformity judgment is blocked.",
        }

    standard_quality = requirement.get("_standardQualityFlags") if isinstance(requirement.get("_standardQualityFlags"), dict) else {}
    standard_quality_warning = bool(standard_quality.get("clausePossiblyIncomplete") or standard_quality.get("clauseMandatoryButEmpty"))

    elements: list[dict[str, Any]] = []
    compared_fields: list[str] = []

    # 1) Numeric constraints: each independent constraint gets its own Product fact
    # candidates and its own result. This prevents a multi-constraint requirement
    # from passing because only one numeric value matched.
    for constraint in numeric_constraints:
        if constraint.get("procedural") or constraint.get("derived"):
            continue
        local_req = {**requirement, "text": constraint.get("context") or constraint.get("propertyContext") or text, "_numericConstraint": constraint}
        candidates = rank_product_facts(local_req, snapshot, limit=6)
        best_element: Optional[dict[str, Any]] = None
        for item in candidates:
            fact: Fact = item["fact"]
            semantic_match = _numeric_fact_semantic_match(fact, str(constraint.get("context") or text), constraint)
            if semantic_match < 0.62:
                continue
            # Unit compatibility is a hard gate after semantic property matching.
            # A frequency fact in Hz cannot be considered for a voltage constraint
            # merely because both are numeric facts.
            fact_numbers = _extract_numbers(fact.value)
            if constraint.get("unit") and fact_numbers:
                compatible_units = {
                    _convert_ext(v, u)[0] for v, u in fact_numbers
                }
                if str(constraint.get("unit")).lower() not in {str(u).lower() for u in compatible_units}:
                    continue
            label = "unit_or_dimension_mismatch"
            detail = None
            if fact_numbers:
                label, detail = _evaluate_numeric_constraint(fact, constraint)
            entry = _build_comparison_element(fact, text, item)
            entry.update({
                "constraintIndex": constraint["index"],
                "standardConstraint": constraint,
                "comparison": label,
            })
            if detail:
                entry["normalizedObserved"] = detail
            if label == "unit_or_dimension_mismatch":
                entry["status"] = "partial"
            elif label == "exact_value_mismatch" and detail and len(detail.get("values") or []) > 1:
                entry["status"] = "partial"
                entry["notes"] = "Product specifies a value range; it does not prove conformity to one exact required value."
            else:
                entry["status"] = "covered" if label in {"within_limit", "exact_match", "allowed_value_match"} else "contradictory"
            if best_element is None or (entry["confidence"], entry["matchScore"]) > (best_element["confidence"], best_element["matchScore"]):
                best_element = entry
            if entry["status"] == "covered" and not fact.conflict and entry["confidence"] >= 0.80:
                # Keep alternate conflicting/contradictory values too, but the best
                # clean match is enough for this constraint's primary comparison.
                pass
        if best_element:
            elements.append(best_element)
            compared_fields.append(best_element["productField"])

    # 2) Explicit required / prohibited features, including safety controls.
    for feature in positive_presence:
        candidates = rank_product_facts({**requirement, "text": feature}, snapshot, limit=6)
        if not candidates:
            elements.append({
                "standardRequirement": text[:900],
                "productField": "",
                "observedValue": "",
                "unit": None,
                "comparison": "required_feature_not_found",
                "status": "partial",
                "confidence": 0.0,
                "source": "Product Management / Product AI extraction",
                "page": None,
                "documentId": None,
                "evidence": None,
                "conflict": False,
                "matchScore": 0.0,
                "feature": feature,
                "notes": "No Product fact explicitly evidences the required feature.",
            })
            continue
        covered_feature = False
        for item in candidates[:3]:
            fact: Fact = item["fact"]
            entry = _build_comparison_element(fact, text, item)
            entry["comparison"] = "required_feature_present" if _feature_present(feature, fact) else "required_feature_not_explicitly_present"
            entry["status"] = "covered" if entry["comparison"] == "required_feature_present" else "partial"
            entry["feature"] = feature
            elements.append(entry)
            compared_fields.append(fact.field)
            if entry["status"] == "covered" and entry["confidence"] >= 0.82 and not entry["conflict"]:
                covered_feature = True
                break
        if not covered_feature and not any(e.get("feature") == feature and e.get("status") == "partial" for e in elements):
            elements.append({
                "standardRequirement": text[:900], "productField": "", "observedValue": "", "unit": None,
                "comparison": "required_feature_not_found", "status": "partial", "confidence": 0.0,
                "source": "Product Management / Product AI extraction", "page": None, "documentId": None,
                "evidence": None, "conflict": False, "matchScore": 0.0, "feature": feature,
                "notes": "No Product fact explicitly evidences the required feature.",
            })

    for feature in negative_presence:
        candidates = rank_product_facts({**requirement, "text": feature}, snapshot, limit=6)
        if not candidates:
            elements.append({
                "standardRequirement": text[:900], "productField": "", "observedValue": "", "unit": None,
                "comparison": "prohibited_feature_not_verified", "status": "partial", "confidence": 0.0,
                "source": "Product Management / Product AI extraction", "page": None, "documentId": None,
                "evidence": None, "conflict": False, "matchScore": 0.0, "feature": feature,
                "notes": "No Product fact verifies either the presence or explicit absence of the prohibited feature.",
            })
            continue
        for item in candidates[:3]:
            fact: Fact = item["fact"]
            entry = _build_comparison_element(fact, text, item)
            present = _feature_present(feature, fact)
            explicitly_absent = _feature_absent_explicit(feature, fact)
            if present:
                entry["comparison"] = "prohibited_feature_present"
                entry["status"] = "contradictory"
            elif explicitly_absent:
                entry["comparison"] = "prohibited_feature_explicitly_absent"
                entry["status"] = "covered"
            else:
                entry["comparison"] = "prohibited_feature_not_verified"
                entry["status"] = "partial"
            entry["feature"] = feature
            elements.append(entry)
            compared_fields.append(fact.field)
            if entry["status"] in {"contradictory", "covered"} and not entry["conflict"]:
                break

    # 3) Exact qualitative values such as "material shall be stainless steel".
    if qualitative and not numeric_constraints and not positive_presence and not negative_presence:
        candidates = rank_product_facts(requirement, snapshot, limit=6)
        req_norm = _normalize_observed_text(qualitative)
        req_tokens = _tokens(req_norm)
        for item in candidates[:6]:
            fact: Fact = item["fact"]
            fact_norm = _normalize_observed_text(fact.value)
            overlap = len(req_tokens & _tokens(fact_norm)) / max(1, len(req_tokens))
            entry = _build_comparison_element(fact, text, item)
            if req_norm == fact_norm or (len(req_norm) >= 5 and req_norm in fact_norm):
                entry["comparison"] = "required_value_match"
                entry["status"] = "covered"
            elif overlap >= 0.80:
                entry["comparison"] = "probable_value_match"
                entry["status"] = "partial"
            else:
                entry["comparison"] = "required_value_mismatch"
                entry["status"] = "contradictory"
            entry["requiredValue"] = qualitative
            elements.append(entry)
            compared_fields.append(fact.field)

    # 4) General semantic candidates are useful for the LLM only when the requirement
    # has no recognized property at all. If a known engineering property exists but
    # no matching Product field was found, do not inject a generic dimension/text fact
    # into the comparison and let it masquerade as evidence.
    if not elements and not numeric_constraints and not props and not positive_presence and not negative_presence:
        candidates = rank_product_facts(requirement, snapshot, limit=6)
        req_tokens = _tokens(text)
        for item in candidates:
            fact: Fact = item["fact"]
            overlap = len(req_tokens & _tokens(f"{fact.field} {fact.value}")) / max(1, len(req_tokens))
            entry = _build_comparison_element(fact, text, item)
            if overlap >= 0.78 and entry["confidence"] >= 0.84:
                entry["comparison"] = "strong_semantic_match"
                entry["status"] = "covered"
            else:
                entry["comparison"] = "semantic_candidate"
                entry["status"] = "partial"
            elements.append(entry)
            compared_fields.append(fact.field)

    # De-duplicate near-identical elements while keeping the strongest source.
    unique: dict[tuple[str, str, str], dict[str, Any]] = {}
    for e in elements:
        key = (str(e.get("productField")), str(e.get("constraintIndex", "")), str(e.get("comparison")))
        if key not in unique or (e.get("confidence", 0), e.get("matchScore", 0)) > (unique[key].get("confidence", 0), unique[key].get("matchScore", 0)):
            unique[key] = e
    elements = list(unique.values())[:12]

    strong = [
        e for e in elements
        if e["status"] == "covered"
        and e["confidence"] >= 0.82
        and not e["conflict"]
        and (e.get("grounded") is True or bool(e.get("sourceVerified")))
    ]
    contradictions = [
        e for e in elements
        if e["status"] == "contradictory"
        and e["confidence"] >= 0.70
        and not e.get("conflict")
        and (e.get("grounded") is True or bool(e.get("sourceVerified")))
    ]
    conflicts = [e for e in elements if e.get("conflict")]

    ref_matches: list[str] = []
    if refs:
        req_refs = {_norm(r) for r in refs}
        for e in elements:
            found = {_norm(r) for r in _extract_references(str(e.get("observedValue") or ""))}
            if req_refs & found:
                ref_matches.append(str(e["productField"]))

    # Determine whether every recognized obligation is covered. For multi-numeric
    # requirements, one passing constraint is never enough.
    numeric_count = len(numeric_constraints)
    numeric_covered = 0
    numeric_failed = 0
    if numeric_count:
        for idx in range(1, numeric_count + 1):
            cels = [e for e in elements if e.get("constraintIndex") == idx]
            if any(e["status"] == "contradictory" and e["confidence"] >= 0.70 and not e["conflict"] for e in cels):
                numeric_failed += 1
            elif any(e["status"] == "covered" and e["confidence"] >= 0.82 and not e["conflict"] for e in cels):
                numeric_covered += 1

    decision: Optional[str] = None
    method = "product_standard_comparison"
    coverage = "NONE"
    confidence = 0.0
    reason = "No sufficiently strong Product fact was matched to the extracted Standard/Regulation requirement."

    if numeric_count:
        if numeric_failed and not conflicts:
            decision = "FAIL"
            coverage = "COMPLETE"
            bad = max((e for e in elements if e["status"] == "contradictory" and not e["conflict"]), key=lambda e: e["confidence"], default=None)
            confidence = min(0.97, float(bad["confidence"] if bad else 0.72))
            reason = f"{numeric_failed} of {numeric_count} numeric obligation(s) contradict the Product data extracted in Product Management."
            method = "deterministic_product_standard_numeric"
        elif numeric_covered == numeric_count:
            # If a numeric requirement also carries a required feature, require the
            # feature to be covered before allowing PASS.
            feature_elements = [e for e in elements if e.get("feature")]
            if feature_elements and not all(e["status"] == "covered" and e["confidence"] >= 0.82 and not e["conflict"] for e in feature_elements):
                coverage = "PARTIAL"
                confidence = max((e["confidence"] for e in elements), default=0.0)
                reason = "All numeric limits match, but an additional required Product feature is not fully evidenced."
            else:
                decision = "PASS"
                coverage = "COMPLETE"
                confidence = min(0.97, min(float(e["confidence"]) for e in strong if e.get("constraintIndex") is not None)) if numeric_count else 0.0
                reason = f"All {numeric_count} numeric obligation(s) match grounded Product data extracted in Product Management."
                method = "deterministic_product_standard_numeric"
        elif elements:
            coverage = "CONFLICTING" if conflicts else "PARTIAL"
            confidence = max((e["confidence"] for e in elements), default=0.0)
            reason = f"Only {numeric_covered}/{numeric_count} numeric obligation(s) are covered by Product data; semantic evidence review is required."
    elif elements:
        coverage = "CONFLICTING" if conflicts else "PARTIAL"
        confidence = max((e["confidence"] for e in elements), default=0.0)
        if strong and (positive_presence or negative_presence or qualitative) and not is_cert:
            feature_elements = [e for e in elements if e.get("feature")]
            if feature_elements and all(e["status"] == "covered" and e["confidence"] >= 0.82 and not e["conflict"] for e in feature_elements):
                decision = "PASS"
                coverage = "COMPLETE"
                confidence = min(0.95, min(e["confidence"] for e in strong))
                reason = "Grounded Product data directly satisfies the extracted feature/value requirement."
                method = "deterministic_product_standard_attribute"
        elif strong and not is_cert and not requirement.get("appliesIf") and qualitative and props:
            exact_semantic = []
            if snapshot:
                by_field = {f.field: f for f in snapshot.facts.values()}
                for e in strong:
                    f = by_field.get(e.get("productField"))
                    if f and _field_property_hits(f, props) and e.get("comparison") == "required_value_match":
                        exact_semantic.append(e)
            if exact_semantic:
                decision = "PASS"
                coverage = "COMPLETE"
                confidence = min(0.93, max(e["confidence"] for e in exact_semantic))
                reason = "A grounded Product attribute directly matches the qualitative value extracted from the Standards & Regulations Portal."
                method = "deterministic_product_standard_attribute"
        elif contradictions and not conflicts:
            coverage = "COMPLETE"
            decision = "FAIL"
            confidence = min(0.92, max(e["confidence"] for e in contradictions))
            reason = "A grounded Product attribute contradicts the qualitative constraint extracted from the Standards/Regulations Portal."
            method = "deterministic_product_standard_attribute"
        else:
            reason = "Product data provides partial or conflicting coverage; semantic evidence review is required."

    if ref_matches:
        reason += " The Product also contains the same standard/regulation identifier; an identifier alone is not proof of conformity."

    if is_cert and decision == "PASS":
        decision = None
        coverage = "PARTIAL"
        method = "certification_evidence_required"
        confidence = min(confidence, 0.70)
        reason = "The Product references the requested standard/regulation, but certification/conformity still requires documentary evidence."

    if requirement.get("appliesIf") and decision == "PASS":
        decision = None
        coverage = "PARTIAL"
        method = "conditional_semantic_review"
        confidence = min(confidence, 0.72)
        reason = "The Product matches the requirement body, but the extracted applicability condition still requires semantic review."

    if is_cert:
        # A certification/conformity requirement is never a pure attribute match.
        # Even an exact identifier in Product data must be substantiated by the
        # certificate/declaration evidence used by the semantic evidence layer.
        if decision != "N/A":
            decision = None
            coverage = "PARTIAL" if elements else "NONE"
            confidence = min(max(confidence, max((e["confidence"] for e in elements), default=0.0)), 0.70)
            method = "certification_evidence_required"
            reason = "The Product contains certification/regulatory context, but the conformity claim requires documentary evidence from the Product evidence set."

    if standard_quality_warning and decision in {"PASS", "FAIL"}:
        # The Standards & Regulations Portal itself flagged this clause as
        # potentially incomplete. Do not let a partially extracted clause produce
        # an apparently authoritative deterministic verdict. The exact requirement
        # can still be judged semantically against its own evidence.
        decision = None
        coverage = "PARTIAL" if elements else "NONE"
        confidence = min(confidence, 0.65)
        method = "standard_extraction_quality_review"
        reason = "The Standards & Regulations Portal flagged this clause as potentially incomplete; semantic/manual review is required before treating the comparison as an authoritative automatic verdict."

    return {
        **base_payload,
        "productFactsCompared": len(elements),
        "matchedProductFields": list(dict.fromkeys(compared_fields))[:20],
        "elements": elements[:12],
        "numericConstraintCount": numeric_count,
        "numericConstraintsCovered": numeric_covered,
        "numericConstraintsContradicted": numeric_failed,
        "referenceMatches": list(dict.fromkeys(ref_matches)),
        "coverage": coverage,
        "decision": decision,
        "method": method,
        "confidence": round(max(0.0, min(1.0, confidence)), 4),
        "reason": reason,
    }


def comparison_context(comparison: dict[str, Any], max_chars: int = 6000) -> str:
    """Render the comparison as a compact, explicit audit cross-check for the LLM."""
    lines = [
        "PRODUCT ↔ STANDARD/REGULATION CROSS-CHECK",
        f"Portal source: {comparison.get('standardContext', {}).get('portal', 'Standards & Regulations Portal')}",
        f"Standard requirement: {comparison.get('standardRequirement', '')}",
        f"Coverage: {comparison.get('coverage', 'NONE')}",
        f"Pre-judgment: {comparison.get('decision') or 'REQUIRES SEMANTIC REVIEW'}",
        f"Comparison confidence: {float(comparison.get('confidence', 0) or 0):.2f}",
        f"Method: {comparison.get('method', '')}",
    ]
    constraint = comparison.get("elements") or []
    for i, e in enumerate(constraint, start=1):
        src = e.get("source") or "Product extraction"
        page = f", p. {e['page']}" if e.get("page") else ""
        conflict = " [CONFLICTING SOURCE]" if e.get("conflict") else ""
        lines.append(
            f"[P{i}] field={e.get('productField', '')} observed={e.get('observedValue', '')} "
            f"comparison={e.get('comparison', '')} status={e.get('status', '')} "
            f"confidence={float(e.get('confidence', 0) or 0):.2f} source={src}{page}{conflict}"
        )
        if e.get("standardConstraint"):
            lines.append(f"    standardConstraint={e['standardConstraint']}")
        if e.get("normalizedObserved"):
            lines.append(f"    normalizedObserved={e['normalizedObserved']}")
        if e.get("evidence"):
            lines.append(f"    exactProductEvidence={str(e['evidence'])[:420]}")
    if comparison.get("standardReferencesDetected"):
        lines.append(f"Standard/regulation identifiers detected: {', '.join(comparison['standardReferencesDetected'])}")
    if comparison.get("reason"):
        lines.append(f"Comparison note: {comparison['reason']}")
    return "\n".join(lines)[:max_chars]


def reconcile_llm_judgment(
    status: str,
    confidence: float,
    comparison: dict[str, Any],
    supporting_evidence_count: int,
    evidence_refs_count: int,
    *,
    selected_evidence: Optional[list[EvidenceExcerpt]] = None,
    llm_requirement_elements: Optional[list[dict[str, Any]]] = None,
    llm_evidence_assessment: Optional[list[dict[str, Any]]] = None,
) -> tuple[str, float, str]:
    """Reconcile semantic judgment against an independent deterministic comparison.

    The function is intentionally precision-oriented: unsupported PASS/FAIL results,
    contradictory element assessments and scope-gate decisions are not allowed to
    become authoritative compliance findings.
    """
    status = str(status or "MISSING_INFO").upper()
    try:
        conf = max(0.0, min(1.0, float(confidence)))
    except (TypeError, ValueError):
        conf = 0.0

    scope = comparison.get("applicability") if isinstance(comparison.get("applicability"), dict) else {}
    if status == "INCONCLUSIVE":
        reason = str(comparison.get("reason") or "Semantic evaluator did not produce an authoritative conformity decision.")
        if scope.get("scope") == "REVIEW":
            reason = str(scope.get("reason") or reason)
        elif comparison.get("method") == "standard_requirement_not_grounded":
            reason = str(comparison.get("reason") or reason)
        return "INCONCLUSIVE", min(conf, 0.45), reason
    if scope.get("scope") == "OUT_OF_SCOPE" or str(comparison.get("decision") or "").upper() == "N/A":
        return "N/A", max(conf, float(comparison.get("confidence", 0.99) or 0.99)), "Scope gate: this requirement is not an applicable Product/manufacturer conformity obligation."
    if scope.get("scope") == "REVIEW":
        return "INCONCLUSIVE", min(conf, 0.45), "Requirement applicability is ambiguous; the Compliance Engine will not make a product conformity decision until the scope/actor mapping is confirmed."

    decision = str(comparison.get("decision") or "").upper()
    coverage = str(comparison.get("coverage") or "NONE").upper()
    comp_conf = max(0.0, min(1.0, float(comparison.get("confidence", 0.0) or 0.0)))
    elements = comparison.get("elements") or []
    selected_evidence = selected_evidence or []
    llm_requirement_elements = llm_requirement_elements or []
    llm_evidence_assessment = llm_evidence_assessment or []
    explanation = "LLM judgment accepted with Product↔Standard/Regulation cross-check."

    # A high-confidence deterministic contradiction or match is more reproducible
    # than model wording, so it wins when the comparison itself is complete.
    if decision == "FAIL" and comp_conf >= 0.78 and status == "PASS":
        # If the LLM selected documentary evidence that explicitly supports PASS,
        # the deterministic Product fact and the document evidence disagree. Do not
        # pick a winner automatically; surface the conflict for human review.
        llm_supports_any = any(bool(x.get("supports")) for x in llm_evidence_assessment if isinstance(x, dict))
        if llm_supports_any:
                return "MISSING_INFO", min(conf, 0.58), "The Product fact comparison indicates FAIL while selected evidence supports PASS; the conflicting evidence requires human review."
        return "FAIL", round(max(comp_conf, conf * 0.65), 4), "Independent Product↔Standard comparison contradicts the LLM PASS: a grounded Product value violates the extracted requirement."
    if decision == "PASS" and comp_conf >= 0.84 and status == "FAIL":
        # If the LLM has explicit contradiction evidence, the Product profile and
        # documentary evidence disagree. Do not erase that contradiction with a
        # profile-only automatic PASS.
        llm_contradicts_any = any(bool(x.get("contradicts")) for x in llm_evidence_assessment if isinstance(x, dict))
        if llm_contradicts_any:
                return "MISSING_INFO", min(conf, 0.58), "The Product fact comparison indicates PASS while selected evidence contradicts conformity; conflicting evidence requires human review."
        return "PASS", round(max(comp_conf, conf * 0.65), 4), "Independent Product↔Standard comparison corroborates the LLM FAIL as a false negative: a grounded Product attribute satisfies the extracted requirement."

    # Evidence references must be meaningful. A PASS/FAIL with no selected evidence
    # is not an auditable conformity decision unless the deterministic comparator
    # already established the result independently.
    has_external_evidence = any(
        bool((e.source_label or "").strip())
        and "product management profile" not in (e.source_label or "").lower()
        for e in selected_evidence
    )
    support_flags = [bool(x.get("supports")) and not bool(x.get("contradicts")) for x in llm_evidence_assessment if isinstance(x, dict)]
    contradiction_flags = [bool(x.get("contradicts")) for x in llm_evidence_assessment if isinstance(x, dict)]
    element_states = [str(x.get("status") or "").lower() for x in llm_requirement_elements if isinstance(x, dict)]

    # N/A must be justified by an applicability condition or the deterministic
    # scope gate. Otherwise an LLM cannot make an auditable requirement disappear
    # simply because it did not find evidence.
    if status == "N/A" and decision != "N/A":
        applies_if = str(comparison.get("appliesIf") or "").strip()
        has_non_applicable_signal = any(
            isinstance(x, dict)
            and (
                "not applicable" in str(x.get("notes") or "").lower()
                or "does not apply" in str(x.get("notes") or "").lower()
            )
            for x in llm_evidence_assessment
        )
        if not (applies_if and has_non_applicable_signal and selected_evidence):
            return "MISSING_INFO", min(conf, 0.55), "The LLM returned N/A without a verified scope exclusion and traceable evidence that the applicability condition is not met."

    if status == "PASS":
        if not selected_evidence and decision != "PASS":
            return "MISSING_INFO", min(conf, comp_conf or 0.45), "The LLM returned PASS without traceable supporting evidence; conformity is not demonstrated."
        if selected_evidence and not has_external_evidence and decision != "PASS":
            return "MISSING_INFO", min(conf, 0.55), "The available support is only a Product Management profile declaration; documentary conformity evidence is required."
        if element_states and any(s in {"missing", "partial", "contradicted"} for s in element_states):
            if "contradicted" in element_states and contradiction_flags:
                return "FAIL", min(0.90, max(conf, comp_conf)), "The LLM marked a required element as contradicted by evidence; PASS is inconsistent with its own evidence assessment."
            return "MISSING_INFO", min(conf, 0.68), "The LLM's own requirement-element assessment contains missing/partial elements, so overall PASS is not sufficiently demonstrated."
        if llm_evidence_assessment and not any(support_flags):
            return "MISSING_INFO", min(conf, 0.60), "No selected evidence was explicitly assessed as supporting the PASS judgment."

    if status == "FAIL":
        if decision != "FAIL":
            if not selected_evidence and not contradiction_flags:
                return "MISSING_INFO", min(conf, 0.45), "The LLM returned FAIL without traceable contradictory evidence and the Product comparison did not establish a direct violation."
            if llm_evidence_assessment and not any(contradiction_flags):
                return "MISSING_INFO", min(conf, 0.62), "The LLM returned FAIL but its evidence assessment does not identify a contradiction; manual review is required."
        if element_states and all(s == "covered" for s in element_states) and not contradiction_flags and decision != "FAIL":
            return "MISSING_INFO", min(conf, 0.58), "All reported requirement elements are covered, so the LLM FAIL has no internally supported contradiction."

    # Never treat unresolved Product conflicts as a strong PASS.
    if status == "PASS" and coverage == "CONFLICTING":
        return "MISSING_INFO", min(conf, 0.55), "LLM judgment retained only as an unresolved review state because Product data contains conflicting sources."

    if decision == status and comp_conf > 0:
        conf = min(0.99, 0.60 * conf + 0.40 * comp_conf)
        explanation = "LLM judgment corroborated by the independent Product↔Standard/Regulation comparison."
    elif coverage == "CONFLICTING":
        conf = min(conf, 0.55)
        explanation = "LLM judgment retained, but Product data contains unresolved conflicting sources."

    return status, round(conf, 4), explanation
