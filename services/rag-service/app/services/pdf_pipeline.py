"""Scanned / visually-encoded PDF handling.

For a PDF whose pages produce little or no text, this module renders page images
(every page, or only the classified-scanned pages) so the vision model can read
them directly — closing the biggest gap in the previous pipeline, which could not
extract a single field from a scanned (image-only) PDF.

Rendering depends on a PDF rasterizer. We try, in order:
  1. PyMuPDF (fitz)         — best, no external binaries
  2. pdf2image + poppler     — requires poppler on PATH

If neither is available the module degrades gracefully: it reports that scanned
pages could not be rendered and the orchestrator marks the document PARTIAL rather
than silently pretending the content was extracted.
"""
from __future__ import annotations

import base64
import io
from typing import List, Optional, Tuple


def render_pdf_pages(raw: bytes, page_numbers: Optional[List[int]] = None,
                     max_side_px: int = 1400) -> Tuple[List[dict], List[str]]:
    """Render selected 1-based pages of a PDF to JPEG data URLs.

    Returns (rendered_pages, errors) where rendered_pages is a list of
    {"page": int, "data_url": str, "method": str} and errors lists any page that
    could not be rendered (so the caller can mark it PARTIAL).
    """
    errors: List[str] = []
    rendered: List[dict] = []
    raw_bytes = base64.b64decode(raw) if _is_b64(raw) else raw

    images = _render_fitz(raw_bytes, page_numbers)
    method = "pymupdf"
    if images is None:
        images = _render_pdf2image(raw_bytes, page_numbers)
        method = "pdf2image"
    if images is None:
        if page_numbers:
            errors.append(f"no pdf renderer available for {len(page_numbers)} page(s)")
        return rendered, errors

    for page_no, img in images:
        try:
            import PIL.Image as PILImage
            from PIL import Image
        except Exception:
            errors.append(f"page {page_no}: Pillow unavailable")
            continue
        try:
            w, h = img.size
            if max(w, h) > max_side_px:
                scale = max_side_px / max(w, h)
                img = img.resize((int(w * scale), int(h * scale)), Image.LANCZOS)
            if img.mode in ("RGBA", "P"):
                img = img.convert("RGB")
            buf = io.BytesIO()
            img.save(buf, format="JPEG", quality=88)
            b64 = base64.b64encode(buf.getvalue()).decode("ascii")
            rendered.append({"page": page_no, "data_url": f"data:image/jpeg;base64,{b64}", "method": method})
        except Exception as exc:
            errors.append(f"page {page_no}: render encode failed: {exc}")
    return rendered, errors


def _is_b64(b: bytes) -> bool:
    try:
        b.decode("ascii")
        return True
    except Exception:
        return False


def _render_fitz(raw: bytes, page_numbers: Optional[List[int]]):
    try:
        import fitz  # PyMuPDF
    except Exception:
        return None
    try:
        doc = fitz.open(stream=raw, filetype="pdf")
    except Exception:
        return None
    out: List[Tuple[int, object]] = []
    total = doc.page_count
    targets = page_numbers if page_numbers else list(range(1, total + 1))
    for p in targets:
        if p > total:
            continue
        try:
            pix = doc[p - 1].get_pixmap(matrix=fitz.Matrix(2, 2))
            img = pix.tobytes("ppm")
            from PIL import Image
            import io as _io
            pil_img = Image.open(_io.BytesIO(img)).convert("RGB")
            out.append((p, pil_img))
        except Exception:
            continue
    return out


def _render_pdf2image(raw: bytes, page_numbers: Optional[List[int]]):
    try:
        from pdf2image import convert_from_bytes
    except Exception:
        return None
    try:
        pages = convert_from_bytes(raw, dpi=150)
    except Exception:
        return None
    out: List[Tuple[int, object]] = []
    total = len(pages)
    targets = page_numbers if page_numbers else list(range(1, total + 1))
    for p in targets:
        if p > total:
            continue
        out.append((p, pages[p - 1]))
    return out
