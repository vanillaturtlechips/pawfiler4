variable "bastion_instance_type" {
  description = "Bastion Host EC2 instance type"
  type        = string
  default     = "t3.micro"
}

variable "bastion_key_name" {
  description = "EC2 Key Pair name for Bastion Host SSH access"
  type        = string
}
