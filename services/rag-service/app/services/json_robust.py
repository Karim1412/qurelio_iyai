"""Robust JSON parsing for LLM output.

The previous pipeline (`_parse_json`) swallowed malformed/truncated JSON inside a
broad `except` and returned a degraded summary object, which meant the retry loop
in `run_full_pipeline` never fired — a truncated response was silently stored as a
"success". This module corrects that: parsing is strict by default, detects
truncation explicitly (the classic unfinished-array/object markers), and raises
`InvalidJSON` so the caller can retry with a real backoff. Only when the caller
explicitly asks for recovery mode do we attempt best-effort reconstruction.
"""
from __future__ import annotations

import json
import re
from typing import Any, Dict
from dataclasses import dataclass


class InvalidJSON(Exception):
    """Raised when LLM output is malformed, truncated, or schema-violating."""

    def __init__(self, message: str, kind: str = "malformed", raw: str = ""):
        super().__init__(message)
        self.kind = kind          # "truncated" | "malformed" | "schema"
        self.raw = raw


@dataclass
class ParseResult:
    data: Any
    recovered: bool
    notes: List[str]


_LIST_OPEN = ["[", "["]
_OBJECT_OPEN = ["{", "{"]


def _looks_truncated(text: str) -> bool:
    t = text.rstrip()
    if not t:
        return True
    # If the outermost scope never closed, it is truncated.
    if t[-1] not in ("}", "]", '"', "'", "t", "e", "0", "l", "d", "1", "2", "3", "4", "5", "6", "7", "8", "9"):
        return True
    # Unbalanced braces/brackets (ignoring inside strings roughly).
    depth_o = depth_b = 0
    in_str = False
    esc = False
    for ch in t:
        if in_str:
            if esc:
                esc = False
            elif ch == "\\":
                esc = True
            elif ch == '"':
                in_str = False
            continue
        if ch == '"':
            in_str = True
        elif ch in "{":
            depth_o += 1
        elif ch in "}":
            depth_o -= 1
        elif ch in "[":
            depth_b += 1
        elif ch in "]":
            depth_b -= 1
    return depth_o > 0 or depth_b > 0


def parse_json(text: str, *, recover: bool = False) -> ParseResult:
    """Parse strict first; raise InvalidJSON(kind='truncated') if clearly truncated,
    else InvalidJSON(kind='malformed'). If `recover` is True, attempt best-effort
    reconstruction after a strict failure (used only inside a controlled retry path).
    """
    if not text or not text.strip():
        raise InvalidJSON("Empty model output", kind="malformed", raw=text or "")

    text = _strip_code_fence(text)

    try:
        data = json.loads(text)
        return ParseResult(data=data, recovered=False, notes=[])
    except json.JSONDecodeError as exc:
        # When recovery is requested, attempt it for BOTH truncated and malformed
        # tail input before classifying; only classify once recovery fails.
        if recover:
            try:
                data, notes = _recover(text)
                return ParseResult(data=data, recovered=True, notes=notes)
            except InvalidJSON:
                pass
        if _looks_truncated(text):
            raise InvalidJSON(f"Truncated JSON: {exc}", kind="truncated", raw=text)
        raise InvalidJSON(f"Malformed JSON: {exc}", kind="malformed", raw=text)


_MISSING_TAIL = re.compile(r"[}\]]\s*$")


def _find_valid_prefix(text: str):
    """If the output is a COMPLETE valid JSON value followed by non-JSON trailing
    prose (e.g. `{...valid...} Some explanation` or `[...valid...] note`), return the
    valid JSON prefix. This is common with some models that append a human-readable
    closing remark after the structured JSON. Only matches when the object/list closes
    cleanly at some point BEFORE the end; a genuinely truncated (unclosed) JSON is not
    matched here.
    """
    depth_o = depth_b = 0
    in_str = False
    esc = False
    for i, ch in enumerate(text):
        if in_str:
            if esc:
                esc = False
            elif ch == "\\":
                esc = True
            elif ch == '"':
                in_str = False
            continue
        if ch == '"':
            in_str = True
        elif ch in "{":
            depth_o += 1
        elif ch in "}":
            depth_o -= 1
            if depth_o == 0 and depth_b == 0:
                candidate = text[: i + 1]
                try:
                    data = json.loads(candidate)
                except json.JSONDecodeError:
                    return None
                return data, candidate
        elif ch in "[":
            depth_b += 1
        elif ch in "]":
            depth_b -= 1
            if depth_o == 0 and depth_b == 0:
                candidate = text[: i + 1]
                try:
                    data = json.loads(candidate)
                except json.JSONDecodeError:
                    return None
                return data, candidate
    return None


def _recover(text: str):
    """Best-effort reconstruction of a truncated/malformed JSON object. Only invoked
    when the caller opts into recovery (recover=True)."""
    t = text.rstrip()

    # Case 1: complete valid JSON followed by trailing prose. Safe to salvage —
    # the structured object is fully closed before the garbage, so nothing is lost
    # from the model's requested shape. This avoids wasting a rate-limited
    # re-request on output we can already use.
    prefix = _find_valid_prefix(t)
    if prefix is not None:
        data, candidate = prefix
        return data, ["recovered", "stripped trailing non-JSON content"]

    # Case 2: genuinely truncated — try appending closing braces to balance an
    # unfinished object/list.
    notes: List[str] = ["recovered"]
    depth_o = t.count("{") - t.count("}")
    depth_b = t.count("[") - t.count("]")
    repaired = t
    # Ensure a trailing value does not end mid-expression that requires closure.
    repaired = re.sub(r",\s*$", "", repaired)
    if depth_o > 0:
        repaired = repaired + "}" * depth_o
    if depth_b > 0:
        repaired = repaired + "]" * depth_b
    if depth_o >= 1 or depth_b >= 0:
        try:
            data = json.loads(repaired)
            notes.append(f"balanced braces ({depth_o} open objects, {depth_b} open arrays)")
            return data, notes
        except json.JSONDecodeError:
            pass
    raise InvalidJSON("Unrecoverable malformed JSON", kind="malformed", raw=text)


def parse_json_with_retries(
    text: str,
    parse_attempts: int = 3,
    recover_final: bool = False,
) -> ParseResult:
    """Parse with up to `parse_attempts` strict attempts (in case the model output is
    re-fetched/cleaned between calls). On the final attempt, if `recover_final`, try
    reconstruction. Raises InvalidJSON otherwise so the caller can retry the WHOLE
    LLM call with backoff (the real fix for truncation)."""
    last: Optional[InvalidJSON] = None
    for i in range(parse_attempts):
        try:
            return parse_json(text, recover=False)
        except InvalidJSON as exc:
            last = exc
            # Truncated/malformed: don't loop pointlessly on identical bytes; only
            # the caller re-requesting the model can fix it. We surface immediately
            # unless recovery is explicitly requested.
            break
    if recover_final:
        return parse_json(text, recover=True)
    raise last  # type: ignore[misc]


def _strip_code_fence(text: str) -> str:
    """Remove markdown ```json ... ``` fences some models wrap output in."""
    m = re.search(r"```(?:json)?\s*(.*?)```", text, flags=re.DOTALL)
    if m and m.group(1).strip():
        return m.group(1).strip()
    return text.strip()


def validate_schema(data: Any, required: List[str], container: Any = None) -> None:
    """Validate that a parsed object has the required top-level keys. Raises
    InvalidJSON(kind='schema') otherwise so callers can retry."""
    if not isinstance(data, dict):
        raise InvalidJSON(f"Expected object schema, got {type(data).__name__}",
                          kind="schema", raw=str(data)[:500])
    missing = [k for k in required if k not in data]
    if missing:
        raise InvalidJSON(f"Missing required keys: {missing}", kind="schema",
                          raw=str(data)[:500])
