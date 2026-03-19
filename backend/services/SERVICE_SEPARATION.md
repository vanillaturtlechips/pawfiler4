# 서비스 분리 완료

## 역할 분리

### video-analysis (동영상 서빙)
- 동영상 업로드/다운로드
- S3 스트리밍
- 메타데이터 추출
- **AI 분석 기능 제거됨**

### ai-orchestration (AI 분석)
- 딥페이크 탐지
- 멀티모달 분석 (영상+음성)
- AI 모델 식별 (Sora, Gen2 등)

## 아키텍처

```
Client
  │
  ├─→ video-analysis:50054 (gRPC)
  │   └─ 동영상 업로드/스트리밍
  │
  └─→ ai-orchestration:8000 (HTTP)
      └─ AI 분석
```

## 변경 사항

### ArgoCD (pawfiler4-argocd)
- `video-analysis/deployment.yaml`
  - `ENABLE_AI_ANALYSIS: false`
  - AI 관련 환경변수 제거
  - replicas: 2 유지

- `ai-orchestration/` (신규)
  - Ray Serve 기반
  - GPU 스팟 인스턴스
  - 오토스케일 (1~2)

### 백엔드 (pawfiler4)
- `video-analysis/` - 동영상 서빙만 담당
- `ai-orchestration/` - AI 분석 전담

## 배포

```bash
# ArgoCD 반영
cd /mnt/c/Users/DS6/Documents/pawfiler/p2/pawfiler4-argocd
git add apps/services/
git commit -m "Separate video serving and AI analysis services"
git push
```

## 비용

- **video-analysis**: ~$30/월 (CPU 전용, 항상 실행)
- **ai-orchestration**: $248~467/월 (GPU 스팟, 오토스케일)
- **총**: ~$278~497/월
