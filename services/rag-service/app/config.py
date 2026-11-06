from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    PORT:                int  = 8000
    OPENAI_API_KEY:      str  = ""
    OPENAI_BASE_URL:     str  = "https://openai.agregatech.com/v1"
    OPENAI_MODEL:        str  = "gpt-4o-mini"
    # Completion cap: OpenRouter free/low credits reject very high max_tokens (e.g. 16384).
    LLM_MAX_TOKENS:      int  = 1000
    # Compliance judge calls (evaluation_engine) are a separate, larger budget:
    # 1000 was tuned for the OpenRouter free tier's own cap, but is too small for
    # reasoning models (e.g. Qwen3 on Groq) whose <think> trace competes with the
    # actual JSON answer for the same token budget, causing truncated/invalid
    # JSON ("max completion tokens reached before generating a valid document").
    # Override via COMPLIANCE_MAX_TOKENS in .env; raise further if truncation
    # errors persist in the rag-service logs.
    COMPLIANCE_MAX_TOKENS: int = 3000
    # Optional: some OpenAI-compatible reasoning models (Gemini 2.5+ via its
    # OpenAI-compat endpoint, o-series, some Groq models) accept a
    # `reasoning_effort` param. Set to "none"/"minimal" to stop the model
    # spending its token budget on hidden thinking traces before the JSON
    # answer -- cleaner than stripping <think> tags after the fact. Leave
    # blank (default) for providers that reject unknown params.
    COMPLIANCE_REASONING_EFFORT: str = ""
    # Per-request timeout for compliance/evaluation LLM calls.
    LLM_REQUEST_TIMEOUT_SEC: float = 180.0
    # JSON extraction completions: separate cap (often needs more than chat).
    STRUCTURE_MAX_TOKENS: int = 4096
    # Product-wizard pre-fill runs as its own compact pass, so it fits under providers
    # that hard-cap max_tokens (agregatech rejects anything above 1000).
    ONBOARDING_MAX_TOKENS: int = 1000
    # JSON structuring (document extraction); can match OPENAI_MODEL for OpenRouter
    STRUCTURE_MODEL:     str  = "gpt-4o-mini"
    # Max characters of extracted text sent in the structuring prompt (tokens ≈ chars/4).
    # OpenRouter free/low tiers often cap total prompt ~12k tokens; keep this conservative.
    STRUCTURE_MAX_INPUT_CHARS: int = 14_000
    # Minimum text characters for a PDF page to be considered usable text.
    # Pages below this threshold are treated as likely scanned/image-only pages.
    TEXT_FALLBACK_MIN_CHARS: int = 80
    # Embeddings (OpenRouter-compatible by default)
    EMBEDDING_API_KEY:   str  = ""
    EMBEDDING_BASE_URL:  str  = "https://openrouter.ai/api/v1"
    EMBEDDING_MODEL:     str  = "openai/text-embedding-3-small"
    # Chat LLM fallback when primary provider returns 429 / quota errors
    # These are DEFAULTS only -- override in .env. In particular, do not point
    # CHAT_LLM_FALLBACK_MODEL at a ":free" OpenRouter model for production
    # compliance runs: free-tier models share a single oversubscribed rate-limit
    # pool across all OpenRouter users, so the fallback can itself 429 under
    # load, leaving a clause with no working provider at all.
    CHAT_LLM_FALLBACK_API_KEY:  str = ""
    CHAT_LLM_FALLBACK_BASE_URL: str = "https://openrouter.ai/api/v1"
    CHAT_LLM_FALLBACK_MODEL:    str = "openai/gpt-4o-mini"
    # Tenant operational data (NCs, audits, CAPA) for RAG chat
    EVALUATION_SERVICE_URL: str = "http://evaluation-service:3005"
    # Callback to document-service after extraction (writes DB + status READY)
    DOCUMENT_SERVICE_URL: str = "http://document-service:3003"
    DOCUMENT_INTERNAL_TOKEN: str = ""
    PINECONE_API_KEY:    str  = ""
    PINECONE_INDEX_NAME: str  = "qurelio-vectors"
    MINIO_ENDPOINT:      str  = "minio"
    MINIO_PORT:          int  = 9000
    MINIO_ACCESS_KEY:    str  = "minioadmin"
    MINIO_SECRET_KEY:    str  = "minioadmin123"
    MINIO_BUCKET:        str  = "qurelio-docs"
    MINIO_USE_SSL:       bool = False
    JWT_SECRET:          str  = ""
    CHUNK_SIZE:          int  = 1000
    CHUNK_OVERLAP:       int  = 200
    # --- Product image extraction accuracy ---
    MAX_INLINE_IMAGE_BYTES: int = 350_000
    IMAGE_MAX_SIDE_PX: int = 1800
    MAX_INLINE_IMAGE_DATA_URL_CHARS: int = 500_000
    # --- Batch upload reliability ---
    # Caps how many documents run AI extraction concurrently, process-wide.
    # Uploading many documents at once previously started that many concurrent
    # AI calls with no limit, exhausting rate-limited/free-tier API keys.
    MAX_CONCURRENT_EXTRACTIONS: int = 3
    EXTRACTION_WORKERS: int = 1
    # Compliance judge calls get their OWN concurrency pool, separate from
    # EXTRACTION_WORKERS above. Sharing one global slot between document
    # extraction and compliance judging meant every compliance LLM call was
    # fully serialized process-wide (real parallelism of 1 even with
    # CLAUSE_CONCURRENCY=4 "concurrent" clauses), and splitting large judge
    # calls into smaller batches (see JUDGE_BATCH_SIZE) roughly doubled the
    # number of serialized round-trips per clause — the two combined caused a
    # cascading wave of clause-level TimeoutErrors on standards with 100+
    # clauses (early clauses finish fine, everything queued behind them times
    # out). Tune this to your provider's real rate limit, not down to 1.
    COMPLIANCE_WORKERS: int = 3
    COMPLIANCE_LLM_TIMEOUT_SEC: float = 75.0
    COMPLIANCE_LLM_ATTEMPTS: int = 2
    COMPLIANCE_SEARCH_TIMEOUT_SEC: float = 8.0
    COMPLIANCE_SEARCH_CONCURRENCY: int = 6
    COMPLIANCE_MAX_EVIDENCE_CHUNKS: int = 8
    # Wall-clock budget for a single clause's full judging (LLM calls, all
    # batches/retries included) before it's marked INCONCLUSIVE. Raised from
    # the original 300s to give COMPLIANCE_WORKERS queuing headroom; if you
    # still see "clause timed out" for clauses near the end of a long
    # standard, raise this further before lowering COMPLIANCE_WORKERS back down.
    CLAUSE_TIMEOUT_SEC: float = 480.0
    # --- Chunked structuring concurrency (large documents get split into
    # several chunks, each its own completion call, merged afterwards) ---
    # Standards documents in particular need MANY chunks and each chunk's
    # completion can legitimately need close to STRUCTURE_MAX_TOKENS output
    # tokens (the requirements-extraction schema is verbose by design, for
    # accuracy). On a rate-limited/free-tier key with a small output-tokens-
    # per-minute (OTPM) budget, firing several of those concurrently exhausts
    # the account's per-minute budget outright — no amount of retrying then
    # helps, since every retry competes for the same shared, tiny budget.
    # Lower these (e.g. to 1) in .env if you see repeated 429 "rate_limit_exceeded"
    # errors mentioning a low OTPM limit; raise them on a higher-tier key for
    # faster processing of large standards.
    ISO_CHUNK_CONCURRENCY: int = 1
    PRODUCT_CHUNK_CONCURRENCY: int = 3
    # How much document text (chars) goes into each standards chunk call, and
    # how much adjacent chunks overlap (so a clause split across a boundary
    # is still fully visible in at least one chunk). Lowering ISO_STRUCTURE_CHUNK_CHARS
    # reduces the input-token size of EACH call — the lever that matters for a
    # small tokens-per-minute (ITPM) cap — at the cost of needing more total
    # chunks (and therefore more total calls) for the same document. Keep
    # overlap at roughly 10% of the chunk size.
    ISO_STRUCTURE_CHUNK_CHARS: int = 7500
    ISO_STRUCTURE_CHUNK_OVERLAP: int = 0
    STANDARD_REQUIREMENT_BATCH_CHARS: int = 2200
    STANDARD_REQUIREMENT_BATCH_SECTIONS: int = 2
    STANDARD_REQUIREMENT_MAX_OUTPUT_TOKENS: int = 900
    STANDARD_LLM_ENABLED: bool = True
    # Whole-document budget; on expiry already reviewed material is retained
    # and remaining sections are explicitly marked incomplete.
    STANDARD_EXTRACTION_TIMEOUT_SEC: float = 1800.0
    STANDARD_OCR_LANGUAGES: str = "eng+fra+ara"
    STANDARD_OCR_MAX_PAGES: int = 30
    STANDARD_OCR_TOTAL_TIMEOUT_SEC: float = 300.0
    # Generic retry controls used by the RAG service rate-limit wrapper.
    RATE_LIMIT_BACKOFF_SEC: float = 8.0
    RETRY_BACKOFF_SEC: float = 2.0
    MAX_RETRY_BACKOFF_SEC: float = 60.0
    RETRY_JITTER_SEC: float = 0.5
    EXTRACTION_MAX_ATTEMPTS: int = 5
    # --- Proactive rate-limit pacing ---
    # Instead of firing every chunk call immediately and reacting to 429s
    # with backoff/retry after the fact, when these are set (> 0) the app
    # tracks a rolling estimate of tokens already committed and holds back
    # (sleeps) any call that would push the account over budget — so it
    # simply never sends the call that would get rejected, rather than
    # sending it, waiting for the 429, and retrying. This is what actually
    # matters for large (100+ page) documents on a small-quota key: it turns
    # "burst, fail, backoff, repeat" into steady, reliable throughput at
    # exactly the account's real ceiling. 0 = disabled (default) — no
    # behaviour change for accounts with an ample quota. Set these to
    # slightly under your provider's actual limits (both per-minute AND
    # per-day dimensions are tracked, since providers enforce both) to leave
    # headroom for other traffic on the same key.
    STRUCTURE_TOKENS_PER_MINUTE_BUDGET: int = 0
    STRUCTURE_TOKENS_PER_DAY_BUDGET: int = 0

    class Config:
        env_file = "../../.env"
        extra    = "ignore"


@lru_cache()
def get_settings() -> Settings:
    s = Settings()
    # Docker may set OPENAI_BASE_URL="" which overrides the class default; treat as unset.
    # Keep PURA endpoint as fallback when env var is empty.
    if not (s.OPENAI_BASE_URL or "").strip():
        return s.model_copy(update={"OPENAI_BASE_URL": "https://openai.agregatech.com/v1"})
    return s
