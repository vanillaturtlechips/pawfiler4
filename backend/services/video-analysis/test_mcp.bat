@echo off
REM MCP 서버 기본 테스트 실행 (UTF-8 인코딩)

chcp 65001 > nul
python test_mcp.py
