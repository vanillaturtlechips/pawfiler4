terraform {
  backend "s3" {
    bucket         = "pawfiler-terraform-state"
    key            = "prod/terraform.tfstate"
    region         = "ap-northeast-2"
    dynamodb_table = "pawfiler-terraform-locks"
    encrypt        = true
  }
}
