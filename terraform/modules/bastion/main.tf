# ============================================================================
# BASTION MODULE - Bastion Host, IAM Role, Security Group
# ============================================================================

resource "aws_iam_role" "bastion" {
  name = "${var.project_name}-bastion-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action    = "sts:AssumeRole"
      Effect    = "Allow"
      Principal = { Service = "ec2.amazonaws.com" }
    }]
  })
}

resource "aws_iam_role_policy_attachment" "bastion_eks" {
  role       = aws_iam_role.bastion.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonEKSClusterPolicy"
}

resource "aws_iam_role_policy" "bastion_eks_access" {
  name = "${var.project_name}-bastion-eks-access"
  role = aws_iam_role.bastion.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "eks:DescribeCluster",
          "eks:ListClusters",
          "eks:DescribeNodegroup",
          "eks:ListNodegroups",
          "eks:AccessKubernetesApi"
        ]
        Resource = "*"
      }
    ]
  })
}

resource "aws_iam_instance_profile" "bastion" {
  name = "${var.project_name}-bastion-profile"
  role = aws_iam_role.bastion.name
}

resource "aws_security_group" "bastion" {
  name        = "${var.project_name}-bastion-sg"
  description = "Security group for Bastion Host"
  vpc_id      = var.vpc_id

  ingress {
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "${var.project_name}-bastion-sg"
  }
}

data "aws_ami" "amazon_linux_2" {
  most_recent = true
  owners      = ["amazon"]

  filter {
    name   = "name"
    values = ["amzn2-ami-hvm-*-x86_64-gp2"]
  }
}

resource "aws_instance" "bastion" {
  ami                         = data.aws_ami.amazon_linux_2.id
  instance_type               = var.bastion_instance_type
  subnet_id                   = var.public_subnet_ids[0]
  key_name                    = var.bastion_key_name
  vpc_security_group_ids      = [aws_security_group.bastion.id]
  associate_public_ip_address = true
  iam_instance_profile        = aws_iam_instance_profile.bastion.name

  user_data = <<-EOF
    #!/bin/bash
    set -e

    curl -fsSL "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o /tmp/awscliv2.zip
    unzip -q /tmp/awscliv2.zip -d /tmp
    /tmp/aws/install

    KUBECTL_VERSION=$(curl -fsSL https://dl.k8s.io/release/stable.txt)
    curl -fsSL "https://dl.k8s.io/release/$${KUBECTL_VERSION}/bin/linux/amd64/kubectl" -o /usr/local/bin/kubectl
    chmod +x /usr/local/bin/kubectl

    curl -fsSL https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 | bash

    curl -fsSL "https://github.com/eksctl-io/eksctl/releases/latest/download/eksctl_Linux_amd64.tar.gz" | tar xz -C /tmp
    mv /tmp/eksctl /usr/local/bin/
    chmod +x /usr/local/bin/eksctl

    echo 'export PATH=$PATH:/usr/local/bin' >> /home/ec2-user/.bashrc

    cat >> /home/ec2-user/.bashrc <<'BASHRC'
export AWS_DEFAULT_REGION=${var.aws_region}
alias k=kubectl
BASHRC

    su - ec2-user -c "aws eks update-kubeconfig --region ${var.aws_region} --name ${var.cluster_name} 2>/dev/null || true"
  EOF

  tags = {
    Name = "${var.project_name}-bastion-host"
  }

  lifecycle {
    ignore_changes = [ami, key_name]
  }
}

# Allow HTTPS from Bastion to EKS Control Plane
resource "aws_security_group_rule" "eks_allow_bastion" {
  type                     = "ingress"
  from_port                = 443
  to_port                  = 443
  protocol                 = "tcp"
  source_security_group_id = aws_security_group.bastion.id
  security_group_id        = var.eks_cluster_security_group_id
  description              = "Allow HTTPS from Bastion to EKS Control Plane"
}
