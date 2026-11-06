"""Per-format raw extraction (text + tables + structure) so the structuring layer
never loses content because a format's parser dropped it.

Key gaps this fixes (previously in ingestion.py `_extract`):

  PDF  : text-only via pypdf. No detection of "is this page actually text, or is
         it a scan?" — scanned PDFs yielded empty/meaningless text and the LLM got
         nothing useful. Now each page is classified (text-bearing vs scanned) and
         scanned pages are rendered for the visual/vision path (see pdf_pipeline).
  DOCX : previously ONLY `document.paragraphs` text was taken. Tables, headers and
         footers were silently discarded — a label/legal doc expressed as a table
         lost most of its content. Now tables are parsed row/column into a lossless
         text+tsv representation and headers/footers are included.
  Image: PNG/JPG/WebP are handed through (already vision-capable); they are returned
         as-is so per-image extraction can choose OCR vs vision. We also sniff file
         magic bytes (not just extension) so mislabeled files are handled sanely.
"""
from __future__ import annotations

import io
import os
import re
from dataclasses import dataclass, field
from typing import List, Optional, Tuple

try:
    from pypdf import PdfReader
except Exception:  # pragma: no cover
    PdfReader = None

from app.config import get_settings


@dataclass
class ExtractedFile:
    kind: str                       # "pdf" | "image" | "docx" | "text" | "unsupported"
    pages_text: List[Tuple[int, str]] = field(default_factory=list)  # (page_idx, text)
    page_spans: List[Tuple[int, str]] = field(default_factory=list)  # (start_char_in_doc, page_label)
    doc_text: str = ""
    tables: List[dict] = field(default_factory=list)
    images: List[dict] = field(default_factory=list)  # {format, bytes, filename, note}
    text_classified: bool = False   # True when per-page classification ran
    scanned_pages: List[int] = field(default_factory=list)
    page_count: int = 0
    error: Optional[str] = None


TEXTUAL_PDF_EXT = (".pdf",)
IMAGE_EXT = (".png", ".jpg", ".jpeg", ".webp", ".bmp")
DOCX_EXT = (".docx",)
TEXT_EXT = (".txt", ".md", ".csv")


# ── magic-byte sniffing ───────────────────────────────────────────────────────
_PDF_MAGIC = b"%PDF"
_PNG_MAGIC = b"\x89PNG\r\n\x1a\n"
_JPEG_MAGIC = (b"\xff\xd8\xff",)


def sniff_kind(raw: bytes) -> Optional[str]:
    if raw.startswith(_PDF_MAGIC):
        return "pdf"
    if raw.startswith(_PNG_MAGIC):
        return "image"
    if raw[:3] in _JPEG_MAGIC:
        return "image"
    return None


def kind_for_name(name: str, raw: Optional[bytes] = None) -> str:
    if raw is not None:
        s = sniff_kind(raw)
        if s is not None:
            return s
    ext = os.path.splitext(name or "")[1].lower()
    if ext == ".pdf":
        return "pdf"
    if ext in IMAGE_EXT:
        return "image"
    if ext in DOCX_EXT:
        return "docx"
    if ext in TEXT_EXT:
        return "text"
    return "unsupported"


def extract_product_pdf_fast(raw: bytes, filename: str = "", min_chars: Optional[int] = None) -> ExtractedFile:
    """Fast, page-aware PDF extraction for product/evidence documents.

    Product PDFs do not need the expensive standards-oriented geometry/table
    reconstruction. Use PyMuPDF plain-text extraction first and pypdf as a
    fallback. This keeps page provenance while avoiding O(chars*geometry) work
    on large manuals/datasheets.
    """
    ef = ExtractedFile(kind="pdf")
    min_chars = min_chars if min_chars is not None else get_settings().TEXT_FALLBACK_MIN_CHARS

    # Prefer PyMuPDF for fast page-aware extraction.
    try:
        import fitz
        doc = fitz.open(stream=raw, filetype="pdf")
        ef.page_count = len(doc)
        parts: List[str] = []
        offset = 0
        for page_no, page in enumerate(doc, start=1):
            text = (page.get_text("text") or "").strip()
            # Keep normalization lightweight here; the semantic extractor will
            # work from page-tagged text and must not pay the heavy layout-parser
            # cost used by standards.
            text = re.sub(r"[ \t]+", " ", text)
            text = re.sub(r"\n{3,}", "\n\n", text).strip()
            if len(text) >= min_chars:
                ef.pages_text.append((page_no - 1, text))
                ef.page_spans.append((offset, f"page-{page_no}"))
                parts.append(text)
                offset += len(text) + 2
            else:
                ef.scanned_pages.append(page_no)
        ef.text_classified = True
        ef.doc_text = "\n\n".join(parts)
        doc.close()
        return ef
    except Exception as primary_exc:
        # Safe fallback to pypdf. Never invoke the heavy layout parser on the
        # product path; it is reserved for standards where geometry is material.
        try:
            if PdfReader is None:
                raise RuntimeError("pypdf not installed")
            reader = PdfReader(io.BytesIO(raw))
            ef.page_count = len(reader.pages)
            parts = []
            offset = 0
            for page_no, page in enumerate(reader.pages, start=1):
                text = (page.extract_text() or "").strip()
                text = re.sub(r"\s+", " ", text)
                if len(text) >= min_chars:
                    ef.pages_text.append((page_no - 1, text))
                    ef.page_spans.append((offset, f"page-{page_no}"))
                    parts.append(text)
                    offset += len(text) + 2
                else:
                    ef.scanned_pages.append(page_no)
            ef.text_classified = True
            ef.doc_text = "\n\n".join(parts)
            return ef
        except Exception as fallback_exc:
            ef.error = f"PDF fast extraction failed: {primary_exc}; fallback: {fallback_exc}"
            return ef


# ── PDF text extraction with per-page classification ────────────────────────
def extract_pdf(raw: bytes, filename: str = "", min_chars: Optional[int] = None) -> ExtractedFile:
    ef = ExtractedFile(kind="pdf")
    if PdfReader is None:
        ef.error = "pypdf not installed"
        return ef
    try:
        reader = PdfReader(io.BytesIO(raw))
    except Exception as exc:
        ef.error = f"PDF parse failed: {exc}"
        return ef

    min_chars = min_chars if min_chars is not None else get_settings().TEXT_FALLBACK_MIN_CHARS
    pages_text: List[Tuple[int, str]] = []
    page_spans: List[Tuple[int, str]] = []
    scanned: List[int] = []
    offset = 0
    try:
        from app.services.pdf_text_layout import extract_pdf_pages_layout
        layout_pages = extract_pdf_pages_layout(raw)
    except Exception:
        layout_pages = []

    if not layout_pages:
        # Safe fallback for environments where PyMuPDF is unavailable.
        try:
            total = len(reader.pages)
        except Exception:
            total = 0
        layout_pages = []
        for idx in range(total):
            try:
                page = reader.pages[idx]
                layout_pages.append((idx + 1, (page.extract_text() or "").strip()))
            except Exception:
                layout_pages.append((idx + 1, ""))

    for page_no, t in layout_pages:
        t = (t or "").strip()
        # A short but readable page can still contain a requirement or a table
        # limit. Preserve it; the threshold only selects pages for OCR review.
        if t:
            pages_text.append((page_no - 1, t))
            page_spans.append((offset, f"page-{page_no}"))
            offset += len(t) + 2
        if len(t) < min_chars:
            scanned.append(page_no)
    ef.pages_text = pages_text
    ef.page_spans = page_spans
    ef.doc_text = "\n\n".join(t for _, t in pages_text)
    ef.text_classified = True
    ef.scanned_pages = scanned
    try:
        ef.page_count = len(reader.pages)
    except Exception:
        ef.page_count = max([p for p, _ in pages_text] + scanned + [0])
    return ef


def extract_text(raw: bytes, encoding: str = "utf-8", errors: str = "ignore") -> str:
    try:
        return raw.decode(encoding, errors=errors)
    except Exception:
        return raw.decode("latin-1", errors=errors)


# ── DOCX extraction (paragraphs + tables + headers/footers) ─────────────────
def extract_docx(raw: bytes, filename: str = "") -> ExtractedFile:
    ef = ExtractedFile(kind="docx")
    try:
        from docx import Document as DocxDocument
        from docx.table import Table
    except Exception as exc:
        ef.error = f"python-docx not available: {exc}"
        return ef

    doc = DocxDocument(io.BytesIO(raw))

    parts: List[str] = []

    def cell_text(cell) -> str:
        # Nested tables inside a cell: concatenate their text too.
        texts = [p.text for p in cell.paragraphs if p.text]
        for tbl in cell.tables:
            for row in tbl.rows:
                for c in row.cells:
                    t = c.text.strip()
                    if t:
                        texts.append(t)
        return " ".join(x.strip() for x in texts if x.strip())

    # Tables, preserving structure losslessly (row-major TSV in the text stream,
    # plus a structured `tables` record for the table-aware conversion).
    table_block = 0
    all_table_text: List[str] = []
    for tbl in doc.tables:
        table_block += 1
        rows: List[List[str]] = []
        for row in tbl.rows:
            cells = [cell_text(c) for c in row.cells]
            rows.append(cells)
            all_table_text.append("\t".join(cells))
        ef.tables.append({"index": table_block, "rows": rows})

    # Header/footer content.
    header_texts: List[str] = []
    for section in doc.sections:
        if section.header and section.header.is_linked_to_previous is False:
            for p in section.header.paragraphs:
                if p.text.strip():
                    header_texts.append(p.text.strip())
        if section.footer:
            for p in section.footer.paragraphs:
                if p.text.strip():
                    header_texts.append(p.text.strip())

    # Paragraph text in document order.
    body_paras = [p.text for p in doc.paragraphs if p.text and p.text.strip()]

    if header_texts:
        parts.append("[[HEADER]]\n" + "\n".join(header_texts))
    parts.append("\n".join(body_paras))
    if all_table_text:
        parts.append("[[TABLES]]\n" + "\n".join(all_table_text))

    ef.doc_text = "\n\n".join(parts)
    ef.page_spans = [(0, "docx")] if ef.doc_text else []
    return ef


# ── Image handling ───────────────────────────────────────────────────────────
def prepare_image(raw: bytes, filename: str = "") -> ExtractedFile:
    """Return an ExtractedFile with the raw image and its actual format. The
    structuring layer may OCR it (Tesseract) or pass the image to a vision model."""
    ef = ExtractedFile(kind="image")
    fmt = sniff_image_format(raw)
    ef.doc_text = ""       # no reliable text without OCR/vision
    ef.images.append({"format": fmt, "bytes": raw, "filename": filename})
    return ef


def sniff_image_format(raw: bytes) -> str:
    if raw.startswith(b"\x89PNG\r\n\x1a\n"):
        return "PNG"
    if raw[:3] == b"\xff\xd8\xff":
        return "JPEG"
    # WebP: RIFF....WEBP
    if raw.startswith(b"RIFF") and raw[8:12] == b"WEBP":
        return "WEBP"
    if raw.startswith(b"BM"):
        return "BMP"
    return "UNKNOWN"


def downscale_image(data_url: str, max_side_px: int) -> str:
    """Best-effort lossy downscale of an inline base64 image to keep vision prompts
    small. If Pillow is unavailable or conversion fails, returns the original."""
    try:
        import base64
        from PIL import Image
        import io
        header, _, b64 = data_url.partition(",")
        raw = base64.b64decode(b64)
        img = Image.open(io.BytesIO(raw))
        w, h = img.size
        if max(w, h) <= max_side_px:
            return data_url
        scale = max_side_px / max(w, h)
        img = img.resize((int(w * scale), int(h * scale)), Image.LANCZOS)
        if img.mode in ("RGBA", "P"):
            img = img.convert("RGB")
        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=85)
        enc = base64.b64encode(buf.getvalue()).decode("ascii")
        return f"data:image/jpeg;base64,{enc}"
    except Exception:
        return data_url
