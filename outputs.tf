output "cognito_user_pool_id" {
  description = "Cognito User Pool ID"
  value       = aws_cognito_user_pool.main.id
}

output "cognito_client_id" {
  description = "Cognito User Pool Client ID"
  value       = aws_cognito_user_pool_client.main.id
}

output "cognito_domain" {
  description = "Cognito Domain"
  value       = aws_cognito_user_pool_domain.main.domain
}

output "api_gateway_url" {
  description = "API Gateway URL"
  value       = aws_apigatewayv2_api.main.api_endpoint
}

output "zip_uploads_bucket" {
  description = "S3 bucket for zip uploads"
  value       = aws_s3_bucket.zip_uploads.bucket
}

output "extracted_files_bucket" {
  description = "S3 bucket for extracted files"
  value       = aws_s3_bucket.extracted_files.bucket
}

output "web_app_url" {
  description = "Web application URL"
  value       = "https://${var.web_bucket}.s3.${var.aws_region}.amazonaws.com/index.html"
}

output "admin_username" {
  description = "Admin username"
  value       = aws_cognito_user.admin.username
}

output "login_url" {
  description = "Cognito hosted UI login URL"
  value       = "https://${aws_cognito_user_pool_domain.main.domain}.auth.${var.aws_region}.amazoncognito.com/login?client_id=${aws_cognito_user_pool_client.main.id}&response_type=code&scope=email+openid+profile&redirect_uri=https://${var.web_bucket}.s3.${var.aws_region}.amazonaws.com/callback.html"
}
