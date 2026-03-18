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

output "rds_proxy_endpoint" {
  description = "RDS Proxy endpoint (Lambda에서 사용 권장 — 커넥션 풀링)"
  value       = aws_db_proxy.main.endpoint
  sensitive   = true
}

output "rds_security_group_id" {
  description = "RDS security group ID (Lambda SG ingress 허용용)"
  value       = aws_security_group.rds.id
}
