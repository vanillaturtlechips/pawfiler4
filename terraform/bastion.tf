# ============================================================================
# BASTION MODULE - Bastion Host for SSH Access
# ============================================================================

# Variables
variable "bastion_instance_type" {
  description = "Instance type for Bastion Host"
  type        = string
  default     = "t3.micro"
}

variable "bastion_key_name" {
  description = "Name of the EC2 Key Pair to access the Bastion host"
  type        = string
  default     = "pawfiler"
}

# Resources
resource "aws_security_group" "bastion" {
  name        = "${var.project_name}-bastion-sg"
  description = "Security group for Bastion Host"
  vpc_id      = aws_vpc.main.id

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
  subnet_id                   = aws_subnet.public[0].id
  key_name                    = var.bastion_key_name
  vpc_security_group_ids      = [aws_security_group.bastion.id]
  associate_public_ip_address = true

  user_data = <<-EOF
    #!/bin/bash
    set -e

    # AWS CLI v2
    curl -fsSL "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o /tmp/awscliv2.zip
    unzip -q /tmp/awscliv2.zip -d /tmp
    /tmp/aws/install

    # kubectl (EKS 클러스터 버전과 맞춤)
    KUBECTL_VERSION=$(curl -fsSL https://dl.k8s.io/release/stable.txt)
    curl -fsSL "https://dl.k8s.io/release/$${KUBECTL_VERSION}/bin/linux/amd64/kubectl" -o /usr/local/bin/kubectl
    chmod +x /usr/local/bin/kubectl

    # Helm
    curl -fsSL https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 | bash

    # ec2-user도 사용할 수 있도록 PATH 설정
    echo 'export PATH=$PATH:/usr/local/bin' >> /home/ec2-user/.bashrc

    # kubeconfig 자동 설정 (EKS 클러스터 이름 주입)
    cat >> /home/ec2-user/.bashrc <<'BASHRC'
export AWS_DEFAULT_REGION=${var.aws_region}
alias k=kubectl
BASHRC

    # 설치 완료 후 kubeconfig 세팅 (IAM role 필요 - 인스턴스 프로파일 있으면 자동)
    su - ec2-user -c "aws eks update-kubeconfig --region ${var.aws_region} --name ${var.cluster_name} 2>/dev/null || true"
  EOF

  tags = {
    Name = "${var.project_name}-bastion-host"
  }
}

resource "aws_security_group_rule" "eks_allow_bastion" {
  type                     = "ingress"
  from_port                = 443
  to_port                  = 443
  protocol                 = "tcp"
  source_security_group_id = aws_security_group.bastion.id
  security_group_id        = aws_security_group.eks_cluster.id
  description              = "Allow HTTPS from Bastion to EKS Control Plane"
}

# Outputs
output "bastion_public_ip" {
  description = "Public IP address of the Bastion Host"
  value       = aws_instance.bastion.public_ip
}
