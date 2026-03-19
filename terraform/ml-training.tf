data "aws_vpc" "main_train" {
  tags = {
    Name = "${var.project_name}-vpc"
  }
}

data "aws_subnets" "public_train_2a" {
  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.main_train.id]
  }
  filter {
    name   = "tag:Name"
    values = ["*public*"]
  }
  filter {
    name   = "availabilityZone"
    values = ["ap-northeast-2a"]
  }
}

# ============================================================
# ML Training Spot Instance (ml.g5.xlarge 동급)
# EC2: g5.xlarge - A10G GPU 24GB, vCPU 4, RAM 16GB
# Spot 가격: ~$0.41/hr (On-Demand $1.006 대비 60% 절감)
# ============================================================
resource "aws_spot_instance_request" "ml_training" {
  ami                  = "ami-0c9c942bd7bf113a2" # Ubuntu 22.04 ap-northeast-2
  instance_type        = "g5.4xlarge"            # A10G 24GB, vCPU 16, RAM 64GB / Spot ~$0.35/hr (ap-northeast-2a)
  spot_type            = "one-time"
  wait_for_fulfillment = true

  subnet_id              = data.aws_subnets.public_train_2a.ids[0] # ap-northeast-2a 고정 (Spot 최저가)
  vpc_security_group_ids = [aws_security_group.ml_training.id]
  iam_instance_profile   = aws_iam_instance_profile.preprocessing_s3.name
  key_name               = "pawfiler-local"

  root_block_device {
    volume_size = 100 # 모델 체크포인트 저장용
    volume_type = "gp3"
  }

  user_data = <<-EOF
    #!/bin/bash
    set -e

    # CUDA 드라이버 설치
    apt-get update -q
    apt-get install -y python3-pip awscli

    # PyTorch + 학습 의존성 설치
    pip3 install torch torchvision --index-url https://download.pytorch.org/whl/cu118
    pip3 install webdataset boto3 timm transformers

    # 학습 스크립트 다운로드
    aws s3 cp s3://ai-preprocessing/scripts/train.py /home/ubuntu/train.py \
      --region ap-northeast-2

    cd /home/ubuntu
    nohup python3 train.py > /home/ubuntu/train.log 2>&1 &
    echo "학습 시작 PID: $!"
  EOF

  tags = {
    Name = "ml-training"
  }
}

resource "aws_security_group" "ml_training" {
  name        = "ml-training-sg"
  description = "ML Training spot instance"
  vpc_id      = data.aws_vpc.main_train.id

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

  tags = { Name = "ml-training-sg" }
}

output "training_instance_ip" {
  value       = aws_spot_instance_request.ml_training.public_ip
  description = "SSH: ubuntu@<ip> / 로그: tail -f /home/ubuntu/train.log"
}
