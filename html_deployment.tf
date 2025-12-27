# Upload HTML files to existing web bucket

data "template_file" "admin_template" {
  template = file("${path.module}/html/admin.html")
  vars = {
    api_endpoint   = "${aws_apigatewayv2_api.main.api_endpoint}/prod"
    cognito_domain = aws_cognito_user_pool_domain.main.domain
    client_id      = aws_cognito_user_pool_client.main.id
    redirect_uri   = "https://14strings.com/callback.html"
    aws_region     = var.aws_region
  }
}

resource "aws_s3_object" "admin_html" {
  bucket       = var.web_bucket
  key          = "admin.html"
  content_type = "text/html"
  content      = data.template_file.admin_template.rendered
}

data "template_file" "roster_admin_template" {
  template = file("${path.module}/html/roster-admin.html")
  vars = {
    api_endpoint   = "${aws_apigatewayv2_api.main.api_endpoint}/prod"
    cognito_domain = aws_cognito_user_pool_domain.main.domain
    client_id      = aws_cognito_user_pool_client.main.id
    redirect_uri   = "https://14strings.com/callback.html"
    aws_region     = var.aws_region
  }
}

resource "aws_s3_object" "roster_admin_html" {
  bucket       = var.web_bucket
  key          = "roster-admin.html"
  content_type = "text/html"
  content      = data.template_file.roster_admin_template.rendered
}

resource "aws_s3_object" "admin_js" {
  bucket       = var.web_bucket
  source       = "${path.module}/html/admin.js"
  key          = "admin.js"
  content_type = "text/javascript"
  etag         = filemd5("${path.module}/html/admin.js")
}

resource "aws_s3_object" "roster_js" {
  bucket       = var.web_bucket
  source       = "${path.module}/html/roster.js"
  key          = "roster.js"
  content_type = "text/javascript"
  etag         = filemd5("${path.module}/html/admin.js")
}

data "template_file" "callback" {
  template = file("${path.module}/html/callback.html")
  vars = {
    api_endpoint   = "${aws_apigatewayv2_api.main.api_endpoint}/prod"
    cognito_domain = aws_cognito_user_pool_domain.main.domain
    client_id      = aws_cognito_user_pool_client.main.id
    redirect_uri   = "https://14strings.com/callback.html"
    aws_region     = var.aws_region
  }
}

resource "aws_s3_object" "callback_html" {
  bucket       = var.web_bucket
  key          = "callback.html"
  content_type = "text/html"
  content      = data.template_file.callback.rendered
}
