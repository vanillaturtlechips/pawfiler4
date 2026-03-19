# Video Analysis Service

## 역할 분리

### 현재 (video-analysis)
- ✅ 동영상 업로드/다운로드
- ✅ S3 스트리밍
- ✅ 동영상 메타데이터 추출
- ❌ AI 분석 (제거됨)

### AI 분석 (ai-orchestration)
- ✅ 딥페이크 탐지
- ✅ 멀티모달 분석 (영상+음성)
- ✅ AI 모델 식별

## 서비스 간 통신

```
Client → video-analysis (동영상 업로드)
       → ai-orchestration (AI 분석)
       ← 결과 통합
```

## 엔드포인트

**video-analysis:50054** (gRPC)
- `UploadVideo()` - 동영상 업로드
- `GetVideoUrl()` - 스트리밍 URL
- `GetMetadata()` - 메타데이터

**ai-orchestration:8000** (HTTP)
- `POST /analyze` - AI 분석
