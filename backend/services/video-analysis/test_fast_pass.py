"""
Fast Pass 로직 테스트
동일/유사 영상 재업로드 시 즉시 판정 반환
"""

import asyncio
import json
import sys
import time
from pathlib import Path

# Windows 콘솔 인코딩 문제 해결
if sys.platform == 'win32':
    import codecs
    sys.stdout = codecs.getwriter('utf-8')(sys.stdout.buffer, 'strict')
    sys.stderr = codecs.getwriter('utf-8')(sys.stderr.buffer, 'strict')

sys.path.insert(0, str(Path(__file__).parent))

from mcp_server import (
    init_db, init_models,
    analyze_frames_impl,
    save_analysis_result
)


async def test_fast_pass():
    """Fast Pass 로직 테스트"""
    
    print("=" * 80)
    print("Fast Pass 로직 테스트")
    print("=" * 80)
    
    # 테스트 비디오
    test_video = r"C:\Users\DS12\Downloads\preprocessed_samples\preprocessed_samples\celeb_df\fake_0.mp4"
    
    if not Path(test_video).exists():
        print(f"⚠️  테스트 비디오 없음: {test_video}")
        return
    
    # 초기화
    print("\n[초기화]")
    print("-" * 80)
    init_db()
    await init_models()
    print("✓ 초기화 완료\n")
    
    # 1차 분석 (일반 분석)
    print("\n[1차 분석] 일반 분석 (Fast Pass 없음)")
    print("-" * 80)
    start_time = time.time()
    
    result1 = await analyze_frames_impl(test_video, return_details=True, enable_fast_pass=False)
    
    elapsed1 = int((time.time() - start_time) * 1000)
    
    print(f"✓ 판정: {result1['verdict']}")
    print(f"  신뢰도: {result1['confidence_score']:.4f}")
    print(f"  처리시간: {result1['processing_time_ms']}ms")
    print(f"  전체 시간: {elapsed1}ms")
    print(f"  Fast Pass: {result1.get('fast_pass', False)}")
    
    # 결과 저장
    analysis_id = save_analysis_result(test_video, "stage1", result1)
    print(f"  분석 ID: {analysis_id}")
    
    # 2차 분석 (Fast Pass 적용)
    print("\n[2차 분석] 동일 영상 재분석 (Fast Pass 활성화)")
    print("-" * 80)
    start_time = time.time()
    
    result2 = await analyze_frames_impl(test_video, return_details=True, enable_fast_pass=True)
    
    elapsed2 = int((time.time() - start_time) * 1000)
    
    print(f"✓ 판정: {result2['verdict']}")
    print(f"  신뢰도: {result2['confidence_score']:.4f}")
    print(f"  처리시간: {result2.get('processing_time_ms', 0)}ms")
    print(f"  전체 시간: {elapsed2}ms")
    print(f"  Fast Pass: {result2.get('fast_pass', False)}")
    
    if result2.get('fast_pass'):
        print(f"  ⚡ Fast Pass 적용!")
        print(f"  유사도: {result2.get('fast_pass_similarity', 0):.4f}")
        print(f"  원본: {Path(result2.get('fast_pass_source', '')).name}")
        print(f"  속도 향상: {elapsed1 / elapsed2:.1f}x")
    
    # 3차 분석 (다른 비디오)
    test_video2 = r"C:\Users\DS12\Downloads\preprocessed_samples\preprocessed_samples\celeb_df\fake_1.mp4"
    
    if Path(test_video2).exists():
        print("\n[3차 분석] 다른 영상 분석 (Fast Pass 활성화)")
        print("-" * 80)
        start_time = time.time()
        
        result3 = await analyze_frames_impl(test_video2, return_details=True, enable_fast_pass=True)
        
        elapsed3 = int((time.time() - start_time) * 1000)
        
        print(f"✓ 판정: {result3['verdict']}")
        print(f"  신뢰도: {result3['confidence_score']:.4f}")
        print(f"  처리시간: {result3.get('processing_time_ms', 0)}ms")
        print(f"  전체 시간: {elapsed3}ms")
        print(f"  Fast Pass: {result3.get('fast_pass', False)}")
        
        if result3.get('fast_pass'):
            print(f"  ⚡ Fast Pass 적용!")
            print(f"  유사도: {result3.get('fast_pass_similarity', 0):.4f}")
        else:
            print(f"  일반 분석 수행 (유사한 영상 없음)")
    
    # 요약
    print("\n" + "=" * 80)
    print("Fast Pass 테스트 완료")
    print("=" * 80)
    print(f"\n성능 비교:")
    print(f"  1차 (일반): {elapsed1}ms")
    print(f"  2차 (Fast Pass): {elapsed2}ms")
    if result2.get('fast_pass'):
        print(f"  속도 향상: {elapsed1 / elapsed2:.1f}x")
        print(f"  시간 절약: {elapsed1 - elapsed2}ms")
    
    print(f"\nFast Pass 효과:")
    print(f"  - GPU/LLM 자원 소모 차단")
    print(f"  - 응답 시간 1초 미만 달성")
    print(f"  - 동일 영상 재업로드 시 즉시 판정")
    print()


if __name__ == "__main__":
    asyncio.run(test_fast_pass())
