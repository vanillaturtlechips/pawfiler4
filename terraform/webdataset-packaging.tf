data "aws_vpc" "main_wds" {
  tags = {
    Name = "${var.project_name}-vpc"
  }
}

data "aws_subnets" "public_wds" {
  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.main_wds.id]
  }
  filter {
    name   = "tag:Name"
    values = ["*public*"]
  }
}

# ============================================================
# Spot Instance Request (c5n.4xlarge)
# - vCPU: 16, RAM: 42GB, Network: 25Gbps
# - Spot 가격: ~$0.25/hr (On-Demand $0.864 대비 70% 절감)
# ============================================================
resource "aws_spot_instance_request" "webdataset_packaging" {
  ami                    = "ami-0c9c942bd7bf113a2" # Ubuntu 22.04 ap-northeast-2
  instance_type          = "c5n.18xlarge"
  spot_type              = "one-time"
  wait_for_fulfillment   = true

  subnet_id              = tolist(data.aws_subnets.public_wds.ids)[0]
  vpc_security_group_ids = [aws_security_group.webdataset_packaging.id]
  iam_instance_profile   = aws_iam_instance_profile.preprocessing_s3.name

  key_name = "pawfiler-local"

  root_block_device {
    volume_size = 30
  }

  user_data = <<-EOF
    #!/bin/bash
    pip3 install boto3 --break-system-packages
    pip3 install boto3 --break-system-packages --user
  EOF

  tags = {
    Name = "webdataset-packaging"
  }
}

resource "aws_security_group" "webdataset_packaging" {
  name        = "webdataset-packaging-sg"
  description = "WebDataset packaging spot instance"
  vpc_id      = data.aws_vpc.main_wds.id

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

  tags = { Name = "webdataset-packaging-sg" }
}

output "packaging_instance_ip" {
  value       = aws_spot_instance_request.webdataset_packaging.public_ip
  description = "SSH: ubuntu@<ip> / 로그: tail -f /var/log/packaging.log"
}
