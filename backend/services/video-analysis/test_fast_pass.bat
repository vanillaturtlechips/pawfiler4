@echo off
REM Fast Pass 테스트 실행 (UTF-8 인코딩)

chcp 65001 > nul
python test_fast_pass.py
