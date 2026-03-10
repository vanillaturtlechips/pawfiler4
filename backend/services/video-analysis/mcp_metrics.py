"""
MCP 서버 Prometheus 메트릭
"""

from prometheus_client import Counter, Histogram, Gauge, generate_latest, CONTENT_TYPE_LATEST
import time
from functools import wraps
import logging

logger = logging.getLogger(__name__)

# 메트릭 정의
REQUEST_COUNT = Counter(
    'mcp_requests_total',
    'Total MCP tool requests',
    ['tool_name', 'status']
)

REQUEST_DURATION = Histogram(
    'mcp_request_duration_seconds',
    'MCP tool request duration',
    ['tool_name'],
    buckets=[0.01, 0.05, 0.1, 0.5, 1.0, 2.0, 5.0, 10.0]
)

FAST_PASS_HIT = Counter(
    'mcp_fast_pass_hits_total',
    'Fast Pass cache hits'
)

FAST_PASS_MISS = Counter(
    'mcp_fast_pass_misses_total',
    'Fast Pass cache misses'
)

FAST_PASS_SIMILARITY = Histogram(
    'mcp_fast_pass_similarity',
    'Fast Pass similarity scores',
    buckets=[0.5, 0.6, 0.7, 0.8, 0.9, 0.95, 0.97, 0.99, 1.0]
)

ANALYSIS_CONFIDENCE = Histogram(
    'mcp_analysis_confidence',
    'Analysis confidence scores',
    ['verdict'],
    buckets=[0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0]
)

FRAME_COUNT = Histogram(
    'mcp_frames_analyzed',
    'Number of frames analyzed per video',
    buckets=[4, 8, 16, 32, 64, 128]
)

ACTIVE_REQUESTS = Gauge(
    'mcp_active_requests',
    'Number of active requests',
    ['tool_name']
)

EMBEDDING_DIMENSION = Gauge(
    'mcp_embedding_dimension',
    'Embedding vector dimension'
)

DB_QUERY_DURATION = Histogram(
    'mcp_db_query_duration_seconds',
    'Database query duration',
    ['query_type'],
    buckets=[0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1.0]
)


def track_request(tool_name: str):
    """요청 추적 데코레이터"""
    def decorator(func):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            ACTIVE_REQUESTS.labels(tool_name=tool_name).inc()
            start_time = time.time()
            status = 'success'
            
            try:
                result = await func(*args, **kwargs)
                
                # 에러 체크
                if isinstance(result, dict) and 'error' in result:
                    status = 'error'
                
                return result
            except Exception as e:
                status = 'error'
                raise
            finally:
                duration = time.time() - start_time
                REQUEST_DURATION.labels(tool_name=tool_name).observe(duration)
                REQUEST_COUNT.labels(tool_name=tool_name, status=status).inc()
                ACTIVE_REQUESTS.labels(tool_name=tool_name).dec()
        
        return wrapper
    return decorator


def track_fast_pass(hit: bool, similarity: float = None):
    """Fast Pass 메트릭 기록"""
    if hit:
        FAST_PASS_HIT.inc()
        if similarity is not None:
            FAST_PASS_SIMILARITY.observe(similarity)
    else:
        FAST_PASS_MISS.inc()


def track_analysis(verdict: str, confidence: float, frame_count: int):
    """분석 결과 메트릭 기록"""
    ANALYSIS_CONFIDENCE.labels(verdict=verdict).observe(confidence)
    FRAME_COUNT.observe(frame_count)


def track_embedding(dimension: int):
    """임베딩 메트릭 기록"""
    EMBEDDING_DIMENSION.set(dimension)


def track_db_query(query_type: str, duration: float):
    """DB 쿼리 메트릭 기록"""
    DB_QUERY_DURATION.labels(query_type=query_type).observe(duration)


def get_metrics():
    """Prometheus 메트릭 반환"""
    return generate_latest()


def get_metrics_content_type():
    """메트릭 Content-Type 반환"""
    return CONTENT_TYPE_LATEST
