# PAT (Personal Access Token) 설정 가이드

## 필요한 PAT

### 1. GitHub Personal Access Token (ArgoCD 레포 접근용)

#### 생성 방법
1. GitHub 로그인 → Settings → Developer settings → Personal access tokens → Tokens (classic)
2. "Generate new token (classic)" 클릭
3. 설정:
   - **Note**: `PawFiler ArgoCD Repo Access`
   - **Expiration**: 90 days (또는 No expiration)
   - **Scopes**:
     - ✅ `repo` (전체 체크)
     - ✅ `workflow` (GitHub Actions 수정용)

4. Generate token 클릭
5. 생성된 토큰 복사 (예: `ghp_xxxxxxxxxxxxxxxxxxxx`)

#### GitHub Secrets에 등록
Repository → Settings → Secrets and variables → Actions → New repository secret

```
Name: ARGOCD_REPO_TOKEN
Value: ghp_xxxxxxxxxxxxxxxxxxxx
```

### 2. AWS 관련 Secrets

#### GitHub Actions OIDC 설정 (권장)
```bash
cd ~/Documents/finalproject/pawfiler4
./scripts/setup-github-actions.sh
```

실행 후 다음 Secrets 등록:

```
Name: AWS_ROLE_ARN
Value: arn:aws:iam::009946608368:role/GitHubActionsECRRole

Name: ECR_REGISTRY
Value: 009946608368.dkr.ecr.ap-northeast-2.amazonaws.com
```

## 전체 Secrets 목록

GitHub Repository → Settings → Secrets and variables → Actions:

| Secret Name | 값 | 용도 |
|-------------|-----|------|
| `AWS_ROLE_ARN` | `arn:aws:iam::009946608368:role/GitHubActionsECRRole` | GitHub Actions AWS 인증 |
| `ECR_REGISTRY` | `009946608368.dkr.ecr.ap-northeast-2.amazonaws.com` | ECR 레지스트리 주소 |
| `ARGOCD_REPO_TOKEN` | `ghp_xxxxx...` | ArgoCD 레포 접근 토큰 |

## 테스트 전 체크리스트

- [ ] GitHub PAT 생성 완료
- [ ] GitHub Secrets 3개 등록 완료
- [ ] `./scripts/setup-github-actions.sh` 실행 완료
- [ ] `terraform.tfvars` 파일 존재 확인
- [ ] AWS CLI 자격증명 확인 (`aws sts get-caller-identity`)

## 로컬 테스트 (PAT 불필요)

로컬에서 배포 테스트는 PAT 없이 가능:
```bash
./scripts/deploy-all-auto.sh
```

이 경우 AWS CLI 자격증명만 필요합니다.
