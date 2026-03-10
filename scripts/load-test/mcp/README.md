# PawFiler Load Test MCP Server

자연어로 부하테스트를 실행할 수 있는 MCP 서버

## 🚀 설치

```bash
cd scripts/load-test/mcp
npm install
```

## 🔧 Kiro CLI 설정

`~/.kiro/settings/mcp.json`에 추가:

```json
{
  "mcpServers": {
    "pawfiler-load-test": {
      "command": "node",
      "args": ["/home/user/Documents/finalproject/pawfiler4/scripts/load-test/mcp/index.js"],
      "env": {}
    }
  }
}
```

## 💬 사용 예시

### 1. 부하테스트 실행

```
kiro> "quiz 서비스에 50명 2분간 부하테스트 해줘"
kiro> "community 서비스 staging 환경에 100명 5분간 테스트"
kiro> "quiz production 환경 부하테스트"
```

### 2. 최신 리포트 확인

```
kiro> "quiz 서비스 최신 테스트 결과 보여줘"
kiro> "community staging 리포트 확인"
```

### 3. 결과 비교

```
kiro> "quiz 서비스 local과 production 결과 비교"
```

## 🛠️ 지원 기능

### Tools

1. **run_load_test**
   - 자연어로 부하테스트 실행
   - 서비스, 환경, VUs, 시간 자동 파싱
   - 결과 자동 분석 및 리포트 생성

2. **get_latest_report**
   - 최신 테스트 리포트 조회
   - 서비스별, 환경별 필터링

3. **compare_results**
   - 환경 간 성능 비교 (예정)

## 📊 자연어 파싱

**서비스 감지:**
- "quiz" → quiz-service
- "community" → community-service
- "admin" → admin-service
- "video", "analysis" → video-analysis-service

**환경 감지:**
- "local" → local (기본값)
- "staging" → staging
- "production", "prod" → production

**VUs 감지:**
- "50명", "50 users", "50 VUs" → 50 VUs

**시간 감지:**
- "2분", "2 minutes", "2m" → 2m

## 🔄 워크플로우

```
자연어 입력
  ↓
MCP 서버 파싱
  ↓
run.sh 실행
  ↓
k6 테스트
  ↓
analyze.py 분석
  ↓
리포트 반환
```

## 🐛 디버깅

```bash
# MCP 서버 직접 실행
cd scripts/load-test/mcp
node index.js

# 로그 확인
tail -f ~/.kiro/logs/mcp-pawfiler-load-test.log
```
