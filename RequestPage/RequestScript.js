// RequestScript.js - Public suggestion form
// Single searchable combobox for personal code / name in both stages.

(function() {
    'use strict';

    // ------------------------------------------------------------
    // 1. Supabase from Config
    // ------------------------------------------------------------
    if (!window.SupabaseConfig || !window.SupabaseConfig.supabase) {
        console.error('❌ SupabaseConfig.js not loaded properly!');
        alert('Configuration error: SupabaseConfig.js is missing.');
        return;
    }
    const supabase = window.SupabaseConfig.supabase;
    const SUPABASE_ANON_KEY = window.SupabaseConfig.SUPABASE_ANON_KEY;
    const EDGE_FUNCTION_URL =
        'https://icchczijubhzxkjpebps.supabase.co/functions/v1/upload-to-imgbb';

    // ------------------------------------------------------------
    // 2. State
    // ------------------------------------------------------------
    let allMembers = [];
    let allSuggestions = [];
    let fillerMemberData = null;
    let isSubmitting = false;
    let isEditMode = false;
    let editingSuggestionId = null;
    let selectedMemberCode = '';

    // Stage 1 combobox state
    let fillerHighlightedIndex = -1;
    let fillerCurrentResults = [];

    // Stage 3 combobox state
    let memberHighlightedIndex = -1;
    let memberCurrentResults = [];

    // Crop state
    let cropImageData = null;
    let cropImage = null;
    let currentMemberName = '';
    let currentMemberCode = '';
    let cropZoom = 1;
    let cropRotation = 0;
    let cropBox = { x: 0, y: 0, w: 0, h: 0 };
    let isDragging = false;
    let isResizing = false;
    let resizeHandle = null;
    let dragStartX = 0;
    let dragStartY = 0;
    let dragStartBox = null;
    let imageRect = null;

    // Draft autosave
    const DRAFT_KEY = 'ojha_suggestion_draft_v3';
    let draftSaveTimer = null;

    // ------------------------------------------------------------
    // 3. DOM Refs
    // ------------------------------------------------------------
    const $ = (id) => document.getElementById(id);

    const isRegisteredSelect       = $('isRegisteredSelect');
    const fillerIdentificationBox  = $('FillerIdentificationBox');
    const suggestMemberContainer   = $('SuggestMemberContainer');
    const suggestHeadingText       = $('SuggestHeadingText');
    const fillerGenerationSelect   = $('fillerGenerationSelect');
    const fillerCodeInput          = $('fillerCode');
    const fillerCodeResults        = $('fillerCodeResults');
    const fillerCombobox           = $('fillerCombobox');
    const fillerNameBox            = $('FillerNameBox');
    const fillerNameDisplay        = $('FillerName');
    const fillerPhoto              = $('FillerPhoto');
    const btnConfirmFiller         = $('btnConfirmFiller');
    const isMemberRegisteredBox    = $('IsMemberRegisteredBox');
    const isMemberRegisteredSelect = $('isMemberRegisteredSelect');
    const memberPersonalCodeBox    = $('MemberPersonalCodeBox');
    const memberCodeSearch         = $('MemberCodeSearch');
    const memberCodeResults        = $('memberCodeResults');
    const memberCombobox           = $('memberCombobox');

    const form               = $('addMemberForm');
    const submitBtn          = $('btnAddSuggestion');
    const resetBtn           = $('btnReset');
    const feedback           = $('formFeedback');
    const successPanel       = $('SuccessPanel');
    const submitAnotherBtn   = $('btnSubmitAnother');
    const consentCheck       = $('consentCheck');

    const photoFileInput     = $('photoFile');
    const photoPreview       = $('photoPreview');
    const photoUrlInput      = $('photoUrl');
    const photoFileNameDisp  = $('photoFileNameDisplay');
    const uploadStatus       = $('uploadStatus');

    const progressSteps = document.querySelectorAll('.progress-step');

    // Crop modal
    const cropModal       = $('cropModal');
    const cropModalClose  = $('cropModalClose');
    const cropImageEl     = $('cropImage');
    const cropBoxEl       = $('cropBox');
    const cropConfirmBtn  = $('cropConfirm');
    const cropCancelBtn   = $('cropCancel');
    const cropChooseAnother = $('cropChooseAnother');
    const cropZoomIn      = $('cropZoomIn');
    const cropZoomOut     = $('cropZoomOut');
    const cropRotateLeft  = $('cropRotateLeft');
    const cropRotateRight = $('cropRotateRight');
    const cropReset       = $('cropReset');

    // ------------------------------------------------------------
    // 4. Helpers
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
    function escapeHtml(str) {
        if (str === null || str === undefined) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }
    function generatePhotoFilename(memberName, memberCode, timestamp) {
        let cleanName = memberName || 'member';
        cleanName = cleanName.replace(/[^a-zA-Z0-9\u0900-\u097F\s]/g, '');
        cleanName = cleanName.replace(/\s+/g, '_').substring(0, 50);
        let cleanCode = (memberCode || 'unknown').replace(/[^a-zA-Z0-9.]/g, '');
        const ts = timestamp || new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
        return `Ojha_${cleanName}_${cleanCode}_${ts}.jpg`;
    }
    function dataURLtoFile(dataUrl, filename) {
        const arr = dataUrl.split(',');
        const mime = arr[0].match(/:(.*?);/)[1];
        const bstr = atob(arr[1]);
        let n = bstr.length;
        const u8arr = new Uint8Array(n);
        while (n--) u8arr[n] = bstr.charCodeAt(n);
        return new File([u8arr], filename, { type: mime });
    }
    function showFeedback(message, kind) {
        feedback.className = 'is-visible ' + (kind ? 'is-' + kind : 'is-info');
        feedback.innerHTML = message;
    }
    function clearFeedback() {
        feedback.className = '';
        feedback.innerHTML = '';
    }
    function setFieldError(fieldId, message) {
        const field = $(fieldId);
        const errEl = $('err-' + fieldId);
        if (field) {
            const group = field.closest('.form-group');
            if (group) group.classList.add('has-error');
        }
        if (errEl) errEl.textContent = message || '';
    }
    function clearFieldError(fieldId) {
        const field = $(fieldId);
        const errEl = $('err-' + fieldId);
        if (field) {
            const group = field.closest('.form-group');
            if (group) group.classList.remove('has-error');
        }
        if (errEl) errEl.textContent = '';
    }
    function setProgressStep(step) {
        progressSteps.forEach(el => {
            const s = parseInt(el.dataset.step);
            el.classList.remove('is-active', 'is-done');
            if (s < step) el.classList.add('is-done');
            if (s === step) el.classList.add('is-active');
        });
    }
    function updateSubmitButtonVisibility() {
        if (!submitBtn || !consentCheck) return;
        submitBtn.style.display = consentCheck.checked ? '' : 'none';
    }

    // ------------------------------------------------------------
    // 5. Reusable combobox engine
    // ------------------------------------------------------------
    /**
     * Build the HTML for one combobox result row.
     */
    function buildResultRowHtml(member, hasSuggestion) {
        let emoji = '';
        if (member.PersonalCode && member.PersonalCode.startsWith('KM')) emoji = '♂️';
        else if (member.PersonalCode && member.PersonalCode.startsWith('KF')) emoji = '♀️';
        const badge = hasSuggestion
            ? '<span class="ci-badge">सुझाव छ</span>'
            : '';
        return `
            <span class="ci-emoji">${emoji}</span>
            <span class="ci-code">${escapeHtml(member.PersonalCode || '-')}</span>
            <span class="ci-name">${escapeHtml(member.FullName || '')}</span>
            ${badge}
        `;
    }

    /**
     * Filter members by query. Match against code or name.
     */
    function filterMembers(query, filterFn) {
        const q = (query || '').trim().toLowerCase();
        let list = allMembers.filter(m => m.PersonalCode && m.PersonalCode.trim() !== '');
        if (typeof filterFn === 'function') list = list.filter(filterFn);
        if (q) {
            list = list.filter(m => {
                const code = (m.PersonalCode || '').toLowerCase();
                const name = (m.FullName || '').toLowerCase();
                return code.includes(q) || name.includes(q);
            });
        }
        return list.sort((a, b) => a.PersonalCode.localeCompare(b.PersonalCode));
    }

    /**
     * Generic combobox renderer.
     */
    function renderComboboxResults(opts) {
        const {
            input, resultsEl, query, results, highlightedIndex,
            onPick, onClose
        } = opts;

        if (!query || query.trim() === '') {
            // Show empty input → show nothing
            resultsEl.hidden = true;
            resultsEl.innerHTML = '';
            return;
        }

        if (results.length === 0) {
            resultsEl.hidden = false;
            resultsEl.innerHTML = `<div class="combobox-empty">कुनै मिल्दो व्यक्ति भेटिएन</div>`;
            return;
        }

        resultsEl.hidden = false;
        resultsEl.innerHTML = results.slice(0, 40).map((m, i) => {
            const hasSuggestion = allSuggestions.some(s => s.MemberCode === m.PersonalCode);
            const cls = 'combobox-item' + (i === highlightedIndex ? ' is-highlighted' : '');
            return `<div class="${cls}" data-index="${i}" role="option">${buildResultRowHtml(m, hasSuggestion)}</div>`;
        }).join('');

        // Wire click
        resultsEl.querySelectorAll('.combobox-item').forEach(el => {
            el.addEventListener('mousedown', (e) => {
                e.preventDefault();
                const idx = parseInt(el.dataset.index);
                const m = results[idx];
                if (m) onPick(m);
            });
        });

        // Ensure highlighted row is scrolled into view
        if (highlightedIndex >= 0) {
            const el = resultsEl.querySelector('.combobox-item.is-highlighted');
            if (el) {
                const rTop = el.offsetTop;
                const rBot = rTop + el.offsetHeight;
                if (rTop < resultsEl.scrollTop) resultsEl.scrollTop = rTop;
                else if (rBot > resultsEl.scrollTop + resultsEl.clientHeight)
                    resultsEl.scrollTop = rBot - resultsEl.clientHeight;
            }
        }
    }

    function closeCombobox(resultsEl) {
        resultsEl.hidden = true;
    }

    // ------------------------------------------------------------
    // 6. Stage 1 — Filler identification combobox
    // ------------------------------------------------------------
    function fillerFilterFn(member) {
        const gen = parseInt(fillerGenerationSelect.value);
        if (!gen || gen < 1 || gen > 10) return true;
        return getGenerationFromCode(member.PersonalCode) === gen;
    }

    function refreshFillerResults() {
        const q = fillerCodeInput.value || '';
        fillerCurrentResults = filterMembers(q, fillerFilterFn).slice(0, 40);
        fillerHighlightedIndex = -1;
        renderComboboxResults({
            input: fillerCodeInput,
            resultsEl: fillerCodeResults,
            query: q,
            results: fillerCurrentResults,
            highlightedIndex: fillerHighlightedIndex,
            onPick: (m) => pickFiller(m),
            onClose: () => closeCombobox(fillerCodeResults)
        });
    }

    function pickFiller(member) {
        // Fill the input with ONLY the code
        fillerCodeInput.value = member.PersonalCode || '';
        closeCombobox(fillerCodeResults);
        fillerHighlightedIndex = -1;

        // Show the member name box
        fillerMemberData = member;
        fillerNameBox.style.display = 'flex';
        fillerNameDisplay.textContent = member.FullName || 'नाम उपलब्ध छैन';
        fillerNameDisplay.style.color = '#0a6b3e';
        if (member.PhotoUrl) {
            fillerPhoto.src = member.PhotoUrl;
            fillerPhoto.style.display = 'block';
        } else {
            fillerPhoto.style.display = 'none';
        }
        btnConfirmFiller.style.display = 'inline-flex';
        btnConfirmFiller.disabled = false;
        isMemberRegisteredBox.style.display = 'none';

        // Blur the input so the results don't reopen on focus
        fillerCodeInput.blur();
    }

    function clearFillerSelection() {
        fillerMemberData = null;
        fillerNameBox.style.display = 'none';
        btnConfirmFiller.style.display = 'none';
        isMemberRegisteredBox.style.display = 'none';
    }

    // Stage 1 events
    if (fillerCodeInput) {
        fillerCodeInput.addEventListener('focus', () => {
            // Only open the list if the user has already typed something
            if (fillerCodeInput.value.trim() !== '') refreshFillerResults();
        });
        fillerCodeInput.addEventListener('input', () => {
            clearFillerSelection();
            refreshFillerResults();
        });
        fillerCodeInput.addEventListener('keydown', (e) => {
            if (fillerCodeResults.hidden) return;
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                fillerHighlightedIndex = Math.min(
                    fillerCurrentResults.length - 1,
                    fillerHighlightedIndex + 1
                );
                refreshFillerResults();
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                fillerHighlightedIndex = Math.max(0, fillerHighlightedIndex - 1);
                refreshFillerResults();
            } else if (e.key === 'Enter') {
                if (fillerHighlightedIndex >= 0 && fillerCurrentResults[fillerHighlightedIndex]) {
                    e.preventDefault();
                    pickFiller(fillerCurrentResults[fillerHighlightedIndex]);
                }
            } else if (e.key === 'Escape') {
                closeCombobox(fillerCodeResults);
            }
        });
        fillerCodeInput.addEventListener('blur', () => {
            // Small delay to allow click
            setTimeout(() => closeCombobox(fillerCodeResults), 150);
        });
    }

    // Click outside closes
    document.addEventListener('click', (e) => {
        if (fillerCombobox && !fillerCombobox.contains(e.target)) {
            closeCombobox(fillerCodeResults);
        }
        if (memberCombobox && !memberCombobox.contains(e.target)) {
            closeCombobox(memberCodeResults);
        }
    });

    // Generation change clears previous selection
    fillerGenerationSelect.addEventListener('change', () => {
        fillerCodeInput.value = '';
        clearFillerSelection();
        closeCombobox(fillerCodeResults);
    });

    // ------------------------------------------------------------
    // 7. Stage 3 — Member code / name combobox
    // ------------------------------------------------------------
    function refreshMemberResults() {
        const q = memberCodeSearch.value || '';
        memberCurrentResults = filterMembers(q, null).slice(0, 40);
        memberHighlightedIndex = -1;
        renderComboboxResults({
            input: memberCodeSearch,
            resultsEl: memberCodeResults,
            query: q,
            results: memberCurrentResults,
            highlightedIndex: memberHighlightedIndex,
            onPick: (m) => pickMember(m),
            onClose: () => closeCombobox(memberCodeResults)
        });
    }

    function pickMember(member) {
        // Fill the input with ONLY the code
        memberCodeSearch.value = member.PersonalCode || '';
        closeCombobox(memberCodeResults);
        memberHighlightedIndex = -1;

        // Trigger the existing selection handler
        handleMemberCodeSelection(member.PersonalCode);
        memberCodeSearch.blur();
    }

    if (memberCodeSearch) {
        memberCodeSearch.addEventListener('focus', () => {
            if (memberCodeSearch.value.trim() !== '') refreshMemberResults();
        });
        memberCodeSearch.addEventListener('input', () => {
            // If the user changes the code, reset any previous selection
            if (selectedMemberCode && memberCodeSearch.value.trim() !== selectedMemberCode) {
                selectedMemberCode = '';
            }
            refreshMemberResults();
        });
        memberCodeSearch.addEventListener('keydown', (e) => {
            if (memberCodeResults.hidden) return;
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                memberHighlightedIndex = Math.min(
                    memberCurrentResults.length - 1,
                    memberHighlightedIndex + 1
                );
                refreshMemberResults();
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                memberHighlightedIndex = Math.max(0, memberHighlightedIndex - 1);
                refreshMemberResults();
            } else if (e.key === 'Enter') {
                if (memberHighlightedIndex >= 0 && memberCurrentResults[memberHighlightedIndex]) {
                    e.preventDefault();
                    pickMember(memberCurrentResults[memberHighlightedIndex]);
                }
            } else if (e.key === 'Escape') {
                closeCombobox(memberCodeResults);
            }
        });
        memberCodeSearch.addEventListener('blur', () => {
            setTimeout(() => closeCombobox(memberCodeResults), 150);
        });
    }

    // ------------------------------------------------------------
    // 8. Crop modal — core flow
    // ------------------------------------------------------------
    function showCropModal(imageData, memberName, memberCode) {
        cropImageData = imageData;
        currentMemberName = memberName || 'member';
        currentMemberCode = memberCode || 'unknown';
        cropModal.style.display = 'flex';
        document.body.style.overflow = 'hidden';
        cropZoom = 1;
        cropRotation = 0;
        cropImageEl.style.transform = 'none';
        const img = new Image();
        img.onload = function() {
            cropImage = img;
            cropImageEl.src = imageData;
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
        document.removeEventListener('mousemove', onGlobalMouseMove);
        document.removeEventListener('mouseup', onGlobalMouseUp);
        document.removeEventListener('touchmove', onGlobalTouchMove);
        document.removeEventListener('touchend', onGlobalTouchEnd);
    }
    function initCropBox() {
        if (!cropImageEl.complete || !cropImageEl.naturalWidth) {
            setTimeout(initCropBox, 100); return;
        }
        const wrapper = cropImageEl.parentElement;
        const wrapperRect = wrapper.getBoundingClientRect();
        const imgRect = cropImageEl.getBoundingClientRect();
        imageRect = {
            left: imgRect.left - wrapperRect.left,
            top: imgRect.top - wrapperRect.top,
            width: imgRect.width, height: imgRect.height
        };
        let boxW = imgRect.width * 0.85;
        let boxH = boxW / (3 / 4);
        if (boxH > imgRect.height * 0.85) {
            boxH = imgRect.height * 0.85;
            boxW = boxH * (3 / 4);
        }
        const boxX = (imgRect.width - boxW) / 2;
        const boxY = (imgRect.height - boxH) / 2;
        cropBox = { x: boxX, y: boxY, w: boxW, h: boxH };
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
        cropBoxEl.removeEventListener('mousedown', onCropMouseDown);
        cropBoxEl.removeEventListener('touchstart', onCropTouchStart);
        cropBoxEl.addEventListener('mousedown', onCropMouseDown);
        cropBoxEl.addEventListener('touchstart', onCropTouchStart, { passive: false });
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
        e.preventDefault(); e.stopPropagation();
        const wrapper = cropImageEl.parentElement;
        const wrapperRect = wrapper.getBoundingClientRect();
        const imgRect = cropImageEl.getBoundingClientRect();
        imageRect = {
            left: imgRect.left - wrapperRect.left,
            top: imgRect.top - wrapperRect.top,
            width: imgRect.width, height: imgRect.height
        };
        const mouseX = e.clientX - wrapperRect.left;
        const mouseY = e.clientY - wrapperRect.top;
        const target = e.target;
        if (target.classList.contains('crop-handle')) {
            isResizing = true; isDragging = false;
            resizeHandle = target.dataset.handle;
            dragStartX = mouseX; dragStartY = mouseY;
            dragStartBox = { ...cropBox };
        } else {
            isDragging = true; isResizing = false;
            dragStartX = mouseX; dragStartY = mouseY;
            dragStartBox = { ...cropBox };
            cropBoxEl.style.cursor = 'grabbing';
        }
    }
    function onCropTouchStart(e) {
        e.preventDefault(); e.stopPropagation();
        const touch = e.touches[0];
        const wrapper = cropImageEl.parentElement;
        const wrapperRect = wrapper.getBoundingClientRect();
        const imgRect = cropImageEl.getBoundingClientRect();
        imageRect = {
            left: imgRect.left - wrapperRect.left,
            top: imgRect.top - wrapperRect.top,
            width: imgRect.width, height: imgRect.height
        };
        const touchX = touch.clientX - wrapperRect.left;
        const touchY = touch.clientY - wrapperRect.top;
        const target = e.target;
        if (target.classList.contains('crop-handle')) {
            isResizing = true; isDragging = false;
            resizeHandle = target.dataset.handle;
            dragStartX = touchX; dragStartY = touchY;
            dragStartBox = { ...cropBox };
        } else {
            isDragging = true; isResizing = false;
            dragStartX = touchX; dragStartY = touchY;
            dragStartBox = { ...cropBox };
        }
    }
    function onGlobalMouseMove(e) {
        if (!isDragging && !isResizing) return;
        const wrapper = cropImageEl.parentElement;
        const wrapperRect = wrapper.getBoundingClientRect();
        handleCropMove(e.clientX - wrapperRect.left, e.clientY - wrapperRect.top);
    }
    function onGlobalTouchMove(e) {
        if (!isDragging && !isResizing) return;
        e.preventDefault();
        const touch = e.touches[0];
        const wrapper = cropImageEl.parentElement;
        const wrapperRect = wrapper.getBoundingClientRect();
        handleCropMove(touch.clientX - wrapperRect.left, touch.clientY - wrapperRect.top);
    }
    function onGlobalMouseUp() {
        if (isDragging || isResizing) {
            isDragging = false; isResizing = false; resizeHandle = null;
            if (cropBoxEl) cropBoxEl.style.cursor = 'move';
        }
    }
    function onGlobalTouchEnd() {
        if (isDragging || isResizing) {
            isDragging = false; isResizing = false; resizeHandle = null;
        }
    }
    function handleCropMove(mouseX, mouseY) {
        if (!imageRect) return;
        const deltaX = mouseX - dragStartX;
        const deltaY = mouseY - dragStartY;
        const minSize = 40;
        const targetRatio = 3 / 4;
        if (isDragging) {
            let newX = dragStartBox.x + deltaX;
            let newY = dragStartBox.y + deltaY;
            newX = Math.max(0, Math.min(imageRect.width - cropBox.w, newX));
            newY = Math.max(0, Math.min(imageRect.height - cropBox.h, newY));
            cropBox.x = newX; cropBox.y = newY;
            updateCropBoxDisplay();
            return;
        }
        if (!isResizing || !resizeHandle) return;
        let newX = dragStartBox.x, newY = dragStartBox.y;
        let newW = dragStartBox.w, newH = dragStartBox.h;
        switch (resizeHandle) {
            case 'nw':
                newX = Math.max(0, Math.min(dragStartBox.x + dragStartBox.w - minSize, dragStartBox.x + deltaX));
                newY = Math.max(0, Math.min(dragStartBox.y + dragStartBox.h - minSize, dragStartBox.y + deltaY));
                newW = dragStartBox.w + (dragStartBox.x - newX);
                newH = dragStartBox.h + (dragStartBox.y - newY);
                if (newW / newH > targetRatio) { newW = newH * targetRatio; newX = dragStartBox.x + dragStartBox.w - newW; }
                else { newH = newW / targetRatio; newY = dragStartBox.y + dragStartBox.h - newH; }
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
                if (newW / newH > targetRatio) newW = newH * targetRatio;
                else { newH = newW / targetRatio; newY = dragStartBox.y + dragStartBox.h - newH; }
                break;
            case 'e':
                newW = Math.min(imageRect.width - dragStartBox.x, Math.max(minSize, dragStartBox.w + deltaX));
                newH = newW / targetRatio;
                newY = dragStartBox.y + (dragStartBox.h - newH) / 2;
                break;
            case 'se':
                newW = Math.min(imageRect.width - dragStartBox.x, Math.max(minSize, dragStartBox.w + deltaX));
                newH = Math.min(imageRect.height - dragStartBox.y, Math.max(minSize, dragStartBox.h + deltaY));
                if (newW / newH > targetRatio) newW = newH * targetRatio;
                else newH = newW / targetRatio;
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
                if (newW / newH > targetRatio) { newW = newH * targetRatio; newX = dragStartBox.x + dragStartBox.w - newW; }
                else { newH = newW / targetRatio; }
                break;
            case 'w':
                newX = Math.max(0, Math.min(dragStartBox.x + dragStartBox.w - minSize, dragStartBox.x + deltaX));
                newW = dragStartBox.w + (dragStartBox.x - newX);
                newH = newW / targetRatio;
                newY = dragStartBox.y + (dragStartBox.h - newH) / 2;
                break;
        }
        newX = Math.max(0, Math.min(imageRect.width - newW, newX));
        newY = Math.max(0, Math.min(imageRect.height - newH, newY));
        cropBox.x = newX; cropBox.y = newY; cropBox.w = newW; cropBox.h = newH;
        updateCropBoxDisplay();
    }
    function performCrop() {
        if (!cropImage) return;
        const imgRect = cropImageEl.getBoundingClientRect();
        const scaleX = cropImage.width / imgRect.width;
        const scaleY = cropImage.height / imgRect.height;
        const cropX = cropBox.x * scaleX;
        const cropY = cropBox.y * scaleY;
        const cropW = cropBox.w * scaleX;
        const cropH = cropBox.h * scaleY;
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(cropW);
        canvas.height = Math.round(cropH);
        const ctx = canvas.getContext('2d');
        ctx.drawImage(cropImage, cropX, cropY, cropW, cropH, 0, 0, canvas.width, canvas.height);
        const croppedDataUrl = canvas.toDataURL('image/jpeg', 0.95);
        cropImageData = croppedDataUrl;
        hideCropModal();
        photoPreview.src = croppedDataUrl;
        photoPreview.style.display = 'block';
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
        const filename = generatePhotoFilename(currentMemberName, currentMemberCode, timestamp);
        photoFileNameDisp.textContent = filename;
        photoUrlInput.value = croppedDataUrl;
        uploadStatus.innerHTML = `<span style="color:#0a6b3e;">✅ फोटो काटिएको छ (${filename})</span>`;
        scheduleDraftSave();
    }
    function rotateImage(degrees) {
        cropRotation = (cropRotation + degrees) % 360;
        applyTransform(false);
    }
    function zoomImage(delta) {
        cropZoom = Math.max(0.3, Math.min(3, cropZoom + delta));
        applyTransform(false);
    }
    function resetTransform() {
        cropZoom = 1; cropRotation = 0; applyTransform(false);
    }
    function applyTransform(recalculate) {
        if (!cropImageEl) return;
        cropImageEl.style.transform = `scale(${cropZoom}) rotate(${cropRotation}deg)`;
        if (recalculate) setTimeout(initCropBox, 200);
    }

    // ------------------------------------------------------------
    // 9. Upload
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
            const response = await fetch(EDGE_FUNCTION_URL, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` },
                body: formData
            });
            const result = await response.json();
            if (result.success && result.url) {
                return { success: true, url: result.url, thumbnail: result.thumbnail || result.url, filename: result.filename || file.name };
            }
            return { success: false, error: result.error || 'Upload failed' };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }
    function compressImage(file, maxSize) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = function(e) {
                const img = new Image();
                img.onload = function() {
                    let { width, height } = img;
                    const maxDimension = 1200;
                    if (width > maxDimension || height > maxDimension) {
                        const ratio = Math.min(maxDimension / width, maxDimension / height);
                        width = Math.floor(width * ratio);
                        height = Math.floor(height * ratio);
                    }
                    const canvas = document.createElement('canvas');
                    canvas.width = width; canvas.height = height;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, width, height);
                    let quality = 0.92;
                    let dataUrl = canvas.toDataURL('image/jpeg', quality);
                    let compressedFile = dataURLtoFile(dataUrl, file.name);
                    if (compressedFile.size > maxSize && quality > 0.3) {
                        let newQuality = 0.8;
                        while (newQuality > 0.3) {
                            dataUrl = canvas.toDataURL('image/jpeg', newQuality);
                            const testFile = dataURLtoFile(dataUrl, file.name);
                            if (testFile.size <= maxSize) { resolve(testFile); return; }
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
    // 10. Load Members & Suggestions
    // ------------------------------------------------------------
    async function loadMembers() {
        if (!supabase) return;
        try {
            const { data, error } = await supabase.from('MemberDataTable').select('*');
            if (error) throw error;
            allMembers = data || [];
        } catch (e) {
            console.warn('Could not load members:', e);
            allMembers = [];
        }
    }
    async function loadSuggestions() {
        if (!supabase) return;
        try {
            const { data, error } = await supabase.from('MemberSuggestionTable').select('*');
            if (error) throw error;
            allSuggestions = data || [];
        } catch (e) {
            allSuggestions = [];
        }
    }

    // ------------------------------------------------------------
    // 11. Handle member code selection / edit mode
    // ------------------------------------------------------------
    function handleMemberCodeSelection(code) {
        if (!code) { resetEditMode(); return; }
        selectedMemberCode = code;
        const existing = allSuggestions.find(s => s.MemberCode === code);
        if (existing) loadSuggestionData(existing);
        else prepareNewSuggestion(code);
    }
    function loadSuggestionData(suggestion) {
        isEditMode = true;
        editingSuggestionId = suggestion.id;
        $('fullName').value          = suggestion.MemberFullNameNepali || '';
        $('fullNameEn').value        = suggestion.MemberFullNameEnglish || '';
        $('gender').value            = suggestion.MemberGender || 'M';
        $('address').value           = suggestion.MemberAddress || '';
        $('mobile').value            = suggestion.MemberMobile || '';
        $('email').value             = suggestion.MemberEmail || '';
        $('father').value            = suggestion.MemberFather || '';
        $('mother').value            = suggestion.MemberMother || '';
        $('spouse').value            = suggestion.MemberSpouse || '';
        $('dob').value               = suggestion.MemberDOB || '';
        $('sonsInput').value         = suggestion.MemberSons || '';
        $('daughtersInput').value    = suggestion.MemberDaughters || '';
        $('profession').value        = suggestion.MemberProffession || '';
        $('qualification').value     = suggestion.MemberQualification || '';
        $('position').value          = suggestion.MemberPlace || '';
        $('detailAddress').value     = suggestion.MemberDetailAddress || '';
        $('detailProfession').value  = suggestion.MemberDetailProfession || '';
        $('lifeStory').value         = suggestion.MemberLifeStory || '';
        $('dodAge').value            = suggestion.MemberDOD || '';
        const photoUrl = suggestion.MemberPhotoUrl || suggestion.PhotoUrl || '';
        photoUrlInput.value = photoUrl;
        if (photoUrl) {
            photoPreview.src = photoUrl;
            photoPreview.style.display = 'block';
            photoFileNameDisp.textContent = 'अवस्थित फोटो';
        } else {
            photoPreview.src = '';
            photoPreview.style.display = 'none';
            photoFileNameDisp.textContent = 'कुनै फोटो छैन';
        }
        photoFileInput.value = '';
        uploadStatus.innerHTML = '';
        submitBtn.innerHTML = '<i class="fas fa-edit"></i> परिवर्तन सुरक्षित गर्नुहोस्';
        showFeedback('<i class="fas fa-info-circle"></i> यो सदस्यको लागि तपाईंको अघिल्लो सुझाव भेटियो। सम्पादन गरेर पुनः पेश गर्नुहोस्।', 'info');
        setProgressStep(3);
    }
    function prepareNewSuggestion(code) {
        isEditMode = false;
        editingSuggestionId = null;
        const member = getMemberByCode(code, allMembers);
        if (member) {
            $('fullName').value         = member.FullName || '';
            $('fullNameEn').value       = '';
            $('gender').value           = member.Gender || 'M';
            $('address').value          = member.Address || '';
            $('mobile').value           = member.Mobile || '';
            $('email').value            = member.Email || '';
            $('father').value           = member.Father || '';
            $('mother').value           = member.Mother || '';
            $('spouse').value           = member.Spouse || '';
            $('dob').value              = member.DOB || '';
            $('sonsInput').value        = member.Sons || '';
            $('daughtersInput').value   = member.Daughters || '';
            $('profession').value       = member.Profession || '';
            $('qualification').value    = member.Qualification || '';
            $('position').value         = member.Position || '';
            $('detailAddress').value    = member.DetailAddress || '';
            $('detailProfession').value = member.DetailProfession || '';
            $('lifeStory').value        = member.LifeStory || '';
            $('dodAge').value           = member.DOD_Age || '';
            const photoUrl = member.PhotoUrl || '';
            photoUrlInput.value = photoUrl;
            if (photoUrl) {
                photoPreview.src = photoUrl;
                photoPreview.style.display = 'block';
                photoFileNameDisp.textContent = 'सदस्यको फोटो';
            } else {
                photoPreview.src = '';
                photoPreview.style.display = 'none';
                photoFileNameDisp.textContent = 'कुनै फोटो छैन';
            }
            photoFileInput.value = '';
            uploadStatus.innerHTML = '';
            showFeedback(`<i class="fas fa-info-circle"></i> "${escapeHtml(member.FullName)}" (${code}) को लागि नयाँ सुझाव। कृपया विवरण पूरा गर्नुहोस्।`, 'info');
        } else {
            $('fullName').value = '';
            showFeedback(`<i class="fas fa-exclamation-circle"></i> सदस्य फेला परेन: ${escapeHtml(code)}`, 'error');
        }
        submitBtn.innerHTML = '<i class="fas fa-paper-plane"></i> सुझाव पठाउनुहोस्';
        setProgressStep(3);
    }
    function resetEditMode() {
        isEditMode = false;
        editingSuggestionId = null;
        selectedMemberCode = '';
        submitBtn.innerHTML = '<i class="fas fa-paper-plane"></i> सुझाव पठाउनुहोस्';
        if (isMemberRegisteredSelect) isMemberRegisteredSelect.selectedIndex = 0;
        memberPersonalCodeBox.style.display = 'none';
        if (memberCodeSearch) memberCodeSearch.value = '';
        closeCombobox(memberCodeResults);
    }

    // ------------------------------------------------------------
    // 12. Visibility toggling
    // ------------------------------------------------------------
    function toggleVisibility() {
        const value = isRegisteredSelect.value;
        if (value === 'yes') {
            fillerIdentificationBox.style.display = 'flex';
            suggestMemberContainer.style.display = 'none';
            suggestHeadingText.textContent = 'आफन्तको विवरण भर्नुहोस्';
            fillerNameBox.style.display = 'none';
            btnConfirmFiller.style.display = 'none';
            isMemberRegisteredBox.style.display = 'none';
            fillerMemberData = null;
            fillerCodeInput.value = '';
            fillerGenerationSelect.selectedIndex = 0;
            closeCombobox(fillerCodeResults);
            resetEditMode();
            setProgressStep(1);
        } else if (value === 'no') {
            fillerIdentificationBox.style.display = 'none';
            suggestMemberContainer.style.display = 'flex';
            suggestHeadingText.textContent = 'आफ्नो विवरण भर्नुहोस्';
            fillerNameBox.style.display = 'none';
            btnConfirmFiller.style.display = 'none';
            isMemberRegisteredBox.style.display = 'none';
            fillerMemberData = null;
            fillerCodeInput.value = '';
            fillerGenerationSelect.selectedIndex = 0;
            closeCombobox(fillerCodeResults);
            resetEditMode();
            setProgressStep(3);
        } else {
            fillerIdentificationBox.style.display = 'none';
            suggestMemberContainer.style.display = 'none';
            fillerNameBox.style.display = 'none';
            btnConfirmFiller.style.display = 'none';
            isMemberRegisteredBox.style.display = 'none';
            fillerMemberData = null;
            resetEditMode();
            setProgressStep(1);
        }
        clearFeedback();
    }
    function confirmFiller() {
        if (!fillerMemberData) return;
        isMemberRegisteredBox.style.display = 'flex';
        suggestMemberContainer.style.display = 'none';
        suggestHeadingText.textContent = 'आफन्तको विवरण भर्नुहोस्';
        btnConfirmFiller.style.display = 'none';
        resetEditMode();
        setProgressStep(2);
    }

    // ------------------------------------------------------------
    // 13. Validation
    // ------------------------------------------------------------
    function validateForm() {
        let ok = true;
        clearFeedback();
        const fullName = $('fullName').value.trim();
        if (!fullName) {
            setFieldError('fullName', 'कृपया पूरा नाम भर्नुहोस्।');
            ok = false;
        } else clearFieldError('fullName');
        const mobile = $('mobile').value.trim();
        if (mobile && !/^9[678]\d{8}$/.test(mobile)) {
            setFieldError('mobile', 'कृपया 10 अंकको मान्य मोबाइल नम्बर लेख्नुहोस् (98 वा 97 बाट सुरु)।');
            ok = false;
        } else clearFieldError('mobile');
        const email = $('email').value.trim();
        if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            setFieldError('email', 'कृपया मान्य इमेल ठेगाना लेख्नुहोस्।');
            ok = false;
        } else clearFieldError('email');
        if (consentCheck && !consentCheck.checked) {
            showFeedback('<i class="fas fa-exclamation-circle"></i> कृपया "मैले दिएको विवरण सही छ" भन्ने बाकसमा चिन्ह लगाउनुहोस्।', 'error');
            ok = false;
        }
        if (!ok) {
            const firstError = document.querySelector('.has-error');
            if (firstError) firstError.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
        return ok;
    }

    // ------------------------------------------------------------
    // 14. Draft autosave
    // ------------------------------------------------------------
    function collectDraft() {
        return {
            savedAt: Date.now(),
            fields: {
                fullName: $('fullName').value,
                fullNameEn: $('fullNameEn').value,
                gender: $('gender').value,
                address: $('address').value,
                mobile: $('mobile').value,
                email: $('email').value,
                father: $('father').value,
                mother: $('mother').value,
                spouse: $('spouse').value,
                dob: $('dob').value,
                sonsInput: $('sonsInput').value,
                daughtersInput: $('daughtersInput').value,
                profession: $('profession').value,
                qualification: $('qualification').value,
                position: $('position').value,
                detailAddress: $('detailAddress').value,
                detailProfession: $('detailProfession').value,
                lifeStory: $('lifeStory').value,
                dodAge: $('dodAge').value,
                memberCode: memberCodeSearch ? memberCodeSearch.value : ''
            }
        };
    }
    function scheduleDraftSave() {
        clearTimeout(draftSaveTimer);
        draftSaveTimer = setTimeout(saveDraft, 800);
    }
    function saveDraft() {
        try {
            const draft = collectDraft();
            const anyContent = Object.values(draft.fields).some(v => v && v.trim && v.trim() !== '');
            if (!anyContent) { localStorage.removeItem(DRAFT_KEY); return; }
            localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
        } catch (e) {}
    }
    function restoreDraft() {
        try {
            const raw = localStorage.getItem(DRAFT_KEY);
            if (!raw) return false;
            const draft = JSON.parse(raw);
            if (!draft || !draft.fields) return false;
            const f = draft.fields;
            Object.keys(f).forEach(k => {
                const el = $(k);
                if (el) el.value = f[k] || '';
            });
            return true;
        } catch (e) { return false; }
    }
    function clearDraft() {
        try { localStorage.removeItem(DRAFT_KEY); } catch (e) {}
    }

    // ------------------------------------------------------------
    // 15. Submit
    // ------------------------------------------------------------
    async function submitSuggestion(e) {
        e.preventDefault();
        if (isSubmitting) return;
        clearFeedback();
        if (!validateForm()) return;
        isSubmitting = true;
        setButtonLoading(submitBtn, true, isEditMode ? 'सुरक्षित गर्दै...' : 'पठाउँदै...');
        try {
            let photoUrl = photoUrlInput.value || '';
            if (photoUrl && photoUrl.startsWith('data:image')) {
                const memberName = $('fullName').value.trim() || 'member';
                const memberCodeForFile = selectedMemberCode || 'unknown';
                const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
                const filename = generatePhotoFilename(memberName, memberCodeForFile, timestamp);
                const file = dataURLtoFile(photoUrl, filename);
                uploadStatus.innerHTML = '<span style="color:#b8864b;">⏳ फोटो अपलोड गर्दै...</span>';
                const uploadResult = await uploadToImgBB(file, memberName, memberCodeForFile);
                if (uploadResult.success) {
                    photoUrl = uploadResult.url;
                    uploadStatus.innerHTML = `<span style="color:#0a6b3e;">✅ फोटो अपलोड भयो</span>`;
                } else {
                    uploadStatus.innerHTML = `<span style="color:#b02b2b;">❌ फोटो अपलोड असफल: ${escapeHtml(uploadResult.error)}</span>`;
                    photoUrl = '';
                }
            }
            const fillerName = isRegisteredSelect.value === 'yes' && fillerMemberData ? fillerMemberData.FullName : '';
            const fillerCode = isRegisteredSelect.value === 'yes' && fillerMemberData ? fillerMemberData.PersonalCode : '';
            const memberCode = (memberPersonalCodeBox.style.display !== 'none') ? (selectedMemberCode || '') : '';
            const payload = {
                FillerName: fillerName,
                FillerCode: fillerCode,
                MemberCode: memberCode,
                MemberFullNameNepali: $('fullName').value.trim(),
                MemberFullNameEnglish: $('fullNameEn').value.trim(),
                MemberGender: $('gender').value,
                MemberAddress: $('address').value.trim(),
                MemberMobile: $('mobile').value.trim(),
                MemberEmail: $('email').value.trim(),
                MemberFather: $('father').value.trim(),
                MemberMother: $('mother').value.trim(),
                MemberSpouse: $('spouse').value.trim(),
                MemberDOB: $('dob').value.trim(),
                MemberSons: $('sonsInput').value.trim(),
                MemberDaughters: $('daughtersInput').value.trim(),
                MemberProffession: $('profession').value.trim(),
                MemberQualification: $('qualification').value.trim(),
                MemberPlace: $('position').value.trim(),
                MemberDetailAddress: $('detailAddress').value.trim(),
                MemberDetailProfession: $('detailProfession').value.trim(),
                MemberLifeStory: $('lifeStory').value.trim(),
                MemberDOD: $('dodAge').value.trim(),
                MemberPhotoUrl: photoUrl,
                Status: 'pending'
            };
            if (isEditMode && editingSuggestionId) {
                const { error } = await supabase
                    .from('MemberSuggestionTable')
                    .update(payload)
                    .eq('id', editingSuggestionId);
                if (error) throw error;
            } else {
                const { error } = await supabase
                    .from('MemberSuggestionTable')
                    .insert([payload]);
                if (error) throw error;
            }
            await loadSuggestions();
            clearDraft();
            form.style.display = 'none';
            successPanel.style.display = 'flex';
            setProgressStep(3);
        } catch (error) {
            console.error('Submit error:', error);
            showFeedback(`<i class="fas fa-exclamation-circle"></i> त्रुटि: ${escapeHtml(error.message)}`, 'error');
        } finally {
            setButtonLoading(submitBtn, false);
            isSubmitting = false;
        }
    }
    function setButtonLoading(button, isLoading, loadingText) {
        if (!button) return;
        if (isLoading) {
            button.disabled = true;
            button._originalText = button.innerHTML;
            button.innerHTML = `<i class="fas fa-spinner fa-spin"></i> ${loadingText || 'प्रक्रिया चलिरहेको छ...'}`;
        } else {
            button.disabled = false;
            button.innerHTML = button._originalText || '<i class="fas fa-paper-plane"></i> सुझाव पठाउनुहोस्';
        }
    }

    // ------------------------------------------------------------
    // 16. Reset
    // ------------------------------------------------------------
    function resetForm(skipConfirm) {
        if (!skipConfirm) {
            const ok = window.confirm('तपाईंले भरेको सबै विवरण मेटिनेछ। निश्चित हुनुहुन्छ?');
            if (!ok) return;
        }
        const textInputs = form.querySelectorAll('input:not([type="hidden"]):not([type="checkbox"]), textarea');
        textInputs.forEach(input => { input.value = ''; });
        const selects = form.querySelectorAll('select');
        selects.forEach(select => {
            if (select.id !== 'isRegisteredSelect' && select.id !== 'isMemberRegisteredSelect') {
                select.selectedIndex = 0;
            }
        });
        photoFileNameDisp.textContent = 'कुनै फोटो छानिएको छैन';
        photoPreview.style.display = 'none';
        photoPreview.src = '';
        photoUrlInput.value = '';
        uploadStatus.innerHTML = '';
        photoFileInput.value = '';
        clearFeedback();
        document.querySelectorAll('.has-error').forEach(el => el.classList.remove('has-error'));
        document.querySelectorAll('.field-error').forEach(el => el.textContent = '');
        if (consentCheck) consentCheck.checked = false;
        updateSubmitButtonVisibility();
        if (isMemberRegisteredSelect) isMemberRegisteredSelect.selectedIndex = 0;
        memberPersonalCodeBox.style.display = 'none';
        if (memberCodeSearch) memberCodeSearch.value = '';
        closeCombobox(memberCodeResults);
        resetEditMode();
        clearDraft();
    }

    // ------------------------------------------------------------
    // 17. Photo selection
    // ------------------------------------------------------------
    function handlePhotoSelection(file) {
        if (!file) return;
        if (file.size > 5 * 1024 * 1024) {
            uploadStatus.innerHTML = '<span style="color:#b02b2b;">❌ फोटो 5MB भन्दा ठुलो छ।</span>';
            photoFileInput.value = '';
            return;
        }
        if (!file.type.startsWith('image/')) {
            uploadStatus.innerHTML = '<span style="color:#b02b2b;">❌ कृपया मान्य फोटो फाइल छान्नुहोस्।</span>';
            photoFileInput.value = '';
            return;
        }
        let memberName = $('fullName').value.trim() || 'member';
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
            uploadStatus.innerHTML = '<span style="color:#b8864b;">📷 फोटो काट्नुहोस्...</span>';
        };
        reader.readAsDataURL(file);
    }

    // ------------------------------------------------------------
    // 18. Event wiring
    // ------------------------------------------------------------
    isRegisteredSelect.addEventListener('change', toggleVisibility);
    btnConfirmFiller.addEventListener('click', confirmFiller);

    isMemberRegisteredSelect.addEventListener('change', function() {
        const value = this.value;
        if (value === 'yes') {
            memberPersonalCodeBox.style.display = 'flex';
            suggestMemberContainer.style.display = 'flex';
            memberCodeSearch.focus();
        } else if (value === 'no') {
            memberPersonalCodeBox.style.display = 'none';
            if (memberCodeSearch) memberCodeSearch.value = '';
            closeCombobox(memberCodeResults);
            suggestMemberContainer.style.display = 'flex';
            resetEditMode();
            setProgressStep(3);
        } else {
            memberPersonalCodeBox.style.display = 'none';
            if (memberCodeSearch) memberCodeSearch.value = '';
            closeCombobox(memberCodeResults);
            suggestMemberContainer.style.display = 'none';
            resetEditMode();
        }
    });

    resetBtn.addEventListener('click', function(e) {
        e.preventDefault();
        resetForm(false);
    });
    form.addEventListener('submit', submitSuggestion);

    if (consentCheck) {
        consentCheck.addEventListener('change', function() {
            updateSubmitButtonVisibility();
            if (consentCheck.checked) clearFeedback();
        });
    }

    $('uploadToCloudinaryBtn').addEventListener('click', () => photoFileInput.click());
    photoFileInput.addEventListener('change', function() {
        if (this.files && this.files[0]) handlePhotoSelection(this.files[0]);
    });

    ['fullName', 'mobile', 'email'].forEach(id => {
        const el = $(id);
        if (!el) return;
        el.addEventListener('blur', () => {
            if (id === 'fullName' && !el.value.trim()) {
                setFieldError('fullName', 'कृपया पूरा नाम भर्नुहोस्।');
            } else clearFieldError(id);
            if (id === 'mobile') {
                const v = el.value.trim();
                if (v && !/^9[678]\d{8}$/.test(v)) {
                    setFieldError('mobile', 'कृपया 10 अंकको मान्य मोबाइल नम्बर लेख्नुहोस्।');
                } else clearFieldError('mobile');
            }
            if (id === 'email') {
                const v = el.value.trim();
                if (v && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) {
                    setFieldError('email', 'कृपया मान्य इमेल ठेगाना लेख्नुहोस्।');
                } else clearFieldError('email');
            }
        });
        el.addEventListener('input', () => scheduleDraftSave());
    });

    form.querySelectorAll('input, textarea, select').forEach(el => {
        el.addEventListener('input', scheduleDraftSave);
        el.addEventListener('change', scheduleDraftSave);
    });

    if (submitAnotherBtn) {
        submitAnotherBtn.addEventListener('click', () => {
            successPanel.style.display = 'none';
            form.style.display = '';
            resetForm(true);
            setProgressStep(1);
            isRegisteredSelect.selectedIndex = 0;
            fillerIdentificationBox.style.display = 'none';
            suggestMemberContainer.style.display = 'none';
            updateSubmitButtonVisibility();
            window.scrollTo({ top: 0, behavior: 'smooth' });
        });
    }

    // Crop modal events
    cropModalClose.addEventListener('click', hideCropModal);
    cropCancelBtn.addEventListener('click', hideCropModal);
    cropConfirmBtn.addEventListener('click', performCrop);
    cropChooseAnother.addEventListener('click', () => {
        hideCropModal();
        setTimeout(() => photoFileInput.click(), 100);
    });
    cropZoomIn.addEventListener('click', () => zoomImage(0.1));
    cropZoomOut.addEventListener('click', () => zoomImage(-0.1));
    cropRotateLeft.addEventListener('click', () => rotateImage(-90));
    cropRotateRight.addEventListener('click', () => rotateImage(90));
    cropReset.addEventListener('click', resetTransform);

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && cropModal.style.display === 'flex') hideCropModal();
    });
    cropModal.addEventListener('click', (e) => {
        if (e.target === cropModal) hideCropModal();
    });

    // ------------------------------------------------------------
    // 19. Init
    // ------------------------------------------------------------
    async function init() {
        await loadMembers();
        await loadSuggestions();
        fillerIdentificationBox.style.display = 'none';
        suggestMemberContainer.style.display = 'none';
        fillerNameBox.style.display = 'none';
        btnConfirmFiller.style.display = 'none';
        isMemberRegisteredBox.style.display = 'none';
        memberPersonalCodeBox.style.display = 'none';
        resetEditMode();
        setProgressStep(1);
        updateSubmitButtonVisibility();

        const restored = restoreDraft();
        if (restored) {
            showFeedback(
                '<i class="fas fa-info-circle"></i> तपाईंको अपूर्ण फारम भेटियो र पुनः लोड गरियो। ' +
                '<button type="button" id="btnDiscardDraft" class="btn-ghost" style="margin-left:8px;">' +
                '<i class="fas fa-trash"></i> मेटाउनुहोस्</button>',
                'info'
            );
            setTimeout(() => {
                const b = $('btnDiscardDraft');
                if (b) b.addEventListener('click', () => {
                    resetForm(true);
                    clearFeedback();
                    setProgressStep(1);
                });
            }, 0);
        }
    }

    init();
    console.log('✅ RequestPage ready');
})();