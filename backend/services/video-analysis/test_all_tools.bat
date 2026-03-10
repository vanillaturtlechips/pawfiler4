@echo off
REM 7개 MCP 도구 테스트 실행 (UTF-8 인코딩)

chcp 65001 > nul
python test_all_tools.py
