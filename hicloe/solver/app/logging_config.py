"""Structured logging for the solver service.

The solver has no user/session concept of its own — "who" here is the
Next.js request that called it. Every log line carries `request_id` (forwarded
by the web app as the `X-Request-Id` header, see solver-client.ts) and, where
relevant, `job_id`, so a solver log line can be matched back to the app
request/audit-log entry that triggered it. One line per record, key=value,
easy to grep and to ship to any log aggregator later without reformatting.
"""
from __future__ import annotations

import logging
import os
import sys

_EXTRA_FIELDS = ("request_id", "job_id", "route", "method", "status_code", "duration_ms", "outcome")


class StructuredFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        parts = [
            f"ts={self.formatTime(record, '%Y-%m-%dT%H:%M:%S%z')}",
            f"level={record.levelname}",
            f"event={record.getMessage()}",
        ]
        for key in _EXTRA_FIELDS:
            value = getattr(record, key, None)
            if value is not None:
                parts.append(f"{key}={value}")
        if record.exc_info:
            parts.append(f"exc={self.formatException(record.exc_info)!r}")
        return " ".join(parts)


def configure_logging() -> None:
    level_name = os.environ.get("LOG_LEVEL", "INFO").upper()
    level = getattr(logging, level_name, logging.INFO)

    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(StructuredFormatter())

    root = logging.getLogger()
    root.handlers = [handler]
    root.setLevel(level)

    # Keep uvicorn's own access/error logs on the same structured formatter
    # instead of two different log shapes side by side.
    for name in ("uvicorn", "uvicorn.error", "uvicorn.access"):
        uv_logger = logging.getLogger(name)
        uv_logger.handlers = [handler]
        uv_logger.propagate = False


logger = logging.getLogger("hicloe.solver")
