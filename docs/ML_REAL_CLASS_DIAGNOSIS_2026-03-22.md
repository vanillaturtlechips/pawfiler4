# ML Real Class 성능 진단 보고서
> 작성일: 2026-03-22

## 현재 성능 요약

| 지표 | 값 |
|------|-----|
| Macro F1 | 0.8561 |
| Real Precision | 0.4622 |
| Real Recall | 0.2429 |
| Real F1 | 0.3184 |
| Real Support | 2,063개 |

- 목표: Real F1 → **0.90** (= 전체 Macro F1 0.90 달성과 동일)
- Real 하나만 잡으면 전체 목표 자동 달성 (나머지 클래스는 대부분 0.87~0.99)

---

## 핵심 가설: XGBoost Cascade가 Real을 죽이고 있다

### 구조 (train3.py)
```
입력 영상
  → XGBoost (Phase 1)
      → 확신도 >= 0.75: 해당 예측으로 확정 (DL 모델 미사용)
      → 확신도 < 0.75:  VideoAgent(EfficientNet+LSTM)로 넘김
```

### 문제점
1. **Cascade 필터링**: XGBoost가 Real 영상을 다른 AI 클래스로 0.75 이상 확신하면 DL 모델이 볼 기회 자체가 없음
2. **class_weights 샘플링 오류**: `scan_shards = train_shards[::10]` (10% 스캔) → Real이 특정 샤드에 몰려 있으면 가중치 계산에서 누락 가능
3. **label_smoothing=0.1**: 희귀·어려운 클래스(Real)에 불리 → 확신도를 낮춰버림
4. **Wan2.1도 precision 낮음** (0.5508): Real과 Wan2.1이 서로 혼동되고 있을 가능성

---

## 진단 계획 (비용 최소화)

### Step 1: evaluate_deep.py 실행 (현재 진행 중)
- 인스턴스: ml.g4dn.xlarge (약 $1.5)
- 재학습 없음

뽑히는 정보:
- XGBoost 단독 Real 성능
- DL 단독 Real 성능
- Real이 어떤 클래스로 오분류되는지 Top 10 (XGBoost / DL 각각)
- threshold 0.05~0.90 구간별 Real F1
- 최적 threshold 적용 시 전체 Macro F1 예측치

---

## 결과에 따른 대응 시나리오

### 시나리오 A: XGBoost가 문제 (Real recall이 XGBoost 단계에서 이미 낮음)
→ **재학습 없이** cascade 로직만 수정

```python
# train3.py / evaluate.py 수정
real_idx = LABEL2IDX.get('Real', 22)
uncertain = (max_probs < args.cascade_threshold) | \
            (predictions == real_idx) | \
            (proba[:, real_idx] > 0.1)
```

### 시나리오 B: threshold 조정으로 해결 가능
→ evaluate_deep.py 섹션 5 결과의 최적 threshold 값을 inference 코드에 적용
→ **재학습 없음, 코드 수정만**

### 시나리오 C: DL 모델 자체도 Real을 못 잡음
→ 최소 fine-tuning 필요 (전체 재학습 아님)
- label_smoothing: 0.1 → 0.0
- Real 샤드 집중 학습
- cascade_threshold 낮춰서 Real 샘플이 DL에 더 많이 도달하게

---

## 하지 말아야 할 것

- 결과 없이 모든 수정을 동시에 적용 (원인 파악 불가)
- label_smoothing, 가중치, cascade 로직을 한꺼번에 바꾸고 재학습 (비용 낭비 + 디버깅 불가)
- threshold를 0.15처럼 극단적으로 낮추기 (다른 클래스 F1 붕괴 위험)
- 전체 재학습 (시간·비용 모두 부담)

---

## 다음 액션

- [ ] evaluate_deep.py 결과 확인
- [ ] 시나리오 판단 후 최소 수정 적용
- [ ] 수정 후 evaluate.py 재실행으로 검증
