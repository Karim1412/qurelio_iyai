import asyncio
import copy
import io
import logging
import random
import re
from typing import Tuple, List, Any

import httpx
from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain_openai import OpenAIEmbeddings
from pinecone import Pinecone, ServerlessSpec

from app.config import get_settings
from app.models.schemas import IngestRequest
from app.services.storage import StorageService
from app.services.structure_openai import flatten_for_search, structure_content
from app.services.extractors import extract_pdf, extract_product_pdf_fast
from app.services.copyright_scan import scan_for_licensed_content, describe as describe_copyright
from app.services.segment_patterns import segment_by_numbered_headings

logger = logging.getLogger(__name__)
settings = get_settings()

# --- Reliability fixes for batch uploads (tens of documents at once) ---
#
# Root cause of "some/all files failed" under batch upload: each ingest call
# can start its AI extraction step immediately with no throttling, so
# uploading many files close together starts many concurrent AI calls at
# once — trivially exhausting a rate-limited (especially free-tier) API key.
# The retry loop below previously had NO backoff, so retrying against a rate
# limit just repeated the same failure instantly, and credit-exhaustion
# errors (HTTP 402) got the same blind retry treatment even though no amount
# of retrying fixes an empty account balance.
_MAX_CONCURRENT_EXTRACTIONS = max(1, settings.MAX_CONCURRENT_EXTRACTIONS)
_extraction_semaphore = asyncio.Semaphore(_MAX_CONCURRENT_EXTRACTIONS)


def _is_rate_limit_error(e: Exception) -> bool:
    msg = str(e).lower()
    return (
        "429" in msg
        or "rate limit" in msg
        or "rate_limit" in msg
        or "too many requests" in msg
        or "quota" in msg
    )


def _is_credit_exhausted_error(e: Exception) -> bool:
    """HTTP 402 / account-balance errors — distinct from rate limiting (429).
    A rate limit self-resolves if you wait; an exhausted credit balance does
    NOT, no matter how long you wait or how many times you retry the SAME
    provider."""
    msg = str(e).lower()
    return (
        "402" in msg
        or "requires more credits" in msg
        or "insufficient credits" in msg
        or "payment required" in msg
        or ("credits" in msg and "afford" in msg)
    )


async def _retry_with_backoff(fn, *, attempts: int, stage: str, doc_id: str):
    """Run an async callable with exponential backoff + jitter between
    attempts. Rate-limit errors get a longer, more patient backoff than other
    transient errors. Credit-exhaustion errors fail FAST after one attempt —
    retrying won't fix an empty balance. Returns (result, None) on success or
    (None, last_exception) if every attempt failed — never raises.
    """
    last_err: Exception | None = None
    for attempt in range(attempts):
        try:
            result = await fn()
            return result, None
        except Exception as e:
            last_err = e
            if attempt == attempts - 1 or _is_credit_exhausted_error(e):
                break
            is_rate_limit = _is_rate_limit_error(e)
            base_delay = 8.0 if is_rate_limit else 2.0
            delay = base_delay * (2 ** attempt) + random.uniform(0, 1.5)
            logger.warning(
                "%s attempt %s/%s failed for %s (%s): %s — retrying in %.1fs",
                stage, attempt + 1, attempts, doc_id,
                "rate limit" if is_rate_limit else "error", e, delay,
            )
            await asyncio.sleep(delay)
    return None, last_err

_MAX_STORED_SECTIONS = 150
_MAX_STORED_SECTION_CONTENT = 12_000
# Vector width of the configured embedding model. text-embedding-3-small (and ada-002)
# emit 1536; the Pinecone index must match or every upsert is rejected.
EMBEDDING_DIMENSION = 1536
# Upper bound on the extracted text persisted on the document row. Must comfortably
# hold a full standard: this text is what a standard is re-indexed from.
_MAX_EXTRACTED_TEXT = 2_000_000


def _clean_clause_ref(ref: str) -> str:
    """Collapse a clause id the heading regex captured more than once.

    PDF annex pages repeat their header on consecutive lines, and the greedy
    heading pattern swallows every copy: "ANNEX X ANNEX X ANNEX X ANNEX X".
    Handles any repeat count, not just doubling.
    """
    r = " ".join((ref or "").split())
    if not r:
        return ""
    words = r.split(" ")
    n = len(words)
    # Smallest repeating unit that tiles the whole sequence wins.
    for size in range(1, n // 2 + 1):
        if n % size:
            continue
        unit = [w.lower() for w in words[:size]]
        if all(
            [w.lower() for w in words[i : i + size]] == unit for i in range(0, n, size)
        ):
            return " ".join(words[:size])
    return r


# A numbered point inside a section: "1.", "2)", "3.1", "3.1.", these carry the
# actual requirements, and their numbers are the clause versions an auditor cites.
_NUMBERED_POINT = re.compile(r"^\s*(\d{1,2}(?:\.\d{1,3}){0,3})\s*[.)]?\s+(?=\S)")
# Lettered sub-item: "(a) …" / "a) …"
_LETTER_POINT = re.compile(r"^\s*\(?([a-z])\)\s+(?=\S)")


def _split_numbered_points(body: str) -> List[Tuple[str, str]]:
    """Split a section body into its numbered points.

    Returns [(ref, text)] where ref is "1", "3.1", "3.1 (a)" … Empty when the body
    carries no numbering, in which case the caller indexes the section whole.
    """
    lines = (body or "").splitlines()
    points: List[Tuple[str, List[str]]] = []
    for line in lines:
        m = _NUMBERED_POINT.match(line)
        if m:
            points.append((m.group(1), [line[m.end() :].strip()]))
            continue
        lm = _LETTER_POINT.match(line)
        if lm and points:
            parent = points[-1][0].split(" ")[0]
            points.append((f"{parent} ({lm.group(1)})", [line[lm.end() :].strip()]))
            continue
        if points:
            points[-1][1].append(line)
    out: List[Tuple[str, str]] = []
    for ref, chunk in points:
        text = "\n".join(chunk).strip()
        if len(text) >= 40:  # skip stray numbering with no requirement behind it
            out.append((ref, text))
    return out


def _clean_clause_title(ref: str, heading: str) -> str:
    """Heading text with its own clause number stripped off.

    The segmenter returns the whole header line when a heading carries no text
    after the number, which rendered as "ANNEX II ANNEX II" in the worksheet.
    """
    t = (heading or "").strip()
    r = (ref or "").strip()
    if not t or not r:
        return t[:300]
    if t.lower().startswith(r.lower()):
        t = t[len(r):].strip(" .:-—–\t")
    return "" if t.lower() == r.lower() else t[:300]


def _trim_structured_for_storage(structured: dict) -> dict:
    """Bound product payloads, but keep the full standard section map.

    Standards keep their canonical source in extractedText; their structured section
    records therefore retain all detected clauses and requirement annotations rather
    than silently dropping the tail of large documents.
    """
    s = copy.deepcopy(structured)
    secs = s.get("sections")
    is_standard = bool(s.get("standardMetadata") is not None or s.get("documentTypeGuess") == "STANDARD_OR_REGULATION")
    if isinstance(secs, list):
        out: List[dict] = []
        for item in secs if is_standard else secs[:_MAX_STORED_SECTIONS]:
            if not isinstance(item, dict):
                continue
            c = str(item.get("content") or "")
            if not is_standard and len(c) > _MAX_STORED_SECTION_CONTENT:
                c = c[:_MAX_STORED_SECTION_CONTENT] + "…"
            bullets = item.get("bullets") if isinstance(item.get("bullets"), list) else []
            bullets = [str(b)[:4000] for b in bullets[:60]]
            row = {
                "clauseNumber": item.get("clauseNumber"),
                "heading": str(item.get("heading") or "")[:512],
                "content": c,
                "bullets": bullets,
            }
            for key in (
                "mandatory", "category", "requirements", "sourceStart", "sourceEnd",
                "normativeCandidate", "pageStart", "pageEnd", "sectionType",
                "hierarchyLevel", "parentClause", "title",
            ):
                if key in item:
                    row[key] = item.get(key)
            out.append(row)
        s["sections"] = out
    kps = s.get("keyPoints")
    if isinstance(kps, list):
        s["keyPoints"] = [str(x)[:4000] for x in kps[:200]]
    return s


class IngestionService:
    def __init__(self):
        self.storage = StorageService()
        embedding_api_key = (settings.EMBEDDING_API_KEY or "").strip() or settings.OPENAI_API_KEY
        embedding_base_url = (settings.EMBEDDING_BASE_URL or "").strip() or settings.OPENAI_BASE_URL
        # Kept for log messages: an embedding 401 is almost always a key/base-url
        # mismatch, and naming the endpoint in the error saves the whole diagnosis.
        self._embedding_base_url = embedding_base_url
        self.embeddings = OpenAIEmbeddings(
            api_key=embedding_api_key,
            openai_api_base=embedding_base_url,
            model=settings.EMBEDDING_MODEL,
        )
        logger.info(
            "Embeddings configured with base_url=%s model=%s",
            embedding_base_url,
            settings.EMBEDDING_MODEL,
        )
        self.splitter = RecursiveCharacterTextSplitter(
            chunk_size=settings.CHUNK_SIZE,
            chunk_overlap=settings.CHUNK_OVERLAP,
        )
        # Pinecone connection is best-effort at startup. If DNS/api.pinecone.io is
        # unreachable when the container boots (e.g. transient network glitch on
        # the Docker host), don't crash the whole rag-service, defer the index
        # attach to the first call that actually needs it. Routes that don't use
        # vectors (health, SSE evaluation streams) keep working in the meantime.
        self._pc = Pinecone(api_key=settings.PINECONE_API_KEY)
        self.index = None
        try:
            self._ensure_pinecone_index()
        except Exception as e:
            logger.warning(
                "Pinecone unreachable at startup (%s): service started in degraded mode; "
                "indexing/search will retry connecting on first call.",
                e,
            )

    def _ensure_pinecone_index(self):
        """Lazily attach the Pinecone index. Safe to call repeatedly.

        The dimension is only applied when this process CREATES the index. An index
        that already exists keeps whatever dimension it was created with, so it is
        checked here: attaching to a mismatched index made every upsert fail while
        ingestion still reported success, and the whole corpus stayed unsearchable
        with nothing in the logs pointing at the cause.
        """
        if self.index is not None:
            return self.index
        existing = {i.name: i for i in self._pc.list_indexes()}
        if settings.PINECONE_INDEX_NAME not in existing:
            self._pc.create_index(
                name=settings.PINECONE_INDEX_NAME,
                dimension=EMBEDDING_DIMENSION,
                metric="cosine",
                spec=ServerlessSpec(cloud="aws", region="us-east-1"),
            )
        else:
            found = getattr(existing[settings.PINECONE_INDEX_NAME], "dimension", None)
            if found and int(found) != EMBEDDING_DIMENSION:
                raise RuntimeError(
                    f"Pinecone index '{settings.PINECONE_INDEX_NAME}' has dimension "
                    f"{found}, but embedding model '{settings.EMBEDDING_MODEL}' emits "
                    f"{EMBEDDING_DIMENSION}. Every upsert would be rejected. Point "
                    "PINECONE_INDEX_NAME at an index of the right dimension (or delete "
                    "the mismatched one so it can be recreated)."
                )
        self.index = self._pc.Index(settings.PINECONE_INDEX_NAME)
        return self.index

    def _extract_page_texts(self, data: bytes, mime: str) -> list[str] | None:
        """Per-page text for PDFs, so each vector can carry the page it came from.

        Audit justifications must cite evidence as "<file>, p. N"; without a page on
        the chunk the model can only name the file. Returns None for formats with no
        meaningful pagination (docx, plain text), where chunking stays whole-document.
        """
        if "pdf" not in mime:
            return None
        try:
            from pypdf import PdfReader

            try:
                from app.services.pdf_text_normalize import (
                    normalize_pdf_extracted_text,
                    pick_best_pypdf_page_text,
                )
            except Exception:  # pragma: no cover
                pick_best_pypdf_page_text = None  # type: ignore[assignment]
                normalize_pdf_extracted_text = None  # type: ignore[assignment]

            try:
                from app.services.pdf_text_layout import extract_pdf_pages_layout
                layout_pages = extract_pdf_pages_layout(data)
                if layout_pages:
                    return [text for _, text in layout_pages]
            except Exception as layout_exc:
                logger.warning("Layout-aware page extraction failed (%s); using pypdf fallback", layout_exc)

            pages: list[str] = []
            for p in reader.pages:
                if pick_best_pypdf_page_text and normalize_pdf_extracted_text:
                    pages.append(normalize_pdf_extracted_text(pick_best_pypdf_page_text(p)))
                else:
                    pages.append(p.extract_text() or "")
            return pages
        except Exception as e:
            logger.warning("Per-page PDF extraction failed (%s), indexing without pages", e)
            return None

    def _extract(self, data: bytes, mime: str) -> Tuple[str, int]:
        if "pdf" in mime:
            from pypdf import PdfReader

            try:
                from app.services.pdf_text_normalize import normalize_pdf_extracted_text, pick_best_pypdf_page_text
            except Exception:  # pragma: no cover
                pick_best_pypdf_page_text = None  # type: ignore[assignment]
                normalize_pdf_extracted_text = None  # type: ignore[assignment]

            r = PdfReader(io.BytesIO(data))
            try:
                from app.services.pdf_text_layout import extract_pdf_pages_layout
                layout_pages = extract_pdf_pages_layout(data)
                if layout_pages:
                    return "\n\n".join(text for _, text in layout_pages if text.strip()), len(r.pages)
            except Exception as layout_exc:
                logger.warning("Layout-aware PDF extraction failed (%s); using pypdf fallback", layout_exc)
            if pick_best_pypdf_page_text and normalize_pdf_extracted_text:
                raw = "\n\n".join(pick_best_pypdf_page_text(p) for p in r.pages)
                text = normalize_pdf_extracted_text(raw)
            else:
                text = "\n\n".join(p.extract_text() or "" for p in r.pages)
            return text, len(r.pages)

        if "openxmlformats" in mime or "docx" in mime:
            from docx import Document

            d = Document(io.BytesIO(data))
            return "\n".join(p.text for p in d.paragraphs if p.text.strip()), 1

        if "msword" in mime:
            try:
                text = data.decode("latin-1", errors="ignore")
                import re

                text = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f]", " ", text)
                text = re.sub(r"\s+", " ", text).strip()
                if not text:
                    raise ValueError("No readable text in .doc file")
                return text, 1
            except Exception as e:
                raise ValueError(f"Cannot extract .doc file: {e}")

        if "spreadsheetml.sheet" in mime or mime.endswith("ms-excel"):
            try:
                from openpyxl import load_workbook
            except ImportError as e:
                raise ValueError("openpyxl is required for XLSX") from e
            wb = load_workbook(io.BytesIO(data), read_only=True, data_only=True)
            lines: List[str] = []
            for sheet in wb.worksheets:
                lines.append(f"## {sheet.title}")
                for row in sheet.iter_rows(max_row=500, max_col=50, values_only=True):
                    cells = [str(c).strip() for c in row if c is not None and str(c).strip()]
                    if cells:
                        lines.append("\t".join(cells))
            wb.close()
            text = "\n".join(lines).strip()
            if not text:
                raise ValueError("No readable cells in spreadsheet")
            return text, 1

        if mime.startswith("image/"):
            import pytesseract
            from PIL import Image

            return pytesseract.image_to_string(Image.open(io.BytesIO(data))), 1

        raise ValueError(f"Unsupported mime type: {mime}")

    async def _patch_document_extraction(
        self,
        document_id: str,
        company_id: str,
        status: str,
        extracted_text: str | None = None,
        extracted_structured: dict | None = None,
        processing_error: str | None = None,
        copyright_finding: str | None = None,
        extraction_progress: dict | None = None,
    ) -> None:
        base = settings.DOCUMENT_SERVICE_URL.rstrip("/")
        url = f"{base}/api/documents/internal/extraction/{document_id}"
        token = (settings.DOCUMENT_INTERNAL_TOKEN or "").strip()
        if not token:
            logger.warning("DOCUMENT_INTERNAL_TOKEN not set; callback to document-service may fail")
        payload: dict[str, Any] = {
            "company_id": company_id,
            "status": status,
            "extracted_text": extracted_text,
            "extracted_structured": extracted_structured,
            "processing_error": processing_error,
            # Set when the OCR'd text looks like a reproduced licensed standard.
            "copyright_finding": copyright_finding,
            "extraction_progress": extraction_progress,
        }
        async with httpx.AsyncClient() as client:
            r = await client.patch(
                url,
                json=payload,
                headers={"X-Internal-Token": token},
                timeout=60.0,
            )
            if r.is_error:
                body = (r.text or "")[:500]
                logger.error(
                    "document-service callback failed: %s %s: %s (set matching DOCUMENT_INTERNAL_TOKEN on both services)",
                    r.status_code,
                    url,
                    body,
                )
            r.raise_for_status()

    async def _embed_document_chunks(self, chunks: List[str]) -> List[List[float]] | None:
        """Embed in small batches; OpenRouter sometimes returns null `data` for wrong model names."""
        if not chunks:
            return []
        out: List[List[float]] = []
        batch_size = 16
        for i in range(0, len(chunks), batch_size):
            batch = chunks[i : i + batch_size]
            try:
                vecs = await self.embeddings.aembed_documents(batch)
            except (TypeError, ValueError) as e:
                # error(), not warning(): nothing downstream can work without vectors,
                # and this was previously easy to miss in a healthy-looking log.
                logger.error(
                    "Embedding API error (batch %s-%s) with base_url=%s model=%s: %s",
                    i, i + len(batch), self._embedding_base_url, settings.EMBEDDING_MODEL, e,
                )
                return None
            except Exception as e:
                logger.error(
                    "Embedding failed (batch %s-%s) with base_url=%s model=%s: %s, a 401 here "
                    "usually means EMBEDDING_BASE_URL and EMBEDDING_API_KEY belong to different "
                    "providers; leave both blank to inherit the working OPENAI_* pair.",
                    i, i + len(batch), self._embedding_base_url, settings.EMBEDDING_MODEL, e,
                )
                return None
            if not vecs or len(vecs) != len(batch):
                logger.error(
                    "Embedding response invalid: got %s vectors for %s chunks, check EMBEDDING_MODEL "
                    "(OpenRouter: use openai/text-embedding-3-small)",
                    len(vecs or []),
                    len(batch),
                )
                return None
            width = len(vecs[0]) if vecs and vecs[0] else 0
            if width != EMBEDDING_DIMENSION:
                logger.error(
                    "Embedding model '%s' returned %d-dimension vectors but the index expects "
                    "%d: refusing to upsert vectors Pinecone would reject.",
                    settings.EMBEDDING_MODEL, width, EMBEDDING_DIMENSION,
                )
                return None
            out.extend(vecs)
        return out

    async def _index_vectors(
        self,
        document_id: str,
        company_id: str,
        text: str,
        doc_type: str,
        iso_standard: str | None,
        file_name: str | None = None,
        page_texts: list[str] | None = None,
        clause_aware: bool = False,
        sections: list[dict] | None = None,
    ) -> int:
        text = (text or "").strip()
        if not text and not page_texts:
            logger.info("Skipping Pinecone upsert: no text for doc %s", document_id)
            return 0

        chunks: list[str] = []
        chunk_pages: list[int] = []
        chunk_refs: list[str] = []
        chunk_titles: list[str] = []

        # Standards are indexed clause-by-clause so a clause's own text can be
        # fetched by exact reference. Retrieving it by semantic similarity pulls in
        # cross-references from neighbouring clauses, which made the auditor title
        # clauses after whatever number appeared in the noise.
        if clause_aware and sections:
            for raw_sec in sections:
                if not isinstance(raw_sec, dict):
                    continue
                ref = _clean_clause_ref(raw_sec.get("clauseNumber") or "")
                title = _clean_clause_title(ref, _clean_clause_ref(raw_sec.get("heading") or ""))
                body = (raw_sec.get("content") or "").strip()
                if not body and not title:
                    continue
                page = int(raw_sec.get("pageStart") or 0) if str(raw_sec.get("pageStart") or "").isdigit() else 0
                points = raw_sec.get("requirements") if isinstance(raw_sec.get("requirements"), list) else []
                # The canonical extracted clause is the primary RAG source. Requirements
                # are appended only as compact annotations, never as a replacement for
                # the original source text.
                req_lines = []
                for req in points[:50]:
                    if isinstance(req, dict) and str(req.get("text") or "").strip():
                        req_lines.append(f"Requirement: {str(req.get('text')).strip()}")
                payload = f"{ref} {title}\n{body}".strip()
                if req_lines:
                    payload += "\n" + "\n".join(req_lines)
                for c in self.splitter.split_text(payload):
                    chunks.append(c)
                    chunk_pages.append(page)
                    chunk_refs.append(ref)
                    chunk_titles.append(title[:300])

        # Backward-compatible fallback for older standards whose structured sections
        # are not available yet.
        if clause_aware and not sections and text:
            for sec in segment_by_numbered_headings(text) or []:
                ref = _clean_clause_ref(sec.get("clauseNumber") or "")
                # A real clause id is short; long "refs" are cross-reference
                # sentences the heading regex mistook for a heading.
                if not ref or len(ref) > 24:
                    continue
                title = _clean_clause_title(ref, _clean_clause_ref(sec.get("heading") or ""))
                body = (sec.get("content") or "").strip()

                # Prefer the numbered points inside the section: those are the
                # auditable requirements, and their numbers ("3.1", "3.1 (a)") are
                # the clause versions an auditor cites: not the section header.
                points = _split_numbered_points(body)
                if points:
                    section_title = title or _clean_clause_ref(ref)
                    for point_ref, point_text in points:
                        for c in self.splitter.split_text(
                            f"{point_ref} {section_title}\n{point_text}".strip()
                        ):
                            chunks.append(c)
                            chunk_pages.append(0)
                            chunk_refs.append(point_ref)
                            chunk_titles.append(section_title[:300])
                    continue

                # Heading-only section: keep it so the worksheet still shows the
                # non-normative title row.
                for c in self.splitter.split_text(f"{ref} {title}\n{body}".strip()):
                    chunks.append(c)
                    chunk_pages.append(0)
                    chunk_refs.append(ref)
                    chunk_titles.append(title[:300])
            if chunks:
                logger.info(
                    "Clause-aligned index for doc %s: %d clause chunk(s)", document_id, len(chunks)
                )

        # Chunk page-by-page when pagination is known, so every chunk keeps its page.
        if not chunks and page_texts:
            for page_no, page_text in enumerate(page_texts, start=1):
                for c in self.splitter.split_text((page_text or "").strip()):
                    chunks.append(c)
                    chunk_pages.append(page_no)
                    chunk_refs.append("")
                    chunk_titles.append("")
        if not chunks:
            chunks = self.splitter.split_text(text)
            chunk_pages = [0] * len(chunks)
            chunk_refs = [""] * len(chunks)
            chunk_titles = [""] * len(chunks)
        if not chunks:
            return 0

        vectors = await self._embed_document_chunks(chunks)
        if vectors is None:
            logger.error(
                "Vector indexing skipped for %s: document stays READY but not searchable. "
                "Set EMBEDDING_MODEL=openai/text-embedding-3-small when using OpenRouter.",
                document_id,
            )
            return 0

        batch = [
            {
                "id": f"{company_id}::{document_id}::c{i}",
                "values": v,
                "metadata": {
                    "company_id": company_id,
                    "document_id": document_id,
                    "doc_type": doc_type,
                    "iso_standard": iso_standard or "",
                    "chunk_index": i,
                    # Carried so audit justifications can cite the source document by
                    # name and page rather than by opaque UUID. page 0 = unpaginated.
                    "file_name": file_name or "",
                    "page": chunk_pages[i] if i < len(chunk_pages) else 0,
                    # Exact clause this chunk belongs to (standards only).
                    "clause_ref": chunk_refs[i] if i < len(chunk_refs) else "",
                    "clause_title": chunk_titles[i] if i < len(chunk_titles) else "",
                    "text": chunks[i][:800],
                },
            }
            for i, v in enumerate(vectors)
        ]
        # Pinecone (and gRPC) reject payloads > ~4MB; large PDFs can produce thousands of vectors in one call.
        upsert_chunk = 40
        index = self._ensure_pinecone_index()
        for start in range(0, len(batch), upsert_chunk):
            index.upsert(vectors=batch[start : start + upsert_chunk], namespace=company_id)
        logger.info("Indexed %s chunks for doc %s", len(batch), document_id)
        return len(batch)

    async def run_full_pipeline(self, req: IngestRequest) -> None:
        """Download → extract text → OpenAI JSON structure → callback document-service → Pinecone."""
        doc_id = req.document_id
        company_id = req.company_id
        mime = req.mime_type
        doc_type = req.doc_type.value if hasattr(req.doc_type, "value") else str(req.doc_type)
        file_name = req.file_name or "document"
        description = req.description or ""

        async def report_standard_progress(progress: dict) -> None:
            await self._patch_document_extraction(doc_id, company_id, "PROCESSING", extraction_progress=progress)

        if doc_type == "ISO_NORM":
            try:
                await report_standard_progress({"phase": "reading"})
            except Exception:
                logger.warning("Could not publish initial extraction progress for %s", doc_id)

        try:
            raw = self.storage.download(req.storage_key)
        except Exception as e:
            logger.exception("Download failed for %s", doc_id)
            try:
                await self._patch_document_extraction(
                    doc_id,
                    company_id,
                    "FAILED",
                    processing_error=f"Could not fetch file from storage: {e}",
                )
            except Exception:
                logger.exception("Callback after download failure failed")
            return

        raw_text = ""
        page_texts: list[str] | None = None
        ocr_info: dict = {"ocrPages": [], "unresolvedPages": [], "warnings": []}
        extract_err: Exception | None = None
        effective_mime = (mime or "").lower()
        # Use one canonical PDF extraction result for the entire product pipeline.
        # Previously `_extract()` and `_extract_page_texts()` each parsed the same
        # PDF independently, and indexing parsed it a third time. Large PDFs could
        # therefore spend hours in repeated layout/OCR work before the LLM ever ran.
        is_pdf = effective_mime.find("pdf") >= 0 or file_name.lower().endswith(".pdf")

        for attempt in range(2):
            try:
                if is_pdf:
                    # Product/evidence PDFs use the lightweight page-aware parser. Standards keep
                    # the geometry-aware parser because clause/layout fidelity is critical there.
                    extractor = extract_product_pdf_fast if doc_type in ("PRODUCT_DOC", "EVIDENCE") else extract_pdf
                    extracted = await asyncio.to_thread(extractor, raw, file_name)
                    if extracted.error:
                        raise RuntimeError(extracted.error)
                    raw_text = (extracted.doc_text or "").strip()
                    # Keep one page-text representation and reuse it for structure,
                    # provenance and Pinecone. Missing/scanned pages are intentionally
                    # left for the dedicated scanned-PDF path; they must not trigger a
                    # second full PDF parse here.
                    page_map = {page_no + 1: text for page_no, text in extracted.pages_text}
                    total_pages = extracted.page_count or max(
                        page_map.keys(), default=0
                    )
                    page_texts = [page_map.get(i, "") for i in range(1, total_pages + 1)]
                    if doc_type == "ISO_NORM":
                        from app.services.standard_ocr import recover_standard_scan_pages
                        page_texts, ocr_info = await asyncio.to_thread(
                            recover_standard_scan_pages, raw, page_texts,
                            languages=settings.STANDARD_OCR_LANGUAGES,
                            max_pages=settings.STANDARD_OCR_MAX_PAGES,
                            total_timeout=settings.STANDARD_OCR_TOTAL_TIMEOUT_SEC,
                        )
                        raw_text = "\n\n".join(text for text in page_texts if text.strip()).strip()
                else:
                    raw_text, _page_count = await asyncio.to_thread(self._extract, raw, mime)
                    raw_text = (raw_text or "").strip()
                    page_texts = None
                extract_err = None
                break
            except Exception as e:
                extract_err = e
                logger.warning("Extract attempt %s/2 for %s: %s", attempt + 1, doc_id, e)
                if attempt == 0:
                    await asyncio.sleep(1.0)

        if extract_err is not None:
            try:
                await self._patch_document_extraction(
                    doc_id,
                    company_id,
                    "FAILED",
                    processing_error=f"Extraction failed: {extract_err}"[:2000],
                )
            except Exception:
                logger.exception("Callback after extraction failure failed")
            return

        structured: dict | None = None
        struct_err: Exception | None = None
        async with _extraction_semaphore:
            structured, struct_err = await _retry_with_backoff(
                lambda: structure_content(
                    raw_text=raw_text,
                    buffer=raw,
                    # Normalize the effective format before semantic extraction.
                    # Some browsers/proxies report PDFs as application/octet-stream;
                    # without this normalization the PDF-specific one-call path in
                    # structure_openai.py is skipped and the service falls back to
                    # the legacy multi-chunk product path — the main reason PDFs could
                    # remain PROCESSING for hours while images completed immediately.
                    mime_type=("application/pdf" if is_pdf else mime),
                    file_name=file_name,
                    doc_type=doc_type,
                    iso_hint=req.iso_standard,
                    description_hint=description or None,
                    page_texts=page_texts if is_pdf else None,
                    progress_callback=report_standard_progress if doc_type == "ISO_NORM" else None,
                ),
                attempts=5,
                stage="structure_content",
                doc_id=doc_id,
            )
        if struct_err is not None or structured is None:
            is_credit_exhausted = _is_credit_exhausted_error(struct_err) if struct_err else False
            is_rate_limit = _is_rate_limit_error(struct_err) if struct_err else False
            if is_credit_exhausted:
                error_msg = f"The AI provider account has run out of credits: {struct_err}"
            elif is_rate_limit:
                error_msg = (
                    "AI provider rate limit exhausted during semantic extraction: "
                    f"{struct_err}. Retry the pending standard sections; deterministic source text and "
                    "successfully analyzed sections are preserved."
                )
            else:
                error_msg = f"AI structuring failed: {struct_err}"
            try:
                await self._patch_document_extraction(
                    doc_id,
                    company_id,
                    "FAILED",
                    processing_error=error_msg[:2000],
                )
            except Exception:
                logger.exception("Callback after structure failure failed")
            return

        if doc_type == "ISO_NORM":
            existing_sections = structured.get("sections")
            # segment_by_numbered_headings() runs a much cruder, unfiltered regex
            # pass over raw_text (not the page-aware, plausibility-checked text
            # standard_pipeline.py produces) and merge_iso_sections() folds its
            # output back in unconditionally. When the deterministic pipeline
            # above already produced real sections, this merge only reintroduces
            # exactly the kind of false-heading/duplicate noise standard_pipeline.py
            # filters out — and now also feeds the compliance engine's clause
            # list directly (see evaluation_engine.py), so corrupting it here
            # corrupts every evaluation downstream too. Keep this strictly as a
            # last-resort fallback for when deterministic detection found nothing.
            if not isinstance(existing_sections, list) or not existing_sections:
                pattern_secs = segment_by_numbered_headings(raw_text)
                if pattern_secs:
                    logger.warning(
                        "ISO_NORM %s: deterministic section detection produced %d section(s); "
                        "falling back to pattern-based segmentation (%d sections)",
                        doc_id, len(existing_sections or []), len(pattern_secs),
                    )
                    structured["sections"] = pattern_secs

            quality = structured.get("standardExtractionQuality")
            if isinstance(quality, dict):
                quality["ocrPages"] = ocr_info.get("ocrPages", [])
                quality["mixedImagePages"] = ocr_info.get("mixedImagePages", [])
                quality["unresolvedPages"] = ocr_info.get("unresolvedPages", [])
                quality.setdefault("warnings", []).extend(ocr_info.get("warnings", []))
                if ocr_info.get("warnings"):
                    quality["needsHumanReview"] = True
                if ocr_info.get("unresolvedPages"):
                    quality["processingComplete"] = False
                    quality["productionReady"] = False

        # Product extraction is intentionally single-pass. The structured product
        # contract already contains the core fields, category-specific fields,
        # custom diligence fields, fieldSources and fieldEvidence. Running a second
        # independent onboarding LLM pass on the same PDF/image creates contradictory
        # product facts and doubles provider latency/rate-limit pressure. Any onboarding
        # UI should consume the canonical productProfile instead.

        structured = _trim_structured_for_storage(structured)
        # Standards keep the clean, deterministic PDF text as the canonical stored
        # source. Do not flatten metadata + every section back into the text field:
        # that duplicates paragraphs, pollutes RAG, and destroys source fidelity.
        is_standard_document = doc_type == "ISO_NORM" or structured.get("documentTypeGuess") == "STANDARD_OR_REGULATION"
        flattened = flatten_for_search(raw_text, structured)
        canonical_standard_text = "\n\n".join((p or "").strip() for p in (page_texts or []))
        extracted_source = canonical_standard_text if is_standard_document and canonical_standard_text.strip() else raw_text
        extracted_text_candidate = extracted_source if is_standard_document else flattened
        # Standards are re-indexed from this stored text on activation, so a tight
        # cap silently truncated them to the preamble: the normative clauses and
        # annexes never reached the vector store and evaluations found no clauses.
        # extracted_text is a Postgres `text` column and the callback body limit is
        # 25 MB, so this bound only guards against pathological files.
        extracted_text = extracted_text_candidate[:_MAX_EXTRACTED_TEXT] if extracted_text_candidate else None
        if extracted_text_candidate and len(extracted_text_candidate) > _MAX_EXTRACTED_TEXT:
            if is_standard_document and isinstance(structured.get("standardExtractionQuality"), dict):
                quality = structured["standardExtractionQuality"]
                quality["processingComplete"] = False
                quality["productionReady"] = False
                quality["needsHumanReview"] = True
                quality.setdefault("warnings", []).append("Stored source text exceeded its size limit; this extraction is incomplete.")
            logger.warning(
                "Extracted text for %s truncated from %d to %d characters",
                doc_id,
                len(extracted_text_candidate),
                _MAX_EXTRACTED_TEXT,
            )

        # ── Copyright guardrail ───────────────────────────────────────────────
        # Runs before any vector write: a reproduced licensed standard must not
        # reach Pinecone. The title check at upload cannot see inside a
        # mislabelled scan, so this reads the extracted text instead.
        finding = scan_for_licensed_content(raw_text)
        copyright_note = describe_copyright(finding) if finding else None
        if finding:
            logger.warning(
                "Copyright guardrail: quarantining %s: rule=%s evidence=%r",
                doc_id, finding.rule, finding.evidence[:120],
            )

        try:
            await self._patch_document_extraction(
                doc_id,
                company_id,
                "READY",
                extracted_text=extracted_text,
                extracted_structured=structured,
                copyright_finding=copyright_note,
            )
        except Exception as e:
            logger.exception("Callback to document-service failed for %s: %s", doc_id, e)
            return

        if copyright_note:
            # Quarantined: no vectors. A Quality Manager must accept responsibility
            # (or delete it) before it can be indexed or activated.
            logger.warning("Skipping vector indexing for quarantined document %s", doc_id)
            return

        # STD-006: ISO norms are indexed only after QM activates (see /api/index-standard).
        if doc_type != "ISO_NORM":
            try:
                await self._index_vectors(
                    doc_id,
                    company_id,
                    flattened or raw_text,
                    doc_type,
                    req.iso_standard,
                    file_name=file_name,
                    # Reuse the canonical PDF page extraction already computed above;
                    # never parse the same PDF again just to build vector provenance.
                    page_texts=page_texts,
                    clause_aware=(doc_type == "ISO_NORM"),
                )
            except Exception as e:
                logger.exception("Vector indexing failed for %s (document already READY): %s", doc_id, e)

    async def index_standard_clause_text(
        self,
        document_id: str,
        company_id: str,
        text: str,
        doc_type: str,
        iso_standard: str | None,
        file_name: str | None = None,
        version: int | None = None,
        sections: list[dict] | None = None,
    ) -> int:
        """Replace vectors for a standard with clause-aligned text (activation)."""
        await self.delete(document_id, company_id)
        return await self._index_vectors(
            document_id,
            company_id,
            text,
            doc_type,
            iso_standard,
            file_name=file_name,
            clause_aware=True,
            sections=sections,
        )

    async def search(
        self,
        query: str,
        company_id: str,
        top_k: int = 6,
        filter: dict | None = None,
        document_ids_in: list[str] | None = None,
    ) -> list:
        qv = await self.embeddings.aembed_query(query)
        if document_ids_in is not None and len(document_ids_in) > 0:
            if len(document_ids_in) == 1:
                pf = {"document_id": {"$eq": document_ids_in[0]}}
            else:
                pf = {"document_id": {"$in": document_ids_in}}
        elif filter:
            pf = {k: {"$eq": v} for k, v in filter.items()}
        else:
            pf = None
        index = self._ensure_pinecone_index()
        results = index.query(
            vector=qv,
            top_k=top_k,
            namespace=company_id,
            include_metadata=True,
            filter=pf,
        )
        return results.matches or []

    async def delete(self, document_id: str, company_id: str):
        """Remove every vector of a document.

        Serverless Pinecone indexes do NOT support delete-by-metadata-filter, so
        the old filter call silently left the vectors in place and each re-index
        stacked a fresh copy on top of the previous one. Vector ids are
        deterministic (``{company}::{document}::c{n}``), so delete by id prefix and
        keep the filter form only as a fallback for pod-based indexes.
        """
        index = self._ensure_pinecone_index()
        prefix = f"{company_id}::{document_id}::"
        deleted = 0
        try:
            ids: list[str] = []
            for page in index.list(prefix=prefix, namespace=company_id):
                ids.extend(page if isinstance(page, list) else [page])
            for start in range(0, len(ids), 1000):
                index.delete(ids=ids[start : start + 1000], namespace=company_id)
                deleted += len(ids[start : start + 1000])
            if deleted:
                logger.info("Deleted %d vector(s) for doc %s", deleted, document_id)
                return
        except Exception as e:
            logger.warning("Prefix delete unavailable for %s (%s), trying filter", document_id, e)

        try:
            index.delete(filter={"document_id": {"$eq": document_id}}, namespace=company_id)
            logger.info("Vectors deleted by filter for doc %s", document_id)
        except Exception as e:
            logger.warning("Vector delete failed for %s: %s", document_id, e)
