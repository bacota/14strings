terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    archive = {
      source  = "hashicorp/archive"
      version = "~> 2.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.0"
    }
  }
}

provider "aws" {
  region = var.aws_region
}


# S3 Bucket for zip file uploads
resource "aws_s3_bucket" "zip_uploads" {
  bucket = "${var.project_name}-zip.14strings.com"
}

# S3 Bucket for extracted files
resource "aws_s3_bucket" "extracted_files" {
  bucket = "tabs.14strings.com"
}

resource "aws_s3_bucket_public_access_block" "extracted_public_access_block" {
  bucket = aws_s3_bucket.extracted_files.id
  block_public_acls = false
}

resource "aws_s3_bucket_website_configuration" "static_website_config" {
  bucket = aws_s3_bucket.extracted_files.id

  index_document {
    suffix = "index.html"
  }
  
  error_document {
    key = "error.html"
  }
}


resource "aws_s3_bucket_policy" "zip_uploads_policy" {
  bucket = aws_s3_bucket.zip_uploads.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "AllowUploads"        
            "Effect": "Allow",
            "Principal": {
              "AWS": "${aws_iam_role.lambda_role.arn}"
            },
            "Action": [
                "s3:PutObject",
                "s3:PutObjectAcl"
            ],
        Resource  = "${aws_s3_bucket.zip_uploads.arn}/*"        
        }
    ]
  })
}

resource "aws_s3_bucket_policy" "extracted_Files_policy" {
  bucket = aws_s3_bucket.extracted_files.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "AllowUploads" ,
            "Effect": "Allow",
            "Principal": {
              "AWS": "${aws_iam_role.lambda_role.arn}"
            },
            "Action": [
                "s3:PutObject",
                "s3:PutObjectAcl"
            ],
        Resource  = "${aws_s3_bucket.extracted_files.arn}/*"        
        },
      {
        Sid       = "AllowReads",   
            "Effect": "Allow",
            "Principal": "*",
            "Action": [
                "s3:GetObject",
                "s3:ListBucket"
            ],
        Resource  = ["${aws_s3_bucket.extracted_files.arn}/*", "${aws_s3_bucket.extracted_files.arn}"]
      }
    ]
  })
}


resource "aws_s3_bucket_cors_configuration" "zip_uploads_cors" {
  bucket = aws_s3_bucket.zip_uploads.id
  cors_rule {
    allowed_headers = ["*"]
    allowed_methods = ["GET", "PUT", "POST", "DELETE", "HEAD"]
    allowed_origins = ["https://14strings.com"]    
    expose_headers  = ["ETag"]
    max_age_seconds = 3000
    id              = "zip_uploads_cors_rule"
  }
}

resource "aws_s3_bucket_cors_configuration" "extracted_files_cors" {
  bucket = aws_s3_bucket.extracted_files.id
  cors_rule {
    allowed_headers = ["*"]
    allowed_methods = ["GET", "PUT", "POST", "DELETE", "HEAD"]
    allowed_origins = ["https://14strings.com"]
    expose_headers  = ["ETag", "x-amz-meta-caption", "x-amz-meta-position"]    
    max_age_seconds = 3000
    id              = "extracted_files_cors_rule"
  }
}

# S3 Bucket versioning for extracted files
resource "aws_s3_bucket_versioning" "extracted_files_versioning" {
  bucket = aws_s3_bucket.extracted_files.id
  versioning_configuration {
    status = "Enabled"
  }
}

# Cognito User Pool
resource "aws_cognito_user_pool" "main" {
  name = "${var.project_name}-user-pool"

  alias_attributes = ["email"]
  auto_verified_attributes = ["email"]

  password_policy {
    minimum_length    = 8
    require_lowercase = false
    require_numbers   = false
    require_symbols   = false
    require_uppercase = false
  }

  schema {
    attribute_data_type = "String"
    name               = "email"
    required           = true
    mutable            = true
  }
}

# Cognito User Pool Client
resource "aws_cognito_user_pool_client" "main" {
  name         = "${var.project_name}-client "
  user_pool_id = aws_cognito_user_pool.main.id

  generate_secret = false
  
  allowed_oauth_flows_user_pool_client = true
  allowed_oauth_flows                 = ["code"]
  allowed_oauth_scopes               = ["email", "openid", "profile"]
  
  callback_urls = [
    "https://${var.web_bucket}.s3.${var.aws_region}.amazonaws.com/callback.html",
    "https://14strings.com/callback.html"
  ]
  
  logout_urls = [
    "https://${var.web_bucket}.s3.${var.aws_region}.amazonaws.com/admin.html",
    "https://14strings.com/admin.html"    
  ]

  supported_identity_providers = ["COGNITO"]

  explicit_auth_flows = [
    "ALLOW_USER_SRP_AUTH",
    "ALLOW_REFRESH_TOKEN_AUTH"
  ]

  access_token_validity  = 60
  id_token_validity     = 60
  refresh_token_validity = 30

  token_validity_units {
    access_token  = "minutes"
    id_token      = "minutes"
    refresh_token = "days"
  }
}

# Cognito User Pool Domain
resource "aws_cognito_user_pool_domain" "main" {
  domain       = "${var.project_name}-auth"
  user_pool_id = aws_cognito_user_pool.main.id
}

# Cognito User Group - Admin
resource "aws_cognito_user_group" "admin" {
  name         = "admin"
  user_pool_id = aws_cognito_user_pool.main.id
  description  = "Administrator group"
  precedence   = 1
}

# Cognito Admin User
resource "aws_cognito_user" "admin" {
  user_pool_id = aws_cognito_user_pool.main.id
  username     = var.admin_username
  
  attributes = {
    email           = var.admin_email
    email_verified  = true
  }

  temporary_password = var.admin_temporary_password
  message_action     = "SUPPRESS"
}

# Add admin user to admin group
resource "aws_cognito_user_in_group" "admin_user" {
  user_pool_id = aws_cognito_user_pool.main.id
  group_name   = aws_cognito_user_group.admin.name
  username     = aws_cognito_user.admin.username
}

# IAM Role for Lambda functions
resource "aws_iam_role" "lambda_role" {
  name = "${var.project_name}-lambda-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "lambda.amazonaws.com"
        }
      }
    ]
  })
}

# IAM Policy for Lambda functions
resource "aws_iam_role_policy" "lambda_policy" {
  name = "${var.project_name}-lambda-policy"
  role = aws_iam_role.lambda_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents"
        ]
        Resource = "arn:aws:logs:*:*:*"
      },
      {
        Effect = "Allow"
        Action = [
          "s3:GetObject",
          "s3:PutObject",
          "s3:DeleteObject",
          "s3:ListBucket"
        ]
        Resource = [
          aws_s3_bucket.zip_uploads.arn,
          "${aws_s3_bucket.zip_uploads.arn}/*",
          aws_s3_bucket.extracted_files.arn,
          "${aws_s3_bucket.extracted_files.arn}/*"
        ]
      }
    ]
  })
}

# API Gateway
resource "aws_apigatewayv2_api" "main" {
  name          = "${var.project_name}-api"
  protocol_type = "HTTP"

  cors_configuration {
    allow_headers     = ["*"]
    allow_methods     = ["*"]
    allow_origins     = ["https://14strings.com"]
    max_age          = 300
  }
}

# Cognito Authorizer for API Gateway
resource "aws_apigatewayv2_authorizer" "cognito" {
  api_id           = aws_apigatewayv2_api.main.id
  authorizer_type  = "JWT"
  identity_sources = ["$request.header.Authorization"]
  name             = "${var.project_name}-cognito-authorizer"

  jwt_configuration {
    audience = [aws_cognito_user_pool_client.main.id]
    issuer   = "https://cognito-idp.${var.aws_region}.amazonaws.com/${aws_cognito_user_pool.main.id}"
  }
}


# S3 Event Notification for zip processor
resource "aws_s3_bucket_notification" "zip_upload_notification" {
  bucket = aws_s3_bucket.zip_uploads.id

  lambda_function {
    lambda_function_arn = aws_lambda_function.zip_processor.arn
    events              = ["s3:ObjectCreated:*"]
    filter_suffix       = ".zip"
  }

  depends_on = [aws_lambda_permission.s3_invoke_zip_processor]
}

# Lambda permission for S3 to invoke zip processor
resource "aws_lambda_permission" "s3_invoke_zip_processor" {
  statement_id  = "AllowExecutionFromS3Bucket"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.zip_processor.function_name
  principal     = "s3.amazonaws.com"
  source_arn    = aws_s3_bucket.zip_uploads.arn
}

# API Gateway Lambda Integration for file manager
resource "aws_apigatewayv2_integration" "file_manager" {
  api_id             = aws_apigatewayv2_api.main.id
  integration_type   = "AWS_PROXY"
  integration_uri    = aws_lambda_function.file_manager.invoke_arn
  integration_method = "POST"
}

# API Gateway Route for presigned URL generation
resource "aws_apigatewayv2_route" "get_presigned_url" {
  api_id    = aws_apigatewayv2_api.main.id
  route_key = "POST /presigned-url"
  target    = "integrations/${aws_apigatewayv2_integration.file_manager.id}"
#  authorization_type = "JWT"
#  authorizer_id     = aws_apigatewayv2_authorizer.cognito.id
}

# API Gateway Route for folder deletion
resource "aws_apigatewayv2_route" "delete_folder" {
  api_id    = aws_apigatewayv2_api.main.id
  route_key = "DELETE /folder/{folder_name}"
  target    = "integrations/${aws_apigatewayv2_integration.file_manager.id}"
#  authorization_type = "JWT"
#  authorizer_id     = aws_apigatewayv2_authorizer.cognito.id
}

# API Gateway Route for file deletion
resource "aws_apigatewayv2_route" "delete_file" {
  api_id    = aws_apigatewayv2_api.main.id
  route_key = "DELETE /file"
  target    = "integrations/${aws_apigatewayv2_integration.file_manager.id}"
#  authorization_type = "JWT"
#  authorizer_id     = aws_apigatewayv2_authorizer.cognito.id
}

# API Gateway Stage
resource "aws_apigatewayv2_stage" "main" {
  api_id      = aws_apigatewayv2_api.main.id
  name        = "prod"
  auto_deploy = true

  access_log_settings {
    destination_arn = aws_cloudwatch_log_group.api_gateway.arn
    format = jsonencode({
      requestId      = "$context.requestId"
      ip            = "$context.identity.sourceIp"
      requestTime   = "$context.requestTime"
      httpMethod    = "$context.httpMethod"
      routeKey      = "$context.routeKey"
      status        = "$context.status"
      protocol      = "$context.protocol"
      responseLength = "$context.responseLength"
    })
  }
}

# CloudWatch Log Group for API Gateway
resource "aws_cloudwatch_log_group" "api_gateway" {
  name              = "/aws/apigateway/${var.project_name}"
  retention_in_days = 14
}

# Lambda permission for API Gateway
resource "aws_lambda_permission" "api_gateway_invoke" {
  statement_id  = "AllowExecutionFromAPIGateway"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.file_manager.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.main.execution_arn}/*/*"
}
