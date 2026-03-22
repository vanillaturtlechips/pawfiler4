"""
AIOps Agent - 5분 주기 클러스터 이상 탐지
AWS Bedrock (Claude) + AMP + CloudWatch Logs + K8s
"""
# ..
import logging
import os
import signal
import sys
import time

import schedule

from analyzer import run_analysis

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    stream=sys.stdout,
)
logger = logging.getLogger(__name__)

INTERVAL_MINUTES = int(os.environ.get("ANALYSIS_INTERVAL_MINUTES", "5"))


def main() -> None:
    logger.info(f"AIOps agent starting. Interval: {INTERVAL_MINUTES}min")

    def shutdown(sig, frame):
        logger.info(f"Signal {sig} received, shutting down.")
        sys.exit(0)

    signal.signal(signal.SIGTERM, shutdown)
    signal.signal(signal.SIGINT, shutdown)

    run_analysis()
    schedule.every(INTERVAL_MINUTES).minutes.do(run_analysis)

    while True:
        schedule.run_pending()
        time.sleep(10)


if __name__ == "__main__":
    main()
