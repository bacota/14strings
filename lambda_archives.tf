
# File Manager Lambda Archive
data "archive_file" "file_manager_zip" {
  type        = "zip"
  output_path = "file_manager.zip"
  source_file  = "${path.module}/lambda/file_manager.py"
}

# File Manager Lambda Function
resource "aws_lambda_function" "file_manager" {
  filename         = data.archive_file.file_manager_zip.output_path
  function_name    = "${var.project_name}-file-manager"
  role            = aws_iam_role.lambda_role.arn
  handler         = "lambda_function.lambda_handler"
  source_code_hash = data.archive_file.file_manager_zip.output_base64sha256
  runtime         = "python3.13"
  timeout         = 30

  environment {
    variables = {
      ZIP_BUCKET_NAME       = aws_s3_bucket.zip_uploads.bucket
      EXTRACTED_BUCKET_NAME = aws_s3_bucket.extracted_files.bucket
      ADMIN_GROUP_NAME      = aws_cognito_user_group.admin.name
    }
  }

  depends_on = [data.archive_file.file_manager_zip]
}

# Zip Processor Lambda Archive
data "archive_file" "zip_processor_zip" {
  type        = "zip"
  output_path = "zip_processor.zip"
  source_file  = "${path.module}/lambda/zip_processor.py"
}

# Zip Processor Lambda Function
resource "aws_lambda_function" "zip_processor" {
  filename         = data.archive_file.zip_processor_zip.output_path
  function_name    = "${var.project_name}-zip-processor"
  role            = aws_iam_role.lambda_role.arn
  handler         = "lambda_function.lambda_handler"
  source_code_hash = data.archive_file.zip_processor_zip.output_base64sha256
  runtime         = "python3.13"
  timeout         = 300
  memory_size = 2048

  environment {
    variables = {
      EXTRACTED_BUCKET_NAME = aws_s3_bucket.extracted_files.bucket
    }
  }

  depends_on = [data.archive_file.zip_processor_zip]
}
