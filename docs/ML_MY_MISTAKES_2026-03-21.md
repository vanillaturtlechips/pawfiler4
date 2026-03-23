# 2026-03-21 학습 과정 실수 및 문제 전체 정리

---

## [코드 버그]

### 1. train_start/end, val_start/end 파라미터 무시
- 하이퍼파라미터로 받아놓고 train() 함수 내에서 완전히 무시
- 항상 `get_shard_paths(0, 6998)` 전체를 읽고 자체 분할
- 결과: SageMaker에서 넘긴 파라미터가 아무 효과 없었음

### 2. val 샤드가 audio_fake 구간에 몰림
- 데이터 구조: shard 0~5000 = 여러 클래스 혼재, shard 6000~6998 = audio_fake만
- val_start=6501로 설정 시 val 전체가 audio_fake 단일 클래스
- audio_fake가 LABEL2IDX에 없어서 val 샘플 수 = 0
- 결과: 매 epoch "No valid samples!" 경고, 검증 전혀 안 됨

### 3. audio_fake 미제거
- 이전에 audio_fake 빼기로 결정했는데 AI_MODELS 리스트에서 제거 안 함
- 모델은 33 클래스로 학습, evaluate.py는 35 클래스로 평가 → size mismatch 에러

### 4. 불균형 처리 미반영
- "클래스 균형 고쳐서 낸다"고 했는데 실제 코드에 반영 안 됨
- WeightedRandomSampler, class_weights 모두 없이 순서대로 학습
- 결과: 뒤쪽 audio_fake 클래스에 압도적으로 노출

### 5. class_weights 스캔 로직 오류
- 스캔용 WebDataset에 shardshuffle=None 미설정 → 경고 + 느려짐
- 싱글스레드 스캔으로 50개 샤드에 15분 소요
- 결과: Min:1.00 Max:1.00 → 모든 클래스 동일 가중치, 불균형 보정 효과 없음

### 6. pretrained=True 유지
- 체크포인트에서 이어받는 상황에서 pretrained=True 불필요
- HuggingFace rate limit으로 1시간 이상 멈춤
- 결과: balanced-3 작업 1시간 낭비

### 7. val 분할 방식 문제 (mini benchmark 로직)
- 전체 샤드를 10% 축소판으로 만든 뒤 그 안에서 90/10 분할
- 축소판 내 val이 FastFile 경로 문제로 0개가 되는 경우 발생
- 결과: val 없이 학습 완료

---

## [F1 낮은 원인]

### Macro F1 0.41인 이유
- F1 0.00인 클래스: AccVideo, AnimateDiff, Cogvideox1.5, EasyAnimate, SVD, Gen2, Gen3, Sora 등
- 이 클래스들은 shard 앞쪽(0~2000)에만 존재, 샘플 수 극소
- train이 전체 샤드를 순서대로 돌면서 뒤쪽(audio_fake 구간)에 압도적으로 노출
- 결과: 앞쪽 클래스는 학습 기회 극소, 뒤쪽 클래스는 과학습

### Real 클래스 recall 3% 문제
- Real 데이터가 shard 전체에 소량 분포
- audio_fake에 묻혀서 모델이 Real을 거의 못 맞춤

### 근본 원인
- 데이터가 클래스별로 연속 배치 (shard 6000~6998 = audio_fake만)
- shardshuffle=5000이지만 shard 단위 shuffle이라 클래스 편향이 배치 단위로 전달됨
- class_weights 계산 실패로 보정 없음

---

## [운영 실수]

### 8. 비용 과소 추정
- "재학습 $5~10 나온다"고 했는데 실제로는 15시간 × ~$2/h = $30 수준
- 잘못된 정보 제공으로 의사결정 오류 유발

### 9. balanced-2 작업 실수로 취소
- 취소하지 말라고 했는데 stop 명령 날림
- 이후 재시작 필요

### 10. Spot 인스턴스 불안정 대응 미흡
- g6.12xlarge Spot이 오늘 리전에서 계속 뺏기는 상황
- g5.12xlarge 등 대안 인스턴스 타입 미리 검토 안 함
- 결과: 하루 종일 대기 + 재시도 반복

---

## 현재 상태 (balanced-5)
- audio_fake 제거 ✅
- val 전체 샤드에서 10개마다 1개 stride 추출 ✅
- pretrained=False ✅
- step3 체크포인트 이어받기 ✅
- num_workers=48, prefetch_factor=4 ✅
- Spot 용량 대기 중 (MaxWaitTime 26시간 남음)

## 여전히 남은 문제
- class_weights가 제대로 계산 안 될 가능성 있음 (스캔 로직 미완)
- shardshuffle이 shard 단위라 클래스 편향 완전 해소 안 됨
- 이번 학습 완료 후 F1이 얼마나 오를지 불확실
