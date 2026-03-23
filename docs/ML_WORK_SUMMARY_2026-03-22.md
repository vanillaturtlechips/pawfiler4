# 작업 요약 2026-03-22

## 해결한 문제들

### 1. AI_ORCHESTRATION_URL 환경변수 누락
- video-analysis pod에 AI_ORCHESTRATION_URL이 없어서 기본값 `http://ai-orchestration:8000`으로 요청
- 존재하지 않는 서비스라 timeout → HTML 에러 반환
- **수정:** `kubectl set env`로 `http://pawfiler-serve-head-svc:8000` 주입

### 2. Ray Serve pod S3 권한 없음 (IRSA 미설정)
- RayService에 serviceAccountName 없어서 default SA 사용 → S3 403 Forbidden
- **수정:** IAM Role `AiOrchestrationRole` 생성 + `ai-orchestration-sa` ServiceAccount 생성 + RayService 패치

### 3. api.pawfiler.site DNS 오설정
- Route53에서 api.pawfiler.site가 구 Istio ingress gateway를 가리키고 있었음
- **수정:** ALB(`k8s-pawfiler-pawfiler-b9f4322b80-...`)로 업데이트

### 4. video-analysis REDIS_URL 누락
- pod에 REDIS_URL 없어서 localhost:6379 연결 시도 → 500 에러
- **수정:** `kubectl set env`로 `redis://172.20.55.236:6379` 주입

### 5. VideoAnalysisRole IAM Role 미생성
- video-analysis-sa가 존재하지 않는 Role 참조 → S3 업로드 실패
- **수정:** VideoAnalysisRole 생성 + S3 PutObject/GetObject 권한 추가

### 6. GetAnalysisResult REST 엔드포인트 없음
- 프론트가 polling할 때 gRPC 경로 사용 → Flask에 해당 엔드포인트 없어서 404
- **수정:** rest_server.py에 `/api/video_analysis.VideoAnalysisService/GetAnalysisResult` 추가

### 7. 프론트 API URL 이중 /api 문제
- config.apiBaseUrl이 이미 `/api` 포함인데 경로에도 `/api` 붙여서 `/api/api/...` 호출
- **수정:** 프론트 api.ts에서 경로 수정

### 8. 프론트 grpc-web Content-Type 문제
- request() 함수가 `application/grpc-web+json`으로 보내서 서버가 처리 못함
- **수정:** polling 부분을 일반 fetch로 교체

### 9. video-analysis 이미지 protobuf 버전 충돌
- grpcio-tools가 protobuf 6.x용 코드 생성 → 구버전 protobuf와 충돌
- **수정:** requirements.txt에 protobuf>=6, grpcio>=1.67.1 고정, Dockerfile에서 proto 재생성 제거

---

## 남은 문제

### Real 클래스 오분류 (핵심 미해결)
- XGBoost cascade가 AI 생성 영상을 confidence 1.0으로 "real" 판정 후 종결
- EfficientNet-B4도 Real recall 0.24로 낮음
- **원인:** 33개 클래스 중 Real의 시각적 특징이 일부 AI 생성 영상과 겹침
- **해결 방법:** Real 클래스 추가 데이터 수집 후 재학습, 또는 class weight 조정

## 현재 상태
- 파이프라인 전체 동작 중 (업로드 → S3 → Ray Serve 분석 → 결과 반환)
- Real 클래스 판정 정확도 낮음 → 재학습 필요
