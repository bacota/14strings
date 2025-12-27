import json
import boto3
import os
from botocore.exceptions import ClientError

s3_client = boto3.client('s3')

def lambda_handler(event, context):
    """
    Lambda handler to update metadata of S3 objects.
    
    Expects input via API Gateway with body containing:
    - bucket_name: S3 bucket name
    - object_key: Key of the object to update
    - metadata: Dictionary of metadata key-value pairs to apply
    """
    try:
        # Parse request body
        body = json.loads(event.get('body', '{}'))
        bucket_name = body.get('bucket_name', '').strip()
        object_key = body.get('object_key', '').strip()
        metadata = body.get('metadata', {})
        
        # Validate required parameters
        if not bucket_name:
            return {
                'statusCode': 400,
                'headers': {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Credentials': 'true'
                },
                'body': json.dumps({'error': 'bucket_name is required'})
            }
        
        if not object_key:
            return {
                'statusCode': 400,
                'headers': {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Credentials': 'true'
                },
                'body': json.dumps({'error': 'object_key is required'})
            }
        
        if not isinstance(metadata, dict):
            return {
                'statusCode': 400,
                'headers': {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Credentials': 'true'
                },
                'body': json.dumps({'error': 'metadata must be a dictionary'})
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
                    'headers': {
                        'Content-Type': 'application/json',
                        'Access-Control-Allow-Origin': '*',
                        'Access-Control-Allow-Credentials': 'true'
                    },
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
            'headers': {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Credentials': 'true'
            },
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
            'headers': {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Credentials': 'true'
            },
            'body': json.dumps({
                'error': f'AWS error: {error_message}',
                'error_code': error_code
            })
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
