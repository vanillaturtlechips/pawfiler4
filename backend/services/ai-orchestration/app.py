"""
PawFiler AI — Ray Serve 멀티 에이전트 AI 영상 딥페이크 음성 탐지 시스템
==========================================================

배포 구조:
    Layer 1: SharedModelWorker (GPU 싱글톤, EFS에서 모델 로드)
    Layer 2: VideoAgent / AudioAgent / SyncAgent / FusionAgent (논리적 에이전트)
    Layer 3: Orchestrator (Ingress — Cascade → Fan-out → Fan-in)
    Layer 4: Prometheus 메트릭 + Health Check

실행:
    serve run app:deployment_graph --host 0.0.0.0 --port 8000
"""

import asyncio
import time
import logging
import os
from typing import Optional

import numpy as np
import torch
import ray
from ray import serve
from starlette.requests import Request
from starlette.responses import JSONResponse
from starlette.middleware.cors import CORSMiddleware

from models import SharedModelWorker
from agents import VideoAgent, AudioAgent, SyncAgent, FusionAgent
from cascade import XGBoostGate
from metrics import MetricsCollector

logger = logging.getLogger("pawfiler")


# ============================================================
# Layer 3: Orchestrator (HTTP Ingress + DAG 제어)
# ============================================================

@serve.deployment(
    name="orchestrator",
    num_replicas=1,
    ray_actor_options={"num_cpus": 0.2},
    health_check_period_s=30,
    health_check_timeout_s=10,
)
class Orchestrator:
    """
    사용자 요청의 진입점.
    Cascade Gate로 경량 판별 후, 불확실한 케이스만 Deep Path로 보냄.
    
    Flow:
        1. 전처리 (프레임 추출, 오디오 분리)
        2. XGBoost Cascade Gate (~80%가 여기서 종료)
        3. [불확실] Fan-out: Video/Audio/Sync 에이전트 병렬 호출
        4. Fan-in: FusionAgent로 최종 판단
        5. 응답 반환
    """

    def __init__(
        self,
        cascade_gate: XGBoostGate,
        video_agent: VideoAgent,
        audio_agent: AudioAgent,
        sync_agent: SyncAgent,
        fusion_agent: FusionAgent,
        metrics: MetricsCollector,
    ):
        self.cascade = cascade_gate
        self.video = video_agent
        self.audio = audio_agent
        self.sync = sync_agent
        self.fusion = fusion_agent
        self.metrics = metrics
        self._ready = True
        logger.info("Orchestrator initialized")

    async def __call__(self, request: Request) -> JSONResponse:
        # CORS preflight
        if request.method == "OPTIONS":
            return JSONResponse({}, headers={
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "POST, OPTIONS",
                "Access-Control-Allow-Headers": "*",
            })
        
        # 라우팅
        path = request.url.path
        if path == "/rerun":
            return await self._handle_rerun(request)
        else:
            return await self._handle_analysis(request)

    async def _handle_analysis(self, request: Request) -> JSONResponse:
        t0 = time.perf_counter()

        # ── 1. 입력 파싱 (multipart 파일 업로드 또는 JSON media_url) ──
        content_type = request.headers.get("content-type", "")
        if "multipart/form-data" in content_type:
            form = await request.form()
            video_file = form.get("video")
            modality = form.get("modality", "both")
            if video_file is None:
                return JSONResponse({"error": "video field required"}, status_code=400)
            import tempfile, os, shutil
            tmpdir = tempfile.mkdtemp()
            video_path = os.path.join(tmpdir, "input.mp4")
            try:
                contents = await video_file.read()
                with open(video_path, "wb") as f:
                    f.write(contents)
                media_url = f"file://{video_path}"
                preprocessed = await self._preprocess(media_url, modality)
            finally:
                pass  # tmpdir은 _preprocess_sync 내부에서 정리
        else:
            body = await request.json()
            media_url: str = body["media_url"]
            modality: str = body.get("modality", "both")
            preprocessed = await self._preprocess(media_url, modality)

        # ── 3. Cascade Gate (XGBoost, CPU, ~50ms) ──
        # 모델 미학습 상태이므로 항상 Deep Path로
        if False and preprocessed.get("frames") is not None:
            cascade_result = await self.cascade.predict.remote(
                preprocessed["hand_crafted_features"]
            )

            if cascade_result["confident"]:
                # ~80% 케이스: 즉시 반환
                elapsed = (time.perf_counter() - t0) * 1000
                await self.metrics.record.remote(
                    "cascade_hit", elapsed_ms=elapsed
                )
                return JSONResponse(
                    self._format_response(cascade_result, elapsed, deep=False, metadata=preprocessed.get("metadata", {})),
                    headers={"Access-Control-Allow-Origin": "*"}
                )

        # ── 4. Deep Path: Fan-out (비동기 병렬) ──
        tasks = {}

        if modality in ("video", "both") and preprocessed.get("frames") is not None:
            frames_ref = ray.put(preprocessed["frames"])
            tasks["video"] = self.video.predict.remote(frames_ref)

        if modality in ("audio", "both") and preprocessed.get("audio") is not None:
            audio_ref = ray.put(preprocessed["audio"])
            tasks["audio"] = self.audio.predict.remote(audio_ref)

        if modality == "both" and len(tasks) == 2 and preprocessed.get("has_face", False):
            tasks["sync"] = self.sync.predict.remote(frames_ref, audio_ref)

        # ── 5. Fan-in ──
        results = {}
        gathered = await asyncio.gather(*[tasks[k] for k in tasks], return_exceptions=True)
        for key, result in zip(tasks.keys(), gathered):
            if isinstance(result, Exception):
                logger.error(f"Agent {key} failed: {result}")
                results[key] = self._fallback_result(key)
            else:
                results[key] = result

        # ── 6. Fusion ──
        results["metadata"] = preprocessed.get("metadata", {})
        verdict = await self.fusion.ensemble.remote(results)

        elapsed = (time.perf_counter() - t0) * 1000
        await self.metrics.record.remote("deep_path", elapsed_ms=elapsed)

        return JSONResponse(
            self._format_response(verdict, elapsed, deep=True, metadata=preprocessed.get("metadata", {})),
            headers={"Access-Control-Allow-Origin": "*"}
        )

    async def _handle_rerun(self, request: Request) -> JSONResponse:
        """특정 에이전트만 재실행"""
        content_type = request.headers.get("content-type", "")
        
        if "multipart/form-data" in content_type:
            form = await request.form()
            video_file = form.get("video")
            agents = form.get("agents", "").split(",")  # "visual,audio,metadata"
            
            import tempfile
            tmpdir = tempfile.mkdtemp()
            video_path = os.path.join(tmpdir, "input.mp4")
            contents = await video_file.read()
            with open(video_path, "wb") as f:
                f.write(contents)
            media_url = f"file://{video_path}"
        else:
            body = await request.json()
            media_url = body["media_url"]
            agents = body["agents"]
        
        modality = "both"
        preprocessed = await self._preprocess(media_url, modality)
        
        tasks = {}
        if "visual" in agents and preprocessed.get("frames") is not None:
            frames_ref = ray.put(preprocessed["frames"])
            tasks["video"] = self.video.predict.remote(frames_ref)
        
        if "audio" in agents and preprocessed.get("audio") is not None:
            audio_ref = ray.put(preprocessed["audio"])
            tasks["audio"] = self.audio.predict.remote(audio_ref)
        
        results = {}
        if tasks:
            gathered = await asyncio.gather(*[tasks[k] for k in tasks], return_exceptions=True)
            for key, result in zip(tasks.keys(), gathered):
                results[key] = result if not isinstance(result, Exception) else self._fallback_result(key)
        
        if "metadata" in agents:
            results["metadata"] = preprocessed.get("metadata", {})
        
        return JSONResponse({"agents": results}, headers={"Access-Control-Allow-Origin": "*"})

    # ── Health Check ──
    def _infer_deepfake(self, frames_np) -> dict:
        """latest.pt DeepfakeClassifier로 추론"""
        import torch, torch.nn as nn, timm, os
        AI_MODELS = [
            'AccVideo','AnimateDiff','Cogvideox1.5','EasyAnimate','Gen2','Gen3',
            'HunyuanVideo','IPOC','Jimeng','LTX','Luma','Open-Sora',
            'OpenSource_I2V_EasyAnimate','OpenSource_I2V_LTX','OpenSource_I2V_Pyramid-Flow',
            'OpenSource_I2V_SEINE','OpenSource_I2V_SVD','OpenSource_I2V_VideoCrafter',
            'OpenSource_V2V_Cogvideox1.5','OpenSource_V2V_LTX','Opensora','Pyramid-Flow',
            'Real','RepVideo','SEINE','SVD','Sora','VideoCrafter','Wan2.1',
            'causvid_24fps','vidu','wan','real','fake','audio_fake',
        ]
        REAL_CLASSES = {'Real', 'real'}
        NUM_CLASSES = len(AI_MODELS)

        class DeepfakeClassifier(nn.Module):
            def __init__(self):
                super().__init__()
                self.backbone = timm.create_model('tf_efficientnet_b4', pretrained=False, num_classes=0)
                self.lstm = nn.LSTM(1792, 512, num_layers=1, batch_first=True)
                self.classifier = nn.Sequential(
                    nn.Linear(512, 256), nn.ReLU(), nn.Dropout(0.3), nn.Linear(256, NUM_CLASSES)
                )
            def forward(self, x):
                b, f, c, h, w = x.size()
                x = x.view(b * f, c, h, w)
                features = self.backbone(x).view(b, f, -1)
                _, (h, _) = self.lstm(features)
                return self.classifier(h.squeeze(0))

        if not hasattr(self, '_deepfake_model'):
            model_path = os.path.join(os.environ.get('MODEL_DIR', '/app/efs_models'), 'latest.pt')
            m = DeepfakeClassifier()
            m.load_state_dict(torch.load(model_path, map_location='cpu', weights_only=False))
            m.eval()
            self._deepfake_model = m

        if frames_np is None:
            return {"confident": False, "verdict": "real", "confidence": 0.5,
                    "breakdown": {"video": {"is_fake": False, "ai_model": None, "confidence": 0.5}}}

        # frames_np: (16, 3, 224, 224) float32
        tensor = torch.tensor(frames_np).unsqueeze(0)  # (1, 16, 3, 224, 224)
        with torch.no_grad():
            logits = self._deepfake_model(tensor)
            probs = torch.softmax(logits, dim=1).squeeze().numpy()

        top_idx = int(np.argmax(probs))
        top_label = AI_MODELS[top_idx]
        confidence = float(probs[top_idx])
        is_fake = top_label not in REAL_CLASSES

        return {
            "confident": True,
            "verdict": "fake" if is_fake else "real",
            "confidence": round(confidence, 4),
            "breakdown": {"video": {"is_fake": is_fake, "ai_model": top_label if is_fake else None, "confidence": round(confidence, 4)}},
        }

    async def check_health(self):
        """K8s readiness probe 용. 모델 로드 실패 시 트래픽 차단."""
        if not self._ready:
            raise RuntimeError("Orchestrator not ready")

    # ── Private helpers ──
    async def _preprocess(self, media_url: str, modality: str) -> dict:
        import asyncio
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(None, self._preprocess_sync, media_url, modality)

    def _preprocess_sync(self, media_url: str, modality: str) -> dict:
        """
        영상 URL → 프레임 추출 + 오디오 분리 + hand-crafted features.
        decord로 프레임 추출, ffmpeg로 오디오 분리.
        """
        import tempfile, os, subprocess, urllib.request
        import cv2
        from scipy.fft import dct

        tmpdir = tempfile.mkdtemp()
        try:
            if media_url.startswith("file://"):
                video_path = media_url[7:]
            else:
                video_path = os.path.join(tmpdir, "input.mp4")
                if media_url.startswith("s3://"):
                    import boto3
                    s3 = boto3.client(
                        "s3",
                        endpoint_url=os.getenv("AWS_ENDPOINT_URL"),
                        aws_access_key_id=os.getenv("AWS_ACCESS_KEY_ID"),
                        aws_secret_access_key=os.getenv("AWS_SECRET_ACCESS_KEY"),
                    )
                    bucket, key = media_url[5:].split("/", 1)
                    s3.download_file(bucket, key, video_path)
                else:
                    urllib.request.urlretrieve(media_url, video_path)
            print(f"[DEBUG] video downloaded, size={os.path.getsize(video_path)}", flush=True)

            # ── 2. 프레임 추출 (decord, 16프레임 균등 샘플링) ──
            frames_np = None
            if modality in ("video", "both"):
                try:
                    from decord import VideoReader, cpu
                    vr = VideoReader(video_path, ctx=cpu(0))
                    total = len(vr)
                    indices = np.linspace(0, total - 1, 16, dtype=int)
                    frames = vr.get_batch(indices).asnumpy()  # (16, H, W, C)
                    # (16, H, W, C) → resize → (16, C, H, W)
                    resized = np.stack([
                        cv2.resize(f, (224, 224)).transpose(2, 0, 1)
                        for f in frames
                    ]).astype(np.float32) / 255.0
                    frames_np = resized  # (16, 3, 224, 224)
                    print(f"[DEBUG] frames_np shape={frames_np.shape}", flush=True)
                except Exception as e:
                    logger.error(f"Frame extraction failed: {e}")
                    print(f"[DEBUG] Frame extraction failed: {e}", flush=True)

            # ── 3. 오디오 추출 (ffmpeg, 16kHz mono wav) ──
            audio_np = None
            if modality in ("audio", "both"):
                try:
                    audio_path = os.path.join(tmpdir, "audio.wav")
                    subprocess.run([
                        "ffmpeg", "-y", "-i", video_path,
                        "-ac", "1", "-ar", "16000",
                        "-vn", audio_path
                    ], check=True, capture_output=True)
                    import soundfile as sf
                    audio_np, _ = sf.read(audio_path, dtype="float32")
                    # 무음 체크 (RMS < 0.001)
                    if len(audio_np) == 0 or np.sqrt(np.mean(audio_np**2)) < 0.001:
                        audio_np = None
                        print("[DEBUG] Audio is silent, skipping", flush=True)
                except Exception as e:
                    logger.error(f"Audio extraction failed: {e}")
                    print(f"[DEBUG] Audio extraction failed: {e}", flush=True)

            # ── 4. 얼굴 감지 (Sync 활성화 여부) ──
            has_face = False
            if frames_np is not None:
                try:
                    face_cascade = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_frontalface_default.xml")
                    face_count = sum(
                        1 for f in frames_np
                        if len(face_cascade.detectMultiScale(
                            (f.transpose(1, 2, 0) * 255).astype(np.uint8),
                            scaleFactor=1.1, minNeighbors=3
                        )) > 0
                    )
                    has_face = face_count >= len(frames_np) // 2
                except Exception as e:
                    logger.warning(f"Face detection failed: {e}")

            # ── 5. Hand-crafted features (XGBoost용) ──
            hand_crafted = self._extract_hand_crafted(frames_np)

            # ── 5. 메타데이터 (ffprobe) ──
            metadata = {}
            try:
                import json as _json
                probe = subprocess.run([
                    "ffprobe", "-v", "quiet", "-print_format", "json",
                    "-show_streams", "-show_format", video_path
                ], capture_output=True, text=True, timeout=10)
                if probe.returncode == 0:
                    info = _json.loads(probe.stdout)
                    fmt = info.get("format", {})
                    video_stream = next((s for s in info.get("streams", []) if s.get("codec_type") == "video"), {})
                    audio_stream = next((s for s in info.get("streams", []) if s.get("codec_type") == "audio"), {})
                    metadata = {
                        "codec": video_stream.get("codec_name", "unknown"),
                        "resolution": f"{video_stream.get('width', 0)}x{video_stream.get('height', 0)}",
                        "fps": video_stream.get("r_frame_rate", "unknown"),
                        "bitrate": int(fmt.get("bit_rate", 0)) // 1000,
                        "duration": round(float(fmt.get("duration", 0)), 2),
                        "size_mb": round(float(fmt.get("size", 0)) / 1024 / 1024, 2),
                        "audio_codec": audio_stream.get("codec_name", "none"),
                        "format": fmt.get("format_name", "unknown"),
                    }
            except Exception as e:
                logger.warning(f"ffprobe failed: {e}")

            return {
                "frames": frames_np,
                "audio": audio_np,
                "hand_crafted_features": hand_crafted,
                "metadata": metadata,
                "has_face": has_face,
            }
        finally:
            import shutil
            shutil.rmtree(tmpdir, ignore_errors=True)

    def _extract_hand_crafted(self, frames_np: np.ndarray) -> dict:
        """
        frames_np: (T, C, H, W) float32 [0,1]
        """
        if frames_np is None:
            return {
                "laplacian_var": 0.0, "dct_ratio": 0.0,
                "channel_stats": [0.0] * 6,
                "temporal_diff_mean": 0.0, "temporal_diff_std": 0.0,
            }
        import cv2
        from scipy.fft import dct as scipy_dct

        # 중간 프레임 기준으로 계산
        mid = frames_np[len(frames_np) // 2]  # (C, H, W)
        gray = (mid[0] * 0.299 + mid[1] * 0.587 + mid[2] * 0.114)  # (H, W)
        gray_uint8 = (gray * 255).astype(np.uint8)

        # laplacian variance (고주파 성분)
        lap = cv2.Laplacian(gray_uint8, cv2.CV_64F)
        laplacian_var = float(lap.var())

        # DCT 저주파 비율
        dct_coeffs = scipy_dct(scipy_dct(gray, axis=0), axis=1)
        h, w = dct_coeffs.shape
        low_freq = float(np.abs(dct_coeffs[:h//8, :w//8]).sum())
        total_freq = float(np.abs(dct_coeffs).sum()) + 1e-8
        dct_ratio = low_freq / total_freq

        # RGB 채널별 mean/std (6개)
        channel_stats = []
        for c in range(3):
            channel_stats.append(float(frames_np[:, c].mean()))
            channel_stats.append(float(frames_np[:, c].std()))

        # 프레임 간 temporal diff
        diffs = np.abs(np.diff(frames_np, axis=0)).mean(axis=(1, 2, 3))
        temporal_diff_mean = float(diffs.mean())
        temporal_diff_std = float(diffs.std())

        return {
            "laplacian_var": laplacian_var,
            "dct_ratio": dct_ratio,
            "channel_stats": channel_stats,
            "temporal_diff_mean": temporal_diff_mean,
            "temporal_diff_std": temporal_diff_std,
        }

    def _format_response(self, result: dict, elapsed_ms: float, deep: bool, metadata: dict = {}) -> dict:
        """문서 §8의 최종 출력 포맷에 맞춤."""
        breakdown = result.get("breakdown", {})
        # 프론트엔드 에이전트 탭용 상세 필드 보강
        agents = {
            "video": {
                **breakdown.get("video", {}),
                "frame_scores": breakdown.get("video", {}).get("frame_scores", []),
                "top_k": breakdown.get("video", {}).get("top_k", []),
            },
            "audio": {
                **breakdown.get("audio", {}),
                "segment_scores": breakdown.get("audio", {}).get("segment_scores", []),
            },
            "sync": breakdown.get("sync", {}),
            "fusion": {
                "weights": {"video": 0.7, "audio": 0.3},
                "reasoning": result.get("explanation", ""),
            },
        }
        return {
            "verdict": result.get("verdict", "unknown"),
            "confidence": result.get("confidence", 0.0),
            "breakdown": breakdown,
            "agents": agents,
            "explanation": result.get("explanation", ""),
            "similar_cases": result.get("similar_cases", []),
            "metadata": metadata,
            "meta": {
                "latency_ms": round(elapsed_ms, 2),
                "path": "cascade" if not deep else "deep",
                "frames_analyzed": 16,
            },
        }

    def _fallback_result(self, agent_key: str) -> dict:
        """에이전트 실패 시 안전한 기본값 (graceful degradation)."""
        return {
            "confidence": 0.0,
            "verdict": "error",
            "agent": agent_key,
        }


# ============================================================
# Deployment Graph 조립
# ============================================================

def build_app(args: dict = {}):
    """
    Ray Serve Deployment Graph를 조립하는 팩토리.
    
    의존성 주입 순서:
        1. SharedModelWorker (GPU) — 가장 먼저, 모델 로드
        2. XGBoostGate (CPU) — Cascade 1단계
        3. 각 Agent — SharedModelWorker의 handle을 참조
        4. FusionAgent — 독립 (입력만 받으면 동작)
        5. MetricsCollector — Prometheus 수집
        6. Orchestrator — 위 모든 것을 조합
    """
    import os
    model_dir = os.environ.get("MODEL_DIR", "/home/user/Documents/finalproject/pawfiler4/backend/services/ai-orchestration/efs_models")

    # Layer 1: GPU 싱글톤
    model_worker = SharedModelWorker.bind(model_dir=model_dir)

    # Cascade Gate (CPU)
    cascade_gate = XGBoostGate.bind(
        model_path=os.path.join(model_dir, "xgboost_cascade.pkl"),
    )

    # Layer 2: 논리적 에이전트 (model_worker handle 주입)
    video_agent = VideoAgent.bind(model_worker)
    audio_agent = AudioAgent.bind(model_worker)
    sync_agent = SyncAgent.bind(model_worker)
    fusion_agent = FusionAgent.bind()

    # Layer 4: 메트릭 수집
    metrics = MetricsCollector.bind()

    # Layer 3: 오케스트레이터 (모든 에이전트를 조합)
    orchestrator = Orchestrator.bind(
        cascade_gate,
        video_agent,
        audio_agent,
        sync_agent,
        fusion_agent,
        metrics,
    )

    return orchestrator


# `serve run app:deployment_graph` 으로 실행
deployment_graph = build_app()
