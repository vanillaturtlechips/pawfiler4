# ============================================================================
# MAIN - 모듈 호출 (PawFiler Infrastructure)
# ============================================================================

data "aws_caller_identity" "current" {}

# ---------------------------------------------------------------------------
# Networking: VPC, Subnets, IGW, NAT Gateway, Route Tables
# ---------------------------------------------------------------------------
module "networking" {
  source = "./modules/networking"

  project_name         = var.project_name
  cluster_name         = var.cluster_name
  vpc_cidr_block       = var.vpc_cidr_block
  public_subnet_cidrs  = var.public_subnet_cidrs
  private_subnet_cidrs = var.private_subnet_cidrs
}

# ---------------------------------------------------------------------------
# IAM: EKS Cluster Role, Node Group Role (Access entries in eks module)
# ---------------------------------------------------------------------------
module "iam" {
  source = "./modules/iam"

  project_name = var.project_name
}

# ---------------------------------------------------------------------------
# ECR: Container Registry Repositories
# ---------------------------------------------------------------------------
module "ecr" {
  source = "./modules/ecr"

  project_name = var.project_name
}

# ---------------------------------------------------------------------------
# S3: Frontend, Admin Frontend, Quiz Media + CloudFront
# ---------------------------------------------------------------------------
module "s3" {
  source = "./modules/s3"

  project_name     = var.project_name
  envoy_alb_domain = var.envoy_alb_domain
}

# ---------------------------------------------------------------------------
# EKS: Cluster, Node Groups, OIDC Provider, EBS CSI Role, Access Entries
# ---------------------------------------------------------------------------
module "eks" {
  source = "./modules/eks"

  project_name        = var.project_name
  cluster_name        = var.cluster_name
  eks_version         = var.eks_version
  node_instance_types = var.node_instance_types
  node_desired_size   = var.node_desired_size
  node_max_size       = var.node_max_size
  node_min_size       = var.node_min_size

  vpc_id             = module.networking.vpc_id
  public_subnet_ids  = module.networking.public_subnet_ids
  private_subnet_ids = module.networking.private_subnet_ids

  eks_cluster_role_arn    = module.iam.eks_cluster_role_arn
  eks_node_group_role_arn = module.iam.eks_node_group_role_arn

  admin_users = var.admin_users

  depends_on = [module.iam]
}

# ---------------------------------------------------------------------------
# Bastion: Bastion Host, IAM Role, Security Group
# ---------------------------------------------------------------------------
module "bastion" {
  source = "./modules/bastion"

  project_name                  = var.project_name
  aws_region                    = var.aws_region
  cluster_name                  = var.cluster_name
  vpc_id                        = module.networking.vpc_id
  public_subnet_ids             = module.networking.public_subnet_ids
  eks_cluster_security_group_id = module.eks.eks_cluster_security_group_id
  bastion_instance_type         = var.bastion_instance_type
  bastion_key_name              = var.bastion_key_name

  depends_on = [module.eks]
}

# ---------------------------------------------------------------------------
# RDS: PostgreSQL Database
# ---------------------------------------------------------------------------
module "rds" {
  source = "./modules/rds"

  project_name              = var.project_name
  vpc_id                    = module.networking.vpc_id
  private_subnet_ids        = module.networking.private_subnet_ids
  private_subnet_cidrs      = var.private_subnet_cidrs
  bastion_security_group_id = module.bastion.bastion_security_group_id

  database_instance_type     = var.database_instance_type
  database_allocated_storage = var.database_allocated_storage
  database_engine_version    = var.database_engine_version
  database_username          = var.database_username
  database_password          = var.database_password
}

# ---------------------------------------------------------------------------
# Helm: Helm Releases + ALB/Kubecost IAM Roles (IRSA)
# ---------------------------------------------------------------------------
module "helm" {
  source = "./modules/helm"

  project_name      = var.project_name
  aws_region        = var.aws_region
  cluster_name      = var.cluster_name
  cluster_endpoint  = module.eks.eks_cluster_endpoint
  cluster_arn       = module.eks.eks_cluster_arn
  vpc_id            = module.networking.vpc_id
  oidc_provider_arn = module.eks.oidc_provider_arn
  oidc_provider_url = module.eks.oidc_provider_url
  account_id        = data.aws_caller_identity.current.account_id

  enable_karpenter = var.enable_karpenter
  karpenter_queue_name = (
    module.karpenter.karpenter_queue_name != null
    ? module.karpenter.karpenter_queue_name
    : ""
  )
  karpenter_controller_role_arn = (
    module.karpenter.karpenter_controller_role_arn != null
    ? module.karpenter.karpenter_controller_role_arn
    : ""
  )
  karpenter_node_role_name = (
    module.karpenter.karpenter_node_role_name != null
    ? module.karpenter.karpenter_node_role_name
    : ""
  )

  kubecost_token        = var.kubecost_token
  argocd_admin_password = var.argocd_admin_password

  enable_istio = var.enable_istio

  depends_on = [module.eks, module.karpenter]
}

# ---------------------------------------------------------------------------
# IRSA: Admin Service IAM Role for S3 access
# ---------------------------------------------------------------------------
module "irsa" {
  source = "./modules/irsa"

  project_name               = var.project_name
  oidc_provider_arn          = module.eks.oidc_provider_arn
  oidc_provider_url          = module.eks.oidc_provider_url
  quiz_media_bucket_arn      = module.s3.quiz_media_bucket_arn
  community_media_bucket_arn = module.s3.community_media_bucket_arn
  loki_chunks_bucket_arn     = module.s3.loki_chunks_bucket_arn
}

# ---------------------------------------------------------------------------
# Lambda Report: S3 + SQS + ECR + Lambda (EDA 방식 리포트 생성)
# ---------------------------------------------------------------------------
module "lambda_report" {
  source = "./modules/lambda_report"

  project_name          = var.project_name
  aws_region            = var.aws_region
  account_id            = data.aws_caller_identity.current.account_id
  database_url          = "postgresql://${var.database_username}:${var.database_password}@${module.rds.rds_proxy_endpoint}:5432/${replace(var.project_name, "-", "_")}_db"
  vpc_id                = module.networking.vpc_id
  private_subnet_ids    = module.networking.private_subnet_ids
  rds_security_group_id = module.rds.rds_security_group_id

  depends_on = [module.rds]
}

# ---------------------------------------------------------------------------
# Karpenter: Autoscaler IAM, SQS, EventBridge
# ---------------------------------------------------------------------------
module "karpenter" {
  source = "./modules/karpenter"

  project_name      = var.project_name
  enable_karpenter  = var.enable_karpenter
  oidc_provider_arn = module.eks.oidc_provider_arn
  oidc_provider_url = module.eks.oidc_provider_url
  cluster_name      = var.cluster_name
  cluster_arn       = module.eks.eks_cluster_arn

  depends_on = [module.eks]
}
