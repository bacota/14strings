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
            console.log(key + "=" + value)
            if (key.toLowerCase() == "x-amz-meta-position")
                metadata.position = parseInt(value)
            if (key.toLowerCase() == "x-amz-meta-caption")
                metadata.caption = value
        });
        console.log(metadata)
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
    const thumbnailsHTML = state.images.length > 1 ? `
        <div class="thumbnails">
            ${state.images.map((img, index) => `
          <div 
    class="thumbnail ${index === state.currentIndex ? 'active' : ''}"
    style="background-image: url('${escapeHtml(img.url)}')"
    title="${escapeHtml(img.caption)}"
    onclick="window.goToImage(${index})"
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
                <p class="caption">${escapeHtml(currentImage.caption)}</p>
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
            </div>

            ${thumbnailsHTML}
        </div>
    `;
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

// Initialize application
document.addEventListener('DOMContentLoaded', () => {
    loadImages();
});

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
    stopAutoPlay();
});
