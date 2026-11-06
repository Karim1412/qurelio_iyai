"""Canonical Standards & Regulations extraction helpers.

Production design:
- page-aware PDF text is the canonical source when available;
- structure detection is deterministic and generic (not ISO-specific);
- TOC/table/page-furniture noise is excluded before sectioning;
- every section keeps page/hierarchy provenance;
- the LLM receives only compact normative clause jobs.
"""
from __future__ import annotations

import bisect
import re
from dataclasses import dataclass
from typing import Any, Dict, Iterable, List, Optional, Tuple


_REQUIREMENT_SENTENCE_RE = re.compile(
    r"(?<=[.!?؟])\s+(?=[^\W_]|\d)|\n(?=\s*(?:[-–—•●▪◦*]|\([A-Za-z0-9]+\)|(?:[A-Za-z]|\d+)[.)])\s+)|\n\s*\n",
    re.UNICODE,
)
_DETERMINISTIC_MODAL_RULES = [
    (re.compile(r"\bshall\s+not\b", re.I), "mandatory", "shall not"),
    (re.compile(r"\bmust\s+not\b", re.I), "mandatory", "must not"),
    (re.compile(r"\bshall\b", re.I), "mandatory", "shall"),
    (re.compile(r"\bmust\b", re.I), "mandatory", "must"),
    (re.compile(r"\bis\s+required\s+to\b|\bare\s+required\s+to\b", re.I), "mandatory", "required"),
    (re.compile(r"\bshould\s+not\b", re.I), "recommended", "should not"),
    (re.compile(r"\bshould\b", re.I), "recommended", "should"),
    (re.compile(r"\bmay\s+not\b", re.I), "mandatory", "may not"),
    (re.compile(r"\bdoit\b|\bdoivent\b|\best\s+tenu(?:e)?\s+de\b|\bsont\s+tenus\s+de\b", re.I), "mandatory", "mandatory"),
    (re.compile(r"\b(?:deve|devono|vietato|debe|deben|muss|müssen|darf\s+nicht)\b|يجب|يتعين|يلتزم|يحظر|لا\s+يجوز", re.I), "mandatory", "mandatory"),
    (re.compile(r"\b(?:devrait|devraient|dovrebbe|dovrebbero|debería|deberían|sollte|sollten)\b|ينبغي", re.I), "recommended", "recommended"),
]

# Editorial callout boxes ("NOTE 1 — ...", "WARNING — risk of electric shock",
# "EXAMPLE: ...") are not requirements and must be skipped. A bare
# .startswith(("NOTE ","WARNING ","EXAMPLE ")) also skips real requirement
# sentences that legitimately start with those words as an ordinary subject
# (e.g. clause 16.1: "Warning signs, nameplates... shall be of sufficient
# durability...") — requiring the separator that actually marks a callout
# (a colon or dash right after the keyword, optionally with a number for NOTE/
# EXAMPLE) avoids silently dropping those.
_EDITORIAL_CALLOUT_RE = re.compile(r"^(?:NOTE\s*\d*\s*[:—–-]|WARNING\s*[:—–-]|EXAMPLE\s*\d*\s*[:—–-])", re.I)

def _sentence_candidates(text: str) -> list[dict[str, str]]:
    parts=[re.sub(r"\s+"," ",p).strip() for p in _REQUIREMENT_SENTENCE_RE.split(text or "") if re.sub(r"\s+"," ",p).strip()]
    out=[]; seen=set()
    for part in parts:
        if len(part)<12 or _EDITORIAL_CALLOUT_RE.match(part): continue
        match=None
        for rx,typ,modal in _DETERMINISTIC_MODAL_RULES:
            if rx.search(part): match=(typ,modal); break
        if not match or len(part.split())<2: continue
        key=re.sub(r"\s+"," ",part).lower()
        if key in seen: continue
        seen.add(key); out.append({"text":part,"type":match[0],"modalVerb":match[1]})
    return out

def semantic_candidates(text: str) -> list[str]:
    """Small, ambiguity-focused candidates for the LLM. Never sends a full clause by default."""
    out=[]; seen=set()
    for part in [re.sub(r"\s+"," ",p).strip() for p in _REQUIREMENT_SENTENCE_RE.split(text or "") if p.strip()]:
        if len(part)<15 or _EDITORIAL_CALLOUT_RE.match(part): continue
        if not re.search(r"\b(?:where|when|if|unless|except|provided that|only if|applicable|permitted|prohibited|not permitted|recommended|may)\b", part, re.I):
            continue
        key=part.lower()
        if key not in seen: seen.add(key); out.append(part[:1600])
    return out[:12]

def deterministic_requirements(text: str) -> list[dict[str, object]]:
    reqs=[]
    for c in _sentence_candidates(text):
        t=str(c["text"]); typ=str(c["type"]); cond=None
        m=re.match(r"^(where|when|if|unless|except(?:\s+when)?|provided\s+that)\b(.+?)(?:,|:)\s+", t, re.I)
        if m:
            cond=m.group(0).strip().rstrip(",:")
            if typ != "mandatory": typ="conditional"
        reqs.append({"text":t,"type":typ,"modalVerb":c["modalVerb"],"appliesIf":cond,"crossReferences":[],"grounded":True,"source":"deterministic"})
    return reqs

def _toc_title_map(page_texts: Optional[List[str]]) -> dict[str,str]:
    if not page_texts: return {}
    mapping={}; scanning=False
    for page in page_texts:
        txt=page or ""
        if re.search(r"\bCONTENTS\b", txt, re.I): scanning=True
        if not scanning: continue
        for raw in txt.splitlines():
            line=_clean(raw)
            m=re.match(r"^(\d+(?:\.\d+)*|Annex\s+[A-Z0-9]+)\s+(.+?)(?:\.{2,}|…+|\s{2,})(\d{1,3})\s*$", line, re.I)
            if not m: continue
            title=_normalize_heading(m.group(2))
            if 1 <= len(title.split()) <= 14 and not re.search(r"\b(?:Clause|Table|Figure)\s+\d+", title, re.I):
                mapping[m.group(1).strip().lower()]=title
    return mapping

_MODAL_RE = re.compile(
    r"\b(?:shall(?:\s+not)?|must(?:\s+not)?|is\s+required\s+to|are\s+required\s+to|"
    r"should(?:\s+not)?|is\s+prohibited\s+to|are\s+prohibited\s+to|"
    r"doit|doivent|ne\s+doit\s+pas|est\s+tenu(?:e)?\s+de|sont\s+tenus\s+de|"
    r"deve|devono|vietato|debe|deben|muss|müssen|devrait|devraient|dovrebbe|"
    r"dovrebbero|debería|deberían|sollte|sollten)\b|يجب|يتعين|يلتزم|يحظر|لا\s+يجوز|ينبغي",
    re.IGNORECASE,
)

_WORD_KINDS = r"Annex|Annexe|Anexo|Allegato|Anhang|الملحق|Appendix|Schedule|Article|Articolo|Artículo|Articulo|Artikel|المادة|Section|Sección|Sezione|Abschnitt|Clause|Chapter|Chapitre|Capítulo|Capitolo|Kapitel|Part|Parte"
_ANNEX_KINDS = {"annex", "annexe", "anexo", "allegato", "anhang", "الملحق", "appendix", "schedule"}
_WORD_HEADING_RE = re.compile(
    rf"^(?P<kind>{_WORD_KINDS})\s+"
    r"(?P<ref>(?:\d+[A-Z0-9._-]*|[A-Z]{1,8}(?:\.\d+)*))(?:\s*[-:–—]\s*|\s+)(?P<title>.+)$",
    re.IGNORECASE,
)
_NUMERIC_HEADING_RE = re.compile(
    r"^(?P<ref>[A-Z]?\d{1,4}(?:\.\d{1,4}){0,8})(?:[.)])?(?:\s+|$)(?P<title>.*)$"
)
_SPECIAL_HEADINGS = {
    "foreword": "Foreword",
    "national foreword": "National foreword",
    "european foreword": "European foreword",
    "introduction": "Introduction",
    "scope": "Scope",
    "purpose": "Purpose",
    "normative references": "Normative references",
    "informative references": "Informative references",
    "conformance": "Conformance",
    "compliance": "Compliance",
    "contents": "Contents",
    "definitions": "Definitions",
    "terms and definitions": "Terms and definitions",
}
_COMMON_HEADING_SPACING = {
    "normativereferences": "Normative references",
    "informativereferences": "Informative references",
    "termsanddefinitions": "Terms and definitions",
    "termsdefinitionsandabbreviatedterms": "Terms, definitions and abbreviated terms",
    "abbreviatedterms": "Abbreviated terms",
    "generalrequirements": "General requirements",
    "generalconsiderations": "General considerations",
    "safetyofmachinery": "Safety of machinery",
    "electricalequipmentofmachines": "Electrical equipment of machines",
    "technicaldocumentation": "Technical documentation",
    "markingwarningsandreferencedesignations": "Marking, warnings and reference designations",
}


def _clean(text: str) -> str:
    return re.sub(r"\s+", " ", (text or "").strip()).strip(" \t•·")


def _normalize_heading(text: str) -> str:
    s = _clean(text)
    key = re.sub(r"[^a-z0-9]+", "", s.lower())
    if key in _COMMON_HEADING_SPACING:
        return _COMMON_HEADING_SPACING[key]
    return s


def _looks_like_toc_page(page_text: str) -> bool:
    lines = [_clean(x) for x in (page_text or "").splitlines() if _clean(x)]
    if len(lines) < 8:
        return False
    # Tables and dense regulatory pages can contain many numbered rows and
    # trailing numbers. A genuine obligation makes skipping the whole page unsafe.
    if any(_MODAL_RE.search(line) and len(line.split()) >= 5 for line in lines):
        return False
    leader_count = sum(1 for line in lines if re.search(r"(?:\.{3,}|…+|\s+\d{1,3}\s*$)", line))
    numbered_count = sum(
        1 for line in lines
        if re.match(r"^(?:[A-Z]?\d+(?:\.\d+){0,7}|Annex\s+[A-Z0-9])\b", line, re.I)
    )
    return leader_count >= 5 and numbered_count >= 4


def _is_table_page(page_text: str) -> bool:
    s = page_text or ""
    return bool(
        re.search(r"\bTable\s+[A-Z][A-Z0-9. -]*", s, re.I)
        or re.search(r"\bPublication\s+Year\s+Title\b", s, re.I)
        or re.search(r"\bParameter\s+Value\b", s, re.I)
    )


def _page_furniture(line: str) -> bool:
    s = _clean(line)
    if not s:
        return True
    if re.fullmatch(r"(?:page\s*)?\d+(?:\s*[–-]\s*\d+)?", s, re.I):
        return True
    if re.fullmatch(r"(?:BS\s+EN(?:\s+(?:ISO|IEC))?|EN\s+(?:ISO|IEC)|EN|IEC|ISO)\s+\d{2,6}(?:[-‑–—/.]\d+[A-Z]?)?(?:\s*:\s*\d{4})?(?:\s*[–-]\s*\d{1,3})?", s, re.I):
        return True
    return False


def _find_main_body_start(page_texts: List[str]) -> Optional[int]:
    strong = re.compile(r"^(?:1|1\.)\s+(?:scope|general|introduction|purpose|requirements)\b", re.I)
    # Regulations/directives structured as "Article 1", "Article 2", ... rarely
    # have an ISO-style "1 Scope" anchor line anywhere in the document; the
    # first numbered Article/Section/Chapter IS the start of the normative body.
    word_based = re.compile(rf"^(?:{_WORD_KINDS})\s*1\b", re.I)
    for page_no, page_text in enumerate(page_texts, start=1):
        if _looks_like_toc_page(page_text):
            continue
        for line in (page_text or "").splitlines():
            cleaned = _clean(line)
            if strong.match(cleaned) or word_based.match(cleaned):
                return page_no
    return None


def _numeric_heading_is_plausible(ref: str, title: str, full_line: str) -> bool:
    title = _normalize_heading(title)
    if not title or len(title) > 180:
        return False
    if re.search(r"[.:;!?]$", title):
        return False
    if re.match(r"^[^A-Za-zÀ-ÿ0-9]", title):
        return False
    if re.search(r"\.{3,}|…+", full_line):
        return False
    if re.search(r"(?:https?://|©)", title, re.I):
        return False
    words = title.split()
    if len(words) > 18:
        return False
    if re.search(r"\b(?:shall|must|should|required|prohibited)\b", title, re.I):
        if len(words) > 8 or re.search(r"\b(?:shall|must|should)\b", title, re.I):
            return False
    # Reject table rows / cross-reference cells masquerading as headings.
    refs = re.findall(r"\b\d+(?:\.\d+)+\b", title)
    alpha_words = [w for w in words if re.search(r"[A-Za-zÀ-ÿ]", w)]
    digit_chars = sum(ch.isdigit() for ch in title)
    slash_count = title.count("/")
    if len(refs) >= 2 and len(alpha_words) <= 4:
        return False
    if len(title) >= 12 and digit_chars / max(len(title), 1) > 0.22 and len(alpha_words) <= 8:
        return False
    if slash_count >= 2 and len(alpha_words) <= 8:
        return False
    if re.match(r"^(?:V|A|W|VA|Hz|mm|cm|m|kg|N|Ω|%)\b", title, re.I):
        return False
    if re.match(r"^(?:\d[\d .,/-]*$)", title):
        return False
    # Correlation-table rows (Annex ZA/ZZA/ZZB "Clause(s) — Directive article"
    # style tables) read like "3, 11.1, 11.2 Refer to 2a) to 2d) and 3a) to
    # 3c) in ..." or "Clause 15, Clause 16," — several bare clause references
    # dressed up with enough words to slip past the digit-density check above.
    if re.search(r"\brefer\s+to\b", title, re.I):
        return False
    if len(re.findall(r"\bClause\s+\d", title, re.I)) >= 2:
        return False
    return True


def _parse_heading(line: str) -> Tuple[Optional[str], str, str, int]:
    s = _clean(line)
    if not s:
        return None, "", "unknown", 0

    if s.lower() in _SPECIAL_HEADINGS:
        return None, _SPECIAL_HEADINGS[s.lower()], "front_matter", 0

    bare = re.fullmatch(rf"(?P<kind>{_WORD_KINDS})\s+(?P<ref>\d+[A-Z]?|[A-Z]{{1,8}}(?:\.\d+)*)[.)]?", s, re.I)
    if bare:
        kind = bare.group("kind")
        ref = f"{kind} {bare.group('ref')}"
        return ref, ref, "annex" if kind.casefold() in _ANNEX_KINDS else "section", 1

    m = _NUMERIC_HEADING_RE.match(s)
    if m and _numeric_heading_is_plausible(m.group("ref"), m.group("title"), s):
        ref = m.group("ref")
        title = _normalize_heading(m.group("title")) or ref
        typ = "definition" if re.match(r"^(3(?:\.1)+|[A-Z]\.1(?:\.|$))", ref) and title[:1].islower() else "clause"
        return ref, title[:512], typ, ref.count(".") + 1

    m = _WORD_HEADING_RE.match(s)
    if m:
        kind = m.group("kind")
        ref = f"{kind} {m.group('ref')}"
        title = _normalize_heading(m.group("title")) or ref
        if re.search(r"[.:;!?]$", title) or len(title.split()) > 14:
            return None, "", "unknown", 0
        typ = "annex" if kind.casefold() in _ANNEX_KINDS else "section"
        return ref, title[:512], typ, 1

    if re.match(r"^(?:Annex|Appendix|Schedule)\s+[A-Z0-9][A-Z0-9._-]*\s*$", s, re.I):
        return s, s, "annex", 1

    return None, "", "unknown", 0


def _heading_candidate(lines: List[str], idx: int) -> Optional[Tuple[str | None, str, str, int, int]]:
    line = _clean(lines[idx])
    if not line or _page_furniture(line):
        return None
    # Legal documents often place "Article 3" on its own line, sometimes
    # followed directly by the obligation rather than by a short title.
    bare = re.fullmatch(rf"(?P<kind>{_WORD_KINDS})\s+(?P<ref>\d+[A-Z]?|[A-Z]{{1,8}}(?:\.\d+)*)[.)]?", line, re.I)
    if bare:
        kind = bare.group("kind")
        ref = f"{kind} {bare.group('ref')}"
        typ = "annex" if kind.casefold() in _ANNEX_KINDS else "section"
        nxt = _clean(lines[idx + 1]) if idx + 1 < len(lines) else ""
        title = nxt if (nxt and 1 <= len(nxt.split()) <= 16 and not re.search(r"[.!?:]$", nxt) and not _MODAL_RE.search(nxt) and not re.match(r"^(?:\(?\d+[.)]|\(?[a-z]\))\s", nxt, re.I)) else ref
        return ref, _normalize_heading(title)[:512], typ, 1, idx
    ref, title, typ, level = _parse_heading(line)
    if ref is not None or typ == "front_matter":
        return ref, title, typ, level, idx

    # Wrapped headings: a standalone number on one line followed by a short title.
    # This path used to skip _numeric_heading_is_plausible entirely (only the
    # main _NUMERIC_HEADING_RE branch above called it), and only rejected a
    # trailing ".", "!" or "?" — not ":". A clause number that happens to end
    # a line (e.g. a forward cross-reference to "18.2" inside clause 14's
    # text), immediately followed by an unrelated short lead-in sentence like
    # "This protective measure comprises both:", satisfied every check here
    # and was accepted as the start of clause 18.2 — up to 50+ pages before
    # the real clause 18 actually began, silently swallowing everything
    # detected in between into one bloated, wrongly-labelled section.
    m = re.fullmatch(r"(?P<ref>[A-Z]?\d{1,4}(?:\.\d{1,4}){0,8})[.)]?", line)
    if m and idx + 1 < len(lines):
        nxt = _clean(lines[idx + 1])
        if (
            1 <= len(nxt.split()) <= 14
            and not re.search(r"[.!?:]$", nxt)
            and _numeric_heading_is_plausible(m.group("ref"), nxt, f"{line} {nxt}")
        ):
            ref = m.group("ref")
            title = _normalize_heading(nxt)
            typ = "definition" if re.match(r"^3\.1(?:\.|$)", ref) and title[:1].islower() else "clause"
            return ref, title, typ, ref.count(".") + 1, idx

    # Wrapped word-kind headings: "Article 1" / "Section 3" / "Chapter II" alone
    # on a line, title on the next -- the standard layout in EU regulations and
    # directives (article number and title are typically set in different
    # font styles/weights, so they land as separate lines in extracted PDF
    # text). Without this, such documents have literally no headings recognised
    # anywhere and produce zero sections end to end.
    return None


def _parent_ref(ref: Optional[str]) -> Optional[str]:
    if not ref or not re.match(r"^[A-Z]?\d+(?:\.\d+)+$", ref):
        return None
    return ref.rsplit(".", 1)[0]


def build_page_ranges(page_texts: Optional[List[str]]) -> List[Tuple[int, int, int]]:
    if isinstance(page_texts, int) or not page_texts:
        return []
    out: List[Tuple[int, int, int]] = []
    cursor = 0
    for page_no, text in enumerate(page_texts, start=1):
        text = (text or "").strip()
        start = cursor
        cursor += len(text)
        out.append((start, cursor, page_no))
        cursor += 2
    return out


def page_for_offset(ranges: List[Tuple[int, int, int]], offset: int) -> Optional[int]:
    for start, end, page_no in ranges:
        if start <= offset <= end:
            return page_no
    return None


@dataclass
class StandardSection:
    clause_number: Optional[str]
    heading: str
    text: str
    start_char: int
    end_char: int
    order: int
    normative_candidate: bool
    page_start: Optional[int] = None
    page_end: Optional[int] = None
    section_type: str = "clause"
    hierarchy_level: int = 0
    parent_clause: Optional[str] = None

    def _display_heading(self) -> str:
        # Headings are shown as "Clause 1", "Clause 1.1", "Clause 1.1.1" instead
        # of the descriptive title extracted from the PDF (e.g. "Scope") — the
        # descriptive title is kept under "title" below, still useful context for
        # the LLM prompt, search and audits.
        if self.clause_number:
            if (self.clause_number.split() or [""])[0].casefold() in _ANNEX_KINDS:
                return self.clause_number
            return f"Clause {self.clause_number}"
        return self.heading  # unnumbered front matter: Foreword, Introduction, National foreword...

    def as_dict(self) -> Dict[str, Any]:
        return {
            "clauseNumber": self.clause_number,
            "heading": self._display_heading()[:512],
            "title": self.heading[:512],
            "content": self.text,
            "bullets": [],
            "summary": None,
            "importantNotes": None,
            "mandatory": False,
            "category": None,
            "requirements": [],
            "sourceStart": self.start_char,
            "sourceEnd": self.end_char,
            "normativeCandidate": self.normative_candidate,
            "pageStart": self.page_start,
            "pageEnd": self.page_end,
            "sectionType": self.section_type,
            "hierarchyLevel": self.hierarchy_level,
            "parentClause": self.parent_clause,
        }


def _dedupe_sections(sections: List[StandardSection]) -> List[StandardSection]:
    out: List[StandardSection] = []
    seen_keys: dict[str, StandardSection] = {}
    for sec in sections:
        key = re.sub(r"\s+", " ", f"{sec.clause_number or ''}|{sec.heading}").strip().lower()
        if key and key != "|" and key in seen_keys:
            prev = seen_keys[key]
            if sec.text and prev.text and sec.text != prev.text:
                if sec.text not in prev.text and prev.text not in sec.text:
                    prev.text = f"{prev.text}\n\n{sec.text}".strip()
                elif len(sec.text) > len(prev.text):
                    prev.text = sec.text
            elif sec.text and not prev.text:
                prev.text = sec.text
            prev.page_end = sec.page_end or prev.page_end
            prev.end_char = max(prev.end_char, sec.end_char)
            prev.normative_candidate = prev.normative_candidate or sec.normative_candidate
            continue
        out.append(sec)
        if key and key != "|":
            seen_keys[key] = sec
    for idx, sec in enumerate(out):
        sec.order = idx
    return out


def _filter_structural_candidates(sections: List[StandardSection]) -> List[StandardSection]:
    """Remove numeric/table/figure noise using document-order continuity."""
    kept: List[StandardSection] = []
    last_numeric_root: Optional[int] = None
    seen_numeric_refs: set[str] = set()
    for sec in sections:
        ref = (sec.clause_number or "").strip()
        if ref:
            # L1/L2/etc are figure/table labels, not generic numeric clauses.
            if re.match(r"^[A-Z]\d+$", ref) and not re.match(r"^[A-DH-Z]\.\d", ref):
                continue
            m = re.match(r"^(\d+)(?:\.|$)", ref)
            if m:
                root = int(m.group(1))
                # Numeric clause roots should move forward through the document.
                # This eliminates TOC/table/figure references encountered later in prose.
                if last_numeric_root is not None and root < last_numeric_root:
                    continue
                if ref.lower() in seen_numeric_refs:
                    continue
                # Do not accept a one-digit ref with a title that looks like a figure/list label.
                if re.fullmatch(r"\d", ref) and not sec.heading[:1].isupper():
                    continue
                last_numeric_root = max(last_numeric_root or root, root)
                seen_numeric_refs.add(ref.lower())
        kept.append(sec)
    return kept


def _include_unheaded_opening(sections: List[StandardSection], text: str,
                               ranges: List[Tuple[int, int, int]],
                               page_texts: Optional[List[str]]) -> List[StandardSection]:
    """Do not silently omit content before the first recognized heading."""
    if not sections or sections[0].start_char <= 0:
        return sections
    end = sections[0].start_char
    pieces: List[str] = []
    included_pages: List[int] = []
    if page_texts and ranges:
        for start, stop, page in ranges:
            if start >= end:
                break
            if _looks_like_toc_page(page_texts[page - 1]):
                continue
            part = text[start:min(stop, end)].strip()
            if part:
                pieces.append(part)
                included_pages.append(page)
    else:
        part = text[:end].strip()
        if part:
            pieces.append(part)
    opening = "\n\n".join(pieces)
    if not opening:
        return sections
    preamble = StandardSection(None, "Unnumbered opening", opening, 0, end, 0,
                               bool(_MODAL_RE.search(opening)),
                               included_pages[0] if included_pages else None,
                               included_pages[-1] if included_pages else None,
                               "front_matter")
    return [preamble, *sections]


def detect_standard_sections(raw_text: str, page_texts: Optional[List[str]] = None) -> List[StandardSection]:
    # If page-aware text exists, it is the canonical source. The flat pypdf text
    # may be in PDF-object order and can corrupt section offsets/content.
    if page_texts:
        # Retain separators for empty leading pages so character offsets and
        # physical page numbers continue to match the stored canonical source.
        text = "\n\n".join((p or "").strip() for p in page_texts)
    else:
        text = (raw_text or "").replace("\r\n", "\n").replace("\r", "\n")
    if not text.strip():
        return []

    ranges = build_page_ranges(page_texts)
    if not page_texts:
        return _detect_flat_text(text, ranges)

    sections: List[StandardSection] = []
    main_start = _find_main_body_start(page_texts)
    main_started = False
    cursor = 0

    for page_no, page_text in enumerate(page_texts, start=1):
        page_text = (page_text or "").strip()
        if not page_text.strip():
            cursor += 2
            continue
        if _looks_like_toc_page(page_text):
            cursor += len(page_text) + 2
            continue
        # Pair each cleaned, non-blank line with its real character offset in
        # page_text. A later `page_text.find(lines[idx])` lookup would return
        # the position of the FIRST occurrence of that exact line text, so any
        # short/repeated line (a bare "1" in a table, a recurring cross-
        # reference like "Clause 15") collapses onto the same start_char as
        # an earlier, unrelated candidate — that in turn desyncs the
        # start-of-next-section lookup below and made dozens of spurious
        # headings inherit the real Scope clause's body text. Tracking the
        # true offset per line avoids the collision entirely.
        line_offsets: List[int] = []
        lines: List[str] = []
        _cursor_probe = 0
        for _raw in page_text.splitlines(keepends=True):
            _cleaned = _clean(_raw)
            if _cleaned:
                lines.append(_cleaned)
                line_offsets.append(_cursor_probe)
            _cursor_probe += len(_raw)
        table_page = _is_table_page(page_text)
        if main_start is not None and page_no >= main_start:
            main_started = True

        for idx in range(len(lines)):
            cand = _heading_candidate(lines, idx)
            if cand is None:
                continue
            ref, title, typ, level, _ = cand
            if not main_started:
                # A numbered clause/article heading of ANY numbering convention
                # (ISO "5.3.1", or word-based "Article 1"/"Section 1"/"Chapter 1")
                # is itself proof we've reached the normative body, even when
                # _find_main_body_start()'s ISO-specific anchor ("1 Scope" /
                # "1 General" / ...) never matched -- regulations/directives are
                # commonly structured purely as "Article 1", "Article 2", ... with
                # no such anchor line anywhere in the document. Without this, the
                # whole document stays flagged as front matter and EVERY article
                # heading below gets silently dropped by the `continue` below,
                # leaving no sections at all to extract requirements from.
                starts_body = bool(ref) and typ in {"clause", "section"}
                if starts_body:
                    main_started = True
                # Preserve front matter/annex identity but never turn TOC/table
                # rows into clauses.
                elif typ not in {"front_matter", "annex"}:
                    continue
                if table_page and typ == "clause":
                    continue
            if main_started and typ == "front_matter":
                continue
            if ref and typ in {"clause", "section"}:
                main_started = True

            # Cover title immediately before Clause 1 is document identity, not a clause.
            if ref and ref.lower().startswith("part "):
                if idx + 1 < len(lines) and re.match(r"^1(?:[.)])?\s+", lines[idx + 1]):
                    continue

            start = cursor + line_offsets[idx]
            sections.append(
                StandardSection(
                    clause_number=ref,
                    heading=title,
                    text="",
                    start_char=start,
                    end_char=start,
                    order=len(sections),
                    normative_candidate=False,
                    page_start=page_no,
                    page_end=page_no,
                    section_type=typ,
                    hierarchy_level=level,
                    parent_clause=_parent_ref(ref),
                )
            )
        cursor += len(page_text) + 2

    # Remove the title banner when Clause 1 immediately follows it on the same page.
    cleaned: List[StandardSection] = []
    for i, sec in enumerate(sections):
        if sec.page_start == main_start and sec.clause_number and sec.clause_number.lower().startswith("part "):
            nxt = sections[i + 1] if i + 1 < len(sections) else None
            if nxt and nxt.clause_number == "1":
                continue
        cleaned.append(sec)
    # Unnumbered front-matter words such as "Definitions" can come from table cells.
    # Preserve real definitions only when they have an actual hierarchical reference.
    cleaned=[sec for sec in cleaned if not (sec.clause_number is None and sec.page_start and main_start and sec.page_start < main_start and sec.heading.strip().lower() in {"definitions","normative references","general requirements"})]
    sections = _filter_structural_candidates(cleaned)
    if not sections:
        # Page-aware PDFs without recognizable headings still need a complete
        # review; otherwise their entire contents silently disappear.
        fallback = _fallback_sections(text)
        for sec in fallback:
            sec.page_start = page_for_offset(ranges, sec.start_char)
            sec.page_end = page_for_offset(ranges, max(sec.start_char, sec.end_char - 1))
        return fallback
    if any(re.fullmatch(r"\d+(?:\.\d+)*", (x.clause_number or "")) for x in sections):
        sections = [x for x in sections if not (x.clause_number and re.match(r"^Part\s+\d+$", x.clause_number, re.I) and (x.page_start or 0) > (main_start or 0))]

    # Look up each section's own end boundary by its start_char via bisect,
    # rather than assuming `sections[i]` lines up with `starts[i]` — several
    # sections can legitimately share a start_char (now much rarer after the
    # offset fix above, but still possible for a genuinely empty heading), and
    # indexing into `starts` by the `sections` position would silently
    # misassign one section's text to another.
    starts = sorted({s.start_char for s in sections})
    for sec in sections:
        pos = bisect.bisect_right(starts, sec.start_char)
        end = starts[pos] if pos < len(starts) else len(text)
        sec.end_char = end
        chunk = text[sec.start_char:end]
        body_lines = chunk.splitlines()
        if body_lines:
            body_lines = body_lines[1:]
        sec.text = "\n".join(body_lines).strip()
        sec.normative_candidate = bool(_MODAL_RE.search(sec.text)) and sec.section_type not in {"front_matter", "definition"}
        sec.page_end = page_for_offset(ranges, max(sec.start_char, end - 1)) or sec.page_end

    sections = _include_unheaded_opening(sections, text, ranges, page_texts)
    sections = _dedupe_sections(sections)
    toc_titles = _toc_title_map(page_texts)
    for sec in sections:
        ref=(sec.clause_number or "").strip().lower()
        if ref in toc_titles and sec.section_type in {"clause", "annex"}:
            sec.heading = toc_titles[ref]
    return sections


def _detect_flat_text(text: str, ranges: List[Tuple[int, int, int]]) -> List[StandardSection]:
    lines = text.splitlines(True)
    starts: List[Tuple[int, str]] = []
    cursor = 0
    prev_blank = True
    for raw_line in lines:
        line = raw_line.rstrip("\n")
        candidate = _heading_candidate([line], 0) if prev_blank else None
        if candidate:
            starts.append((cursor, line.strip()))
        prev_blank = not line.strip()
        cursor += len(raw_line)
    if not starts:
        return _fallback_sections(text)
    out: List[StandardSection] = []
    for i, (start, header) in enumerate(starts):
        end = starts[i + 1][0] if i + 1 < len(starts) else len(text)
        ref, title, typ, level = _parse_heading(header)
        body = text[start:end].splitlines()[1:]
        body_text = "\n".join(body).strip()
        out.append(StandardSection(ref, title, body_text, start, end, i, bool(_MODAL_RE.search(body_text)), page_for_offset(ranges, start), page_for_offset(ranges, max(start, end - 1)), typ, level, _parent_ref(ref)))
    return _dedupe_sections(_include_unheaded_opening(out, text, ranges, None))


def _fallback_sections(text: str, max_chars: int = 7000) -> List[StandardSection]:
    out: List[StandardSection] = []
    pos = 0
    order = 0
    while pos < len(text):
        end = min(len(text), pos + max_chars)
        if end < len(text):
            # Split at a paragraph/sentence boundary, never in the middle of a
            # requirement. A single long passage is retained for explicit review.
            candidates = list(re.finditer(r"\n\s*\n|(?<=[.!?؟])\s+", text[pos:end]))
            if candidates:
                end = pos + candidates[-1].end()
            else:
                following = re.search(r"\n\s*\n|(?<=[.!?؟])\s+", text[end:])
                end = end + following.end() if following else len(text)
        chunk = text[pos:end].strip()
        if chunk:
            out.append(StandardSection(None, f"Section {order + 1}", chunk, pos, end, order, bool(_MODAL_RE.search(chunk))))
            order += 1
        pos = max(end, pos + 1)
    return out


def group_normative_sections(sections: Iterable[StandardSection], max_chars: int = 6500, max_sections: int = 3) -> List[List[StandardSection]]:
    groups: List[List[StandardSection]] = []
    current: List[StandardSection] = []
    size = 0
    for sec in sections:
        if not sec.normative_candidate:
            continue
        block_len = len(sec.text) + len(sec.heading) + 180
        if current and (size + block_len > max_chars or len(current) >= max_sections):
            groups.append(current)
            current = []
            size = 0
        current.append(sec)
        size += block_len
    if current:
        groups.append(current)
    return groups


def _extract_reference(text: str, iso_hint: Optional[str]) -> Optional[str]:
    legal = re.compile(
        r"\b(?:Regulation|Directive)\s*(?:\((?:EU|EC|EEC)\)\s*)?(?:No\.?\s*)?\d{2,4}\s*/\s*\d{1,4}(?:\s*/\s*(?:EU|EC|EEC))?\b"
        r"|\b\d{1,2}\s+CFR\s+(?:Part\s+)?\d+(?:\.\d+)?\b", re.I,
    )
    match = legal.search(iso_hint or "")
    if match:
        return re.sub(r"\s+", " ", match.group(0)).strip()
    if iso_hint:
        m = re.search(r"(?:BS\s*)?(?:EN|ISO|IEC|ASTM|ANSI|DIN|JIS|IEEE|UL|NF)\s*[A-Z0-9]+(?:\s*[-/‑–—]\s*[A-Z0-9]+)*(?:\s*:\s*\d{4})?", iso_hint, re.I)
        # A genuine reference always has a part/year separator ("-1:2018",
        # ":2015", "-1"). Without one, this "match" is almost certainly the
        # document-service autoReference() placeholder (e.g. "EN6020847482":
        # 6 title chars + a Date.now() timestamp glued straight after the
        # prefix) rather than a real standard code — that placeholder still
        # satisfies the loose EN/ISO/IEC... + alphanumerics pattern above, so
        # without this check it would silently short-circuit the real,
        # perfectly extractable reference sitting in the PDF text below.
        if m and re.search(r"[-‑–—:/]", m.group(0)):
            return re.sub(r"\s+", " ", m.group(0)).strip()
    patterns = [
        r"\b(?:BS\s+)?EN\s+\d{3,6}(?:[-‑–—]\d+[A-Z]?)?\s*:\s*\d{4}\b",
        r"\b(?:ISO|IEC|ASTM|ANSI|DIN|JIS|IEEE|UL|NF)\s+\d{3,6}(?:[-‑–—]\d+[A-Z]?)?\s*:\s*\d{4}\b",
    ]
    candidates: List[tuple[int, str]] = [(match.start(), match.group(0)) for pat in patterns for match in re.finditer(pat, text[:30000], re.I)]
    candidates.extend((match.start(), match.group(0)) for match in legal.finditer(text[:30000]))
    if not candidates:
        return None
    return re.sub(r"\s+", " ", min(candidates, key=lambda item: item[0])[1]).strip()


def _extract_standard_title(text: str, file_name: str) -> str:
    flat = re.sub(r"\s+", " ", text[:24000])
    patterns = [
        r"(Safety of machinery\s*-\s*Electrical equipment of machines\s*-\s*Part\s*1\s*:\s*General requirements)",
        r"(Safety of machinery\s*-\s*Electrical equipment of machines[^\n]{0,180})",
    ]
    for pat in patterns:
        m = re.search(pat, flat, re.I)
        if m:
            title = re.sub(r"\s+", " ", m.group(1)).strip(" .")
            title = re.sub(r"\s*[-‑–—]\s*", " - ", title)
            return re.sub(r" {2,}", " ", title).strip()[:512]
    lines = [_clean(x) for x in text[:12000].splitlines() if _clean(x)]
    for line in lines[:80]:
        if re.search(r"\b(?:requirements|specification|safety|equipment|standard|code)\b", line, re.I) and 18 <= len(line) <= 220:
            if not re.search(r"\b(?:foreword|committee|ISBN|ICS|copyright|publication)\b", line, re.I):
                return _normalize_heading(line)
    return file_name or "Standard"


def _extract_normative_references(text: str) -> List[str]:
    # Conservative identity extraction: only real publication-like references.
    patterns=[
        r"\b(?:BS\s+)?(?:EN|HD|ISO|IEC|ASTM|ANSI|DIN|JIS|IEEE|UL|NF)\s*\d{3,6}(?:\s*[-/]\s*[A-Z0-9]+)*(?:\s*[: ]\s*(?:19|20)\d{2})?\b",
        r"\b(?:21\s+CFR|EC)\s*[A-Z0-9 .-]{2,30}\b",
    ]
    out=[]; seen=set()
    for pat in patterns:
        for ref in re.findall(pat,text[:120000],re.I):
            r=re.sub(r"\s+"," ",str(ref)).strip(" .,;:)")
            # A publication year separated by whitespace is edition metadata, not part of identity.
            r=re.sub(r"\s+(?:19|20)\d{2}$", "", r)
            if re.fullmatch(r"(?:19|20)\d{2}",r): continue
            if re.search(r"\bIEC\s+20(?:0|1|2)\d\s*[–-]",r,re.I): continue
            key=re.sub(r"[^a-z0-9]","",r.lower())
            if len(key)<5 or key in seen: continue
            seen.add(key); out.append(r)
            if len(out)>=100: return out
    return out


def detect_standard_metadata(raw_text: str, iso_hint: Optional[str], file_name: str = "") -> Dict[str, Any]:
    text = raw_text or ""
    flat = re.sub(r"\s+", " ", text[:30000])
    ref = _extract_reference(text, iso_hint)
    title = _extract_standard_title(text, file_name)
    edition = None
    if ref:
        m = re.search(r":\s*(19|20)\d{2}\b", ref)
        edition = m.group(0).lstrip(":").strip() if m else None
    if not edition:
        m = re.search(r"\b(19|20)\d{2}\b", flat[:12000])
        edition = m.group(0) if m else None

    supersedes = None
    m = re.search(r"supersedes\s+((?:BS\s*)?EN\s*\d{3,6}(?:\s*[-/]\s*\d+)?\s*:\s*\d{4}(?:\s*\+\s*A\d+)?|[A-Z][^.;]{0,100})", flat, re.I)
    if m:
        supersedes = re.sub(r"\s+", " ", m.group(1)).strip().rstrip(",")

    issuing: List[str] = []
    for issuer, pat in [
        ("British Standards Institution", r"British Standards Institution|BSI Standards Limited"),
        ("CENELEC", r"\bCENELEC\b"),
        ("European Committee for Electrotechnical Standardization", r"European Committee for Electrotechnical Standardization"),
        ("International Electrotechnical Commission", r"International Electrotechnical Commission|\bIEC\b"),
        ("International Organization for Standardization", r"International Organization for Standardization|\bISO\b"),
    ]:
        if re.search(pat, text[:50000], re.I):
            issuing.append(issuer)

    up = (ref or "").upper()
    if up.startswith("REGULATION"):
        categories = ["Regulation"]
    elif up.startswith("DIRECTIVE"):
        categories = ["Directive"]
    elif re.match(r"^\d+\s+CFR\b", up):
        categories = ["CFR"]
    elif up.startswith("BS EN"):
        categories = ["EN", "BSI"]
    elif up.startswith("EN"):
        categories = ["EN"]
    elif up.startswith("IEC"):
        categories = ["IEC"]
    elif up.startswith("ISO"):
        categories = ["ISO"]
    elif up.startswith("ASTM"):
        categories = ["ASTM"]
    elif up.startswith("ANSI"):
        categories = ["ANSI"]
    elif up.startswith("DIN"):
        categories = ["DIN"]
    elif up.startswith("IEEE"):
        categories = ["IEEE"]
    else:
        categories = []

    related = [m for m in ("IEC", "EN", "ISO", "ASTM", "ANSI", "DIN", "IEEE", "Directive", "Regulation") if re.search(rf"\b{re.escape(m)}\b", text[:30000], re.I)]
    scope = None
    # Clause 1 (Scope) is searched over the full flattened text, not just the
    # first 30 000 chars used above: standards with a long multi-language
    # front matter (e.g. an EN with BSI national foreword + CENELEC EN/FR/DE
    # cover pages) can easily push the real "1 Scope" text past that window,
    # silently leaving standardMetadata.scope null even though the clause
    # is present and correctly detected as a section.
    flat_full = re.sub(r"\s+", " ", text)
    m = re.search(r"\b1\s+Scope\s+(.*?)(?=\bNOTE\s+1\b|\b2\s+Normative references\b)", flat_full, re.I)
    if m:
        scope = m.group(1).strip()[:2000]

    return {
        "reference": ref,
        "title": title,
        "categories": categories,
        "relatedFamilies": related,
        "effectiveDate": edition,
        "issuingBody": issuing[0] if issuing else None,
        "issuingBodies": issuing,
        "edition": edition,
        "status": None,
        "scope": scope,
        "normativeReferences": _extract_normative_references(text),
        "supersedes": supersedes,
        "supersededBy": None,
    }
