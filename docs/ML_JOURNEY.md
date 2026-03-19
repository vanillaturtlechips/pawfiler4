# PawFiler ML 파이프라인 구축 여정

> AI 생성 영상 탐지 모델을 만들기까지 — 데이터 수집부터 SageMaker 분산 학습까지

---

## 배경: 무엇을 만들려 했나

PawFiler는 AI 생성 영상을 탐지하고 퀴즈로 제공하는 교육 플랫폼이다.
핵심 기능은 **"이 영상이 어떤 AI 모델로 만들어졌는지"** 를 맞추는 것.

단순한 real/fake 이진 분류가 아니라, Sora·Gen2·HunyuanVideo 등 **35개 클래스**를 구별하는 다중 분류 문제였다.

**최적화 목표:**
- 1순위: Recall 최대화 (딥페이크를 real로 놓치는 게 더 위험)
- 2순위: F1-score (macro)
- 3순위: Inference latency < 200ms (실시간 퀴즈 서비스)

---

## Phase 0: 데이터 수집 및 정의

### 사용 데이터셋

| 데이터셋 | 레이블 | 규모 |
|---|---|---|
| AIGVDBench | AI 모델명 (Sora, Gen2 등 23종) | ~478k 영상 |
| Celeb-DF | real / fake | ~6.5k 영상 |
| WildDeepfake | real / fake | 실제 인터넷 수집 |
| DFADD | 0(real) / 1(fake) | 음성 mel-spectrogram |

### 레이블 설계 결정

초기에는 `real/fake` 이진 분류로 시작했으나, AIGVDBench의 모델별 레이블을 살리는 방향으로 전환했다.

**트레이드오프:**
- 이진 분류: 단순하지만 "어떤 AI인지" 설명 불가 → 퀴즈 서비스 가치 없음
- 다중 분류: 복잡하지만 "Sora로 만들어졌습니다 (87%)" 설명 가능 → 채택

최종 클래스 수: **35개** (AI 모델 23종 + real/fake/audio_fake 등)

---

## Phase 1: 전처리 파이프라인 구축

### 문제: 478k 영상을 어떻게 처리할 것인가

원본 데이터셋 총 용량은 **10TB 이상**이었다. 로컬 처리는 불가능했고, 전체를 EC2에 내려받는 것도 시간·비용 면에서 비현실적이었다.

**대용량 처리 전략:**
- S3에 원본 보관, EC2에서 스트리밍 방식으로 처리
- 멀티프로세싱으로 병렬 전처리 (ProcessPoolExecutor)
- 전처리 결과를 `.npz`로 압축해 저장 → 원본 대비 용량 대폭 절감
- 최종 WebDataset 샤드(`.tar`) 형태로 재패키징 → 학습 시 순차 스트리밍 가능

```
S3 원본 (zip/mp4)
    → EC2 전처리 인스턴스 (g4dn.xlarge)
    → 프레임 추출 (최대 16프레임, 224×224)
    → .npz 저장 (frames + label)
    → S3 preprocessed/ 업로드
```

**핵심 코드 (`preprocess_remaining.py`):**
```python
def extract_frames(video_path):
    cv2.setNumThreads(0)  # 멀티프로세싱 환경에서 OpenCV 스레드 경합 방지
    cap = cv2.VideoCapture(video_path)
    frames = []
    while cap.isOpened():
        ret, frame = cap.read()
        if not ret:
            break
        frames.append(cv2.resize(frame, (224, 224)))
    cap.release()
    return np.array(frames) if frames else None
```

**결정: ProcessPoolExecutor로 병렬 처리**
- 단일 프로세스: 너무 느림
- 멀티스레딩: GIL + OpenCV 스레드 경합으로 오히려 느려짐
- 멀티프로세싱: 채택. `cv2.setNumThreads(0)`으로 각 워커의 OpenCV 스레드 수 제한

### WebDataset 패키징

전처리된 `.npz` 파일들을 학습에 효율적으로 쓰기 위해 WebDataset 형식(`.tar` 샤드)으로 패키징했다.

```
S3 preprocessed/*.npz
    → package_webdataset.py
    → S3 webdataset/dataset_00000.tar ~ dataset_06998.tar
```

**샤드 구성:**
- train: `dataset_00000.tar` ~ `dataset_06500.tar` (6,501개)
- val: `dataset_06501.tar` ~ `dataset_06998.tar` (498개)

---

## Phase 2: 피처 엔지니어링 및 모델 설계

### Cascade 파이프라인 설계

단일 딥러닝 모델로 모든 케이스를 처리하면 비용이 크다.
80%의 "쉬운" 케이스는 경량 모델로 처리하고, 나머지만 딥러닝으로 넘기는 구조를 설계했다.

```
입력 영상
    │
    ▼
[1단계] XGBoost (hand-crafted features)
    ├── 확신도 ≥ threshold → 즉시 반환 (비용 절감)
    └── 불확실 → 2단계
         │
         ▼
    [2단계] VideoAgent (Backbone + LSTM)
         └── 최종 분류
```

**트레이드오프:**
- XGBoost만: 빠르지만 정확도 한계
- CNN만: 정확하지만 모든 케이스에 GPU 사용 → 비용 과다
- Cascade: 비용 ~69% 절감 추정, 정확도 유지 → 채택

### Hand-crafted Features (XGBoost 입력)

```python
def extract_features(frames):
    # 공간 피처 (per-frame)
    lap_var    = convolve(gray, lap_kernel).var()   # 고주파 성분 (GAN은 약함)
    dct_ratio  = (dct[:8,:8]**2).sum() / ...        # DCT 저주파 비율
    ch_stats   = [mean, std per channel]            # 색상 통계

    # 시간 피처 (inter-frame)
    diff       = np.diff(feats, axis=0)
    temporal   = [diff.mean(0), diff.std(0)]        # 프레임 간 변화량
```

### VideoAgent 아키텍처

```python
class VideoAgent(nn.Module):
    def __init__(self, backbone_name):
        self.backbone = create_model(backbone_name, pretrained=True, num_classes=0)
        self.lstm = nn.LSTM(self.backbone.num_features, 256, batch_first=True)
        self.head = nn.Linear(256, NUM_CLASSES)

    def forward(self, x):  # x: (B, T, C, H, W)
        feats = self.backbone(x.view(B*T, C, H, W)).view(B, T, -1)
        _, (h, _) = self.lstm(feats)
        return self.head(h.squeeze(0))
```

**Backbone 후보 3종 비교 실험:**

| Backbone | 파라미터 | 특징 |
|---|---|---|
| MobileViTv2-100 | 경량 | 모바일 최적화, 빠름 |
| EfficientNet-B4 | 중간 | CNN 계열, 안정적 |
| ViT-Base-Patch16-224 | 중량 | Transformer, 워밍업 필요 |

ViT는 에포크 초반 성능이 낮지만 상승 기울기가 가파를 것으로 예상 → 5에포크 이상 돌려야 진짜 성능 확인 가능.

### Loss 설계

```python
class FocalLoss(nn.Module):
    """클래스 불균형 대응 (AIGVDBench 478k >> Celeb-DF 6.5k)"""
    def forward(self, logits, targets):
        ce = F.cross_entropy(logits, targets, reduction='none',
                             label_smoothing=0.1)
        pt = torch.exp(-ce)
        return ((1 - pt) ** self.gamma * ce).mean()
```

**결정 근거:**
- CrossEntropy만: 다수 클래스에 편향
- FocalLoss: 어려운 샘플에 더 집중 → 소수 클래스 성능 향상
- Label smoothing 0.1: 과적합 방지

---

## Phase 3: EC2 단독 학습 (MobileViT baseline)

### 환경

EC2 g6.12xlarge (NVIDIA L4 × 4)에서 `pipe:s5cmd` 방식으로 학습.

```python
TRAIN_URL = 'pipe:s5cmd cat s3://ai-preprocessing/webdataset/dataset_{00000..06500}.tar'
```

### 초기 문제: data_wait 300초

```
[TIMING] step=50  data_wait=304s  gpu=0.48s
```

**원인 및 해결:**
- `num_workers` 16 → 24: 병렬 다운로드 효과로 개선
- OMP 스레드 제한 추가: CPU 경합 제거
- `pipe:s5cmd`: 멀티 TCP 연결로 S3 병렬 다운로드

**결과:** data_wait 300초 → 약 4분/200스텝으로 개선

### 학습 결과 (epoch=3, step=94000)

```
=== 캐스케이드 결과 ===
정확도: 415/500 = 83.0%
F1(macro): 0.8149
예측 클래스 수: 35/35
```

Cascade가 정상 동작 중. XGBoost가 쉬운 케이스를 처리하고 CNN이 경계 케이스를 담당.

### 모델 용량 한계 분석

현재 구조의 병목:

```python
self.backbone = create_model('mobilevitv2_100', ...)  # feature: 512차원
self.lstm = nn.LSTM(..., hidden_size=256)              # → 256차원으로 압축
self.head = nn.Linear(256, 35)                        # 35클래스 분류
```

35개 클래스(Sora vs Gen3 vs LTX 등 미세 차이)를 256차원으로 구분하는 건 정보량 한계.
하이퍼파라미터 튜닝으로 F1 +0.03~0.05 가능하지만 **0.92는 backbone 교체 없이 불가**.

**F1 임계값 기준 (목표 SLO: F1 ≥ 0.90):**
- 0.75~0.85: 1차 필터링 + 수동 확인 파이프라인 적합
- 0.85~0.92: 자동화 가능 수준
- **0.90 이상: 본 프로젝트 SLO/SLA 목표**
- 0.92+: 상용 서비스 수준 → backbone 교체 필요 (EfficientNet-B4 이상 또는 VideoMAE)

---

## Phase 4: SageMaker 병렬 backbone 탐색

### 전환 배경

EC2 단독 학습으로 MobileViT baseline(F1 0.81)을 확보했지만, **SLO/SLA 목표인 F1 0.90 이상** 달성을 위해 더 적합한 backbone을 찾아야 했다. 3개 모델을 EC2에서 순차 실험하면 시간이 너무 걸리므로 SageMaker로 전환해 병렬 실험을 진행했다.

**비교 대상 backbone 3종:**

| Backbone | 특징 | 기대 |
|---|---|---|
| MobileViTv2-100 | 경량, 빠름 | baseline 확인 |
| EfficientNet-B4 | CNN 계열, 안정적 | F1 향상 기대 |
| ViT-Base-Patch16-224 | Transformer, 워밍업 필요 | 장기 수렴 시 최고 성능 기대 |

### EC2 → SageMaker 전환 이유

| 항목 | EC2 단독 | SageMaker |
|---|---|---|
| 병렬 실험 | 순차만 가능 | 3개 job 동시 실행 |
| 스팟 중단 대응 | 수동 체크포인트 | Managed Spot (자동) |
| 데이터 접근 | pipe:s5cmd 스트리밍 | FastFile FUSE 마운트 |
| 인스턴스 관리 | 직접 | 완전 관리형 |

### 아키텍처 변경

```python
# EC2: pipe:s5cmd 스트리밍
TRAIN_URL = 'pipe:aws s3 cp s3://ai-preprocessing/webdataset/...'

# SageMaker: FastFile 마운트 경로
SM_CHANNEL_TRAIN = os.environ.get('SM_CHANNEL_TRAIN', '/opt/ml/input/data/train')
train_shards = get_shard_paths(SM_CHANNEL_TRAIN, args.train_start, args.train_end)
```

### 겪은 문제들과 해결

**문제 1: source_dir 경로**
```python
# 틀린 것 (Windows WSL 경로 하드코딩)
source_dir='/mnt/c/Users/DS6/Downloads/sage'
# 수정
source_dir='/home/user/Downloads/sage'
```

**문제 2: sagemaker 3.x 패키지 구조 변경**
```bash
# 3.5.0에서 sagemaker.pytorch 모듈 없음
pip install "sagemaker>=2.0,<3.0" --break-system-packages
```

**문제 3: 로컬 환경에서 Session region 미인식**

로컬 Linux에서 실행 시 sagemaker SDK가 EC2 메타데이터 서버(`169.254.169.254`)에서 region을 찾으려다 타임아웃.

```python
# 수정: boto3 session에 region 명시
import boto3
boto_session = boto3.Session(region_name='ap-northeast-2')
sagemaker_session = sagemaker.Session(boto_session=boto_session)
# estimator에도 전달
estimator = PyTorch(..., sagemaker_session=sagemaker_session)
```

**문제 4: torch.amp API 버전 호환**

SageMaker DLC `pytorch-training:2.2.0-gpu-py310` 컨테이너의 실제 PyTorch가 `torch.amp.GradScaler` 미지원.

```python
# 수정: 하위 호환 API 사용
scaler = torch.cuda.amp.GradScaler()
with torch.cuda.amp.autocast():
```

**문제 5: CPU 스레드 경합**

24 workers × 멀티스레드 = CPU 마비. train3.py 상단에 추가:

```python
os.environ["OMP_NUM_THREADS"] = "1"
os.environ["MKL_NUM_THREADS"] = "1"
os.environ["OPENBLAS_NUM_THREADS"] = "1"
os.environ["VECLIB_MAXIMUM_THREADS"] = "1"
os.environ["NUMEXPR_NUM_THREADS"] = "1"
```

### SageMaker에서 겪은 데이터 파이프라인 병목 문제

SageMaker 전환 과정에서 가장 오래 걸린 문제는 **data_wait 361초** 였다. EC2에서 4분/200스텝이 나왔던 것과 달리 SageMaker에서는 17분/200스텝이 나왔고, 원인을 찾는 데 상당한 시행착오가 있었다.

**시도 1: pipe:s5cmd 방식 유지 → 실패**

EC2에서 잘 됐던 `pipe:s5cmd` 방식을 그대로 SageMaker에 가져왔다.

```
[TIMING] step=100  data_wait=204s  gpu=0.44s
```

data_wait 204초. GPU는 0.44초인데 데이터를 204초 기다리는 상황.

**시도 2: VPC Gateway Endpoint 추가 → 효과 없음**

SageMaker가 퍼블릭 경로로 S3에 접근해서 느리다는 가설 → VPC 설정 추가.
결과: data_wait 249s → 278s → 309s로 오히려 증가. 가설 틀림.

**시도 3: FastFile 모드로 전환 → 개선됐으나 여전히 느림**

`pipe:s5cmd`를 버리고 SageMaker 네이티브 FastFile 모드로 전환.

```python
data_input = TrainingInput(
    s3_data='s3://ai-preprocessing/webdataset/',
    input_mode='FastFile'
)
```

결과: data_wait 361초. 오히려 더 느려짐.

**시도 4: CPU 스레드 제한 추가 → 해결**

EC2 `train.py`에는 있었지만 SageMaker용 `train3.py`에 누락된 OMP 스레드 제한을 추가.

```
24 workers × numpy/scipy 기본 스레드 수 = 수백 개 스레드가 48코어 경합
→ CPU context switching 지옥 → 전처리 마비 → data_wait 폭발
```

```python
os.environ["OMP_NUM_THREADS"] = "1"
os.environ["MKL_NUM_THREADS"] = "1"
# ... (5줄)
```

결과:
```
[TIMING] step=100  data_wait=32.06s  gpu=0.48s
Step 200  12:33:34
Step 400  12:35:51  → 200스텝에 2분 17초  (EC2 4분 대비 2배 향상)
```

**data_wait=32초 해석 오류 주의**

`data_wait=32초`를 처음엔 심각한 병목으로 오해했다. 실제로는 step 100 → step 150 사이 **50스텝 전체 구간의 벽시계 시간**이다. 스텝당 실제 대기는 `32초 / 50스텝 = 0.64초`로 정상 범위.

### 최종 성능

```
Step 200  12:33:34
Step 400  12:35:51  → 200스텝에 2분 17초
Step 600  12:38:05  → 200스텝에 2분 14초
```

EC2 단독 4분/200스텝 → SageMaker FastFile **2분 17초/200스텝** (약 2배 향상)

---

## Phase 5: 2단계 실험 계획

### Step 1: 스모크 테스트 (현재 진행 중)

```python
STEP_CONFIG = {
    1: {
        'epochs': 1,
        'train_start': 0, 'train_end': 649,    # 10% (650 샤드)
        'val_start': 6500, 'val_end': 6549,    # 50 샤드
    }
}
```

목적: 코드가 끝까지 돌아가는지 확인. 3개 backbone 병렬 실행.

### Step 1 결과

3개 backbone을 병렬로 실행한 스모크 테스트 결과 (10% 데이터, 1 epoch):

| 순위 | 모델 (Backbone) | 배치 크기 | 총 스텝 | 최종 학습 Acc (%) | 최종 학습 Loss | Validation F1 |
|---|---|---|---|---|---|---|
| 1위 | MobileViTv2-100 (가벼운 CNN 하이브리드) | 64 | 800 | 37.43% | 9.7256 | 0.6457 |
| 2위 | EfficientNet-B4 (무거운 정통 CNN) | 32 | 1400 | 37.67% | 27.0727 | 0.5653 |
| 3위 | ViT-Base-Patch16-224 (순수 트랜스포머) | 32 | 1400 | 11.87% | 10.1022 | 0.5329 |

**해석:**
- MobileViTv2-100이 F1 0.6457로 1위. 배치 크기가 64로 커서 스텝 수(800)는 적지만 Validation F1이 가장 높음.
- EfficientNet-B4는 스텝 수(1400)가 더 많음에도 F1 0.5653으로 2위. Loss가 27로 높은 건 FocalLoss 특성상 초반에 크게 나오는 것으로 정상 범위.
- ViT-Base-Patch16-224는 학습 Acc 11.87%, F1 0.5329로 3위. 다른 두 모델 대비 Acc가 낮은 건 Transformer 특성상 워밍업 구간이 길기 때문으로, 1 epoch만으로는 불리한 조건. Step 2 미니 벤치마크(5 epoch)에서 기울기가 가파르게 오를 가능성이 있어 최종 판단은 보류.
- 전체적으로 학습 Acc 37%대는 35클래스 랜덤 베이스라인(~2.9%)을 크게 상회하므로 학습이 정상 진행 중임을 확인.

### Step 2: 미니 벤치마크 (Step 1 통과 후)

```python
STEP_CONFIG = {
    2: {
        'epochs': 5,
        'train_start': 0, 'train_end': 3249,   # 50%
        'val_start': 6500, 'val_end': 6749,
        'use_spot_instances': True,             # 비용 절감
    }
}
```

목적: Loss 하강 기울기 비교. 점수보다 **기울기**가 가파른 backbone이 최종 승자.

### Step 2 결과

50% 데이터, 최대 5 epoch 실행 결과 (MobileViTv2-100 미완료):

| 순위 | 모델 (Backbone) | 에포크 | 최종 학습 Acc (%) | 최종 학습 Loss | Validation F1 | 상태 |
|---|---|---|---|---|---|---|
| 1위 | EfficientNet-B4 | 4 | 92.01% | 17.49 | 0.6573 | 📈 쾌속 성장 및 우상향 |
| 2위 | ViT-Base-Patch16-224 | 4 | 10.72% | 3.59 | 0.4976 | 📉 학습 실패 (과소적합) |
| - | MobileViTv2-100 | - | - | - | - | 결과 미수신 |

**해석:**
- EfficientNet-B4가 학습 Acc 92%, F1 0.6573으로 역전. Step 1에서 2위였지만 epoch이 쌓이면서 CNN 계열의 안정적인 수렴 특성이 드러남.
- ViT-Base-Patch16-224는 4 epoch에서도 Acc 10.72%로 과소적합 확정. 35클래스 다중 분류 + 제한된 데이터(50%) 환경에서 Transformer의 데이터 헝거리 특성이 치명적으로 작용. 탈락.
- **현재 선두: EfficientNet-B4** → Step 3 풀 학습 후보 1순위.

---

## 인프라 구성 요약

```
로컬 (Ubuntu)
    └── parallel_launch.py → SageMaker API 호출

SageMaker Training Job (ml.g6.12xlarge, NVIDIA L4 × 4)
    ├── train3.py (entry point)
    ├── FastFile: s3://ai-preprocessing/webdataset/ → /opt/ml/input/data/train/
    ├── Output: s3://ai-preprocessing/sagemaker/models/
    └── Checkpoint: s3://ai-preprocessing/sagemaker/checkpoints/ (Step 2)

EC2 (g4dn.xlarge, video-preprocessing)
    └── 전처리 인스턴스 (Terraform으로 생성, RAPA_Admin)
```

---

## 핵심 의사결정 요약

| 결정 | 선택 | 이유 |
|---|---|---|
| 분류 방식 | 35클래스 다중 분류 | 퀴즈 서비스 특성상 "어떤 AI인지" 설명 필요 |
| 모델 구조 | Cascade (XGBoost → CNN+LSTM) | 비용 절감 + 정확도 유지 |
| 데이터 포맷 | WebDataset (.tar 샤드) | 대용량 S3 스트리밍에 최적화 |
| 학습 환경 | SageMaker FastFile | 병렬 job + 관리형 스팟 + 코드 변경 최소 |
| Loss | FocalLoss + Label Smoothing | 클래스 불균형 대응 |
| Backbone 선택 | 실험 중 (3종 비교) | 데이터 특성에 맞는 최적 backbone 탐색 |
