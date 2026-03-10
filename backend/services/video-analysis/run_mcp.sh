#!/bin/bash

# PawFiler MCP Server 실행 스크립트

echo "=================================="
echo "PawFiler MCP Server"
echo "=================================="

# 가상환경 확인
if [ ! -d ".venv" ]; then
    echo "가상환경을 생성합니다..."
    python -m venv .venv
fi

# 가상환경 활성화
source .venv/bin/activate 2>/dev/null || source .venv/Scripts/activate 2>/dev/null

# 의존성 설치
echo "의존성을 확인합니다..."
pip install -q -r requirements-mcp.txt

# MCP 서버 실행
echo "MCP 서버를 시작합니다..."
python mcp_server.py
