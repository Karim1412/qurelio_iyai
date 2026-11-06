"""AUD: AI-generated short checklist lines for one audit criterion (clause + question context)."""
import json
import logging
import re
from typing import Any, Optional

from langchain_openai import ChatOpenAI
from langchain.prompts import ChatPromptTemplate

from app.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()


def _parse_llm_json(content: str) -> dict[str, Any]:
    text = (content or "").strip()
    if text.startswith("```"):
        text = re.sub(r"^```[a-zA-Z0-9]*\s*\n?", "", text)
        text = re.sub(r"\n?```\s*$", "", text).strip()
    return json.loads(text)


CLAUSE_EVIDENCE_ITEMS_PROMPT = ChatPromptTemplate.from_template(
    """You are an ISO management-system lead auditor preparing **short yes/no checklist questions**
for ONE audit criterion: clause **{iso_clause}** only.

Standard: {iso_standard}
Audit criterion (from the norm / extraction):
{question}

Already on the checklist (do not duplicate; vary the verification angle):
{existing_labels}

Task: propose **4 to 7** new yes/no questions the auditor ticks when verifying **this clause only**.
Rules:
- Each line must be a direct yes/no question (start with Is, Are, Does, Do, Has, Can, Was).
- Focus on whether the requirement is applied in the product/process, with evidence (documents, records, interviews).
- Tie every question to the criterion text; mention clause {iso_clause} or its topic where natural.
- Do **not** repeat or paraphrase lines already on the checklist (especially base verification lines).
- Under 120 characters; end with ?; no numbering; no duplicates.

Respond ONLY with valid JSON:
{{"items": ["line 1", "line 2", ...]}}
"""
)


def _fallback_items(*, question: str, iso_clause: str) -> list[str]:
    q = (question or "").strip()[:400]
    c = (iso_clause or "").strip() or "-"
    topic = q.split("—")[-1].strip()[:70] if "—" in q else q[:70]
    topic_bit = f" ({topic})" if topic else ""
    return [
        f"Is this requirement applied in your product or process for clause {c}{topic_bit}?",
        f"Is documented information available for clause {c}?",
        f"Are records or objective evidence available for clause {c}?",
        f"Was a gap or nonconformity identified for clause {c}?",
    ]


class AuditClauseEvidenceItemsAiService:
    def __init__(self):
        self._llm = None
        if (settings.OPENAI_API_KEY or "").strip():
            self._llm = ChatOpenAI(
                api_key=settings.OPENAI_API_KEY,
                base_url=settings.OPENAI_BASE_URL,
                model=settings.OPENAI_MODEL,
                temperature=0.2,
                max_tokens=min(settings.LLM_MAX_TOKENS, 800),
            )

    async def suggest_items(
        self,
        *,
        question: str,
        iso_clause: Optional[str] = None,
        iso_standard: Optional[str] = None,
        existing_labels: Optional[list[str]] = None,
    ) -> dict[str, Any]:
        q = (question or "").strip() or "Criterion"
        labels = existing_labels or []
        label_block = "\n".join(f"- {s[:200]}" for s in labels[:24]) if labels else "(none)"

        if not self._llm:
            return {"items": _fallback_items(question=q, iso_clause=iso_clause or ""), "model": "heuristic"}

        chain = CLAUSE_EVIDENCE_ITEMS_PROMPT | self._llm
        try:
            result = await chain.ainvoke(
                {
                    "iso_standard": (iso_standard or "-")[:120],
                    "iso_clause": (iso_clause or "-")[:80],
                    "question": q[:6000],
                    "existing_labels": label_block[:8000],
                }
            )
            data = _parse_llm_json(result.content)
            raw_items = data.get("items") or []
            out: list[str] = []
            seen: set[str] = set()
            for it in raw_items:
                s = str(it).strip()
                if not s or len(s) > 200:
                    continue
                k = s.lower()
                if k in seen:
                    continue
                seen.add(k)
                out.append(s)
                if len(out) >= 8:
                    break
            if len(out) < 3:
                out = _fallback_items(question=q, iso_clause=iso_clause or "")
            return {"items": out, "model": settings.OPENAI_MODEL}
        except Exception as e:
            logger.warning("clause evidence items LLM failed: %s", e)
            return {"items": _fallback_items(question=q, iso_clause=iso_clause or ""), "model": "heuristic"}