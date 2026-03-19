# PawFiler AI 생성 영상 탐지 시스템 — 엔지니어링 보고서

> **프로젝트**: PawFiler — AI 생성 영상 탐지 및 교육 플랫폼  
> **문서 버전**: v1.0  
> **작성일**: 2026-03-19  
> **대상 독자**: 엔지니어링 팀, 기술 이해관계자, 프로젝트 매니저

---

## 1. Executive Summary

PawFiler는 딥페이크 및 AI 생성 영상을 탐지하여 **"이 영상은 Sora로 만들어졌습니다 (87%)"** 와 같은 설명 가능한 판별 결과를 제공하는 교육 플랫폼이다. 단순한 real/fake 이진 분류가 아닌 **35개 클래스**(AI 모델 23종 + real/fake/audio_fake 등)를 식별하는 다중 분류 문제를 해결하며, 퀴즈 서비스 형태로 사용자에게 미디어 리터러시를 교육한다.

본 보고서는 데이터 수집부터 분산 학습, 멀티 에이전트 오케스트레이션, 인프라 설계까지의 전체 엔지니어링 여정을 종합 정리한다.

**프로젝트 핵심 수치:**

| 항목 | 값 |
|---|---|
| 총 학습 데이터 | ~492k 영상 (원본 10TB+) |
| 클래스 수 | 35개 (AI 모델 23종 포함) |
| 현재 최고 Validation F1 | 0.6573 (EfficientNet-B4, 50% 데이터, 4 epoch) |
| SLO 목표 F1 | ≥ 0.90 (macro) |
| 추론 지연시간 목표 | < 200ms |
| Cascade 비용 절감 추정 | ~69% (전체 요청의 ~80%를 GPU 없이 처리) |

**현재 상태:** Phase 2(Backbone 탐색) Step 2 완료. EfficientNet-B4가 선두 backbone으로 확정되었으며, Step 3(풀 학습)을 앞두고 있다.

---

## 2. 문제 정의 및 최적화 목표

### 2.1 문제 유형

지도학습 다중 분류(Supervised Multi-class Classification) 문제로 정의했다. 회귀(연속값 예측이 아님), 클러스터링(레이블 존재), 비지도(ground truth 있음) 방식은 모두 부적합하다.

### 2.2 최적화 우선순위

최적화 목표는 서비스 특성에 맞춰 세 단계로 설정했다.

1순위는 **Recall 최대화**다. AI 생성 영상을 real로 놓치는 것(False Negative)이 real을 fake로 오판하는 것(False Positive)보다 서비스 신뢰도에 치명적이기 때문이다.

2순위는 **F1-score (macro) ≥ 0.90**으로, 이는 자동화 가능 수준의 SLO/SLA 목표다. F1 0.75~0.85는 수동 확인 병행이 필요하고, 0.85~0.92가 자동화 가능 구간, 0.92 이상이 상용 서비스 수준이다.

3순위는 **Inference latency < 200ms**로, 실시간 퀴즈 서비스 응답성을 보장하기 위한 제약이다.

### 2.3 레이블 설계 결정

초기에는 real/fake 이진 분류를 검토했으나, 이 경우 "어떤 AI 모델로 생성되었는지"를 설명할 수 없어 퀴즈 서비스로서의 가치가 없다고 판단했다. AIGVDBench의 모델별 레이블(Sora, Gen2, HunyuanVideo 등 23종)을 살리는 35클래스 다중 분류를 채택했다. 복잡도는 높아지지만, "Sora로 만들어졌습니다 (87%)"라는 설명 가능한 출력이 서비스의 핵심 가치다.

---

## 3. 데이터셋 및 전처리 파이프라인

### 3.1 데이터셋 구성

| 데이터셋 | 레이블 | 규모 | 모달리티 | 용도 |
|---|---|---|---|---|
| AIGVDBench | AI 모델명 (Sora, Gen2 등 23종) | ~478k 영상 | 영상 | AI 모델 식별 (메인) |
| Celeb-DF | real / fake | ~6.5k 영상 | 영상 | 얼굴 합성 탐지 |
| WildDeepfake | real / fake | 실제 인터넷 수집 | 영상 | 실전 적응 (in-the-wild) |
| DFADD | 0(real) / 1(fake) | mel-spectrogram | 음성 | 음성 합성 탐지 |

클래스 불균형이 심각하다: AIGVDBench 478k 대비 Celeb-DF 6.5k. 이를 FocalLoss + Label Smoothing 0.1 + Stratified K-Fold로 대응한다.

### 3.2 전처리 파이프라인

원본 데이터셋 총 용량이 10TB 이상이었으므로 로컬 처리는 불가능했다. S3에 원본을 보관하고, EC2(g4dn.xlarge)에서 스트리밍 방식으로 처리하는 전략을 채택했다.

**전처리 흐름:**

```
S3 원본 (zip/mp4)
  → EC2 전처리 인스턴스 (g4dn.xlarge, Terraform 관리)
  → 프레임 추출 (최대 16프레임, 224×224 리사이즈)
  → .npz 저장 (frames + label)
  → S3 preprocessed/ 업로드
  → WebDataset 샤드 (.tar) 패키징
  → S3 webdataset/ 업로드
```

병렬 처리 방식 선정 시 세 가지를 비교했다. 단일 프로세스는 속도 부족, 멀티스레딩은 GIL + OpenCV 스레드 경합으로 오히려 느려지는 문제가 있었다. 최종적으로 ProcessPoolExecutor 기반 멀티프로세싱을 채택하되, 각 워커에서 `cv2.setNumThreads(0)`으로 OpenCV 내부 스레드 수를 제한하여 CPU 경합을 방지했다.

### 3.3 WebDataset 패키징

전처리된 .npz 파일들을 학습 효율을 위해 WebDataset 형식(.tar 샤드)으로 패키징했다. 총 6,999개 샤드로 구성되며, train은 `dataset_00000.tar` ~ `dataset_06500.tar` (6,501개), val은 `dataset_06501.tar` ~ `dataset_06998.tar` (498개)로 분할했다. 이 형식은 S3에서의 순차 스트리밍에 최적화되어 있다.

---

## 4. 모델 아키텍처

### 4.1 Cascade 파이프라인 — 비용 효율 설계

모든 요청에 GPU 기반 딥러닝 추론을 적용하면 비용이 과다하다. 전체 요청의 약 80%는 "쉬운" 케이스로, XGBoost 경량 모델만으로 충분히 판별 가능하다는 관찰에 기반하여 2단계 Cascade 구조를 설계했다.

```
입력 영상
    │
    ▼
[1단계] XGBoost (hand-crafted features, CPU)
    ├── confidence ≥ 0.85 → 즉시 반환 (~80% 케이스, GPU 미사용)
    └── confidence < 0.85 → 2단계로 전달 (~20%)
         │
         ▼
[2단계] VideoAgent (Backbone + LSTM, GPU)
         └── 최종 35클래스 분류
```

이 구조의 핵심은 XGBoost만으로 종결되는 요청이 GPU를 전혀 사용하지 않는다는 점이다. 비용 약 69% 절감을 추정하며, 1단계의 응답 지연은 50ms 미만이다.

### 4.2 Hand-crafted Features (XGBoost 입력)

XGBoost 1단계에 투입되는 피처는 공간 피처와 시간 피처로 나뉜다.

공간 피처(per-frame)로는 Laplacian variance(고주파 성분 — GAN 생성 영상은 고주파가 약함), DCT 저주파 비율(JPEG 압축 아티팩트 탐지), RGB 채널별 mean/std(GAN 특유의 색상 분포)가 있다. 시간 피처(inter-frame)로는 프레임 간 픽셀 차이의 mean과 std를 사용하여 시간적 일관성을 측정한다.

### 4.3 VideoAgent — 딥러닝 핵심 모듈

2단계 딥러닝 모델의 아키텍처는 Backbone(프레임별 특징 추출) → LSTM(시간축 시퀀스 모델링) → Classification Head(35클래스 분류)로 구성된다.

```python
class VideoAgent(nn.Module):
    def __init__(self, backbone_name):
        self.backbone = create_model(backbone_name, pretrained=True, num_classes=0)
        self.lstm = nn.LSTM(self.backbone.num_features, 256, batch_first=True)
        self.head = nn.Linear(256, NUM_CLASSES)  # 35클래스

    def forward(self, x):  # x: (B, T, C, H, W)
        feats = self.backbone(x.view(B*T, C, H, W)).view(B, T, -1)
        _, (h, _) = self.lstm(feats)
        return self.head(h.squeeze(0))
```

입력은 (Batch, Time, Channel, Height, Width) 형태의 텐서이며, backbone이 각 프레임에서 특징 벡터를 추출한 뒤 LSTM이 시간 축을 따라 시퀀스를 모델링한다.

### 4.4 AudioAgent

Wav2Vec2 backbone에서 768차원 특징 벡터를 추출하고, HMM(Hidden Markov Model)으로 음성 패턴 시퀀스를 모델링한다. MFCC, Mel-spectrogram, 스펙트럼 평탄도(TTS는 지나치게 균일), 포만트 전이 자연스러움을 피처로 사용하며, real/synthetic + 음성 모델명(ElevenLabs 등)을 출력한다.

### 4.5 SyncAgent

SyncNet 기반으로 비디오와 오디오 간 립싱크 일치도를 0~1 스케일로 산출한다. 립싱크 불일치는 딥페이크의 강력한 단서가 된다.

### 4.6 FusionAgent — Late Fusion

각 에이전트의 독립적 판단을 가중 앙상블로 통합한다. 현재는 video 0.7, audio 0.3의 가중 평균을 사용하며, 최종 판단은 하나라도 fake이면 fake로 판정하는 보수적 전략을 적용한다. 립싱크 불일치의 경우 sync confidence가 0.7 이상일 때만 fake 판정에 반영한다. Cross-attention 기반 Fusion은 Phase 4에서 추가 예정이다.

### 4.7 Loss 함수 설계

클래스 불균형에 대응하기 위해 FocalLoss를 메인 Loss로 채택했다. 일반 CrossEntropy는 다수 클래스에 편향되지만, FocalLoss는 잘 분류된 쉬운 샘플의 가중치를 줄이고 어려운 샘플에 집중한다. Label Smoothing 0.1을 적용하여 과적합을 방지한다.

멀티모달 통합 시에는 Multi-task Loss를 사용한다: binary_loss(real/fake, 가중치 1.0) + ai_model_loss(23개 AI 모델, 0.5) + manipulation_loss(조작 유형, 0.3) + audio_loss(음성 합성, 0.7). real/fake 이진 판별이 최우선 과제이므로 가중치가 가장 높다.

---

## 5. 멀티 에이전트 오케스트레이션 아키텍처

### 5.1 아키텍처 개요

```
Request (HTTP)
   │
   ▼
Orchestrator (HTTP Ingress, replicas=2)
   │
   ├─ [Cascade Path] XGBoostGate (CPU, replicas=2)
   │       └── confidence ≥ 0.85 → 즉시 반환 (~80% 요청)
   │
   └─ [Deep Path] Fan-out (asyncio.gather)
           │
           ├── VideoAgent (CPU, replicas=2)
           │       └── video_inference.remote() ──┐
           │                                       │
           ├── AudioAgent (CPU, replicas=2)        ├──→ SharedModelWorker
           │       └── audio_inference.remote() ──┤    (GPU 싱글톤, replicas=1)
           │                                       │
           └── SyncAgent (CPU, replicas=1)         │
                   └── sync_inference.remote()  ───┘
           │
           └── Fan-in: FusionAgent (CPU, replicas=1)
                   └── 최종 응답 반환
```

### 5.2 에이전트 서빙 방식 결정

두 가지 방식을 비교했다.

**통합 에이전트(Omni-Agent) 방식**은 속도는 최고지만 유연성이 낮고, 특정 모달리티의 모델만 교체하는 것이 불가능하다. **논리적 에이전트 래핑(마이크로서비스) 방식**은 각 에이전트가 독립적으로 동작하며, 나중에 특정 모달리티만 새 모델로 교체할 때 해당 에이전트의 연결선만 교체하면 된다.

논리적 에이전트 래핑을 채택했다. 속도 저하 우려는 Ray의 Zero-Copy Plasma Store로 상쇄한다.

### 5.3 Ray Serve DAG 구현 세부

**레이어 구성:**

| Layer | 컴포넌트 | replicas | GPU | 역할 |
|---|---|---|---|---|
| 3 (Ingress) | Orchestrator | 2 | 0 | HTTP 라우팅 + DAG 제어 |
| 2 (Gate) | XGBoostGate | 2 | 0 | Cascade 1단계 CPU 필터 |
| 2 (Agent) | VideoAgent | 2 | 0 | 전처리/후처리 (CPU) + GPU 위임 |
| 2 (Agent) | AudioAgent | 2 | 0 | MFCC/Mel 추출 (CPU) + GPU 위임 |
| 2 (Agent) | SyncAgent | 1 | 0 | 립싱크 분석 (CPU) + GPU 위임 |
| 2 (Agent) | FusionAgent | 1 | 0 | Late Fusion + 설명 생성 |
| 1 (Worker) | SharedModelWorker | 1 (싱글톤) | 1 | 모델 VRAM 로드 + 추론 실행 |

### 5.4 핵심 설계 포인트

**Zero-Copy Plasma Store:** 영상 프레임과 오디오 데이터를 `ray.put()`으로 Plasma Store에 한 번만 올리고, 각 에이전트에는 `ObjectRef`(메모리 주소)만 전달한다. 에이전트 3개가 동일 데이터를 참조하더라도 실제 메모리 복사는 0회다. 이것이 마이크로서비스 방식의 속도 저하를 상쇄하는 핵심 메커니즘이다.

```python
frames_ref = ray.put(preprocessed["frames"])  # Plasma에 1회 저장
audio_ref  = ray.put(preprocessed["audio"])

# 에이전트들은 주소(ref)만 받음 — 데이터 복사 없음
tasks["video"] = self.video.predict.remote(frames_ref)
tasks["audio"] = self.audio.predict.remote(audio_ref)
tasks["sync"]  = self.sync.predict.remote(frames_ref, audio_ref)
```

**GPU 싱글톤 패턴:** `SharedModelWorker`는 `num_replicas=1`, `num_gpus=1`로 고정한다. 모든 에이전트는 `num_gpus=0`으로 CPU만 사용하며, GPU 연산이 필요한 부분만 `.remote()` 호출로 SharedModelWorker에 위임한다. 이로써 VRAM에 모델이 중복 로드되는 것을 원천 방지하고, 에이전트의 수평 확장(replicas 증가)이 GPU 리소스와 완전히 분리된다.

**Graceful Degradation:** `asyncio.gather(return_exceptions=True)`를 사용하여 특정 에이전트가 실패하더라도 나머지 에이전트의 결과로 Fusion을 진행한다. 실패한 에이전트에는 안전한 기본값(fallback)을 할당한다.

### 5.5 최종 응답 포맷

```json
{
  "verdict": "fake",
  "confidence": 0.94,
  "breakdown": {
    "video": { "is_fake": true, "ai_model": "Sora", "confidence": 0.87 },
    "audio": { "is_synthetic": true, "voice_model": "ElevenLabs", "confidence": 0.92 },
    "sync":  { "is_synced": false, "confidence": 0.73 }
  },
  "explanation": "영상: Sora로 생성됨 (87%) | 음성: ElevenLabs 합성 (92%) | 립싱크 불일치 (73%)",
  "meta": { "latency_ms": 143.5, "path": "deep" }
}
```

`meta.path`가 `"cascade"`이면 XGBoostGate에서 즉시 반환된 요청, `"deep"`이면 전체 에이전트 파이프라인을 거친 요청이다.

---

## 6. 학습 인프라 및 실험 여정

### 6.1 Phase 1 — EC2 단독 학습 (MobileViT Baseline)

EC2 g6.12xlarge(NVIDIA L4 × 4)에서 `pipe:s5cmd` 방식으로 S3 데이터를 스트리밍하며 MobileViTv2-100 baseline을 학습했다.

**데이터 로딩 병목 해결:** 초기 data_wait이 304초에 달했다. `num_workers`를 16에서 24로 늘리고, OMP 스레드 제한을 추가하여 CPU 경합을 제거했으며, `pipe:s5cmd`의 멀티 TCP 연결로 S3 병렬 다운로드를 활성화했다. 결과적으로 약 4분/200스텝으로 개선되었다.

**Baseline 결과 (epoch=3, step=94000):** Cascade 정확도 83.0%, F1(macro) 0.8149, 예측 클래스 수 35/35. Cascade가 정상 동작하며, XGBoost가 쉬운 케이스를, CNN이 경계 케이스를 처리하는 구조가 검증되었다.

**모델 용량 한계 분석:** MobileViTv2-100의 512차원 feature → LSTM 256차원 압축 → 35클래스 분류 구조에서, 256차원으로 Sora vs Gen3 vs LTX 같은 미세 차이를 구분하기에는 정보량이 부족하다. 하이퍼파라미터 튜닝으로 F1 +0.03~0.05는 가능하지만, SLO 목표인 0.90 달성에는 backbone 교체가 필수라는 결론을 내렸다.

### 6.2 Phase 2 — SageMaker 병렬 Backbone 탐색

3개 backbone을 순차 실험하면 시간이 과다하므로, SageMaker로 전환하여 병렬 실험을 진행했다.

**EC2 → SageMaker 전환 이유:**

| 항목 | EC2 단독 | SageMaker |
|---|---|---|
| 병렬 실험 | 순차만 가능 | 3개 job 동시 실행 |
| 스팟 중단 대응 | 수동 체크포인트 | Managed Spot (자동) |
| 데이터 접근 | pipe:s5cmd 스트리밍 | FastFile FUSE 마운트 |
| 인스턴스 관리 | 직접 관리 | 완전 관리형 |

**SageMaker 전환 시 해결한 문제들:**

1. **source_dir 경로 오류:** Windows WSL 경로 하드코딩을 Linux 네이티브 경로로 수정
2. **sagemaker 3.x 패키지 구조 변경:** `sagemaker.pytorch` 모듈 미존재 → sagemaker 2.x로 다운그레이드
3. **로컬 환경 region 미인식:** EC2 메타데이터 서버 접근 실패 → boto3 Session에 region 명시
4. **torch.amp API 호환:** SageMaker DLC의 PyTorch 버전이 `torch.amp.GradScaler` 미지원 → `torch.cuda.amp.GradScaler`로 하위 호환 API 사용

**가장 오래 걸린 문제 — data_wait 361초:**

SageMaker 전환 후 data_wait이 361초까지 치솟았다. 여러 시도를 거쳤다.

- 시도 1: EC2에서 사용하던 `pipe:s5cmd` 방식 유지 → data_wait 204초, 불충분
- 시도 2: VPC Gateway Endpoint 추가 → 효과 없음(오히려 악화, 가설 기각)
- 시도 3: SageMaker 네이티브 FastFile 모드 전환 → data_wait 361초, 더 악화

근본 원인은 EC2용 `train.py`에는 있었지만 SageMaker용 `train3.py`에 누락된 **CPU 스레드 제한**이었다. 24 workers × numpy/scipy 기본 스레드 수 = 수백 개 스레드가 48코어를 경합하며 CPU context switching 지옥이 발생, 전처리가 마비되었다.

```python
os.environ["OMP_NUM_THREADS"] = "1"
os.environ["MKL_NUM_THREADS"] = "1"
os.environ["OPENBLAS_NUM_THREADS"] = "1"
os.environ["VECLIB_MAXIMUM_THREADS"] = "1"
os.environ["NUMEXPR_NUM_THREADS"] = "1"
```

이 5줄 추가 후 data_wait이 32초로 떨어졌고, 200스텝 처리 시간이 2분 17초로 EC2 대비 약 2배 향상되었다. (참고: data_wait=32초는 50스텝 전체 구간의 벽시계 시간이며, 스텝당 실제 대기는 0.64초로 정상 범위다.)

### 6.3 Step 1 결과 — 스모크 테스트 (10% 데이터, 1 epoch)

3개 backbone을 병렬 실행한 결과:

| 순위 | Backbone | 배치 | 스텝 | 학습 Acc | Loss | Val F1 |
|---|---|---|---|---|---|---|
| 1위 | MobileViTv2-100 | 64 | 800 | 37.43% | 9.73 | **0.6457** |
| 2위 | EfficientNet-B4 | 32 | 1400 | 37.67% | 27.07 | 0.5653 |
| 3위 | ViT-Base-Patch16-224 | 32 | 1400 | 11.87% | 10.10 | 0.5329 |

MobileViTv2-100이 F1 0.6457로 1위였으나, 이는 1 epoch이라는 매우 짧은 학습에서의 스냅샷일 뿐이다. EfficientNet-B4의 Loss 27은 FocalLoss 특성상 초반에 크게 나오는 것으로 정상 범위이며, ViT의 낮은 Acc는 Transformer 특성상 워밍업 구간이 긴 것으로 해석했다. 최종 판단은 Step 2로 보류했다.

### 6.4 Step 2 결과 — 미니 벤치마크 (50% 데이터, 5 epoch 목표)

| 순위 | Backbone | 에포크 | 학습 Acc | Loss | Val F1 | 판정 |
|---|---|---|---|---|---|---|
| 1위 | EfficientNet-B4 | 4 | 92.01% | 17.49 | **0.6573** | 쾌속 성장, 우상향 |
| 2위 | ViT-Base-Patch16-224 | 4 | 10.72% | 3.59 | 0.4976 | 과소적합, 탈락 |
| - | MobileViTv2-100 | - | - | - | - | 결과 미수신 |

**핵심 발견:**

EfficientNet-B4가 Step 1에서 2위였지만, epoch이 쌓이면서 CNN 계열의 안정적인 수렴 특성이 드러나 1위로 역전했다. 학습 Accuracy가 84% → 87% → 88% → 90% → 92%로 꾸준히 우상향하며, Validation F1도 Epoch 3의 0.6267에서 Epoch 4의 0.6573으로 개선 중이다.

반면 ViT-Base-Patch16-224는 4 epoch에서도 Acc 10.72%에 정체하며 과소적합이 확정되었다. 35클래스 다중 분류 + 제한된 데이터(50%) 환경에서 Transformer의 데이터 헝거리 특성이 치명적으로 작용했다.

**결론: EfficientNet-B4를 Step 3(풀 학습) 후보 1순위로 확정.**

### 6.5 F1 Score 0.0000 디버깅 — 학습 초기 장애 보고

학습 초기에 F1 Score가 0.0000으로 나오는 치명적 문제가 발생했다. 세 가지 근본 원인을 발견했다.

**데이터 편향(Skew):** 10TB 데이터가 셔플 없이 순서대로 압축되어, 검증용 뒷부분 샤드에 `audio_fake` 클래스만 100% 몰려 있었다. 해결을 위해 전체 샤드에서 10개 간격으로 하나씩 추출하여 모든 클래스가 골고루 섞인 축소판(10% 균등 추출 벤치마크)을 만들었다.

**검증 루프 로직 누락:** 훈련 시에는 XGBoost Cascade로 쉬운 케이스를 걸러냈지만, 검증 시에는 이 로직이 적용되지 않아 평가 방식이 불일치했다. `train3.py` 검증 루프에 Cascade 로직을 추가하여 해결했다.

**체급 불일치:** 무거운 EfficientNet-B4에 가벼운 모델용 배치 사이즈(64)를 그대로 적용하여 NCCL Error(OOM)가 발생했다. 배치 사이즈를 64 → 32로 조정하여 해결했다.

---

## 7. 인프라 및 서빙 아키텍처

### 7.1 학습 환경

```
로컬 (Ubuntu)
  └── parallel_launch.py → SageMaker API 호출

SageMaker Training Job (ml.g6.12xlarge, NVIDIA L4 × 4)
  ├── train3.py (entry point)
  ├── FastFile: s3://ai-preprocessing/webdataset/ → /opt/ml/input/data/train/
  ├── Output: s3://ai-preprocessing/sagemaker/models/
  └── Checkpoint: s3://ai-preprocessing/sagemaker/checkpoints/
```

### 7.2 서빙 환경 — BYOC 독립 추론

초기 설계는 EKS(오케스트레이터)와 SageMaker Endpoint(GPU 추론)를 분리하는 구조였으나, 무거운 영상 데이터의 네트워크 전송으로 200ms 달성이 불가능했다.

**SageMaker 풀스택 방식**은 비용이 비싸고, SageMaker Endpoint 호출에 따른 네트워크 지연이 불가피하며, AWS에 종속된다. **BYOC(Bring Your Own Container) 방식**은 오케스트레이터와 모델을 같은 컨테이너/파드에 배치하여 네트워크 지연을 소멸시키고, Docker만 있으면 AWS/GCP/온프레미스 어디서든 동작한다.

BYOC를 채택했다. SageMaker는 학습용 GPU로만 사용하고, 추론은 오픈소스(Ray Serve) 기반으로 독립시켰다.

**BYOC 전환 후 해결한 부수 문제들:**

| 문제 | 해결 도구 | 효과 |
|---|---|---|
| 15GB 모델 가중치로 인한 컨테이너 비대화 (Cold Start 10분) | EFS 마운트 | Cold Start 10분 → 30초 |
| SageMaker가 해주던 모델 버전 관리 부재 | MLflow | 실험 추적 + 모델 레지스트리 |
| 실시간 모니터링 부재 | Prometheus + Grafana | 레이턴시/GPU 모니터링 |

데이터 드리프트 감지, 섀도우 테스트 등 고급 기능은 YAGNI 원칙에 따라 프로덕션 트래픽이 쌓인 이후로 미뤘다.

### 7.3 서빙 인프라 흐름

```
CloudFront → ALB → Envoy → Video Analysis Service
                               │
                               ├── [경량] EKS Pod (XGBoost Cascade 1단계)
                               │    └── 응답 < 50ms
                               └── [중량] Ray Serve (BYOC, GPU)
                                    └── 멀티 에이전트 오케스트레이션
                                         └── 응답 < 200ms
```

---

## 8. 벡터 DB 통합 전략

학습 단계에서는 S3 + .npz로 충분하며, 벡터 DB는 서빙 단계에서 세 가지 용도로 활용한다.

**AI 모델 시그니처 검색:** 분석된 영상의 임베딩을 과거 AI 모델 시그니처 DB와 비교하여 "과거 분석된 Sora 케이스와 92% 유사합니다"와 같은 유사 케이스 검색을 제공한다. `signature_embedding vector(512)` 컬럼에 코사인 유사도 기반 검색을 수행한다.

**멀티모달 임베딩 캐시:** 이전에 분석한 영상의 video_embedding(512차원), audio_embedding(768차원), fused_embedding(256차원)을 캐시하여 동일 영상 재분석을 방지한다.

**분석 메모리(RAG):** 과거 분석 결과를 query_embedding(1536차원)으로 인덱싱하여, 유사한 분석 요청에 대한 참고 자료로 활용한다.

---

## 9. MLOps 및 운영 계획

### 9.1 모델 수명 주기

```
데이터 수집 → 전처리 → 피처 엔지니어링 → 학습 → 평가
     ↑                                              │
     └───── 재학습 트리거 ←── 모니터링 ←── 배포 ←──┘
```

재학습 트리거 조건은 세 가지다: F1 < 0.85로 하락 시, 새 딥페이크 기술 등장으로 데이터 드리프트 감지 시, 주기적 월 1회 재학습.

### 9.2 디버깅 도구

SHAP(TreeExplainer)으로 XGBoost 피처 중요도를 해석하고, Confusion Matrix로 어떤 AI 모델 쌍(Sora vs Gen2 등)을 혼동하는지 패턴을 파악한다. 학습 곡선(train/val 격차)으로 과적합/과소적합을 진단하며, 격차가 크면 정규화 강화, 둘 다 낮으면 모델 복잡도를 증가시킨다.

### 9.3 SageMaker 파이프라인

```python
pipeline = Pipeline(
    name="pawfiler-ai-detection",
    steps=[
        ProcessingStep(name="feature-engineering"),
        TrainingStep(name="train-xgboost"),   # Cascade 1단계
        TrainingStep(name="train-backbone"),   # VideoAgent backbone
    ]
)
```

---

## 10. 아키텍처 의사결정 총정리

프로젝트 전체에 걸쳐 일관된 **"문제 → 해결책 → 트레이드오프 및 최종 선택"** 프레임워크로 의사결정을 수행했다. 주요 결정을 아래에 요약한다.

| # | 결정 사항 | 비교 옵션 | 최종 선택 | 핵심 근거 |
|---|---|---|---|---|
| 1 | 분류 방식 | 이진(real/fake) vs 다중(35클래스) | **35클래스 다중 분류** | 퀴즈 서비스 특성상 "어떤 AI인지" 설명 필요 |
| 2 | 추론 구조 | 단일 CNN vs Cascade | **Cascade (XGBoost → CNN+LSTM)** | 비용 ~69% 절감, 80%를 GPU 없이 처리 |
| 3 | 에이전트 서빙 | 통합 에이전트 vs 논리적 래핑 | **논리적 에이전트 래핑 (Ray Serve)** | 확장성 + Ray Plasma Store로 속도 저하 상쇄 |
| 4 | 서빙 인프라 | SageMaker 풀스택 vs BYOC | **BYOC (Docker + Ray Serve)** | 네트워크 지연 소멸 + 클라우드 비종속 |
| 5 | 학습 인프라 | EC2 단독 vs SageMaker | **SageMaker (학습 전용)** | 병렬 실험 + Managed Spot + FastFile |
| 6 | 데이터 포맷 | 개별 파일 vs WebDataset | **WebDataset (.tar 샤드)** | 대용량 S3 스트리밍 최적화 |
| 7 | Loss 함수 | CrossEntropy vs FocalLoss | **FocalLoss + Label Smoothing 0.1** | 클래스 불균형 대응 + 과적합 방지 |
| 8 | Backbone | MobileViT vs EfficientNet vs ViT | **EfficientNet-B4 (확정)** | Step 2에서 F1 0.6573, 안정적 수렴 |
| 9 | 전처리 병렬화 | 단일/멀티스레드/멀티프로세스 | **ProcessPoolExecutor** | GIL 회피 + cv2 스레드 경합 방지 |
| 10 | Cold Start 해결 | 이미지 내장 vs 외부 마운트 | **EFS 마운트** | 15GB 모델 분리, 10분 → 30초 |

---

## 11. 로드맵 및 다음 단계

### 11.1 학습 로드맵

| 단계 | 데이터 | 목표 | 상태 |
|---|---|---|---|
| Phase 1 | Celeb-DF + WildDeepfake | Real/Fake 이진 분류 베이스라인 | 예정 |
| Phase 2 | AIGVDBench | 35클래스 AI 모델 식별 | **진행 중** (Step 2 완료) |
| Phase 3 | DFADD | Audio Agent (Wav2Vec2 + HMM) | 예정 |
| Phase 4 | 전체 | Fusion Agent + 오케스트레이터 통합 | 예정 |

### 11.2 즉시 실행 항목

Step 3(풀 학습)을 EfficientNet-B4로 실행한다. 100% 데이터, 10+ epoch, SageMaker Managed Spot으로 비용을 최적화하며, F1 ≥ 0.90 SLO 달성 여부를 확인한다.

### 11.3 중기 목표

Audio Agent 학습(Phase 3), Fusion Agent 통합(Phase 4), Ray Serve 기반 멀티 에이전트 서빙 파이프라인 구축, MLflow + Prometheus/Grafana 모니터링 인프라 구축을 진행한다.

### 11.4 장기 목표

Cross-attention 기반 Fusion 고도화, 벡터 DB 기반 유사 케이스 검색 서빙, 데이터 드리프트 자동 감지 및 재학습 자동화, CI/CD 파이프라인 통합(A/B 테스트 → Canary 배포 → 자동 Rollback)을 목표로 한다.

---

## 부록 A. 피처 엔지니어링 상세

### A.1 영상 공간 피처 (per-frame)

| 피처 | 산출 방법 | 탐지 근거 |
|---|---|---|
| Laplacian variance | `convolve(gray, lap_kernel).var()` | GAN 생성 영상은 고주파 성분이 약함 |
| DCT 저주파 비율 | `(dct[:8,:8]**2).sum() / total` | JPEG 압축 아티팩트 탐지 |
| RGB 채널 통계 | 채널별 mean, std (6개 값) | GAN 특유의 색상 분포 |
| 얼굴 랜드마크 일관성 | 프레임 간 랜드마크 변화량 | 딥페이크의 비정상적 얼굴 변형 |

### A.2 영상 시간 피처 (inter-frame)

| 피처 | 산출 방법 | 탐지 근거 |
|---|---|---|
| 프레임 간 변화량 | `np.diff(feats, axis=0)`의 mean, std | 프레임 연속성 자연스러움 |
| 광학 흐름 불연속성 | Optical Flow 분석 | 딥페이크의 비자연적 움직임 |
| 눈 깜빡임 패턴 | 랜드마크 기반 분석 | 딥페이크는 비정상적 패턴 |

### A.3 음성 피처

| 피처 | 산출 방법 | 탐지 근거 |
|---|---|---|
| Mel-spectrogram 통계 | 대역별 mean, std | TTS는 너무 균일 |
| MFCC 계수 | 13~40개 | 음성 스펙트럼 특성 |
| 스펙트럼 평탄도 | Spectral Flatness | TTS 특유의 과도한 균일성 |
| 포만트 전이 | 포만트 주파수 변화 | 자연 음성 특유의 전이 패턴 |

---

## 부록 B. 알고리즘 비교 매트릭스

| 알고리즘 | 정확도 | 속도 | 해석가능성 | 딥페이크 적합성 | 프로젝트 내 역할 |
|---|---|---|---|---|---|
| 로지스틱 회귀 | 낮음 | 매우 빠름 | 높음 | 비선형 패턴 부적합 | 베이스라인 비교용 |
| Random Forest | 높음 | 중간 | 중간 | 앙상블 강건성 | 영상 보조 |
| XGBoost | 매우 높음 | 중간 | 중간 | 피처 중요도 해석 | **Cascade 1단계** |
| CNN (EfficientNet) | 최고 | GPU 필요 | 낮음 | 공간 패턴 탐지 | **VideoAgent 메인** |
| HMM | 중간 | 빠름 | 중간 | 시계열 패턴 | **AudioAgent 메인** |
| GMM | 중간 | 빠름 | 중간 | 이상치 탐지 | 보조 모델 |
| PCA | - | 빠름 | 중간 | 차원 축소 | 전처리 |
| SVM (RBF) | 높음 | 느림 | 낮음 | 고차원에서 비효율 | 미채택 |

---

*본 보고서는 ML_AI_ORCHESTRATION.md, ML_DAG_ORCHESTRATION.md, ML_JOURNEY.md, ML_PIPELINE_DESIGN.md 4개 기술 문서를 종합하여 작성되었다.*
