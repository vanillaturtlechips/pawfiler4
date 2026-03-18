"""
Layer 4: 메트릭 수집 (Prometheus + Custom)
==========================================

Ray Serve는 기본 메트릭을 자동 노출 (/metrics):
    - ray_serve_num_requests
    - ray_serve_request_latency_ms
    - ray_serve_num_ongoing_requests

여기서는 PawFiler 전용 커스텀 메트릭을 추가:
    - pawfiler_cascade_hit_total: XGBoost에서 종결된 요청 수
    - pawfiler_deep_path_total: Deep Path로 넘어간 요청 수
    - pawfiler_inference_latency_ms: 경로별 레이턴시 히스토그램
"""

import logging
import time
from collections import defaultdict

from ray import serve

logger = logging.getLogger("pawfiler.metrics")


@serve.deployment(
    name="metrics_collector",
    num_replicas=1,
    ray_actor_options={"num_cpus": 0.5},
)
class MetricsCollector:
    """
    Prometheus 커스텀 메트릭 수집기.
    
    Ray Serve 2.x에서는 ray.util.metrics로 Prometheus 게이지/카운터를 등록하면
    기본 /metrics 엔드포인트에 자동으로 노출됨.
    """

    def __init__(self):
        try:
            from ray.util.metrics import Counter, Histogram

            self.cascade_hits = Counter(
                "pawfiler_cascade_hit_total",
                description="XGBoost cascade에서 즉시 반환된 요청 수",
            )
            self.deep_path_count = Counter(
                "pawfiler_deep_path_total",
                description="Deep Path(GPU)로 넘어간 요청 수",
            )
            self.latency_histogram = Histogram(
                "pawfiler_inference_latency_ms",
                description="추론 레이턴시 (ms)",
                boundaries=[10, 25, 50, 100, 150, 200, 300, 500, 1000],
                tag_keys=("path",),
            )
            self._enabled = True
        except ImportError:
            logger.warning("ray.util.metrics not available, metrics disabled")
            self._enabled = False

        # 인메모리 집계 (디버깅/로깅용)
        self._counts = defaultdict(int)
        self._latencies = defaultdict(list)

        logger.info(f"MetricsCollector initialized (prometheus={'on' if self._enabled else 'off'})")

    async def record(self, path: str, elapsed_ms: float):
        """
        요청 처리 완료 시 호출.
        
        Args:
            path: "cascade" | "deep_path"
            elapsed_ms: 처리 시간 (ms)
        """
        self._counts[path] += 1
        self._latencies[path].append(elapsed_ms)

        if self._enabled:
            if path == "cascade":
                self.cascade_hits.inc()
            else:
                self.deep_path_count.inc()
            self.latency_histogram.observe(elapsed_ms, tags={"path": path})

        # 100건마다 요약 로그
        total = sum(self._counts.values())
        if total % 100 == 0:
            cascade_rate = self._counts.get("cascade", 0) / max(total, 1) * 100
            logger.info(
                f"[Metrics] total={total}, "
                f"cascade_rate={cascade_rate:.1f}%, "
                f"avg_cascade={self._avg('cascade'):.1f}ms, "
                f"avg_deep={self._avg('deep_path'):.1f}ms"
            )

    async def get_stats(self) -> dict:
        """현재 집계 상태 반환 (디버깅용 API)."""
        total = sum(self._counts.values())
        return {
            "total_requests": total,
            "cascade_hits": self._counts.get("cascade", 0),
            "deep_path_hits": self._counts.get("deep_path", 0),
            "cascade_rate": (
                self._counts.get("cascade", 0) / max(total, 1) * 100
            ),
            "avg_latency": {
                "cascade_ms": round(self._avg("cascade"), 2),
                "deep_path_ms": round(self._avg("deep_path"), 2),
            },
        }

    def _avg(self, path: str) -> float:
        vals = self._latencies.get(path, [])
        return sum(vals) / len(vals) if vals else 0.0
