variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "us-east-1"
}

variable "project_name" {
  description = "Name of the project"
  type        = string
  default     = "14strings-tabs"
}

variable "web_bucket" {
  description = "Name of the existing S3 bucket for web content"
  type        = string
  default     = "14strings.com"  
}

variable "admin_username" {
  description = "Username for the admin user"
  type        = string
  default     = "bruce"
}

variable "admin_email" {
  description = "Email for the admin user"
  default     = "bruce.cota@vivi.com"  
  type        = string
}

variable "admin_temporary_password" {
  description = "Temporary password for the admin user"
  type        = string
  default     = "harigoshi"  
  sensitive   = true
}
