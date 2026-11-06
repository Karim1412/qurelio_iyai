import logging

import httpx

from app.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()
FETCH_TIMEOUT_SECONDS = 8


async def fetch_workspace_summary(company_id: str) -> str:
    """Load NC/audit/CAPA snapshot from evaluation-service for chat grounding."""
    base = (settings.EVALUATION_SERVICE_URL or "").strip().rstrip("/")
    token = (settings.DOCUMENT_INTERNAL_TOKEN or "").strip()
    if not base or not token or not company_id:
        return ""

    url = f"{base}/api/internal/workspace-chat-context/{company_id}"
    try:
        async with httpx.AsyncClient(timeout=FETCH_TIMEOUT_SECONDS) as client:
            res = await client.get(url, headers={"X-Internal-Token": token})
            res.raise_for_status()
            data = res.json()
            summary = (data.get("summary") or "").strip()
            if summary:
                logger.info("workspace chat context loaded (%s chars)", len(summary))
            return summary
    except Exception as e:
        logger.warning("workspace chat context unavailable: %s", e)
        return ""
