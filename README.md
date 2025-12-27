# Zip File Manager

A serverless web application for uploading and managing zip files on AWS S3 with automated extraction, built with Terraform, Lambda, API Gateway, and Cognito authentication.

## Features

- **Secure Authentication**: AWS Cognito with Hosted UI and group-based authorization
- **File Upload**: Presigned URL upload with 256MB file size limit
- **Automated Processing**: Lambda-triggered zip extraction preserving directory structure
- **File Management**: API endpoints for deleting folders and specific files
- **Metadata Management**: Update S3 object metadata through API endpoint
- **Web Interface**: Responsive HTML interface with drag-and-drop file upload
- **Admin Controls**: Restricted access to admin group members only

## Architecture

- **S3 Buckets**: Separate buckets for zip uploads and extracted files
- **Lambda Functions**: 
  - File manager (API) - Handles presigned URLs, file deletion
  - Zip processor (S3-triggered) - Extracts uploaded zip files
  - Metadata updater (API) - Updates S3 object metadata
- **API Gateway**: HTTP API with Cognito JWT authorization
- **Cognito**: User pool with admin group and hosted UI
- **CloudWatch**: Logging for API Gateway and Lambda functions

## Prerequisites

- AWS CLI configured with appropriate permissions
- Terraform >= 1.0
- An existing S3 bucket for hosting web files

## Quick Start

1. **Clone and Configure**
   ```bash
   git clone <repository-url>
   cd zip-file-manager
   cp terraform.tfvars.example terraform.tfvars
   ```

2. **Update Configuration**
   Edit `terraform.tfvars`:
   ```hcl
   aws_region = "us-east-1"
   project_name = "zip-file-manager"
   web_bucket = "your-existing-web-bucket-name"
   admin_username = "admin"
   admin_email = "admin@yourdomain.com"
   admin_temporary_password = "TempPassword123!"
   ```

3. **Deploy Infrastructure**
   ```bash
   terraform init
   terraform plan
   terraform apply
   ```

4. **Access the Application**
   - Web URL will be displayed in outputs
   - Login with admin credentials
   - Change temporary password on first login

## Project Structure

```
zip-file-manager/
├── main.tf                 # Main Terraform configuration
├── variables.tf            # Variable definitions
├── outputs.tf             # Output values
├── lambda_archives.tf     # Lambda function archives
├── html_deployment.tf     # Web file deployment
├── file_manager/
│   ├── file_manager.py    # API Lambda function
│   └── requirements.txt   # Python dependencies
├── zip_processor/
│   ├── zip_processor.py   # S3 event processor
│   └── requirements.txt   # Python dependencies
├── metadata_updater/
│   ├── metadata_updater.py # S3 metadata updater
│   └── requirements.txt   # Python dependencies
├── html/
│   ├── index.html         # Main web interface
│   └── callback.html      # Auth callback handler
├── build_and_deploy.sh    # Build and deployment script
├── terraform.tfvars.example
└── README.md
```

## API Endpoints

All endpoints require Bearer token authentication and admin group membership:

### Generate Presigned URL
```
POST /presigned-url
Content-Type: application/json
Authorization: Bearer <token>

{
  "folder_name": "my-folder",
  "filename": "archive.zip"
}
```

### Update S3 Object Metadata
```
POST /update-metadata
Content-Type: application/json
Authorization: Bearer <token>

{
  "bucket_name": "my-bucket",
  "object_key": "path/to/object.jpg",
  "metadata": {
    "caption": "My caption",
    "position": "center",
    "custom-key": "custom-value"
  }
}
```

**Response:**
```json
{
  "message": "Successfully updated metadata for path/to/object.jpg",
  "bucket": "my-bucket",
  "object_key": "path/to/object.jpg",
  "metadata": {
    "caption": "My caption",
    "position": "center",
    "custom-key": "custom-value"
  }
}
```

### Delete Folder
```
DELETE /folder/{folder_name}
Authorization: Bearer <token>
```

### Delete Files
```
DELETE /file
Content-Type: application/json
Authorization: Bearer <token>

{
  "files": ["folder/file1.txt", "folder/file2.txt"]
}
```

## Web Interface Usage

1. **Authentication**
   - Click "Sign In with Cognito"
   - Use Cognito Hosted UI
   - Admin group members get full access

2. **File Upload**
   - Enter target folder name
   - Select or drag-drop zip file (max 256MB)
   - Upload triggers automatic extraction
   - Directory structure preserved in target folder

3. **File Management**
   - Delete entire folders
   - Delete specific files
   - Real-time feedback and progress indicators

## Security Features

- **Bucket Policies**: Prevent unsigned uploads and oversized files
- **JWT Authorization**: All API endpoints protected
- **Group-based Access**: Admin privileges required
- **Presigned URLs**: Secure, time-limited upload access
- **CORS Configuration**: Proper cross-origin request handling

## File Processing

- **Supported Format**: ZIP files only
- **Size Limit**: 256MB maximum
- **Directory Preservation**: Maintains original structure
- **Content-Type Detection**: Automatic MIME type assignment
- **Metadata Tracking**: Source zip and extraction info stored
- **Error Handling**: Graceful handling of corrupted archives

## Monitoring

- **CloudWatch Logs**: API Gateway and Lambda function logs
- **S3 Events**: Upload and processing notifications
- **Error Tracking**: Detailed error logging and user feedback

## Customization

### Adding File Types
Modify `get_content_type()` in `lambda/zip_processor.py`:
```python
content_types = {
    'your_extension': 'mime/type',
    # ... existing types
}
```

### Adjusting Size Limits
Update bucket policy in `main.tf`:
```hcl
Condition = {
  NumericGreaterThan = {
    "s3:max-keys" = "your_size_in_bytes"
  }
}
```

### Custom Authentication
Modify Cognito configuration or implement custom authorizers in `main.tf`.

## Troubleshooting

### Upload Fails
- Check file size (256MB limit)
- Verify admin group membership
- Check browser console for errors
- Review CloudWatch logs

### Authentication Issues
- Verify Cognito domain setup
- Check redirect URIs
- Confirm user is in admin group
- Clear browser localStorage

### Extraction Problems
- Ensure zip file is not corrupted
- Check Lambda timeout settings
- Review zip processor logs
- Verify S3 permissions

### Metadata Update Issues
- Verify object exists in the specified bucket
- Check that Lambda has s3:GetObject, s3:CopyObject permissions
- Ensure metadata keys are valid (lowercase, alphanumeric, hyphens)
- Review Lambda logs in CloudWatch

## Testing the Metadata Update API

### Using cURL

1. **Get an authentication token** (via Cognito login)

2. **Test updating metadata**:
```bash
curl -X POST https://<api-gateway-url>/prod/update-metadata \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <your-token>" \
  -d '{
    "bucket_name": "tabs.14strings.com",
    "object_key": "tabs/my-folder/image.jpg",
    "metadata": {
      "caption": "Updated caption",
      "position": "center",
      "author": "John Doe"
    }
  }'
```

3. **Verify metadata was updated**:
```bash
aws s3api head-object \
  --bucket tabs.14strings.com \
  --key tabs/my-folder/image.jpg \
  --query Metadata
```

### Using Python

```python
import requests

api_url = "https://<api-gateway-url>/prod/update-metadata"
token = "<your-auth-token>"

payload = {
    "bucket_name": "tabs.14strings.com",
    "object_key": "tabs/my-folder/image.jpg",
    "metadata": {
        "caption": "My image caption",
        "position": "center"
    }
}

headers = {
    "Content-Type": "application/json",
    "Authorization": f"Bearer {token}"
}

response = requests.post(api_url, json=payload, headers=headers)
print(response.json())
```

### Expected Response

Success (200):
```json
{
  "message": "Successfully updated metadata for tabs/my-folder/image.jpg",
  "bucket": "tabs.14strings.com",
  "object_key": "tabs/my-folder/image.jpg",
  "metadata": {
    "caption": "My image caption",
    "position": "center"
  }
}
```

Error (404 - Object not found):
```json
{
  "error": "Object not found: tabs/my-folder/image.jpg"
}
```

Error (400 - Invalid request):
```json
{
  "error": "bucket_name is required"
}
```

## Cleanup

To destroy all created resources:
```bash
terraform destroy
```

Note: This will not delete the existing web bucket specified in variables.

## Cost Considerations

- **Lambda**: Pay per execution and duration
- **S3**: Storage and data transfer costs
- **API Gateway**: Per request pricing
- **Cognito**: Free tier available for users
- **CloudWatch**: Log storage costs

## Security Best Practices

1. Use strong passwords and enable MFA
2. Regularly rotate access tokens
3. Monitor CloudWatch logs for suspicious activity
4. Implement least-privilege IAM policies
5. Enable S3 bucket versioning and logging
6. Use HTTPS for all communications

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make changes and test thoroughly
4. Submit a pull request with detailed description

## License

This project is licensed under the MIT License - see the LICENSE file for details.
