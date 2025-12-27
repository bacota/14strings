
// Global variables
let token = null;
let idToken = null;
let accessToken = null;
let userInfo = null;
let isAdmin = false;

function initializeApp() {
    // Check if user is already authenticated
    accessToken = localStorage.getItem('accessToken');
    idToken = localStorage.getItem('idToken');
    user = localStorage.getItem('userInfo');
    token = accessToken

    if (token && user) {
        userInfo = JSON.parse(user);
        handleAuthentication();
    }

    // Set login URL
    const loginUrl = `https://${CONFIG.cognitoDomain}.auth.${CONFIG.awsRegion}.amazoncognito.com/login?client_id=${CONFIG.clientId}&response_type=code&scope=email+openid+profile&redirect_uri=${encodeURIComponent(CONFIG.redirectUri)}`;
    console.log(loginUrl)
    document.getElementById('loginBtn').href = loginUrl;
}

function handleAuthentication() {
    document.getElementById('authSection').style.display = 'none';
    document.getElementById('userInfo').style.display = 'block';
    
    // Display user info
    document.getElementById('userEmail').textContent = userInfo.email || 'N/A';
    document.getElementById('userGroups').textContent = userInfo.groups ? userInfo.groups.join(', ') : 'None';
    
    // Check if user is admin
    isAdmin = userInfo.groups && userInfo.groups.includes('admin');
    
    if (isAdmin) {
        unblock();
    } else {
        showMessage('You need admin privileges to use this application.', 'error');
    }
}

function handleLogout() {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    accessToken = null;
    isAdmin = false;

    document.getElementById('authSection').style.display = 'block';
    document.getElementById('userInfo').style.display = 'none';
    block();    
    showMessage('Logged out successfully.', 'success');
}

function handleZipFileSelect(event) {
    const file = event.target.files[0];
    updateFileDisplay(file);
}


function handleNonZipFileSelect(event) {
    const file = event.target.files[0];
    updateNonZipFileDisplay(file);
}


function handleDragOver(event) {
    event.preventDefault();
    event.currentTarget.style.backgroundColor = '#e9ecef';
}

function handleZipDrop(event) {
    event.preventDefault();
    event.currentTarget.style.backgroundColor = '#f8f9fa';
    
    const files = event.dataTransfer.files;
    if (files.length > 0) {
        const file = files[0];
        if (file.name.toLowerCase().endsWith('.zip')) {
            document.getElementById('zipFile').files = files;
            updateFileDisplay(file);
        } else {
            showMessage('Please select a valid .zip file.', 'error');
        }
    }
}

function updateFileDisplay(file) {
    const display = document.getElementById('fileDisplayText');
    if (file) {
        const sizeInMB = (file.size / (1024 * 1024)).toFixed(2);
        display.textContent = `Selected: ${file.name} (${sizeInMB} MB)`;
        
        if (file.size > 268435456) { // 256MB in bytes
            showMessage('File size exceeds 256MB limit. Please select a smaller file.', 'error');
            document.getElementById('zipFile').value = '';
            display.textContent = 'Click here to select a zip file or drag and drop';
        }
    } else {
        display.textContent = 'Click here to select a zip file or drag and drop';
    }
}

async function handleUpload(event) {
    event.preventDefault();
    
    if (!isAdmin) {
        showMessage('Admin privileges required.', 'error');
        return;
    }

    const folderName = document.getElementById('folderName').value.trim();
    const fileInput = document.getElementById('zipFile');
    const file = fileInput.files[0];

    if (!folderName || !file) {
        showMessage('Please fill in all fields.', 'error');
        return;
    }

    if (file.size > 268435456) { // 256MB
        showMessage('File size exceeds 256MB limit.', 'error');
        return;
    }

    try {
        showProgress(0, 'Getting upload URL...');
        
        // Get presigned URL
        const presignedResponse = await fetch(`${CONFIG.apiEndpoint}/presigned-url`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${idToken}`
            },
            body: JSON.stringify({
                folder_name: folderName,
                file_name: file.name
            })
        });

        if (!presignedResponse.ok) {
            const errorData = await presignedResponse.json();
            throw new Error(errorData.error || 'Failed to get upload URL');
        }

        const { presigned_post } = await presignedResponse.json();
        
        showProgress(25, 'Uploading file...');
        
        // Upload file using presigned POST
        const formData = new FormData();
        
        // Add all the fields from presigned_post
        Object.entries(presigned_post.fields).forEach(([key, value]) => {
            formData.append(key, value);
        });
        
        // Add the file last
        formData.append('file', file);
        
        // Upload with progress tracking
        await uploadWithProgress(presigned_post.url, formData);
        
        showMessage('File uploaded successfully! Processing will begin automatically.', 'success');
        
        // Reset form
        document.getElementById('uploadForm').reset();
        updateFileDisplay(null);
        
    } catch (error) {
        console.error('Upload error:', error);
        showMessage(`Upload failed: ${error.message}`, 'error');
    } finally {
        hideProgress();
    }
}


function handleFileDrop(event) {
    console.log("handling file drop")
    event.preventDefault();
    event.currentTarget.style.backgroundColor = '#f8f9fa';

    const files = event.dataTransfer.files;
    if (files.length > 0) {
        const file = files[0];
        if (!file.name.toLowerCase().endsWith('.zip')) {
            document.getElementById('file').files = files;
            updateNonZipFileDisplay(file);
        } else {
            showMessage('Please do not select a zip file.', 'error');
        }
    }
}

function updateNonZipFileDisplay(file) {
    const display = document.getElementById('fileText');
    if (file) {
        const sizeInMB = (file.size / (1024 * 1024)).toFixed(2);
        display.textContent = `Selected: ${file.name} (${sizeInMB} MB)`;
        
        if (file.size > 10*1024*1024) { 
            showMessage('File size exceeds 10MB limit. Please select a smaller file.', 'error');
            document.getElementById('file').value = '';
            display.textContent = 'Click here to select a file or drag and drop';
        }
    } else {
        display.textContent = 'Click here to select a file or drag and drop';
    }
}

async function handleFileUpload(event, file, data) {

    event.preventDefault();
    
    if (!isAdmin) {
        showMessage('Admin privileges required.', 'error');
        return;
    }

    if (file.size >10737418240) { // 10MB
        showMessage('File size exceeds 10MB limit.', 'error');
        return;
    }

    try {
        showProgress(0, 'Getting upload URL...');
        console.log(data)
        
        // Get presigned URL
        const presignedResponse = await fetch(`${CONFIG.apiEndpoint}/presigned-url`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${idToken}`
            },
            body: JSON.stringify(data)
        });

        console.log(JSON.stringify(data))

        if (!presignedResponse.ok) {
            const errorData = await presignedResponse.json();
            throw new Error(errorData.error || 'Failed to get upload URL');
        }

        const { presigned_post } = await presignedResponse.json();
        
        showProgress(25, 'Uploading file...');
        
        // Upload file using presigned POST
        const formData = new FormData();

        console.log(presigned_post.fields)
        
        // Add all the fields from presigned_post
        Object.entries(presigned_post.fields).forEach(([key, value]) => {
            formData.append(key, value);
        });
        
        // Add the file last
        formData.append('file', file);
        
        // Upload with progress tracking
        await uploadWithProgress(presigned_post.url, formData);
        
        showMessage('File uploaded successfully!', 'success');
        
        // Reset forms
        const forms = document.forms;
        for (i=0; i<forms.length; ++i) {
            document.getElementById(forms[i].id).reset();
        }
        
    } catch (error) {
        console.error('Upload error:', error);
        showMessage(`Upload failed: ${error.message}`, 'error');
    } finally {
        hideProgress();
    }
}

function uploadWithProgress(url, formData) {
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        
        xhr.upload.addEventListener('progress', (event) => {
            if (event.lengthComputable) {
                const progress = Math.round((event.loaded / event.total) * 100);
                showProgress(25 + (progress * 0.75), `Uploading... ${progress}%`);
            }
        });
        
        xhr.addEventListener('load', () => {
            if (xhr.status >= 200 && xhr.status < 300) {
                resolve(xhr.response);
            } else {
                reject(new Error(`Upload failed with status ${xhr.status}`));
            }
        });
        
        xhr.addEventListener('error', () => {
            reject(new Error('Upload failed due to network error'));
        });
        
        xhr.open('POST', url);
        xhr.send(formData);
    });
}

async function deleteFolder() {
    if (!isAdmin) {
        showMessage('Admin privileges required.', 'error');
        return;
    }

    const folderName = document.getElementById('deleteFolderName').value.trim();
    if (!folderName) {
        showMessage('Please enter a folder name.', 'error');
        return;
    }

    if (!confirm(`Are you sure you want to delete the entire folder "${folderName}"? This action cannot be undone.`)) {
        return;
    }

    try {
        const response = await fetch(`${CONFIG.apiEndpoint}/folder/${encodeURIComponent(folderName)}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${accessToken}`
            }
        });

        const result = await response.json();

        if (response.ok) {
            showMessage(`Folder "${folderName}" deleted successfully. ${result.deleted_files} files removed.`, 'success');
            document.getElementById('deleteFolderName').value = '';
        } else {
            showMessage(`Failed to delete folder: ${result.error}`, 'error');
        }
    } catch (error) {
        console.error('Delete folder error:', error);
        showMessage(`Error deleting folder: ${error.message}`, 'error');
    }
}

async function deleteFiles() {
    if (!isAdmin) {
        showMessage('Admin privileges required.', 'error');
        return;
    }

    const filesList = document.getElementById('deleteFilesList').value.trim();
    if (!filesList) {
        showMessage('Please enter file paths to delete.', 'error');
        return;
    }

    const files = filesList.split('\n').map(f => f.trim()).filter(f => f.length > 0);
    if (files.length === 0) {
        showMessage('No valid file paths provided.', 'error');
        return;
    }

    if (!confirm(`Are you sure you want to delete ${files.length} file(s)? This action cannot be undone.`)) {
        return;
    }

    try {
        const response = await fetch(`${CONFIG.apiEndpoint}/file`, {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${accessToken}`
            },
            body: JSON.stringify({
                files: files
            })
        });

        const result = await response.json();

        if (response.ok) {
            let message = `${result.deleted_files} file(s) deleted successfully.`;
            if (result.errors && result.errors.length > 0) {
                message += ` However, there were some errors: ${result.errors.join(', ')}`;
            }
            showMessage(message, result.errors ? 'info' : 'success');
            document.getElementById('deleteFilesList').value = '';
        } else {
            showMessage(`Failed to delete files: ${result.error}`, 'error');
        }
    } catch (error) {
        console.error('Delete files error:', error);
        showMessage(`Error deleting files: ${error.message}`, 'error');
    }
}

async function updateS3Metadata(bucketName, objectKey, metadata) {
    if (!isAdmin) {
        showMessage('Admin privileges required.', 'error');
        return;
    }

    if (!bucketName || !objectKey) {
        showMessage('Bucket name and object key are required.', 'error');
        return;
    }

    if (!metadata || typeof metadata !== 'object') {
        showMessage('Metadata must be a valid object.', 'error');
        return;
    }

    try {
        const response = await fetch(`${CONFIG.apiEndpoint}/update-metadata`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${accessToken}`
            },
            body: JSON.stringify({
                bucket_name: bucketName,
                object_key: objectKey,
                metadata: metadata
            })
        });

        const result = await response.json();

        if (response.ok) {
            showMessage(`Successfully updated metadata for ${objectKey}`, 'success');
            return result;
        } else {
            showMessage(`Failed to update metadata: ${result.error}`, 'error');
            return null;
        }
    } catch (error) {
        console.error('Update metadata error:', error);
        showMessage(`Error updating metadata: ${error.message}`, 'error');
        return null;
    }
}

function showProgress(percent, text) {
    const container = document.getElementById('progressContainer');
    const fill = document.getElementById('progressFill');
    const textEl = document.getElementById('progressText');
    
    container.style.display = 'block';
    fill.style.width = `${percent}%`;
    textEl.textContent = text;
}

function hideProgress() {
    const container = document.getElementById('progressContainer');
    container.style.display = 'none';
}

function showMessage(text, type) {
    const messageDiv = document.getElementById('messageDiv');
    messageDiv.textContent = text;
    messageDiv.className = `message ${type}`;
    messageDiv.style.display = 'block';
    
    // Auto-hide after 5 seconds
    setTimeout(() => {
        messageDiv.style.display = 'none';
    }, 5000);
}
