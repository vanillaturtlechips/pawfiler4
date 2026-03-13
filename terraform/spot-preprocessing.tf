data "aws_vpc" "main" {
  tags = {
    Name = "${var.project_name}-vpc"
  }
}

data "aws_subnets" "public" {
  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.main.id]
  }
  
  filter {
    name   = "tag:Name"
    values = ["*public*"]
  }
}

resource "aws_instance" "preprocessing" {
  ami           = "ami-0c9c942bd7bf113a2"
  instance_type = "g4dn.xlarge"
  
  subnet_id              = tolist(data.aws_subnets.public.ids)[0]
  vpc_security_group_ids = [aws_security_group.preprocessing.id]
  iam_instance_profile   = aws_iam_instance_profile.preprocessing_s3.name
  
  user_data = <<-EOF
    #!/bin/bash
    echo "ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABgQCRXqFkDpk4cFoTinuv7SWZA6Gv0idhijdnz7p/t1fSlaMC395eWUSzI28FqhGRkR487PGKwViwlLAzhHjmht74KkDIG4B/k2SsySSGOxUuweA6ELg4j3LKcNmAGJZlYaHhPR/2NijsgiDefzcOBStTeBAptFiM6QGrvrsKMP73qOgsZmXU/IBBok0qfO9D4my9aT7mJNgfg7X6viP6X/uDarcapfE9FCFt0R1AbkfCGsduz03K1gORF5bhA0VIja0nxhwQKiKfuEzkENUbvHvIk+38g0W6OmQtlLcV1m+4NGjMM3bn0ANwCah1Ew2gloUQ+ytuUxst3Dt1EqAme6Ey8Z98WVYv650tvcMKOXhxTkxOKhO5LxiiJ6LEDO7NojUVxSzIF5SOuUBxiaM0VJDcj3uAggkN9GHFExSNDBuAPIk3NzDJyd1Fe6BTlDpBBnUlt2plZM+9DTGp+YuCKx4LU56cLoD9SJ9LkAGFpNIsnWDv7W0dqLHLq2Wj9am7rJU= user@user" >> /home/ubuntu/.ssh/authorized_keys
  EOF
  
  root_block_device {
    volume_size = 50
  }
  
  tags = {
    Name = "video-preprocessing"
  }
}

resource "aws_security_group" "preprocessing" {
  name        = "preprocessing-sg"
  description = "Security group for preprocessing instance"
  vpc_id      = data.aws_vpc.main.id
  
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
    Name = "preprocessing-sg"
  }
}

resource "aws_iam_role" "preprocessing_s3" {
  name = "preprocessing-s3-role"
  
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRole"
      Effect = "Allow"
      Principal = {
        Service = "ec2.amazonaws.com"
      }
    }]
  })
}

resource "aws_iam_role_policy" "preprocessing_s3" {
  role = aws_iam_role.preprocessing_s3.id
  
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = ["s3:*"]
      Resource = [
        "arn:aws:s3:::ai-preprocessing",
        "arn:aws:s3:::ai-preprocessing/*"
      ]
    }]
  })
}

resource "aws_iam_instance_profile" "preprocessing_s3" {
  name = "preprocessing-profile"
  role = aws_iam_role.preprocessing_s3.name
}

output "preprocessing_instance_ip" {
  value = aws_instance.preprocessing.public_ip
}
