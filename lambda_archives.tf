

# File Manager Lambda Function
resource "aws_lambda_function" "file_manager" {
  filename         = "file_manager.zip"
  function_name    = "${var.project_name}-file-manager"
  source_code_hash = filebase64sha256("file_manager.zip")  
  role            = aws_iam_role.lambda_role.arn
  handler         = "file_manager.lambda_handler"
  runtime         = "python3.13"
  timeout         = 30

  environment {
    variables = {
      ZIP_BUCKET_NAME       = aws_s3_bucket.zip_uploads.bucket
      EXTRACTED_BUCKET_NAME = aws_s3_bucket.extracted_files.bucket
      ADMIN_GROUP_NAME      = aws_cognito_user_group.admin.name
    }
  }
}


# Zip Processor Lambda Function
resource "aws_lambda_function" "zip_processor" {
  filename         = "zip_processor.zip"
  function_name    = "${var.project_name}-zip-processor"
  source_code_hash = filebase64sha256("zip_processor.zip")
  role            = aws_iam_role.lambda_role.arn
  handler         = "zip_processor.lambda_handler"
  runtime         = "python3.13"
  timeout         = 300
  memory_size = 2048

  environment {
    variables = {
      EXTRACTED_BUCKET_NAME = aws_s3_bucket.extracted_files.bucket
      PREFIX = "tabs"
    }
  }
}
