"""High-quality, layout-aware PDF text extraction.

The PDF text layer is the source of truth for standards.  pypdf is useful for
simple PDFs but can return text in PDF-object order rather than visual reading
order.  This module uses PyMuPDF blocks/lines/spans to rebuild human reading
order while preserving page boundaries and ignoring image blocks.
"""
from __future__ import annotations

import io
import os
import re
import statistics
from collections import Counter
from typing import List, Tuple
from app.services.standard_pipeline import _MODAL_RE

try:
    from app.services.pdf_text_normalize import normalize_pdf_extracted_text
except Exception:  # pragma: no cover
    normalize_pdf_extracted_text = lambda text: text

try:
    import fitz  # PyMuPDF
except Exception:  # pragma: no cover
    fitz = None


def _norm_line(text: str) -> str:
    text = re.sub(r"\s+", " ", (text or "").strip())
    text = re.sub(r"\s+([,.;:!?%)\]])", r"\1", text)
    text = re.sub(r"([\[(])\s+", r"\1", text)
    return text.strip()


def _join_block_lines(lines: list[str]) -> str:
    """Join visually adjacent text lines into paragraphs without losing bullets."""
    out: list[str] = []
    for raw in lines:
        line = _norm_line(raw)
        if not line:
            continue
        # Preserve bullets/numbered starts as independent lines.
        is_list = bool(re.match(r"^(?:[-–—•●▪◦*]|\(?[A-Za-z]\)|\(?\d+(?:\.\d+)*[.)])\s+", line))
        if not out or is_list:
            out.append(line)
            continue
        prev = out[-1]
        # Hyphenated line wrap: join without the hyphen.
        if prev.endswith("-") and not prev.endswith("--") and line[:1].islower():
            out[-1] = prev[:-1] + line
        else:
            out[-1] = f"{prev} {line}"
    return "\n".join(out)


def _looks_glyph_spaced_text(text: str) -> bool:
    s = (text or '').strip()
    if len(s) < 16:
        return False
    parts = s.split()
    if len(parts) < 8:
        return False
    singles = sum(1 for p in parts if len(p) == 1 and (p.isalnum() or p in '.:,;()[]'))
    return singles >= 7 and singles / max(len(parts), 1) >= 0.50


def _reconstruct_glyph_spaced_line(chars: list[dict]) -> str:
    """Rebuild a glyph-spaced PDF line using character geometry.

    Some IEC/standards PDFs expose every glyph separated by a literal space,
    while the actual visual word boundaries are encoded only by larger x gaps.
    Reconstruct words from character positions instead of trying to repair the
    already-flattened string.
    """
    items: list[tuple[float, float, str]] = []
    for ch in chars:
        c = str(ch.get('c') or '')
        if not c or c.isspace():
            continue
        bbox = ch.get('bbox') or (0, 0, 0, 0)
        try:
            x0, _, x1, _ = map(float, bbox)
        except Exception:
            continue
        items.append((x0, x1, c))
    items.sort(key=lambda x: (x[0], x[1]))
    if not items:
        return ''
    if len(items) == 1:
        return items[0][2]

    gaps = [max(0.0, items[i][0] - items[i - 1][1]) for i in range(1, len(items))]
    positive = sorted(g for g in gaps if g > 0.01)
    if not positive:
        return ''.join(c for _, _, c in items)

    # Find a natural gap split. Glyph gaps form a dense small cluster; word
    # gaps are typically the larger cluster. If no meaningful second cluster
    # exists, fall back to the normalized flattened string.
    threshold = None
    if len(positive) >= 6:
        best_ratio = 0.0
        best_threshold = None
        for i in range(1, len(positive)):
            left, right = positive[i - 1], positive[i]
            if left <= 0:
                continue
            ratio = right / left
            if ratio > best_ratio:
                best_ratio = ratio
                best_threshold = (left + right) / 2.0
        if best_threshold is not None and best_ratio >= 1.55:
            threshold = best_threshold

    if threshold is None:
        return ''.join(c for _, _, c in items)

    out: list[str] = [items[0][2]]
    for i in range(1, len(items)):
        gap = gaps[i - 1]
        prev_c = items[i - 1][2]
        cur_c = items[i][2]
        if gap >= threshold and prev_c not in '([{/' and cur_c not in '.,;:!?)]}%':
            out.append(' ')
        out.append(cur_c)
    return ''.join(out)


def _expand_raw_char(ch: dict) -> list[dict]:
    c = str(ch.get("c") or "")
    bbox = ch.get("bbox") or (0, 0, 0, 0)
    try:
        x0, y0, x1, y1 = map(float, bbox)
    except Exception:
        return []
    if len(c) <= 1:
        return [{"c": c, "x0": x0, "x1": x1, "y": (y0 + y1) / 2.0, "bbox": bbox}]
    # Some PDFs pack a few adjacent glyphs into one rawdict character. Split the
    # bbox proportionally so geometry-based word reconstruction still works.
    width = max(0.01, x1 - x0)
    out: list[dict] = []
    step = width / len(c)
    for i, char in enumerate(c):
        cx0 = x0 + step * i
        cx1 = x0 + step * (i + 1)
        out.append({"c": char, "x0": cx0, "x1": cx1, "y": (y0 + y1) / 2.0, "bbox": (cx0, y0, cx1, y1)})
    return out


def _group_chars_into_visual_lines(chars: list[dict], y_tolerance: float = 1.8) -> list[list[dict]]:
    """Group PDF characters into visual lines instead of trusting rawdict lines."""
    items: list[dict] = []
    for ch in chars:
        items.extend(_expand_raw_char(ch))
    # Explicit space glyphs carry information: throwing them away makes a
    # normal PDF read as "Theorganizationshall..." when glyph boxes touch.
    items = [x for x in items if x.get("c")]
    items.sort(key=lambda x: (x["y"], x["x0"]))
    groups: list[list[dict]] = []
    for item in items:
        if not groups or abs(item["y"] - groups[-1][0]["y"]) > y_tolerance:
            groups.append([item])
        else:
            groups[-1].append(item)
    for group in groups:
        group.sort(key=lambda x: (x["x0"], x["x1"]))
    return groups


def _visual_line_text(chars: list[dict]) -> str:
    if not chars:
        return ""
    # Preserve actual PDF whitespace for normal prose. Some PDFs insert a
    # space between *every* glyph; those still need the geometry-based path.
    literal = "".join(str(ch["c"]) for ch in chars)
    if any(str(ch["c"]).isspace() for ch in chars) and not _looks_glyph_spaced_text(literal):
        # Explicit spaces elsewhere in a line do not imply that widely spaced
        # table cells have a separating space in the PDF text stream.
        widths = [max(0.0, float(ch["x1"]) - float(ch["x0"])) for ch in chars if not str(ch["c"]).isspace()]
        large_gap = max(15.0, (statistics.median(widths) if widths else 5.0) * 2.5)
        pieces: list[str] = []
        for index, ch in enumerate(chars):
            if index and not str(ch["c"]).isspace() and not str(chars[index - 1]["c"]).isspace():
                if float(ch["x0"]) - float(chars[index - 1]["x1"]) >= large_gap:
                    pieces.append(" ")
            pieces.append(str(ch["c"]))
        return re.sub(r"\s+", " ", "".join(pieces)).strip()
    chars = [ch for ch in chars if not str(ch["c"]).isspace()]
    if not chars:
        return ""
    if len(chars) == 1:
        return chars[0]["c"]
    gaps = [max(0.0, chars[i]["x0"] - chars[i - 1]["x1"]) for i in range(1, len(chars))]
    positive = sorted(g for g in gaps if g > 0.08)
    if not positive:
        return "".join(ch["c"] for ch in chars)

    # The PDFs used by this project often have ~0.5–1.5pt glyph gaps and
    # ~4–10pt word gaps. Find the largest relative jump; otherwise fall back
    # to a conservative multiple of the median glyph gap.
    threshold = None
    if len(positive) >= 6:
        best_ratio = 0.0
        best_threshold = None
        for i in range(1, len(positive)):
            left, right = positive[i - 1], positive[i]
            if left <= 0.05:
                continue
            ratio = right / left
            if ratio > best_ratio:
                best_ratio = ratio
                best_threshold = (left + right) / 2.0
        if best_threshold is not None and best_ratio >= 1.8:
            threshold = best_threshold
    if threshold is None:
        threshold = max(2.2, statistics.median(positive) * 3.0)

    out = [chars[0]["c"]]
    for i in range(1, len(chars)):
        gap = gaps[i - 1]
        prev_c = chars[i - 1]["c"]
        cur_c = chars[i]["c"]
        # Never invent spaces immediately around punctuation/operators.
        should_space = (
            gap >= threshold and
            prev_c not in "([{/-" and cur_c not in ".,;!?)]}%/"
        )
        if gap >= 1.2 and ((prev_c.isalpha() and cur_c.isdigit()) or (prev_c.isdigit() and cur_c.isalpha())):
            should_space = True
        if gap >= 2.5 and prev_c in ":;" and cur_c.isalpha():
            should_space = True
        if should_space:
            out.append(" ")
        out.append(cur_c)
    return "".join(out)


def _block_text(block: dict) -> str:
    """Reconstruct a text block from character geometry, not PDF object order."""
    all_chars: list[dict] = []
    for raw_line in block.get("lines", []):
        for span in raw_line.get("spans", []):
            chars = span.get("chars") or []
            if chars:
                all_chars.extend(chars)
            else:
                # Some PDFs expose text without per-character boxes. Keep it as
                # a fallback line; normal span text still benefits from cleanup.
                text = str(span.get("text") or "").strip()
                if text:
                    for token in text.splitlines():
                        if token.strip():
                            all_chars.append({"c": token, "bbox": span.get("bbox", (0,0,0,0))})
    visual_lines = _group_chars_into_visual_lines(all_chars)
    lines = [_visual_line_text(line).strip() for line in visual_lines if _visual_line_text(line).strip()]
    if not lines:
        return ""
    return _join_block_lines(lines)


def _column_order(blocks: list[tuple[float, float, float, float, str]], page_width: float) -> list[tuple[float, float, float, float, str]]:
    if len(blocks) < 4:
        return sorted(blocks, key=lambda b: (b[1], b[0]))
    xs=sorted(b[0] for b in blocks)
    gaps=[(xs[i+1]-xs[i], i) for i in range(len(xs)-1)]
    gap,idx=max(gaps, default=(0.0,-1))
    if idx < 0 or gap < max(100.0, page_width*0.16):
        return sorted(blocks, key=lambda b:(b[1],b[0]))
    threshold=(xs[idx]+xs[idx+1])/2
    left=[b for b in blocks if b[0] < threshold]; right=[b for b in blocks if b[0] >= threshold]
    if min(len(left),len(right)) < 2:
        return sorted(blocks, key=lambda b:(b[1],b[0]))
    lt,lb=min(b[1] for b in left),max(b[3] for b in left)
    rt,rb=min(b[1] for b in right),max(b[3] for b in right)
    overlap=max(0.0,min(lb,rb)-max(lt,rt)); span=max(lb,rb)-min(lt,rt)
    if span <= 0 or overlap/span < 0.45:
        return sorted(blocks, key=lambda b:(b[1],b[0]))
    return sorted(left,key=lambda b:(b[1],b[0])) + sorted(right,key=lambda b:(b[1],b[0]))


def _looks_text_corrupted(text: str) -> bool:
    s = (text or "").strip()
    if len(s) < 20:
        return False
    tokens = s.split()
    if any(len(tok) >= 28 for tok in tokens) and len(tokens) <= max(2, len(s) // 18):
        return True
    single = sum(1 for tok in tokens if len(tok) == 1 and tok.isalpha())
    if single >= 4 and single / max(len(tokens), 1) >= 0.30:
        return True
    return False


def _ocr_block(page: object, bbox: tuple[float, float, float, float]) -> str:
    """Best-effort OCR fallback for blocks whose native PDF encoding is clearly corrupted."""
    try:
        import pytesseract
        from PIL import Image, ImageOps
        pix = page.get_pixmap(clip=bbox, dpi=220, alpha=False)
        image = Image.open(io.BytesIO(pix.tobytes("png"))).convert("L")
        image = ImageOps.autocontrast(image)
        langs = set(pytesseract.get_languages(config=""))
        lang = "eng" if "eng" in langs else ("fra" if "fra" in langs else ("ara" if "ara" in langs else None))
        text = pytesseract.image_to_string(image, lang=lang, config="--psm 6") if lang else pytesseract.image_to_string(image, config="--psm 6")
        return re.sub(r"\s+", " ", text or "").strip()
    except Exception:
        return ""


def _page_table_bboxes(page: object) -> list[tuple[float, float, float, float]]:
    """Return table bounding boxes when PyMuPDF's table detector is useful.

    find_tables() is relatively expensive on large standards, so only invoke it
    on pages whose cheap native text preview suggests a table.
    """
    try:
        finder = getattr(page, "find_tables", None)
        if finder is None:
            return []
        preview = page.get_text("text") or ""
        if not re.search(r"\b(?:Table|Publication\s+Year|Parameter\s+Value|Contents)\b", preview[:12000], re.I):
            return []
        result = finder()
        tables = getattr(result, "tables", []) or []
        out = []
        for table in tables:
            bbox = getattr(table, "bbox", None)
            if bbox and len(bbox) == 4:
                out.append(tuple(float(v) for v in bbox))
        return out
    except Exception:
        return []


def _readable_page_tables(page: object) -> list[tuple[tuple[float, float, float, float], str]]:
    """Read text tables row by row when a reliable cell grid can be detected."""
    try:
        finder = getattr(page, "find_tables", None)
        preview = page.get_text("text") or ""
        if finder is None or not re.search(r"\b(?:Table|Tableau|Tabelle|Tabella|Tabla|Publication\s+Year|Parameter\s+Value)\b|جدول", preview[:12000], re.I):
            return []
        out = []
        for table in getattr(finder(), "tables", []) or []:
            bbox = getattr(table, "bbox", None)
            rows = table.extract()
            if not bbox or len(bbox) != 4 or not isinstance(rows, list) or len(rows) < 2:
                continue
            formatted = []
            for row in rows:
                if not isinstance(row, (list, tuple)):
                    continue
                cells = [re.sub(r"\s+", " ", str(cell or "")).strip() for cell in row]
                if any(cells):
                    formatted.append(" | ".join(cells))
            if len(formatted) >= 2:
                out.append((tuple(float(value) for value in bbox), "\n".join(formatted)))
        return out
    except Exception:
        return []


def _bbox_overlap_ratio(a: tuple[float, float, float, float], b: tuple[float, float, float, float]) -> float:
    ax0, ay0, ax1, ay1 = a
    bx0, by0, bx1, by1 = b
    ix0, iy0 = max(ax0, bx0), max(ay0, by0)
    ix1, iy1 = min(ax1, bx1), min(ay1, by1)
    if ix1 <= ix0 or iy1 <= iy0:
        return 0.0
    inter = (ix1 - ix0) * (iy1 - iy0)
    area = max(1.0, (ax1 - ax0) * (ay1 - ay0))
    return inter / area


def extract_pdf_pages_layout(raw: bytes) -> List[Tuple[int, str]]:
    """Return (1-based page, visually ordered prose text) for every text-bearing page."""
    if fitz is None:
        return []
    doc = fitz.open(stream=raw, filetype="pdf")
    pages: list[tuple[int, str]] = []
    page_edges: list[set[str]] = []
    ocr_budget = max(0, int(os.getenv("STANDARD_OCR_FALLBACK_MAX_BLOCKS", "30")))
    ocr_used = 0

    for page_index, page in enumerate(doc, start=1):
        try:
            page_dict = page.get_text("rawdict", flags=fitz.TEXTFLAGS_TEXT)
        except Exception:
            page_dict = page.get_text("rawdict")

        blocks: list[tuple[float, float, float, float, str]] = []
        page_width = float(page.rect.width)
        page_height = float(page.rect.height)
        for block in page_dict.get("blocks", []):
            # block type 0 = text; image blocks are ignored by design.
            if int(block.get("type", 0)) != 0:
                continue
            txt = _block_text(block)
            if not txt:
                continue
            x0, y0, x1, y1 = [float(v) for v in block.get("bbox", (0, 0, 0, 0))]
            bbox = (x0, y0, x1, y1)
            if _looks_text_corrupted(txt) and ocr_used < ocr_budget and (x1 - x0) > page_width * 0.08 and (y1 - y0) > 5:
                ocr_text = _ocr_block(page, bbox)
                ocr_used += 1
                if ocr_text and len(ocr_text) >= max(12, int(len(txt) * 0.45)):
                    txt = ocr_text
            # Tables can contain normative limits and obligations. Keep their
            # text, even when the original cell relationships cannot be inferred.
            # Ignore tiny page-number-only blocks; repeated header/footer removal below
            # handles the rest.
            if (y1 - y0) < 2:
                continue
            blocks.append((x0, y0, x1, y1, txt))

        for table_bbox, table_text in _readable_page_tables(page):
            intersecting = [block for block in blocks if _bbox_overlap_ratio(block[:4], table_bbox) > 0.02]
            contained = [block for block in intersecting if _bbox_overlap_ratio(block[:4], table_bbox) >= 0.80]
            if not contained or len(contained) != len(intersecting):
                continue
            # Only replace native blocks if the table extractor retained their
            # characters. Otherwise preserve the original text for review.
            native_chars = Counter(ch.casefold() for block in contained for ch in block[4] if ch.isalnum())
            table_chars = Counter(ch.casefold() for ch in table_text if ch.isalnum())
            if native_chars - table_chars:
                continue
            blocks = [block for block in blocks if block not in contained]
            blocks.append((*table_bbox, table_text))

        ordered = _column_order(blocks, page_width)
        chunks: list[str] = []
        edges: set[str] = set()
        for x0, y0, x1, y1, txt in ordered:
            # Avoid obvious footer/page-number artefacts.
            if y0 > page_height * 0.94 and re.fullmatch(r"(?:page\s*)?\d+", txt.strip(), re.I):
                continue
            if y0 < page_height * 0.07 and re.fullmatch(r"\d+", txt.strip()):
                continue
            chunks.append(txt)
            if y0 < page_height * 0.09 or y1 > page_height * 0.91:
                edge_text = normalize_pdf_extracted_text(txt).strip()
                edges.add(re.sub(r"\s+", " ", edge_text).lower())

        page_text = "\n\n".join(c for c in chunks if c.strip()).strip()
        # Do not discard a whole page because it contains a copyright footer:
        # real requirements can occur on the same page.
        # PDF text can be glyph-spaced at the span/layout layer (e.g.
        # "e n c l o s u r e"). Normalize after visual ordering is rebuilt so
        # glyph repair cannot disturb the block/column decision.
        page_text = normalize_pdf_extracted_text(page_text).strip()
        pages.append((page_index, page_text))
        page_edges.append(edges)

    # Remove recurring headers/footers only when they repeat across many pages.
    # This avoids deleting legitimate clauses that happen to occur near page edges.
    candidates = Counter()
    page_parts: list[list[str]] = []
    for (_, text), edges in zip(pages, page_edges):
        parts = [p.strip() for p in text.split("\n\n") if p.strip()]
        page_parts.append(parts)
        for part in set(parts):
            compact = re.sub(r"\s+", " ", part).lower()
            if compact in edges and 3 <= len(compact) <= 180:
                candidates[compact] += 1

    threshold = max(3, int(len(pages) * 0.35))
    repeated = {k for k, count in candidates.items() if count >= threshold}

    cleaned: list[tuple[int, str]] = []
    for page_no, parts, edges in zip((p for p, _ in pages), page_parts, page_edges):
        kept: list[str] = []
        for part in parts:
            compact = re.sub(r"\s+", " ", part).lower()
            if compact in repeated and compact in edges and not _MODAL_RE.search(compact):
                continue
            kept.append(part)
        cleaned.append((page_no, "\n\n".join(kept).strip()))
    return cleaned
