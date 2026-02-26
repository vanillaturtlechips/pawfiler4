# ------------------------------------------------------------------------------
# VPC and Networking
# ------------------------------------------------------------------------------
resource "aws_vpc" "main" {
  cidr_block           = var.vpc_cidr_block
  enable_dns_hostnames = true
  enable_dns_support   = true

  tags = {
    Name = "${var.project_name}-vpc"
  }
}

resource "aws_internet_gateway" "main" {
  vpc_id = aws_vpc.main.id

  tags = {
    Name = "${var.project_name}-igw"
  }
}

resource "aws_eip" "nat_gateway" {

  domain = "vpc"

  tags = {
    Name = "${var.project_name}-nat-eip"
  }
}

resource "aws_nat_gateway" "main" {

  allocation_id = aws_eip.nat_gateway.id
  subnet_id     = aws_subnet.public[0].id

  tags = {
    Name = "${var.project_name}-nat-gateway"
  }
  depends_on = [aws_internet_gateway.main]
}

resource "aws_subnet" "public" {
  count                   = length(var.public_subnet_cidrs)
  vpc_id                  = aws_vpc.main.id
  cidr_block              = var.public_subnet_cidrs[count.index]
  availability_zone       = data.aws_availability_zones.available.names[count.index]
  map_public_ip_on_launch = true

  tags = {
    Name                                        = "${var.project_name}-public-subnet-${count.index}"
    "kubernetes.io/cluster/${var.cluster_name}" = "shared"
    "kubernetes.io/role/elb"                    = "1" # For ALB
  }
}

resource "aws_subnet" "private" {
  count             = length(var.private_subnet_cidrs)
  vpc_id            = aws_vpc.main.id
  cidr_block        = var.private_subnet_cidrs[count.index]
  availability_zone = data.aws_availability_zones.available.names[count.index]

  tags = {
    Name                                        = "${var.project_name}-private-subnet-${count.index}"
    "kubernetes.io/cluster/${var.cluster_name}" = "shared"
    "kubernetes.io/role/internal-elb"           = "1" # For Internal ALB
  }
}

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.main.id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.main.id
  }

  tags = {
    Name = "${var.project_name}-public-rt"
  }
}

resource "aws_route_table_association" "public" {
  count          = length(aws_subnet.public)
  subnet_id      = aws_subnet.public[count.index].id
  route_table_id = aws_route_table.public.id
}

resource "aws_route_table" "private" {
  vpc_id = aws_vpc.main.id

  route {
    cidr_block     = "0.0.0.0/0"
    nat_gateway_id = aws_nat_gateway.main.id
  }

  tags = {
    Name = "${var.project_name}-private-rt"
  }
}

resource "aws_route_table_association" "private" {
  count          = length(aws_subnet.private)
  subnet_id      = aws_subnet.private[count.index].id
  route_table_id = aws_route_table.private.id
}

data "aws_availability_zones" "available" {
  state = "available"
}

# ------------------------------------------------------------------------------
# EKS Cluster
# ------------------------------------------------------------------------------
resource "aws_iam_role" "eks_cluster_role" {
  name = "${var.project_name}-eks-cluster-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Service = "eks.amazonaws.com"
        }
        Action = "sts:AssumeRole"
      },
      {
        Effect = "Allow"
        Principal = {
          # 명시된 사용자들이 관리 목적으로 이 역할을 맡을 수 있음
          AWS = [
            "arn:aws:iam::009946608368:user/SGO-Junghan",
            "arn:aws:iam::009946608368:user/SGO-Jaewon",
            "arn:aws:iam::009946608368:user/RAPA_Admin",
            "arn:aws:iam::009946608368:user/SGO-Moonjae"
          ]
        }
        Action = "sts:AssumeRole"
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "eks_cluster_policy" {
  policy_arn = "arn:aws:iam::aws:policy/AmazonEKSClusterPolicy"
  role       = aws_iam_role.eks_cluster_role.name
}

resource "aws_iam_role_policy_attachment" "eks_service_policy" {
  policy_arn = "arn:aws:iam::aws:policy/AmazonEKSServicePolicy"
  role       = aws_iam_role.eks_cluster_role.name
}

resource "aws_eks_cluster" "main" {
  name     = var.cluster_name
  role_arn = aws_iam_role.eks_cluster_role.arn
  version  = "1.28" # EKS 버전, 필요에 따라 변경

  vpc_config {
    subnet_ids         = concat(aws_subnet.public[*].id, aws_subnet.private[*].id)
    security_group_ids = [aws_security_group.eks_cluster.id]
  }

  depends_on = [
    aws_iam_role_policy_attachment.eks_cluster_policy,
    aws_iam_role_policy_attachment.eks_service_policy,
  ]

  tags = {
    Name = var.cluster_name
  }
}

resource "aws_security_group" "eks_cluster" {
  name        = "${var.project_name}-eks-cluster-sg"
  description = "Security group for EKS cluster control plane"
  vpc_id      = aws_vpc.main.id

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

resource "aws_iam_role" "eks_node_group_role" {
  name = "${var.project_name}-eks-node-group-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Service = "ec2.amazonaws.com"
        }
        Action = "sts:AssumeRole"
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "eks_worker_node_policy" {
  policy_arn = "arn:aws:iam::aws:policy/AmazonEKSWorkerNodePolicy"
  role       = aws_iam_role.eks_node_group_role.name
}

resource "aws_iam_role_policy_attachment" "eks_cni_policy" {
  policy_arn = "arn:aws:iam::aws:policy/AmazonEKS_CNI_Policy"
  role       = aws_iam_role.eks_node_group_role.name
}

resource "aws_iam_role_policy_attachment" "ec2_container_registry_read_only" {
  policy_arn = "arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryReadOnly"
  role       = aws_iam_role.eks_node_group_role.name
}

resource "aws_eks_node_group" "main" {
  cluster_name    = aws_eks_cluster.main.name
  node_group_name = "${var.project_name}-node-group"
  node_role_arn   = aws_iam_role.eks_node_group_role.arn
  subnet_ids      = aws_subnet.private[*].id
  instance_types  = ["t3.medium"] # 노드 인스턴스 타입, 필요에 따라 변경

  scaling_config {
    desired_size = 2
    max_size     = 3
    min_size     = 1
  }

  depends_on = [
    aws_iam_role_policy_attachment.eks_worker_node_policy,
    aws_iam_role_policy_attachment.eks_cni_policy,
    aws_iam_role_policy_attachment.ec2_container_registry_read_only,
  ]

  tags = {
    Name = "${var.project_name}-eks-node-group"
  }
}

# ------------------------------------------------------------------------------
# ECR (Elastic Container Registry)
# ------------------------------------------------------------------------------
resource "aws_ecr_repository" "auth_service" {
  name = "${var.project_name}/auth-service"
  tags = { Name = "${var.project_name}-auth-ecr" }
}

resource "aws_ecr_repository" "community_service" {
  name = "${var.project_name}/community-service"
  tags = { Name = "${var.project_name}-community-ecr" }
}

resource "aws_ecr_repository" "payment_service" {
  name = "${var.project_name}/payment-service"
  tags = { Name = "${var.project_name}-payment-ecr" }
}

resource "aws_ecr_repository" "quiz_service" {
  name = "${var.project_name}/quiz-service"
  tags = { Name = "${var.project_name}-quiz-ecr" }
}

resource "aws_ecr_repository" "video_analysis_service" {
  name = "${var.project_name}/video-analysis-service"
  tags = { Name = "${var.project_name}-video-analysis-ecr" }
}

resource "aws_ecr_repository" "dashboard_bff" {
  name = "${var.project_name}/dashboard-bff"
  tags = { Name = "${var.project_name}-dashboard-bff-ecr" }
}

resource "aws_ecr_repository" "envoy_proxy" {
  name = "${var.project_name}/envoy-proxy"
  tags = { Name = "${var.project_name}-envoy-proxy-ecr" }
}

# ------------------------------------------------------------------------------
# RDS (Relational Database Service) - PostgreSQL
# ------------------------------------------------------------------------------
resource "aws_db_subnet_group" "main" {
  name       = "${var.project_name}-db-subnet-group"
  subnet_ids = aws_subnet.private[*].id

  tags = {
    Name = "${var.project_name}-db-subnet-group"
  }
}

resource "aws_security_group" "rds" {
  name        = "${var.project_name}-rds-sg"
  description = "Allow inbound traffic to RDS from EKS cluster"
  vpc_id      = aws_vpc.main.id

  ingress {
    from_port       = 5432 # PostgreSQL default port
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_security_group.eks_cluster.id] # EKS 클러스터에서 접근 허용
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "${var.project_name}-rds-sg"
  }
}

resource "aws_db_instance" "main" {
  allocated_storage      = var.database_allocated_storage
  engine                 = "postgres"
  engine_version         = "14.7" # PostgreSQL 버전, 필요에 따라 변경
  instance_class         = var.database_instance_type
  db_name                = "${var.project_name}_db"
  username               = var.database_username
  password               = var.database_password
  db_subnet_group_name   = aws_db_subnet_group.main.name
  vpc_security_group_ids = [aws_security_group.rds.id]
  skip_final_snapshot    = true
  publicly_accessible    = false # EKS 내부에서만 접근하도록 설정
  multi_az               = false # 단일 AZ, 고가용성 필요 시 true로 변경
  storage_type           = "gp2" # SSD (General Purpose)
  identifier             = "${var.project_name}-db-instance"

  tags = {
    Name = "${var.project_name}-rds-instance"
  }
}

# ------------------------------------------------------------------------------
# MSK (Managed Streaming for Kafka)
# ------------------------------------------------------------------------------
resource "aws_security_group" "msk_broker" {
  name        = "${var.project_name}-msk-broker-sg"
  description = "Security group for MSK brokers"
  vpc_id      = aws_vpc.main.id

  ingress {
    from_port       = 9092 # PLAINTEXT
    to_port         = 9092
    protocol        = "tcp"
    security_groups = [aws_security_group.eks_cluster.id] # EKS 클러스터에서 접근 허용
  }

  ingress {
    from_port       = 9094 # TLS
    to_port         = 9094
    protocol        = "tcp"
    security_groups = [aws_security_group.eks_cluster.id] # EKS 클러스터에서 접근 허용
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "${var.project_name}-msk-broker-sg"
  }
}

resource "aws_msk_cluster" "main" {
  cluster_name           = "${var.project_name}-kafka-cluster"
  kafka_version          = "3.5.1" # Kafka 버전, 필요에 따라 변경
  number_of_broker_nodes = length(aws_subnet.private) * var.kafka_number_of_broker_nodes

  broker_node_group_info {
    instance_type = var.kafka_broker_node_instance_type
    storage_info {
      ebs_storage_info {
        volume_size = 100 # GB
      }
    }
    client_subnets  = aws_subnet.private[*].id
    security_groups = [aws_security_group.msk_broker.id]
  }

  encryption_info {
    encryption_in_transit {
      client_broker = "TLS" # TLS 통신 사용
      in_cluster    = true
    }
  }

  open_monitoring {
    prometheus {
      jmx_exporter {
        enabled_in_broker = true
      }
      node_exporter {
        enabled_in_broker = true
      }
    }
  }

  tags = {
    Name = "${var.project_name}-kafka-cluster"
  }
}

# ------------------------------------------------------------------------------
# Bastion Host
# ------------------------------------------------------------------------------
resource "aws_security_group" "bastion" {
  name        = "${var.project_name}-bastion-sg"
  description = "Security group for Bastion Host"
  vpc_id      = aws_vpc.main.id

  ingress {
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"] # 보안을 위해 특정 IP로 제한하는 것이 좋습니다.
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
  instance_type               = "t3.micro"
  subnet_id                   = aws_subnet.public[0].id
  key_name                    = var.bastion_key_name
  vpc_security_group_ids      = [aws_security_group.bastion.id]
  associate_public_ip_address = true

  tags = {
    Name = "${var.project_name}-bastion-host"
  }
}

# EKS Cluster SG에 Bastion 접근 허용 추가
resource "aws_security_group_rule" "eks_allow_bastion" {
  type                     = "ingress"
  from_port                = 443
  to_port                  = 443
  protocol                 = "tcp"
  source_security_group_id = aws_security_group.bastion.id
  security_group_id        = aws_security_group.eks_cluster.id
  description              = "Allow HTTPS from Bastion to EKS Control Plane"
}
