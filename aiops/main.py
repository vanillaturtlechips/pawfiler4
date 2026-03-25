"""
AIOps Agent - 클러스터 이상 탐지 + FastAPI HTTP 서버

분석 주기 (Adaptive Interval):
  - 평상시: ANALYSIS_INTERVAL_MINUTES (기본 5분)
  - 이상 감지 후: ANOMALY_INTERVAL_MINUTES (기본 1분)
  - 연속 정상 RECOVERY_COUNT회 후 평상시 주기로 복귀

환경변수:
  ANALYSIS_INTERVAL_MINUTES : 평상시 분석 주기 (기본 5)
  ANOMALY_INTERVAL_MINUTES  : 이상 감지 후 분석 주기 (기본 1)
  RECOVERY_COUNT            : 정상 복귀 판단 연속 횟수 (기본 3)
  API_PORT                  : FastAPI 포트 (기본 8090)
  MOCK_MODE=true            : K8s/Loki 없이 mock 데이터 반환 (로컬 개발용)
  MOCK_MODE=false           : 실제 클러스터 연결 (기본값, 프로덕션)
"""
import logging
import os
import signal
import sys
import threading
import time

import uvicorn

from analyzer import run_analysis

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    stream=sys.stdout,
)
logger = logging.getLogger(__name__)

INTERVAL_MINUTES        = int(os.environ.get("ANALYSIS_INTERVAL_MINUTES", "5"))
ANOMALY_INTERVAL_MINUTES = int(os.environ.get("ANOMALY_INTERVAL_MINUTES", "1"))
RECOVERY_COUNT          = int(os.environ.get("RECOVERY_COUNT", "3"))
API_PORT                = int(os.environ.get("API_PORT", "8090"))
MOCK_MODE               = os.environ.get("MOCK_MODE", "false").lower() == "true"


def run_scheduler() -> None:
    """Adaptive interval 분석 루프 (별도 스레드)."""
    if MOCK_MODE:
        logger.info("MOCK_MODE enabled: skipping analysis scheduler")
        return

    anomaly_mode = False      # 현재 이상 감지 모드 여부
    normal_streak = 0         # 연속 정상 횟수

    logger.info(
        f"Scheduler starting. "
        f"normal={INTERVAL_MINUTES}min, "
        f"anomaly={ANOMALY_INTERVAL_MINUTES}min, "
        f"recovery_count={RECOVERY_COUNT}"
    )

    while True:
        try:
            anomaly = run_analysis()

            if anomaly:
                normal_streak = 0
                if not anomaly_mode:
                    anomaly_mode = True
                    logger.warning(
                        f"Anomaly detected! Switching to fast interval ({ANOMALY_INTERVAL_MINUTES}min)"
                    )
            else:
                normal_streak += 1
                if anomaly_mode and normal_streak >= RECOVERY_COUNT:
                    anomaly_mode = False
                    normal_streak = 0
                    logger.info(
                        f"Cluster recovered ({RECOVERY_COUNT} consecutive normal). "
                        f"Switching back to normal interval ({INTERVAL_MINUTES}min)"
                    )

        except Exception as e:
            logger.error(f"Analysis failed: {e}", exc_info=True)

        interval = ANOMALY_INTERVAL_MINUTES if anomaly_mode else INTERVAL_MINUTES
        logger.debug(f"Next analysis in {interval}min (anomaly_mode={anomaly_mode})")
        time.sleep(interval * 60)


def main() -> None:
    logger.info(f"AIOps starting (mock={MOCK_MODE}, port={API_PORT})")

    def shutdown(sig, frame):
        logger.info(f"Signal {sig} received, shutting down.")
        sys.exit(0)

    signal.signal(signal.SIGTERM, shutdown)
    signal.signal(signal.SIGINT, shutdown)

    t = threading.Thread(target=run_scheduler, daemon=True)
    t.start()

    uvicorn.run("api:app", host="0.0.0.0", port=API_PORT, log_level="info")


if __name__ == "__main__":
    main()
