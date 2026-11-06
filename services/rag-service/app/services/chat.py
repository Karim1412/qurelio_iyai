import asyncio
import logging

from langchain_openai import ChatOpenAI
from langchain.prompts import ChatPromptTemplate
from openai import RateLimitError, APIStatusError

from app.config import get_settings
from app.services.ingestion import IngestionService
from app.services.workspace_context import fetch_workspace_summary
from app.models.schemas import ChatRequest, ChatResponse, SourceDoc

logger = logging.getLogger(__name__)
settings = get_settings()
SEARCH_TIMEOUT_SECONDS = 30
LLM_TIMEOUT_SECONDS = 60

PROMPT = ChatPromptTemplate.from_messages([
    (
        "system",
        "You are Qurelio AI, a quality management expert. Answer using the tenant workspace data "
        "(non-conformities, audits, CAPA) when provided, and the uploaded document excerpts when relevant. "
        "Prefer workspace data for questions about open NCs, audit schedules, due corrective actions, or conformity status. "
        "If neither workspace data nor document excerpts contain the answer, say that no relevant information "
        "was found in the tenant knowledge base. "
        "Answer in the same language as the user's question and cite document sources with the provided source labels.",
    ),
    (
        "human",
        "Workspace data (tenant database):\n{workspace}\n\n"
        "Document excerpts:\n{context}\n\n"
        "History:\n{history}\n\n"
        "Question: {question}",
    ),
])


def _resolve_fallback_llm_config() -> tuple[str, str, str] | None:
    api_key = (settings.CHAT_LLM_FALLBACK_API_KEY or "").strip() or (settings.EMBEDDING_API_KEY or "").strip()
    base_url = (settings.CHAT_LLM_FALLBACK_BASE_URL or "").strip() or (settings.EMBEDDING_BASE_URL or "").strip()
    model = (settings.CHAT_LLM_FALLBACK_MODEL or "").strip() or "openai/gpt-4o-mini"
    if not api_key or not base_url:
        return None
    return api_key, base_url, model


def _make_llm(api_key: str, base_url: str, model: str) -> ChatOpenAI:
    return ChatOpenAI(
        api_key=api_key,
        base_url=base_url,
        model=model,
        temperature=0.2,
        max_tokens=settings.LLM_MAX_TOKENS,
    )


def _is_quota_error(exc: Exception) -> bool:
    if isinstance(exc, RateLimitError):
        return True
    if isinstance(exc, APIStatusError) and exc.status_code == 429:
        return True
    msg = str(exc).lower()
    return "429" in msg or "quota" in msg or "rate limit" in msg


class ChatService:
    def __init__(self, ingestion: IngestionService):
        self.ingestion = ingestion
        self.llm = _make_llm(
            settings.OPENAI_API_KEY,
            settings.OPENAI_BASE_URL,
            settings.OPENAI_MODEL,
        )
        fb = _resolve_fallback_llm_config()
        self.fallback_llm = _make_llm(fb[0], fb[1], fb[2]) if fb else None

    async def _invoke_llm(self, inputs: dict) -> str:
        chain = PROMPT | self.llm
        try:
            result = await asyncio.wait_for(
                chain.ainvoke(inputs),
                timeout=LLM_TIMEOUT_SECONDS,
            )
            return result.content
        except asyncio.TimeoutError:
            raise
        except Exception as primary_err:
            if not _is_quota_error(primary_err) or not self.fallback_llm:
                raise
            logger.warning(
                "primary LLM quota/rate limit (%s); retrying with fallback provider",
                primary_err,
            )
            fallback_chain = PROMPT | self.fallback_llm
            result = await asyncio.wait_for(
                fallback_chain.ainvoke(inputs),
                timeout=LLM_TIMEOUT_SECONDS,
            )
            return result.content

    async def chat(self, req: ChatRequest) -> ChatResponse:
        logger.info("chat request started (company_id=%s)", req.company_id)

        workspace_task = asyncio.create_task(fetch_workspace_summary(req.company_id))

        try:
            matches = await asyncio.wait_for(
                self.ingestion.search(req.question, req.company_id, top_k=6),
                timeout=SEARCH_TIMEOUT_SECONDS,
            )
        except asyncio.TimeoutError:
            logger.warning("chat retrieval timed out after %ss", SEARCH_TIMEOUT_SECONDS)
            return ChatResponse(
                answer="The document search is taking too long right now. Please try again in a moment.",
                sources=[],
            )
        except Exception as e:
            logger.warning("chat retrieval failed: %s", e)
            return ChatResponse(
                answer="Document search is temporarily unavailable. Please verify embedding configuration and retry.",
                sources=[],
            )

        workspace = await workspace_task

        if not matches and not workspace:
            return ChatResponse(
                answer="No relevant documents found. Please upload your quality documents first.",
                sources=[],
            )

        context = "\n\n---\n\n".join(
            (
                f"[Source: {m.metadata.get('file_name') or m.metadata.get('document_id', '?')} "
                f"v{m.metadata.get('version') or 1} | {m.metadata.get('doc_type', '?')}]\n"
                f"{m.metadata.get('text', '')}"
            )
            for m in matches
        ) if matches else "(no matching document excerpts)"
        context = context[:12000]
        workspace = (workspace or "(no workspace records loaded)")[:8000]
        history = "\n".join(
            f"{'User' if m.role == 'user' else 'Assistant'}: {m.content}"
            for m in (req.history or [])[-6:]
        ) or "None"

        inputs = {
            "workspace": workspace,
            "context": context,
            "history": history,
            "question": req.question,
        }

        try:
            answer = await self._invoke_llm(inputs)
        except asyncio.TimeoutError:
            logger.warning("chat LLM timed out after %ss", LLM_TIMEOUT_SECONDS)
            return ChatResponse(
                answer="The AI response took too long and was canceled. Please try again.",
                sources=[],
            )
        except Exception as e:
            if _is_quota_error(e):
                logger.warning("chat LLM quota exhausted: %s", e)
                return ChatResponse(
                    answer=(
                        "The AI provider quota is temporarily exceeded. "
                        "Please wait a few minutes and try again, or switch the chat LLM to OpenRouter in your environment settings."
                    ),
                    sources=[],
                )
            raise

        sources = [
            SourceDoc(
                document_id=m.metadata.get("document_id", ""),
                chunk_text=m.metadata.get("text", "")[:250],
                score=m.score,
                metadata={
                    "doc_type": m.metadata.get("doc_type", ""),
                    "file_name": m.metadata.get("file_name", ""),
                    "version": m.metadata.get("version", 1),
                },
            )
            for m in matches[:3]
        ]
        logger.info("chat request completed (matches=%s)", len(matches))
        return ChatResponse(answer=answer, sources=sources)
