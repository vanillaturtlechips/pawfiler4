"""
분석 결과 저장/조회 (JSON 파일 기반)
- /tmp/aiops_history.json 에 최근 50개 저장
- 클러스터 재시작 시 초기화됨 (휘발성 OK, 히스토리 목적)
"""
import json
import logging
import os
import time
from typing import Any

logger = logging.getLogger(__name__)

HISTORY_FILE = os.environ.get("AIOPS_HISTORY_FILE", "/tmp/aiops_history.json")
MAX_HISTORY = 50


def _load() -> list[dict]:
    try:
        with open(HISTORY_FILE) as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return []


def _save(history: list[dict]) -> None:
    with open(HISTORY_FILE, "w") as f:
        json.dump(history, f, ensure_ascii=False, default=str)


def save_result(result: dict[str, Any]) -> None:
    """분석 결과 저장. timestamp 자동 추가."""
    history = _load()
    entry = {"timestamp": time.time(), **result}
    history.insert(0, entry)
    history = history[:MAX_HISTORY]
    _save(history)
    logger.info(f"Analysis result saved (anomaly={result.get('anomaly', False)})")


def get_history(limit: int = 20) -> list[dict]:
    """최근 분석 결과 반환."""
    return _load()[:limit]


def get_latest() -> dict | None:
    """가장 최근 분석 결과 반환."""
    history = _load()
    return history[0] if history else None
