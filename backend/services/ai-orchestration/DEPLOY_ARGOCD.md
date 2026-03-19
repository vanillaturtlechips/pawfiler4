# AI Orchestration 배포 가이드

## 1. ArgoCD 리포지토리 구조 (완료 ✅)

```
pawfiler4-argocd/
└── apps/services/ai-orchestration/
    ├── namespace.yaml
    ├── efs-pvc.yaml
    ├── rayservice.yaml
    ├── kustomization.yaml
    └── README.md
```

## 2. 배포 순서

### Step 1: 모델 준비 (pawfiler4 repo)
```bash
cd /mnt/c/Users/DS6/Documents/pawfiler/p2/pawfiler4/backend/services/ai-orchestration

# S3에서 모델 다운로드
aws s3 cp s3://ai-preprocessing/mobilevit_phase2.pt ./
aws s3 cp s3://ai-preprocessing/xgboost_phase1.pkl ./

# 모델 변환
python3 prepare_models.py \
    --video-ckpt mobilevit_phase2.pt \
    --xgb-ckpt xgboost_phase1.pkl \
    --output-dir ./efs_models

# S3 업로드
aws s3 cp ./efs_models/ s3://ai-preprocessing/models/ --recursive
```

### Step 2: EFS에 모델 복사
```bash
# EC2 인스턴스에서 EFS 마운트 후
sudo mount -t efs fs-XXXXXXXX:/ /mnt/efs
aws s3 cp s3://ai-preprocessing/models/ /mnt/efs/models/ --recursive
```

### Step 3: Docker 이미지 빌드 & 푸시
```bash
cd /mnt/c/Users/DS6/Documents/pawfiler/p2/pawfiler4/backend/services/ai-orchestration

# 빌드
docker build -t pawfiler-serve:latest .

# ECR 푸시
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
ECR_REPO="${ACCOUNT_ID}.dkr.ecr.ap-northeast-2.amazonaws.com/pawfiler-serve"

aws ecr get-login-password --region ap-northeast-2 | docker login --username AWS --password-stdin ${ECR_REPO}
docker tag pawfiler-serve:latest ${ECR_REPO}:latest
docker push ${ECR_REPO}:latest
```

### Step 4: Kustomization 이미지 경로 업데이트
```bash
cd /mnt/c/Users/DS6/Documents/pawfiler/p2/pawfiler4-argocd/apps/services/ai-orchestration

# kustomization.yaml 수정
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
sed -i "s/ACCOUNT_ID/${ACCOUNT_ID}/g" kustomization.yaml
```

### Step 5: Git Push (ArgoCD 자동 배포)
```bash
cd /mnt/c/Users/DS6/Documents/pawfiler/p2/pawfiler4-argocd
git add apps/services/ai-orchestration/
git commit -m "Add AI orchestration service"
git push origin main
```

ArgoCD ApplicationSet이 자동으로 감지하여 배포합니다.

## 3. 수동 배포 (ArgoCD 없이)

```bash
cd /mnt/c/Users/DS6/Documents/pawfiler/p2/pawfiler4-argocd/apps/services/ai-orchestration

# Kustomize로 배포
kubectl apply -k .
```

## 4. 배포 확인

```bash
# RayService 상태
kubectl get rayservice -n pawfiler

# Pod 상태
kubectl get pods -n pawfiler -l app=pawfiler

# 로그
kubectl logs -n pawfiler -l role=head -f

# Ray Dashboard
kubectl port-forward -n pawfiler svc/pawfiler-serve-head-svc 8265:8265
```

## 5. 테스트

```bash
# API 포트 포워딩
kubectl port-forward -n pawfiler svc/pawfiler-serve-head-svc 8000:8000

# 테스트 요청
curl -X POST http://localhost:8000/analyze \
  -H "Content-Type: application/json" \
  -d '{
    "media_url": "s3://bucket/sample.mp4",
    "modality": "both"
  }'
```

## 트러블슈팅

### Pod Pending
```bash
kubectl describe pod <pod-name> -n pawfiler
# GPU 노드 확인
kubectl get nodes -l karpenter.sh/capacity-type=spot
```

### 모델 로드 실패
```bash
kubectl exec -it <pod-name> -n pawfiler -- ls -la /mnt/efs/models/
# video_backbone.pt, xgboost_cascade.json 확인
```

### ImagePullBackOff
```bash
# ECR 권한 확인
aws ecr describe-repositories --repository-names pawfiler-serve
```
