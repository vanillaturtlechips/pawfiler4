"""
PawFiler MCP Server - 로컬 테스트 버전
Video Analysis Service 내장형 MCP 서버

로컬 환경 매핑:
  MobileViT  → local_detector.py  (ml/models/mobilevit_v2_best.pth)
  음성 분석  → audio_analyzer.py  (faster-whisper + silero-vad)
  LLM        → AWS Bedrock Nova 2 Lite (없으면 Stage2 결과 사용)
  Vector DB  → SQLite local_test.db  (pgvector 대체)
  Kafka      → 콘솔 출력
"""

import asyncio
import json
import logging
import os
import sys
import sqlite3
import uuid
import time
import cv2
import numpy as np
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

from mcp.server import Server
from mcp.server.stdio import stdio_server
from mcp.types import Tool, TextContent

# 경로 설정
BASE_DIR = Path(__file__).parent
sys.path.insert(0, str(BASE_DIR))

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s"
)
logger = logging.getLogger("pawfiler-mcp")

DB_PATH = BASE_DIR / "local_test.db"

# 로컬 모듈 임포트
try:
    from local_detector import LocalDetector
    from audio_analyzer import AudioAnalyzer
except ImportError as e:
    logger.warning(f"로컬 모듈 임포트 실패: {e}")
    LocalDetector = None
    AudioAnalyzer = None

# MCP 서버 인스턴스
app = Server("pawfiler-video-analysis")

# 전역 상태
detector = None
audio_analyzer = None
db_conn = None


def init_db():
    """SQLite 데이터베이스 초기화"""
    global db_conn
    db_conn = sqlite3.connect(str(DB_PATH), check_same_thread=False)
    cursor = db_conn.cursor()
    
    # 분석 결과 테이블
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS analysis_results (
            id TEXT PRIMARY KEY,
            video_path TEXT NOT NULL,
            stage TEXT NOT NULL,
            result TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    
    # 벡터 임베딩 테이블 (간단한 JSON 저장)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS embeddings (
            id TEXT PRIMARY KEY,
            analysis_id TEXT NOT NULL,
            embedding TEXT NOT NULL,
            metadata TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    
    db_conn.commit()
    logger.info(f"데이터베이스 초기화 완료: {DB_PATH}")


async def init_models():
    """ML 모델 초기화"""
    global detector, audio_analyzer
    
    if LocalDetector:
        try:
            detector = LocalDetector()
            logger.info("LocalDetector 초기화 완료")
        except Exception as e:
            logger.error(f"LocalDetector 초기화 실패: {e}")
    
    if AudioAnalyzer:
        try:
            audio_analyzer = AudioAnalyzer()
            logger.info("AudioAnalyzer 초기화 완료")
        except Exception as e:
            logger.error(f"AudioAnalyzer 초기화 실패: {e}")


def save_analysis_result(video_path: str, stage: str, result: Dict) -> str:
    """분석 결과 저장"""
    analysis_id = str(uuid.uuid4())
    cursor = db_conn.cursor()
    cursor.execute(
        "INSERT INTO analysis_results (id, video_path, stage, result) VALUES (?, ?, ?, ?)",
        (analysis_id, video_path, stage, json.dumps(result, ensure_ascii=False))
    )
    db_conn.commit()
    return analysis_id


def get_analysis_result(analysis_id: str) -> Optional[Dict]:
    """분석 결과 조회"""
    cursor = db_conn.cursor()
    cursor.execute(
        "SELECT video_path, stage, result, created_at FROM analysis_results WHERE id = ?",
        (analysis_id,)
    )
    row = cursor.fetchone()
    if row:
        return {
            "id": analysis_id,
            "video_path": row[0],
            "stage": row[1],
            "result": json.loads(row[2]),
            "created_at": row[3]
        }
    return None


@app.list_tools()
async def list_tools() -> List[Tool]:
    """사용 가능한 도구 목록"""
    return [
        Tool(
            name="get_frame_sample",
            description="비디오에서 대표 프레임 샘플을 추출합니다",
            inputSchema={
                "type": "object",
                "properties": {
                    "video_path": {
                        "type": "string",
                        "description": "비디오 파일 경로"
                    },
                    "num_frames": {
                        "type": "integer",
                        "description": "추출할 프레임 개수",
                        "default": 16
                    },
                    "method": {
                        "type": "string",
                        "description": "추출 방법: uniform(균등), random(랜덤), keyframe(키프레임)",
                        "default": "uniform"
                    }
                },
                "required": ["video_path"]
            }
        ),
        Tool(
            name="analyze_frames",
            description="추출된 프레임을 딥페이크 탐지 모델로 분석합니다 (Fast Pass 지원)",
            inputSchema={
                "type": "object",
                "properties": {
                    "video_path": {
                        "type": "string",
                        "description": "분석할 비디오 파일 경로"
                    },
                    "return_details": {
                        "type": "boolean",
                        "description": "프레임별 상세 결과 반환 여부",
                        "default": False
                    },
                    "enable_fast_pass": {
                        "type": "boolean",
                        "description": "Fast Pass 활성화 (유사도 0.97 이상이면 즉시 반환)",
                        "default": True
                    }
                },
                "required": ["video_path"]
            }
        ),
        Tool(
            name="extract_embedding",
            description="비디오 분석 결과에서 벡터 임베딩을 추출하여 저장합니다",
            inputSchema={
                "type": "object",
                "properties": {
                    "analysis_id": {
                        "type": "string",
                        "description": "분석 결과 ID"
                    },
                    "metadata": {
                        "type": "object",
                        "description": "추가 메타데이터 (선택)",
                        "default": {}
                    }
                },
                "required": ["analysis_id"]
            }
        ),
        Tool(
            name="search_similar_videos",
            description="벡터 유사도 기반으로 유사한 비디오를 검색합니다",
            inputSchema={
                "type": "object",
                "properties": {
                    "analysis_id": {
                        "type": "string",
                        "description": "기준 분석 ID"
                    },
                    "limit": {
                        "type": "integer",
                        "description": "반환할 결과 개수",
                        "default": 5
                    },
                    "threshold": {
                        "type": "number",
                        "description": "유사도 임계값 (0.0-1.0)",
                        "default": 0.7
                    }
                },
                "required": ["analysis_id"]
            }
        ),
        Tool(
            name="explain_result",
            description="분석 결과를 자연어로 설명합니다 (판단 근거 포함)",
            inputSchema={
                "type": "object",
                "properties": {
                    "analysis_id": {
                        "type": "string",
                        "description": "설명할 분석 ID"
                    },
                    "language": {
                        "type": "string",
                        "description": "설명 언어 (ko, en)",
                        "default": "ko"
                    },
                    "detail_level": {
                        "type": "string",
                        "description": "설명 상세도: simple(간단), normal(보통), detailed(상세)",
                        "default": "normal"
                    }
                },
                "required": ["analysis_id"]
            }
        ),
        Tool(
            name="save_embedding",
            description="분석 결과의 임베딩을 벡터 DB에 저장합니다",
            inputSchema={
                "type": "object",
                "properties": {
                    "analysis_id": {
                        "type": "string",
                        "description": "분석 ID"
                    },
                    "embedding_vector": {
                        "type": "array",
                        "items": {"type": "number"},
                        "description": "임베딩 벡터 (선택, 없으면 자동 생성)"
                    },
                    "metadata": {
                        "type": "object",
                        "description": "메타데이터",
                        "default": {}
                    }
                },
                "required": ["analysis_id"]
            }
        ),
        Tool(
            name="emit_event",
            description="분석 완료 이벤트를 발행합니다 (Kafka 시뮬레이션)",
            inputSchema={
                "type": "object",
                "properties": {
                    "analysis_id": {
                        "type": "string",
                        "description": "분석 ID"
                    },
                    "event_type": {
                        "type": "string",
                        "description": "이벤트 타입: analysis_complete, embedding_saved, alert",
                        "default": "analysis_complete"
                    },
                    "payload": {
                        "type": "object",
                        "description": "이벤트 페이로드",
                        "default": {}
                    }
                },
                "required": ["analysis_id"]
            }
        )
    ]


@app.call_tool()
async def call_tool(name: str, arguments: Any) -> List[TextContent]:
    """도구 실행"""
    try:
        if name == "get_frame_sample":
            result = await get_frame_sample_impl(
                arguments["video_path"],
                arguments.get("num_frames", 16),
                arguments.get("method", "uniform")
            )
            return [TextContent(type="text", text=json.dumps(result, ensure_ascii=False, indent=2))]
        
        elif name == "analyze_frames":
            result = await analyze_frames_impl(
                arguments["video_path"],
                arguments.get("return_details", False),
                arguments.get("enable_fast_pass", True)
            )
            return [TextContent(type="text", text=json.dumps(result, ensure_ascii=False, indent=2))]
        
        elif name == "extract_embedding":
            result = await extract_embedding_impl(
                arguments["analysis_id"],
                arguments.get("metadata", {})
            )
            return [TextContent(type="text", text=json.dumps(result, ensure_ascii=False, indent=2))]
        
        elif name == "search_similar_videos":
            result = await search_similar_videos_impl(
                arguments["analysis_id"],
                arguments.get("limit", 5),
                arguments.get("threshold", 0.7)
            )
            return [TextContent(type="text", text=json.dumps(result, ensure_ascii=False, indent=2))]
        
        elif name == "explain_result":
            result = await explain_result_impl(
                arguments["analysis_id"],
                arguments.get("language", "ko"),
                arguments.get("detail_level", "normal")
            )
            return [TextContent(type="text", text=json.dumps(result, ensure_ascii=False, indent=2))]
        
        elif name == "save_embedding":
            result = await save_embedding_impl(
                arguments["analysis_id"],
                arguments.get("embedding_vector"),
                arguments.get("metadata", {})
            )
            return [TextContent(type="text", text=json.dumps(result, ensure_ascii=False, indent=2))]
        
        elif name == "emit_event":
            result = await emit_event_impl(
                arguments["analysis_id"],
                arguments.get("event_type", "analysis_complete"),
                arguments.get("payload", {})
            )
            return [TextContent(type="text", text=json.dumps(result, ensure_ascii=False, indent=2))]
        
        else:
            return [TextContent(type="text", text=json.dumps({"error": f"알 수 없는 도구: {name}"}))]
    
    except Exception as e:
        logger.error(f"도구 실행 오류 ({name}): {e}", exc_info=True)
        return [TextContent(type="text", text=json.dumps({"error": str(e)}))]


def extract_frames_from_video(video_path: str, interval_sec: float = 1.0) -> List[np.ndarray]:
    """비디오에서 프레임 추출"""
    if not os.path.exists(video_path):
        raise FileNotFoundError(f"비디오 파일을 찾을 수 없습니다: {video_path}")
    
    cap = cv2.VideoCapture(video_path)
    fps = cap.get(cv2.CAP_PROP_FPS)
    frame_interval = int(fps * interval_sec)
    
    frames = []
    frame_idx = 0
    
    while True:
        ret, frame = cap.read()
        if not ret:
            break
        
        if frame_idx % frame_interval == 0:
            frames.append(frame)
        
        frame_idx += 1
    
    cap.release()
    logger.info(f"프레임 추출 완료: {len(frames)}개 (간격: {interval_sec}초)")
    return frames


# ========== 7개 MCP 도구 구현 ==========

async def check_fast_pass(video_path: str, threshold: float = 0.97) -> Optional[Dict]:
    """
    Fast Pass 체크: 동일/유사 영상이 이미 분석되었는지 확인
    
    유사도 0.97 이상이면 기존 결과를 즉시 반환하여:
    - GPU/LLM 자원 소모 차단
    - 응답 시간 1초 미만으로 단축
    """
    start_time = time.time()
    
    try:
        # 1. 비디오 해시 계산 (간단한 특징 추출)
        video_hash = calculate_video_hash(video_path)
        
        # 2. 기존 분석 결과 중 유사한 것 찾기
        cursor = db_conn.cursor()
        cursor.execute(
            "SELECT id, video_path, result FROM analysis_results WHERE stage = 'stage1' ORDER BY created_at DESC LIMIT 100"
        )
        
        best_match = None
        best_similarity = 0.0
        
        for analysis_id, stored_path, result_json in cursor.fetchall():
            # 저장된 비디오의 해시 계산
            if os.path.exists(stored_path):
                try:
                    stored_hash = calculate_video_hash(stored_path)
                    
                    # 해시 유사도 계산
                    sim = calculate_hash_similarity(video_hash, stored_hash)
                    
                    if sim > best_similarity:
                        best_similarity = sim
                        best_match = (analysis_id, stored_path, result_json)
                    
                    if sim >= threshold:
                        # Fast Pass 적용!
                        result = json.loads(result_json)
                        processing_time = int((time.time() - start_time) * 1000)
                        
                        logger.info(f"⚡ Fast Pass HIT: {Path(video_path).name} → {Path(stored_path).name} (유사도: {sim:.4f})")
                        
                        return {
                            "video_path": video_path,
                            "verdict": result.get("verdict", "unknown"),
                            "confidence_score": result.get("confidence_score", 0.0),
                            "processing_time_ms": processing_time,
                            "fast_pass": True,
                            "fast_pass_similarity": float(sim),
                            "fast_pass_source": stored_path,
                            "fast_pass_analysis_id": analysis_id,
                            "message": f"Fast Pass 적용 (유사도: {sim:.4f}, {processing_time}ms)"
                        }
                except Exception as e:
                    logger.debug(f"해시 계산 오류 ({stored_path}): {e}")
                    continue
        
        # Fast Pass 미적용 (가장 유사한 것 로그)
        if best_match:
            logger.info(f"Fast Pass MISS: 최대 유사도 {best_similarity:.4f} < {threshold}")
        
        return None
        
    except Exception as e:
        logger.error(f"Fast Pass 체크 오류: {e}", exc_info=True)
        return None


def calculate_video_hash(video_path: str) -> np.ndarray:
    """비디오 해시 계산 (간단한 특징 벡터)"""
    cap = cv2.VideoCapture(video_path)
    
    # 비디오 메타데이터
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    fps = cap.get(cv2.CAP_PROP_FPS)
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    
    # 대표 프레임 추출 (5개)
    frame_hashes = []
    indices = [int(total_frames * i / 5) for i in range(5)]
    
    for idx in indices:
        cap.set(cv2.CAP_PROP_POS_FRAMES, idx)
        ret, frame = cap.read()
        if ret:
            # 프레임을 작은 크기로 리사이즈하고 평균 해시 계산
            small = cv2.resize(frame, (8, 8))
            gray = cv2.cvtColor(small, cv2.COLOR_BGR2GRAY)
            avg = gray.mean()
            hash_bits = (gray > avg).flatten()
            frame_hashes.append(hash_bits)
    
    cap.release()
    
    # 전체 해시 벡터 생성
    if frame_hashes:
        video_hash = np.concatenate(frame_hashes)
    else:
        video_hash = np.zeros(64 * 5)  # 기본값
    
    # 메타데이터 추가
    meta_features = np.array([
        total_frames / 1000.0,  # 정규화
        fps / 30.0,
        width / 1920.0,
        height / 1080.0
    ])
    
    return np.concatenate([video_hash, meta_features])


def calculate_hash_similarity(hash1: np.ndarray, hash2: np.ndarray) -> float:
    """해시 유사도 계산 (해밍 거리 기반)"""
    if len(hash1) != len(hash2):
        return 0.0
    
    # 해밍 거리 계산
    hamming_distance = np.sum(hash1 != hash2)
    max_distance = len(hash1)
    
    # 유사도로 변환 (0.0 ~ 1.0)
    similarity = 1.0 - (hamming_distance / max_distance)
    
    return similarity


async def get_frame_sample_impl(video_path: str, num_frames: int = 16, method: str = "uniform") -> Dict:
    """프레임 샘플 추출"""
    if not os.path.exists(video_path):
        return {"error": f"비디오 파일을 찾을 수 없습니다: {video_path}"}
    
    cap = cv2.VideoCapture(video_path)
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    fps = cap.get(cv2.CAP_PROP_FPS)
    duration = total_frames / fps if fps > 0 else 0
    
    frames = []
    frame_indices = []
    
    if method == "uniform":
        # 균등 간격으로 추출
        step = max(1, total_frames // num_frames)
        frame_indices = list(range(0, total_frames, step))[:num_frames]
    elif method == "random":
        # 랜덤 추출
        import random
        frame_indices = sorted(random.sample(range(total_frames), min(num_frames, total_frames)))
    else:  # keyframe
        # 간단한 키프레임 추출 (균등 간격으로 대체)
        step = max(1, total_frames // num_frames)
        frame_indices = list(range(0, total_frames, step))[:num_frames]
    
    for idx in frame_indices:
        cap.set(cv2.CAP_PROP_POS_FRAMES, idx)
        ret, frame = cap.read()
        if ret:
            frames.append(frame)
    
    cap.release()
    
    return {
        "video_path": video_path,
        "total_frames": total_frames,
        "duration_sec": duration,
        "extracted_frames": len(frames),
        "frame_indices": frame_indices,
        "method": method,
        "message": f"{len(frames)}개 프레임 추출 완료 ({method} 방식)"
    }


async def analyze_frames_impl(video_path: str, return_details: bool = False, enable_fast_pass: bool = True) -> Dict:
    """프레임 분석 (Stage 1 전용) with Fast Pass"""
    if not detector:
        return {"error": "LocalDetector가 초기화되지 않았습니다"}
    
    try:
        # Fast Pass: 유사한 비디오가 있는지 먼저 확인
        if enable_fast_pass:
            fast_pass_result = await check_fast_pass(video_path)
            if fast_pass_result:
                logger.info(f"⚡ Fast Pass 적용: {Path(video_path).name} (유사도: {fast_pass_result.get('fast_pass_similarity', 0):.4f})")
                return fast_pass_result
        
        # 일반 분석 진행
        result = await detector.analyze(video_path)
        
        if return_details:
            # 상세 결과 포함
            return {
                "video_path": video_path,
                "verdict": result.get("verdict", "unknown"),
                "confidence_score": result.get("confidence_score", 0.0),
                "frame_samples_analyzed": result.get("frame_samples_analyzed", 0),
                "model_version": result.get("model_version", "unknown"),
                "processing_time_ms": result.get("processing_time_ms", 0),
                "fast_pass": False,
                "details": result
            }
        else:
            # 간단한 결과만
            return {
                "video_path": video_path,
                "verdict": result.get("verdict", "unknown"),
                "confidence_score": result.get("confidence_score", 0.0),
                "processing_time_ms": result.get("processing_time_ms", 0),
                "fast_pass": False
            }
    except Exception as e:
        logger.error(f"프레임 분석 오류: {e}", exc_info=True)
        return {"error": str(e)}


async def extract_embedding_impl(analysis_id: str, metadata: Dict = None) -> Dict:
    """임베딩 추출"""
    # 분석 결과 조회
    analysis = get_analysis_result(analysis_id)
    if not analysis:
        return {"error": "분석 결과를 찾을 수 없습니다"}
    
    # 간단한 임베딩 생성 (실제로는 모델 사용)
    result = analysis.get("result", {})
    
    # 특징 벡터 생성 (예시)
    embedding = []
    if "stage1" in result.get("stages", {}):
        stage1 = result["stages"]["stage1"]
        embedding.append(stage1.get("confidence_score", 0.5))
        embedding.append(1.0 if stage1.get("verdict") == "fake" else 0.0)
    
    if "stage2" in result.get("stages", {}):
        stage2 = result["stages"]["stage2"]
        embedding.append(1.0 if stage2.get("has_speech") else 0.0)
        embedding.append(stage2.get("confidence", 0.5))
    
    # 벡터 정규화 (간단한 예시)
    while len(embedding) < 128:
        embedding.append(0.0)
    
    embedding_id = str(uuid.uuid4())
    cursor = db_conn.cursor()
    cursor.execute(
        "INSERT INTO embeddings (id, analysis_id, embedding, metadata) VALUES (?, ?, ?, ?)",
        (embedding_id, analysis_id, json.dumps(embedding), json.dumps(metadata or {}))
    )
    db_conn.commit()
    
    return {
        "embedding_id": embedding_id,
        "analysis_id": analysis_id,
        "embedding_dim": len(embedding),
        "message": "임베딩 추출 완료"
    }


async def search_similar_videos_impl(analysis_id: str, limit: int = 5, threshold: float = 0.7) -> Dict:
    """유사 비디오 검색"""
    # 기준 임베딩 조회
    cursor = db_conn.cursor()
    cursor.execute("SELECT embedding FROM embeddings WHERE analysis_id = ?", (analysis_id,))
    row = cursor.fetchone()
    
    if not row:
        return {"error": "임베딩을 찾을 수 없습니다"}
    
    base_embedding = np.array(json.loads(row[0]))
    
    # 모든 임베딩과 비교
    cursor.execute("SELECT id, analysis_id, embedding FROM embeddings WHERE analysis_id != ?", (analysis_id,))
    results = []
    
    for emb_id, emb_analysis_id, emb_data in cursor.fetchall():
        embedding = np.array(json.loads(emb_data))
        
        # 코사인 유사도 계산
        similarity = np.dot(base_embedding, embedding) / (
            np.linalg.norm(base_embedding) * np.linalg.norm(embedding) + 1e-10
        )
        
        if similarity >= threshold:
            # 분석 결과 조회
            analysis = get_analysis_result(emb_analysis_id)
            results.append({
                "analysis_id": emb_analysis_id,
                "similarity": float(similarity),
                "video_path": analysis.get("video_path") if analysis else "unknown"
            })
    
    # 유사도 순으로 정렬
    results.sort(key=lambda x: x["similarity"], reverse=True)
    
    return {
        "base_analysis_id": analysis_id,
        "found": len(results),
        "threshold": threshold,
        "results": results[:limit]
    }


async def explain_result_impl(analysis_id: str, language: str = "ko", detail_level: str = "normal") -> Dict:
    """결과 설명"""
    analysis = get_analysis_result(analysis_id)
    if not analysis:
        return {"error": "분석 결과를 찾을 수 없습니다"}
    
    result = analysis.get("result", {})
    
    # result가 직접 분석 결과인 경우와 stages를 포함하는 경우 모두 처리
    if "stages" in result:
        stages = result.get("stages", {})
    else:
        # result 자체가 분석 결과인 경우
        stages = {"stage1": result}
    
    # 설명 생성
    explanations = []
    
    if "stage1" in stages:
        stage1 = stages["stage1"]
        verdict = stage1.get("verdict", "unknown")
        confidence = stage1.get("confidence_score", 0.0)
        
        if language == "ko":
            if detail_level == "simple":
                explanations.append(f"이 비디오는 {verdict}로 판정되었습니다.")
            elif detail_level == "normal":
                explanations.append(
                    f"비디오 분석 결과, {verdict}로 판정되었습니다. "
                    f"신뢰도는 {confidence:.2%}입니다."
                )
            else:  # detailed
                explanations.append(
                    f"딥페이크 탐지 모델(MobileViT)을 사용한 분석 결과, "
                    f"이 비디오는 {verdict}로 판정되었습니다. "
                    f"신뢰도는 {confidence:.2%}이며, "
                    f"{stage1.get('frame_samples_analyzed', 0)}개의 프레임을 분석했습니다. "
                    f"처리 시간은 {stage1.get('processing_time_ms', 0)}ms입니다."
                )
        else:  # en
            if detail_level == "simple":
                explanations.append(f"This video is classified as {verdict}.")
            elif detail_level == "normal":
                explanations.append(
                    f"Video analysis result: {verdict}. "
                    f"Confidence: {confidence:.2%}."
                )
            else:  # detailed
                explanations.append(
                    f"Using deepfake detection model (MobileViT), "
                    f"this video is classified as {verdict}. "
                    f"Confidence: {confidence:.2%}, "
                    f"analyzed {stage1.get('frame_samples_analyzed', 0)} frames. "
                    f"Processing time: {stage1.get('processing_time_ms', 0)}ms."
                )
    
    if "stage2" in stages and detail_level != "simple":
        stage2 = stages["stage2"]
        has_speech = stage2.get("has_speech", False)
        
        if language == "ko":
            if has_speech:
                explanations.append(f"음성이 감지되었으며, 음성 기반 신뢰도는 {stage2.get('confidence', 0.5):.2%}입니다.")
            else:
                explanations.append("음성이 감지되지 않았습니다.")
        else:
            if has_speech:
                explanations.append(f"Speech detected with confidence {stage2.get('confidence', 0.5):.2%}.")
            else:
                explanations.append("No speech detected.")
    
    if "stage3" in stages and detail_level == "detailed":
        stage3 = stages["stage3"]
        final_verdict = stage3.get("final_verdict", "unknown")
        combined_confidence = stage3.get("combined_confidence", 0.0)
        
        if language == "ko":
            explanations.append(
                f"종합 분석 결과, 최종 판정은 {final_verdict}이며, "
                f"통합 신뢰도는 {combined_confidence:.2%}입니다."
            )
        else:
            explanations.append(
                f"Final verdict: {final_verdict} with combined confidence {combined_confidence:.2%}."
            )
    
    if not explanations:
        explanations.append("분석 결과를 찾을 수 없습니다." if language == "ko" else "No analysis results found.")
    
    return {
        "analysis_id": analysis_id,
        "language": language,
        "detail_level": detail_level,
        "explanation": " ".join(explanations),
        "video_path": analysis.get("video_path")
    }


async def save_embedding_impl(analysis_id: str, embedding_vector: List[float] = None, metadata: Dict = None) -> Dict:
    """임베딩 저장"""
    # 임베딩이 제공되지 않으면 자동 생성
    if embedding_vector is None:
        extract_result = await extract_embedding_impl(analysis_id, metadata)
        if "error" in extract_result:
            return extract_result
        return {
            "message": "임베딩 자동 생성 및 저장 완료",
            "embedding_id": extract_result["embedding_id"],
            "analysis_id": analysis_id
        }
    
    # 제공된 임베딩 저장
    embedding_id = str(uuid.uuid4())
    cursor = db_conn.cursor()
    cursor.execute(
        "INSERT INTO embeddings (id, analysis_id, embedding, metadata) VALUES (?, ?, ?, ?)",
        (embedding_id, analysis_id, json.dumps(embedding_vector), json.dumps(metadata or {}))
    )
    db_conn.commit()
    
    return {
        "embedding_id": embedding_id,
        "analysis_id": analysis_id,
        "embedding_dim": len(embedding_vector),
        "message": "임베딩 저장 완료"
    }


async def emit_event_impl(analysis_id: str, event_type: str = "analysis_complete", payload: Dict = None) -> Dict:
    """이벤트 발행 (Kafka 시뮬레이션)"""
    analysis = get_analysis_result(analysis_id)
    if not analysis:
        return {"error": "분석 결과를 찾을 수 없습니다"}
    
    # 이벤트 생성
    event = {
        "event_id": str(uuid.uuid4()),
        "event_type": event_type,
        "analysis_id": analysis_id,
        "timestamp": datetime.now().isoformat(),
        "payload": payload or {},
        "video_path": analysis.get("video_path"),
        "result_summary": analysis.get("result", {}).get("stages", {}).get("stage1", {})
    }
    
    # 로컬 환경에서는 콘솔에 출력
    logger.info(f"[EVENT] {event_type}: {analysis_id}")
    logger.info(f"[EVENT PAYLOAD] {json.dumps(event, ensure_ascii=False, indent=2)}")
    
    # 프로덕션에서는 Kafka로 전송
    # kafka_producer.send('video-analysis-events', event)
    
    return {
        "event_id": event["event_id"],
        "event_type": event_type,
        "analysis_id": analysis_id,
        "message": f"이벤트 발행 완료 (로컬: 콘솔 출력)",
        "timestamp": event["timestamp"]
    }


async def analyze_video_pipeline(video_path: str, stages: List[str]) -> Dict:
    """비디오 분석 파이프라인"""
    if not os.path.exists(video_path):
        return {"error": f"비디오 파일을 찾을 수 없습니다: {video_path}"}
    
    results = {"video_path": video_path, "stages": {}}
    
    # Stage 1: 객체 탐지
    if "stage1" in stages:
        logger.info("Stage 1: 객체 탐지 시작")
        stage1_result = await run_stage1(video_path)
        results["stages"]["stage1"] = stage1_result
        save_analysis_result(video_path, "stage1", stage1_result)
    
    # Stage 2: 음성 분석
    if "stage2" in stages:
        logger.info("Stage 2: 음성 분석 시작")
        stage2_result = await run_stage2(video_path)
        results["stages"]["stage2"] = stage2_result
        save_analysis_result(video_path, "stage2", stage2_result)
    
    # Stage 3: LLM 종합 분석
    if "stage3" in stages:
        logger.info("Stage 3: LLM 종합 분석 시작")
        stage3_result = await run_stage3(
            results["stages"].get("stage1", {}),
            results["stages"].get("stage2", {})
        )
        results["stages"]["stage3"] = stage3_result
        save_analysis_result(video_path, "stage3", stage3_result)
    
    return results


async def run_stage1(video_path: str) -> Dict:
    """Stage 1: 딥페이크 탐지"""
    if not detector:
        return {"error": "LocalDetector가 초기화되지 않았습니다", "detections": []}
    
    try:
        result = await detector.analyze(video_path)
        return {
            "verdict": result.get("verdict", "unknown"),
            "confidence_score": result.get("confidence_score", 0.0),
            "frame_samples_analyzed": result.get("frame_samples_analyzed", 0),
            "model_version": result.get("model_version", "unknown"),
            "processing_time_ms": result.get("processing_time_ms", 0),
            "summary": f"딥페이크 탐지 완료: {result.get('verdict', 'unknown')} (신뢰도: {result.get('confidence_score', 0.0):.2f})"
        }
    except Exception as e:
        logger.error(f"Stage 1 오류: {e}")
        return {"error": str(e), "verdict": "error"}


async def run_stage2(video_path: str) -> Dict:
    """Stage 2: 음성 분석"""
    if not audio_analyzer:
        return {"error": "AudioAnalyzer가 초기화되지 않았습니다", "has_speech": False, "transcript": ""}
    
    try:
        result = audio_analyzer.analyze(video_path)
        return {
            "has_speech": result.get("has_speech", False),
            "confidence": result.get("confidence", 0.5),
            "transcript": result.get("transcript", ""),
            "speech_ratio": result.get("speech_ratio", 0.0),
            "summary": f"음성 분석 완료: {'음성 있음' if result.get('has_speech') else '음성 없음'}"
        }
    except Exception as e:
        logger.error(f"Stage 2 오류: {e}")
        return {"error": str(e), "has_speech": False, "transcript": ""}


async def run_stage3(stage1_result: Dict, stage2_result: Dict) -> Dict:
    """Stage 3: 종합 분석"""
    # Stage 1 결과
    verdict = stage1_result.get("verdict", "unknown")
    video_confidence = stage1_result.get("confidence_score", 0.0)
    
    # Stage 2 결과
    has_speech = stage2_result.get("has_speech", False)
    audio_confidence = stage2_result.get("confidence", 0.5)
    transcription = stage2_result.get("transcript", "")
    
    # 종합 신뢰도 계산 (가중 평균)
    if has_speech:
        combined_confidence = (video_confidence * 0.7) + (audio_confidence * 0.3)
    else:
        combined_confidence = video_confidence
    
    # 최종 판정
    final_verdict = "fake" if combined_confidence > 0.5 else "real"
    
    analysis = {
        "final_verdict": final_verdict,
        "combined_confidence": combined_confidence,
        "video_analysis": {
            "verdict": verdict,
            "confidence": video_confidence
        },
        "audio_analysis": {
            "has_speech": has_speech,
            "confidence": audio_confidence,
            "transcription_length": len(transcription)
        },
        "summary": f"최종 판정: {final_verdict} (신뢰도: {combined_confidence:.2f})"
    }
    
    return analysis


async def main():
    """MCP 서버 시작"""
    logger.info("PawFiler MCP Server 시작")
    
    # 데이터베이스 초기화
    init_db()
    
    # 모델 초기화
    await init_models()
    
    # stdio 서버 실행
    async with stdio_server() as (read_stream, write_stream):
        logger.info("MCP 서버 실행 중...")
        await app.run(read_stream, write_stream, app.create_initialization_options())


if __name__ == "__main__":
    asyncio.run(main())
