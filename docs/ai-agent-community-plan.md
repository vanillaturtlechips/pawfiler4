# 광장(Community) AI 에이전트 구현 계획

## 개요

| # | 기능 | 난이도 | 예상 공수 | 우선순위 |
|---|------|--------|-----------|----------|
| 1 | 게시글/댓글 분석 에이전트 | ⭐⭐ 중 | 3~4일 | 1순위 |
| 2 | 자동 신고 처리 에이전트 | ⭐⭐ 중 | 3~4일 | 2순위 |
| 3 | 대화형 AI 에이전트 (챗봇) | ⭐⭐⭐ 중상 | 5~7일 | 3순위 |
| 4 | 추천 에이전트 | ⭐⭐⭐⭐ 고 | 7~10일 | 4순위 |

> **권장 구현 순서**: 1 → 2 → 3 → 4
> 1, 2는 독립적으로 붙일 수 있어 리스크 없음. 3, 4는 외부 의존성이 크므로 기반이 갖춰진 후 진행.

---

## 공통 아키텍처 원칙

```
[community-service]
        │
        │  게시글 CREATE / 신고 / 댓글 이벤트
        ▼
  [Redis Stream or SQS]  ← 비동기 큐 (응답 블로킹 방지)
        │
        ▼
  [ai-agent-service]     ← 신규 Python FastAPI 서비스
        │  Claude API / 임베딩 API 호출
        ▼
  [PostgreSQL]           ← ai_* 컬럼에 결과 저장
        │
        ▼
  [community-service]    ← GetPost/GetFeed 시 ai_* 컬럼 포함 응답
```

**핵심 원칙**:
- 모든 AI 호출은 **비동기** — 사용자 응답 지연 없음
- community-service는 AI 결과를 **읽기 전용**으로만 소비
- ai-agent-service는 **독립 배포** (장애 격리)
- AI 실패 시 graceful degradation (없으면 그냥 빈값 반환)

---

## 1. 게시글/댓글 분석 에이전트

### 난이도: ⭐⭐ (중)

### 기능
게시글이 올라오면 AI가 자동으로:
- 딥페이크 관련 콘텐츠인지 분류 (`deepfake`, `media`, `general`)
- 핵심 태그 자동 생성 (`["딥페이크", "영상조작", "탐지방법"]`)
- 게시글 한 줄 요약 생성

### DB 스키마 변경

```sql
-- community.posts에 ai 분석 결과 컬럼 추가
ALTER TABLE community.posts
  ADD COLUMN ai_category    VARCHAR(50)  DEFAULT NULL,
  ADD COLUMN ai_tags        TEXT[]       DEFAULT NULL,
  ADD COLUMN ai_summary     TEXT         DEFAULT NULL,
  ADD COLUMN ai_analyzed_at TIMESTAMPTZ  DEFAULT NULL;
```

### 구현 흐름

```
1. CreatePost 요청
      │
      ▼
2. community-service: posts 테이블 INSERT (ai_* 컬럼은 NULL)
      │
      ▼
3. Redis Stream에 post_id, title, body 발행
   XADD community:events * type post_created post_id <id> title <...> body <...>
      │
      ▼
4. ai-agent-service (Python)가 스트림 컨슘
      │  Claude API 호출:
      │  "다음 게시글을 분석해서 category, tags(최대 5개), summary(30자)를 JSON으로 반환해줘"
      ▼
5. 결과를 community.posts에 UPDATE
   UPDATE community.posts SET ai_category=$1, ai_tags=$2, ai_summary=$3, ai_analyzed_at=NOW()
   WHERE id=$4
      │
      ▼
6. GetPost/GetFeed 응답에 ai_category, ai_tags, ai_summary 포함
```

### 코드 구현 상세

#### community-service (Go) — post.go 수정

```go
// CreatePost 마지막에 Redis Stream 발행 추가
func (h *Handler) CreatePost(ctx context.Context, req *pb.CreatePostRequest) (*pb.Post, error) {
    // ... 기존 INSERT 로직 ...

    // AI 분석 이벤트 발행 (비동기, 실패해도 응답 블로킹 안함)
    go func() {
        payload := map[string]string{
            "post_id": post.Id,
            "title":   post.Title,
            "body":    post.Body,
        }
        data, _ := json.Marshal(payload)
        h.redis.XAdd(context.Background(), &redis.XAddArgs{
            Stream: "community:ai:analyze",
            Values: map[string]interface{}{"data": string(data)},
        })
    }()

    return post, nil
}
```

#### ai-agent-service (Python) — analyzer.py

```python
import anthropic
import asyncio
import json
import redis.asyncio as aioredis
import asyncpg

client = anthropic.Anthropic()

async def analyze_post(post_id: str, title: str, body: str, db_pool, redis_client):
    prompt = f"""다음 커뮤니티 게시글을 분석해주세요.

제목: {title}
내용: {body[:500]}

JSON 형식으로만 응답해주세요:
{{
  "category": "deepfake | media | quiz | general 중 하나",
  "tags": ["태그1", "태그2"],  // 최대 5개, 딥페이크 관련 키워드
  "summary": "30자 이내 요약"
}}"""

    message = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=256,
        messages=[{"role": "user", "content": prompt}]
    )

    result = json.loads(message.content[0].text)

    await db_pool.execute("""
        UPDATE community.posts
        SET ai_category=$1, ai_tags=$2, ai_summary=$3, ai_analyzed_at=NOW()
        WHERE id=$4
    """, result["category"], result["tags"], result["summary"], post_id)

async def consume_stream(db_pool, redis_client):
    last_id = "0"
    while True:
        entries = await redis_client.xread(
            {"community:ai:analyze": last_id}, block=5000, count=10
        )
        for stream, messages in entries:
            for msg_id, fields in messages:
                data = json.loads(fields[b"data"])
                await analyze_post(
                    data["post_id"], data["title"], data["body"],
                    db_pool, redis_client
                )
                last_id = msg_id
```

### proto 변경 (community.proto)

```protobuf
message Post {
  // ... 기존 필드 ...
  string ai_category  = 20;
  repeated string ai_tags    = 21;
  string ai_summary   = 22;
}
```

### k8s 배포

```yaml
# k8s/ai-agent-service/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: ai-agent-service
  namespace: pawfiler
spec:
  replicas: 1
  template:
    spec:
      containers:
      - name: ai-agent-service
        image: <ECR>/ai-agent-service:<SHA>
        env:
        - name: ANTHROPIC_API_KEY
          valueFrom:
            secretKeyRef:
              name: ai-secret
              key: anthropic_api_key
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: db-secret
              key: url
        - name: REDIS_ADDR
          value: "redis:6379"
```

---

## 2. 자동 신고 처리 에이전트

### 난이도: ⭐⭐ (중)

### 기능
유저가 게시글/댓글을 신고하면 AI가 1차 검토:
- 욕설/혐오표현 → 자동 숨김 처리
- 스팸/광고 → 자동 숨김 + 작성자 경고 누적
- 경계 케이스 → 관리자 검토 대기열로 이동

### DB 스키마

```sql
-- 신고 테이블 (report 서비스에 이미 존재하면 컬럼 추가)
CREATE TABLE IF NOT EXISTS community.reports (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id  TEXT NOT NULL,
  target_type  VARCHAR(20) NOT NULL,  -- 'post' | 'comment'
  target_id    UUID NOT NULL,
  reason       TEXT NOT NULL,
  ai_verdict   VARCHAR(20) DEFAULT NULL,  -- 'auto_hide' | 'warn' | 'review' | 'dismiss'
  ai_reason    TEXT DEFAULT NULL,
  status       VARCHAR(20) DEFAULT 'pending',  -- 'pending' | 'auto_handled' | 'admin_review' | 'resolved'
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  handled_at   TIMESTAMPTZ DEFAULT NULL
);

-- posts에 신고 관련 컬럼
ALTER TABLE community.posts
  ADD COLUMN is_hidden      BOOLEAN DEFAULT FALSE,
  ADD COLUMN hidden_reason  TEXT    DEFAULT NULL,
  ADD COLUMN report_count   INT     DEFAULT 0;
```

### 구현 흐름

```
1. 유저가 신고 버튼 클릭 → ReportPost gRPC 호출
      │
      ▼
2. community-service: community.reports에 INSERT
   report_count 1 증가
      │
      ▼
3. Redis Stream에 신고 이벤트 발행
   XADD community:ai:report * type report target_type post target_id <id>
      │
      ▼
4. ai-agent-service: 신고 대상 게시글 본문 조회 후 Claude 판정
      │
      ├── 자동 숨김 (auto_hide): is_hidden=TRUE 처리
      ├── 경고 (warn): 작성자 warning_count +1
      └── 관리자 검토 (review): status='admin_review' 유지
      ▼
5. admin 패널에서 review 대기 목록 확인 가능
```

### ai-agent-service — reporter.py

```python
REPORT_PROMPT = """다음 게시글이 신고됐습니다.

신고 사유: {reason}
게시글 제목: {title}
게시글 내용: {body}

다음 기준으로 판정해주세요:
- auto_hide: 명백한 욕설, 혐오표현, 불법 콘텐츠
- warn: 스팸, 도배, 광고성 게시물
- review: 판단이 어려운 경계 케이스
- dismiss: 신고 사유 불충분, 정상 게시물

JSON으로만 응답:
{{"verdict": "auto_hide|warn|review|dismiss", "reason": "판정 이유 한 줄"}}"""

async def handle_report(report_id, target_type, target_id, reason, db_pool):
    # 신고 대상 콘텐츠 조회
    row = await db_pool.fetchrow(
        "SELECT title, body FROM community.posts WHERE id=$1", target_id
    )

    message = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=128,
        messages=[{"role": "user", "content": REPORT_PROMPT.format(
            reason=reason, title=row["title"], body=row["body"][:300]
        )}]
    )
    result = json.loads(message.content[0].text)

    # 판정 결과 저장
    await db_pool.execute("""
        UPDATE community.reports
        SET ai_verdict=$1, ai_reason=$2, status=$3, handled_at=NOW()
        WHERE id=$4
    """, result["verdict"], result["reason"],
        "auto_handled" if result["verdict"] in ("auto_hide", "warn") else "admin_review",
        report_id)

    if result["verdict"] == "auto_hide":
        await db_pool.execute("""
            UPDATE community.posts SET is_hidden=TRUE, hidden_reason=$1 WHERE id=$2
        """, result["reason"], target_id)
```

### proto 추가

```protobuf
rpc ReportPost(ReportPostRequest) returns (ReportPostResponse) {
  option (google.api.http) = { post: "/community.CommunityService/ReportPost" body: "*" };
}

message ReportPostRequest {
  string reporter_id = 1;
  string post_id     = 2;
  string reason      = 3;
}
message ReportPostResponse {
  bool   success = 1;
  string message = 2;  // "신고가 접수됐습니다" or "이미 처리된 신고입니다"
}
```

---

## 3. 대화형 AI 에이전트 (챗봇)

### 난이도: ⭐⭐⭐ (중상)

### 기능
광장 내 AI 전용 채널 또는 사이드패널에서:
- 유저가 딥페이크 관련 질문 → AI가 실시간 답변
- 멀티턴 대화 유지 (대화 히스토리 Redis에 저장)
- 퀴즈 연계: "오늘 퀴즈 힌트 알려줘" 같은 컨텍스트 인식

### DB 스키마

```sql
CREATE TABLE community.ai_chat_sessions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      TEXT NOT NULL,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  last_used_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE community.ai_chat_messages (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES community.ai_chat_sessions(id),
  role       VARCHAR(20) NOT NULL,  -- 'user' | 'assistant'
  content    TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Redis 대화 캐시

```
key: ai:chat:{session_id}
value: JSON array of last 20 messages
TTL: 1시간 (비활성 세션 자동 만료)
```

### 구현 흐름

```
1. 유저 → POST /community.CommunityService/AiChat
   { session_id: "...", user_id: "...", message: "딥페이크가 뭔가요?" }
      │
      ▼
2. ai-agent-service: Redis에서 대화 히스토리 조회
      │
      ▼
3. Claude API 호출 (스트리밍)
   system: "당신은 딥페이크 탐지 전문가입니다. pawfiler 서비스의 AI 도우미입니다."
   messages: [히스토리 + 새 메시지]
      │
      ▼
4. 응답을 SSE(Server-Sent Events)로 프론트에 스트리밍
      │
      ▼
5. 완성된 응답을 Redis 히스토리에 추가, DB에 저장
```

### ai-agent-service — chat.py

```python
from anthropic import Anthropic
import redis.asyncio as aioredis
from fastapi import FastAPI
from fastapi.responses import StreamingResponse

app = FastAPI()
client = Anthropic()

SYSTEM_PROMPT = """당신은 딥페이크 탐지 전문 AI 도우미입니다.
pawfiler 서비스의 광장(커뮤니티)에서 유저들의 질문에 답합니다.
딥페이크 탐지, 미디어 리터러시, 영상 분석에 관한 질문에 친절하고 명확하게 답하세요.
한국어로 답변하고, 답변은 2~3문단 이내로 간결하게 작성하세요."""

@app.post("/chat")
async def chat(session_id: str, user_id: str, message: str, redis_client: aioredis.Redis):
    # 히스토리 조회
    history_raw = await redis_client.get(f"ai:chat:{session_id}")
    history = json.loads(history_raw) if history_raw else []

    # 새 메시지 추가
    history.append({"role": "user", "content": message})

    async def generate():
        full_response = ""
        with client.messages.stream(
            model="claude-sonnet-4-6",
            max_tokens=1024,
            system=SYSTEM_PROMPT,
            messages=history[-20:],  # 최근 20개만
        ) as stream:
            for text in stream.text_stream:
                full_response += text
                yield f"data: {json.dumps({'text': text})}\n\n"

        # 히스토리 업데이트
        history.append({"role": "assistant", "content": full_response})
        await redis_client.set(
            f"ai:chat:{session_id}",
            json.dumps(history[-20:]),
            ex=3600  # 1시간 TTL
        )
        yield "data: [DONE]\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream")
```

### 프론트엔드 연동

```typescript
// SSE 스트리밍 수신
const response = await fetch('/api/ai/chat', {
  method: 'POST',
  body: JSON.stringify({ session_id, message }),
});

const reader = response.body.getReader();
const decoder = new TextDecoder();

while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  const chunk = decoder.decode(value);
  // "data: {"text": "안녕"}\n\n" 파싱
  const text = JSON.parse(chunk.replace('data: ', '')).text;
  setAiResponse(prev => prev + text);
}
```

### 난이도 포인트
- gRPC는 스트리밍 지원하지만 기존 grpc-gateway가 SSE 변환 설정 필요
- 또는 ai-agent-service를 **HTTP 직접 노출** (Envoy에 별도 route 추가)하는 게 더 간단

---

## 4. 추천 에이전트

### 난이도: ⭐⭐⭐⭐ (고)

### 기능
유저 행동 데이터 기반으로:
- 퀴즈 정답률/카테고리 → 관심사 파악
- 조회한 게시글 패턴 분석
- "회원님이 관심 가질 게시글" 섹션 제공

### 기술 스택 선택

| 방법 | 설명 | 난이도 |
|------|------|--------|
| **컨텐츠 기반** | 게시글 본문 임베딩 + 코사인 유사도 | ⭐⭐⭐ |
| **협업 필터링** | 유사한 유저가 본 글 추천 | ⭐⭐⭐⭐ |
| **하이브리드** | 둘 다 | ⭐⭐⭐⭐⭐ |

> **권장**: 초기에는 **컨텐츠 기반**으로 시작

### DB 스키마

```sql
-- 게시글 임베딩 저장 (pgvector 확장 필요)
CREATE EXTENSION IF NOT EXISTS vector;

ALTER TABLE community.posts
  ADD COLUMN embedding vector(1536) DEFAULT NULL;  -- Claude/OpenAI 임베딩 차원

-- 유저 행동 로그
CREATE TABLE community.user_interactions (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    TEXT NOT NULL,
  post_id    UUID NOT NULL,
  action     VARCHAR(20) NOT NULL,  -- 'view' | 'like' | 'comment'
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX ON community.user_interactions (user_id, created_at DESC);
CREATE INDEX ON community.posts USING ivfflat (embedding vector_cosine_ops);
```

### 구현 흐름

```
[임베딩 생성 파이프라인]
1. 게시글 CREATE → Redis Stream 발행
2. ai-agent-service: 본문을 임베딩 API로 변환
   embedding = anthropic or openai embeddings API
3. community.posts.embedding 컬럼 업데이트

[추천 API]
1. 유저가 GetFeed 호출 (recommended=true 파라미터)
2. 유저의 최근 조회/좋아요 게시글 임베딩 평균 계산 (관심 벡터)
3. pgvector로 코사인 유사도 검색
   SELECT id FROM community.posts
   ORDER BY embedding <=> $1  -- $1은 유저 관심 벡터
   LIMIT 20
4. 결과 반환
```

### ai-agent-service — embedder.py

```python
import openai  # 또는 Anthropic embeddings
import numpy as np

openai_client = openai.OpenAI()

async def create_embedding(text: str) -> list[float]:
    response = openai_client.embeddings.create(
        model="text-embedding-3-small",
        input=text[:2000]
    )
    return response.data[0].embedding

async def embed_post(post_id: str, title: str, body: str, db_pool):
    embedding = await create_embedding(f"{title}\n{body}")
    await db_pool.execute(
        "UPDATE community.posts SET embedding=$1 WHERE id=$2",
        embedding, post_id
    )

async def get_recommendations(user_id: str, db_pool, redis_client) -> list[str]:
    # 유저 최근 좋아요/조회 게시글 임베딩 평균
    rows = await db_pool.fetch("""
        SELECT p.embedding FROM community.posts p
        JOIN community.user_interactions ui ON p.id = ui.post_id
        WHERE ui.user_id=$1 AND ui.action IN ('view','like')
          AND p.embedding IS NOT NULL
        ORDER BY ui.created_at DESC LIMIT 10
    """, user_id)

    if not rows:
        return []  # 콜드 스타트: 인기글 반환

    # 관심 벡터 = 최근 본 글들의 평균
    embeddings = [row["embedding"] for row in rows]
    user_vector = np.mean(embeddings, axis=0).tolist()

    # pgvector 유사도 검색
    recs = await db_pool.fetch("""
        SELECT id FROM community.posts
        WHERE embedding IS NOT NULL
          AND id NOT IN (
            SELECT post_id FROM community.user_interactions WHERE user_id=$1
          )
        ORDER BY embedding <=> $2::vector
        LIMIT 10
    """, user_id, user_vector)

    return [str(row["id"]) for row in recs]
```

### 난이도 포인트
- **RDS에 pgvector 확장 설치** 필요 (RDS PostgreSQL 15+ 지원)
- **콜드 스타트 문제**: 행동 데이터가 없는 신규 유저 처리 로직 필요
- **임베딩 비용**: 게시글이 많아지면 API 비용 발생 (캐싱 전략 필요)
- **재색인 파이프라인**: 기존 게시글 전체 임베딩 1회 일괄 처리 필요

---

## 전체 구현 일정 (권장)

```
Week 1: 기반 작업
  - ai-agent-service 기본 구조 (FastAPI + Docker)
  - Redis Stream consumer 공통 구조
  - CI/CD 파이프라인 연결 (ECR + ArgoCD)
  - Anthropic API Key Secret 등록

Week 2: 기능 1 (게시글 분석)
  - DB 컬럼 추가 마이그레이션
  - community-service Redis Stream 발행 코드
  - ai-agent-service 분석기 구현
  - proto/API 응답에 ai_* 필드 추가
  - 프론트 태그/요약 표시 UI

Week 3: 기능 2 (자동 신고)
  - 신고 테이블 마이그레이션
  - ReportPost gRPC 엔드포인트
  - ai-agent-service 신고 판정기
  - admin 패널 연동 (review 대기 목록)

Week 4~5: 기능 3 (챗봇)
  - Envoy에 HTTP route 추가
  - SSE 스트리밍 구현
  - 프론트 채팅 UI

Week 6~7: 기능 4 (추천)
  - pgvector 활성화 (RDS)
  - 임베딩 파이프라인
  - 기존 게시글 일괄 재색인
  - GetFeed API 추천 모드 추가

```

---

## 비용 추산 (Claude API 기준)

| 기능 | 호출 빈도 | 토큰/호출 | 월 예상 비용 |
|------|-----------|-----------|-------------|
| 게시글 분석 | 게시글 수 × 1 | ~500 tokens | $2~10 |
| 신고 처리 | 신고 수 × 1 | ~400 tokens | $1~5 |
| 챗봇 | DAU × 대화수 | ~2000 tokens | $10~50 |
| 추천 임베딩 | 게시글 수 × 1 | (OpenAI 임베딩 사용) | $1~5 |

> 초기 트래픽 기준 **월 $15~70** 수준으로 시작 가능

---

## 필요한 Secrets

```yaml
# kubectl create secret generic ai-secret -n pawfiler \
#   --from-literal=anthropic_api_key=sk-ant-...
apiVersion: v1
kind: Secret
metadata:
  name: ai-secret
  namespace: pawfiler
type: Opaque
data:
  anthropic_api_key: <base64>
  openai_api_key: <base64>  # 추천 에이전트 임베딩용 (선택)
```
