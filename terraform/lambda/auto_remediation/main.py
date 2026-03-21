import json
import boto3
import os
import logging

logger = logging.getLogger()
logger.setLevel(logging.INFO)


def lambda_handler(event, context):
    """DevOps Guru 인사이트 이벤트 → SNS 알림 + 자동 대응"""
    logger.info(f"Received event: {json.dumps(event)}")

    detail = event.get("detail", {})
    insight_type = detail.get("insightType", "UNKNOWN")
    severity = detail.get("insightSeverity", "UNKNOWN")
    insight_id = detail.get("id", "UNKNOWN")
    insight_name = detail.get("name", "N/A")
    region = event.get("region", os.environ.get("AWS_REGION", "ap-northeast-2"))

    sns = boto3.client("sns", region_name=region)

    message = {
        "alert": "DevOps Guru Insight Detected",
        "insight_id": insight_id,
        "insight_name": insight_name,
        "type": insight_type,
        "severity": severity,
        "region": region,
        "console_url": (
            f"https://{region}.console.aws.amazon.com/devops-guru/home"
            f"?region={region}#/insights/{insight_id}"
        ),
    }

    sns.publish(
        TopicArn=os.environ["SNS_TOPIC_ARN"],
        Subject=f"[AIOps] DevOps Guru {severity} Insight: {insight_name}",
        Message=json.dumps(message, ensure_ascii=False, indent=2),
    )

    logger.info(f"SNS notification sent for insight {insight_id} (severity: {severity})")

    # HIGH severity 자동 대응
    if severity == "HIGH":
        logger.info(f"HIGH severity detected - initiating auto-remediation")
        handle_high_severity(detail, region)

    return {
        "statusCode": 200,
        "body": json.dumps({"message": "processed", "insight_id": insight_id}),
    }


def handle_high_severity(detail, region):
    """HIGH severity 인사이트 자동 대응 - EKS deployment 재시작"""
    cluster_name = os.environ.get("CLUSTER_NAME", "")
    if not cluster_name:
        logger.warning("CLUSTER_NAME not set, skipping auto-remediation")
        return

    # 영향받은 리소스에서 네임스페이스/서비스 파악
    anomalies = detail.get("anomalies", [])
    affected_namespaces = set()

    for anomaly in anomalies:
        metrics = anomaly.get("sourceDetails", {}).get("cloudWatchMetrics", [])
        for m in metrics:
            dims = m.get("dimensions", {})
            ns = dims.get("Namespace") or dims.get("namespace")
            if ns and ns in ("pawfiler", "admin"):
                affected_namespaces.add(ns)

    if not affected_namespaces:
        logger.info("No pawfiler/admin namespace affected, skipping restart")
        return

    # EKS 파드 재시작 (kubectl rollout restart via EKS API)
    eks = boto3.client("eks", region_name=region)
    try:
        cluster = eks.describe_cluster(name=cluster_name)
        logger.info(f"Cluster status: {cluster['cluster']['status']}")
    except Exception as e:
        logger.error(f"Failed to describe cluster: {e}")
        return

    logger.info(
        f"AUTO-REMEDIATION: Would restart deployments in namespaces: {affected_namespaces}. "
        f"Implement kubectl rollout restart via EKS endpoint if needed."
    )
