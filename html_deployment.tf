# Upload HTML files to existing web bucket

data "template_file" "web_html" {
  template = file("${path.module}/html/index.html")
  vars = {
    api_endpoint    = aws_apigatewayv2_api.main.api_endpoint
    cognito_domain  = aws_cognito_user_pool_domain.main.domain
    client_id       = aws_cognito_user_pool_client.main.id
    redirect_uri    = "https://14strings.com/callback.html"
    aws_region      = var.aws_region
  }
}

resource "aws_s3_object" "index_html" {
  bucket       = var.web_bucket
  key          = "admin.html"
  content_type = "text/html"
  content = data.template_file.web_html.rendered  
}

data "template_file" "callback" {
  template = file("${path.module}/html/callback.html") 
  vars = {
    api_endpoint = aws_apigatewayv2_api.main.api_endpoint    
  }
}

resource "aws_s3_object" "callback_html" {
  bucket       = var.web_bucket
  key          = "callback.html"
  content_type = "text/html"
  content = data.template_file.callback.rendered
}
