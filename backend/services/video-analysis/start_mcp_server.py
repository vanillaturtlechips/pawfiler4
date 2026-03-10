"""
MCP 서버 시작 스크립트 (간단한 래퍼)
"""

import sys
from pathlib import Path

# 경로 설정
BASE_DIR = Path(__file__).parent
sys.path.insert(0, str(BASE_DIR))

if __name__ == "__main__":
    print("=" * 60)
    print("PawFiler Video Analysis MCP Server")
    print("=" * 60)
    print(f"작업 디렉토리: {BASE_DIR}")
    print(f"데이터베이스: {BASE_DIR / 'local_test.db'}")
    print("=" * 60)
    print("\nMCP 서버를 시작합니다...")
    print("Kiro IDE에서 연결을 기다리는 중...\n")
    
    # MCP 서버 실행
    from mcp_server import main
    import asyncio
    
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n\nMCP 서버를 종료합니다.")
    except Exception as e:
        print(f"\n오류 발생: {e}")
        sys.exit(1)
