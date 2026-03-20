#!/usr/bin/env python3
"""
챗봇 지식베이스 인제스트 스크립트
docs/chatbot-knowledge/ 의 마크다운 파일을 청킹하고 Bedrock Titan으로 임베딩 후 DB 저장

사용법:
  DATABASE_URL=postgresql://... python ingest.py
"""
import os
import re
import json
import uuid
import boto3
import psycopg2
from pathlib import Path

KNOWLEDGE_DIR = Path(__file__).parent.parent.parent.parent / "docs" / "chatbot-knowledge"
BEDROCK_REGION = os.getenv("AWS_REGION", "ap-northeast-2")
EMBED_MODEL = "amazon.titan-embed-text-v2:0"


def get_bedrock_client():
    return boto3.client("bedrock-runtime", region_name=BEDROCK_REGION)


def embed_text(client, text: str) -> list[float]:
    body = json.dumps({"inputText": text, "dimensions": 1024, "normalize": True})
    response = client.invoke_model(modelId=EMBED_MODEL, body=body)
    return json.loads(response["body"].read())["embedding"]


def chunk_markdown(file_path: Path) -> list[dict]:
    """Q&A 형식 마크다운을 Q: 기준으로 청킹. 없으면 ## 헤더 기준으로 청킹"""
    content = file_path.read_text(encoding="utf-8")
    chunks = []

    # Q&A 형식 감지
    if re.search(r'^Q:', content, re.MULTILINE):
        pairs = re.split(r'\n(?=Q:)', content)
        for pair in pairs:
            pair = pair.strip()
            if not pair or len(pair) < 20:
                continue
            # 첫 줄(Q:)을 section으로 사용
            section = pair.split('\n')[0].replace('Q:', '').strip()
            chunks.append({
                "source_file": file_path.name,
                "section": section,
                "content": pair,
            })
        return chunks

    # 기존 ## 헤더 기준 청킹
    sections = re.split(r'\n(?=## )', content)
    for section in sections:
        section = section.strip()
        if not section or len(section) < 50:
            continue
        lines = section.split('\n')
        header = lines[0].lstrip('#').strip() if lines[0].startswith('#') else None
        chunks.append({
            "source_file": file_path.name,
            "section": header,
            "content": section,
        })

    return chunks


def ingest():
    db_url = os.environ["DATABASE_URL"]
    conn = psycopg2.connect(db_url)
    bedrock = get_bedrock_client()

    try:
        with conn.cursor() as cur:
            # 기존 데이터 초기화
            cur.execute("DELETE FROM chatbot.knowledge_base")
            print("기존 데이터 초기화 완료")

            md_files = sorted(KNOWLEDGE_DIR.glob("*.md"))
            if not md_files:
                print(f"경고: {KNOWLEDGE_DIR} 에 마크다운 파일이 없습니다")
                return

            total_chunks = 0
            for md_file in md_files:
                chunks = chunk_markdown(md_file)
                print(f"{md_file.name}: {len(chunks)}개 청크")

                for chunk in chunks:
                    embedding = embed_text(bedrock, chunk["content"])

                    cur.execute(
                        """
                        INSERT INTO chatbot.knowledge_base
                            (id, source_file, section, content, embedding)
                        VALUES (%s, %s, %s, %s, %s::vector)
                        """,
                        (
                            str(uuid.uuid4()),
                            chunk["source_file"],
                            chunk["section"],
                            chunk["content"],
                            str(embedding),
                        ),
                    )
                    total_chunks += 1

            conn.commit()
            print(f"\n총 {total_chunks}개 청크 저장 완료")

    finally:
        conn.close()


if __name__ == "__main__":
    ingest()
