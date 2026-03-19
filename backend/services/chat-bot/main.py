"""
PawFiler AI Agent Service
- RAG 기반 서비스 설명 챗봇
- 임베딩: AWS Bedrock Titan (amazon.titan-embed-text-v2:0, 1024차원)
- LLM: AWS Bedrock Claude (anthropic.claude-sonnet-4-5-20250929-v1:0)
- Vector DB: PostgreSQL chatbot.knowledge_base (pgvector)
"""
import os
import json
import boto3
import psycopg2
from psycopg2.extras import RealDictCursor
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

app = FastAPI(title="PawFiler AI Agent", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://pawfiler.site",
        "http://localhost:5173",
        "http://localhost:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

BEDROCK_REGION = os.getenv("AWS_REGION", "ap-northeast-2")
EMBED_MODEL = "amazon.titan-embed-text-v2:0"
CHAT_MODEL = "anthropic.claude-sonnet-4-5-20250929-v1:0"
RAG_THRESHOLD = 0.75
RAG_TOP_K = 3

SYSTEM_PROMPT = """당신은 PawFiler 서비스의 AI 도우미입니다.
PawFiler는 AI 딥페이크 탐지 교육 플랫폼으로, 다음 기능을 제공합니다:
- 퀴즈: 딥페이크 영상/이미지를 보고 진짜/가짜 판별 연습, XP와 코인 획득
- 영상 분석: 직접 업로드한 영상의 딥페이크 여부 AI 분석 (시각+음성+립싱크)
- 광장(커뮤니티): 딥페이크 관련 정보 공유, 게시글/댓글/좋아요/투표
- 상점: 코인으로 에너지 아이템, 뱃지, 구독권 구매
- 리포트: 퀴즈 플레이 데이터 기반 개인 맞춤형 분석 리포트
- 티어 시스템: 알 → 삼빡이(1000XP) → 맹금닭(2000XP) → 불사조(4000XP)

항상 한국어로 친절하게 답변하세요. 모르는 내용은 솔직하게 모른다고 하세요."""


class ChatRequest(BaseModel):
    message: str
    session_id: str = ""


def get_db():
    return psycopg2.connect(os.environ["DATABASE_URL"])


def get_bedrock():
    return boto3.client("bedrock-runtime", region_name=BEDROCK_REGION)


def embed_query(bedrock_client, text: str) -> list[float]:
    """사용자 쿼리를 Bedrock Titan으로 임베딩"""
    body = json.dumps({"inputText": text, "dimensions": 1024, "normalize": True})
    resp = bedrock_client.invoke_model(modelId=EMBED_MODEL, body=body)
    return json.loads(resp["body"].read())["embedding"]


def search_knowledge(
    conn,
    embedding: list[float],
    top_k: int = RAG_TOP_K,
    threshold: float = RAG_THRESHOLD,
) -> list[dict]:
    """pgvector cosine similarity 검색"""
    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute(
            """
            SELECT source_file, section, content,
                   1 - (embedding <=> %s::vector) AS similarity
            FROM chatbot.knowledge_base
            WHERE 1 - (embedding <=> %s::vector) >= %s
            ORDER BY embedding <=> %s::vector
            LIMIT %s
            """,
            (str(embedding), str(embedding), threshold, str(embedding), top_k),
        )
        return cur.fetchall()


def build_messages(user_message: str, context_docs: list[dict]) -> list[dict]:
    """RAG 컨텍스트를 포함한 메시지 구성"""
    if context_docs:
        context = "\n\n".join(
            f"[{doc['source_file']}] {doc['content']}" for doc in context_docs
        )
        user_content = f"참고 문서:\n{context}\n\n질문: {user_message}"
    else:
        user_content = user_message

    return [{"role": "user", "content": user_content}]


@app.get("/health")
@app.get("/api/chat/health")
def health():
    return {"status": "ok"}


@app.post("/chat")
@app.post("/api/chat")
def chat(req: ChatRequest):
    """일반 (non-streaming) 채팅"""
    bedrock = get_bedrock()
    conn = get_db()

    try:
        query_embedding = embed_query(bedrock, req.message)
        docs = search_knowledge(conn, query_embedding)
        messages = build_messages(req.message, docs)

        body = json.dumps({
            "anthropic_version": "bedrock-2023-05-31",
            "max_tokens": 1024,
            "system": SYSTEM_PROMPT,
            "messages": messages,
        })

        resp = bedrock.invoke_model(modelId=CHAT_MODEL, body=body)
        result = json.loads(resp["body"].read())
        answer = result["content"][0]["text"]

        return {
            "answer": answer,
            "sources": [
                {"file": d["source_file"], "section": d["section"]} for d in docs
            ],
        }

    finally:
        conn.close()


@app.post("/chat/stream")
@app.post("/api/chat/stream")
def chat_stream(req: ChatRequest):
    """SSE 스트리밍 채팅"""
    bedrock = get_bedrock()
    conn = get_db()

    try:
        query_embedding = embed_query(bedrock, req.message)
        docs = search_knowledge(conn, query_embedding)
        messages = build_messages(req.message, docs)

        body = json.dumps({
            "anthropic_version": "bedrock-2023-05-31",
            "max_tokens": 1024,
            "system": SYSTEM_PROMPT,
            "messages": messages,
        })

        def generate():
            response = bedrock.invoke_model_with_response_stream(
                modelId=CHAT_MODEL, body=body
            )
            for event in response["body"]:
                chunk = json.loads(event["chunk"]["bytes"])
                if chunk.get("type") == "content_block_delta":
                    text = chunk["delta"].get("text", "")
                    if text:
                        yield f"data: {json.dumps({'text': text})}\n\n"
            yield (
                f"data: {json.dumps({'done': True, 'sources': [{'file': d['source_file'], 'section': d['section']} for d in docs]})}\n\n"
            )

        return StreamingResponse(
            generate(),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "X-Accel-Buffering": "no",
                "Connection": "keep-alive",
            },
        )

    finally:
        conn.close()


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8088, reload=True)
