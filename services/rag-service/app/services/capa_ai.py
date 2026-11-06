"""CAPA-008 / CAPA-009: LLM-backed NC root-cause and Ishikawa branch text (tenant context passed in by evaluation-service)."""
import json
import logging
import re
from typing import Any, List

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


ROOT_CAUSE_PROMPT = ChatPromptTemplate.from_template(
    """You are a senior quality engineer (ISO 9001). Given the CURRENT non-conformance and anonymized TENANT HISTORY of past NCs from the same organization, propose probable ROOT CAUSES (not just symptoms).

CURRENT NC:
Title: {title}
Description: {description}
ISO clause (if any): {iso_clause}
Classification: {classification}

TENANT NC HISTORY (same company; may be empty):
{history_block}

Respond ONLY with valid JSON:
{{
  "probable_causes": [
    {{
      "id": "pc1",
      "title": "short label max 12 words",
      "rationale": "2-4 sentences linking current NC + patterns from history when relevant",
      "confidence": 0.0-1.0
    }}
  ]
}}

Rules:
- Return 3 to 5 items in probable_causes, ordered by confidence descending.
- If history is empty, still infer plausible systemic causes from the current NC text alone.
- Do not invent specific personal names; refer to roles or processes.
- confidence reflects how well evidence supports that cause for THIS NC."""
)


ISHIKAWA_PROMPT = ChatPromptTemplate.from_template(
    """You fill a classic 6M Ishikawa fishbone for a non-conformance.

NC title: {title}
NC description: {description}
ISO clause: {iso_clause}

Optional tenant NC history (patterns):
{history_block}

Respond ONLY with valid JSON with string values (1-3 sentences each, concrete and actionable):
{{
  "man": "...",
  "machine": "...",
  "material": "...",
  "method": "...",
  "measurement": "...",
  "environment": "..."
}}"""
)


def _fallback_root_causes(title: str, description: str, history_lines: List[str]) -> dict[str, Any]:
    snippet = (title + " " + description)[:400].strip() or "the issue"
    hist = " ".join(history_lines)[:500]
    return {
        "probable_causes": [
            {
                "id": "pc1",
                "title": "Process / procedure gap",
                "rationale": f"Without LLM access, a generic pattern is unclear documentation or criteria for: {snippet[:120]}…",
                "confidence": 0.45,
            },
            {
                "id": "pc2",
                "title": "Competence or training gap",
                "rationale": "Recurring quality issues often involve insufficient training or unclear accountability for the task.",
                "confidence": 0.4,
            },
            {
                "id": "pc3",
                "title": "Monitoring and measurement weakness",
                "rationale": "If similar issues appeared before, verification steps may not catch drift early enough."
                + (f" History hints: {hist[:180]}…" if hist else ""),
                "confidence": 0.35,
            },
        ],
        "model": "fallback",
    }


def _fallback_ishikawa(title: str, description: str) -> dict[str, Any]:
    t = (title + ": " + description)[:300] or "Non-conformance"
    return {
        "man": f"People aspects (training, workload, communication) related to: {t[:140]}…",
        "machine": "Tools, software, equipment availability or suitability for the process.",
        "material": "Specifications, documents, or physical inputs used in the process.",
        "method": "Documented sequence, criteria, or work instructions vs actual practice.",
        "measurement": "How conformity was checked; sampling, gauges, or data quality.",
        "environment": "Workplace conditions, suppliers, or organizational constraints.",
        "model": "fallback",
    }


class CapaAiService:
    def __init__(self):
        self._llm = None
        if (settings.OPENAI_API_KEY or "").strip():
            self._llm = ChatOpenAI(
                api_key=settings.OPENAI_API_KEY,
                base_url=settings.OPENAI_BASE_URL,
                model=settings.OPENAI_MODEL,
                temperature=0.2,
                max_tokens=min(settings.LLM_MAX_TOKENS, 1000),
            )

    async def root_cause_suggestions(
        self,
        *,
        title: str,
        description: str,
        iso_clause: str,
        classification: str,
        history_lines: List[str],
    ) -> dict[str, Any]:
        history_block = "\n".join(f"- {h}" for h in history_lines[:25]) or "(no prior NC summaries in context)"
        if not self._llm:
            return _fallback_root_causes(title, description, history_lines)

        chain = ROOT_CAUSE_PROMPT | self._llm
        try:
            result = await chain.ainvoke(
                {
                    "title": title[:500],
                    "description": description[:4000],
                    "iso_clause": iso_clause or "-",
                    "classification": classification or "-",
                    "history_block": history_block[:8000],
                }
            )
            data = _parse_llm_json(result.content)
            causes = data.get("probable_causes") or []
            if not isinstance(causes, list) or len(causes) < 1:
                raise ValueError("empty probable_causes")
            out = []
            for i, c in enumerate(causes[:8]):
                if not isinstance(c, dict):
                    continue
                out.append(
                    {
                        "id": str(c.get("id") or f"pc{i+1}"),
                        "title": str(c.get("title") or "")[:200],
                        "rationale": str(c.get("rationale") or "")[:1200],
                        "confidence": float(c.get("confidence") or 0.5),
                    }
                )
            if not out:
                raise ValueError("no valid causes")
            return {"probable_causes": out, "model": settings.OPENAI_MODEL}
        except Exception as e:
            logger.warning("root_cause_suggestions LLM failed: %s", e)
            return _fallback_root_causes(title, description, history_lines)

    async def ishikawa_branches(
        self,
        *,
        title: str,
        description: str,
        iso_clause: str,
        history_lines: List[str],
    ) -> dict[str, Any]:
        history_block = "\n".join(f"- {h}" for h in history_lines[:20]) or "(none)"
        if not self._llm:
            return _fallback_ishikawa(title, description)

        chain = ISHIKAWA_PROMPT | self._llm
        try:
            result = await chain.ainvoke(
                {
                    "title": title[:500],
                    "description": description[:4000],
                    "iso_clause": iso_clause or "-",
                    "history_block": history_block[:6000],
                }
            )
            data = _parse_llm_json(result.content)
            keys = ("man", "machine", "material", "method", "measurement", "environment")
            out = {k: str(data.get(k) or "")[:800] for k in keys}
            if not any(out.values()):
                raise ValueError("empty branches")
            out["model"] = settings.OPENAI_MODEL
            return out
        except Exception as e:
            logger.warning("ishikawa_branches LLM failed: %s", e)
            fb = _fallback_ishikawa(title, description)
            return fb
