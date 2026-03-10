@echo off
REM PawFiler MCP Server 실행 스크립트 (Windows)

echo ==================================
echo PawFiler MCP Server
echo ==================================

REM 가상환경 확인
if not exist ".venv" (
    echo 가상환경을 생성합니다...
    python -m venv .venv
)

REM 가상환경 활성화
call .venv\Scripts\activate.bat

REM 의존성 설치
echo 의존성을 확인합니다...
pip install -q -r requirements-mcp.txt

REM MCP 서버 실행
echo MCP 서버를 시작합니다...
python mcp_server.py
