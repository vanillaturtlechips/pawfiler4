# PawFiler Video Analysis MCP Server

로컬 테스트용 MCP (Model Context Protocol) 서버입니다.

## 기능

- **analyze_video**: 비디오 파일 분석 (Stage 1-3 파이프라인)
- **get_analysis**: 저장된 분석 결과 조회
- **list_analyses**: 최근 분석 결과 목록
- **extract_frames**: 비디오에서 프레임 추출

## 설치

```bash
cd pawfiler4/backend/services/video-analysis
pip install -r requirements-mcp.txt
```

## 실행

### 1. 직접 실행

```bash
python mcp_server.py
```

### 2. Kiro IDE에서 사용

`.kiro/settings/mcp.json` 파일에 다음 설정 추가:

```json
{
  "mcpServers": {
    "pawfiler-video-analysis": {
      "command": "python",
      "args": ["mcp_server.py"],
      "cwd": "pawfiler4/backend/services/video-analysis",
      "env": {
        "PYTHONPATH": "."
      },
      "disabled": false,
      "autoApprove": [
        "analyze_video",
        "get_analysis",
        "list_analyses",
        "extract_frames"
      ]
    }
  }
}
```

## 사용 예시

### 비디오 분석

```python
# Kiro IDE에서
analyze_video(video_path="test_video.mp4", stages=["stage1", "stage2", "stage3"])
```

### 분석 결과 조회

```python
get_analysis(analysis_id="uuid-here")
```

### 최근 분석 목록

```python
list_analyses(limit=10)
```

## 아키텍처

```
mcp_server.py
├── Stage 1: 객체 탐지 (LocalDetector + MobileViT)
├── Stage 2: 음성 분석 (AudioAnalyzer + Whisper + VAD)
└── Stage 3: LLM 종합 분석 (규칙 기반 또는 Bedrock)

데이터 저장: SQLite (local_test.db)
```

## 로컬 환경 매핑

| 프로덕션       | 로컬 테스트          |
| -------------- | -------------------- |
| ECS Fargate    | 로컬 Python 프로세스 |
| pgvector (RDS) | SQLite               |
| MSK (Kafka)    | 콘솔 출력            |
| S3             | 로컬 파일시스템      |
| Bedrock Nova 2 | 규칙 기반 분석       |

## 트러블슈팅

### 모델 파일 없음

```bash
# MobileViT 모델 다운로드
mkdir -p ml/models
# 모델 파일을 ml/models/mobilevit_v2_best.pth에 배치
```

### 의존성 오류

```bash
pip install --upgrade mcp opencv-python torch
```

## 개발

로컬 모듈 구조:

- `local_detector.py`: MobileViT 기반 객체 탐지
- `audio_analyzer.py`: Whisper + VAD 음성 분석
- `mcp_server.py`: MCP 서버 메인
