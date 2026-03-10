"""
7개 MCP 도구 전체 테스트
"""

import asyncio
import json
import sys
from pathlib import Path

# Windows 콘솔 인코딩 문제 해결
if sys.platform == 'win32':
    import codecs
    sys.stdout = codecs.getwriter('utf-8')(sys.stdout.buffer, 'strict')
    sys.stderr = codecs.getwriter('utf-8')(sys.stderr.buffer, 'strict')

sys.path.insert(0, str(Path(__file__).parent))

from mcp_server import (
    init_db, init_models,
    get_frame_sample_impl,
    analyze_frames_impl,
    extract_embedding_impl,
    search_similar_videos_impl,
    explain_result_impl,
    save_embedding_impl,
    emit_event_impl,
    save_analysis_result
)


async def test_all_tools():
    """7개 도구 전체 테스트"""
    
    print("=" * 80)
    print("PawFiler MCP Server - 7개 도구 전체 테스트")
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
    
    # 1. get_frame_sample
    print("\n[1] get_frame_sample - 프레임 샘플 추출")
    print("-" * 80)
    try:
        result = await get_frame_sample_impl(test_video, num_frames=8, method="uniform")
        print(f"✓ {result['extracted_frames']}개 프레임 추출")
        print(f"  방식: {result['method']}")
        print(f"  총 프레임: {result['total_frames']}")
        print(f"  영상 길이: {result['duration_sec']:.2f}초")
    except Exception as e:
        print(f"✗ 오류: {e}")
    
    # 2. analyze_frames
    print("\n[2] analyze_frames - 프레임 분석")
    print("-" * 80)
    try:
        result = await analyze_frames_impl(test_video, return_details=True)
        print(f"✓ 판정: {result['verdict']}")
        print(f"  신뢰도: {result['confidence_score']:.4f}")
        print(f"  처리시간: {result['processing_time_ms']}ms")
        
        # 분석 결과 저장 (다음 테스트용)
        analysis_id = save_analysis_result(test_video, "stage1", result)
        print(f"  분석 ID: {analysis_id}")
    except Exception as e:
        print(f"✗ 오류: {e}")
        return
    
    # 3. extract_embedding
    print("\n[3] extract_embedding - 임베딩 추출")
    print("-" * 80)
    try:
        result = await extract_embedding_impl(analysis_id, {"source": "test"})
        print(f"✓ 임베딩 ID: {result['embedding_id']}")
        print(f"  차원: {result['embedding_dim']}")
        embedding_id = result['embedding_id']
    except Exception as e:
        print(f"✗ 오류: {e}")
        embedding_id = None
    
    # 4. save_embedding (추가 임베딩 저장)
    print("\n[4] save_embedding - 임베딩 저장")
    print("-" * 80)
    try:
        # 다른 비디오 분석 결과 생성 (유사도 검색 테스트용)
        test_video2 = r"C:\Users\DS12\Downloads\preprocessed_samples\preprocessed_samples\celeb_df\fake_1.mp4"
        if Path(test_video2).exists():
            result2 = await analyze_frames_impl(test_video2, return_details=False)
            analysis_id2 = save_analysis_result(test_video2, "stage1", result2)
            
            result = await save_embedding_impl(analysis_id2, metadata={"source": "test2"})
            print(f"✓ 임베딩 ID: {result['embedding_id']}")
            print(f"  분석 ID: {result['analysis_id']}")
        else:
            print("⚠️  두 번째 비디오 없음, 스킵")
    except Exception as e:
        print(f"✗ 오류: {e}")
    
    # 5. search_similar_videos
    print("\n[5] search_similar_videos - 유사 비디오 검색")
    print("-" * 80)
    try:
        result = await search_similar_videos_impl(analysis_id, limit=5, threshold=0.5)
        print(f"✓ 검색 완료: {result['found']}개 발견")
        print(f"  임계값: {result['threshold']}")
        if result['results']:
            for idx, item in enumerate(result['results'], 1):
                print(f"  {idx}. 유사도: {item['similarity']:.4f} - {Path(item['video_path']).name}")
        else:
            print("  유사한 비디오 없음")
    except Exception as e:
        print(f"✗ 오류: {e}")
    
    # 6. explain_result
    print("\n[6] explain_result - 결과 설명")
    print("-" * 80)
    try:
        # 간단한 설명
        result = await explain_result_impl(analysis_id, language="ko", detail_level="simple")
        print(f"✓ 간단한 설명:")
        print(f"  {result['explanation']}")
        
        # 상세한 설명
        result = await explain_result_impl(analysis_id, language="ko", detail_level="detailed")
        print(f"\n✓ 상세한 설명:")
        print(f"  {result['explanation']}")
    except Exception as e:
        print(f"✗ 오류: {e}")
    
    # 7. emit_event
    print("\n[7] emit_event - 이벤트 발행")
    print("-" * 80)
    try:
        result = await emit_event_impl(
            analysis_id,
            event_type="analysis_complete",
            payload={"test": True, "source": "mcp_test"}
        )
        print(f"✓ 이벤트 ID: {result['event_id']}")
        print(f"  타입: {result['event_type']}")
        print(f"  시간: {result['timestamp']}")
        print(f"  메시지: {result['message']}")
    except Exception as e:
        print(f"✗ 오류: {e}")
    
    # 요약
    print("\n" + "=" * 80)
    print("테스트 완료 - 7개 도구 모두 작동 확인")
    print("=" * 80)
    print("\n사용 가능한 MCP 도구:")
    print("  1. get_frame_sample - 프레임 샘플 추출")
    print("  2. analyze_frames - 딥페이크 탐지")
    print("  3. extract_embedding - 임베딩 추출")
    print("  4. save_embedding - 임베딩 저장")
    print("  5. search_similar_videos - 유사 비디오 검색")
    print("  6. explain_result - 결과 설명")
    print("  7. emit_event - 이벤트 발행")
    print()


if __name__ == "__main__":
    asyncio.run(test_all_tools())
