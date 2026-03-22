"""
AWS Bedrock converse API 기반 AIOps 분석 루프.
Claude가 tool_use로 AMP/CloudWatch/K8s를 직접 조회해 이상 탐지.
"""
import json
import logging
import os

import boto3

from tools import (
    get_cloudwatch_logs,
    get_pod_status,
    get_prometheus_metrics,
    restart_deployment,
    send_sns_notification,
)

logger = logging.getLogger(__name__)

# Bedrock 설정 (ap-northeast-2에서 미지원 모델은 us-east-1 cross-region 사용)
BEDROCK_REGION = os.environ.get("BEDROCK_REGION", "us-east-1")
BEDROCK_MODEL_ID = os.environ.get(
    "BEDROCK_MODEL_ID",
    "us.anthropic.claude-3-5-haiku-20241022-v1:0",
)

TOOL_CONFIG = {
    "tools": [
        {
            "toolSpec": {
                "name": "get_prometheus_metrics",
                "description": (
                    "AMP(Amazon Managed Prometheus)에서 PromQL 쿼리를 실행해 메트릭을 조회합니다. "
                    "CPU 사용률, 메모리, HTTP 요청 수/에러율, 파드 재시작 수 등을 확인할 수 있습니다."
                ),
                "inputSchema": {
                    "json": {
                        "type": "object",
                        "properties": {
                            "query": {
                                "type": "string",
                                "description": "PromQL 쿼리. 예: 'rate(container_cpu_usage_seconds_total{namespace=\"pawfiler\"}[5m])'",
                            },
                            "time_range_minutes": {
                                "type": "integer",
                                "description": "조회 시간 범위(분). 기본값 30",
                            },
                        },
                        "required": ["query"],
                    }
                },
            }
        },
        {
            "toolSpec": {
                "name": "get_cloudwatch_logs",
                "description": (
                    "CloudWatch Logs에서 최근 로그를 조회합니다. "
                    "에러, 패닉, 타임아웃 등 이상 로그를 검색할 수 있습니다."
                ),
                "inputSchema": {
                    "json": {
                        "type": "object",
                        "properties": {
                            "filter_pattern": {
                                "type": "string",
                                "description": "로그 필터 패턴(대소문자 무시). 예: 'error', 'panic', 'timeout'",
                            },
                            "minutes": {
                                "type": "integer",
                                "description": "조회 시간(분). 기본값 30",
                            },
                        },
                        "required": ["filter_pattern"],
                    }
                },
            }
        },
        {
            "toolSpec": {
                "name": "get_pod_status",
                "description": (
                    "Kubernetes 파드 상태를 조회합니다. "
                    "이상 파드(Pending, CrashLoopBackOff, OOMKilled, 재시작 5회 이상)를 우선 표시합니다."
                ),
                "inputSchema": {
                    "json": {
                        "type": "object",
                        "properties": {
                            "namespace": {
                                "type": "string",
                                "description": "조회할 네임스페이스. 기본값 pawfiler",
                            }
                        },
                        "required": [],
                    }
                },
            }
        },
        {
            "toolSpec": {
                "name": "restart_deployment",
                "description": (
                    "Kubernetes Deployment를 rollout restart합니다. "
                    "파드가 CrashLoopBackOff/OOMKilled/Error 상태이고 자동 복구가 필요할 때만 사용하세요."
                ),
                "inputSchema": {
                    "json": {
                        "type": "object",
                        "properties": {
                            "namespace": {
                                "type": "string",
                                "description": "네임스페이스 (pawfiler 또는 admin)",
                            },
                            "deployment_name": {
                                "type": "string",
                                "description": "재시작할 Deployment 이름",
                            },
                        },
                        "required": ["namespace", "deployment_name"],
                    }
                },
            }
        },
    ]
}

SYSTEM_PROMPT = [
    {
        "text": """당신은 pawfiler EKS 클러스터의 AIOps 에이전트입니다.

클러스터 정보:
- EKS 클러스터: pawfiler-eks-cluster (ap-northeast-2)
- 서비스 네임스페이스: pawfiler, admin
- 주요 서비스: quiz-service, auth-service, user-service, community-service, chat-bot-service, video-analysis-service, admin-service, envoy

분석 순서:
1. get_pod_status로 pawfiler/admin 네임스페이스 이상 파드 확인
2. get_prometheus_metrics로 CPU/메모리/HTTP 에러율 이상 확인
3. get_cloudwatch_logs로 최근 error/panic 로그 확인
4. 이상 감지 시 원인 분석 후 필요하면 restart_deployment

규칙:
- restart_deployment는 CrashLoopBackOff/OOMKilled/Error이고 재시작 5회 이상일 때만 사용
- 분석 결과 마지막 줄에 반드시 "이상 감지 여부: YES" 또는 "이상 감지 여부: NO" 명시
- 이상 감지 시 원인과 조치 내용을 구체적으로 한국어로 설명"""
    }
]


def _exec_tool(name: str, tool_input: dict) -> str:
    try:
        if name == "get_prometheus_metrics":
            result = get_prometheus_metrics(**tool_input)
        elif name == "get_cloudwatch_logs":
            result = get_cloudwatch_logs(**tool_input)
        elif name == "get_pod_status":
            result = get_pod_status(**tool_input)
        elif name == "restart_deployment":
            result = restart_deployment(**tool_input)
        else:
            result = {"error": f"Unknown tool: {name}"}
        logger.info(f"Tool '{name}' OK")
        return json.dumps(result, ensure_ascii=False, default=str)
    except Exception as e:
        logger.error(f"Tool '{name}' failed: {e}", exc_info=True)
        return json.dumps({"error": str(e)})


def run_analysis() -> None:
    """Bedrock converse API 기반 클러스터 이상 탐지 분석"""
    logger.info("=== AIOps analysis started ===")
    bedrock = boto3.client("bedrock-runtime", region_name=BEDROCK_REGION)

    messages = [
        {
            "role": "user",
            "content": [
                {
                    "text": (
                        "pawfiler 클러스터 전체 이상 여부를 점검하세요. "
                        "pawfiler와 admin 네임스페이스 파드 상태, 주요 메트릭, 에러 로그를 확인하고 "
                        "이상 감지 시 적절한 대응을 취하세요."
                    )
                }
            ],
        }
    ]

    for round_num in range(10):
        response = bedrock.converse(
            modelId=BEDROCK_MODEL_ID,
            system=SYSTEM_PROMPT,
            messages=messages,
            toolConfig=TOOL_CONFIG,
        )

        stop_reason = response["stopReason"]
        content = response["output"]["message"]["content"]
        logger.debug(f"Round {round_num + 1}: stopReason={stop_reason}")

        if stop_reason == "end_turn":
            final_text = next(
                (b["text"] for b in content if "text" in b), ""
            )
            logger.info(f"Analysis complete:\n{final_text}")

            if "이상 감지 여부: YES" in final_text:
                send_sns_notification(
                    subject="[AIOps] pawfiler 클러스터 이상 감지",
                    message=final_text,
                )
                logger.warning("Anomaly detected! SNS sent.")
            else:
                logger.info("Cluster healthy.")
            break

        if stop_reason == "tool_use":
            messages.append({"role": "assistant", "content": content})

            tool_results = []
            for block in content:
                if "toolUse" not in block:
                    continue
                tu = block["toolUse"]
                result_text = _exec_tool(tu["name"], tu["input"])
                tool_results.append({
                    "toolResult": {
                        "toolUseId": tu["toolUseId"],
                        "content": [{"text": result_text}],
                    }
                })

            messages.append({"role": "user", "content": tool_results})
    else:
        logger.warning("Analysis exceeded max rounds (10).")

    logger.info("=== AIOps analysis finished ===")
