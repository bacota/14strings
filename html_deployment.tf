# Upload HTML files to existing web bucket
resource "aws_s3_object" "index_html" {
  bucket       = var.web_bucket
  key          = "index.html"
  content_type = "text/html"
  
  content = templatefile("${path.module}/html/index.html", {
    api_endpoint    = aws_apigatewayv2_api.main.api_endpoint
    cognito_domain  = aws_cognito_user_pool_domain.main.domain
    client_id       = aws_cognito_user_pool_client.main.id
    redirect_uri    = "https://${var.web_bucket}.s3.${var.aws_region}.amazonaws.com/callback.html"
    aws_region      = var.aws_region
  })
}

resource "aws_s3_object" "callback_html" {
  bucket       = var.web_bucket
  key          = "callback.html"
  content_type = "text/html"
  
  content = templatefile("${path.module}/html/callback.html", {
    api_endpoint = aws_apigatewayv2_api.main.api_endpoint
  })
}
