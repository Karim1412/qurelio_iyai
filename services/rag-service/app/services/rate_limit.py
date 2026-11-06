"""Global concurrency limiting, rate-limit classification and retry with backoff.

Solves the real reliability gap: the previous pipeline capped concurrency at the
DOCUMENT level (`MAX_CONCURRENT_EXTRACTIONS`) but let each document fire
PRODUCT_CHUNK_CONCURRENCY / ISO_CHUNK_CONCURRENCY concurrent chunk calls — so
N documents × M chunks could easily burst a rate-limited / free-tier key. Here we
enforce a single process-wide cap on in-flight extraction/evaluation LLM requests
(the cheapest, most robust primitive), and classify errors precisely:
  - 429                 → rate-limited: backoff, respect Retry-After, retry.
  - 402 / low-credits   → NOT retried on same provider (can't self-heal) → fallback.
  - other (5xx/network) → jittered exponential backoff, bounded retries.
"""
from __future__ import annotations

import asyncio
import random
import time
from dataclasses import dataclass
from typing import Awaitable, Callable, Optional, TypeVar, Generic

from app.config import get_settings

T = TypeVar("T")


class ExtractionLimitError(Exception):
    """Raised when the process-wide in-flight limit denies a request (queue full)."""
    def __init__(self, active: int, limit: int):
        super().__init__(f"extraction concurrency limit reached ({active}/{limit})")
        self.active = active
        self.limit = limit


class CreditExhaustedError(Exception):
    """402 / insufficient-quota error from the model provider — cannot self-heal."""
    def __init__(self, provider: str = "unknown", detail: str = ""):
        super().__init__(f"provider {provider} exhausted credits: {detail}")
        self.provider = provider
        self.detail = detail


class RetryableError(Exception):
    """A transient error (429/5xx/network/timeout) worth retrying with backoff."""
    def __init__(self, status: Optional[int] = None, retry_after: Optional[float] = None,
                 detail: str = "", kind: str = "transient"):
        super().__init__(detail or f"retryable error status={status}")
        self.status = status
        self.retry_after = retry_after
        self.kind = kind


_global_sem = None
_compliance_sem = None


def _get_semaphore() -> asyncio.Semaphore:
    global _global_sem
    if _global_sem is None:
        limit = max(1, int(get_settings().EXTRACTION_WORKERS))
        _global_sem = asyncio.Semaphore(limit)
    return _global_sem


def _get_compliance_semaphore() -> asyncio.Semaphore:
    """Separate pool for compliance judge calls (see COMPLIANCE_WORKERS).

    Kept independent from the document-extraction semaphore above so that
    raising compliance concurrency doesn't change ingestion/extraction
    behavior, and vice versa.
    """
    global _compliance_sem
    if _compliance_sem is None:
        limit = max(1, int(get_settings().COMPLIANCE_WORKERS))
        _compliance_sem = asyncio.Semaphore(limit)
    return _compliance_sem


def reset_global_semaphore() -> None:
    global _global_sem, _compliance_sem
    _global_sem = None
    _compliance_sem = None


async def run_limited(coro: Awaitable[T], timeout: Optional[float] = None) -> T:
    """Run `coro` under the process-wide extraction limit with an optional timeout."""
    sem = _get_semaphore()
    async with sem:
        if timeout is not None:
            return await asyncio.wait_for(coro, timeout=timeout)
        return await coro


async def run_compliance_limited(coro: Awaitable[T], timeout: Optional[float] = None) -> T:
    """Run `coro` under the compliance-specific concurrency limit (COMPLIANCE_WORKERS)."""
    sem = _get_compliance_semaphore()
    async with sem:
        if timeout is not None:
            return await asyncio.wait_for(coro, timeout=timeout)
        return await coro


def classify_http_error(exc: Exception) -> None:
    """Raise a specifically-typed error for an HTTP/API exception based on its status.

    Rethrows transparently for non-retryable codes; for 429 raises RetryableError
    with the parsed Retry-After; for 402 raises CreditExhaustedError; for 5xx /
    connection / timeout raises RetryableError."""
    status = getattr(exc, "status_code", None) or getattr(exc, "status", None)
    if status is None and hasattr(exc, "response"):
        try:
            status = exc.response.status_code  # type: ignore[attr-defined]
        except Exception:
            status = None
    if status is not None:
        status = int(status)
        if status == 429:
            ra = _parse_retry_after(exc)
            raise RetryableError(status=429, retry_after=ra, detail=str(exc), kind="rate_limit")
        if status == 402:
            raise CreditExhaustedError(detail=str(exc))
        if 500 <= status <= 599:
            raise RetryableError(status=status, detail=str(exc), kind="server")
        # 4xx other than 402/429 are non-retryable (bad request, auth, etc.)
        raise exc
    # Network / timeout / generic transient.
    if _is_network_error(exc):
        raise RetryableError(detail=str(exc), kind=type(exc).__name__)
    raise exc


def _parse_retry_after(exc) -> Optional[float]:
    headers = getattr(exc, "headers", None) or {}
    if isinstance(headers, dict):
        ra = headers.get("retry-after") or exc.response.headers.get("retry-after") if hasattr(exc, "response") else headers.get("retry-after")
        if ra:
            try:
                return float(ra)
            except (TypeError, ValueError):
                pass
    return None


def _is_network_error(exc) -> bool:
    name = type(exc).__name__
    return any(k in name.lower() for k in ("timeout", "connection", "apierror", "apiconnection", "ssl", "network"))


def _retry_after_seconds(retry_after: Optional[float], backoff_base: float, attempt: int) -> float:
    cap = float(get_settings().MAX_RETRY_BACKOFF_SEC)
    jitter = float(get_settings().RETRY_JITTER_SEC)
    if retry_after is not None:
        return min(float(retry_after), cap) + random.uniform(0, jitter)
    return min(backoff_base * (2 ** attempt), cap) + random.uniform(0, jitter)


async def retry_with_backoff(
    fn: Callable[[], Awaitable[T]],
    *,
    max_attempts: Optional[int] = None,
    retry_on: tuple = (RetryableError,),
    fallback_provider: Optional[Callable[[], Awaitable[T]]] = None,
) -> T:
    """Call `fn` with bounded exponential backoff.

    - 429 → RetryError → backoff (respect Retry-After), retry up to max_attempts.
    - 402 → CreditExhaustedError → immediately call `fallback_provider` if supplied.
    - other RetryableError → backoff and retry.
    After exhausting attempts and if a fallback provider is given, defer to it.
    """
    settings = get_settings()
    max_attempts = max_attempts if max_attempts is not None else int(settings.EXTRACTION_MAX_ATTEMPTS)
    last_err: Optional[Exception] = None
    for attempt in range(max_attempts):
        try:
            return await fn()
        except CreditExhaustedError:
            if fallback_provider is not None:
                return await fallback_provider()
            raise
        except RetryableError as exc:
            last_err = exc
            # Rate limits retry with a large base; a Retry-After overrides it.
            base = settings.RATE_LIMIT_BACKOFF_SEC if exc.kind == "rate_limit" else settings.RETRY_BACKOFF_SEC
            wait = _retry_after_seconds(exc.retry_after, base, attempt)
            if attempt < max_attempts - 1:
                await asyncio.sleep(wait)
                continue
            if fallback_provider is not None:
                return await fallback_provider()
            raise
        except Exception as raw_exc:
            # Provider SDKs raise native HTTP/API exceptions rather than our
            # RetryableError/CreditExhaustedError. Normalize them here; otherwise
            # a 429 was treated as non-retryable and compliance clauses immediately
            # became INCONCLUSIVE.
            try:
                classify_http_error(raw_exc)
            except CreditExhaustedError:
                if fallback_provider is not None:
                    return await fallback_provider()
                raise
            except RetryableError as exc:
                last_err = exc
                base = settings.RATE_LIMIT_BACKOFF_SEC if exc.kind == "rate_limit" else settings.RETRY_BACKOFF_SEC
                wait = _retry_after_seconds(exc.retry_after, base, attempt)
                if attempt < max_attempts - 1:
                    await asyncio.sleep(wait)
                    continue
                if fallback_provider is not None:
                    return await fallback_provider()
                raise
            except Exception:
                raise
    # Should be unreachable, but be safe.
    raise last_err  # type: ignore[misc]
