# ============================================================================
# MOVED BLOCKS - State 마이그레이션 (flat -> modules)
# 모든 기존 flat 리소스를 해당 모듈로 이동
# 주의: eks.tf의 aws_eks_access_entry.admin_users 와
#       aws_eks_access_policy_association.admin_users 는 중복이므로
#       moved 블록 없이 config에서 제거 (state에서 삭제됨)
# ============================================================================

# ===========================================================================
# Networking Module
# ===========================================================================

moved {
  from = aws_vpc.main
  to   = module.networking.aws_vpc.main
}

moved {
  from = aws_internet_gateway.main
  to   = module.networking.aws_internet_gateway.main
}

moved {
  from = aws_eip.nat_gateway
  to   = module.networking.aws_eip.nat_gateway
}

moved {
  from = aws_nat_gateway.main
  to   = module.networking.aws_nat_gateway.main
}

moved {
  from = aws_subnet.public
  to   = module.networking.aws_subnet.public
}

moved {
  from = aws_subnet.private
  to   = module.networking.aws_subnet.private
}

moved {
  from = aws_route_table.public
  to   = module.networking.aws_route_table.public
}

moved {
  from = aws_route_table_association.public
  to   = module.networking.aws_route_table_association.public
}

moved {
  from = aws_route_table.private
  to   = module.networking.aws_route_table.private
}

moved {
  from = aws_route_table_association.private
  to   = module.networking.aws_route_table_association.private
}

# ===========================================================================
# IAM Module
# ===========================================================================

moved {
  from = aws_iam_role.eks_cluster_role
  to   = module.iam.aws_iam_role.eks_cluster_role
}

moved {
  from = aws_iam_role_policy_attachment.eks_cluster_policy
  to   = module.iam.aws_iam_role_policy_attachment.eks_cluster_policy
}

moved {
  from = aws_iam_role_policy_attachment.eks_service_policy
  to   = module.iam.aws_iam_role_policy_attachment.eks_service_policy
}

moved {
  from = aws_iam_role.eks_node_group_role
  to   = module.iam.aws_iam_role.eks_node_group_role
}

moved {
  from = aws_iam_role_policy_attachment.eks_worker_node_policy
  to   = module.iam.aws_iam_role_policy_attachment.eks_worker_node_policy
}

moved {
  from = aws_iam_role_policy_attachment.eks_cni_policy
  to   = module.iam.aws_iam_role_policy_attachment.eks_cni_policy
}

moved {
  from = aws_iam_role_policy_attachment.ec2_container_registry_read_only
  to   = module.iam.aws_iam_role_policy_attachment.ec2_container_registry_read_only
}

# Access entries: iam.tf의 admin을 module.eks로 이동
# eks.tf의 admin_users는 중복이므로 state에서 제거 (moved 블록 없음)
moved {
  from = aws_eks_access_entry.admin
  to   = module.eks.aws_eks_access_entry.admin
}

moved {
  from = aws_eks_access_policy_association.admin
  to   = module.eks.aws_eks_access_policy_association.admin
}

# ===========================================================================
# EKS Module
# ===========================================================================

moved {
  from = aws_security_group.eks_cluster
  to   = module.eks.aws_security_group.eks_cluster
}

moved {
  from = aws_eks_cluster.main
  to   = module.eks.aws_eks_cluster.main
}

moved {
  from = aws_eks_node_group.main
  to   = module.eks.aws_eks_node_group.main
}

moved {
  from = aws_eks_node_group.spot
  to   = module.eks.aws_eks_node_group.spot
}

moved {
  from = aws_eks_addon.ebs_csi_driver
  to   = module.eks.aws_eks_addon.ebs_csi_driver
}

# OIDC provider: helm-iam.tf -> module.eks
moved {
  from = aws_iam_openid_connect_provider.eks
  to   = module.eks.aws_iam_openid_connect_provider.eks
}

# EBS CSI Driver role: helm-iam.tf -> module.eks
moved {
  from = aws_iam_role.ebs_csi_driver
  to   = module.eks.aws_iam_role.ebs_csi_driver
}

moved {
  from = aws_iam_role_policy_attachment.ebs_csi_driver
  to   = module.eks.aws_iam_role_policy_attachment.ebs_csi_driver
}

# ===========================================================================
# ECR Module
# ===========================================================================

moved {
  from = aws_ecr_repository.quiz_service
  to   = module.ecr.aws_ecr_repository.quiz_service
}

moved {
  from = aws_ecr_repository.community_service
  to   = module.ecr.aws_ecr_repository.community_service
}

moved {
  from = aws_ecr_repository.video_analysis_service
  to   = module.ecr.aws_ecr_repository.video_analysis_service
}

moved {
  from = aws_ecr_repository.admin_service
  to   = module.ecr.aws_ecr_repository.admin_service
}

# ===========================================================================
# S3 Module (s3-frontend.tf + s3-media.tf)
# ===========================================================================

moved {
  from = aws_s3_bucket.frontend
  to   = module.s3.aws_s3_bucket.frontend
}

moved {
  from = aws_s3_bucket_website_configuration.frontend
  to   = module.s3.aws_s3_bucket_website_configuration.frontend
}

moved {
  from = aws_s3_bucket_public_access_block.frontend
  to   = module.s3.aws_s3_bucket_public_access_block.frontend
}

moved {
  from = aws_s3_bucket_policy.frontend
  to   = module.s3.aws_s3_bucket_policy.frontend
}

moved {
  from = aws_cloudfront_distribution.frontend
  to   = module.s3.aws_cloudfront_distribution.frontend
}

moved {
  from = aws_s3_bucket.admin_frontend
  to   = module.s3.aws_s3_bucket.admin_frontend
}

moved {
  from = aws_s3_bucket_website_configuration.admin_frontend
  to   = module.s3.aws_s3_bucket_website_configuration.admin_frontend
}

moved {
  from = aws_s3_bucket_public_access_block.admin_frontend
  to   = module.s3.aws_s3_bucket_public_access_block.admin_frontend
}

moved {
  from = aws_s3_bucket_policy.admin_frontend
  to   = module.s3.aws_s3_bucket_policy.admin_frontend
}

moved {
  from = aws_s3_bucket.quiz_media
  to   = module.s3.aws_s3_bucket.quiz_media
}

moved {
  from = aws_s3_bucket_versioning.quiz_media
  to   = module.s3.aws_s3_bucket_versioning.quiz_media
}

moved {
  from = aws_s3_bucket_public_access_block.quiz_media
  to   = module.s3.aws_s3_bucket_public_access_block.quiz_media
}

moved {
  from = aws_s3_bucket_cors_configuration.quiz_media
  to   = module.s3.aws_s3_bucket_cors_configuration.quiz_media
}

moved {
  from = aws_s3_bucket_lifecycle_configuration.quiz_media
  to   = module.s3.aws_s3_bucket_lifecycle_configuration.quiz_media
}

moved {
  from = aws_cloudfront_origin_access_identity.quiz_media
  to   = module.s3.aws_cloudfront_origin_access_identity.quiz_media
}

moved {
  from = aws_s3_bucket_policy.quiz_media
  to   = module.s3.aws_s3_bucket_policy.quiz_media
}

moved {
  from = aws_cloudfront_distribution.quiz_media
  to   = module.s3.aws_cloudfront_distribution.quiz_media
}

# ===========================================================================
# Bastion Module
# ===========================================================================

moved {
  from = aws_iam_role.bastion
  to   = module.bastion.aws_iam_role.bastion
}

moved {
  from = aws_iam_role_policy_attachment.bastion_eks
  to   = module.bastion.aws_iam_role_policy_attachment.bastion_eks
}

moved {
  from = aws_iam_role_policy.bastion_eks_access
  to   = module.bastion.aws_iam_role_policy.bastion_eks_access
}

moved {
  from = aws_iam_instance_profile.bastion
  to   = module.bastion.aws_iam_instance_profile.bastion
}

moved {
  from = aws_security_group.bastion
  to   = module.bastion.aws_security_group.bastion
}

moved {
  from = aws_instance.bastion
  to   = module.bastion.aws_instance.bastion
}

moved {
  from = aws_security_group_rule.eks_allow_bastion
  to   = module.bastion.aws_security_group_rule.eks_allow_bastion
}

# ===========================================================================
# RDS Module
# ===========================================================================

moved {
  from = aws_db_subnet_group.main
  to   = module.rds.aws_db_subnet_group.main
}

moved {
  from = aws_security_group.rds
  to   = module.rds.aws_security_group.rds
}

moved {
  from = aws_security_group_rule.rds_allow_bastion
  to   = module.rds.aws_security_group_rule.rds_allow_bastion
}

moved {
  from = aws_db_instance.main
  to   = module.rds.aws_db_instance.main
}

# ===========================================================================
# Helm Module (helm-iam.tf + helm.tf)
# ===========================================================================

moved {
  from = aws_iam_role.alb_controller
  to   = module.helm.aws_iam_role.alb_controller
}

moved {
  from = aws_iam_role_policy_attachment.alb_controller
  to   = module.helm.aws_iam_role_policy_attachment.alb_controller
}

moved {
  from = aws_iam_role_policy_attachment.alb_controller_ec2
  to   = module.helm.aws_iam_role_policy_attachment.alb_controller_ec2
}

moved {
  from = aws_iam_role_policy.alb_controller_waf
  to   = module.helm.aws_iam_role_policy.alb_controller_waf
}

moved {
  from = aws_iam_role.kubecost
  to   = module.helm.aws_iam_role.kubecost
}

moved {
  from = aws_iam_role_policy.kubecost
  to   = module.helm.aws_iam_role_policy.kubecost
}

moved {
  from = helm_release.aws_load_balancer_controller
  to   = module.helm.helm_release.aws_load_balancer_controller
}

moved {
  from = helm_release.argocd
  to   = module.helm.helm_release.argocd
}

moved {
  from = helm_release.kubecost
  to   = module.helm.helm_release.kubecost
}

moved {
  from = helm_release.grafana
  to   = module.helm.helm_release.grafana
}

moved {
  from = helm_release.envoy_gateway
  to   = module.helm.helm_release.envoy_gateway
}

moved {
  from = helm_release.metrics_server
  to   = module.helm.helm_release.metrics_server
}

moved {
  from = helm_release.karpenter[0]
  to   = module.helm.helm_release.karpenter[0]
}

# ===========================================================================
# IRSA Module (irsa.tf)
# ===========================================================================

moved {
  from = aws_iam_role.admin_service
  to   = module.irsa.aws_iam_role.admin_service
}

moved {
  from = aws_iam_role_policy.admin_service_s3
  to   = module.irsa.aws_iam_role_policy.admin_service_s3
}

# ===========================================================================
# Karpenter Module (karpenter.tf)
# ===========================================================================

moved {
  from = aws_iam_role.karpenter_controller[0]
  to   = module.karpenter.aws_iam_role.karpenter_controller[0]
}

moved {
  from = aws_iam_role_policy.karpenter_controller[0]
  to   = module.karpenter.aws_iam_role_policy.karpenter_controller[0]
}

moved {
  from = aws_iam_role.karpenter_node[0]
  to   = module.karpenter.aws_iam_role.karpenter_node[0]
}

moved {
  from = aws_iam_role_policy_attachment.karpenter_node_policies
  to   = module.karpenter.aws_iam_role_policy_attachment.karpenter_node_policies
}

moved {
  from = aws_iam_instance_profile.karpenter_node[0]
  to   = module.karpenter.aws_iam_instance_profile.karpenter_node[0]
}

moved {
  from = aws_sqs_queue.karpenter[0]
  to   = module.karpenter.aws_sqs_queue.karpenter[0]
}

moved {
  from = aws_sqs_queue_policy.karpenter[0]
  to   = module.karpenter.aws_sqs_queue_policy.karpenter[0]
}

moved {
  from = aws_cloudwatch_event_rule.karpenter_spot_interruption[0]
  to   = module.karpenter.aws_cloudwatch_event_rule.karpenter_spot_interruption[0]
}

moved {
  from = aws_cloudwatch_event_target.karpenter_spot_interruption[0]
  to   = module.karpenter.aws_cloudwatch_event_target.karpenter_spot_interruption[0]
}

moved {
  from = aws_cloudwatch_event_rule.karpenter_rebalance[0]
  to   = module.karpenter.aws_cloudwatch_event_rule.karpenter_rebalance[0]
}

moved {
  from = aws_cloudwatch_event_target.karpenter_rebalance[0]
  to   = module.karpenter.aws_cloudwatch_event_target.karpenter_rebalance[0]
}

moved {
  from = aws_cloudwatch_event_rule.karpenter_instance_state_change[0]
  to   = module.karpenter.aws_cloudwatch_event_rule.karpenter_instance_state_change[0]
}

moved {
  from = aws_cloudwatch_event_target.karpenter_instance_state_change[0]
  to   = module.karpenter.aws_cloudwatch_event_target.karpenter_instance_state_change[0]
}

moved {
  from = aws_eks_access_entry.karpenter_node[0]
  to   = module.karpenter.aws_eks_access_entry.karpenter_node[0]
}
