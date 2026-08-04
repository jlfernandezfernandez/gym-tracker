"""Agent-agnostic webhook outbox and delivery loop.

This module intentionally knows nothing about workout event names. Feature code can
call ``enqueue_event`` later when the product decides which domain events matter.
"""

from __future__ import annotations

import asyncio
import hashlib
import hmac
import json
from datetime import UTC, datetime, timedelta
from typing import Any

import httpx
from sqlalchemy import select

from app.core.config import get_settings
from app.core.database import _get_async_session
from app.models import WebhookEvent


def _now() -> datetime:
    return datetime.now(UTC).replace(tzinfo=None)


def _envelope(event: WebhookEvent) -> dict[str, Any]:
    return {
        "specversion": "1.0",
        "id": event.id,
        "type": event.event_type,
        "source": event.source,
        "subject": event.subject,
        "time": event.event_time.replace(tzinfo=UTC).isoformat().replace("+00:00", "Z"),
        "datacontenttype": "application/json",
        "data": event.payload,
    }


def _signature(body: bytes, secret: str) -> str:
    digest = hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
    return f"sha256={digest}"


async def enqueue_event(
    session,
    *,
    event_type: str,
    data: dict[str, Any],
    subject: str = "",
    source: str = "gym-tracker",
) -> WebhookEvent:
    """Store a generic event in the durable outbox.

    The caller owns the transaction and must commit it with its business change.
    No event is emitted unless a feature explicitly calls this function.
    """
    event = WebhookEvent(
        event_type=event_type,
        source=source,
        subject=subject,
        payload=data,
    )
    session.add(event)
    await session.flush()
    return event


async def _deliver_one(event: WebhookEvent, client: httpx.AsyncClient) -> None:
    settings = get_settings()
    body = json.dumps(_envelope(event), separators=(",", ":"), ensure_ascii=False).encode()
    response = await client.post(
        settings.webhooks_url,
        content=body,
        headers={
            "Content-Type": "application/cloudevents+json",
            "X-Webhook-Id": event.id,
            "X-Webhook-Signature": _signature(body, settings.webhooks_secret),
        },
    )
    response.raise_for_status()


async def deliver_pending_events() -> int:
    """Deliver a small batch and persist retry state. Returns delivered count."""
    settings = get_settings()
    if not (settings.webhooks_enabled and settings.webhooks_url and settings.webhooks_secret):
        return 0

    session_factory = _get_async_session()
    delivered = 0
    async with httpx.AsyncClient(timeout=10.0) as client:
        async with session_factory() as session:
            result = await session.execute(
                select(WebhookEvent)
                .where(
                    WebhookEvent.status == "pending",
                    WebhookEvent.next_attempt_at <= _now(),
                    WebhookEvent.attempts < settings.webhooks_max_attempts,
                )
                .order_by(WebhookEvent.created_at)
                .limit(10)
            )
            events = list(result.scalars())
            for event in events:
                event.attempts += 1
                try:
                    await _deliver_one(event, client)
                except Exception as exc:  # delivery must never break the API worker
                    event.status = (
                        "failed" if event.attempts >= settings.webhooks_max_attempts else "pending"
                    )
                    event.last_error = str(exc)[:1000]
                    event.next_attempt_at = _now() + timedelta(
                        seconds=min(300, 2 ** min(event.attempts, 8))
                    )
                else:
                    event.status = "delivered"
                    event.delivered_at = _now()
                    event.last_error = ""
                    delivered += 1
            await session.commit()
    return delivered


async def run_webhook_dispatcher(stop_event: asyncio.Event) -> None:
    """Run the optional outbox poller until application shutdown."""
    settings = get_settings()
    if not (settings.webhooks_enabled and settings.webhooks_url and settings.webhooks_secret):
        return
    while not stop_event.is_set():
        await deliver_pending_events()
        try:
            await asyncio.wait_for(stop_event.wait(), timeout=settings.webhooks_poll_seconds)
        except TimeoutError:
            pass
