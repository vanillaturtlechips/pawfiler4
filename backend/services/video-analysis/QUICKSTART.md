# PawFiler MCP Server 빠른 시작

## 1. 설치

```bash
cd pawfiler4/backend/services/video-analysis
pip install -r requirements-mcp.txt
```

## 2. 실행 방법

### Windows

```bash
run_mcp.bat
```

### Linux/Mac

```bash
./run_mcp.sh
```

### 직접 실행

```bash
python mcp_server.py
```

## 3. Kiro IDE에서 사용

MCP 서버가 자동으로 연결됩니다. 설정은 `.kiro/settings/mcp.json`에 있습니다.

### 사용 가능한 도구

1. **analyze_video** - 비디오 분석

   ```
   analyze_video(video_path="test.mp4", stages=["stage1", "stage2", "stage3"])
   ```

2. **get_analysis** - 분석 결과 조회

   ```
   get_analysis(analysis_id="uuid-here")
   ```

3. **list_analyses** - 최근 분석 목록

   ```
   list_analyses(limit=10)
   ```

4. **extract_frames** - 프레임 추출
   ```
   extract_frames(video_path="test.mp4", interval_sec=1.0)
   ```

## 4. 테스트

```bash
python test_mcp.py
```

## 5. 데이터베이스

분석 결과는 `local_test.db` SQLite 파일에 저장됩니다.

## 6. 로그

서버 로그는 콘솔에 출력됩니다.

## 트러블슈팅

### 모듈 임포트 오류

```bash
pip install --upgrade mcp opencv-python torch
```

### 비디오 파일 오류

- 비디오 파일 경로가 올바른지 확인
- OpenCV가 지원하는 형식인지 확인 (mp4, avi, mov 등)

### MCP 연결 오류

- Kiro IDE에서 MCP Server 뷰 확인
- 서버 재시작: Command Palette > "Reconnect MCP Server"
