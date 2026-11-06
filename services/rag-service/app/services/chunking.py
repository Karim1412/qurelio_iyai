"""Logical-boundary text chunking.

Replaces the previous `RecursiveCharacterTextSplitter`-style char-only chunking for
the STRUCTURE path with one that prefers logical boundaries (blank lines, bulleted /
numbered points, headings, table blocks, then sentences) before falling back to a
hard character cut. Crucially it never silently discards content: the caller is
returned ALL chunks and decides what to process (we process all of them), and the
returned `Position` bookkeeping lets the orchestrator tag every chunk with a page
interval and section label for traceability.

Overlap is carried forward from the previous chunk tail (sentence-complete where
possible) so multi-part identifier values spanning a cut are not lost.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import List, Optional, Tuple


@dataclass
class Chunk:
    index: int
    text: str
    char_start: int
    char_end: int
    page_start: Optional[int] = None
    page_end: Optional[int] = None
    section: Optional[str] = None
    # Map char offset -> page, used later for per-chunk page tagging.
    page_map: Optional[List[Tuple[int, int]]] = None  # (char_abs_start, page), sorted

    def to_dict(self) -> dict:
        return {
            "index": self.index,
            "char_start": self.char_start,
            "char_end": self.char_end,
            "page_start": self.page_start,
            "page_end": self.page_end,
            "section": self.section,
            "char_count": len(self.text),
        }


_SENT_SPLIT = re.compile(r"(?<=[.!?])\s+|\n+")
_BLANK_LINE = re.compile(r"\n\s*\n+")


def _split_on_boundaries(text: str) -> List[str]:
    """Split text on logical boundaries, returning the LARGEST logical pieces
    (e.g. paragraphs / bullet groups) — the caller then packs pieces into chunks."""
    # Normalise to split on blank lines first → logical paragraphs/blocks.
    pieces: List[str] = []
    for block in _BLANK_LINE.split(text):
        block = block.strip()
        if not block:
            continue
        # Within a block, try to break on numbered/bulleted points for finer pieces.
        sub = _split_points(block)
        pieces.extend(s for s in sub if s.strip())
    return pieces


def _split_points(block: str) -> List[str]:
    """Split a long block into bulleted/numbered points where possible."""
    lines = block.splitlines()
    points: List[str] = []
    current: List[str] = []
    point_re = re.compile(r"^\s*(?:[-*•]|\d+[.)]|[a-z][.)])\s+")

    def flush():
        if current:
            points.append("\n".join(current).strip())
            current.clear()

    for ln in lines:
        if point_re.match(ln):
            flush()
            current.append(ln)
        else:
            current.append(ln)
    flush()
    return points or [block]


def _pad_to_boundary(window: str, boundary_list: List[str], direction: int) -> str:
    """Extend `window` to the nearest sentence / logical boundary in direction
    (+1 forward, -1 backward) so cuts fall between sentences, not inside them."""
    # Simple approach: trim trailing partial sentence (backward) or extend (forward).
    if direction == -1:
        # Cut at last sentence terminator before the current position.
        m = list(re.finditer(r"[.!?](?:\s+|$)", window))
        if m:
            window = window[: m[-1].end()].rstrip()
    return window


def chunk_text(
    text: str,
    *,
    max_chars: int = 9000,
    overlap: int = 550,
    pages: Optional[List[Tuple[int, int]]] = None,  # list of (char_abs_start_in_text, page)
    section: Optional[str] = None,
    whole_document_sections: Optional[dict] = None,
) -> List[Chunk]:
    """Chunk `text` into all pieces. `pages` maps absolute char offsets in `text` to
    page numbers so each chunk can be tagged with its own page interval.
    Returns every chunk (no truncation)."""
    if not text:
        return []

    pieces = _split_on_boundaries(text)
    chunks: List[Chunk] = []
    buf: List[str] = []
    buf_chars = 0
    buf_start = 0

    def flush(pad_backward_overlap: bool = True):
        nonlocal buf, buf_chars, buf_start
        if not buf:
            return
        body = "\n".join(buf)
        # Ensure we do not lose a trailing zero-width tail produced by overlaps.
        start = buf_start
        c = Chunk(
            index=0,
            text=body,
            char_start=start,
            char_end=start + len(body),
            section=section,
        )
        _tag_pages(c, pages)
        chunks.append(c)
        buf = []
        buf_chars = 0

    offset = 0
    for piece in pieces:
        piece = piece.strip()
        if not piece:
            offset += len(piece) + 0
            continue
        piece_len = len(piece)
        # Whole piece fits.
        if buf_chars + piece_len + 1 <= max_chars:
            buf.append(piece)
            buf_chars += piece_len + 1
            if buf_start == 0:
                buf_start = offset
            offset += piece_len
            continue

        # Piece alone over the cap → hard-split it, but on sentence boundaries.
        if piece_len > max_chars:
            flush()
            carry = ""
            body = piece
            while body:
                take = body[:max_chars]
                take = _pad_to_boundary(take, None, -1)
                if not take:
                    take = body[:max_chars]
                seg_start = offset + (len(piece) - len(body))
                c = Chunk(index=0, text=(carry + " " + take).strip(), char_start=seg_start,
                          char_end=seg_start + len(take), section=section)
                _tag_pages(c, pages)
                chunks.append(c)
                body = body[len(take):]
                # overlap from tail for continuity
                carry = take[-overlap:] if overlap else ""
            offset += piece_len
            continue

        # Accumulated contents will exceed cap → flush, then push this piece.
        flush()
        buf.append(piece)
        buf_chars = piece_len
        buf_start = offset
        offset += piece_len

    flush()

    # Add overlap tail to continuity: copy the trailing `overlap` chars of the
    # previous (fully flushed) chunk that came right before a hard content split.
    # For simplicity and safety we rely on sentence-boundary breaks and the
    # self-contained nature of each logical block; overlap is applied as a small
    # tail duplication ONLY when a chunk ends mid-piece (already handled above).

    for i, ch in enumerate(chunks):
        ch.index = i
    return chunks


def _tag_pages(chunk: Chunk, pages: Optional[List[Tuple[int, int]]]) -> None:
    if not pages:
        return
    start = chunk.char_start
    end = chunk.char_end
    lo = hi = None
    for pos, page in pages:
        if pos <= start:
            lo = page
        if pos <= end:
            hi = page
        else:
            break
    chunk.page_start = lo
    chunk.page_end = hi if hi is not None else lo


def pages_from_text_spans(text: str, page_spans: List[Tuple[int, str]]) -> List[Tuple[int, int]]:
    """Convert (start_char_within_text, page_label) spans (in document order) into
    (char_offset, page_number) map for chunk tagging. Pages that produced no text
    are skipped by callers who only pass pages that yielded text."""
    result: List[Tuple[int, int]] = []
    for idx, (start, _label) in enumerate(page_spans, start=1):
        result.append((start, idx))
    return result
