# ML Real Class 문제 해결 과정
> 작성일: 2026-03-22

## 1. 문제 발견

### 초기 성능 (sagemaker_result2.csv 기준)
| 클래스 | Precision | Recall | F1 |
|--------|-----------|--------|----|
| Real | 0.4622 | 0.2429 | 0.3184 |
| 전체 Macro F1 | - | - | 0.8561 |

- 30개 AI 클래스는 대부분 F1 0.87~0.99
- Real 하나만 0.32로 전체 성능을 끌어내리고 있음
- **목표: Real F1 0.90 → 전체 Macro F1 0.90 자동 달성**

---

## 2. 가설 수립

### 가설 A: XGBoost Cascade가 Real을 죽이고 있다
```
입력 영상
  → XGBoost (확신도 >= 0.75) → 예측 확정 (DL 모델 미사용)
  → XGBoost (확신도 < 0.75)  → VideoAgent로 넘김
```
XGBoost가 Real 영상을 다른 AI 클래스로 0.75 이상 확신하면 DL이 볼 기회 없음

### 가설 B: Threshold 조정으로 해결 가능
XGBoost의 Real 판정 threshold를 낮추면 recall 개선 가능

### 가설 C: DL 모델 자체가 Real을 못 잡음
모델이 Real의 시각적 특징을 학습하지 못한 경우

---

## 3. 진단 과정

### 3-1. evaluate_deep.py 작성
- XGBoost 단독 성능 측정
- Real 오분류 Top 10 추출
- Threshold 구간별 Real F1 계산
- DL 모델 없이 XGBoost만으로 진단 (OOM 방지)

### 3-2. 시행착오
| 시도 | 인스턴스 | 결과 | 원인 |
|------|----------|------|------|
| 1차 | ml.g5.2xlarge Spot | ResourceLimitExceeded | Spot 한도 0 |
| 2차 | ml.g4dn.xlarge | OOM (5600샘플) | XGBoost+DL 동시 로드 불가 |
| 3차 | ml.g4dn.xlarge | OOM (5600샘플) | 리스트 누적 메모리 누수 |
| 4차 | ml.g4dn.2xlarge Spot | 성공 | DL 제거, numpy 고정 배열 |

### 3-3. 진단 결과 (evaluate_deep.py)

#### XGBoost 단독 Macro F1: 0.6015
→ 실제 서비스 성능 0.8561은 DL이 0.60 → 0.85로 끌어올린 것

#### Real 오분류 분석 (296개 중)
| 오분류 대상 | 개수 | 비율 |
|------------|------|------|
| Real (정답) | 87 | 29.4% |
| OpenSource_V2V_Cogvideox1.5 | 44 | 14.9% |
| OpenSource_V2V_LTX | 43 | 14.5% |
| OpenSource_I2V_LTX | 26 | 8.8% |
| OpenSource_I2V_Pyramid-Flow | 22 | 7.4% |
| 기타 | 74 | 25.0% |

→ **Real의 70%가 V2V/I2V 계열로 오분류**
→ V2V는 실제 영상 기반으로 만들어서 Real과 시각적 특징이 겹침

#### Threshold 튜닝 결과
| Threshold | Precision | Recall | Real F1 |
|-----------|-----------|--------|---------|
| 0.05 | 0.229 | 0.743 | 0.350 |
| 0.10 | 0.310 | 0.588 | 0.406 |
| **0.20 (최적)** | **0.442** | **0.439** | **0.441** |
| 0.75 (현재) | 0.808 | 0.071 | 0.130 |

→ 최적 threshold 0.20 적용해도 Real F1 0.44 → **목표 0.90과 거리 멀음**

---

## 4. 결론: 시나리오 C

XGBoost도 DL도 둘 다 Real vs V2V 계열 구분 능력이 부족함.
Threshold 조정은 미봉책. **재학습 필요.**

---

## 5. 해결 계획 (Fine-tuning)

### 5-1. 샤드 인덱싱 (index_shards.py)
- Real, OpenSource_V2V_Cogvideox1.5, OpenSource_V2V_LTX 샤드 위치 파악
- 로컬 실행, 비용 $0.03, 소요 10~20분

### 5-2. train3.py 수정
- `target_shards.json` 기반으로 해당 샤드만 학습
- `label_smoothing` 0.1 → 0.0
- 기존 checkpoint에서 이어서 (처음부터 재학습 아님)

### 5-3. SageMaker Fine-tuning
- 전체 6999샤드 대신 타겟 샤드만
- 에폭 1~2번
- 예상 시간: 2~3시간, 예상 비용: $3~5

### 5-4. 검증
- evaluate.py 재실행
- 목표: Real F1 0.70+ (전체 Macro F1 0.90 달성)

---

## 6. 현재 상태
- [x] 문제 진단 완료
- [x] evaluate_deep.py 실행 완료
- [ ] index_shards.py 실행 중
- [ ] train3.py fine-tuning 수정
- [ ] SageMaker fine-tuning 실행
- [ ] 검증
