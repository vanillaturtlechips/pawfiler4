# Cherry-pick으로 인한 파일 덮어쓰기 문제

## 발생 상황

`junghan` 브랜치에서 다른 브랜치의 커밋을 cherry-pick할 때, 해당 커밋이 구버전 파일을 포함하고 있어 최신 파일이 구버전으로 덮어써지는 문제가 발생했다.

### 영향받은 파일

- `frontend/src/pages/ProfilePage.tsx`
- `frontend/src/lib/api.ts`
- `frontend/src/components/quiz/RegionSelectQuestion.tsx`

---

## 원인

cherry-pick은 특정 커밋의 변경사항(diff)을 현재 브랜치에 적용한다.  
해당 커밋이 만들어진 시점의 파일 상태가 현재 브랜치보다 오래된 경우, cherry-pick 후 파일이 구버전으로 되돌아간다.

```
origin/main (최신)
  └── ProfilePage.tsx (리포트 UI 포함)

cherry-pick 대상 커밋 (구버전 기준)
  └── ProfilePage.tsx (리포트 UI 없음) ← 이게 덮어씀
```

---

## 해결 방법

### 1. origin/main 버전으로 파일 복원

```bash
git checkout origin/main -- frontend/src/pages/ProfilePage.tsx
git checkout origin/main -- frontend/src/lib/api.ts
git checkout origin/main -- frontend/src/components/quiz/RegionSelectQuestion.tsx
```

### 2. 필요한 기능만 수동으로 추가

복원 후 cherry-pick 커밋에서 필요했던 기능만 직접 코드에 추가한다.  
이번 케이스에서는 리포트 다운로드 UI와 API 함수들을 수동으로 추가했다.

---

## 예방법

cherry-pick 전에 반드시 영향받는 파일을 확인한다.

```bash
# cherry-pick 전 어떤 파일이 바뀌는지 미리 확인
git show <commit-hash> --stat

# 특정 파일이 현재 브랜치와 얼마나 다른지 확인
git diff HEAD <commit-hash> -- <파일경로>
```

cherry-pick 후에는 반드시 변경된 파일을 검토한다.

```bash
git diff HEAD~1 HEAD
```

---

## 관련 브랜치 꼬임 문제 (2026-03-18)

### 상황

cherry-pick 작업 이후 로컬 브랜치 상태가 꼬인 채로 방치되어 다음 문제가 발생했다.

- 로컬 `main` 브랜치에 origin/main과 다른 커밋 3개가 쌓임
- `git pull origin main` 시 `MERGE_HEAD exists` 에러 발생
- `api.ts`, `ProfilePage.tsx` 충돌 반복

### 해결 순서

```bash
# 1. 미완료 merge 취소
git merge --abort

# 2. 로컬 작업 커밋을 백업 브랜치로 보존
git branch backup/lambda-report-work

# 3. 로컬 main을 origin/main으로 리셋
git checkout main
git reset --hard origin/main

# 4. 새 작업 브랜치 생성 후 필요한 커밋만 cherry-pick
git checkout -b feat/lambda-report
git cherry-pick <commit-hash>
```

### 교훈

- 로컬 `main` 브랜치에 직접 커밋하지 않는다. 항상 feature 브랜치에서 작업한다.
- cherry-pick 충돌 해결 후 반드시 `git cherry-pick --continue` 또는 `git commit`으로 마무리한다.
- 작업 브랜치는 `junghan` 하나로 통일한다.
