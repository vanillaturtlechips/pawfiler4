# ============================================================================
# EKS MODULE - EKS Cluster, Node Groups, OIDC Provider, Access Entries
# ============================================================================

data "aws_caller_identity" "current" {}

data "tls_certificate" "eks" {
  url = aws_eks_cluster.main.identity[0].oidc[0].issuer
}

resource "aws_security_group" "eks_cluster" {
  name        = "${var.project_name}-eks-cluster-sg"
  description = "Security group for EKS cluster control plane"
  vpc_id      = var.vpc_id

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "${var.project_name}-eks-cluster-sg"
  }
}

resource "aws_eks_cluster" "main" {
  name     = var.cluster_name
  role_arn = var.eks_cluster_role_arn
  version  = var.eks_version

  vpc_config {
    subnet_ids         = concat(var.public_subnet_ids, var.private_subnet_ids)
    security_group_ids = [aws_security_group.eks_cluster.id]
  }

  # API + ConfigMap 모드: Access Entry(IAM 유저)와 기존 aws-auth ConfigMap 방식 모두 지원
  access_config {
    authentication_mode                         = "API_AND_CONFIG_MAP"
    bootstrap_cluster_creator_admin_permissions = true
  }

  # Note: implicit dependency via role_arn ensures IAM policies are attached first
  tags = {
    Name = var.cluster_name
  }
}

resource "aws_eks_node_group" "main" {
  cluster_name    = aws_eks_cluster.main.name
  node_group_name = "${var.project_name}-node-group-ondemand"
  node_role_arn   = var.eks_node_group_role_arn
  subnet_ids      = var.private_subnet_ids
  instance_types  = var.node_instance_types
  capacity_type   = "ON_DEMAND"

  scaling_config {
    desired_size = 2
    max_size     = 4
    min_size     = 2
  }

  # Note: implicit dependency via node_role_arn ensures IAM policies are attached first
  tags = {
    Name = "${var.project_name}-eks-node-group-ondemand"
  }

  lifecycle {
    ignore_changes = [scaling_config[0].desired_size]
  }
}

resource "aws_eks_node_group" "spot" {
  cluster_name    = aws_eks_cluster.main.name
  node_group_name = "${var.project_name}-node-group-spot"
  node_role_arn   = var.eks_node_group_role_arn
  subnet_ids      = var.private_subnet_ids
  instance_types  = var.node_instance_types
  capacity_type   = "SPOT"

  scaling_config {
    desired_size = 0
    max_size     = 5
    min_size     = 0
  }

  # Note: implicit dependency via node_role_arn ensures IAM policies are attached first
  tags = {
    Name = "${var.project_name}-eks-node-group-spot"
  }

  lifecycle {
    ignore_changes = [scaling_config[0].desired_size]
  }
}

# EBS CSI Driver Addon
resource "aws_eks_addon" "ebs_csi_driver" {
  cluster_name             = aws_eks_cluster.main.name
  addon_name               = "aws-ebs-csi-driver"
  addon_version            = "v1.56.0-eksbuild.1"
  service_account_role_arn = aws_iam_role.ebs_csi_driver.arn

  depends_on = [
    aws_eks_node_group.main,
    aws_iam_role.ebs_csi_driver,
  ]
}

# OIDC Provider for IRSA
resource "aws_iam_openid_connect_provider" "eks" {
  client_id_list  = ["sts.amazonaws.com"]
  thumbprint_list = ["9e99a48a9960b14926bb7f3b02e22da2b0ab7280"]
  url             = aws_eks_cluster.main.identity[0].oidc[0].issuer
}

# EBS CSI Driver IAM Role (IRSA)
# Created here to avoid circular dependency with helm module
resource "aws_iam_role" "ebs_csi_driver" {
  name = "${var.project_name}-ebs-csi-driver"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRoleWithWebIdentity"
      Effect = "Allow"
      Principal = {
        Federated = aws_iam_openid_connect_provider.eks.arn
      }
      Condition = {
        StringEquals = {
          "${replace(aws_iam_openid_connect_provider.eks.url, "https://", "")}:sub" = "system:serviceaccount:kube-system:ebs-csi-controller-sa"
        }
      }
    }]
  })

  depends_on = [aws_iam_openid_connect_provider.eks]
}

resource "aws_iam_role_policy_attachment" "ebs_csi_driver" {
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonEBSCSIDriverPolicy"
  role       = aws_iam_role.ebs_csi_driver.name
}

# EKS Access Entry - 팀원 로컬 CLI kubectl 접근
# (iam.tf의 admin과 eks.tf의 admin_users를 하나로 통합, admin 이름으로 moved)
resource "aws_eks_access_entry" "admin" {
  for_each = toset(var.admin_users)

  cluster_name  = aws_eks_cluster.main.name
  principal_arn = each.value
  type          = "STANDARD"
}

resource "aws_eks_access_policy_association" "admin" {
  for_each = toset(var.admin_users)

  cluster_name  = aws_eks_cluster.main.name
  principal_arn = each.value
  policy_arn    = "arn:aws:eks::aws:cluster-access-policy/AmazonEKSClusterAdminPolicy"

  access_scope {
    type = "cluster"
  }

  depends_on = [aws_eks_access_entry.admin]
}
