# ML Real Class Fine-tuning 실패 기록
> 작성일: 2026-03-22 ~ 2026-03-23
> 소요 시간: 약 9시간

## 실패 1: AI_MODELS 클래스 개수 불일치 (33 vs 34)

**문제**: 
- checkpoint는 33개 클래스로 학습됨
- train4.py는 34개 클래스 정의
- `RuntimeError: size mismatch for head.1.weight: torch.Size([33, 256]) vs torch.Size([34, 256])`

**시도**:
1. `SEINE`, `SVD` 제거 → 32개 (실패)
2. `SEINE`, `SVD` 추가 → 34개 (실패)
3. git 히스토리 확인 → 모두 34개

**해결**: `strict=False`로 head만 제외하고 로드

---

## 실패 2: strict=False가 반영 안 됨 (캐시 문제)

**문제**:
- 로컬 파일은 `strict=False`로 수정했는데 SageMaker에서 같은 에러 반복
- SageMaker가 이전 소스 패키지 캐시 사용

**시도**:
1. `__pycache__` 삭제
2. 재실행 → 여전히 실패

**원인**: S3에 올라간 소스 확인 결과 `strict=False` 맞게 올라갔음. 진짜 문제는 다른 곳.

---

## 실패 3: AI_MODELS 개수가 계속 안 맞음

**문제**:
- checkpoint 다운받아서 확인: `head.1.weight torch.Size([33, 256])`
- train3.py git 히스토리: 모두 34개
- checkpoint는 git 외부에서 만들어진 것

**해결**: head를 아예 state_dict에서 제거 후 로드
```python
state = {k: v for k, v in state.items() if not k.startswith('head.')}
```

---

## 실패 4: epoch 카운터 리셋 안 함

**문제**:
- checkpoint epoch=4, args.epochs=2
- `range(4, 2)` = 빈 루프
- 학습 안 돌고 바로 종료

**해결**: `start_epoch = 0` 강제 리셋

---

## 실패 5: 타겟 필터링으로 속도 폭망

**문제**:
- Real/V2V만 필터링하면 빠를 거라 예상
- 실제: `data_wait=422.50s` (배치 하나에 7분)
- 3시간 동안 50 step만 실행
- `MaxRuntimeExceeded`로 강제 종료

**원인**:
- webdataset이 Real/V2V 찾으려고 샤드 전체 스캔
- 타겟이 5%밖에 안 되니 배치 32개 채우려면 수백 개 디코딩 필요
- 필터링 오버헤드가 학습 시간보다 훨씬 큼

**교훈**: webdataset에서 필터링은 역효과

---

## 실패 6: 가중치 자동 계산 실패

**문제**:
- 타겟 필터링 + 자동 가중치 계산
- `[INFO] Weights - Min: 0.00, Max: 0.09`
- 가중치가 너무 작아서 학습 안 됨

**원인**:
- 타겟만 카운팅 → `class_counts.sum()` 작아짐
- `NUM_CLASSES` (35)로 나누니 0.09 같은 쓰레기 값

**해결**: 하드코딩
```python
class_weights[LABEL2IDX['Real']] = 3.0
class_weights[LABEL2IDX['OpenSource_V2V_Cogvideox1.5']] = 2.0
class_weights[LABEL2IDX['OpenSource_V2V_LTX']] = 2.0
```

---

## 실패 7: optimizer 로드 문제 (반복)

**문제**:
- train5.py에서 optimizer 로드 제거했는데
- train4.py에서는 try-except로 처리
- try-except가 작동 안 함 (optimizer 로드 성공해서 except 안 탐)
- 학습 중 `RuntimeError: size mismatch (33 vs 34)`

**해결**: optimizer 로드 완전 제거
```python
# optimizer.load_state_dict(ckpt['optimizer'])  # 주석 처리
```

---

## 실패 8: g6.12xlarge Spot 용량 없음

**문제**: `Insufficient capacity error from EC2`

**해결**: g5.12xlarge로 변경

---


## 최종 해결책

1. **checkpoint 로드**: head 제거, optimizer 로드 제거
2. **타겟 필터링 포기**: 전체 데이터 학습
3. **가중치 하드코딩**: Real 3.0, V2V 2.0
4. **cascade 조정**: Real/V2V는 무조건 DL로
5. **epoch 리셋**: `start_epoch = 0`
6. **인스턴스**: g5.12xlarge (g6 용량 없음)

---

## 교훈

1. checkpoint 호환성 확인 필수
2. webdataset 필터링은 느림 (전체 스캔 필요)
3. optimizer state_dict도 모델 크기 변경 시 문제
4. 자동 계산보다 하드코딩이 안전할 때가 있음
5. Spot 인스턴스 용량 확인 필요
