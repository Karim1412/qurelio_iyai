import asyncio
import json

from fastapi            import APIRouter, HTTPException, Request
from fastapi.responses  import StreamingResponse
from app.services.event_bus import get_event_bus
from app.models.schemas import (
    IngestRequest,
    IngestResponse,
    IndexStandardRequest,
    EvaluateRequest,
    EvaluateResponse,
    ChatRequest,
    ChatResponse,
    NcRootCauseAiRequest,
    NcRootCauseAiResponse,
    NcIshikawaAiRequest,
    NcIshikawaAiResponse,
    ProbableCauseItem,
    AuditChecklistScoreRequest,
    AuditChecklistScoreResponse,
    AuditClauseEvidenceItemsRequest,
    AuditClauseEvidenceItemsResponse,
)
from app.services.ingestion         import IngestionService
from app.services.evaluation_engine import EvaluationEngine
from app.services.chat              import ChatService
from app.services.capa_ai                 import CapaAiService
from app.services.audit_checklist_score import AuditChecklistScoreAiService
from app.services.audit_clause_evidence_items import AuditClauseEvidenceItemsAiService
import logging

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api")

# Service singletons: initialised at startup
_ingestion: IngestionService = None
_evaluator: EvaluationEngine = None
_chat:      ChatService      = None
_capa_ai:           CapaAiService               = None
_checklist_score_ai: AuditChecklistScoreAiService = None
_clause_evidence_items_ai: AuditClauseEvidenceItemsAiService = None


def init_services():
    global _ingestion, _evaluator, _chat, _capa_ai, _checklist_score_ai, _clause_evidence_items_ai
    _ingestion = IngestionService()
    _evaluator = EvaluationEngine(_ingestion)
    _chat      = ChatService(_ingestion)
    _capa_ai   = CapaAiService()
    _checklist_score_ai = AuditChecklistScoreAiService()
    _clause_evidence_items_ai = AuditClauseEvidenceItemsAiService()
    logger.info("RAG services ready")


@router.get("/health")
async def health():
    return {"status": "ok", "service": "rag-service"}


async def _run_ingest_safe(req: IngestRequest) -> None:
    """Background task wrapper that ALWAYS closes the document state on unexpected errors."""
    try:
        await _ingestion.run_full_pipeline(req)
    except Exception as exc:
        logger.exception("run_full_pipeline failed for document_id=%s", req.document_id)
        try:
            await _ingestion._patch_document_extraction(
                req.document_id,
                req.company_id,
                "FAILED",
                processing_error=f"Unhandled ingestion failure: {type(exc).__name__}: {exc}"[:2000],
            )
        except Exception:
            logger.exception("Failed to mark document %s as FAILED after ingestion crash", req.document_id)


@router.post("/index-standard")
async def index_standard(req: IndexStandardRequest):
    """STD-006: tenant-scoped vectors from approved clause text (post-activation)."""
    try:
        n = await _ingestion.index_standard_clause_text(
            req.document_id,
            req.company_id,
            req.text,
            req.doc_type,
            req.iso_standard,
            req.file_name,
            req.version,
            sections=req.sections,
        )
        if n == 0 and (req.text or "").strip():
            # Reporting OK for zero vectors let document-service mark the standard
            # ACTIVE with nothing indexed; every later evaluation then failed with
            # "no indexed text". Fail here so activation reverts to PROCESSING.
            raise HTTPException(
                502,
                "No vectors were written for this standard. Embedding or Pinecone "
                "upsert failed. Check the rag-service log for the embedding endpoint "
                "and index dimension.",
            )
        return {"document_id": req.document_id, "chunks_indexed": n, "status": "OK"}
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("index_standard failed")
        raise HTTPException(500, str(e))


@router.post("/ingest", response_model=IngestResponse, status_code=202)
async def ingest(req: IngestRequest):
    """
    Enqueue a long-running extraction job and acknowledge immediately.

    Standard extraction can involve PDF parsing, section detection, multiple small
    LLM calls, retries/backoff and Pinecone work. It must never hold the HTTP request
    open for the lifetime of that job. The document-service records PROCESSING and
    receives progress/final status through the existing callback.
    """
    asyncio.create_task(_run_ingest_safe(req))
    return IngestResponse(document_id=req.document_id, chunks_indexed=0, status="QUEUED")


@router.post("/evaluate", response_model=EvaluateResponse)
async def evaluate(req: EvaluateRequest):
    try:
        return await _evaluator.evaluate(
            evaluation_id=req.evaluation_id,
            company_id=req.company_id,
            iso_document_id=req.iso_document_id,
            product_document_id=req.product_document_id,
            iso_standard=req.iso_standard,
            evidence_document_ids=req.evidence_document_ids,
            scoring_method=req.scoring_method,
            clause_weights=req.clause_weights,
            assessment_provisional=req.assessment_provisional,
        )
    except Exception as e:
        logger.error(f"Evaluate failed: {e}", exc_info=True)
        bus = get_event_bus()
        try:
            await bus.publish(req.evaluation_id, "failed", error=str(e)[:500])
            await bus.close(req.evaluation_id)
        except Exception:
            logger.exception("event_bus publish 'failed' failed")
        raise HTTPException(500, str(e))


@router.get("/evaluations/{evaluation_id}/stream")
async def stream_evaluation(evaluation_id: str, request: Request):
    """SSE feed of agent activity for one evaluation. Replays buffered events on connect."""
    bus = get_event_bus()
    sub = await bus.subscribe(evaluation_id)

    async def gen():
        try:
            yield f"event: hello\ndata: {json.dumps({'evaluation_id': evaluation_id})}\n\n"
            while True:
                if await request.is_disconnected():
                    break
                try:
                    ev = await sub.get(timeout=15.0)
                except asyncio.TimeoutError:
                    yield ": ping\n\n"
                    continue
                if ev is None:
                    yield "event: closed\ndata: {}\n\n"
                    break
                payload = json.dumps(ev, default=str)
                yield f"event: {ev['type']}\ndata: {payload}\n\n"
        finally:
            await sub.close()

    return StreamingResponse(
        gen(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )


@router.post("/chat", response_model=ChatResponse)
async def chat(req: ChatRequest):
    try:
        return await _chat.chat(req)
    except Exception as e:
        logger.error(f"Chat failed: {e}", exc_info=True)
        raise HTTPException(500, str(e))


@router.post("/capa/root-cause-suggestions", response_model=NcRootCauseAiResponse)
async def capa_root_cause_suggestions(req: NcRootCauseAiRequest):
    """CAPA-008: probable root causes using current NC + tenant history lines from evaluation-service."""
    try:
        raw = await _capa_ai.root_cause_suggestions(
            title=req.title,
            description=req.description,
            iso_clause=req.iso_clause or "",
            classification=req.classification or "",
            history_lines=req.history_lines or [],
        )
        items = [
            ProbableCauseItem(
                id=str(c.get("id", f"pc{i}")),
                title=str(c.get("title", ""))[:200],
                rationale=str(c.get("rationale", ""))[:1200],
                confidence=float(c.get("confidence", 0.5)),
            )
            for i, c in enumerate(raw.get("probable_causes") or [])
            if isinstance(c, dict)
        ]
        return NcRootCauseAiResponse(probable_causes=items, model=raw.get("model"))
    except Exception as e:
        logger.exception("capa_root_cause_suggestions failed")
        raise HTTPException(500, str(e))


@router.post("/audit/checklist-score", response_model=AuditChecklistScoreResponse)
async def audit_checklist_score(req: AuditChecklistScoreRequest):
    """Suggest 0–100 % for one autodiagnostic criterion (evaluation-service supplies row text)."""
    try:
        raw = await _checklist_score_ai.suggest_score(
            question=req.question,
            answer=req.answer,
            notes=req.notes,
            iso_clause=req.iso_clause,
            iso_standard=req.iso_standard,
            evidence_checklist_text=req.evidence_checklist_text,
        )
        return AuditChecklistScoreResponse(
            score=int(raw["score"]),
            answer=(raw.get("answer") or None),
            rationale=(raw.get("rationale") or None),
            model=raw.get("model"),
        )
    except Exception as e:
        logger.exception("audit_checklist_score failed")
        raise HTTPException(500, str(e))


@router.post("/audit/clause-evidence-items", response_model=AuditClauseEvidenceItemsResponse)
async def audit_clause_evidence_items(req: AuditClauseEvidenceItemsRequest):
    """Short checklist lines for one clause/criterion (audit evidence checklist)."""
    try:
        raw = await _clause_evidence_items_ai.suggest_items(
            question=req.question,
            iso_clause=req.iso_clause,
            iso_standard=req.iso_standard,
            existing_labels=req.existing_labels,
        )
        return AuditClauseEvidenceItemsResponse(
            items=list(raw.get("items") or [])[:12],
            model=raw.get("model"),
        )
    except Exception as e:
        logger.exception("audit_clause_evidence_items failed")
        raise HTTPException(500, str(e))


@router.post("/capa/ishikawa-suggestions", response_model=NcIshikawaAiResponse)
async def capa_ishikawa_suggestions(req: NcIshikawaAiRequest):
    """CAPA-009: 6M fishbone branch text for the NC."""
    try:
        raw = await _capa_ai.ishikawa_branches(
            title=req.title,
            description=req.description,
            iso_clause=req.iso_clause or "",
            history_lines=req.history_lines or [],
        )
        return NcIshikawaAiResponse(
            man=raw.get("man", "")[:800],
            machine=raw.get("machine", "")[:800],
            material=raw.get("material", "")[:800],
            method=raw.get("method", "")[:800],
            measurement=raw.get("measurement", "")[:800],
            environment=raw.get("environment", "")[:800],
            model=raw.get("model"),
        )
    except Exception as e:
        logger.exception("capa_ishikawa_suggestions failed")
        raise HTTPException(500, str(e))


@router.delete("/documents/{company_id}/{document_id}")
async def delete_vectors(company_id: str, document_id: str):
    await _ingestion.delete(document_id, company_id)
    return {"message": "Vectors deleted"}
