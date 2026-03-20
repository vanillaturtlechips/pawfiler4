"""
PawFiler AI Agent Service
- LangGraph ReAct 에이전트
- 도구: RAG 검색, 사용자 프로필, 퀴즈 기록, 상점, 커뮤니티, 영상 분석
- 임베딩: AWS Bedrock Titan (amazon.titan-embed-text-v2:0, 1024차원)
- LLM: AWS Bedrock Claude (apac.anthropic.claude-3-5-sonnet-20241022-v2:0)
- Vector DB: PostgreSQL chatbot.knowledge_base (pgvector)
"""
import os
import json
import math
import time
import boto3
import psycopg2
import psycopg2.pool
from psycopg2.extras import RealDictCursor
from typing import Optional
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from langchain_aws import ChatBedrockConverse
from langchain_core.tools import tool
from langchain_core.messages import HumanMessage, SystemMessage
from langgraph.prebuilt import create_react_agent

app = FastAPI(title="PawFiler AI Agent", version="2.0.0")

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
CHAT_MODEL = "apac.anthropic.claude-3-5-sonnet-20241022-v2:0"
RAG_THRESHOLD = 0.4
RAG_TOP_K = 3
MAX_HISTORY = 10  # 세션당 최근 메시지 보관 수
SESSION_TTL = 1800  # 세션 유효 시간 (초, 30분)

TIER_ORDER = ["알 껍데기 병아리", "삐약이 정보원", "안경 쓴 병아리", "망토 입은 닭", "불사조 탐정"]
TIER_XP = {"알 껍데기 병아리": 0, "삐약이 정보원": 150, "안경 쓴 병아리": 400, "망토 입은 닭": 800, "불사조 탐정": 1500}

_bedrock_client = None
_db_pool = None
_agent = None
# {session_id: {"msgs": [...], "ts": float}}
session_history: dict[str, dict] = {}


def _cleanup_sessions():
    """30분 이상 미접근 세션 정리"""
    cutoff = time.time() - SESSION_TTL
    stale = [sid for sid, data in session_history.items() if data["ts"] < cutoff]
    for sid in stale:
        del session_history[sid]


def get_bedrock():
    global _bedrock_client
    if _bedrock_client is None:
        _bedrock_client = boto3.client("bedrock-runtime", region_name=BEDROCK_REGION)
    return _bedrock_client


def get_pool():
    global _db_pool
    if _db_pool is None:
        _db_pool = psycopg2.pool.ThreadedConnectionPool(
            minconn=1,
            maxconn=10,
            dsn=os.environ["DATABASE_URL"],
        )
    return _db_pool


def get_db():
    return get_pool().getconn()


def release_db(conn):
    get_pool().putconn(conn)


# ============================================================================
# TOOLS (읽기 전용 - 다른 서비스 데이터 변경 없음)
# ============================================================================

@tool
def search_pawfiler_docs(query: str) -> str:
    """PawFiler 서비스의 기능, 정책, 사용 방법에 대한 문서를 검색합니다.
    퀴즈, 영상 분석, 커뮤니티, 상점, 리포트, 티어 시스템 등 서비스 설명이 필요할 때 사용하세요."""
    bedrock = get_bedrock()
    conn = get_db()
    try:
        body = json.dumps({"inputText": query, "dimensions": 1024, "normalize": True})
        resp = bedrock.invoke_model(modelId=EMBED_MODEL, body=body)
        embedding = json.loads(resp["body"].read())["embedding"]

        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            # 1. 벡터 검색 top 10
            cur.execute(
                """
                SELECT id, source_file, section, content,
                       1 - (embedding <=> %s::vector) AS similarity
                FROM chatbot.knowledge_base
                WHERE 1 - (embedding <=> %s::vector) >= %s
                ORDER BY embedding <=> %s::vector
                LIMIT 10
                """,
                (str(embedding), str(embedding), RAG_THRESHOLD, str(embedding)),
            )
            vector_rows = cur.fetchall()

            # 2. FTS 키워드 검색 top 10 (tsv 컬럼 없으면 빈 결과로 fallback)
            try:
                cur.execute(
                    """
                    SELECT id, source_file, section, content
                    FROM chatbot.knowledge_base
                    WHERE tsv @@ plainto_tsquery('simple', %s)
                    ORDER BY ts_rank(tsv, plainto_tsquery('simple', %s)) DESC
                    LIMIT 10
                    """,
                    (query, query),
                )
                fts_rows = cur.fetchall()
            except Exception:
                conn.rollback()
                fts_rows = []

        # 3. RRF(Reciprocal Rank Fusion)로 두 결과 합산
        K = 60
        scores: dict = {}
        all_docs: dict = {}

        for rank, row in enumerate(vector_rows):
            doc_id = str(row["id"])
            scores[doc_id] = scores.get(doc_id, 0) + 1 / (K + rank + 1)
            all_docs[doc_id] = row

        for rank, row in enumerate(fts_rows):
            doc_id = str(row["id"])
            scores[doc_id] = scores.get(doc_id, 0) + 1 / (K + rank + 1)
            all_docs[doc_id] = row

        # 4. 점수 높은 순 top K
        top_ids = sorted(scores, key=lambda x: scores[x], reverse=True)[:RAG_TOP_K]
        docs = [all_docs[doc_id] for doc_id in top_ids]

        if not docs:
            return "관련 문서를 찾지 못했습니다."
        return "\n\n".join(f"[{d['section']}]\n{d['content']}" for d in docs)
    except Exception as e:
        return f"문서 검색 중 오류: {str(e)}"
    finally:
        release_db(conn)


@tool
def get_user_profile(user_id: str) -> str:
    """사용자의 XP, 코인, 에너지, 현재 티어, 정답률, 연속 정답 기록을 조회합니다.
    '내 정보', '내 티어', '내 코인', '에너지 얼마나 남았어' 같은 질문에 사용하세요."""
    conn = get_db()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(
                """
                SELECT p.total_exp, p.total_coins, p.energy, p.max_energy,
                       p.current_tier, p.nickname, p.avatar_emoji,
                       s.total_answered, s.correct_count,
                       s.current_streak, s.best_streak
                FROM quiz.user_profiles p
                LEFT JOIN quiz.user_stats s ON s.user_id = p.user_id
                WHERE p.user_id = %s
                """,
                (user_id,),
            )
            row = cur.fetchone()

        if not row:
            return "사용자 프로필을 찾을 수 없습니다."

        accuracy = (
            round(row["correct_count"] / row["total_answered"] * 100, 1)
            if row["total_answered"]
            else 0
        )
        return (
            f"닉네임: {row['nickname']} {row['avatar_emoji']}\n"
            f"티어: {row['current_tier']}\n"
            f"총 XP: {row['total_exp']}\n"
            f"코인: {row['total_coins']}\n"
            f"에너지: {row['energy']}/{row['max_energy']}\n"
            f"퀴즈 {row['total_answered']}문제 풀이, 정답률 {accuracy}%\n"
            f"현재 연속 정답: {row['current_streak']}회, 최고 기록: {row['best_streak']}회"
        )
    except Exception as e:
        return f"프로필 조회 중 오류: {str(e)}"
    finally:
        release_db(conn)


@tool
def get_quiz_history(user_id: str) -> str:
    """사용자의 최근 퀴즈 풀이 기록 10개를 조회합니다.
    어떤 문제를 맞히고 틀렸는지, 획득한 XP/코인을 확인할 때 사용하세요."""
    conn = get_db()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(
                """
                SELECT a.is_correct, a.xp_earned, a.coins_earned,
                       a.answered_at, q.difficulty, q.type
                FROM quiz.user_answers a
                JOIN quiz.questions q ON q.id = a.question_id
                WHERE a.user_id = %s
                ORDER BY a.answered_at DESC
                LIMIT 10
                """,
                (user_id,),
            )
            rows = cur.fetchall()

        if not rows:
            return "퀴즈 풀이 기록이 없습니다."

        result = []
        for r in rows:
            status = "✅" if r["is_correct"] else "❌"
            result.append(
                f"{status} 난이도:{r['difficulty']} 유형:{r['type']} | XP+{r['xp_earned']} 코인+{r['coins_earned']}"
            )
        return "최근 퀴즈 기록:\n" + "\n".join(result)
    except Exception as e:
        return f"퀴즈 기록 조회 중 오류: {str(e)}"
    finally:
        release_db(conn)


@tool
def get_shop_items() -> str:
    """상점에서 현재 판매 중인 아이템 목록과 가격을 조회합니다.
    '상점에 뭐 있어', '에너지 아이템 가격', '뱃지 살 수 있어' 같은 질문에 사용하세요."""
    conn = get_db()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(
                """
                SELECT name, description, price, icon, type, quantity, bonus
                FROM user_svc.shop_items
                WHERE is_active = true
                ORDER BY type, price
                """
            )
            items = cur.fetchall()

        if not items:
            return "현재 판매 중인 아이템이 없습니다."

        result = []
        for item in items:
            bonus_text = f" (+{item['bonus']})" if item["bonus"] else ""
            qty_text = f" x{item['quantity']}" if item["quantity"] else ""
            result.append(
                f"{item['icon']} {item['name']}{qty_text}{bonus_text} — {item['price']}코인 [{item['type']}]\n   {item['description']}"
            )
        return "현재 상점 아이템:\n\n" + "\n\n".join(result)
    except Exception as e:
        return f"상점 조회 중 오류: {str(e)}"
    finally:
        release_db(conn)


@tool
def get_community_posts(sort_by: str = "likes") -> str:
    """커뮤니티 게시글을 조회합니다.
    sort_by에 'likes'(인기순) 또는 'recent'(최신순)을 지정하세요.
    '요즘 인기 게시글', '최근 올라온 글' 같은 질문에 사용하세요."""
    conn = get_db()
    try:
        order = "likes DESC, created_at DESC" if sort_by == "likes" else "created_at DESC"
        assert order in ("likes DESC, created_at DESC", "created_at DESC")
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(
                f"""
                SELECT title, author_nickname, author_emoji, likes, comments, tags, created_at
                FROM community.posts
                ORDER BY {order}
                LIMIT 5
                """
            )
            posts = cur.fetchall()

        if not posts:
            return "게시글이 없습니다."

        result = []
        for p in posts:
            tags = " ".join(f"#{t}" for t in p["tags"]) if p["tags"] else ""
            result.append(
                f"📌 {p['title']}\n"
                f"   {p['author_emoji']} {p['author_nickname']} | ❤️ {p['likes']} 💬 {p['comments']} {tags}"
            )
        label = "인기" if sort_by == "likes" else "최신"
        return f"커뮤니티 {label} 게시글:\n\n" + "\n\n".join(result)
    except Exception as e:
        return f"커뮤니티 조회 중 오류: {str(e)}"
    finally:
        release_db(conn)


@tool
def get_video_analysis_history(user_id: str) -> str:
    """사용자의 영상 분석 기록을 조회합니다.
    분석 결과(진짜/딥페이크 의심), 신뢰도 점수를 확인할 수 있습니다."""
    conn = get_db()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(
                """
                SELECT t.status, t.created_at,
                       r.verdict, r.confidence_score
                FROM video_analysis.tasks t
                LEFT JOIN video_analysis.results r ON r.task_id = t.id
                WHERE t.user_id = %s
                ORDER BY t.created_at DESC
                LIMIT 5
                """,
                (user_id,),
            )
            rows = cur.fetchall()

        if not rows:
            return "영상 분석 기록이 없습니다."

        result = []
        for r in rows:
            if r["verdict"]:
                verdict = "🔴 딥페이크 의심" if r["verdict"] != "REAL" else "🟢 정상"
                conf = f"신뢰도: {round(float(r['confidence_score']) * 100, 1)}%"
                result.append(f"{verdict} — {conf}")
            else:
                result.append(f"⏳ 분석 중 ({r['status']})")
        return "최근 영상 분석 결과:\n" + "\n".join(result)
    except Exception as e:
        return f"영상 분석 기록 조회 중 오류: {str(e)}"
    finally:
        release_db(conn)


@tool
def analyze_quiz_weakness(user_id: str) -> str:
    """사용자의 퀴즈 난이도별·유형별 정답률을 분석합니다.
    '내 약점이 뭐야', '어떤 난이도를 많이 틀려', '퀴즈 실력 분석해줘' 같은 질문에 사용하세요."""
    conn = get_db()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(
                """
                SELECT q.difficulty, q.type,
                       COUNT(*) AS total,
                       SUM(CASE WHEN a.is_correct THEN 1 ELSE 0 END) AS correct
                FROM quiz.user_answers a
                JOIN quiz.questions q ON q.id = a.question_id
                WHERE a.user_id = %s
                GROUP BY q.difficulty, q.type
                ORDER BY q.difficulty, correct ASC
                """,
                (user_id,),
            )
            rows = cur.fetchall()

        if not rows:
            return "퀴즈 풀이 기록이 없어 분석할 수 없습니다."

        result = []
        for r in rows:
            accuracy = round(r["correct"] / r["total"] * 100, 1) if r["total"] else 0
            icon = "🟢" if accuracy >= 70 else "🟡" if accuracy >= 50 else "🔴"
            result.append(f"{icon} {r['difficulty']} / {r['type']}: {r['total']}문제 중 {r['correct']}정답 ({accuracy}%)")
        return "퀴즈 약점 분석:\n" + "\n".join(result)
    except Exception as e:
        return f"약점 분석 중 오류: {str(e)}"
    finally:
        release_db(conn)


@tool
def get_tier_progress(user_id: str) -> str:
    """다음 티어까지 필요한 XP와 퀴즈 문제 수를 계산합니다.
    '다음 티어까지 얼마나 남았어', '티어업하려면 몇 문제 더 풀어야 해' 같은 질문에 사용하세요."""
    conn = get_db()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(
                "SELECT total_exp, current_tier FROM quiz.user_profiles WHERE user_id = %s",
                (user_id,),
            )
            row = cur.fetchone()

        if not row:
            return "사용자 프로필을 찾을 수 없습니다."

        current_xp = row["total_exp"]
        current_tier = row["current_tier"]

        try:
            idx = TIER_ORDER.index(current_tier)
        except ValueError:
            return f"현재 티어: {current_tier}, XP: {current_xp}"

        if idx >= len(TIER_ORDER) - 1:
            return f"이미 최고 티어(불사조 탐정)입니다! 현재 XP: {current_xp}"

        next_tier = TIER_ORDER[idx + 1]
        needed = TIER_XP[next_tier] - current_xp

        return (
            f"현재: {current_tier} (XP {current_xp})\n"
            f"목표: {next_tier} (XP {TIER_XP[next_tier]} 필요)\n"
            f"남은 XP: {needed}\n"
            f"달성 방법: hard {math.ceil(needed / 50)}문제 또는 medium {math.ceil(needed / 25)}문제 정답"
        )
    except Exception as e:
        return f"티어 진척도 조회 중 오류: {str(e)}"
    finally:
        release_db(conn)


@tool
def get_energy_recovery_time(user_id: str) -> str:
    """현재 에너지에서 완충까지 남은 시간을 계산합니다.
    '에너지 언제 다 차', '에너지 완충까지 얼마나 걸려' 같은 질문에 사용하세요."""
    conn = get_db()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(
                "SELECT energy, max_energy FROM quiz.user_profiles WHERE user_id = %s",
                (user_id,),
            )
            row = cur.fetchone()

        if not row:
            return "사용자 프로필을 찾을 수 없습니다."

        energy = row["energy"]
        max_energy = row["max_energy"]

        if energy >= max_energy:
            return f"에너지가 이미 최대치({max_energy})입니다! 퀴즈 {max_energy // 5}문제를 풀 수 있습니다."

        needed = max_energy - energy
        total_hours = (needed / 10) * 3
        h, m = int(total_hours), int((total_hours % 1) * 60)

        return (
            f"현재 에너지: {energy}/{max_energy}\n"
            f"완충까지: 약 {h}시간 {m}분 (3시간마다 +10 자동 회복)\n"
            f"지금 풀 수 있는 문제 수: {energy // 5}문제"
        )
    except Exception as e:
        return f"에너지 회복 시간 조회 중 오류: {str(e)}"
    finally:
        release_db(conn)


TOOLS = [
    search_pawfiler_docs,
    get_user_profile,
    get_quiz_history,
    get_shop_items,
    get_community_posts,
    get_video_analysis_history,
    analyze_quiz_weakness,
    get_tier_progress,
    get_energy_recovery_time,
]


# ============================================================================
# AGENT
# ============================================================================

def get_agent():
    global _agent
    if _agent is None:
        llm = ChatBedrockConverse(
            model=CHAT_MODEL,
            region_name=BEDROCK_REGION,
        )
        _agent = create_react_agent(llm, tools=TOOLS)
    return _agent


def build_system_prompt(user_id: Optional[str]) -> str:
    user_info = (
        f"현재 로그인한 사용자 ID: {user_id}"
        if user_id
        else "사용자가 로그인하지 않은 상태입니다. 개인 정보(프로필, 퀴즈 기록, 영상 분석 기록) 조회 요청 시 로그인이 필요하다고 안내하세요."
    )
    return f"""당신은 PawFiler 서비스의 AI 도우미 '마법사 포리'입니다.
PawFiler는 AI 딥페이크 탐지 교육 플랫폼입니다.

{user_info}

## 답변 우선순위
1. PawFiler 서비스 관련 질문 → 도구를 사용해 정확한 데이터로 답변
2. 딥페이크·AI·사이버보안·미디어 리터러시 관련 질문 → 보유 지식으로 자유롭게 답변
3. 그 외 일반 질문(계산, 번역, 상식 등) → 도움이 된다면 친절하게 답변

## 사용 가능한 도구
- search_pawfiler_docs: 서비스 기능/정책/사용법 문서 검색
- get_user_profile: XP, 코인, 에너지, 티어, 정답률 조회 (로그인 필요)
- get_quiz_history: 최근 퀴즈 풀이 기록 10개 조회 (로그인 필요)
- get_shop_items: 상점 아이템 목록 및 가격 조회
- get_community_posts: 커뮤니티 인기/최신 게시글 조회
- get_video_analysis_history: 영상 분석 기록 조회 (로그인 필요)
- analyze_quiz_weakness: 난이도·유형별 정답률 분석 및 약점 파악 (로그인 필요)
- get_tier_progress: 다음 티어까지 필요한 XP와 문제 수 계산 (로그인 필요)
- get_energy_recovery_time: 에너지 완충까지 남은 시간 계산 (로그인 필요)

## 답변 스타일
- 핵심만 간결하게 답변하세요. 불필요한 설명, 인사말, 마무리 문장 생략
- 3줄 이내로 답할 수 있으면 3줄로 끝내세요
- 목록이 필요할 때만 bullet 사용, 그 외엔 짧은 문장으로
- "네, 안녕하세요", "도움이 되셨으면 좋겠습니다" 같은 문구 사용 금지
항상 한국어로 답변하세요."""


# ============================================================================
# API
# ============================================================================

class ChatRequest(BaseModel):
    message: str
    session_id: str = ""
    user_id: Optional[str] = None


@app.get("/health")
@app.get("/api/chat/health")
def health():
    return {"status": "ok"}


@app.post("/chat")
@app.post("/api/chat")
def chat(req: ChatRequest):
    _cleanup_sessions()

    system_prompt = build_system_prompt(req.user_id)
    history = session_history[req.session_id]["msgs"] if req.session_id in session_history else []

    messages = (
        [SystemMessage(content=system_prompt)]
        + history
        + [HumanMessage(content=req.message)]
    )

    result = get_agent().invoke({"messages": messages})
    answer = result["messages"][-1].content

    if req.session_id:
        new_history = history + [
            HumanMessage(content=req.message),
            result["messages"][-1],
        ]
        session_history[req.session_id] = {
            "msgs": new_history[-MAX_HISTORY:],
            "ts": time.time(),
        }

    return {"answer": answer}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8088, reload=True)
