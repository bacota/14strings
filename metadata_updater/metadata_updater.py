import json
import boto3
import os
import re
import jwt
from botocore.exceptions import ClientError

s3_client = boto3.client('s3')

# Environment variables
ADMIN_GROUP_NAME = os.environ.get('ADMIN_GROUP_NAME', 'admin')

# Common CORS headers
CORS_HEADERS = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Credentials': 'true'
}

# Validation patterns
BUCKET_NAME_PATTERN = r'^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$'
IP_ADDRESS_PATTERN = r'^\d+\.\d+\.\d+\.\d+$'

def verify_admin_access(event):
    """
    Verify that the user belongs to the admin group
    
    Note: JWT signature verification is disabled here because API Gateway with
    JWT authorizer already validates the token signature before invoking this Lambda.
    This function only checks group membership from the pre-validated token.
    """
    try:
        # Extract JWT token from Authorization header
        auth_header = event.get('headers', {}).get('authorization', '')
        if not auth_header.startswith('Bearer '):
            return False
            
        token = auth_header[7:]  # Remove 'Bearer ' prefix
        
        # Decode without verification (API Gateway already verified the signature)
        decoded_token = jwt.decode(token, algorithms=["RS256"], options={"verify_signature": False})
        
        # Check if user belongs to admin group
        cognito_groups = decoded_token.get('cognito:groups', [])
        return ADMIN_GROUP_NAME in cognito_groups
        
    except Exception as e:
        print(f"Error verifying admin access: {str(e)}")
        return False

def validate_bucket_name(bucket_name):
    """
    Validate S3 bucket name according to AWS naming rules
    """
    if not bucket_name or len(bucket_name) < 3 or len(bucket_name) > 63:
        return False
    
    # Check bucket name format (lowercase letters, numbers, dots, hyphens)
    # Must start and end with letter or number
    if not re.match(BUCKET_NAME_PATTERN, bucket_name):
        return False
    
    # Must not contain consecutive dots or look like IP address
    if '..' in bucket_name or re.match(IP_ADDRESS_PATTERN, bucket_name):
        return False
    
    return True

def validate_object_key(object_key):
    """
    Validate S3 object key to prevent path traversal
    """
    if not object_key:
        return False
    
    # Check for path traversal attempts
    if '..' in object_key or object_key.startswith('/'):
        return False
    
    # Key length should not exceed 1024 characters (AWS limit)
    if len(object_key) > 1024:
        return False
    
    return True

def lambda_handler(event, context):
    """
    Lambda handler to update metadata of S3 objects.
    
    Expects input via API Gateway with body containing:
    - bucket_name: S3 bucket name
    - object_key: Key of the object to update
    - metadata: Dictionary of metadata key-value pairs to apply
    """
    try:
        # Verify admin group membership
        if not verify_admin_access(event):
            return {
                'statusCode': 403,
                'headers': CORS_HEADERS,
                'body': json.dumps({'error': 'Access denied. Admin group membership required.'})
            }
        
        # Parse request body
        body = json.loads(event.get('body', '{}'))
        bucket_name = body.get('bucket_name', '').strip()
        object_key = body.get('object_key', '').strip()
        metadata = body.get('metadata', {})
        
        # Validate required parameters
        if not bucket_name:
            return {
                'statusCode': 400,
                'headers': CORS_HEADERS,
                'body': json.dumps({'error': 'bucket_name is required'})
            }
        
        if not object_key:
            return {
                'statusCode': 400,
                'headers': CORS_HEADERS,
                'body': json.dumps({'error': 'object_key is required'})
            }
        
        if not isinstance(metadata, dict):
            return {
                'statusCode': 400,
                'headers': CORS_HEADERS,
                'body': json.dumps({'error': 'metadata must be a dictionary'})
            }
        
        # Validate bucket name
        if not validate_bucket_name(bucket_name):
            return {
                'statusCode': 400,
                'headers': CORS_HEADERS,
                'body': json.dumps({'error': 'Invalid bucket name format'})
            }
        
        # Validate object key
        if not validate_object_key(object_key):
            return {
                'statusCode': 400,
                'headers': CORS_HEADERS,
                'body': json.dumps({'error': 'Invalid object key format'})
            }
        
        # Get the current object metadata
        try:
            head_response = s3_client.head_object(
                Bucket=bucket_name,
                Key=object_key
            )
        except ClientError as e:
            if e.response['Error']['Code'] == '404':
                return {
                    'statusCode': 404,
                    'headers': CORS_HEADERS,
                    'body': json.dumps({'error': f'Object not found: {object_key}'})
                }
            raise
        
        # Merge existing metadata with new metadata
        existing_metadata = head_response.get('Metadata', {})
        updated_metadata = {**existing_metadata, **metadata}
        
        # Copy object to itself with updated metadata
        copy_source = {'Bucket': bucket_name, 'Key': object_key}
        
        # Prepare copy parameters
        copy_params = {
            'Bucket': bucket_name,
            'Key': object_key,
            'CopySource': copy_source,
            'Metadata': updated_metadata,
            'MetadataDirective': 'REPLACE'
        }
        
        # Preserve content type if it exists
        if 'ContentType' in head_response:
            copy_params['ContentType'] = head_response['ContentType']
        
        # Perform the copy operation
        s3_client.copy_object(**copy_params)
        
        return {
            'statusCode': 200,
            'headers': CORS_HEADERS,
            'body': json.dumps({
                'message': f'Successfully updated metadata for {object_key}',
                'bucket': bucket_name,
                'object_key': object_key,
                'metadata': updated_metadata
            })
        }
        
    except ClientError as e:
        error_code = e.response['Error']['Code']
        error_message = e.response['Error']['Message']
        print(f"AWS Error: {error_code} - {error_message}")
        
        return {
            'statusCode': 500,
            'headers': CORS_HEADERS,
            'body': json.dumps({
                'error': f'AWS error: {error_message}',
                'error_code': error_code
            })
        }
        
    except Exception as e:
        print(f"Error: {str(e)}")
        return {
            'statusCode': 500,
            'headers': CORS_HEADERS,
            'body': json.dumps({'error': f'Internal server error: {str(e)}'})
        }
