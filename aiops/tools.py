"""
AIOps Tools - AMP, Loki, Kubernetes 연동
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
PROMETHEUS_LOCAL = os.environ.get(
    "PROMETHEUS_LOCAL", "http://kube-prometheus-stack-prometheus.monitoring.svc.cluster.local:9090"
)
LOKI_ENDPOINT = os.environ.get(
    "LOKI_ENDPOINT", "http://loki.monitoring.svc.cluster.local:3100"
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


def _query_prometheus(base_url: str, params: dict, headers: dict | None = None) -> list:
    resp = requests.get(
        f"{base_url.rstrip('/')}/api/v1/query_range",
        params=params,
        headers=headers or {},
        timeout=30,
    )
    resp.raise_for_status()
    results = []
    for series in resp.json().get("data", {}).get("result", []):
        values = series.get("values", [])
        if values:
            results.append({
                "metric": series.get("metric", {}),
                "latest_value": values[-1][1],
                "sample_count": len(values),
            })
    return results


def get_prometheus_metrics(query: str, time_range_minutes: int = 30) -> dict:
    """PromQL 쿼리 실행. AMP(SigV4)로 먼저 시도, 결과 없으면 in-cluster Prometheus로 폴백."""
    end_ts = int(time.time())
    start_ts = end_ts - (time_range_minutes * 60)
    params = {"query": query, "start": str(start_ts), "end": str(end_ts), "step": "60s"}

    # 1. AMP 시도
    try:
        session = boto3.Session(region_name=REGION)
        credentials = session.get_credentials().get_frozen_credentials()
        aws_req = AWSRequest(method="GET", url=f"{AMP_ENDPOINT.rstrip('/')}/api/v1/query_range", params=params)
        SigV4Auth(credentials, "aps", REGION).add_auth(aws_req)
        results = _query_prometheus(AMP_ENDPOINT, params, dict(aws_req.headers))
        if results:
            return {"source": "amp", "query": query, "series_count": len(results), "results": results[:20]}
    except Exception as e:
        logger.debug(f"AMP query failed, falling back to in-cluster: {e}")

    # 2. In-cluster Prometheus 폴백
    results = _query_prometheus(PROMETHEUS_LOCAL, params)
    return {"source": "local", "query": query, "series_count": len(results), "results": results[:20]}


def get_loki_logs(filter_pattern: str, namespace: str = "pawfiler", minutes: int = 30) -> dict:
    """Loki에서 최근 로그 조회. LogQL로 에러/패닉/타임아웃 등 이상 로그 검색."""
    end_ns = int(time.time() * 1e9)
    start_ns = end_ns - (minutes * 60 * int(1e9))
    logql = f'{{namespace="{namespace}"}} |~ "(?i){filter_pattern}"'

    resp = requests.get(
        f"{LOKI_ENDPOINT}/loki/api/v1/query_range",
        params={"query": logql, "start": str(start_ns), "end": str(end_ns), "limit": 20},
        timeout=30,
    )
    resp.raise_for_status()

    logs = []
    for stream in resp.json().get("data", {}).get("result", []):
        labels = stream.get("stream", {})
        for ts_ns, line in stream.get("values", []):
            logs.append({
                "timestamp": datetime.datetime.utcfromtimestamp(int(ts_ns) / 1e9).strftime("%Y-%m-%dT%H:%M:%SZ"),
                "pod": labels.get("pod", ""),
                "container": labels.get("container", ""),
                "message": line,
            })
    logs.sort(key=lambda x: x["timestamp"], reverse=True)
    return {"filter_pattern": filter_pattern, "namespace": namespace, "log_count": len(logs), "logs": logs[:20]}


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


def describe_pod_events(namespace: str, pod_name: str) -> dict:
    """파드 이벤트 조회. Pending/Error 파드의 원인(스케줄링 실패, 리소스 부족 등) 파악에 사용."""
    v1, _ = _k8s()
    events = v1.list_namespaced_event(
        namespace=namespace,
        field_selector=f"involvedObject.name={pod_name}",
    )
    result = []
    for e in events.items:
        result.append({
            "type": e.type,
            "reason": e.reason,
            "message": e.message,
            "count": e.count,
            "last_time": str(e.last_timestamp),
        })
    result.sort(key=lambda x: x["last_time"], reverse=True)
    return {"pod": pod_name, "namespace": namespace, "events": result[:10]}


def restart_deployment(namespace: str, deployment_name: str) -> dict:
    """Deployment rollout restart. Deployment 리소스 전용 - RayCluster/StatefulSet/DaemonSet 등 CRD에는 사용 불가."""
    _, apps_v1 = _k8s()
    try:
        apps_v1.read_namespaced_deployment(name=deployment_name, namespace=namespace)
    except k8s_client.exceptions.ApiException as e:
        if e.status == 404:
            return {
                "error": f"'{deployment_name}'은 Deployment가 아닙니다. RayCluster/StatefulSet 등 CRD는 재시작할 수 없습니다.",
                "suggestion": "파드를 직접 삭제하거나 수동 조치가 필요합니다.",
            }
        raise
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
