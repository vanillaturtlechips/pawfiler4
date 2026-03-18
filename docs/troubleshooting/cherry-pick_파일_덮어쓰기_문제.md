# Cherry-pick으로 인한 팀원 파일 덮어쓰기 문제

## 발생 일시

2026-03-18

## 한 줄 요약

내 브랜치에서 작업한 커밋을 cherry-pick하는 과정에서, 해당 커밋이 팀원이 이미 개선한 파일들을 내 구버전으로 덮어써버려 빌드 오류 및 기능 손실이 연쇄 발생했다.

---

## 배경

- `origin/main`에는 팀원들이 작업한 최신 코드가 머지되어 있었음
- 나는 리베이스로 돌아간 내 커밋 3개(`ecd65b3`, `ab06589`, `86fa7fb`)를 새 브랜치(`junghan`)에 cherry-pick해서 PR을 올리려 했음
- cherry-pick 대상 커밋 중 `ecd65b3`이 문제의 원인

---

## 원인

`ecd65b3` 커밋은 내가 작업하던 시점의 스냅샷을 포함하고 있었다.  
그 시점에는 팀원의 개선 작업이 반영되기 전이었기 때문에, cherry-pick 후 아래 파일들이 구버전으로 교체됐다:

| 파일                                                    | 문제                                                                                                                              |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `frontend/src/lib/api.ts`                               | `handleApiError`, `fetchShopItems`, `purchaseItem`, `ShopCatalog`, `getUserId`, `generateReport`, `downloadReport` 등 export 누락 |
| `frontend/src/pages/ProfilePage.tsx`                    | 팀원이 구현한 닉네임 변경, 아바타 변경, fullProfile/activities API 연동 코드가 하드코딩 mock 버전으로 교체됨                      |
| `frontend/src/components/quiz/RegionSelectQuestion.tsx` | 팀원 버전이 단순화된 버전으로 교체됨                                                                                              |

---

## 증상

1. CI 빌드 실패 - `"handleApiError" is not exported by "src/lib/api.ts"`
2. CI 빌드 실패 - `"fetchShopItems" is not exported by "src/lib/api.ts"`
3. CI 빌드 실패 - `"getUserId" is not exported by "src/lib/api.ts"`
4. CI 빌드 실패 - `Unterminated string literal` (Windows `Out-File`로 파일 복원 시 한글 인코딩 깨짐)
5. 팀원이 ProfilePage에서 기능이 사라진 것을 발견

---

## 해결 방법

### api.ts

```bash
git checkout origin/main -- frontend/src/lib/api.ts
```

이후 내가 추가한 함수(`generateReport`, `downloadReport`, `REPORT_BASE_URL`)만 파일 끝에 append.

### ProfilePage.tsx / RegionSelectQuestion.tsx

```bash
git checkout origin/main -- frontend/src/pages/ProfilePage.tsx
git checkout origin/main -- frontend/src/components/quiz/RegionSelectQuestion.tsx
```

이후 ProfilePage.tsx에만 리포트 기능(import, state, handleGenerateReport, UI 섹션) 추가.

### 핵심 원칙

> cherry-pick 후에는 반드시 `git diff origin/main...HEAD --name-only`로 변경된 파일 목록을 확인하고,  
> 의도하지 않게 덮어쓴 파일이 있으면 `git checkout origin/main -- <file>`로 복원한 뒤 필요한 부분만 추가한다.

---

## 실수한 복원 방법 (하지 말 것)

```powershell
# ❌ Windows PowerShell Out-File → 한글 인코딩 깨짐
git show origin/main:frontend/src/lib/api.ts | Out-File -Encoding utf8 frontend/src/lib/api.ts
```

위 방법은 BOM이 붙거나 인코딩이 깨져서 `Unterminated string literal` 빌드 오류를 유발한다.  
반드시 아래 방법을 사용할 것:

```bash
# ✅ 올바른 방법
git checkout origin/main -- <파일경로>
```

---

## 교훈

1. **cherry-pick은 해당 커밋의 전체 파일 스냅샷을 가져온다.** 내가 수정한 파일 외에 다른 파일도 그 시점 버전으로 교체될 수 있다.
2. **cherry-pick 직후 반드시 diff 검토.** `git diff origin/main...HEAD --name-only`로 변경 파일 목록 확인.
3. **팀 협업 중 cherry-pick보다는 feature 브랜치 + rebase/merge가 안전하다.** cherry-pick은 단일 커밋의 변경사항만 가져오는 게 아니라 그 커밋 시점의 파일 전체를 반영한다는 점을 항상 기억할 것.
4. **Windows 환경에서 git 파일 복원은 `git checkout origin/main -- <file>` 방식만 사용.**
