# PawFiler ML 구현 체크리스트

## 🎯 전처리/모델링 전에 할 수 있는 작업

### Phase 0: 인프라 준비 (지금 가능)

- [ ] **벡터 DB 구축**
  - [ ] PostgreSQL에 pgvector 설치
  - [ ] `backend/scripts/setup-vector-db.sql` 실행
  - [ ] 테이블 생성 확인
  - [ ] HNSW 인덱스 생성 확인
  - [ ] 헬퍼 함수 테스트

- [ ] **데이터셋 다운로드**
  - [ ] AIGVDBench 신청/다운로드
  - [ ] Celeb-DF v2 신청/다운로드
  - [ ] WildDeepfake 다운로드
  - [ ] MLAAD 신청/다운로드
  - [ ] 데이터 무결성 확인
  - [ ] 디렉토리 구조 정리

- [ ] **코드 구조 설계**
  - [ ] `vector_extractor.py` 인터페이스 검토
  - [ ] `quiz_generator.go` 로직 검토
  - [ ] 디렉토리 구조 정리
  - [ ] 의존성 패키지 리스트 작성

- [ ] **문서화**
  - [ ] `.kiro/ML_STRATEGY.md` 검토
  - [ ] `.kiro/DB_OPTIMIZATION.md` 검토
  - [ ] 추가 필요 문서 작성

---

## 🏠 집에서 할 작업 (전처리/모델링)

### Phase 1: 전처리 파이프라인 구현

- [ ] **Video 전처리**
  - [ ] 프레임 추출 함수 (`extract_frames`)
  - [ ] 얼굴 탐지 함수 (`extract_faces` with MTCNN)
  - [ ] 데이터 증강 함수 (`augment`)
  - [ ] 정규화 함수
  - [ ] 테스트 (샘플 영상으로)

- [ ] **Audio 전처리**
  - [ ] 오디오 추출 함수 (`extract_audio` with ffmpeg)
  - [ ] 특징 추출 함수 (Mel-spectrogram, MFCC, Wav2Vec2)
  - [ ] 데이터 증강 함수
  - [ ] 테스트

- [ ] **Dataset 클래스**
  - [ ] `MultimodalDataset` 구현
  - [ ] DataLoader 설정
  - [ ] 배치 샘플링 테스트

### Phase 2: 모델 구현

- [ ] **Video Encoder**
  - [ ] MobileViT backbone 로드
  - [ ] LSTM temporal aggregation 추가
  - [ ] Multi-head 구현 (binary, ai_model, manipulation)
  - [ ] Forward pass 테스트

- [ ] **Audio Encoder**
  - [ ] Wav2Vec2 backbone 로드
  - [ ] Classification heads 추가
  - [ ] Forward pass 테스트

- [ ] **Fusion Model**
  - [ ] Cross-attention 구현
  - [ ] Fusion layer 구현
  - [ ] End-to-end 테스트

### Phase 3: 학습

- [ ] **Phase 1: Base Training**
  - [ ] Celeb-DF + WildDeepfake 데이터 로드
  - [ ] Binary classification 학습
  - [ ] 검증 (50 epochs)
  - [ ] 모델 저장

- [ ] **Phase 2: AI Model Classification** ⭐
  - [ ] AIGVDBench 데이터 로드
  - [ ] Transfer learning (Phase 1 모델)
  - [ ] 23개 모델 분류 학습
  - [ ] 검증 (30 epochs)
  - [ ] 모델별 시그니처 벡터 추출
  - [ ] 벡터 DB에 저장

- [ ] **Phase 3: Multimodal Fusion**
  - [ ] MLAAD 데이터 로드
  - [ ] 멀티모달 학습
  - [ ] 검증 (20 epochs)

- [ ] **Phase 4: Fine-tuning**
  - [ ] WildDeepfake로 Fine-tuning
  - [ ] 최종 검증 (10 epochs)

### Phase 4: 벡터 추출 및 저장

- [ ] **벡터 추출 구현**
  - [ ] `MobileViTExtractor` 구현
  - [ ] `AIGVBenchClassifier` 구현
  - [ ] `DeepfakeDetector` 구현
  - [ ] `VoiceSynthesisDetector` 구현

- [ ] **벡터 DB 연동**
  - [ ] `VectorDBClient` 구현
  - [ ] AI 모델 시그니처 저장
  - [ ] 멀티모달 임베딩 저장
  - [ ] 검색 함수 테스트

---

## 🚀 집에서 돌아온 후 작업

### Phase 5: 서비스 통합

- [ ] **Video Analysis Service 업데이트**
  - [ ] 학습된 모델 배포
  - [ ] 벡터 추출 로직 통합
  - [ ] 벡터 DB 저장 로직 추가
  - [ ] gRPC 응답에 AI 모델 정보 추가

- [ ] **Quiz Service 업데이트**
  - [ ] 퀴즈 자동 생성 API 구현
  - [ ] 트렌드 분석 API 구현
  - [ ] 개인화 추천 API 구현

- [ ] **Community Service 업데이트**
  - [ ] 게시글 임베딩 생성
  - [ ] 의미 기반 검색 API 구현
  - [ ] 하이브리드 검색 (키워드 + 의미)

### Phase 6: 프론트엔드 통합

- [ ] **Analysis Page**
  - [ ] AI 모델 정보 표시
  - [ ] 유사 케이스 표시
  - [ ] 설명 개선

- [ ] **Quiz Page**
  - [ ] AI 모델 퀴즈 추가
  - [ ] 개인화 추천 표시

- [ ] **Community Page**
  - [ ] 의미 기반 검색 UI
  - [ ] 관련 퀴즈 추천

### Phase 7: 테스트 및 최적화

- [ ] **성능 테스트**
  - [ ] 벡터 검색 속도 측정
  - [ ] 인덱스 최적화
  - [ ] 쿼리 최적화

- [ ] **정확도 테스트**
  - [ ] AI 모델 분류 정확도
  - [ ] 딥페이크 탐지 정확도
  - [ ] 음성 합성 탐지 정확도

- [ ] **통합 테스트**
  - [ ] End-to-end 시나리오 테스트
  - [ ] 부하 테스트

---

## 📊 진행 상황 추적

### 현재 상태
- [x] ML 전략 문서 작성
- [x] DB 최적화 문서 작성
- [x] 벡터 DB 스키마 설계
- [x] 데이터셋 다운로드 가이드
- [x] 벡터 추출 인터페이스 설계
- [x] 퀴즈 생성 로직 설계
- [ ] 벡터 DB 구축 (실행 대기)
- [ ] 데이터셋 다운로드 (진행 중)
- [ ] 전처리 구현 (집에서)
- [ ] 모델 학습 (집에서)

### 예상 일정
- **Phase 0** (지금): 1일
- **Phase 1-4** (집에서): 7-10일
- **Phase 5-7** (통합): 3-5일
- **총 예상**: 2-3주

---

## 💡 팁

### 지금 할 수 있는 추가 작업
1. 논문 읽기 (AIGVDBench, MLAAD 등)
2. 유사 프로젝트 코드 분석
3. PyTorch/TensorFlow 환경 설정
4. GPU 환경 확인 (CUDA 버전 등)
5. S3에 모델 저장 경로 설계
6. 모니터링 대시보드 설계

### 집에서 우선순위
1. **AIGVDBench 학습** (가장 중요!)
2. 벡터 추출 및 저장
3. 기본 탐지 능력 학습
4. 멀티모달 통합

### 주의사항
- 학습 중간 체크포인트 자주 저장
- 벡터 DB 백업 설정
- 학습 로그 상세히 기록
- 하이퍼파라미터 실험 기록
