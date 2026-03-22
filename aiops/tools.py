"""
AIOps Tools - AMP, CloudWatch Logs, Kubernetes 연동
"""
import datetime
import logging
import os
import time

import boto3
import requests
from botocore.auth import SigV4Auth
from botocore.awsrequest import AWSRequest
from kubernetes import client as k8s_client
from kubernetes import config as k8s_config

logger = logging.getLogger(__name__)

REGION = os.environ.get("AWS_REGION", "ap-northeast-2")
AMP_ENDPOINT = os.environ.get(
    "AMP_ENDPOINT",
    "https://aps-workspaces.ap-northeast-2.amazonaws.com/workspaces/ws-0f0a9920-3ba9-4e8e-98e0-d36bfc945836/",
)
CW_LOG_GROUP = os.environ.get(
    "CW_LOG_GROUP", "/aws/eks/pawfiler-eks-cluster/pods"
)
SNS_TOPIC_ARN = os.environ.get(
    "SNS_TOPIC_ARN",
    "arn:aws:sns:ap-northeast-2:009946608368:pawfiler-aiops",
)


def _k8s() -> tuple[k8s_client.CoreV1Api, k8s_client.AppsV1Api]:
    try:
        k8s_config.load_incluster_config()
    except k8s_config.ConfigException:
        k8s_config.load_kube_config()
    return k8s_client.CoreV1Api(), k8s_client.AppsV1Api()


def get_prometheus_metrics(query: str, time_range_minutes: int = 30) -> dict:
    """AMP에서 PromQL 쿼리 실행 (SigV4 인증)"""
    session = boto3.Session(region_name=REGION)
    credentials = session.get_credentials().get_frozen_credentials()

    end_ts = int(time.time())
    start_ts = end_ts - (time_range_minutes * 60)
    url = f"{AMP_ENDPOINT.rstrip('/')}/api/v1/query_range"
    params = {"query": query, "start": str(start_ts), "end": str(end_ts), "step": "60s"}

    aws_req = AWSRequest(method="GET", url=url, params=params)
    SigV4Auth(credentials, "aps", REGION).add_auth(aws_req)

    resp = requests.get(url, params=params, headers=dict(aws_req.headers), timeout=30)
    resp.raise_for_status()
    data = resp.json()

    results = []
    for series in data.get("data", {}).get("result", []):
        values = series.get("values", [])
        if values:
            results.append({
                "metric": series.get("metric", {}),
                "latest_value": values[-1][1],
                "sample_count": len(values),
            })

    return {"query": query, "series_count": len(results), "results": results[:20]}


def get_cloudwatch_logs(filter_pattern: str, minutes: int = 30) -> dict:
    """CloudWatch Logs Insights로 최근 로그 조회"""
    client = boto3.client("logs", region_name=REGION)
    end_ts = int(time.time())
    start_ts = end_ts - (minutes * 60)

    query_id = client.start_query(
        logGroupName=CW_LOG_GROUP,
        startTime=start_ts,
        endTime=end_ts,
        queryString=(
            f"fields @timestamp, @message "
            f"| filter @message like /(?i){filter_pattern}/ "
            f"| sort @timestamp desc | limit 20"
        ),
    )["queryId"]

    for _ in range(30):
        result = client.get_query_results(queryId=query_id)
        if result["status"] in ("Complete", "Failed", "Cancelled"):
            break
        time.sleep(1)

    logs = [
        {f["field"]: f["value"] for f in row}
        for row in result.get("results", [])
    ]
    return {"filter_pattern": filter_pattern, "log_count": len(logs), "logs": logs}


def get_pod_status(namespace: str = "pawfiler") -> dict:
    """Kubernetes 파드 상태 조회 (이상 파드 우선)"""
    v1, _ = _k8s()
    pods = v1.list_namespaced_pod(namespace=namespace)

    normal, abnormal = [], []
    for pod in pods.items:
        phase = pod.status.phase or "Unknown"
        containers = []
        for cs in pod.status.container_statuses or []:
            state, reason = "unknown", ""
            if cs.state.running:
                state = "running"
            elif cs.state.waiting:
                state, reason = "waiting", cs.state.waiting.reason or ""
            elif cs.state.terminated:
                state, reason = "terminated", cs.state.terminated.reason or ""

            containers.append({
                "name": cs.name,
                "ready": cs.ready,
                "restart_count": cs.restart_count,
                "state": state,
                "reason": reason,
            })

        info = {"name": pod.metadata.name, "phase": phase, "containers": containers}
        is_bad = phase in ("Pending", "Failed", "Unknown") or any(
            c["reason"] in ("CrashLoopBackOff", "OOMKilled", "Error", "ImagePullBackOff")
            or c["restart_count"] >= 5
            for c in containers
        )
        (abnormal if is_bad else normal).append(info)

    return {
        "namespace": namespace,
        "total": len(pods.items),
        "abnormal_count": len(abnormal),
        "abnormal": abnormal,
        "normal": normal,
    }


def restart_deployment(namespace: str, deployment_name: str) -> dict:
    """Deployment rollout restart"""
    _, apps_v1 = _k8s()
    now = datetime.datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")
    apps_v1.patch_namespaced_deployment(
        name=deployment_name,
        namespace=namespace,
        body={"spec": {"template": {"metadata": {"annotations": {
            "kubectl.kubernetes.io/restartedAt": now
        }}}}},
    )
    logger.info(f"Restarted {namespace}/{deployment_name}")
    return {"status": "restarted", "deployment": deployment_name, "namespace": namespace}


def send_sns_notification(subject: str, message: str) -> None:
    """SNS 알림 전송"""
    boto3.client("sns", region_name=REGION).publish(
        TopicArn=SNS_TOPIC_ARN,
        Subject=subject[:100],
        Message=message,
    )
    logger.info(f"SNS sent: {subject}")
