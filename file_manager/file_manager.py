import json
import boto3
import os
from datetime import datetime, timedelta
import jwt
from botocore.exceptions import ClientError
import urllib.parse

# Environment variables
ZIP_BUCKET_NAME = os.environ['ZIP_BUCKET_NAME']
EXTRACTED_BUCKET_NAME = os.environ['EXTRACTED_BUCKET_NAME']
ADMIN_GROUP_NAME = os.environ['ADMIN_GROUP_NAME']

s3_client = boto3.client('s3')

def lambda_handler(event, context):
    """
    Main Lambda handler for file management operations
    """
    try:
        # Extract route and method
        resource = event.get("resource")
        http_method = event.get("httpMethod")
        route_key = http_method+resource
        # print(f"EVENT IS {event}")
        
        # Verify admin group membership
        if not verify_admin_access(event):
            return {
                'statusCode': 403,
                'headers': {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Credentials': 'true'
                },
                'body': json.dumps({'error': 'Access denied. Admin group membership required.'})
            }
        # Route to appropriate handler
        if route_key == 'POST/presigned-url':
            return handle_presigned_url_request(event)
        elif route_key.startswith('DELETE/folder/'):
            return handle_folder_deletion(event)
        elif route_key == 'DELETE/file':
            return handle_file_deletion(event)
        else:
            return {
                'statusCode': 404,
                'headers': {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Credentials': 'true'
                },
                'body': json.dumps({'error': 'Endpoint not found'})
            }
            
    except Exception as e:
        print(f"Error: {str(e)}")
        return {
            'statusCode': 500,
            'headers': {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Credentials': 'true'
            },
            'body': json.dumps({'error': f'Internal server error: {str(e)}'})
        }

def verify_admin_access(event):
    """
    Verify that the user belongs to the admin group
    """
    try:
        # Extract JWT token from Authorization header
        auth_header = event.get('headers', {}).get('authorization', '')
        if not auth_header.startswith('Bearer '):
            return False
            
        token = auth_header[7:]  # Remove 'Bearer ' prefix
        
        # Decode without verification (API Gateway already verified)
        decoded_token = jwt.decode(token, algorithms=["RS256"], options={"verify_signature":False})
        
        # Check if user belongs to admin group
        cognito_groups = decoded_token.get('cognito:groups', [])
        return ADMIN_GROUP_NAME in cognito_groups
        
    except Exception as e:
        print(f"Error verifying admin access: {str(e)}")
        return False

def handle_presigned_url_request(event):
    """
    Generate presigned URL for zip file upload
    """
    try:
        # Parse request body
        body = json.loads(event.get('body', '{}'))
        folder_prefix = body.get('folder_prefix', '').strip()        
        folder_name = body.get('folder_name', '').strip()
        filename = body.get('file_name', '').strip()

        metadata = { key : body[key] for key in body }
        
        if not folder_name or not filename:
            return {
                'statusCode': 400,
                'headers': {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Credentials': 'true'
                },
                'body': json.dumps({'error': 'folder_name and filename are required'})
            }

        folder_name = folder_prefix + '/' + folder_name
        
        timestamp = datetime.utcnow().strftime('%Y%m%d_%H%M%S')
        if filename.lower().endswith('.zip'):
            bucket_name = ZIP_BUCKET_NAME
            s3_key = f"uploads/{timestamp}_{filename}"
        else:
            bucket_name = EXTRACTED_BUCKET_NAME
            s3_key = f"{folder_name}/{filename}"

        metadata['target-folder'] = folder_name
        metadata['original-filename'] = filename
        metadata['upload-timestamp'] = timestamp
        
        # Generate presigned URL with conditions
        presigned_url = s3_client.generate_presigned_url(
            'put_object',
            Params={
                'Bucket': bucket_name,
                'Key': s3_key,
                'Metadata': metadata
            },
            ExpiresIn=3600,  # 1 hour
            HttpMethod='PUT'
        )
        
        # Generate presigned POST for better error handling
        presigned_post = s3_client.generate_presigned_post(
            Bucket=bucket_name,
            Key=s3_key,
            Fields={
                'x-amz-meta-target-folder': folder_name,
                'x-amz-meta-original-filename': filename,
                'x-amz-meta-upload-timestamp': timestamp
            },
            Conditions=[
                ['content-length-range', 1, 268435456],  # 1 byte to 256MB
                {'x-amz-meta-target-folder': folder_name},
                {'x-amz-meta-original-filename': filename},
                {'x-amz-meta-upload-timestamp': timestamp}
            ],
            ExpiresIn=3600
        )
        
        return {
            'statusCode': 200,
            'headers': {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Credentials': 'true'
            },
            'body': json.dumps({
                'presigned_url': presigned_url,
                'presigned_post': presigned_post,
                's3_key': s3_key,
                'expires_in': 3600
            })
        }
        
    except Exception as e:
        print(f"Error generating presigned URL: {str(e)}")
        return {
            'statusCode': 500,
            'headers': {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Credentials': 'true'
            },
            'body': json.dumps({'error': f'Failed to generate presigned URL: {str(e)}'})
        }

def handle_folder_deletion(event):
    """
    Delete an entire folder from the extracted files bucket
    """
    try:
        # Extract folder name from path parameters
        path_parameters = event.get('pathParameters', {})
        folder_name = path_parameters.get('folder_name', '').strip() 
        if folder_name:
            folder_name = 'tabs/' + folder_name
        
        if not folder_name:
            return {
                'statusCode': 400,
                'headers': {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Credentials': 'true'
                },
                'body': json.dumps({'error': 'folder_name is required'})
            }
        
        # URL decode the folder name
        folder_name = urllib.parse.unquote(folder_name)
        
        # List all objects in the folder
        folder_prefix = f"{folder_name}/"
        paginator = s3_client.get_paginator('list_objects_v2')
        
        objects_to_delete = []
        for page in paginator.paginate(Bucket=EXTRACTED_BUCKET_NAME, Prefix=folder_prefix):
            for obj in page.get('Contents', []):
                objects_to_delete.append({'Key': obj['Key']})
        
        if not objects_to_delete:
            return {
                'statusCode': 404,
                'headers': {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Credentials': 'true'
                },
                'body': json.dumps({'error': f'Folder "{folder_name}" not found'})
            }
        
        # Delete objects in batches of 1000 (S3 limit)
        deleted_count = 0
        for i in range(0, len(objects_to_delete), 1000):
            batch = objects_to_delete[i:i+1000]
            response = s3_client.delete_objects(
                Bucket=EXTRACTED_BUCKET_NAME,
                Delete={'Objects': batch}
            )
            deleted_count += len(response.get('Deleted', []))
        
        return {
            'statusCode': 200,
            'headers': {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Credentials': 'true'
            },
            'body': json.dumps({
                'message': f'Successfully deleted folder "{folder_name}"',
                'deleted_files': deleted_count
            })
        }
        
    except Exception as e:
        print(f"Error deleting folder: {str(e)}")
        return {
            'statusCode': 500,
            'headers': {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Credentials': 'true'
            },
            'body': json.dumps({'error': f'Failed to delete folder: {str(e)}'})
        }

def handle_file_deletion(event):
    """
    Delete specific files from the extracted files bucket
    """
    try:
        # Parse request body
        body = json.loads(event.get('body', '{}'))
        files_to_delete = body.get('files', [])
        
        if not files_to_delete:
            return {
                'statusCode': 400,
                'headers': {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Credentials': 'true'
                },
                'body': json.dumps({'error': 'files array is required'})
            }
        
        # Prepare objects for deletion
        objects_to_delete = []
        for file_path in files_to_delete:
            if isinstance(file_path, str) and file_path.strip():
                objects_to_delete.append({'Key': file_path.strip()})
        
        if not objects_to_delete:
            return {
                'statusCode': 400,
                'headers': {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Credentials': 'true'
                },
                'body': json.dumps({'error': 'No valid file paths provided'})
            }
        
        # Delete objects in batches of 1000 (S3 limit)
        deleted_count = 0
        errors = []
        
        for i in range(0, len(objects_to_delete), 1000):
            batch = objects_to_delete[i:i+1000]
            try:
                response = s3_client.delete_objects(
                    Bucket=EXTRACTED_BUCKET_NAME,
                    Delete={'Objects': batch}
                )
                deleted_count += len(response.get('Deleted', []))
                
                # Track any errors
                for error in response.get('Errors', []):
                    errors.append(f"Failed to delete {error['Key']}: {error['Message']}")
                    
            except ClientError as e:
                errors.append(f"Batch deletion failed: {str(e)}")
        
        result = {
            'message': f'Deletion completed. {deleted_count} files deleted.',
            'deleted_files': deleted_count
        }
        
        if errors:
            result['errors'] = errors
            result['partial_success'] = True
        
        return {
            'statusCode': 200 if not errors else 207,  # 207 for partial success
            'headers': {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Credentials': 'true'
            },
            'body': json.dumps(result)
        }
        
    except Exception as e:
        print(f"Error deleting files: {str(e)}")
        return {
            'statusCode': 500,
            'headers': {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Credentials': 'true'
            },
            'body': json.dumps({'error': f'Failed to delete files: {str(e)}'})
        }
