# Troubleshooting Guide

프로젝트 운영 중 발생한 문제와 해결 방법을 정리한 문서입니다.

## 목차

### 인프라
- [alb.md](./alb.md) - ALB 관련 문제
- [eks-access.md](./eks-access.md) - EKS 클러스터 접근 권한
- [karpenter.md](./karpenter.md) - Karpenter 오토스케일링

### 네트워킹
- [envoy-grpc.md](./envoy-grpc.md) - Envoy REST→gRPC 변환 문제 및 대안
- [envoy-vs-bff.md](./envoy-vs-bff.md) - Envoy vs BFF 아키텍처
- [s3-alb-exposure.md](./s3-alb-exposure.md) - S3 ALB 노출 문제

### 리소스 관리
- [node-memory.md](./node-memory.md) - 노드 메모리 사용률 높음
- [performance.md](./performance.md) - 성능 최적화

### 일반
- [general.md](./general.md) - 일반적인 문제 해결

## 빠른 참조

**메모리 부족**
```bash
kubectl top nodes
kubectl top pods -A --sort-by=memory
```
→ [node-memory.md](./node-memory.md)

**Pod 시작 안됨**
```bash
kubectl describe pod <pod-name> -n <namespace>
kubectl logs <pod-name> -n <namespace>
```
→ [general.md](./general.md)

**EKS 접근 불가**
```bash
aws eks update-kubeconfig --region ap-northeast-2 --name pawfiler-eks-cluster
```
→ [eks-access.md](./eks-access.md)

**Envoy 배포 에러**
→ [envoy-grpc.md](./envoy-grpc.md)
