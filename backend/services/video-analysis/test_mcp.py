"""
MCP 서버 테스트 스크립트
"""

import asyncio
import json
import sys
from pathlib import Path

# MCP 클라이언트 시뮬레이션
async def test_mcp_server():
    """MCP 서버 기능 테스트"""
    
    print("=" * 60)
    print("PawFiler MCP Server 테스트")
    print("=" * 60)
    
    # 테스트 비디오 경로
    test_video = r"C:\Users\DS12\Downloads\preprocessed_samples\preprocessed_samples\celeb_df\fake_0.mp4"
    
    if not Path(test_video).exists():
        print(f"\n⚠️  테스트 비디오 파일이 없습니다: {test_video}")
        print("실제 비디오 파일을 준비하거나 경로를 수정하세요.\n")
        return
    
    print(f"\n✓ 테스트 비디오: {test_video}")
    
    # 1. 프레임 추출 테스트
    print("\n[1] 프레임 추출 테스트")
    print("-" * 60)
    try:
        from mcp_server import extract_frames_from_video
        frames = extract_frames_from_video(test_video, interval_sec=2.0)
        print(f"✓ {len(frames)}개 프레임 추출 완료")
    except Exception as e:
        print(f"✗ 오류: {e}")
    
    # 2. 데이터베이스 테스트
    print("\n[2] 데이터베이스 테스트")
    print("-" * 60)
    try:
        from mcp_server import init_db, save_analysis_result, get_analysis_result
        init_db()
        print("✓ 데이터베이스 초기화 완료")
        
        # 테스트 데이터 저장
        test_result = {"test": "data", "timestamp": "2024-01-01"}
        analysis_id = save_analysis_result(test_video, "test", test_result)
        print(f"✓ 분석 결과 저장 완료: {analysis_id}")
        
        # 데이터 조회
        retrieved = get_analysis_result(analysis_id)
        if retrieved:
            print(f"✓ 분석 결과 조회 완료")
            print(f"  - Stage: {retrieved['stage']}")
            print(f"  - Created: {retrieved['created_at']}")
        else:
            print("✗ 분석 결과 조회 실패")
    except Exception as e:
        print(f"✗ 오류: {e}")
    
    # 3. 모델 초기화 테스트
    print("\n[3] 모델 초기화 테스트")
    print("-" * 60)
    try:
        from mcp_server import init_models
        await init_models()
        print("✓ 모델 초기화 완료")
    except Exception as e:
        print(f"⚠️  모델 초기화 실패 (정상일 수 있음): {e}")
    
    # 4. 전체 파이프라인 테스트
    print("\n[4] 전체 파이프라인 테스트")
    print("-" * 60)
    try:
        from mcp_server import analyze_video_pipeline
        result = await analyze_video_pipeline(test_video, ["stage1", "stage2", "stage3"])
        print("✓ 파이프라인 실행 완료")
        print(f"\n결과:")
        print(json.dumps(result, ensure_ascii=False, indent=2))
    except Exception as e:
        print(f"✗ 오류: {e}")
    
    print("\n" + "=" * 60)
    print("테스트 완료")
    print("=" * 60)


if __name__ == "__main__":
    asyncio.run(test_mcp_server())
