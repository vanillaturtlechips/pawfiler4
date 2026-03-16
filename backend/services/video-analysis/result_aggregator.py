"""결과 통합 로직"""
from typing import Dict, Optional, List

class ResultAggregator:
    @staticmethod
    def merge(visual: Optional[Dict], audio: Optional[Dict], meta: Dict) -> Dict:
        """여러 에이전트 결과를 통합"""
        warnings = []
        
        # 경고 메시지 생성
        if not meta['has_audio']:
            warnings.append("오디오 트랙이 없어서 영상만 분석했어요")
        if meta['duration'] > 180:
            warnings.append("영상이 길어서 샘플링했어요")
        if meta['width'] < 720:
            warnings.append("저화질 영상이라 정확도가 낮을 수 있어요")
        
        # 가중치 기반 최종 판정
        weights = {'visual': 0.7, 'audio': 0.3}
        final_score = 0.0
        
        if visual:
            final_score += visual['confidence'] * weights['visual']
        
        if audio:
            final_score += (1.0 if audio['is_synthetic'] else 0.0) * weights['audio']
        elif visual:
            # 오디오 없으면 영상만으로 판정
            final_score = visual['confidence']
        
        # 최종 판정
        if final_score > 0.7:
            verdict = "FAKE"
        elif final_score < 0.3:
            verdict = "REAL"
        else:
            verdict = "UNCERTAIN"
        
        return {
            'task_id': visual.get('task_id', '') if visual else '',
            'final_verdict': verdict,
            'confidence': final_score,
            'visual': visual,
            'audio': audio,
            'lipsync': None,  # TODO: 나중에 구현
            'warnings': warnings,
            'total_processing_time_ms': (
                (visual.get('processing_time_ms', 0) if visual else 0) +
                (audio.get('processing_time_ms', 0) if audio else 0)
            )
        }
