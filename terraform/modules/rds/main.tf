# ============================================================================
# RDS MODULE - PostgreSQL Database, Subnet Group, Security Groups
# ============================================================================

resource "aws_db_subnet_group" "main" {
  name       = "${var.project_name}-db-subnet-group"
  subnet_ids = var.private_subnet_ids

  tags = {
    Name = "${var.project_name}-db-subnet-group"
  }
}

resource "aws_security_group" "rds" {
  name        = "${var.project_name}-rds-sg"
  description = "Allow inbound traffic to RDS from private subnets"
  vpc_id      = var.vpc_id

  ingress {
    from_port   = 5432
    to_port     = 5432
    protocol    = "tcp"
    cidr_blocks = var.private_subnet_cidrs # Private 서브넷에서 접근 허용
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

# Allow Bastion to access RDS
resource "aws_security_group_rule" "rds_allow_bastion" {
  type                     = "ingress"
  from_port                = 5432
  to_port                  = 5432
  protocol                 = "tcp"
  source_security_group_id = var.bastion_security_group_id
  security_group_id        = aws_security_group.rds.id
  description              = "Allow PostgreSQL from Bastion"
}

resource "aws_db_instance" "main" {
  allocated_storage      = var.database_allocated_storage
  engine                 = "postgres"
  engine_version         = var.database_engine_version
  instance_class         = var.database_instance_type
  db_name                = "${replace(var.project_name, "-", "_")}_db"
  username               = var.database_username
  password               = var.database_password
  db_subnet_group_name   = aws_db_subnet_group.main.name
  vpc_security_group_ids = [aws_security_group.rds.id]
  skip_final_snapshot    = true
  publicly_accessible    = false
  multi_az               = false
  storage_type           = "gp2"
  identifier             = "${var.project_name}-db-instance"

  tags = {
    Name = "${var.project_name}-rds-instance"
  }
}

# ============================================================================
# RDS Proxy
# ============================================================================

resource "aws_secretsmanager_secret" "rds_proxy" {
  name                    = "${var.project_name}-rds-proxy-secret"
  description             = "RDS credentials for RDS Proxy"
  recovery_window_in_days = 0

  tags = {
    Name = "${var.project_name}-rds-proxy-secret"
  }
}

resource "aws_secretsmanager_secret_version" "rds_proxy" {
  secret_id = aws_secretsmanager_secret.rds_proxy.id
  secret_string = jsonencode({
    username = var.database_username
    password = var.database_password
  })

  lifecycle {
    ignore_changes = [secret_string]
  }
}

resource "aws_iam_role" "rds_proxy" {
  name = "${var.project_name}-rds-proxy-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action    = "sts:AssumeRole"
      Effect    = "Allow"
      Principal = { Service = "rds.amazonaws.com" }
    }]
  })

  tags = {
    Name = "${var.project_name}-rds-proxy-role"
  }
}

resource "aws_iam_role_policy" "rds_proxy" {
  name = "${var.project_name}-rds-proxy-policy"
  role = aws_iam_role.rds_proxy.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = [
        "secretsmanager:GetSecretValue",
        "secretsmanager:DescribeSecret"
      ]
      Resource = aws_secretsmanager_secret.rds_proxy.arn
    }]
  })
}

resource "aws_security_group" "rds_proxy" {
  name        = "${var.project_name}-rds-proxy-sg"
  description = "Security group for RDS Proxy"
  vpc_id      = var.vpc_id

  ingress {
    from_port   = 5432
    to_port     = 5432
    protocol    = "tcp"
    cidr_blocks = var.private_subnet_cidrs
    description = "Allow PostgreSQL from EKS private subnets"
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "${var.project_name}-rds-proxy-sg"
  }
}

# Allow RDS Proxy to access RDS
resource "aws_security_group_rule" "rds_allow_proxy" {
  type                     = "ingress"
  from_port                = 5432
  to_port                  = 5432
  protocol                 = "tcp"
  source_security_group_id = aws_security_group.rds_proxy.id
  security_group_id        = aws_security_group.rds.id
  description              = "Allow PostgreSQL from RDS Proxy"
}

resource "aws_db_proxy" "main" {
  name                   = "${var.project_name}-rds-proxy"
  debug_logging          = false
  engine_family          = "POSTGRESQL"
  idle_client_timeout    = 1800
  require_tls            = false
  role_arn               = aws_iam_role.rds_proxy.arn
  vpc_security_group_ids = [aws_security_group.rds_proxy.id]
  vpc_subnet_ids         = var.private_subnet_ids

  auth {
    auth_scheme = "SECRETS"
    description = "RDS credentials"
    iam_auth    = "DISABLED"
    secret_arn  = aws_secretsmanager_secret.rds_proxy.arn
  }

  tags = {
    Name = "${var.project_name}-rds-proxy"
  }
}

resource "aws_db_proxy_default_target_group" "main" {
  db_proxy_name = aws_db_proxy.main.name

  connection_pool_config {
    connection_borrow_timeout    = 120
    max_connections_percent      = 100
    max_idle_connections_percent = 50
  }
}

resource "aws_db_proxy_target" "main" {
  db_instance_identifier = aws_db_instance.main.identifier
  db_proxy_name          = aws_db_proxy.main.name
  target_group_name      = aws_db_proxy_default_target_group.main.name
}
