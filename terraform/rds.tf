# ============================================================================
# RDS MODULE - PostgreSQL Database, Subnet Group, Security Groups
# ============================================================================

# Variables
variable "database_instance_type" {
  description = "RDS PostgreSQL instance type"
  type        = string
  default     = "db.t3.micro"
}

variable "database_allocated_storage" {
  description = "RDS PostgreSQL allocated storage in GB"
  type        = number
  default     = 20
}

variable "database_engine_version" {
  description = "PostgreSQL engine version"
  type        = string
  default     = "16"
}

variable "database_username" {
  description = "RDS PostgreSQL master username"
  type        = string
  default     = "pawfiler"
}

variable "database_password" {
  description = "RDS PostgreSQL master password"
  type        = string
  sensitive   = true
  default     = "dev_password"
}

# Resources
resource "aws_db_subnet_group" "main" {
  name       = "${var.project_name}-db-subnet-group"
  subnet_ids = aws_subnet.private[*].id

  tags = {
    Name = "${var.project_name}-db-subnet-group"
  }
}

resource "aws_security_group" "rds" {
  name        = "${var.project_name}-rds-sg"
  description = "Allow inbound traffic to RDS from private subnets"
  vpc_id      = aws_vpc.main.id

  ingress {
    from_port   = 5432
    to_port     = 5432
    protocol    = "tcp"
    cidr_blocks = var.private_subnet_cidrs  # Private 서브넷에서 접근 허용
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
  source_security_group_id = aws_security_group.bastion.id
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

# Outputs
output "rds_instance_address" {
  description = "The address of the RDS instance"
  value       = aws_db_instance.main.address
  sensitive   = true
}

output "rds_instance_port" {
  description = "The port of the RDS instance"
  value       = aws_db_instance.main.port
}

output "rds_instance_endpoint" {
  description = "The endpoint of the RDS instance"
  value       = "${aws_db_instance.main.address}:${aws_db_instance.main.port}"
  sensitive   = true
}
