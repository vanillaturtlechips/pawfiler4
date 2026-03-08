"""비용 모니터링 및 최적화"""
import time
from functools import wraps
import logging

logger = logging.getLogger(__name__)


class CostTracker:
    """실시간 비용 추적"""
    
    # 비용 (USD per 1000 requests)
    COSTS = {
        'sagemaker_inference': 0.50,  # g4dn.xlarge 시간당 $0.526
        'transcribe': 0.024 * 60,     # 분당 $0.024
        'faster_whisper': 0.006,      # Spot 기준
        'nova_lite': 0.06,            # 1M 토큰당 $0.06
        'nova_sonic': 0.24,           # 1M 토큰당 $0.24
    }
    
    def __init__(self):
        self.stats = {
            'total_requests': 0,
            'video_only': 0,
            'video_audio': 0,
            'full_cascade': 0,
            'total_cost': 0.0
        }
    
    def track(self, stage: str):
        """비용 추적 데코레이터"""
        def decorator(func):
            @wraps(func)
            async def wrapper(*args, **kwargs):
                start = time.time()
                result = await func(*args, **kwargs)
                duration = time.time() - start
                
                self._record(stage, duration)
                return result
            return wrapper
        return decorator
    
    def _record(self, stage: str, duration: float):
        """비용 기록"""
        self.stats['total_requests'] += 1
        
        # 단계별 비용 계산
        cost = 0.0
        
        if stage == 'video_only':
            self.stats['video_only'] += 1
            cost = self.COSTS['sagemaker_inference'] / 1000
        
        elif stage == 'video_audio':
            self.stats['video_audio'] += 1
            cost = (self.COSTS['sagemaker_inference'] + self.COSTS['faster_whisper']) / 1000
        
        elif stage == 'full_cascade':
            self.stats['full_cascade'] += 1
            cost = (self.COSTS['sagemaker_inference'] + 
                   self.COSTS['faster_whisper'] + 
                   self.COSTS['nova_lite']) / 1000
        
        self.stats['total_cost'] += cost
        
        # 로그
        if self.stats['total_requests'] % 100 == 0:
            self._print_stats()
    
    def _print_stats(self):
        """통계 출력"""
        total = self.stats['total_requests']
        logger.info(f"""
=== Cost Statistics (Last {total} requests) ===
Video Only:    {self.stats['video_only']/total*100:.1f}% (target: 70%)
Video+Audio:   {self.stats['video_audio']/total*100:.1f}% (target: 20%)
Full Cascade:  {self.stats['full_cascade']/total*100:.1f}% (target: 10%)
Total Cost:    ${self.stats['total_cost']:.4f}
Avg per req:   ${self.stats['total_cost']/total:.6f}
Projected/mo:  ${self.stats['total_cost']/total*100000:.2f} (100k req/mo)
        """)


# 글로벌 인스턴스
cost_tracker = CostTracker()
