# Frontend 빌드 오류 - api.ts export 누락 및 인코딩 문제

## 발생 일시

2026-03-18

## 증상

PR CI/CD `deploy-frontend` job에서 Vite 빌드 실패가 연속으로 발생.

```
"handleApiError" is not exported by "src/lib/api.ts"
"fetchShopItems" is not exported by "src/lib/api.ts"
"getUserId" is not exported by "src/lib/api.ts"
Unterminated string literal (인코딩 깨짐)
```

## 근본 원인

리베이스로 돌아간 PR을 `junghan` 브랜치로 cherry-pick하는 과정에서 발생.

해당 PR의 커밋(`ecd65b3`) 중 `frontend/src/lib/api.ts`가 `origin/main` 버전과 완전히 다른 버전으로 작성되어 있었음.

- `origin/main`의 `api.ts`: `getUserId`, `fetchShopItems`, `adminFetchShopItems` 등 다수의 함수 포함
- PR 커밋의 `api.ts`: 위 함수들이 없는 별도 버전으로 작성됨

cherry-pick 후 `origin/main`의 `api.ts`를 복원하려 할 때 **Windows PowerShell의 파이프 인코딩 문제**로 한글이 EUC-KR로 깨지는 부수 피해 발생.

```powershell
# 이 방식은 UTF-8 인코딩을 보장하지 않음 (사용 금지)
git show origin/main:path/to/file.ts | Out-File -Encoding utf8 file.ts
```

## 해결 방법

### 1. git checkout으로 원본 파일 복원 (인코딩 안전)

```bash
git checkout origin/main -- frontend/src/lib/api.ts
```

`Out-File` 대신 `git checkout`을 사용하면 git이 직접 바이트를 복원하므로 인코딩 문제 없음.

### 2. 누락된 export 추가

```typescript
// const → export const 로 변경
export const getUserId = (): string => { ... }
export const handleApiError = (error: unknown, context: string): never => { ... }
```

### 3. PR에서 추가된 함수만 append

`origin/main`을 베이스로 유지하고, 실제로 새로 추가된 `generateReport` / `downloadReport`만 파일 끝에 추가.

## 교훈

- Windows 환경에서 `git show ... | Out-File`로 파일을 복원하면 인코딩이 깨질 수 있음
- 파일 복원은 반드시 `git checkout <ref> -- <path>` 사용
- cherry-pick 전에 대상 커밋이 base 브랜치의 파일을 얼마나 변경했는지 `git show --stat`으로 미리 확인
- 다른 파일에서 import하는 함수는 반드시 `export` 키워드 확인

## 관련 파일

- `frontend/src/lib/api.ts`
- `frontend/src/pages/ProfilePage.tsx`
- `frontend/src/lib/communityApi.ts`
- `frontend/src/pages/ShopPage.tsx`
