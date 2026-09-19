// RequestScript.js - With Working Crop Handles

(function() {
    'use strict';

    // ------------------------------------------------------------
    // 1. Get Supabase from Config
    // ------------------------------------------------------------
    if (!window.SupabaseConfig || !window.SupabaseConfig.supabase) {
        console.error('❌ SupabaseConfig.js not loaded properly!');
        alert('Configuration error: SupabaseConfig.js is missing. Please check your files.');
        return;
    }

    const supabase = window.SupabaseConfig.supabase;
    const SUPABASE_ANON_KEY = window.SupabaseConfig.SUPABASE_ANON_KEY;
    console.log('✅ Supabase client loaded from SupabaseConfig');

    // ------------------------------------------------------------
    // 2. Edge Function URL for ImgBB Upload
    // ------------------------------------------------------------
    const EDGE_FUNCTION_URL = 'https://icchczijubhzxkjpebps.supabase.co/functions/v1/upload-to-imgbb';

    // ------------------------------------------------------------
    // 3. State variables
    // ------------------------------------------------------------
    let allMembers = [];
    let allSuggestions = [];
    let fillerMemberData = null;
    let isSubmitting = false;
    let isEditMode = false;
    let editingSuggestionId = null;
    let selectedMemberCode = '';

    // Crop state
    let cropImageData = null;
    let cropImage = null;
    let currentMemberName = '';
    let currentMemberCode = '';
    let cropZoom = 1;
    let cropRotation = 0;

    // Crop box state (in pixels relative to the image wrapper)
    let cropBox = {
        x: 0,
        y: 0,
        w: 0,
        h: 0
    };

    // Drag state
    let isDragging = false;
    let isResizing = false;
    let resizeHandle = null;
    let dragStartX = 0;
    let dragStartY = 0;
    let dragStartBox = null;
    let imageRect = null;

    // ------------------------------------------------------------
    // 4. DOM References
    // ------------------------------------------------------------
    const isRegisteredSelect = document.getElementById('isRegisteredSelect');
    const fillerIdentificationBox = document.getElementById('FillerIdentificationBox');
    const suggestMemberContainer = document.getElementById('SuggestMemberContainer');
    const suggestMemberHeading = document.getElementById('SuggestMemberContainerHeading');
    const fillerGenerationSelect = document.getElementById('fillerGenerationSelect');
    const fillerCodeInput = document.getElementById('fillerCode');
    const fillerNameBox = document.getElementById('FillerNameBox');
    const fillerNameDisplay = document.getElementById('FillerName');
    const fillerPhoto = document.getElementById('FillerPhoto');
    const btnConfirmFiller = document.getElementById('btnConfirmFiller');
    const isMemberRegisteredBox = document.getElementById('IsMemberRegisteredBox');
    const isMemberRegisteredSelect = document.getElementById('isMemberRegisteredSelect');
    const memberPersonalCodeBox = document.getElementById('MemberPersonalCodeBox');
    const memberPersonalCodeSelect = document.getElementById('MemberPersonalCodeSelect');
    const form = document.getElementById('addMemberForm');
    const submitBtn = document.getElementById('btnAddSuggestion');
    const resetBtn = document.getElementById('btnReset');
    const feedback = document.getElementById('formFeedback');
    const photoFileInput = document.getElementById('photoFile');
    const photoPreview = document.getElementById('photoPreview');
    const photoUrlInput = document.getElementById('photoUrl');
    const photoFileNameDisplay = document.getElementById('photoFileNameDisplay');
    const uploadStatus = document.getElementById('uploadStatus');

    // Crop modal elements
    const cropModal = document.getElementById('cropModal');
    const cropModalClose = document.getElementById('cropModalClose');
    const cropImageEl = document.getElementById('cropImage');
    const cropBoxEl = document.getElementById('cropBox');
    const cropContainer = document.getElementById('cropContainer');
    const cropConfirmBtn = document.getElementById('cropConfirm');
    const cropCancelBtn = document.getElementById('cropCancel');
    const cropZoomIn = document.getElementById('cropZoomIn');
    const cropZoomOut = document.getElementById('cropZoomOut');
    const cropRotateLeft = document.getElementById('cropRotateLeft');
    const cropRotateRight = document.getElementById('cropRotateRight');
    const cropReset = document.getElementById('cropReset');

    // ------------------------------------------------------------
    // 5. Helper Functions
    // ------------------------------------------------------------
    function getBaseCode(code) {
        if (!code) return '';
        let clean = code;
        clean = clean.replace(/^K([MF])(\d+)/, 'K$2');
        clean = clean.replace(/\.([MF])(\d+)/g, '.$2');
        return clean;
    }

    function getGenerationFromCode(code) {
        if (!code) return 1;
        const base = getBaseCode(code);
        const parts = base.split('.');
        const validParts = parts.filter(p => p.startsWith('K') || /^\d+$/.test(p));
        if (validParts.length > 0 && validParts[0].startsWith('K')) {
            return validParts.length;
        }
        return 1;
    }

    function getMemberByCode(code, members) {
        return members.find(m => m.PersonalCode === code);
    }

    function generatePhotoFilename(memberName, memberCode, timestamp) {
        let cleanName = memberName || 'member';
        cleanName = cleanName.replace(/[^a-zA-Z0-9\u0900-\u097F\s]/g, '');
        cleanName = cleanName.replace(/\s+/g, '_');
        cleanName = cleanName.substring(0, 50);
        let cleanCode = memberCode || 'unknown';
        cleanCode = cleanCode.replace(/[^a-zA-Z0-9.]/g, '');
        const ts = timestamp || new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
        return `Ojha_${cleanName}_${cleanCode}_${ts}.jpg`;
    }

    function dataURLtoFile(dataUrl, filename) {
        const arr = dataUrl.split(',');
        const mime = arr[0].match(/:(.*?);/)[1];
        const bstr = atob(arr[1]);
        let n = bstr.length;
        const u8arr = new Uint8Array(n);
        while (n--) {
            u8arr[n] = bstr.charCodeAt(n);
        }
        return new File([u8arr], filename, { type: mime });
    }

    // ------------------------------------------------------------
    // 6. Crop Functions - Completely Rewritten
    // ------------------------------------------------------------
    function showCropModal(imageData, memberName, memberCode) {
        cropImageData = imageData;
        currentMemberName = memberName || 'member';
        currentMemberCode = memberCode || 'unknown';
        cropModal.style.display = 'flex';
        document.body.style.overflow = 'hidden';
        
        // Reset crop state
        cropZoom = 1;
        cropRotation = 0;
        cropImageEl.style.transform = 'none';
        
        // Load image
        const img = new Image();
        img.onload = function() {
            cropImage = img;
            cropImageEl.src = imageData;
            // Setup crop box after image renders
            setTimeout(initCropBox, 200);
        };
        img.src = imageData;
    }

    function hideCropModal() {
        cropModal.style.display = 'none';
        document.body.style.overflow = '';
        cropImageData = null;
        cropImage = null;
        photoFileInput.value = '';
        // Remove global event listeners
        document.removeEventListener('mousemove', onGlobalMouseMove);
        document.removeEventListener('mouseup', onGlobalMouseUp);
        document.removeEventListener('touchmove', onGlobalTouchMove);
        document.removeEventListener('touchend', onGlobalTouchEnd);
    }

    function initCropBox() {
        if (!cropImageEl.complete || !cropImageEl.naturalWidth) {
            setTimeout(initCropBox, 100);
            return;
        }

        // Get the wrapper (parent of image)
        const wrapper = cropImageEl.parentElement;
        const wrapperRect = wrapper.getBoundingClientRect();
        const imgRect = cropImageEl.getBoundingClientRect();
        
        // Store image rect for coordinate calculations
        imageRect = {
            left: imgRect.left - wrapperRect.left,
            top: imgRect.top - wrapperRect.top,
            width: imgRect.width,
            height: imgRect.height
        };
        
        // Calculate crop box - 70% of image, centered, 3:4 ratio
        let boxW = imgRect.width * 0.7;
        let boxH = boxW / (3/4); // 3:4 ratio
        
        // If box height exceeds image height, adjust
        if (boxH > imgRect.height * 0.7) {
            boxH = imgRect.height * 0.7;
            boxW = boxH * (3/4);
        }
        
        const boxX = (imgRect.width - boxW) / 2;
        const boxY = (imgRect.height - boxH) / 2;
        
        cropBox = {
            x: boxX,
            y: boxY,
            w: boxW,
            h: boxH
        };
        
        updateCropBoxDisplay();
        setupCropEvents();
    }

    function updateCropBoxDisplay() {
        if (!cropBoxEl) return;
        cropBoxEl.style.left = cropBox.x + 'px';
        cropBoxEl.style.top = cropBox.y + 'px';
        cropBoxEl.style.width = cropBox.w + 'px';
        cropBoxEl.style.height = cropBox.h + 'px';
        cropBoxEl.style.display = 'block';
    }

    function setupCropEvents() {
        // Remove old event listeners
        cropBoxEl.removeEventListener('mousedown', onCropMouseDown);
        cropBoxEl.removeEventListener('touchstart', onCropTouchStart);
        
        // Add event listeners directly to the crop box
        cropBoxEl.addEventListener('mousedown', onCropMouseDown);
        cropBoxEl.addEventListener('touchstart', onCropTouchStart, { passive: false });
        
        // Add global event listeners
        document.removeEventListener('mousemove', onGlobalMouseMove);
        document.removeEventListener('mouseup', onGlobalMouseUp);
        document.removeEventListener('touchmove', onGlobalTouchMove);
        document.removeEventListener('touchend', onGlobalTouchEnd);
        
        document.addEventListener('mousemove', onGlobalMouseMove);
        document.addEventListener('mouseup', onGlobalMouseUp);
        document.addEventListener('touchmove', onGlobalTouchMove, { passive: false });
        document.addEventListener('touchend', onGlobalTouchEnd);
    }

    function onCropMouseDown(e) {
        e.preventDefault();
        e.stopPropagation();
        
        const target = e.target;
        
        // Get current image rect
        const wrapper = cropImageEl.parentElement;
        const wrapperRect = wrapper.getBoundingClientRect();
        const imgRect = cropImageEl.getBoundingClientRect();
        
        imageRect = {
            left: imgRect.left - wrapperRect.left,
            top: imgRect.top - wrapperRect.top,
            width: imgRect.width,
            height: imgRect.height
        };
        
        // Get mouse position relative to wrapper
        const mouseX = e.clientX - wrapperRect.left;
        const mouseY = e.clientY - wrapperRect.top;
        
        if (target.classList.contains('crop-handle')) {
            // Start resize
            const handle = target.dataset.handle;
            isResizing = true;
            isDragging = false;
            resizeHandle = handle;
            dragStartX = mouseX;
            dragStartY = mouseY;
            dragStartBox = {
                x: cropBox.x,
                y: cropBox.y,
                w: cropBox.w,
                h: cropBox.h
            };
            console.log('Resize started with handle:', handle);
        } else {
            // Start drag
            isDragging = true;
            isResizing = false;
            dragStartX = mouseX;
            dragStartY = mouseY;
            dragStartBox = {
                x: cropBox.x,
                y: cropBox.y,
                w: cropBox.w,
                h: cropBox.h
            };
            cropBoxEl.style.cursor = 'grabbing';
            console.log('Drag started');
        }
    }

    function onCropTouchStart(e) {
        e.preventDefault();
        e.stopPropagation();
        
        const touch = e.touches[0];
        const target = e.target;
        
        const wrapper = cropImageEl.parentElement;
        const wrapperRect = wrapper.getBoundingClientRect();
        const imgRect = cropImageEl.getBoundingClientRect();
        
        imageRect = {
            left: imgRect.left - wrapperRect.left,
            top: imgRect.top - wrapperRect.top,
            width: imgRect.width,
            height: imgRect.height
        };
        
        const touchX = touch.clientX - wrapperRect.left;
        const touchY = touch.clientY - wrapperRect.top;
        
        if (target.classList.contains('crop-handle')) {
            const handle = target.dataset.handle;
            isResizing = true;
            isDragging = false;
            resizeHandle = handle;
            dragStartX = touchX;
            dragStartY = touchY;
            dragStartBox = {
                x: cropBox.x,
                y: cropBox.y,
                w: cropBox.w,
                h: cropBox.h
            };
        } else {
            isDragging = true;
            isResizing = false;
            dragStartX = touchX;
            dragStartY = touchY;
            dragStartBox = {
                x: cropBox.x,
                y: cropBox.y,
                w: cropBox.w,
                h: cropBox.h
            };
        }
    }

    function onGlobalMouseMove(e) {
        if (!isDragging && !isResizing) return;
        
        const wrapper = cropImageEl.parentElement;
        const wrapperRect = wrapper.getBoundingClientRect();
        const mouseX = e.clientX - wrapperRect.left;
        const mouseY = e.clientY - wrapperRect.top;
        
        handleCropMove(mouseX, mouseY);
    }

    function onGlobalTouchMove(e) {
        if (!isDragging && !isResizing) return;
        e.preventDefault();
        
        const touch = e.touches[0];
        const wrapper = cropImageEl.parentElement;
        const wrapperRect = wrapper.getBoundingClientRect();
        const touchX = touch.clientX - wrapperRect.left;
        const touchY = touch.clientY - wrapperRect.top;
        
        handleCropMove(touchX, touchY);
    }

    function handleCropMove(mouseX, mouseY) {
        if (!imageRect) return;
        
        // Calculate delta from drag start
        const deltaX = mouseX - dragStartX;
        const deltaY = mouseY - dragStartY;
        
        const minSize = 30;
        const targetRatio = 3/4; // width:height
        
        if (isDragging) {
            // Move the crop box
            let newX = dragStartBox.x + deltaX;
            let newY = dragStartBox.y + deltaY;
            
            // Constrain to image bounds
            newX = Math.max(0, Math.min(imageRect.width - cropBox.w, newX));
            newY = Math.max(0, Math.min(imageRect.height - cropBox.h, newY));
            
            cropBox.x = newX;
            cropBox.y = newY;
            updateCropBoxDisplay();
            
        } else if (isResizing && resizeHandle) {
            let newX = dragStartBox.x;
            let newY = dragStartBox.y;
            let newW = dragStartBox.w;
            let newH = dragStartBox.h;
            
            switch(resizeHandle) {
                case 'nw':
                    newX = Math.max(0, Math.min(dragStartBox.x + dragStartBox.w - minSize, dragStartBox.x + deltaX));
                    newY = Math.max(0, Math.min(dragStartBox.y + dragStartBox.h - minSize, dragStartBox.y + deltaY));
                    newW = dragStartBox.w + (dragStartBox.x - newX);
                    newH = dragStartBox.h + (dragStartBox.y - newY);
                    // Maintain ratio based on which dimension is larger
                    if (newW / newH > targetRatio) {
                        newW = newH * targetRatio;
                        newX = dragStartBox.x + dragStartBox.w - newW;
                    } else {
                        newH = newW / targetRatio;
                        newY = dragStartBox.y + dragStartBox.h - newH;
                    }
                    break;
                case 'n':
                    newY = Math.max(0, Math.min(dragStartBox.y + dragStartBox.h - minSize, dragStartBox.y + deltaY));
                    newH = dragStartBox.h + (dragStartBox.y - newY);
                    newW = newH * targetRatio;
                    newX = dragStartBox.x + (dragStartBox.w - newW) / 2;
                    break;
                case 'ne':
                    newY = Math.max(0, Math.min(dragStartBox.y + dragStartBox.h - minSize, dragStartBox.y + deltaY));
                    newW = Math.min(imageRect.width - dragStartBox.x, Math.max(minSize, dragStartBox.w + deltaX));
                    newH = dragStartBox.h + (dragStartBox.y - newY);
                    if (newW / newH > targetRatio) {
                        newW = newH * targetRatio;
                    } else {
                        newH = newW / targetRatio;
                        newY = dragStartBox.y + dragStartBox.h - newH;
                    }
                    break;
                case 'e':
                    newW = Math.min(imageRect.width - dragStartBox.x, Math.max(minSize, dragStartBox.w + deltaX));
                    newH = newW / targetRatio;
                    newY = dragStartBox.y + (dragStartBox.h - newH) / 2;
                    break;
                case 'se':
                    newW = Math.min(imageRect.width - dragStartBox.x, Math.max(minSize, dragStartBox.w + deltaX));
                    newH = Math.min(imageRect.height - dragStartBox.y, Math.max(minSize, dragStartBox.h + deltaY));
                    if (newW / newH > targetRatio) {
                        newW = newH * targetRatio;
                    } else {
                        newH = newW / targetRatio;
                    }
                    break;
                case 's':
                    newH = Math.min(imageRect.height - dragStartBox.y, Math.max(minSize, dragStartBox.h + deltaY));
                    newW = newH * targetRatio;
                    newX = dragStartBox.x + (dragStartBox.w - newW) / 2;
                    break;
                case 'sw':
                    newX = Math.max(0, Math.min(dragStartBox.x + dragStartBox.w - minSize, dragStartBox.x + deltaX));
                    newH = Math.min(imageRect.height - dragStartBox.y, Math.max(minSize, dragStartBox.h + deltaY));
                    newW = dragStartBox.w + (dragStartBox.x - newX);
                    if (newW / newH > targetRatio) {
                        newW = newH * targetRatio;
                        newX = dragStartBox.x + dragStartBox.w - newW;
                    } else {
                        newH = newW / targetRatio;
                    }
                    break;
                case 'w':
                    newX = Math.max(0, Math.min(dragStartBox.x + dragStartBox.w - minSize, dragStartBox.x + deltaX));
                    newW = dragStartBox.w + (dragStartBox.x - newX);
                    newH = newW / targetRatio;
                    newY = dragStartBox.y + (dragStartBox.h - newH) / 2;
                    break;
            }
            
            // Constrain to image bounds
            newX = Math.max(0, Math.min(imageRect.width - newW, newX));
            newY = Math.max(0, Math.min(imageRect.height - newH, newY));
            
            cropBox.x = newX;
            cropBox.y = newY;
            cropBox.w = newW;
            cropBox.h = newH;
            updateCropBoxDisplay();
        }
    }

    function onGlobalMouseUp(e) {
        if (isDragging || isResizing) {
            isDragging = false;
            isResizing = false;
            resizeHandle = null;
            if (cropBoxEl) {
                cropBoxEl.style.cursor = 'move';
            }
            console.log('Interaction ended');
        }
    }

    function onGlobalTouchEnd(e) {
        if (isDragging || isResizing) {
            isDragging = false;
            isResizing = false;
            resizeHandle = null;
            console.log('Touch interaction ended');
        }
    }

    function performCrop() {
        if (!cropImage) return;
        
        // Get the image display dimensions
        const imgRect = cropImageEl.getBoundingClientRect();
        const scaleX = cropImage.width / imgRect.width;
        const scaleY = cropImage.height / imgRect.height;
        
        // Calculate crop coordinates in original image space
        const cropX = cropBox.x * scaleX;
        const cropY = cropBox.y * scaleY;
        const cropW = cropBox.w * scaleX;
        const cropH = cropBox.h * scaleY;
        
        // Create canvas for cropped image
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(cropW);
        canvas.height = Math.round(cropH);
        const ctx = canvas.getContext('2d');
        
        // Draw cropped area
        ctx.drawImage(cropImage, cropX, cropY, cropW, cropH, 0, 0, canvas.width, canvas.height);
        
        // Get cropped data URL
        const croppedDataUrl = canvas.toDataURL('image/jpeg', 0.95);
        cropImageData = croppedDataUrl;
        
        // Close modal
        hideCropModal();
        
        // Update preview
        photoPreview.src = croppedDataUrl;
        photoPreview.style.display = 'block';
        
        // Generate filename
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
        const filename = generatePhotoFilename(currentMemberName, currentMemberCode, timestamp);
        photoFileNameDisplay.textContent = filename;
        
        // Store for upload
        photoUrlInput.value = croppedDataUrl;
        
        uploadStatus.innerHTML = `<span style="color:#1f7b4d;">✅ फोटो 3:4 (पासपोर्ट) अनुपातमा क्रप गरियो: ${filename}</span>`;
    }

    // ------------------------------------------------------------
    // 7. Zoom and Rotate functions
    // ------------------------------------------------------------
    function rotateImage(degrees) {
        cropRotation = (cropRotation + degrees) % 360;
        applyTransform();
    }

    function zoomImage(delta) {

    if (!cropImageEl) return;

    // Change zoom level
    cropZoom = Math.max(
        0.3,
        Math.min(3, cropZoom + delta)
    );
    applyTransform(false);
}
function resetTransform() {
    cropZoom = 1;
    cropRotation = 0;
    applyTransform(false);
}
function applyTransform(recalculateCropBox = false) {
    if (!cropImageEl) return;

    cropImageEl.style.transform =
        `scale(${cropZoom}) rotate(${cropRotation}deg)`;
if (recalculateCropBox) {
        setTimeout(() => {
            initCropBox();
        }, 200);
    }
}

    function autoZoomToCropArea() {
        if (!cropImageEl || !cropBox) return;
        if (!cropImageEl.naturalWidth || !cropImageEl.naturalHeight) return;

        /*
        * The required photo ratio is 3:4.
        */
        const targetRatio = 3 / 4;

        /*
        * Current displayed image size.
        */
        const displayedWidth = cropImageEl.getBoundingClientRect().width;
        const displayedHeight = cropImageEl.getBoundingClientRect().height;

        if (!displayedWidth || !displayedHeight) return;

        /*
        * Calculate the largest 3:4 area that fits inside
        * the displayed image.
        */
        let targetCropWidth = displayedWidth;
        let targetCropHeight = targetCropWidth / targetRatio;

        if (targetCropHeight > displayedHeight) {
            targetCropHeight = displayedHeight;
            targetCropWidth = targetCropHeight * targetRatio;
        }

        /*
        * We don't want the crop area to become too large.
        * Keep it around 70% of the available image.
        */
        const maxCropWidth = displayedWidth * 0.70;
        const maxCropHeight = displayedHeight * 0.70;

        if (targetCropWidth > maxCropWidth) {
            targetCropWidth = maxCropWidth;
            targetCropHeight = targetCropWidth / targetRatio;
        }

        if (targetCropHeight > maxCropHeight) {
            targetCropHeight = maxCropHeight;
            targetCropWidth = targetCropHeight * targetRatio;
        }

        /*
        * Calculate the zoom required to make the image
        * completely cover the crop area.
        */
        const zoomX = targetCropWidth / displayedWidth;
        const zoomY = targetCropHeight / displayedHeight;

        const requiredZoom = Math.max(zoomX, zoomY);

        /*
        * Keep zoom within the application's limits.
        */
        cropZoom = Math.max(
            0.3,
            Math.min(3, requiredZoom)
        );

        applyTransform(false);
    }
    // ------------------------------------------------------------
    // 8. Upload to ImgBB
    // ------------------------------------------------------------
    async function uploadToImgBB(file, memberName, memberCode) {
        let processedFile = file;
        
        if (file.size > 1024 * 1024) {
            uploadStatus.innerHTML = '<span style="color:#b8864b;">⏳ फोटो कम्प्रेस गर्दै...</span>';
            processedFile = await compressImage(file, 1024 * 1024);
        }
        
        const formData = new FormData();
        formData.append('file', processedFile);
        
        if (memberName || memberCode) {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
            const filename = generatePhotoFilename(memberName || 'member', memberCode || 'unknown', timestamp);
            formData.append('filename', filename);
        }

        try {
            console.log('📤 Uploading to ImgBB via Edge Function...');            
            const response = await fetch(EDGE_FUNCTION_URL, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
                },
                body: formData
            });

            const result = await response.json();
            console.log('Edge Function response:', result);
            if (result.success && result.url) {
                return {
                    success: true,
                    url: result.url,
                    thumbnail: result.thumbnail || result.url,
                    filename: result.filename || file.name
                };
            } else {
                return {
                    success: false,
                    error: result.error || 'Upload failed'
                };
            }
        } catch (error) {
            console.error('Upload error:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    // ------------------------------------------------------------
    // 9. Compress Image
    // ------------------------------------------------------------
    function compressImage(file, maxSize) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = function(e) {
                const img = new Image();
                img.onload = function() {
                    let width = img.width;
                    let height = img.height;
                    const maxDimension = 1200;
                    if (width > maxDimension || height > maxDimension) {
                        const ratio = Math.min(maxDimension / width, maxDimension / height);
                        width = Math.floor(width * ratio);
                        height = Math.floor(height * ratio);
                    }
                    
                    const canvas = document.createElement('canvas');
                    canvas.width = width;
                    canvas.height = height;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, width, height);
                    
                    let quality = 0.92;
                    let dataUrl = canvas.toDataURL('image/jpeg', quality);
                    const compressedFile = dataURLtoFile(dataUrl, file.name);
                    
                    if (compressedFile.size > maxSize && quality > 0.3) {
                        let newQuality = 0.8;
                        while (newQuality > 0.3) {
                            dataUrl = canvas.toDataURL('image/jpeg', newQuality);
                            const testFile = dataURLtoFile(dataUrl, file.name);
                            if (testFile.size <= maxSize) {
                                resolve(testFile);
                                return;
                            }
                            newQuality -= 0.1;
                        }
                    }
                    resolve(compressedFile);
                };
                img.onerror = reject;
                img.src = e.target.result;
            };
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    }

    // ------------------------------------------------------------
    // 10. Load Members from Supabase
    // ------------------------------------------------------------
    async function loadMembers() {
        if (!supabase) {
            console.warn('Supabase not available');
            return;
        }
        
        try {
            console.log('📥 Loading ALL members from MemberDataTable...');
            const { data, error } = await supabase
                .from('MemberDataTable')
                .select('*');
            
            if (error) throw error;
            
            if (!data || data.length === 0) {
                allMembers = [];
                console.log('⚠️ No members found in MemberDataTable');
                return;
            }

            allMembers = data;
            console.log('✅ Loaded', allMembers.length, 'members from MemberDataTable');
            populateMemberCodeDropdown();
            
        } catch(e) {
            console.error('Could not load members:', e);
            allMembers = [];
        }
    }

    // ------------------------------------------------------------
    // 11. Load Suggestions from Supabase
    // ------------------------------------------------------------
    async function loadSuggestions() {
        if (!supabase) return;
        
        try {
            console.log('📥 Loading suggestions from MemberSuggestionTable...');
            const { data, error } = await supabase
                .from('MemberSuggestionTable')
                .select('*');
            
            if (error) throw error;
            
            allSuggestions = data || [];
            console.log('✅ Loaded', allSuggestions.length, 'suggestions from MemberSuggestionTable');
            
        } catch(e) {
            console.warn('Could not load suggestions:', e);
            allSuggestions = [];
        }
    }

    // ------------------------------------------------------------
    // 12. Populate Member Personal Code Dropdown
    // ------------------------------------------------------------
    function populateMemberCodeDropdown() {
        if (!memberPersonalCodeSelect) {
            console.error('❌ MemberPersonalCodeSelect not found!');
            return;
        }
        
        console.log('📋 Populating dropdown with', allMembers.length, 'members...');
        
        const currentValue = memberPersonalCodeSelect.value;
        memberPersonalCodeSelect.innerHTML = '<option selected disabled value="">छान्नुहोस्</option>';
        
        if (allMembers.length === 0) {
            memberPersonalCodeSelect.innerHTML = '<option selected disabled value="">कुनै सदस्यहरू छैनन्</option>';
            return;
        }
        
        const codes = allMembers
            .filter(m => m.PersonalCode && m.PersonalCode.trim() !== '')
            .map(m => m.PersonalCode);
        
        const uniqueCodes = [...new Set(codes)];
        
        uniqueCodes.sort((a, b) => {
            const genA = getGenerationFromCode(a);
            const genB = getGenerationFromCode(b);
            if (genA !== genB) return genA - genB;
            return a.localeCompare(b);
        });
        
        console.log('📋 Adding', uniqueCodes.length, 'codes to dropdown');
        
        uniqueCodes.forEach(code => {
            const opt = document.createElement('option');
            opt.value = code;
            const member = allMembers.find(m => m.PersonalCode === code);
            const name = member ? member.FullName || '' : '';
            let genderEmoji = '';
            if (code.startsWith('KM')) genderEmoji = '♂️ ';
            else if (code.startsWith('KF')) genderEmoji = '♀️ ';
            const hasSuggestion = allSuggestions.some(s => s.MemberCode === code);
            const badge = hasSuggestion ? ' 📝' : '';
            opt.textContent = `${genderEmoji}${code}${name ? ' - ' + name : ''}${badge}`;
            memberPersonalCodeSelect.appendChild(opt);
        });
        
        if (currentValue && memberPersonalCodeSelect.querySelector(`option[value="${currentValue}"]`)) {
            memberPersonalCodeSelect.value = currentValue;
        }        
        console.log('✅ Dropdown populated successfully');
    }

    // ------------------------------------------------------------
    // 13. Handle Member Code Selection
    // ------------------------------------------------------------
    function handleMemberCodeSelection(code) {
        if (!code) {
            resetEditMode();
            return;
        }
        
        console.log('🔍 Selected code:', code);
        selectedMemberCode = code;
        
        const existingSuggestion = allSuggestions.find(s => s.MemberCode === code);
        
        if (existingSuggestion) {
            console.log('✅ Found existing suggestion for code:', code);
            loadSuggestionData(existingSuggestion);
        } else {
            console.log('🆕 No existing suggestion found. Creating new suggestion for:', code);
            prepareNewSuggestion(code);
        }
    }

    // ------------------------------------------------------------
    // 14. Load Existing Suggestion Data into Form
    // ------------------------------------------------------------
    function loadSuggestionData(suggestion) {
        console.log('📝 Loading suggestion data for edit mode:', suggestion.id);
        
        isEditMode = true;
        editingSuggestionId = suggestion.id;
        
        document.getElementById('fullName').value = suggestion.MemberFullNameNepali || '';
        document.getElementById('fullNameEn').value = suggestion.MemberFullNameEnglish || '';
        document.getElementById('gender').value = suggestion.MemberGender || 'M';
        document.getElementById('address').value = suggestion.MemberAddress || '';
        document.getElementById('mobile').value = suggestion.MemberMobile || '';
        document.getElementById('email').value = suggestion.MemberEmail || '';
        document.getElementById('father').value = suggestion.MemberFather || '';
        document.getElementById('mother').value = suggestion.MemberMother || '';
        document.getElementById('spouse').value = suggestion.MemberSpouse || '';
        document.getElementById('dob').value = suggestion.MemberDOB || '';
        document.getElementById('sonsInput').value = suggestion.MemberSons || '';
        document.getElementById('daughtersInput').value = suggestion.MemberDaughters || '';
        document.getElementById('profession').value = suggestion.MemberProffession || '';
        document.getElementById('qualification').value = suggestion.MemberQualification || '';
        document.getElementById('position').value = suggestion.MemberPlace || '';
        document.getElementById('detailAddress').value = suggestion.MemberDetailAddress || '';
        document.getElementById('detailProfession').value = suggestion.MemberDetailProfession || '';
        document.getElementById('lifeStory').value = suggestion.MemberLifeStory || '';
        document.getElementById('dodAge').value = suggestion.MemberDOD || '';
        
        const photoUrl = suggestion.MemberPhotoUrl || suggestion.PhotoUrl || '';
        photoUrlInput.value = photoUrl;
        
        if (photoUrl) {
            photoPreview.src = photoUrl;
            photoPreview.style.display = 'block';
            photoFileNameDisplay.textContent = 'अवस्थित फोटो';
        } else {
            photoPreview.src = '';
            photoPreview.style.display = 'none';
            photoFileNameDisplay.textContent = 'कुनै फोटो छैन';
        }
        
        photoFileInput.value = '';
        uploadStatus.innerHTML = '';
        
        submitBtn.innerHTML = '<i class="fas fa-edit"></i> एडिट गर्नुहोस्';
        submitBtn.style.background = 'linear-gradient(180deg, #770, #990, #770)';
        
        feedback.innerHTML = '<span style="color:#0066cc;"><i class="fas fa-info-circle"></i> 📝 सुझाव लोड भयो। एडिट गरेर पेश गर्नुहोस्।</span>';
    }

    // ------------------------------------------------------------
    // 15. Prepare New Suggestion
    // ------------------------------------------------------------
    function prepareNewSuggestion(code) {
        console.log('🆕 Preparing new suggestion for code:', code);
        
        isEditMode = false;
        editingSuggestionId = null;
        
        const member = getMemberByCode(code, allMembers);
        
        if (member) {
            console.log('✅ Found member data for code:', code);
            
            document.getElementById('fullName').value = member.FullName || '';
            document.getElementById('fullNameEn').value = '';
            document.getElementById('gender').value = member.Gender || 'M';
            document.getElementById('address').value = member.Address || '';
            document.getElementById('mobile').value = member.Mobile || '';
            document.getElementById('email').value = member.Email || '';
            document.getElementById('father').value = member.Father || '';
            document.getElementById('mother').value = member.Mother || '';
            document.getElementById('spouse').value = member.Spouse || '';
            document.getElementById('dob').value = member.DOB || '';
            document.getElementById('sonsInput').value = member.Sons || '';
            document.getElementById('daughtersInput').value = member.Daughters || '';
            document.getElementById('profession').value = member.Profession || '';
            document.getElementById('qualification').value = member.Qualification || '';
            document.getElementById('position').value = member.Position || '';
            document.getElementById('detailAddress').value = member.DetailAddress || '';
            document.getElementById('detailProfession').value = member.DetailProfession || '';
            document.getElementById('lifeStory').value = member.LifeStory || '';
            document.getElementById('dodAge').value = member.DOD_Age || '';
            
            const photoUrl = member.PhotoUrl || '';
            photoUrlInput.value = photoUrl;
            
            if (photoUrl) {
                photoPreview.src = photoUrl;
                photoPreview.style.display = 'block';
                photoFileNameDisplay.textContent = 'सदस्यको फोटो';
            } else {
                photoPreview.src = '';
                photoPreview.style.display = 'none';
                photoFileNameDisplay.textContent = 'कुनै फोटो छैन';
            }
            
            photoFileInput.value = '';
            uploadStatus.innerHTML = '';
            
            feedback.innerHTML = `<span style="color:#0066cc;"><i class="fas fa-info-circle"></i> 🆕 "${member.FullName}" (${code}) को लागि नयाँ सुझाव फारम। कृपया विवरण भर्नुहोस्।</span>`;
        } else {
            console.warn('⚠️ Member not found for code:', code);
            document.getElementById('fullName').value = '';
            feedback.innerHTML = `<span style="color:#b02b2b;">❌ सदस्य फेला परेन: ${code}</span>`;
        }
        
        submitBtn.innerHTML = '<i class="fas fa-save"></i> सुझाव पठाउनुहोस्';
        submitBtn.style.background = 'linear-gradient(180deg, #070, #090, #070)';
        
        isEditMode = false;
        editingSuggestionId = null;
    }

    // ------------------------------------------------------------
    // 16. Check if code exists in selected generation
    // ------------------------------------------------------------
    function checkCodeExists() {
        const code = fillerCodeInput.value.trim().toUpperCase();
        const gen = parseInt(fillerGenerationSelect.value);
        
        if (!code || isNaN(gen) || gen < 1 || gen > 10) {
            fillerNameBox.style.display = 'none';
            btnConfirmFiller.style.display = 'none';
            isMemberRegisteredBox.style.display = 'none';
            fillerMemberData = null;
            return;
        }

        const member = getMemberByCode(code, allMembers);
        const memberGen = member ? getGenerationFromCode(member.PersonalCode) : null;
        
        if (member && memberGen === gen) {
            fillerNameBox.style.display = 'flex';
            fillerNameDisplay.textContent = member.FullName || 'नाम उपलब्ध छैन';
            fillerNameDisplay.style.color = '#006600';
            
            if (member.PhotoUrl) {
                fillerPhoto.src = member.PhotoUrl;
                fillerPhoto.style.display = 'block';
            } else {
                fillerPhoto.style.display = 'none';
            }
            
            fillerMemberData = member;
            btnConfirmFiller.style.display = 'block';
            btnConfirmFiller.disabled = false;
        } else {
            fillerNameBox.style.display = 'flex';
            fillerNameDisplay.textContent = '❌ यो कोड यस पुस्तामा मेल खाँदैन';
            fillerNameDisplay.style.color = '#cc0000';
            fillerPhoto.style.display = 'none';
            fillerMemberData = null;
            btnConfirmFiller.style.display = 'none';
            isMemberRegisteredBox.style.display = 'none';
        }
    }

    // ------------------------------------------------------------
    // 17. Toggle visibility based on registration status
    // ------------------------------------------------------------
    function toggleVisibility() {

        const value = isRegisteredSelect.value;

        if (value === 'yes') {

            // =====================================================
            // REGISTERED PERSON
            // =====================================================

            // Show only the identification section first.
            fillerIdentificationBox.style.display = 'flex';

            // IMPORTANT:
            // SuggestMemberContainer must remain HIDDEN at this stage.
            suggestMemberContainer.style.display = 'none';

            suggestMemberHeading.textContent = 'आफन्तको विवरण भर्नुहोस्';

            fillerNameBox.style.display = 'none';
            btnConfirmFiller.style.display = 'none';

            // User must first identify and confirm the person.
            isMemberRegisteredBox.style.display = 'none';

            fillerMemberData = null;
            fillerCodeInput.value = '';
            fillerGenerationSelect.selectedIndex = 0;

            resetEditMode();

        } else if (value === 'no') {

            // =====================================================
            // UNREGISTERED PERSON
            // =====================================================

            // No identification is required.
            fillerIdentificationBox.style.display = 'none';

            // IMPORTANT:
            // Show SuggestMemberContainer immediately.
            suggestMemberContainer.style.display = 'flex';

            suggestMemberHeading.textContent = 'आफ्नो विवरण भर्नुहोस्';

            fillerNameBox.style.display = 'none';
            btnConfirmFiller.style.display = 'none';

            // This selection is only needed when isRegisteredSelect
            // is YES, so keep it hidden.
            isMemberRegisteredBox.style.display = 'none';

            fillerMemberData = null;
            fillerCodeInput.value = '';
            fillerGenerationSelect.selectedIndex = 0;

            resetEditMode();

        } else {

            // =====================================================
            // NOTHING SELECTED
            // =====================================================

            fillerIdentificationBox.style.display = 'none';

            suggestMemberContainer.style.display = 'none';

            fillerNameBox.style.display = 'none';
            btnConfirmFiller.style.display = 'none';

            isMemberRegisteredBox.style.display = 'none';

            fillerMemberData = null;

            resetEditMode();
        }
    }

    // ------------------------------------------------------------
    // 18. Confirm Filler
    // ------------------------------------------------------------
    function confirmFiller() {

        if (fillerMemberData) {
            isMemberRegisteredBox.style.display = 'flex';
            suggestMemberContainer.style.display = 'none';
            suggestMemberHeading.textContent = 'आफन्तको विवरण भर्नुहोस्';
            btnConfirmFiller.style.display = 'none';
            resetEditMode();
        }
    }

    // ------------------------------------------------------------
    // 19. Reset Edit Mode
    // ------------------------------------------------------------
    function resetEditMode() {
        isEditMode = false;
        editingSuggestionId = null;
        selectedMemberCode = '';
        submitBtn.innerHTML = '<i class="fas fa-save"></i> सुझाव पठाउनुहोस्';
        submitBtn.style.background = 'linear-gradient(180deg, #070, #090, #070)';
        
        if (isMemberRegisteredSelect) {
            isMemberRegisteredSelect.selectedIndex = 0;
        }
        memberPersonalCodeBox.style.display = 'none';
        if (memberPersonalCodeSelect) {
            memberPersonalCodeSelect.selectedIndex = 0;
        }
    }

    // ------------------------------------------------------------
    // 20. Set Button Loading State
    // ------------------------------------------------------------
    function setButtonLoading(button, isLoading, loadingText) {
        if (isLoading) {
            button.disabled = true;
            button._originalText = button.innerHTML;
            button.innerHTML = `<i class="fas fa-spinner fa-spin"></i> ${loadingText || 'Processing...'}`;
            button.style.opacity = '0.7';
            button.style.cursor = 'wait';
        } else {
            button.disabled = false;
            button.innerHTML = button._originalText || button.innerHTML;
            button.style.opacity = '1';
            button.style.cursor = 'pointer';
        }
    }

    // ------------------------------------------------------------
    // 21. Reset Form
    // ------------------------------------------------------------
    function resetForm() {
        const textInputs = form.querySelectorAll('input:not([type="hidden"]), textarea');
        textInputs.forEach(input => {
            input.value = '';
        });
        
        const selects = form.querySelectorAll('select');
        selects.forEach(select => {
            if (select.id !== 'isRegisteredSelect' && select.id !== 'isMemberRegisteredSelect') {
                select.selectedIndex = 0;
            }
        });
        
        photoFileNameDisplay.textContent = 'कुनै फोटो छानिएको छैन';
        photoPreview.style.display = 'none';
        photoPreview.src = '';
        photoUrlInput.value = '';
        uploadStatus.innerHTML = '';
        photoFileInput.value = '';
        
        feedback.innerHTML = '';
        feedback.style.color = '';
        
        if (isMemberRegisteredSelect) {
            isMemberRegisteredSelect.selectedIndex = 0;
        }
        memberPersonalCodeBox.style.display = 'none';
        if (memberPersonalCodeSelect) {
            memberPersonalCodeSelect.selectedIndex = 0;
        }
        resetEditMode();
        
        suggestMemberContainer.style.display = 'flex';
    }

    // ------------------------------------------------------------
    // 22. Handle Photo Selection
    // ------------------------------------------------------------
    function handlePhotoSelection(file) {
        if (!file) return;
        
        if (file.size > 5 * 1024 * 1024) {
            uploadStatus.innerHTML = '<span style="color:#b02b2b;">❌ फोटो 5MB भन्दा ठुलो छ। कृपया सानो फोटो छान्नुहोस्।</span>';
            photoFileInput.value = '';
            return;
        }
        
        if (!file.type.startsWith('image/')) {
            uploadStatus.innerHTML = '<span style="color:#b02b2b;">❌ कृपया मान्य फोटो फाइल छान्नुहोस्।</span>';
            photoFileInput.value = '';
            return;
        }
        
        let memberName = document.getElementById('fullName').value.trim() || 'member';
        let memberCode = selectedMemberCode || 'unknown';
        
        if (isEditMode && editingSuggestionId) {
            const suggestion = allSuggestions.find(s => s.id === editingSuggestionId);
            if (suggestion) {
                memberName = suggestion.MemberFullNameNepali || memberName;
                memberCode = suggestion.MemberCode || memberCode;
            }
        }
        
        const reader = new FileReader();
        reader.onload = function(e) {
            showCropModal(e.target.result, memberName, memberCode);
            uploadStatus.innerHTML = '<span style="color:#b8864b;">📷 फोटो क्रप गर्नुहोस् (ह्यान्डलहरू तान्नुहोस्)...</span>';
        };
        reader.readAsDataURL(file);
    }

    // ------------------------------------------------------------
    // 23. Get Member Code
    // ------------------------------------------------------------
    function getMemberCode() {
        if (memberPersonalCodeBox.style.display === 'none') {
            return null;
        }
        
        const value = memberPersonalCodeSelect.value;
        if (!value || value === '' || value === 'छान्नुहोस्') {
            return null;
        }
        
        return value;
    }

    // ------------------------------------------------------------
    // 24. Submit Suggestion Form
    // ------------------------------------------------------------
    async function submitSuggestion(e) {
        e.preventDefault();

        if (isSubmitting) return;
        isSubmitting = true;

        const fullNameNepali = document.getElementById('fullName').value.trim();
        const memberCode = getMemberCode();
        
        if (!fullNameNepali) {
            feedback.innerHTML = '<span style="color:#b02b2b;"><i class="fas fa-exclamation-triangle"></i> कृपया पुरा नाम भर्नुहोस्।</span>';
            isSubmitting = false;
            return;
        }

        setButtonLoading(submitBtn, true, isEditMode ? 'एडिट गर्दै...' : 'पठाउँदै...');

        try {
            let photoUrl = photoUrlInput.value || '';
            
            if (photoUrl && photoUrl.startsWith('data:image')) {
                const memberName = fullNameNepali || 'member';
                const memberCodeForFile = memberCode || 'unknown';
                
                const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
                const filename = generatePhotoFilename(memberName, memberCodeForFile, timestamp);
                const file = dataURLtoFile(photoUrl, filename);
                
                uploadStatus.innerHTML = '<span style="color:#b8864b;">⏳ फोटो अपलोड गर्दै...</span>';
                const uploadResult = await uploadToImgBB(file, memberName, memberCodeForFile);
                if (uploadResult.success) {
                    photoUrl = uploadResult.url;
                    const displayName = uploadResult.filename || filename;
                    uploadStatus.innerHTML = `<span style="color:#1f7b4d;">✅ फोटो अपलोड भयो: ${displayName}</span>`;
                } else {
                    uploadStatus.innerHTML = `<span style="color:#b02b2b;">❌ फोटो अपलोड असफल: ${uploadResult.error}</span>`;
                }
            } else if (photoUrl && photoUrl.startsWith('http')) {
                uploadStatus.innerHTML = '<span style="color:#1f7b4d;">✅ फोटो अपलोड भएको छ</span>';
            }

            const fillerName = isRegisteredSelect.value === 'yes' && fillerMemberData 
                ? fillerMemberData.FullName 
                : '';
            const fillerCode = isRegisteredSelect.value === 'yes' && fillerMemberData 
                ? fillerMemberData.PersonalCode 
                : '';

            const payload = {
                FillerName: fillerName,
                FillerCode: fillerCode,
                MemberCode: memberCode,
                MemberFullNameNepali: fullNameNepali,
                MemberFullNameEnglish: document.getElementById('fullNameEn').value.trim(),
                MemberGender: document.getElementById('gender').value,
                MemberAddress: document.getElementById('address').value.trim(),
                MemberMobile: document.getElementById('mobile').value.trim(),
                MemberEmail: document.getElementById('email').value.trim(),
                MemberFather: document.getElementById('father').value.trim(),
                MemberMother: document.getElementById('mother').value.trim(),
                MemberSpouse: document.getElementById('spouse').value.trim(),
                MemberDOB: document.getElementById('dob').value.trim(),
                MemberSons: document.getElementById('sonsInput').value.trim(),
                MemberDaughters: document.getElementById('daughtersInput').value.trim(),
                MemberProffession: document.getElementById('profession').value.trim(),
                MemberQualification: document.getElementById('qualification').value.trim(),
                MemberPlace: document.getElementById('position').value.trim(),
                MemberDetailAddress: document.getElementById('detailAddress').value.trim(),
                MemberDetailProfession: document.getElementById('detailProfession').value.trim(),
                MemberLifeStory: document.getElementById('lifeStory').value.trim(),
                MemberDOD: document.getElementById('dodAge').value.trim(),
                MemberPhotoUrl: photoUrl,
                Status: 'pending'
            };

            if (isEditMode && editingSuggestionId) {
                const { data, error } = await supabase
                    .from('MemberSuggestionTable')
                    .update(payload)
                    .eq('id', editingSuggestionId);

                if (error) throw error;
                feedback.innerHTML = `<span style="color:#1f7b4d;"><i class="fas fa-check-circle"></i> ✅ सुझाव सफलतापूर्वक एडिट गरियो! धन्यवाद।</span>`;
            } else {
                const { data, error } = await supabase
                    .from('MemberSuggestionTable')
                    .insert([payload]);

                if (error) throw error;
                feedback.innerHTML = `<span style="color:#1f7b4d;"><i class="fas fa-check-circle"></i> ✅ सुझाव सफलतापूर्वक पठाइयो! धन्यवाद।</span>`;
            }
            
            await loadSuggestions();
            populateMemberCodeDropdown();
            resetForm();

        } catch (error) {
            console.error('Submit error:', error);
            feedback.innerHTML = `<span style="color:#b02b2b;"><i class="fas fa-exclamation-circle"></i> ❌ त्रुटि: ${error.message}</span>`;
        } finally {
            setButtonLoading(submitBtn, false);
            isSubmitting = false;
        }
    }

    // ------------------------------------------------------------
    // 25. Event Listeners
    // ------------------------------------------------------------
    isRegisteredSelect.addEventListener('change', toggleVisibility);
    fillerGenerationSelect.addEventListener('change', checkCodeExists);
    fillerCodeInput.addEventListener('input', checkCodeExists);
    btnConfirmFiller.addEventListener('click', confirmFiller);

    isMemberRegisteredSelect.addEventListener('change', function() {
        const value = this.value;

        console.log(
            'isMemberRegisteredSelect changed to:',
            value
        );

        if (value === 'yes') {

            // =====================================================
            // MEMBER IS ALREADY REGISTERED
            // =====================================================

            memberPersonalCodeBox.style.display = 'flex';

            // Now that the user has selected YES,
            // show SuggestMemberContainer.
            suggestMemberContainer.style.display = 'flex';

            if (allMembers.length > 0) {
                populateMemberCodeDropdown();
            } else {
                loadMembers();
            }

        } else if (value === 'no') {

            // =====================================================
            // MEMBER IS NOT REGISTERED
            // =====================================================

            memberPersonalCodeBox.style.display = 'none';

            if (memberPersonalCodeSelect) {
                memberPersonalCodeSelect.selectedIndex = 0;
            }

            // Now that the user has selected NO,
            // show SuggestMemberContainer.
            suggestMemberContainer.style.display = 'flex';

            resetEditMode();

        } else {

            // =====================================================
            // NO SELECTION
            // =====================================================

            memberPersonalCodeBox.style.display = 'none';

            if (memberPersonalCodeSelect) {
                memberPersonalCodeSelect.selectedIndex = 0;
            }

            // IMPORTANT:
            // If isRegisteredSelect is YES and the user has not
            // selected YES/NO here yet, keep the container hidden.
            suggestMemberContainer.style.display = 'none';

            resetEditMode();
        }
    });

    memberPersonalCodeSelect.addEventListener('change', function() {
        const code = this.value;
        console.log('MemberPersonalCodeSelect changed to:', code);
        if (code) {
            handleMemberCodeSelection(code);
        } else {
            resetEditMode();
        }
    });

    resetBtn.addEventListener('click', function(e) {
        e.preventDefault();
        resetForm();
    });

    form.addEventListener('submit', submitSuggestion);

    // Photo upload
    document.getElementById('uploadToCloudinaryBtn').addEventListener('click', function() {
        photoFileInput.click();
    });

    photoFileInput.addEventListener('change', function() {
        if (this.files && this.files[0]) {
            handlePhotoSelection(this.files[0]);
        }
    });

    // Crop modal events
    cropModalClose.addEventListener('click', hideCropModal);
    cropCancelBtn.addEventListener('click', hideCropModal);
    cropConfirmBtn.addEventListener('click', performCrop);

    cropZoomIn.addEventListener('click', function() { zoomImage(0.1); });
    cropZoomOut.addEventListener('click', function() { zoomImage(-0.1); });
    cropRotateLeft.addEventListener('click', function() { rotateImage(-90); });
    cropRotateRight.addEventListener('click', function() { rotateImage(90); });
    cropReset.addEventListener('click', resetTransform);

    // Close crop modal on Escape
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape' && cropModal.style.display === 'flex') {
            hideCropModal();
        }
    });

    // Click outside to close
    cropModal.addEventListener('click', function(e) {
        if (e.target === cropModal) {
            hideCropModal();
        }
    });

    // ------------------------------------------------------------
    // 26. Initialize
    // ------------------------------------------------------------
    async function init() {
        console.log('🚀 Initializing RequestPage...');
        
        await loadMembers();
        await loadSuggestions();
        
        fillerIdentificationBox.style.display = 'none';
        suggestMemberContainer.style.display = 'none';
        fillerNameBox.style.display = 'none';
        btnConfirmFiller.style.display = 'none';
        isMemberRegisteredBox.style.display = 'none';
        memberPersonalCodeBox.style.display = 'none';
        resetEditMode();
        
        console.log('✅ RequestPage ready');
        console.log('📋 Total members:', allMembers.length);
        console.log('📋 Total suggestions:', allSuggestions.length);
    }

    init();
})();