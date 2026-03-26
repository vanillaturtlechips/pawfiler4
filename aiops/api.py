"""
AIOps FastAPI 서버
- GET  /status       : 최근 분석 결과 + 파드 상태 + 메트릭 요약
- GET  /history      : 분석 히스토리
- GET  /alerts       : 이상 감지 목록
- GET  /metrics      : 서비스별 메트릭 (AMP)
- GET  /logs         : 서비스별 최근 로그 (Loki)
- GET  /traces       : 최근 트레이스 (Tempo, 추후 Istio+Tempo 연동)
- POST /ask          : 자유 질문 → Claude 실시간 조회 후 답변

환경변수:
  MOCK_MODE=true     : K8s/Loki/AMP 연결 없이 가짜 데이터 반환 (로컬 개발용)
  MOCK_MODE=false    : 실제 클러스터 연결 (기본값, 프로덕션)

  [트레이싱]
  TEMPO_ENDPOINT     : Tempo HTTP API 엔드포인트 (Istio+Tempo 연동 후 설정)
                       기본값 없음 → 트레이싱 엔드포인트 미설정 시 mock 반환
"""
import logging
import os
import time

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from store import get_history, get_latest

logger = logging.getLogger(__name__)

MOCK_MODE = os.environ.get("MOCK_MODE", "false").lower() == "true"
TEMPO_ENDPOINT = os.environ.get("TEMPO_ENDPOINT", "")

app = FastAPI(title="AIOps API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

SERVICES = ["quiz-service", "auth-service", "user-service", "community-service",
            "chat-bot-service", "video-analysis-service", "admin-service"]

# ── Mock 데이터 ──────────────────────────────────────────────────────────────

def _mock_status():
    return {
        "anomaly": False,
        "summary": "[MOCK] 클러스터 정상 상태입니다.",
        "timestamp": time.time(),
        "pods": {
            "pawfiler": {"total": 8, "abnormal_count": 0, "abnormal": []},
            "admin": {"total": 2, "abnormal_count": 0, "abnormal": []},
        },
        "metrics_summary": {
            "quiz-service":            {"cpu": "42%", "memory": "198Mi", "error_rate": "0.2%", "rps": 14},
            "auth-service":            {"cpu": "18%", "memory": "112Mi", "error_rate": "0.0%", "rps": 9},
            "user-service":            {"cpu": "22%", "memory": "134Mi", "error_rate": "0.1%", "rps": 7},
            "community-service":       {"cpu": "31%", "memory": "176Mi", "error_rate": "0.3%", "rps": 5},
            "chat-bot-service":        {"cpu": "55%", "memory": "312Mi", "error_rate": "0.0%", "rps": 3},
            "video-analysis-service":  {"cpu": "78%", "memory": "890Mi", "error_rate": "0.5%", "rps": 1},
            "admin-service":           {"cpu": "12%", "memory": "98Mi",  "error_rate": "0.0%", "rps": 2},
        },
        "recent_errors": [
            {"service": "video-analysis-service", "message": "[MOCK] S3 upload timeout after 30s", "time": time.time() - 120},
            {"service": "community-service",      "message": "[MOCK] DB connection pool exhausted", "time": time.time() - 480},
        ],
    }

MOCK_HISTORY = [
    {"timestamp": time.time() - 300,  "anomaly": False, "summary": "[MOCK] 클러스터 정상."},
    {"timestamp": time.time() - 600,  "anomaly": True,  "summary": "[MOCK] quiz-service CrashLoopBackOff 감지. 재시작 완료."},
    {"timestamp": time.time() - 900,  "anomaly": False, "summary": "[MOCK] 클러스터 정상."},
    {"timestamp": time.time() - 1200, "anomaly": False, "summary": "[MOCK] 클러스터 정상."},
]

def _mock_metrics(service: str):
    data = {
        "quiz-service":           {"cpu_percent": 42, "memory_mi": 198, "error_rate": 0.2, "rps": 14, "p99_latency_ms": 85},
        "auth-service":           {"cpu_percent": 18, "memory_mi": 112, "error_rate": 0.0, "rps": 9,  "p99_latency_ms": 32},
        "user-service":           {"cpu_percent": 22, "memory_mi": 134, "error_rate": 0.1, "rps": 7,  "p99_latency_ms": 45},
        "community-service":      {"cpu_percent": 31, "memory_mi": 176, "error_rate": 0.3, "rps": 5,  "p99_latency_ms": 120},
        "chat-bot-service":       {"cpu_percent": 55, "memory_mi": 312, "error_rate": 0.0, "rps": 3,  "p99_latency_ms": 980},
        "video-analysis-service": {"cpu_percent": 78, "memory_mi": 890, "error_rate": 0.5, "rps": 1,  "p99_latency_ms": 4200},
        "admin-service":          {"cpu_percent": 12, "memory_mi": 98,  "error_rate": 0.0, "rps": 2,  "p99_latency_ms": 28},
    }
    return {"service": service, "source": "mock", **data.get(service, {})}

def _mock_logs(service: str):
    logs = {
        "quiz-service": [
            {"time": time.time() - 60,  "level": "INFO",  "message": "Quiz fetched: id=quiz-123"},
            {"time": time.time() - 180, "level": "WARN",  "message": "Slow DB query: 1.2s"},
        ],
        "video-analysis-service": [
            {"time": time.time() - 120, "level": "ERROR", "message": "S3 upload timeout after 30s"},
            {"time": time.time() - 300, "level": "INFO",  "message": "Analysis complete: task=abc"},
        ],
        "community-service": [
            {"time": time.time() - 480, "level": "ERROR", "message": "DB connection pool exhausted"},
            {"time": time.time() - 600, "level": "INFO",  "message": "Post created: id=post-456"},
        ],
    }
    return {
        "service": service,
        "source": "mock",
        "logs": logs.get(service, [{"time": time.time() - 60, "level": "INFO", "message": f"{service} running normally"}]),
    }

def _mock_traces():
    return {
        "source": "mock",
        "note": "Istio + Tempo 연동 후 실제 트레이스 데이터로 교체됩니다.",
        "traces": [
            {
                "trace_id": "abc123def456",
                "root_service": "quiz-service",
                "duration_ms": 142,
                "status": "ok",
                "spans": [
                    {"service": "quiz-service",  "operation": "GET /quiz/123",    "duration_ms": 142},
                    {"service": "user-service",  "operation": "GetUser",          "duration_ms": 18},
                    {"service": "quiz-service",  "operation": "DB SELECT quiz",   "duration_ms": 85},
                ],
                "timestamp": time.time() - 30,
            },
            {
                "trace_id": "xyz789uvw012",
                "root_service": "auth-service",
                "duration_ms": 38,
                "status": "ok",
                "spans": [
                    {"service": "auth-service",  "operation": "POST /auth/login", "duration_ms": 38},
                    {"service": "auth-service",  "operation": "DB SELECT user",   "duration_ms": 22},
                ],
                "timestamp": time.time() - 90,
            },
            {
                "trace_id": "err111aaa222",
                "root_service": "video-analysis-service",
                "duration_ms": 30120,
                "status": "error",
                "spans": [
                    {"service": "video-analysis-service", "operation": "POST /api/upload-video", "duration_ms": 30120},
                    {"service": "video-analysis-service", "operation": "S3 PutObject",           "duration_ms": 30000},
                ],
                "timestamp": time.time() - 120,
            },
        ],
    }


# ── 엔드포인트 ────────────────────────────────────────────────────────────────

@app.get("/status")
async def get_status():
    if MOCK_MODE:
        return _mock_status()
    latest = get_latest()
    if not latest:
        return {"anomaly": False, "summary": "아직 분석 결과가 없습니다.", "timestamp": None}
    return latest


@app.get("/history")
async def get_analysis_history(limit: int = 20):
    if MOCK_MODE:
        return {"history": MOCK_HISTORY, "total": len(MOCK_HISTORY)}
    history = get_history(limit=limit)
    return {"history": history, "total": len(history)}


@app.get("/alerts")
async def get_alerts(limit: int = 20):
    if MOCK_MODE:
        alerts = [h for h in MOCK_HISTORY if h.get("anomaly")]
        return {"alerts": alerts, "total": len(alerts)}
    history = get_history(limit=100)
    alerts = [h for h in history if h.get("anomaly")][:limit]
    return {"alerts": alerts, "total": len(alerts)}


@app.get("/metrics")
async def get_metrics(service: str = ""):
    """서비스별 메트릭 조회 (AMP PromQL)."""
    if MOCK_MODE:
        if service:
            return _mock_metrics(service)
        return {"services": {s: _mock_metrics(s) for s in SERVICES}}

    try:
        from tools import get_prometheus_metrics
        results = {}
        for svc in ([service] if service else SERVICES):
            cpu = get_prometheus_metrics(
                f'avg(rate(container_cpu_usage_seconds_total{{namespace=~"pawfiler|admin",pod=~"{svc}.*"}}[5m])) * 100'
            )
            results[svc] = {"source": "amp", "cpu_raw": cpu}
        return {"services": results}
    except Exception as e:
        logger.error(f"metrics failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/logs")
async def get_logs(service: str = "", level: str = "error", minutes: int = 30):
    """서비스별 최근 로그 조회 (Loki)."""
    if MOCK_MODE:
        if service:
            return _mock_logs(service)
        return {"services": {s: _mock_logs(s) for s in SERVICES}}

    try:
        from tools import get_loki_logs
        namespace = "admin" if service == "admin-service" else "pawfiler"
        result = get_loki_logs(filter_pattern=level, namespace=namespace, minutes=minutes)
        return {"service": service, "source": "loki", **result}
    except Exception as e:
        logger.error(f"logs failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/traces")
async def get_traces(service: str = "", limit: int = 20):
    """최근 트레이스 조회 (Tempo). Istio+Tempo 연동 전까지 mock 반환."""
    if MOCK_MODE or not TEMPO_ENDPOINT:
        return _mock_traces()

    try:
        import requests
        params = {"limit": limit}
        if service:
            params["service"] = service
        resp = requests.get(f"{TEMPO_ENDPOINT}/api/search", params=params, timeout=10)
        resp.raise_for_status()
        return {"source": "tempo", "traces": resp.json().get("traces", [])}
    except Exception as e:
        logger.error(f"traces failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


class AskRequest(BaseModel):
    question: str


@app.post("/ask")
async def ask(req: AskRequest):
    if not req.question.strip():
        raise HTTPException(status_code=400, detail="질문을 입력해주세요.")

    if MOCK_MODE:
        return {
            "question": req.question,
            "answer": f"[MOCK] '{req.question}'에 대한 분석 결과입니다.\n\n현재 클러스터는 정상 상태이며, video-analysis-service의 CPU 사용률이 78%로 다소 높습니다. S3 업로드 타임아웃 에러가 최근 2건 감지되었습니다.",
            "timestamp": time.time(),
        }

    try:
        from analyzer import ask_claude
        answer = await ask_claude(req.question)
        return {"question": req.question, "answer": answer, "timestamp": time.time()}
    except Exception as e:
        logger.error(f"ask_claude failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/health")
async def health():
    return {"status": "ok", "mock_mode": MOCK_MODE, "tempo_connected": bool(TEMPO_ENDPOINT)}
