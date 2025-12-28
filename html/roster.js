const BUCKET_NAME = 'tabs.14strings.com';
const BUCKET_API_URL = `https://s3.amazonaws.com/${BUCKET_NAME}`;
const BUCKET_URL = `https://${BUCKET_NAME}`;
//const BUCKET_URL = BUCKET_API_URL;
const S3_FOLDER = 'roster';
const USE_DEMO_MODE = false;
const AUTO_PLAY_DELAY = 3000;

/**
 * Escape HTML to prevent XSS attacks
 * @param {string} text - Text to escape
 * @returns {string} Escaped HTML
 */
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * Parse S3 XML list response
 * @param {string} xmlText - XML response from S3
 * @returns {Array} Array of objects
 */
function parseS3ListResponse(xmlText) {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlText, 'text/xml');
    const contents = xmlDoc.getElementsByTagName('Contents');
    const objects = [];

    for (let i = 0; i < contents.length; i++) {
        const keyElement = contents[i].getElementsByTagName('Key')[0];
        const sizeElement = contents[i].getElementsByTagName('Size')[0];
        const lastModifiedElement = contents[i].getElementsByTagName('LastModified')[0];

        if (keyElement && keyElement.textContent) {
            objects.push({
                Key: keyElement.textContent,
                Size: sizeElement ? parseInt(sizeElement.textContent) : 0,
                LastModified: lastModifiedElement ? new Date(lastModifiedElement.textContent) : null,
            });
        }
    }

    return objects;
}

/**
 * Fetch object metadata from S3 using HTTP HEAD request
 * @param {string} url - Object URL
 * @returns {Promise<Object>} Metadata object
 */
async function fetchObjectMetadata(url) {
    try {
        const response = await fetch(url, { method: 'HEAD' });
        if (!response.ok) 
            throw new Error(`HTTP ${response.status}`);
        
        const metadata = {"caption" : "", "position" : 100000 };

        response.headers.forEach( (value, key) => {
            if (key.toLowerCase() == "x-amz-meta-position")
                metadata.position = parseInt(value)
            if (key.toLowerCase() == "x-amz-meta-caption")
                metadata.caption = value
        });
        return metadata;
    } catch (error) {
        console.warn(`Failed to fetch metadata for ${url}:`, error.message);
        return {};
    }
}

/**
 * Fetch images from S3 bucket using public HTTP access
 * @returns {Promise<Array>} Array of image objects
 */
async function fetchImagesFromS3() {

    try {
        // Use ListObjectsV2 API with prefix parameter to filter by folder
        const url = new URL(BUCKET_API_URL);
        url.searchParams.set('list-type', '2');
        url.searchParams.set('prefix', `${S3_FOLDER}/`);
        
        const response = await fetch(url.toString());

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const xmlText = await response.text();
        const objects = parseS3ListResponse(xmlText);

        if (objects.length === 0) {
            return [];
        }

        const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'];
        const imageObjects = objects.filter(obj => {
            const key = obj.Key.toLowerCase();
            // Only filter by image extension since prefix already filtered by folder
            return imageExtensions.some(ext => key.endsWith(ext));
        });

        var imagesWithMetadata = await Promise.all(
            imageObjects.map(async (obj) => {
                const url = `${BUCKET_URL}/${obj.Key}`;
                const metadata = await fetchObjectMetadata(url);

                return {
                    key: obj.Key,
                    url: url,
                    caption: metadata.caption,
                    position: metadata.position,
                    size: obj.Size,
                    lastModified: obj.LastModified,
                };
            })
        );

        imagesWithMetadata.sort( (a,b) => a.position - b.position );

        return imagesWithMetadata;
    } catch (error) {
        console.error('Error fetching images from S3:', error);
        throw new Error(`Failed to fetch images: ${error.message}`);
    }
}

/**
 * Render the UI based on current state
 */
function render() {
    const container = document.getElementById('slideshow-container');
    
    if (state.loading) {
        container.innerHTML = `
            <div class="loading">
                <div class="spinner"></div>
                <p>Loading images from S3...</p>
            </div>
        `;
        return;
    }

    if (state.error) {
        container.innerHTML = `
            <div class="error">
                <h2>⚠️ Error Loading Images</h2>
                <p>${escapeHtml(state.error)}</p>
                <button onclick="window.retryFetch()" class="retry-button">Retry</button>
            </div>
        `;
        return;
    }

    if (state.images.length === 0) {
        container.innerHTML = `
            <div class="empty">
                <h2>No Images Found</h2>
                <p>The S3 bucket does not contain any images.</p>
            </div>
        `;
        return;
    }

    const currentImage = state.images[state.currentIndex];

    const updateCaption = !is_admin ? `<p class="caption">${escapeHtml(currentImage.caption)}</p> ` : `
        <form id="updateCaption">
              <input type="hidden" name="key" id="imageKey" value="${escapeHtml(currentImage.key)}"/>
                <div class="form-group">
                    <input type="hidden" id="position" value="${escapeHtml(currentImage.position)}" />
                    <input type="text" id="caption" name="caption" required 
                           placeholder="${escapeHtml(currentImage.caption)}" />
                </div>
                <button type="button" value="Update" class="btn" id="updateCaptionBtn">Update</button>
            </form>
    `

    const saveOrderButton = is_admin && state.hasUnsavedChanges ? `
        <button 
            onclick="window.saveOrder()" 
            class="nav-button save-order-btn" 
            ${state.isSaving ? 'disabled' : ''}>
            ${state.isSaving ? '⏳ Saving...' : '💾 Save Order'}
        </button>
    ` : '';

    const thumbnailsHTML = state.images.length > 1 ? `
        <div class="thumbnails">
            ${state.images.map((img, index) => `
          <div 
    class="thumbnail ${index === state.currentIndex ? 'active' : ''}"
    style="background-image: url('${escapeHtml(img.url)}')"
    title="${escapeHtml(img.caption)}"
    onclick="window.goToImage(${index})"
    draggable="true"
    data-index="${index}"
    tabindex="0"
    role="button"
    aria-label="Thumbnail ${index + 1}: ${escapeHtml(img.caption)}"
        ></div>
        `).join('')}
        </div>
    ` : '';

    container.innerHTML = `
        <div class="slideshow">
            <div class="image-wrapper">
                <img 
                    src="${escapeHtml(currentImage.url)}" 
                    alt="${escapeHtml(currentImage.caption)}"
                    class="slideshow-image"
                    onerror="window.handleImageError(this)"
                />
            </div>

            <div class="caption-wrapper">
                  ${updateCaption}
            </div>

            <div class="controls">
                <button onclick="window.previousImage()" class="nav-button" ${state.images.length <= 1 ? 'disabled' : ''}>
                    ← Previous
                </button>
                <button onclick="window.toggleAutoPlay()" class="nav-button">
                    ${state.isAutoPlaying ? '⏸ Pause' : '▶ Play'}
                </button>
                <button onclick="window.nextImage()" class="nav-button" ${state.images.length <= 1 ? 'disabled' : ''}>
                    Next →
                </button>
                ${saveOrderButton}
            </div>

            ${thumbnailsHTML}
        </div>
    `;

    if (is_admin) {
        document.getElementById('updateCaptionBtn').addEventListener('click', doUpdateCaption);
    }

    // Add drag-and-drop event listeners to thumbnails
    if (is_admin && state.images.length > 1) {
        setupDragAndDrop();
    }
}

/**
 * Handle image loading errors
 * @param {HTMLImageElement} imgElement - Image element that failed to load
 */
function handleImageError(imgElement) {
    console.error('Failed to load image:', imgElement.src);
    imgElement.src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="400" height="300"%3E%3Crect fill="%23ddd" width="400" height="300"/%3E%3Ctext fill="%23999" font-family="sans-serif" font-size="16" dy="10.5" font-weight="bold" x="50%25" y="50%25" text-anchor="middle"%3EImage Not Available%3C/text%3E%3C/svg%3E';
}

/**
 * Application state management
 */
const state = {
    images: [],
    currentIndex: 0,
    loading: true,
    error: null,
    isAutoPlaying: false,
    autoPlayInterval: null,
    hasUnsavedChanges: false,
    isSaving: false,
};

/**
 * Navigate to next image
 */
function nextImage() {
    if (state.images.length > 0) {
        state.currentIndex = (state.currentIndex + 1) % state.images.length;
    }
}

/**
 * Navigate to previous image
 */
function previousImage() {
    if (state.images.length > 0) {
        state.currentIndex = (state.currentIndex - 1 + state.images.length) % state.images.length;
    }
}

/**
 * Go to specific image index
 * @param {number} index - Image index
 */
function goToImage(index) {
    state.currentIndex = index;
}

/**
 * Start auto-play
 */
function startAutoPlay() {
    state.isAutoPlaying = true;
    state.autoPlayInterval = setInterval(() => {
        nextImage();
    }, AUTO_PLAY_DELAY);
}

/**
 * Stop auto-play
 */
function stopAutoPlay() {
    state.isAutoPlaying = false;
    if (state.autoPlayInterval) {
        clearInterval(state.autoPlayInterval);
        state.autoPlayInterval = null;
    }
}

/**
 * Toggle auto-play on/off
 */
function toggleAutoPlay() {
    if (state.isAutoPlaying) {
        stopAutoPlay();
    } else {
        startAutoPlay();
    }
}

/**
 * Load images from S3
 */
async function loadImages() {
    try {
        state.loading = true;
        state.error = null;
        render();
        
        state.images = await fetchImagesFromS3();
        state.loading = false;
        render();
    } catch (err) {
        state.error = err.message || 'Failed to load images';
        state.loading = false;
        render();
    }
}

/**
 * Retry fetching images
 */
function retryFetch() {
    loadImages();
}

/**
 * Drag and Drop State
 */
let dragState = {
    draggedIndex: null,
    draggedElement: null
};

/**
 * Setup drag and drop event listeners for thumbnails
 */
function setupDragAndDrop() {
    const thumbnails = document.querySelectorAll('.thumbnail');
    
    thumbnails.forEach(thumbnail => {
        // Remove existing listeners to prevent duplicates
        thumbnail.removeEventListener('dragstart', handleDragStart);
        thumbnail.removeEventListener('dragend', handleDragEnd);
        thumbnail.removeEventListener('dragover', handleDragOver);
        thumbnail.removeEventListener('drop', handleDrop);
        thumbnail.removeEventListener('dragleave', handleDragLeave);
        thumbnail.removeEventListener('keydown', handleKeyboardNavigation);
        
        // Add drag events
        thumbnail.addEventListener('dragstart', handleDragStart);
        thumbnail.addEventListener('dragend', handleDragEnd);
        thumbnail.addEventListener('dragover', handleDragOver);
        thumbnail.addEventListener('drop', handleDrop);
        thumbnail.addEventListener('dragleave', handleDragLeave);
        
        // Keyboard navigation for accessibility
        thumbnail.addEventListener('keydown', handleKeyboardNavigation);
    });
}

/**
 * Handle drag start event
 * @param {DragEvent} e - Drag event
 */
function handleDragStart(e) {
    dragState.draggedIndex = parseInt(e.currentTarget.dataset.index);
    dragState.draggedElement = e.currentTarget;
    e.currentTarget.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/html', e.currentTarget.innerHTML);
}

/**
 * Handle drag end event
 * @param {DragEvent} e - Drag event
 */
function handleDragEnd(e) {
    e.currentTarget.classList.remove('dragging');
    // Remove all drag-over classes
    document.querySelectorAll('.thumbnail').forEach(thumb => {
        thumb.classList.remove('drag-over');
    });
}

/**
 * Handle drag over event
 * @param {DragEvent} e - Drag event
 */
function handleDragOver(e) {
    if (e.preventDefault) {
        e.preventDefault();
    }
    e.dataTransfer.dropEffect = 'move';
    
    const currentElement = e.currentTarget;
    if (currentElement !== dragState.draggedElement) {
        currentElement.classList.add('drag-over');
    }
    
    return false;
}

/**
 * Handle drag leave event
 * @param {DragEvent} e - Drag event
 */
function handleDragLeave(e) {
    e.currentTarget.classList.remove('drag-over');
}

/**
 * Handle drop event
 * @param {DragEvent} e - Drag event
 */
function handleDrop(e) {
    if (e.stopPropagation) {
        e.stopPropagation();
    }
    
    e.currentTarget.classList.remove('drag-over');
    
    const dropIndex = parseInt(e.currentTarget.dataset.index);
    
    if (dragState.draggedIndex !== dropIndex) {
        // Reorder the images array efficiently
        const newImages = [...state.images];
        const [draggedImage] = newImages.splice(dragState.draggedIndex, 1);
        newImages.splice(dropIndex, 0, draggedImage);
        
        // Update positions based on new order
        newImages.forEach((img, index) => {
            img.position = index;
        });
        
        // Update state
        state.images = newImages;
        state.hasUnsavedChanges = true;
        
        // Update current index if the current image was moved
        if (state.currentIndex === dragState.draggedIndex) {
            state.currentIndex = dropIndex;
        } else if (dragState.draggedIndex < state.currentIndex && dropIndex >= state.currentIndex) {
            state.currentIndex--;
        } else if (dragState.draggedIndex > state.currentIndex && dropIndex <= state.currentIndex) {
            state.currentIndex++;
        }
        
        // Re-render
        render();
    }
    
    return false;
}

/**
 * Save the current order of images to S3
 */
async function saveOrder() {
    if (!state.hasUnsavedChanges || state.isSaving) {
        return;
    }
    
    try {
        state.isSaving = true;
        render();
        
        // Update all images with their current positions
        const updatePromises = state.images.map((img, index) => {
            return updateS3Metadata(img.key, { 
                caption: img.caption, 
                position: index 
            });
        });
        
        const results = await Promise.all(updatePromises);
        
        // Check if all updates were successful
        const failedUpdates = results.filter(result => result === null);
        
        if (failedUpdates.length === 0) {
            state.hasUnsavedChanges = false;
            showMessage(`Successfully saved order for ${results.length} image(s)`, 'success');
        } else {
            showMessage(`Saved ${results.length - failedUpdates.length} of ${results.length} images. Some updates failed.`, 'error');
        }
    } catch (error) {
        console.error('Error saving order:', error);
        showMessage(`Failed to save order: ${error.message}`, 'error');
    } finally {
        state.isSaving = false;
        render();
    }
}

/**
 * Focus a thumbnail by index after render completes
 * @param {number} index - Thumbnail index to focus
 */
function focusThumbnail(index) {
    // Use requestAnimationFrame to ensure DOM has updated after render
    requestAnimationFrame(() => {
        const thumbnails = document.querySelectorAll('.thumbnail');
        if (thumbnails[index]) {
            thumbnails[index].focus();
        }
    });
}

/**
 * Handle keyboard navigation for accessibility
 * @param {KeyboardEvent} e - Keyboard event
 */
function handleKeyboardNavigation(e) {
    const currentIndex = parseInt(e.currentTarget.dataset.index);
    const thumbnails = Array.from(document.querySelectorAll('.thumbnail'));
    
    switch (e.key) {
        case 'Enter':
        case ' ':
            e.preventDefault();
            window.goToImage(currentIndex);
            break;
            
        case 'ArrowLeft':
        case 'ArrowUp':
            e.preventDefault();
            if (e.altKey && currentIndex > 0) {
                // Alt+Arrow to reorder (swapImages calls render internally)
                swapImages(currentIndex, currentIndex - 1);
                // Restore focus after DOM updates
                focusThumbnail(currentIndex - 1);
            } else if (currentIndex > 0) {
                // Regular arrow to navigate
                thumbnails[currentIndex - 1].focus();
            }
            break;
            
        case 'ArrowRight':
        case 'ArrowDown':
            e.preventDefault();
            if (e.altKey && currentIndex < thumbnails.length - 1) {
                // Alt+Arrow to reorder (swapImages calls render internally)
                swapImages(currentIndex, currentIndex + 1);
                // Restore focus after DOM updates
                focusThumbnail(currentIndex + 1);
            } else if (currentIndex < thumbnails.length - 1) {
                // Regular arrow to navigate
                thumbnails[currentIndex + 1].focus();
            }
            break;
            
        case 'Home':
            e.preventDefault();
            thumbnails[0].focus();
            break;
            
        case 'End':
            e.preventDefault();
            thumbnails[thumbnails.length - 1].focus();
            break;
    }
}

/**
 * Swap two images in the array
 * @param {number} index1 - First image index
 * @param {number} index2 - Second image index
 */
function swapImages(index1, index2) {
    const newImages = [...state.images];
    const temp = newImages[index1];
    newImages[index1] = newImages[index2];
    newImages[index2] = temp;
    
    // Update positions
    newImages.forEach((img, index) => {
        img.position = index;
    });
    
    // Update state
    state.images = newImages;
    state.hasUnsavedChanges = true;
    
    // Update current index if needed
    if (state.currentIndex === index1) {
        state.currentIndex = index2;
    } else if (state.currentIndex === index2) {
        state.currentIndex = index1;
    }
    
    render();
}

// Expose functions to global scope for inline event handlers
window.nextImage = () => {
    nextImage();
    render();
};

window.previousImage = () => {
    previousImage();
    render();
};

window.goToImage = (index) => {
    goToImage(index);
    render();
};

window.toggleAutoPlay = () => {
    toggleAutoPlay();
    // Set up interval to re-render during auto-play
    if (state.isAutoPlaying) {
        const originalInterval = state.autoPlayInterval;
        clearInterval(originalInterval);
        state.autoPlayInterval = setInterval(() => {
            nextImage();
            render();
        }, AUTO_PLAY_DELAY);
    }
    render();
};

window.retryFetch = retryFetch;
window.handleImageError = handleImageError;
window.saveOrder = () => {
    saveOrder();
};

// Initialize application
document.addEventListener('DOMContentLoaded', () => {
    loadImages();
});

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
    stopAutoPlay();
});


async function doUpdateCaption() {
    const caption = document.getElementById("caption").value;
    const position = document.getElementById("position").value;
    const key = document.getElementById("imageKey").value;    
    await updateS3Metadata(key, { "caption" : caption, "position": position  })
}


async function updateS3Metadata(objectKey, metadata) {

    if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata) || metadata === null) {
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
                bucket_name: BUCKET_NAME,
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
