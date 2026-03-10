"""
여러 비디오 파일로 MCP 서버 테스트
"""

import asyncio
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from mcp_server import init_db, init_models, analyze_video_pipeline


async def test_multiple_videos():
    """여러 비디오 파일 테스트"""
    
    print("=" * 80)
    print("PawFiler MCP Server - 다중 비디오 테스트")
    print("=" * 80)
    
    # 테스트 비디오 경로
    base_path = Path(r"C:\Users\DS12\Downloads\preprocessed_samples\preprocessed_samples\celeb_df")
    
    test_videos = [
        base_path / "fake_0.mp4",
        base_path / "fake_1.mp4",
        base_path / "fake_2.mp4",
    ]
    
    # 초기화
    print("\n[초기화]")
    print("-" * 80)
    init_db()
    await init_models()
    print("✓ 초기화 완료\n")
    
    # 각 비디오 분석
    results = []
    for idx, video_path in enumerate(test_videos, 1):
        if not video_path.exists():
            print(f"⚠️  파일 없음: {video_path}")
            continue
        
        print(f"\n[테스트 {idx}/{len(test_videos)}] {video_path.name}")
        print("-" * 80)
        
        try:
            result = await analyze_video_pipeline(str(video_path), ["stage1"])
            
            stage1 = result["stages"]["stage1"]
            verdict = stage1.get("verdict", "unknown")
            confidence = stage1.get("confidence_score", 0.0)
            processing_time = stage1.get("processing_time_ms", 0)
            
            print(f"✓ 판정: {verdict}")
            print(f"  신뢰도: {confidence:.4f}")
            print(f"  처리시간: {processing_time}ms")
            
            results.append({
                "video": video_path.name,
                "verdict": verdict,
                "confidence": confidence,
                "processing_time_ms": processing_time
            })
            
        except Exception as e:
            print(f"✗ 오류: {e}")
            results.append({
                "video": video_path.name,
                "error": str(e)
            })
    
    # 요약
    print("\n" + "=" * 80)
    print("테스트 요약")
    print("=" * 80)
    
    for result in results:
        if "error" in result:
            print(f"✗ {result['video']}: 오류 - {result['error']}")
        else:
            print(f"✓ {result['video']}: {result['verdict']} (신뢰도: {result['confidence']:.4f}, {result['processing_time_ms']}ms)")
    
    # 통계
    successful = [r for r in results if "error" not in r]
    if successful:
        avg_confidence = sum(r["confidence"] for r in successful) / len(successful)
        avg_time = sum(r["processing_time_ms"] for r in successful) / len(successful)
        fake_count = sum(1 for r in successful if r["verdict"] == "fake")
        
        print(f"\n통계:")
        print(f"  - 성공: {len(successful)}/{len(results)}")
        print(f"  - Fake 판정: {fake_count}/{len(successful)}")
        print(f"  - 평균 신뢰도: {avg_confidence:.4f}")
        print(f"  - 평균 처리시간: {avg_time:.0f}ms")
    
    print("\n" + "=" * 80)


if __name__ == "__main__":
    asyncio.run(test_multiple_videos())
