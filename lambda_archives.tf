# File Manager Lambda Archive
data "archive_file" "file_manager_zip" {
  type        = "zip"
  output_path = "file_manager.zip"
  
  source {
    content = templatefile("${path.module}/lambda/file_manager.py", {
      zip_bucket_name       = aws_s3_bucket.zip_uploads.bucket
      extracted_bucket_name = aws_s3_bucket.extracted_files.bucket
      admin_group_name      = aws_cognito_user_group.admin.name
    })
    filename = "lambda_function.py"
  }
}

# Zip Processor Lambda Archive
data "archive_file" "zip_processor_zip" {
  type        = "zip"
  output_path = "zip_processor.zip"
  
  source {
    content = templatefile("${path.module}/lambda/zip_processor.py", {
      extracted_bucket_name = aws_s3_bucket.extracted_files.bucket
    })
    filename = "lambda_function.py"
  }
}
