"""Deterministic, provenance-aware compliance checks.

The compliance engine must consume the structured outputs produced by the
Standards and Product extraction pipelines.  This module deliberately does not
use an LLM.  It handles high-confidence comparisons (numeric limits,
certification presence, simple equality/membership checks) and returns None for
cases that need evidence retrieval or semantic interpretation.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, Iterable, Optional

from app.services.compliance_guard import requirement_scope


_NUM_RE = re.compile(r"(?<![A-Za-z0-9])(-?\d+(?:[ \u00A0]\d{3})*(?:[.,]\d+)?)\s*(kV|V|mV|kHz|Hz|MHz|°C|C|mm|cm|m|kg|g|A|mA|kW|W|%|IP\s*\d{2}[A-Z]?)?\b", re.I)
_LIMIT_RE = re.compile(
    r"(?:up\s+to|maximum(?:\s+of)?|not\s+(?:exceed|greater\s+than)|less\s+than\s+or\s+equal\s+to|no\s+greater\s+than|at\s+most)\s+(?P<value>\d+(?:[ \u00A0]\d{3})*(?:[.,]\d+)?)\s*(?P<unit>kV|V|mV|kHz|Hz|MHz|°C|C|mm|cm|m|kg|g|A|mA|kW|W|%)?",
    re.I,
)
_MIN_RE = re.compile(
    r"(?:at\s+least|not\s+less\s+than|greater\s+than\s+or\s+equal\s+to|minimum(?:\s+of)?|at\s+above)\s+(?P<value>\d+(?:[ \u00A0]\d{3})*(?:[.,]\d+)?)\s*(?P<unit>kV|V|mV|kHz|Hz|MHz|°C|C|mm|cm|m|kg|g|A|mA|kW|W|%)?",
    re.I,
)
_RANGE_RE = re.compile(
    r"between\s+(?P<a>\d+(?:[ \u00A0]\d{3})*(?:[.,]\d+)?)\s*(?P<ua>kV|V|mV|kHz|Hz|MHz|°C|C|mm|cm|m|kg|g|A|mA|kW|W|%)?\s+and\s+(?P<b>\d+(?:[ \u00A0]\d{3})*(?:[.,]\d+)?)\s*(?P<ub>kV|V|mV|kHz|Hz|MHz|°C|C|mm|cm|m|kg|g|A|mA|kW|W|%)?",
    re.I,
)

_UNIT_FACTORS = {
    "mv": ("v", 1e-3), "v": ("v", 1.0), "kv": ("v", 1e3),
    "ma": ("a", 1e-3), "a": ("a", 1.0),
    "w": ("w", 1.0), "kw": ("w", 1e3),
    "hz": ("hz", 1.0), "khz": ("hz", 1e3), "mhz": ("hz", 1e6),
    "mm": ("mm", 1.0), "cm": ("mm", 10.0), "m": ("mm", 1000.0),
    "g": ("g", 1.0), "kg": ("g", 1000.0),
    "c": ("c", 1.0), "°c": ("c", 1.0),
    "%": ("%", 1.0),
}


@dataclass
class Fact:
    field: str
    value: Any
    source: str = "Product extraction"
    page: Optional[int] = None
    confidence: float = 1.0
    document_id: Optional[str] = None
    conflict: bool = False
    evidence: Optional[str] = None
    category: Optional[str] = None
    importance: Optional[str] = None
    grounded: Optional[bool] = None
    unit: Optional[str] = None
    sources: list[dict[str, Any]] = field(default_factory=list)

    @property
    def display(self) -> str:
        return str(self.value)


@dataclass
class ProductSnapshot:
    product_id: Optional[str] = None
    name: str = ""
    facts: Dict[str, Fact] = field(default_factory=dict)
    conflicts: Dict[str, Any] = field(default_factory=dict)
    source_documents: list[str] = field(default_factory=list)

    def find(self, aliases: Iterable[str]) -> Optional[Fact]:
        keys = {a.lower().replace(" ", "_") for a in aliases}
        for k, fact in self.facts.items():
            nk = k.lower().replace(" ", "_")
            if nk in keys or any(alias in nk for alias in keys):
                return fact
        return None

    def search_text(self, terms: Iterable[str]) -> Optional[Fact]:
        low_terms = [t.lower() for t in terms if t]
        for fact in self.facts.values():
            text = f"{fact.field} {fact.value}".lower()
            if all(t in text for t in low_terms):
                return fact
        return None


def _flatten(obj: Any, prefix: str = "") -> Iterable[tuple[str, Any]]:
    if isinstance(obj, dict):
        for k, v in obj.items():
            p = f"{prefix}.{k}" if prefix else str(k)
            if isinstance(v, (dict, list)):
                yield from _flatten(v, p)
            elif v is not None and str(v).strip():
                yield p, v
    elif isinstance(obj, list):
        for idx, v in enumerate(obj):
            p = f"{prefix}[{idx}]"
            if isinstance(v, (dict, list)):
                yield from _flatten(v, p)
            elif v is not None and str(v).strip():
                yield p, v


def build_product_snapshot(payload: Optional[dict], product_document_id: str,
                           allowed_document_ids: Optional[Iterable[str]] = None) -> ProductSnapshot:
    payload = payload or {}
    extracted = payload.get("extractedStructured") if isinstance(payload, dict) else None
    extracted = extracted if isinstance(extracted, dict) else {}
    folder = payload.get("productFolder") if isinstance(payload, dict) else None
    folder = folder if isinstance(folder, dict) else {}
    profile = extracted.get("productProfile") if isinstance(extracted.get("productProfile"), dict) else {}
    merged = folder.get("mergedProfile") if isinstance(folder.get("mergedProfile"), dict) else {}
    # Prefer the product folder's merged profile, then the source document profile.
    merged_sources = [("merged", merged), ("document", profile)]
    facts: Dict[str, Fact] = {}
    allowed = set(str(x) for x in allowed_document_ids) if allowed_document_ids is not None else None
    provenance = folder.get("fieldProvenance") if isinstance(folder.get("fieldProvenance"), dict) else {}
    conflicts = folder.get("fieldConflicts") if isinstance(folder.get("fieldConflicts"), dict) else {}
    for source_kind, source in merged_sources:
        for key, value in _flatten(source):
            norm = key.lower()
            if norm in facts:
                continue
            prov = provenance.get(key) or provenance.get(norm) if source_kind == "merged" else None
            if source_kind == "document":
                field_sources = extracted.get("fieldSources") if isinstance(extracted.get("fieldSources"), dict) else {}
                field_evidence = extracted.get("fieldEvidence") if isinstance(extracted.get("fieldEvidence"), dict) else {}
                quality = extracted.get("extractionQuality") if isinstance(extracted.get("extractionQuality"), dict) else {}
                grounded_fields = quality.get("groundedFields") if isinstance(quality.get("groundedFields"), list) else []
                evidence = field_evidence.get(key) or field_evidence.get(norm)
                prov = {"documentId": product_document_id, "documentName": payload.get("name") or "Product extraction",
                        "source": field_sources.get(key) or field_sources.get(norm),
                        "evidence": evidence, "grounded": True if key in grounded_fields or norm in grounded_fields else None}
            # A merged profile may contain restricted, archived, draft or other
            # product data. Only provenance explicitly linked to the validated
            # document set is allowed into this assessment.
            if allowed is not None:
                source_id = str(prov.get("documentId") or "") if isinstance(prov, dict) else ""
                if not source_id or source_id not in allowed:
                    continue
            source_label = "Product extraction"
            page = None
            document_id = product_document_id
            if isinstance(prov, dict):
                source_label = str(prov.get("documentName") or prov.get("source") or source_label)
                page = prov.get("page") if isinstance(prov.get("page"), int) else None
                document_id = str(prov.get("documentId") or product_document_id)
            elif isinstance(prov, str):
                source_label = prov
            facts[norm] = Fact(
                field=key,
                value=value,
                source=source_label,
                page=page,
                confidence=(float(prov.get("confidence")) if isinstance(prov, dict) and isinstance(prov.get("confidence"), (int, float)) else 0.55),
                document_id=document_id,
                conflict=key in conflicts or norm in conflicts,
                evidence=(str(prov.get("evidence"))[:500] if isinstance(prov, dict) and prov.get("evidence") else None),
                grounded=(provenance_grounded := (prov.get("grounded") if isinstance(prov, dict) and "grounded" in prov else None)),
            )

    # The Product Management folder already contains the merged, source-grounded
    # fact inventory created from multiple Product documents. Consume it directly
    # here instead of forcing the Compliance Engine to rediscover those details
    # from vector chunks. This does not change Product Management; it only enriches
    # the read-only compliance snapshot.
    raw_product_facts = folder.get("productFacts") if isinstance(folder.get("productFacts"), list) else []
    importance_rank = {"critical": 4, "high": 3, "medium": 2, "low": 1}
    for idx, raw_fact in enumerate(raw_product_facts):
        if not isinstance(raw_fact, dict):
            continue
        label = str(raw_fact.get("label") or "").strip()
        value = str(raw_fact.get("value") or "").strip()
        if not label or not value:
            continue
        category = str(raw_fact.get("category") or "other").strip().lower() or "other"
        unit = None if raw_fact.get("unit") is None else str(raw_fact.get("unit") or "").strip() or None
        sources = raw_fact.get("sources") if isinstance(raw_fact.get("sources"), list) else []
        clean_sources = [x for x in sources if isinstance(x, dict)
                         and (allowed is None or str(x.get("documentId") or "") in allowed)]
        if allowed is not None and not clean_sources:
            continue
        # Pick the strongest traceable source for the compliance snapshot rather
        # than assuming the first array entry is authoritative. This is a read-only
        # quality improvement: Product Management still owns the original sources.
        def _source_rank(item: dict) -> tuple[int, int, int]:
            grounded_score = 1 if item.get("grounded") is True else 0
            evidence_score = 1 if str(item.get("evidence") or "").strip() else 0
            named_score = 1 if str(item.get("documentName") or item.get("sourceHint") or "").strip() else 0
            return grounded_score, evidence_score, named_score

        clean_sources.sort(key=_source_rank, reverse=True)
        primary = clean_sources[0] if clean_sources else {}
        source_label = str(primary.get("documentName") or primary.get("sourceHint") or "Product AI fact").strip()
        document_id = str(primary.get("documentId") or product_document_id)
        evidence = str(primary.get("evidence") or "").strip()[:700] or None
        # Grounding from a removed source must not be inherited by an allowed
        # source. Only the chosen source's own grounding can establish proof.
        grounded = primary.get("grounded") if allowed is not None else raw_fact.get("grounded")
        grounded = grounded if isinstance(grounded, bool) else None
        base_conf = 0.62
        if grounded is True:
            base_conf += 0.18
        elif grounded is False:
            base_conf -= 0.20
        if len(clean_sources) >= 2:
            base_conf += 0.06
        base_conf = min(0.99, max(0.20, base_conf))
        if importance_rank.get(str(raw_fact.get("importance") or "").lower(), 0) >= 4:
            base_conf = min(0.99, base_conf + 0.02)
        norm_key = f"productFacts::{category}::{re.sub(r'[^a-z0-9]+', '_', label.lower()).strip('_')}"
        existing = facts.get(norm_key)
        if existing:
            # Prefer the explicit product-fact record because it carries a compact
            # multi-document provenance bundle; keep conflicts visible.
            if len(clean_sources) >= len(existing.sources):
                existing.value = f"{existing.value}; {value}" if existing.value != value else existing.value
            existing.conflict = bool(existing.conflict or raw_fact.get("conflict"))
            continue
        facts[norm_key] = Fact(
            field=label,
            value=value,
            source=source_label,
            page=None,
            confidence=base_conf,
            document_id=document_id,
            conflict=bool(raw_fact.get("conflict")),
            evidence=evidence,
            category=category,
            importance=str(raw_fact.get("importance") or "").strip().lower() or None,
            grounded=grounded,
            unit=unit,
            sources=clean_sources[:20],
        )

    # Product entity/profile fields are complementary to the document-derived
    # profile. They are useful evidence context, but are given lower confidence
    # than a grounded document fact so the comparator does not auto-pass from an
    # unverified manual declaration alone.
    manual_profile = folder.get("manualProfile") if isinstance(folder.get("manualProfile"), dict) else {}
    product_profile_fields = {
        "name": folder.get("name"),
        "description": folder.get("description"),
        "sku": folder.get("sku"),
        "reference": folder.get("reference"),
        "revision": folder.get("revision"),
        "brandName": folder.get("brandName"),
        "productFamily": folder.get("productFamily"),
        "productType": folder.get("productType"),
        "productStatus": folder.get("productStatus"),
        "intendedUse": folder.get("intendedUse"),
        "targetUsers": folder.get("targetUsers"),
        "keyMaterials": folder.get("keyMaterials"),
        "physicalForm": folder.get("physicalForm"),
        "hsTariffCode": folder.get("hsTariffCode"),
        "countryOfOrigin": folder.get("countryOfOrigin"),
        "targetMarkets": folder.get("targetMarkets"),
        "requiredCertifications": folder.get("requiredCertifications"),
        "applicableRegulations": folder.get("applicableRegulations"),
        "industryLabels": folder.get("industryLabels"),
        "productionSites": folder.get("productionSites"),
        "productionProcesses": folder.get("productionProcesses"),
        "criticalSuppliers": folder.get("criticalSuppliers"),
        "productCertifications": folder.get("productCertifications"),
        "categoryTags": folder.get("categoryTags"),
    }
    for key, value in manual_profile.items():
        if not product_profile_fields.get(key):
            product_profile_fields[key] = value
    for key, value in _flatten(product_profile_fields, "productManagement"):
        facts.setdefault(
            key.lower(),
            Fact(
                field=key,
                value=value,
                source="Product Management profile",
                confidence=0.70,
                document_id=product_document_id,
                grounded=None,
            ),
        )
    source_documents = sorted({
        str(f.document_id)
        for f in facts.values()
        if getattr(f, "document_id", None)
    } | {product_document_id})
    return ProductSnapshot(
        product_id=str(folder.get("id") or "") or None,
        name=str(folder.get("name") or extracted.get("title") or ""),
        facts=facts,
        conflicts=conflicts,
        source_documents=source_documents,
    )


def _num(value: Any) -> Optional[float]:
    m = re.search(r"-?\d+(?:[ \u00A0]\d{3})*(?:[.,]\d+)?", str(value))
    if not m:
        return None
    return float(m.group(0).replace(" ", "").replace("\u00a0", "").replace(",", "."))


def _unit(value: Any) -> str:
    s = str(value).strip().lower()
    m = _NUM_RE.search(s)
    return (m.group(2) or "").lower() if m else ""


def _convert(value: float, unit: str) -> tuple[str, float]:
    unit = unit.lower().replace(" ", "")
    return _UNIT_FACTORS.get(unit, (unit, 1.0))[0], value * _UNIT_FACTORS.get(unit, (unit, 1.0))[1]


def _extract_limit(text: str) -> Optional[tuple[str, str, float, str]]:
    m = _LIMIT_RE.search(text or "")
    if m:
        return "max", "inclusive", float(m.group("value").replace(" ", "").replace("\u00a0", "").replace(",", ".")), (m.group("unit") or "")
    m = _MIN_RE.search(text or "")
    if m:
        return "min", "inclusive", float(m.group("value").replace(" ", "").replace("\u00a0", "").replace(",", ".")), (m.group("unit") or "")
    m = _RANGE_RE.search(text or "")
    if m:
        a = float(m.group("a").replace(",", ".")); b = float(m.group("b").replace(",", "."))
        return "range", "inclusive", (a, b), (m.group("ua") or m.group("ub") or "")
    return None


def _choose_numeric_fact(snapshot: ProductSnapshot, req_text: str) -> Optional[Fact]:
    low = req_text.lower()
    aliases = []
    if any(x in low for x in ("voltage", "volt")):
        aliases += ["voltage", "voltagefrequency", "voltagerating", "ratedvoltage"]
    if "frequency" in low or "frequencies" in low:
        aliases += ["frequency", "voltagefrequency", "frequencyrange"]
    if "current" in low:
        aliases += ["current", "currentrating"]
    if any(x in low for x in ("power", "watt")):
        aliases += ["power", "powerrating", "powerconsumption"]
    if any(x in low for x in ("temperature", "°c", "ambient")):
        aliases += ["temperature", "operatingtemperaturerange", "temphumidity"]
    if "ip" in low and "protect" in low:
        aliases += ["iprating", "protectionrating"]
    return snapshot.find(aliases) if aliases else None


def deterministic_check(requirement: Dict[str, Any], snapshot: ProductSnapshot) -> Optional[dict]:
    """Return a decision only for genuinely objective, low-risk checks.

    The engine is deliberately conservative: absence of evidence or a weak
    declaration never becomes PASS. Certification/standard claims remain in the
    evidence/LLM path unless a structured fact explicitly proves the exact claim.
    A shared scope gate is evaluated first so deterministic rules cannot accidentally
    pass a requirement aimed at an importer, Member State, notified body, etc.
    """
    text = str(requirement.get("text") or "").strip()
    if not text:
        return None
    scope = requirement_scope(requirement)
    if scope.get("scope") == "OUT_OF_SCOPE":
        return {
            "status": "N/A",
            "confidence": float(scope.get("confidence", 0.99) or 0.99),
            "reason": str(scope.get("reason") or "Requirement is outside Product conformity scope."),
        }
    if scope.get("scope") == "REVIEW":
        return None
    rtype = str(requirement.get("type") or "").lower()
    if rtype == "informative":
        return {"status": "N/A", "confidence": 0.99,
                "reason": "Informative requirement: not a conformity obligation."}

    # Certification / conformity statements require documentary proof. A product
    # profile containing a standard name is not itself proof of conformity.
    cert_words = any(k in text.lower() for k in (
        "certified", "certification", "certificate", "conformity with",
        "comply with", "shall comply", "declares conformity", "declaration of conformity",
    ))
    if cert_words:
        return None

    limit = _extract_limit(text)
    if not limit:
        return None

    fact = _choose_numeric_fact(snapshot, text)
    # Deterministic numeric comparison is safe when a compatible, non-conflicting
    # product fact exists. The fact's confidence is still carried into the result;
    # low-confidence facts are not promoted to absolute certainty, but the exact
    # numerical relation can be evaluated without an LLM.
    if not fact or fact.conflict:
        return None

    # Extract all number/unit pairs from the fact value and choose only a pair whose
    # unit is compatible with the requirement. This prevents errors such as reading
    # the "50" from "50/60 Hz, 230 V" when the requirement is about voltage.
    pairs = list(_NUM_RE.finditer(str(fact.value)))
    kind, _, target, target_unit = limit

    def compatible(unit: str, expected: str) -> bool:
        if not expected:
            return True
        if not unit:
            return False
        try:
            a, _ = _convert(1.0, unit)
            b, _ = _convert(1.0, expected)
            return a == b
        except Exception:
            return False

    selected = None
    for m in pairs:
        unit = (m.group(2) or "").lower()
        if compatible(unit, target_unit):
            selected = m
            break
    if selected is None and len(pairs) == 1:
        selected = pairs[0]
    if selected is None:
        return None

    fv = float(selected.group(1).replace(" ", "").replace("\u00a0", "").replace(",", "."))
    fu = (selected.group(2) or "").lower()

    if isinstance(target, tuple):
        if not target_unit and not fu:
            return None
        target_u, a = _convert(target[0], target_unit or fu)
        _, b = _convert(target[1], target_unit or fu)
        fact_u, value = _convert(fv, fu or target_unit)
        if fact_u != target_u:
            return None
        ok = a <= value <= b
        return {"status": "PASS" if ok else "FAIL",
                "confidence": min(0.99, max(0.94, fact.confidence)),
                "reason": f"Deterministic range check: {fv} {fu or ''} compared with required range {target[0]}–{target[1]} {target_unit or fu}."}

    if not target_unit and fu:
        target_unit = fu
    fact_u, value = _convert(fv, fu or target_unit)
    target_u, target_v = _convert(target, target_unit or fu)
    if fact_u != target_u:
        return None
    ok = value <= target_v if kind == "max" else value >= target_v
    return {"status": "PASS" if ok else "FAIL",
            "confidence": min(0.99, max(0.94, fact.confidence)),
            "reason": f"Deterministic numeric check: {fv} {fu or ''} compared with requirement {kind} {target} {target_unit or fu}."}
