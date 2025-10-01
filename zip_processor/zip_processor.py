import json
import boto3
import zipfile
import os
import io
from urllib.parse import unquote_plus
from botocore.exceptions import ClientError

# Environment variables
EXTRACTED_BUCKET_NAME = os.environ['EXTRACTED_BUCKET_NAME']
PREFIX = os.environ['PREFIX']

s3_client = boto3.client('s3')

def lambda_handler(event, context):
    """
    Process zip files uploaded to S3 by extracting them to the extracted files bucket
    """
    try:
        # Process each S3 event record
        for record in event['Records']:
            # Get bucket and object key from the event
            source_bucket = record['s3']['bucket']['name']
            source_key = unquote_plus(record['s3']['object']['key'])
            
            print(f"Processing zip file: {source_key} from bucket: {source_bucket}")
            
            # Get object metadata to determine target folder
            try:
                metadata_response = s3_client.head_object(Bucket=source_bucket, Key=source_key)
                metadata = metadata_response.get('Metadata', {})
                target_folder = metadata.get('target-folder', 'default')
                original_filename = metadata.get('original-filename', source_key)
                
                print(f"Target folder: {target_folder}")
                print(f"Original filename: {original_filename}")
                
            except ClientError as e:
                print(f"Error getting object metadata: {str(e)}")
                target_folder = 'default'
                original_filename = source_key
            
            # Download the zip file from S3
            try:
                zip_obj = s3_client.get_object(Bucket=source_bucket, Key=source_key)
                zip_content = zip_obj['Body'].read()
                
                # Process the zip file
                extract_zip_file(zip_content, target_folder, original_filename)
                
                # Delete the original zip file after successful extraction
                s3_client.delete_object(Bucket=source_bucket, Key=source_key)
                print(f"Successfully deleted original zip file: {source_key}")
                
            except ClientError as e:
                print(f"Error processing zip file {source_key}: {str(e)}")
                continue
            except Exception as e:
                print(f"Unexpected error processing zip file {source_key}: {str(e)}")
                continue
        
        return {
            'statusCode': 200,
            'body': json.dumps('Zip files processed successfully')
        }
        
    except Exception as e:
        print(f"Error in lambda_handler: {str(e)}")
        return {
            'statusCode': 500,
            'body': json.dumps(f'Error processing zip files: {str(e)}')
        }

def extract_zip_file(zip_content, target_folder, original_filename):
    """
    Extract zip file contents to the extracted files bucket
    """
    try:
        # Create a BytesIO object from the zip content
        zip_buffer = io.BytesIO(zip_content)
        
        # Open the zip file
        with zipfile.ZipFile(zip_buffer, 'r') as zip_ref:
            # Get list of all files in the zip
            file_list = zip_ref.namelist()
            print(f"Zip file contains {len(file_list)} files/folders")
            
            # Process each file in the zip
            for file_info in zip_ref.infolist():
                file_path = file_info.filename
                
                # Skip directories (they'll be created implicitly)
                if file_path.endswith('/'):
                    continue
                
                # Skip hidden files and system files
                if any(part.startswith('.') for part in file_path.split('/')):
                    print(f"Skipping hidden/system file: {file_path}")
                    continue
                
                # Construct the S3 key preserving directory structure
                s3_key = f"{target_folder}/{file_path}"
                
                # Normalize path separators for consistency
                s3_key = PREFIX + "/" + s3_key.replace('\\', '/')
                
                try:
                    # Extract file content
                    file_content = zip_ref.read(file_info)
                    
                    # Determine content type based on file extension
                    content_type = get_content_type(file_path)
                    
                    # Upload to S3
                    s3_client.put_object(
                        Bucket=EXTRACTED_BUCKET_NAME,
                        Key=s3_key,
                        Body=file_content,
                        ContentType=content_type,
                        Metadata={
                            'source-zip': original_filename,
                            'extracted-from': target_folder,
                            'original-path': file_path,
                            'file-size': str(len(file_content))
                        }
                    )
                    
                    print(f"Successfully extracted: {file_path} -> {s3_key}")
                    
                except Exception as e:
                    print(f"Error extracting file {file_path}: {str(e)}")
                    continue
        
        print(f"Zip extraction completed for target folder: {target_folder}")
        
    except zipfile.BadZipFile:
        print("Error: Invalid or corrupted zip file")
        raise Exception("Invalid or corrupted zip file")
    except Exception as e:
        print(f"Error extracting zip file: {str(e)}")
        raise

def get_content_type(filename):
    """
    Determine content type based on file extension
    """
    extension = filename.lower().split('.')[-1] if '.' in filename else ''
    
    content_types = {
        # Text files
        'txt': 'text/plain',
        'md': 'text/markdown',
        'csv': 'text/csv',
        'json': 'application/json',
        'xml': 'application/xml',
        'html': 'text/html',
        'htm': 'text/html',
        'css': 'text/css',
        'js': 'application/javascript',
        'ts': 'application/typescript',
        
        # Images
        'jpg': 'image/jpeg',
        'jpeg': 'image/jpeg',
        'png': 'image/png',
        'gif': 'image/gif',
        'bmp': 'image/bmp',
        'webp': 'image/webp',
        'svg': 'image/svg+xml',
        'ico': 'image/x-icon',
        
        # Documents
        'pdf': 'application/pdf',
        'doc': 'application/msword',
        'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'xls': 'application/vnd.ms-excel',
        'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'ppt': 'application/vnd.ms-powerpoint',
        'pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        
        # Archives
        'zip': 'application/zip',
        'tar': 'application/x-tar',
        'gz': 'application/gzip',
        'rar': 'application/x-rar-compressed',
        '7z': 'application/x-7z-compressed',
        
        # Media
        'mp3': 'audio/mpeg',
        'wav': 'audio/wav',
        'mp4': 'video/mp4',
        'avi': 'video/x-msvideo',
        'mov': 'video/quicktime',
        'wmv': 'video/x-ms-wmv',
        
        # Programming languages
        'py': 'text/x-python',
        'java': 'text/x-java-source',
        'c': 'text/x-c',
        'cpp': 'text/x-c++',
        'h': 'text/x-c',
        'hpp': 'text/x-c++',
        'php': 'application/x-php',
        'rb': 'text/x-ruby',
        'go': 'text/x-go',
        'rs': 'text/x-rust',
        'sh': 'application/x-sh',
        'bat': 'application/x-bat',
        'ps1': 'application/x-powershell',
        
        # Data files
        'yaml': 'application/x-yaml',
        'yml': 'application/x-yaml',
        'toml': 'application/toml',
        'ini': 'text/plain',
        'conf': 'text/plain',
        'cfg': 'text/plain',
        'log': 'text/plain'
    }
    
    return content_types.get(extension, 'application/octet-stream')
