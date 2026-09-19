// PhotoCropper.js - Reusable 3:4 Image Cropper using Canvas
// Usage: PhotoCropper.open(file, { aspect: 3/4 }, (croppedBlob) => { ... });

(function() {
    'use strict';

    // Default aspect ratio: width/height = 3/4 (portrait 3:4)
    const DEFAULT_ASPECT = 3 / 4;

    let cropperState = null;

    function open(file, options, onCrop) {
        if (!file) return;

        const aspect = (options && options.aspect) || DEFAULT_ASPECT;
        const title = (options && options.title) || 'फोटो क्रप गर्नुहोस् (3:4)';

        // Remove any previous modal
        const old = document.getElementById('photoCropperModal');
        if (old) old.remove();

        const reader = new FileReader();
        reader.onload = function(e) {
            buildModal(e.target.result, aspect, title, onCrop);
        };
        reader.readAsDataURL(file);
    }

    function buildModal(imgSrc, aspect, title, onCrop) {
        // ---------- Build DOM ----------
        const modal = document.createElement('div');
        modal.id = 'photoCropperModal';
        modal.className = 'cropper-modal';

        modal.innerHTML = `
            <div class="cropper-dialog">
                <div class="cropper-header">
                    <h2><i class="fas fa-crop-alt"></i> ${title}</h2>
                    <span class="cropper-close" id="cropperCloseBtn">&times;</span>
                </div>

                <div class="cropper-hint">
                    <i class="fas fa-info-circle"></i>
                    Drag to move · Scroll or pinch to zoom · Drag corners to resize
                </div>

                <div class="cropper-stage" id="cropperStage">
                    <div class="cropper-image-wrap" id="cropperImageWrap">
                        <img id="cropperImage" src="${imgSrc}" draggable="false" alt="crop">
                    </div>
                    <div class="cropper-box" id="cropperBox">
                        <div class="crop-handle crop-nw" data-dir="nw"></div>
                        <div class="crop-handle crop-ne" data-dir="ne"></div>
                        <div class="crop-handle crop-sw" data-dir="sw"></div>
                        <div class="crop-handle crop-se" data-dir="se"></div>
                        <div class="crop-grid"></div>
                    </div>
                </div>

                <div class="cropper-controls">
                    <button type="button" class="cropper-btn cropper-btn-secondary" id="cropperResetBtn">
                        <i class="fas fa-undo-alt"></i> Reset
                    </button>
                    <button type="button" class="cropper-btn cropper-btn-primary" id="cropperCropBtn">
                        <i class="fas fa-check"></i> Crop & Upload
                    </button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // ---------- Refs ----------
        const stage = modal.querySelector('#cropperStage');
        const imageWrap = modal.querySelector('#cropperImageWrap');
        const img = modal.querySelector('#cropperImage');
        const box = modal.querySelector('#cropperBox');

        // ---------- State ----------
        const state = {
            img,
            stage,
            imageWrap,
            box,
            aspect,                    // width/height
            scale: 1,                  // image zoom
            offsetX: 0,                // image pan (px, relative to stage center)
            offsetY: 0,
            boxX: 0,                   // crop box position (px, relative to stage)
            boxY: 0,
            boxW: 0,
            boxH: 0,
            stageW: 0,
            stageH: 0,
            imgNaturalW: 0,
            imgNaturalH: 0,
            dragging: false,
            dragStartX: 0,
            dragStartY: 0,
            dragBoxStartX: 0,
            dragBoxStartY: 0,
            resizing: null,            // direction or null
            resizeStart: null,
            onCrop
        };

        cropperState = state;

        // ---------- Wait for image to load to know dimensions ----------
        const onReady = () => {
            state.imgNaturalW = img.naturalWidth;
            state.imgNaturalH = img.naturalHeight;

            // Ensure stage has a size first
            requestAnimationFrame(() => {
                resizeStage();
                fitImageToStage();
                initBox();
                render();
            });
        };

        if (img.complete && img.naturalWidth) {
            onReady();
        } else {
            img.addEventListener('load', onReady);
        }

        // ---------- Stage sizing ----------
        function resizeStage() {
            const rect = stage.getBoundingClientRect();
            state.stageW = rect.width;
            state.stageH = rect.height;
        }

        // ---------- Fit image inside stage (initial scale) ----------
        function fitImageToStage() {
            const pad = 40;
            const availW = state.stageW - pad * 2;
            const availH = state.stageH - pad * 2;

            // Image will be rendered at natural size * scale
            const fitScale = Math.min(
                availW / state.imgNaturalW,
                availH / state.imgNaturalH
            );

            // Base display size at scale=1 is the fitted size
            state.baseW = state.imgNaturalW * fitScale;
            state.baseH = state.imgNaturalH * fitScale;

            state.scale = 1;
            state.offsetX = 0;
            state.offsetY = 0;

            img.style.width = state.baseW + 'px';
            img.style.height = state.baseH + 'px';
        }

        // ---------- Initialize crop box ----------
        function initBox() {
            // Start with 70% of the smaller dimension of the stage, keep aspect
            const targetCoverage = 0.7;
            let boxH = state.stageH * targetCoverage;
            let boxW = boxH * state.aspect;

            if (boxW > state.stageW * targetCoverage) {
                boxW = state.stageW * targetCoverage;
                boxH = boxW / state.aspect;
            }

            state.boxW = boxW;
            state.boxH = boxH;
            state.boxX = (state.stageW - boxW) / 2;
            state.boxY = (state.stageH - boxH) / 2;

            clampBox();
        }

        // ---------- Clamp crop box within stage ----------
        function clampBox() {
            state.boxX = Math.max(0, Math.min(state.boxX, state.stageW - state.boxW));
            state.boxY = Math.max(0, Math.min(state.boxY, state.stageH - state.boxH));
        }

        // ---------- Render ----------
        function render() {
            // image position: centered + offset
            const imgW = state.baseW * state.scale;
            const imgH = state.baseH * state.scale;

            const imgLeft = (state.stageW - imgW) / 2 + state.offsetX;
            const imgTop = (state.stageH - imgH) / 2 + state.offsetY;

            img.style.width = imgW + 'px';
            img.style.height = imgH + 'px';
            img.style.left = imgLeft + 'px';
            img.style.top = imgTop + 'px';

            // crop box
            box.style.left = state.boxX + 'px';
            box.style.top = state.boxY + 'px';
            box.style.width = state.boxW + 'px';
            box.style.height = state.boxH + 'px';
        }

        // ---------- Image drag (pan) ----------
        stage.addEventListener('mousedown', (e) => {
            if (e.target.closest('.cropper-box')) return; // dragging box, not image
            state.dragging = true;
            state.dragStartX = e.clientX;
            state.dragStartY = e.clientY;
            state.dragBoxStartX = state.boxX; // unused here but harmless
            state.dragBoxStartY = state.boxY;
            state.dragImgStartX = state.offsetX;
            state.dragImgStartY = state.offsetY;
            stage.classList.add('dragging');
        });

        // ---------- Crop box drag ----------
        box.addEventListener('mousedown', (e) => {
            if (e.target.classList.contains('crop-handle')) return; // resizing
            e.stopPropagation();
            state.dragging = true;
            state.dragStartX = e.clientX;
            state.dragStartY = e.clientY;
            state.dragBoxStartX = state.boxX;
            state.dragBoxStartY = state.boxY;
            box.classList.add('dragging');
        });

        // ---------- Handles resize ----------
        box.querySelectorAll('.crop-handle').forEach(handle => {
            handle.addEventListener('mousedown', (e) => {
                e.stopPropagation();
                state.resizing = handle.dataset.dir;
                state.dragStartX = e.clientX;
                state.dragStartY = e.clientY;
                state.resizeStart = {
                    boxX: state.boxX,
                    boxY: state.boxY,
                    boxW: state.boxW,
                    boxH: state.boxH
                };
            });
        });

        // ---------- Global mouse move / up ----------
        const onMouseMove = (e) => {
            if (state.resizing) {
                handleResize(e);
                return;
            }
            if (!state.dragging) return;

            const dx = e.clientX - state.dragStartX;
            const dy = e.clientY - state.dragStartY;

            if (box.classList.contains('dragging')) {
                // move crop box
                state.boxX = state.dragBoxStartX + dx;
                state.boxY = state.dragBoxStartY + dy;
                clampBox();
            } else {
                // pan image
                state.offsetX = state.dragImgStartX + dx;
                state.offsetY = state.dragImgStartY + dy;
            }
            render();
        };

        const onMouseUp = () => {
            state.dragging = false;
            state.resizing = null;
            state.resizeStart = null;
            stage.classList.remove('dragging');
            box.classList.remove('dragging');
        };

        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);

        // ---------- Resize handler ----------
        function handleResize(e) {
            const dx = e.clientX - state.dragStartX;
            const dy = e.clientY - state.dragStartY;
            const start = state.resizeStart;
            const dir = state.resizing;

            let newX = start.boxX;
            let newY = start.boxY;
            let newW = start.boxW;
            let newH = start.boxH;

            const MIN = 60;
            const aspect = state.aspect;

            if (dir === 'se') {
                newW = Math.max(MIN, start.boxW + dx);
                newH = newW / aspect;
                // clamp to stage
                if (newX + newW > state.stageW) {
                    newW = state.stageW - newX;
                    newH = newW / aspect;
                }
                if (newY + newH > state.stageH) {
                    newH = state.stageH - newY;
                    newW = newH * aspect;
                }
            } else if (dir === 'sw') {
                const maxW = start.boxX + start.boxW;
                newW = Math.max(MIN, start.boxW - dx);
                newH = newW / aspect;
                newX = maxW - newW;
                if (newX < 0) {
                    newX = 0;
                    newW = maxW;
                    newH = newW / aspect;
                }
                if (newY + newH > state.stageH) {
                    newH = state.stageH - newY;
                    newW = newH * aspect;
                    newX = maxW - newW;
                }
            } else if (dir === 'ne') {
                const maxH = start.boxY + start.boxH;
                newH = Math.max(MIN, start.boxH - dy);
                newW = newH * aspect;
                newY = maxH - newH;
                if (newY < 0) {
                    newY = 0;
                    newH = maxH;
                    newW = newH * aspect;
                }
                if (newX + newW > state.stageW) {
                    newW = state.stageW - newX;
                    newH = newW / aspect;
                    newY = maxH - newH;
                }
            } else if (dir === 'nw') {
                const maxW = start.boxX + start.boxW;
                const maxH = start.boxY + start.boxH;
                newW = Math.max(MIN, start.boxW - dx);
                newH = newW / aspect;
                newX = maxW - newW;
                newY = maxH - newH;
                if (newX < 0) {
                    newX = 0;
                    newW = maxW;
                    newH = newW / aspect;
                    newY = maxH - newH;
                }
                if (newY < 0) {
                    newY = 0;
                    newH = maxH;
                    newW = newH * aspect;
                    newX = maxW - newW;
                }
            }

            state.boxX = newX;
            state.boxY = newY;
            state.boxW = newW;
            state.boxH = newH;
            render();
        }

        // ---------- Wheel zoom ----------
        stage.addEventListener('wheel', (e) => {
            e.preventDefault();
            const delta = e.deltaY < 0 ? 0.08 : -0.08;
            const newScale = Math.max(0.5, Math.min(5, state.scale + delta));
            state.scale = newScale;
            render();
        }, { passive: false });

        // ---------- Reset ----------
        modal.querySelector('#cropperResetBtn').addEventListener('click', () => {
            fitImageToStage();
            initBox();
            render();
        });

        // ---------- Close ----------
        const close = () => {
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
            document.removeEventListener('keydown', onKey);
            modal.remove();
            cropperState = null;
        };

        modal.querySelector('#cropperCloseBtn').addEventListener('click', close);
        modal.addEventListener('click', (e) => {
            if (e.target === modal) close();
        });

        const onKey = (e) => {
            if (e.key === 'Escape') close();
        };
        document.addEventListener('keydown', onKey);

        // ---------- Crop & Upload ----------
        modal.querySelector('#cropperCropBtn').addEventListener('click', async () => {
            const btn = modal.querySelector('#cropperCropBtn');
            const originalHTML = btn.innerHTML;

            try {
                const blob = doCrop(state);
                if (!blob || typeof onCrop !== 'function') {
                    close();
                    return;
                }

                // Show loading state while callback (upload) runs
                btn.disabled = true;
                btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Uploading...';

                // Run the callback — it may return a Promise
                const result = onCrop(blob);

                // If the callback returns a Promise, wait for it
                if (result && typeof result.then === 'function') {
                    await result;
                }

                // Close only after successful completion
                close();
            } catch (err) {
                console.error('Crop & Upload error:', err);
                alert('अपलोड गर्न सकिएन: ' + (err.message || err));
                btn.disabled = false;
                btn.innerHTML = originalHTML;
            }
        });

    }

    // ------------------------------------------------------------
    // Perform the actual crop onto a canvas, output Blob (JPEG)
    // ------------------------------------------------------------
    function doCrop(state) {
        const {
            img, boxX, boxY, boxW, boxH,
            baseW, baseH, scale, offsetX, offsetY,
            stageW, stageH, imgNaturalW, imgNaturalH
        } = state;

        // Displayed image size and position on the stage
        const dispW = baseW * scale;
        const dispH = baseH * scale;
        const dispX = (stageW - dispW) / 2 + offsetX;
        const dispY = (stageH - dispH) / 2 + offsetY;

        // Crop box position in display coords → map to image coords
        const cropLeft = (boxX - dispX) / dispW;   // 0..1
        const cropTop = (boxY - dispY) / dispH;
        const cropRight = (boxX + boxW - dispX) / dispW;
        const cropBottom = (boxY + boxH - dispY) / dispH;

        // Clamp to 0..1
        const cl = Math.max(0, Math.min(1, cropLeft));
        const ct = Math.max(0, Math.min(1, cropTop));
        const cr = Math.max(0, Math.min(1, cropRight));
        const cb = Math.max(0, Math.min(1, cropBottom));

        const srcX = cl * imgNaturalW;
        const srcY = ct * imgNaturalH;
        const srcW = (cr - cl) * imgNaturalW;
        const srcH = (cb - ct) * imgNaturalH;

        if (srcW <= 0 || srcH <= 0) {
            throw new Error('Invalid crop area');
        }

        // Output size: keep 3:4 ratio, fixed height for quality
        const OUT_H = 800;
        const OUT_W = Math.round(OUT_H * state.aspect); // 600 for 3:4

        const canvas = document.createElement('canvas');
        canvas.width = OUT_W;
        canvas.height = OUT_H;
        const ctx = canvas.getContext('2d');

        // White background (in case source has alpha)
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, OUT_W, OUT_H);

        ctx.drawImage(
            img,
            srcX, srcY, srcW, srcH,
            0, 0, OUT_W, OUT_H
        );

        // Convert to blob synchronously via toDataURL then atob? No — use toBlob async.
        // We'll return a Promise-like by using a synchronous fallback dataURL.
        // Simpler: use toDataURL and convert to Blob ourselves.
        const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
        return dataURLtoBlob(dataUrl);
    }

    function dataURLtoBlob(dataUrl) {
        const parts = dataUrl.split(',');
        const mime = parts[0].match(/:(.*?);/)[1];
        const bstr = atob(parts[1]);
        let n = bstr.length;
        const u8arr = new Uint8Array(n);
        while (n--) {
            u8arr[n] = bstr.charCodeAt(n);
        }
        return new Blob([u8arr], { type: mime });
    }

    // ------------------------------------------------------------
    // Public API
    // ------------------------------------------------------------
    window.PhotoCropper = {
        open,
        DEFAULT_ASPECT
    };

})();