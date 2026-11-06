"""AUD: suggest evaluation + 0–100 % for one autodiagnostic checklist criterion."""
import json
import logging
import re
from typing import Any, Optional

from langchain_openai import ChatOpenAI
from langchain.prompts import ChatPromptTemplate

from app.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

ALLOWED_ANSWERS = frozenset({"CONFORMANT", "NON_CONFORMANT", "OBSERVATION", "STRENGTH"})


def _parse_llm_json(content: str) -> dict[str, Any]:
    text = (content or "").strip()
    if text.startswith("```"):
        text = re.sub(r"^```[a-zA-Z0-9]*\s*\n?", "", text)
        text = re.sub(r"\n?```\s*$", "", text).strip()
    return json.loads(text)


def _normalize_answer(raw: Optional[str]) -> Optional[str]:
    if not raw:
        return None
    s = str(raw).strip().upper().replace(" ", "_").replace("-", "_")
    if s in ("NON_CONFORMANT", "NONCONFORMANT"):
        return "NON_CONFORMANT"
    if s == "STRONG_POINT":
        return "STRENGTH"
    if s in ALLOWED_ANSWERS:
        return s
    if "NON" in s and "CONFORM" in s:
        return "NON_CONFORMANT"
    return None


CHECKLIST_AUDIT_ROW_PROMPT = ChatPromptTemplate.from_template(
    """You are an ISO management-system auditor doing a **desk / documentation review** of ONE checklist criterion.

Clause / ref: {iso_clause}
Audit standard (context): {iso_standard}
Criterion text: {question}
Current auditor evaluation (empty = not yet chosen): {answer}
Evidence notes (may be empty): {notes}
Auditor evidence checklist (tick marks show what was verified on site / desk): {evidence_checklist}

Task:
1) If **Current auditor evaluation** is already one of CONFORMANT, NON_CONFORMANT, OBSERVATION, STRENGTH, keep that **exact** same value for "answer" and only propose a coherent 0–100 score.
2) If it is empty or "-", infer both "answer" and "score" from the criterion text, notes, AND the evidence checklist. Treat "[x] Gap, deviation, or nonconformity observed" as strong signal for NON_CONFORMANT unless notes clearly resolve it. Several "[x]" positive verification lines without a gap support CONFORMANT or STRENGTH if notes are exemplary.
3) This is a **draft simulation**: prefer CONFORMANT when nothing contradicts; use OBSERVATION for minor gaps; NON_CONFORMANT only if checklist or notes clearly indicate missing process or major gap; STRENGTH only if notes clearly show exemplary practice.

Score bands (align with answer):
- NON_CONFORMANT → ~0–35
- OBSERVATION → ~45–72
- CONFORMANT → ~78–93
- STRENGTH → ~92–100

Respond ONLY with valid JSON:
{{"answer": "CONFORMANT"|"NON_CONFORMANT"|"OBSERVATION"|"STRENGTH", "score": <integer 0-100>, "rationale": "<one short sentence>"}}
"""
)


def _fallback_audit_row(
    *,
    question: str,
    answer: Optional[str],
    notes: Optional[str],
    evidence_checklist_text: Optional[str] = None,
) -> dict[str, Any]:
    _ = (question or "")[:200]
    existing = _normalize_answer(answer)
    has_notes = bool((notes or "").strip())
    notes_l = (notes or "").lower()
    ev = (evidence_checklist_text or "").lower()
    base_note = " Evidence in notes was considered." if has_notes else ""

    if "[x]" in ev and "gap" in ev:
        return {
            "answer": "NON_CONFORMANT",
            "score": 28,
            "rationale": f"Evidence checklist marks a gap or deviation. Draft non-conformant.{base_note}",
            "model": "heuristic",
        }

    if existing:
        a = existing
        if a == "CONFORMANT":
            score = 88
            rationale = f"Conformant: score in the high conformant band.{base_note}"
        elif a == "NON_CONFORMANT":
            score = 22
            rationale = f"Non-conformant: low band until correction.{base_note}"
        elif a == "OBSERVATION":
            score = 62
            rationale = f"Observation: mid band.{base_note}"
        else:
            score = 94
            rationale = f"Strong point: high band.{base_note}"
        return {"answer": a, "score": score, "rationale": rationale, "model": "heuristic"}

    if any(w in notes_l for w in ("non-conform", "nonconform", "major nc", "not implemented", "missing")):
        return {
            "answer": "NON_CONFORMANT",
            "score": 24,
            "rationale": f"Notes suggest a significant gap. Marked non-conformant (draft).{base_note}",
            "model": "heuristic",
        }
    if any(w in notes_l for w in ("observation", "could improve", "minor", "opportunity", "suggest")):
        return {
            "answer": "OBSERVATION",
            "score": 58,
            "rationale": f"Notes read as an observation-level gap.{base_note}",
            "model": "heuristic",
        }
    if any(w in notes_l for w in ("excellent", "best practice", "exemplary", "strong practice")):
        return {
            "answer": "STRENGTH",
            "score": 95,
            "rationale": f"Notes support a strong-point rating (draft).{base_note}",
            "model": "heuristic",
        }

    pos_ticks = ev.count("[x]")
    if pos_ticks >= 3 and "gap" not in ev:
        return {
            "answer": "CONFORMANT",
            "score": 86 if has_notes else 84,
            "rationale": "Multiple checklist items verified without a gap flag. Draft conformant.",
            "model": "heuristic",
        }
    if pos_ticks >= 1:
        return {
            "answer": "OBSERVATION",
            "score": 62,
            "rationale": "Partial checklist verification: observation until more evidence is recorded.",
            "model": "heuristic",
        }

    return {
        "answer": "CONFORMANT",
        "score": 82 if not has_notes else 79,
        "rationale": "No evaluation or decisive notes: provisional conformant desk review; validate on site and adjust.",
        "model": "heuristic",
    }


class AuditChecklistScoreAiService:
    def __init__(self):
        self._llm = None
        if (settings.OPENAI_API_KEY or "").strip():
            self._llm = ChatOpenAI(
                api_key=settings.OPENAI_API_KEY,
                base_url=settings.OPENAI_BASE_URL,
                model=settings.OPENAI_MODEL,
                temperature=0.15,
                max_tokens=min(settings.LLM_MAX_TOKENS, 500),
            )

    async def suggest_score(
        self,
        *,
        question: str,
        answer: Optional[str] = None,
        notes: Optional[str] = None,
        iso_clause: Optional[str] = None,
        iso_standard: Optional[str] = None,
        evidence_checklist_text: Optional[str] = None,
    ) -> dict[str, Any]:
        q = (question or "").strip() or "Criterion"
        ev_text = (evidence_checklist_text or "").strip() or "(none provided)"
        if not self._llm:
            return _fallback_audit_row(
                question=q,
                answer=answer,
                notes=notes,
                evidence_checklist_text=ev_text,
            )

        chain = CHECKLIST_AUDIT_ROW_PROMPT | self._llm
        try:
            result = await chain.ainvoke(
                {
                    "iso_clause": (iso_clause or "-")[:80],
                    "iso_standard": (iso_standard or "-")[:120],
                    "question": q[:6000],
                    "answer": (answer or "-")[:80],
                    "notes": (notes or "(none)")[:4000],
                    "evidence_checklist": ev_text[:4000],
                }
            )
            data = _parse_llm_json(result.content)
            raw_score = data.get("score")
            try:
                score = int(round(float(raw_score)))
            except (TypeError, ValueError):
                raise ValueError("missing score") from None
            score = max(0, min(100, score))
            ans = _normalize_answer(data.get("answer"))
            if not ans:
                fb = _fallback_audit_row(
                    question=q,
                    answer=answer,
                    notes=notes,
                    evidence_checklist_text=ev_text,
                )
                return {**fb, "model": settings.OPENAI_MODEL}
            rationale = str(data.get("rationale") or "").strip()[:500] or None
            return {"answer": ans, "score": score, "rationale": rationale, "model": settings.OPENAI_MODEL}
        except Exception as e:
            logger.warning("checklist audit row LLM failed: %s", e)
            return _fallback_audit_row(
                question=q,
                answer=answer,
                notes=notes,
                evidence_checklist_text=ev_text,
            )
