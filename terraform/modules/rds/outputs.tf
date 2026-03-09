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
