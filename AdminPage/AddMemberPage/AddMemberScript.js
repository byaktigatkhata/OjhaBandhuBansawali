// AddMemberScript.js - Add Member Page

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
    // 2. Cloudinary config
    // ------------------------------------------------------------
    const CLOUD_NAME = 'lv6z41ky';
    const UPLOAD_PRESET = 'OjhaBandhuPhotoPreset';

    // ------------------------------------------------------------
    // 3. State variables
    // ------------------------------------------------------------
    let currentMemberData = null;
    const sons = [];
    const daughters = [];
    let allMembers = [];
    let isSubmitting = false;
    let isEditMode = false;
    let editingSuggestionId = null;
    let returnToViewRequest = false;

    const supabaseDB = window.SupabaseConfig?.supabase;
    const LOGIN_PAGE_URL = '../LoginPage/LoginIndex.html';

    // ------------------------------------------------------------
    // 4. Authentication
    // ------------------------------------------------------------
    async function checkPrivatePageAccess() {
        console.log('🔐 Checking authentication...');
        try {
            const { data: { session }, error } = await supabaseDB.auth.getSession();

            console.log('📊 Session data:', session ? 'Session exists' : 'No session');

            if (error) {
                console.error('Authentication check error:', error);
                redirectToLogin();
                return false;
            }
            if (!session?.user) {
                console.log('🚫 No authenticated user found, redirecting...');
                redirectToLogin();
                return false;
            }
            console.log('✅ User authenticated:', session.user.email);
            return true;
        } catch (error) {
            console.error('Private page authentication error:', error);
            redirectToLogin();
            return false;
        }
    }

    function redirectToLogin() {
        console.log('🔄 Redirecting to login page...');
        window.location.replace(LOGIN_PAGE_URL);
    }

    // ------------------------------------------------------------
    // 5. Cloudinary Delete
    // ------------------------------------------------------------
    async function deleteFromCloudinary(publicId) {
        if (!publicId) {
            console.log('ℹ️ No publicId provided, skipping deletion');
            return { success: true, skipped: true };
        }

        let cleanId = String(publicId).trim();

        if (cleanId.startsWith('http')) {
            try {
                const parts = cleanId.split('/upload/');
                if (parts[1]) {
                    let afterUpload = parts[1];
                    afterUpload = afterUpload.replace(
                        /^(?:[a-z]+_[a-z0-9]+(?:,[a-z]+_[a-z0-9]+)*\/)+/i,
                        ''
                    );
                    afterUpload = afterUpload.replace(/^v\d+\//, '');
                    afterUpload = afterUpload.replace(/\.[a-zA-Z0-9]+(?:\?.*)?$/, '');
                    cleanId = afterUpload;
                }
            } catch (err) {
                console.warn('⚠️ Could not parse URL, using raw string:', err);
            }
        }

        cleanId = cleanId.replace(/^\/+/, '').trim();

        if (!cleanId) {
            console.warn('⚠️ Resolved public_id is empty after normalization');
            return { success: false, error: 'Invalid public_id after normalization' };
        }

        const functionUrl = 'https://icchczijubhzxkjpebps.supabase.co/functions/v1/delete-cloudinary-image';

        try {
            console.log(`🗑️ Attempting to delete Cloudinary image: "${cleanId}"`);

            const response = await fetch(functionUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
                },
                body: JSON.stringify({ public_id: cleanId })
            });

            const rawText = await response.text();
            let result;
            try {
                result = JSON.parse(rawText);
            } catch (_) {
                result = { success: response.ok, raw: rawText };
            }

            console.log('📥 Cloudinary delete response:', result);

            if (result.success) {
                const cloudResult = result.result?.result;
                if (cloudResult === 'not found') {
                    console.log('ℹ️ Image was already deleted (not found)');
                    return { success: true, alreadyDeleted: true, result };
                }
                console.log('✅ Image deleted successfully');
                return { success: true, result };
            }

            const cloudResult = result.result?.result || result.result;
            if (cloudResult === 'not found') {
                console.log('ℹ️ Image was already deleted (not found)');
                return { success: true, alreadyDeleted: true, result };
            }

            console.warn('⚠️ Delete returned success=false:', result);
            return {
                success: false,
                error: result.error || result.message || 'Unknown delete failure',
                result
            };

        } catch (error) {
            console.error('❌ Delete fetch error:', error);
            return { success: false, error: error.message };
        }
    }

    // ------------------------------------------------------------
    // 6. Cloudinary Upload
    // ------------------------------------------------------------
    function uploadToCloudinary(fileOrBlob, onSuccess, onError, originalName) {
        const formData = new FormData();
        const fileName = originalName || fileOrBlob.name || `photo_${Date.now()}.jpg`;
        formData.append('file', fileOrBlob, fileName);
        formData.append('upload_preset', UPLOAD_PRESET);

        fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`, {
            method: 'POST',
            body: formData
        })
        .then(res => res.json())
        .then(data => {
            if (data.secure_url) {
                const parts = data.secure_url.split('/upload/');
                const transformedUrl = parts[0] + '/upload/c_fill,w_600,h_800/' + parts[1];
                onSuccess(transformedUrl, data.public_id);
            } else {
                onError(data.error?.message || 'Upload failed');
            }
        })
        .catch(err => {
            onError(err.message);
        });
    }

    // ------------------------------------------------------------
    // 7. Helper Functions
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

    function getParentCode(code) {
        if (!code) return null;
        const parts = code.split('.');
        if (parts.length <= 1) return null;
        return parts.slice(0, -1).join('.');
    }

    function getDirectChildren(parentCode, members) {
        if (!parentCode) return [];
        const parentBase = getBaseCode(parentCode);
        return members.filter(m => {
            const childParent = getParentCode(m.PersonalCode);
            if (!childParent) return false;
            return getBaseCode(childParent) === parentBase;
        }).sort((a, b) => a.PersonalCode.localeCompare(b.PersonalCode));
    }

    function getNextChildNumber(parentCode, members) {
        const children = getDirectChildren(parentCode, members);
        if (children.length === 0) return 1;

        let maxNum = 0;
        children.forEach(child => {
            const parts = child.PersonalCode.split('.');
            let lastPart = parts[parts.length - 1];
            lastPart = lastPart.replace(/[a-zA-Z]$/, '');
            lastPart = lastPart.replace(/^[MF]/, '');
            const num = parseInt(lastPart);
            if (!isNaN(num) && num > maxNum) maxNum = num;
        });
        return maxNum + 1;
    }

    function getNextRootNumber(members) {
        const roots = members.filter(m => {
            const parts = m.PersonalCode.split('.');
            return parts.length === 1 && !parts[0].endsWith('M');
        });

        if (roots.length === 0) return 1;

        let maxNum = 0;
        roots.forEach(root => {
            let code = root.PersonalCode;
            code = code.replace(/^K([MF])(\d+)/, 'K$2');
            const num = parseInt(code.substring(1));
            if (!isNaN(num) && num > maxNum) maxNum = num;
        });
        return maxNum + 1;
    }

    function generateCodeFromSelection(selectedParent, members, gender) {
        const genderCode = gender === 'M' ? 'M' : (gender === 'F' ? 'F' : '');

        if (!selectedParent) {
            const nextNum = getNextRootNumber(members);
            if (genderCode) {
                return 'K' + genderCode + nextNum;
            }
            return 'K' + nextNum;
        }

        const parentBase = getBaseCode(selectedParent);
        const nextNum = getNextChildNumber(selectedParent, members);

        if (genderCode) {
            return parentBase + '.' + genderCode + nextNum;
        } else {
            return parentBase + '.' + nextNum;
        }
    }

    function getSelectedMember() {
        for (let i = 10; i >= 1; i--) {
            const sel = document.getElementById(`gen${i}`);
            if (sel && sel.value) {
                const member = allMembers.find(m => m.PersonalCode === sel.value);
                if (member) return member;
            }
        }
        return null;
    }

    function getSelectedCode() {
        for (let i = 10; i >= 1; i--) {
            const sel = document.getElementById(`gen${i}`);
            if (sel && sel.value) {
                return sel.value;
            }
        }
        return null;
    }

    function toPortrait3x4Url(url) {
        if (!url || typeof url !== 'string') return url;
        if (!url.includes('/upload/')) return url;

        const parts = url.split('/upload/');
        let rest = parts[1];
        rest = rest.replace(/^(?:[a-z]+_[a-z0-9]+(?:,[a-z]+_[a-z0-9]+)*\/)+/i, '');
        return parts[0] + '/upload/c_fill,w_600,h_800/' + rest;
    }

    // ------------------------------------------------------------
    // 8. Build Generation Dropdowns
    // ------------------------------------------------------------
    const genContainer = document.getElementById('genDropdownsContainer');
    const genSelects = [];

    if (genContainer) {
        for (let i = 1; i <= 10; i++) {
            const wrapper = document.createElement('div');
            wrapper.className = 'gen-select';
            wrapper.innerHTML = `<label>पुस्ता ${i}</label><select id="gen${i}"><option value="">छान्नुहोस्</option></select>`;
            genContainer.appendChild(wrapper);
            const select = wrapper.querySelector('select');
            genSelects.push(select);

            select.addEventListener('change', function() {
                const currentIndex = genSelects.indexOf(this);
                for (let i = currentIndex + 1; i < genSelects.length; i++) {
                    genSelects[i].innerHTML = '<option value="">छान्नुहोस्</option>';
                }
                if (this.value) {
                    populateNextGenDropdown(currentIndex, this.value);
                }
                updateCode();
            });
        }
    }

    function populateNextGenDropdown(currentIndex, selectedCode) {
        const nextIndex = currentIndex + 1;
        if (nextIndex >= genSelects.length) return;

        const nextSelect = genSelects[nextIndex];
        const children = getDirectChildren(selectedCode, allMembers);
        const currentValue = nextSelect.value;

        nextSelect.innerHTML = '<option value="">छान्नुहोस्</option>';

        children.sort((a, b) => a.PersonalCode.localeCompare(b.PersonalCode));

        children.forEach(child => {
            const opt = document.createElement('option');
            opt.value = child.PersonalCode;
            let genderEmoji = '';
            const parts = child.PersonalCode.split('.');
            const lastPart = parts[parts.length - 1];
            if (lastPart.startsWith('M') && !child.PersonalCode.endsWith('M')) {
                genderEmoji = '♂️ ';
            } else if (lastPart.startsWith('F') && !child.PersonalCode.endsWith('M')) {
                genderEmoji = '♀️ ';
            }
            const label = child.PersonalCode.endsWith('M') ? '👰 ' : '';
            opt.textContent = `${label}${genderEmoji}${child.PersonalCode} - ${child.FullName}`;
            nextSelect.appendChild(opt);
        });

        if (currentValue && nextSelect.querySelector(`option[value="${currentValue}"]`)) {
            nextSelect.value = currentValue;
        }
    }

    function populateGen1Dropdown() {
        const gen1Select = document.getElementById('gen1');
        if (!gen1Select) return;

        const currentValue = gen1Select.value;
        gen1Select.innerHTML = '<option value="">छान्नुहोस्</option>';

        const gen1Members = allMembers.filter(m => {
            const parts = m.PersonalCode.split('.');
            return parts.length === 1 && !parts[0].endsWith('M');
        });
        gen1Members.sort((a, b) => a.PersonalCode.localeCompare(b.PersonalCode));

        gen1Members.forEach(m => {
            const opt = document.createElement('option');
            opt.value = m.PersonalCode;
            let genderEmoji = '';
            if (m.PersonalCode.startsWith('KM')) {
                genderEmoji = '♂️ ';
            } else if (m.PersonalCode.startsWith('KF')) {
                genderEmoji = '♀️ ';
            }
            const label = m.PersonalCode.endsWith('M') ? '👰 ' : '';
            opt.textContent = `${label}${genderEmoji}${m.PersonalCode} - ${m.FullName}`;
            gen1Select.appendChild(opt);
        });

        if (currentValue && gen1Select.querySelector(`option[value="${currentValue}"]`)) {
            gen1Select.value = currentValue;
        }
    }

    function refreshDropdowns() {
        const selections = {};
        genSelects.forEach((sel, index) => {
            selections[index] = sel.value;
        });

        populateGen1Dropdown();

        for (let i = 0; i < genSelects.length; i++) {
            const sel = genSelects[i];
            if (i === 0) {
                if (selections[0] && sel.querySelector(`option[value="${selections[0]}"]`)) {
                    sel.value = selections[0];
                }
            } else {
                const prevSel = genSelects[i - 1];
                if (prevSel && prevSel.value) {
                    populateNextGenDropdown(i - 1, prevSel.value);
                    if (selections[i] && sel.querySelector(`option[value="${selections[i]}"]`)) {
                        sel.value = selections[i];
                    }
                } else {
                    sel.innerHTML = '<option value="">छान्नुहोस्</option>';
                }
            }
        }

        updateCode();
    }

    // ------------------------------------------------------------
    // 9. Auto-generate Personal Code
    // ------------------------------------------------------------
    const personalCodeInput = document.getElementById('personalCode');
    const genBadge = document.getElementById('genBadge');

    function updateCode() {
        const selectedParent = getSelectedCode();
        const gender = document.getElementById('gender').value || 'M';
        const code = generateCodeFromSelection(selectedParent, allMembers, gender);
        if (personalCodeInput) {
            personalCodeInput.value = code;
        }
        const gen = getGenerationFromCode(code);
        if (genBadge) {
            genBadge.textContent = `पुस्ता ${gen}`;
        }
    }

    document.getElementById('gender')?.addEventListener('change', updateCode);

    // ============================================================
    // 10. PANEL MANAGEMENT
    // ============================================================
    const PANELS = {
        addMemberForm: document.getElementById('addMemberForm'),
        spouseModal:   document.getElementById('spouseModal'),
        editModal:     document.getElementById('editModal')
    };

    console.log('🎛️ Panels found:',
        'addMemberForm=' + (PANELS.addMemberForm ? 'OK' : 'MISSING'),
        '| spouseModal=' + (PANELS.spouseModal ? 'OK' : 'MISSING'),
        '| editModal=' + (PANELS.editModal ? 'OK' : 'MISSING')
    );

    const TOGGLE_BTNS = {
        addMemberForm: document.getElementById('toggleAddFormBtn'),
        spouseBtn:     document.getElementById('addSpouseBtn'),
        editBtn:       document.getElementById('editMemberBtn')
    };

    console.log('🎛️ Buttons found:',
        'toggleAddFormBtn=' + (TOGGLE_BTNS.addMemberForm ? 'OK' : 'MISSING'),
        '| addSpouseBtn=' + (TOGGLE_BTNS.spouseBtn ? 'OK' : 'MISSING'),
        '| editMemberBtn=' + (TOGGLE_BTNS.editBtn ? 'OK' : 'MISSING')
    );

    function showPanel(panelId) {
        console.log('🎛️ showPanel:', panelId);

        Object.keys(PANELS).forEach(id => {
            const el = PANELS[id];
            if (!el) return;

            if (id === panelId) {
                el.classList.add('is-active');
                el.classList.add('active');
                el.style.display = 'block';
                el.style.visibility = 'visible';
                el.style.opacity = '1';
            } else {
                el.classList.remove('is-active');
                el.classList.remove('active');
                el.style.display = 'none';
            }
        });

        if (TOGGLE_BTNS.addMemberForm) {
            TOGGLE_BTNS.addMemberForm.classList.toggle('active', panelId === 'addMemberForm');
        }
        if (TOGGLE_BTNS.spouseBtn) {
            TOGGLE_BTNS.spouseBtn.classList.toggle('active', panelId === 'spouseModal');
        }
        if (TOGGLE_BTNS.editBtn) {
            TOGGLE_BTNS.editBtn.classList.toggle('active', panelId === 'editModal');
        }

        if (panelId && PANELS[panelId]) {
            setTimeout(() => {
                PANELS[panelId].scrollIntoView({ behavior: 'smooth', block: 'start' });
            }, 50);
        }
    }

    function hideAllPanels() {
        showPanel(null);
    }

    hideAllPanels();

    // ------------------------------------------------------------
    // 10b. Toggle: Add Member Form button
    // ------------------------------------------------------------
    TOGGLE_BTNS.addMemberForm?.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();

        const isCurrentlyActive = PANELS.addMemberForm?.classList.contains('is-active');
        if (isCurrentlyActive) {
            hideAllPanels();
        } else {
            showPanel('addMemberForm');
        }
    });

    // ------------------------------------------------------------
    // 10c. Panel close buttons (✕)
    // ------------------------------------------------------------
    document.querySelectorAll('.panel-close-btn').forEach(btn => {
        btn.addEventListener('click', function (e) {
            e.preventDefault();
            e.stopPropagation();
            const targetId = this.dataset.close;
            if (targetId === 'editModal') {
                isEditMode = false;
            }
            hideAllPanels();
        });
    });

    // ============================================================
    // 11. Sons & Daughters management
    // ============================================================
    const sonInput = document.getElementById('sonInput');
    const daughterInput = document.getElementById('daughterInput');
    const sonList = document.getElementById('sonList');
    const daughterList = document.getElementById('daughterList');

    function renderSons() {
        if (sonList) {
            sonList.innerHTML = sons.map((name, idx) =>
                `<span class="tag">${name} <i class="fas fa-times" data-index="${idx}" data-type="son"></i></span>`
            ).join('');
            sonList.querySelectorAll('.tag i').forEach(el => {
                el.addEventListener('click', function() {
                    const idx = parseInt(this.dataset.index);
                    sons.splice(idx, 1);
                    renderSons();
                });
            });
        }
    }
    function renderDaughters() {
        if (daughterList) {
            daughterList.innerHTML = daughters.map((name, idx) =>
                `<span class="tag">${name} <i class="fas fa-times" data-index="${idx}" data-type="daughter"></i></span>`
            ).join('');
            daughterList.querySelectorAll('.tag i').forEach(el => {
                el.addEventListener('click', function() {
                    const idx = parseInt(this.dataset.index);
                    daughters.splice(idx, 1);
                    renderDaughters();
                });
            });
        }
    }

    document.getElementById('addSonBtn')?.addEventListener('click', function() {
        const val = sonInput?.value.trim();
        if (val) { sons.push(val); sonInput.value = ''; renderSons(); }
    });
    document.getElementById('addDaughterBtn')?.addEventListener('click', function() {
        const val = daughterInput?.value.trim();
        if (val) { daughters.push(val); daughterInput.value = ''; renderDaughters(); }
    });

    // ============================================================
    // 12. Cloudinary Upload for Add Member Form
    // ============================================================
    const photoFileInput = document.getElementById('photoFile');
    const photoPreview = document.getElementById('photoPreview');
    const photoUrlInput = document.getElementById('photoUrl');
    const publicIdInput = document.getElementById('publicId');
    const uploadStatus = document.getElementById('uploadStatus');
    const uploadBtn = document.getElementById('uploadToCloudinaryBtn');
    const photoFileNameDisplay = document.getElementById('photoFileNameDisplay');

    uploadBtn?.addEventListener('click', function(e) {
        e.preventDefault();
        e.stopPropagation();
        if (photoFileInput) photoFileInput.click();
    });

    photoFileInput?.addEventListener('change', function() {
        if (!this.files || !this.files[0]) return;

        const originalFile = this.files[0];
        if (photoFileNameDisplay) {
            photoFileNameDisplay.textContent = originalFile.name;
        }

        PhotoCropper.open(
            originalFile,
            { aspect: 3 / 4, title: 'फोटो क्रप गर्नुहोस् (3:4)' },
            async (croppedBlob) => {
                const previewUrl = URL.createObjectURL(croppedBlob);
                if (photoPreview) {
                    photoPreview.src = previewUrl;
                    photoPreview.style.display = 'block';
                }

                if (uploadStatus) {
                    uploadStatus.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Uploading...';
                }

                return new Promise((resolve) => {
                    uploadToCloudinary(
                        croppedBlob,
                        (url, publicId) => {
                            if (photoUrlInput) photoUrlInput.value = url;
                            if (publicIdInput) publicIdInput.value = publicId;
                            if (photoPreview) photoPreview.src = url;
                            if (uploadStatus) {
                                uploadStatus.innerHTML = `<span style="color:#1f7b4d;">✅ Uploaded! (3:4 → 600×800)</span>`;
                            }
                            setTimeout(() => URL.revokeObjectURL(previewUrl), 3000);
                            resolve();
                        },
                        (error) => {
                            if (uploadStatus) {
                                uploadStatus.innerHTML = `<span style="color:#b02b2b;">❌ Error: ${error}</span>`;
                            }
                            resolve();
                        },
                        originalFile.name
                    );
                });
            }
        );

        this.value = '';
    });

    // ============================================================
    // 13. Load Members
    // ============================================================
    async function loadMembers() {
        if (!supabase) {
            console.warn('Supabase not available');
            allMembers = [];
            refreshDropdowns();
            updateCode();
            return;
        }

        try {
            const { data, error } = await supabase
                .from('MemberDataTable')
                .select('*');

            if (error) throw error;

            if (!data || data.length === 0) {
                allMembers = [];
                refreshDropdowns();
                updateCode();
                return;
            }

            allMembers = data;
            console.log('✅ Loaded', allMembers.length, 'members');
            refreshDropdowns();
            updateCode();

        } catch(e) {
            console.warn('Could not load members:', e);
            allMembers = [];
            refreshDropdowns();
            updateCode();
        }
    }

    // ============================================================
    // 14. Add Spouse button — TOGGLE
    // ============================================================
    const feedback = document.getElementById('formFeedback');

    TOGGLE_BTNS.spouseBtn?.addEventListener('click', function(e) {
        e.preventDefault();
        e.stopPropagation();

        console.log('🔘 addSpouseBtn clicked');

        // ✅ TOGGLE: if already active, hide and return
        if (PANELS.spouseModal?.classList.contains('is-active')) {
            hideAllPanels();
            return;
        }

        // Show the panel
        showPanel('spouseModal');

        // Then validate / populate
        const selectedMember = getSelectedMember();

        if (!selectedMember) {
            if (feedback) {
                feedback.innerHTML = '<span style="color:#b02b2b;"><i class="fas fa-exclamation-triangle"></i> कृपया पहिले माथिको ड्रपडाउनबाट एक सदस्य छान्नुहोस्।</span>';
            }

            document.getElementById('spouseOfDisplay').textContent = '— कुनै सदस्य छानिएको छैन —';
            document.getElementById('spouseOf').value = '';
            document.getElementById('spouseCodeDisplay').textContent = '—';
            document.getElementById('spouseCode').value = '';
            document.getElementById('spouseModalTitle').textContent = 'श्रीमान/श्रीमती थप्नुहोस्';
            document.getElementById('spouseOfLabel').textContent = 'कस्को श्रीमान/श्रीमती';

            window._spousePhotoUrl = null;
            window._spousePhotoPublicId = null;
            return;
        }

        if (selectedMember.PersonalCode.endsWith('M')) {
            if (feedback) feedback.innerHTML = '<span style="color:#b02b2b;"><i class="fas fa-exclamation-triangle"></i> यो पहिले नै श्रीमान/श्रीमतीको प्रविष्टि हो। कृपया रगतको नाता भएको सदस्य छान्नुहोस्।</span>';
            return;
        }

        const spouseCode = selectedMember.PersonalCode + 'M';
        const existingSpouse = allMembers.find(m => m.PersonalCode === spouseCode);
        if (existingSpouse) {
            if (feedback) feedback.innerHTML = `<span style="color:#b02b2b;"><i class="fas fa-exclamation-triangle"></i> श्रीमान/श्रीमती पहिले नै अवस्थित छन्: ${existingSpouse.FullName} (${spouseCode})</span>`;
            return;
        }

        const gender = selectedMember.Gender || 'M';
        let spouseLabel = 'श्रीमान/श्रीमती';
        let modalTitle = 'श्रीमान/श्रीमती थप्नुहोस्';
        if (gender === 'M') {
            spouseLabel = 'श्रीमती (Wife of)';
            modalTitle = 'श्रीमती थप्नुहोस्';
        } else if (gender === 'F') {
            spouseLabel = 'श्रीमान (Husband of)';
            modalTitle = 'श्रीमान थप्नुहोस्';
        }

        document.getElementById('spouseOfLabel').textContent = spouseLabel;
        document.getElementById('spouseModalTitle').textContent = modalTitle;
        document.getElementById('spouseOfDisplay').textContent = `${selectedMember.FullName} (${selectedMember.PersonalCode})`;
        document.getElementById('spouseOf').value = selectedMember.FullName + ' (' + selectedMember.PersonalCode + ')';
        document.getElementById('spouseCode').value = spouseCode;
        document.getElementById('spouseCodeDisplay').textContent = spouseCode;

        document.getElementById('spouseForm').reset();
        document.getElementById('spousePhotoPreview').style.display = 'none';

        window._spousePhotoUrl = null;
        window._spousePhotoPublicId = null;

        if (feedback) feedback.innerHTML = '';
    });

    document.getElementById('closeSpouseModal')?.addEventListener('click', function(e) {
        e.preventDefault();
        hideAllPanels();
    });
    document.getElementById('closeSpouseModalBtn')?.addEventListener('click', function(e) {
        e.preventDefault();
        hideAllPanels();
    });

    document.getElementById('spousePhotoBtn')?.addEventListener('click', function(e) {
        e.preventDefault();
        e.stopPropagation();
        document.getElementById('spousePhoto').click();
    });

    document.getElementById('spousePhoto')?.addEventListener('change', function() {
        if (!this.files || !this.files[0]) return;

        const originalFile = this.files[0];
        const nameEl = document.getElementById('spousePhotoFileName');
        if (nameEl) nameEl.textContent = originalFile.name;

        PhotoCropper.open(
            originalFile,
            { aspect: 3 / 4, title: 'श्रीमान/श्रीमतीको फोटो क्रप (3:4)' },
            async (croppedBlob) => {
                const previewEl = document.getElementById('spousePhotoPreview');
                const previewUrl = URL.createObjectURL(croppedBlob);
                previewEl.src = previewUrl;
                previewEl.style.display = 'block';

                return new Promise((resolve) => {
                    uploadToCloudinary(
                        croppedBlob,
                        (url, pid) => {
                            window._spousePhotoUrl = url;
                            window._spousePhotoPublicId = pid;
                            previewEl.src = url;
                            setTimeout(() => URL.revokeObjectURL(previewUrl), 3000);
                            resolve();
                        },
                        (error) => {
                            alert('श्रीमान/श्रीमतीको फोटो अपलोड असफल: ' + error);
                            resolve();
                        },
                        originalFile.name
                    );
                });
            }
        );

        this.value = '';
    });

    document.getElementById('spouseForm')?.addEventListener('submit', async function(e) {
        e.preventDefault();

        const spouseCode = document.getElementById('spouseCode').value;
        const fullName = document.getElementById('spouseFullName').value.trim();

        if (!spouseCode) {
            alert('कृपया पहिले माथिको ड्रपडाउनबाट एक सदस्य छान्नुहोस्।');
            return;
        }
        if (!fullName) {
            alert('कृपया श्रीमान/श्रीमतीको नाम प्रविष्ट गर्नुहोस्।');
            return;
        }

        const submitBtn = document.getElementById('addSpouseModalBtn');
        if (submitBtn) setButtonLoading(submitBtn, true, 'थप्दै...');

        try {
            const payload = {
                PersonalCode: spouseCode,
                FullName: fullName,
                Gender: document.getElementById('spouseGender').value,
                Address: document.getElementById('spouseAddress').value.trim(),
                Mobile: document.getElementById('spouseMobile').value.trim(),
                Email: document.getElementById('spouseEmail').value.trim(),
                DOB: document.getElementById('spouseDob').value.trim(),
                Profession: document.getElementById('spouseProfession').value.trim(),
                Spouse: document.getElementById('spouseOf').value.split(' (')[0],
                PhotoUrl: window._spousePhotoUrl || '',
                PublicId: window._spousePhotoPublicId || ''
            };

            if (!supabase) {
                alert('Supabase initialized छैन।');
                return;
            }

            const { data, error } = await supabase
                .from('MemberDataTable')
                .insert([payload]);
            if (error) throw error;

            alert(`✅ श्रीमान/श्रीमती "${fullName}" सफलतापूर्वक थपियो! Code: ${spouseCode}`);

            window._spousePhotoUrl = null;
            window._spousePhotoPublicId = null;

            hideAllPanels();
            await loadMembers();

        } catch(err) {
            alert(`❌ Error: ${err.message}`);
        } finally {
            if (submitBtn) setButtonLoading(submitBtn, false);
        }
    });

    // ============================================================
    // 15. Edit Member button — TOGGLE
    // ============================================================
    TOGGLE_BTNS.editBtn?.addEventListener('click', function(e) {
        e.preventDefault();
        e.stopPropagation();

        console.log('🔘 editMemberBtn clicked');

        // ✅ TOGGLE: if already active, hide and return
        if (PANELS.editModal?.classList.contains('is-active')) {
            hideAllPanels();
            isEditMode = false;
            return;
        }

        // Show the panel
        showPanel('editModal');

        // Then validate / populate
        const selectedMember = getSelectedMember();

        if (!selectedMember) {
            if (feedback) {
                feedback.innerHTML = '<span style="color:#b02b2b;"><i class="fas fa-exclamation-triangle"></i> कृपया पहिले माथिको ड्रपडाउनबाट एक सदस्य छान्नुहोस्।</span>';
            }

            document.getElementById('editCode').value = '';
            document.getElementById('editFullName').value = '';
            document.getElementById('editGender').value = 'M';
            document.getElementById('editAddress').value = '';
            document.getElementById('editMobile').value = '';
            document.getElementById('editEmail').value = '';
            document.getElementById('editFather').value = '';
            document.getElementById('editMother').value = '';
            document.getElementById('editSpouse').value = '';
            document.getElementById('editDob').value = '';
            document.getElementById('editSons').value = '';
            document.getElementById('editDaughters').value = '';
            document.getElementById('editProfession').value = '';
            document.getElementById('editQualification').value = '';
            document.getElementById('editPosition').value = '';
            document.getElementById('editDetailAddress').value = '';
            document.getElementById('editDetailProfession').value = '';
            document.getElementById('editLifeStory').value = '';
            document.getElementById('editDodAge').value = '';
            document.getElementById('editPhotoUrl').value = '';
            document.getElementById('editPublicId').value = '';
            document.getElementById('editPhotoPreview').style.display = 'none';
            document.getElementById('editPhotoFileName').textContent = 'कुनै फोटो छैन';
            document.getElementById('editPhotoFileNameDisplay').textContent = 'कुनै फोटो छानिएको छैन';
            document.getElementById('editUploadStatus').innerHTML = '';
            document.getElementById('editDeleteStatus').innerHTML = '';

            currentMemberData = null;
            isEditMode = false;
            return;
        }

        currentMemberData = selectedMember;
        isEditMode = true;

        document.getElementById('editCode').value = selectedMember.PersonalCode;
        document.getElementById('editFullName').value = selectedMember.FullName || '';
        document.getElementById('editGender').value = selectedMember.Gender || 'M';
        document.getElementById('editAddress').value = selectedMember.Address || '';
        document.getElementById('editMobile').value = selectedMember.Mobile || '';
        document.getElementById('editEmail').value = selectedMember.Email || '';
        document.getElementById('editFather').value = selectedMember.Father || '';
        document.getElementById('editMother').value = selectedMember.Mother || '';
        document.getElementById('editSpouse').value = selectedMember.Spouse || '';
        document.getElementById('editDob').value = selectedMember.DOB || '';
        document.getElementById('editSons').value = selectedMember.Sons || '';
        document.getElementById('editDaughters').value = selectedMember.Daughters || '';
        document.getElementById('editProfession').value = selectedMember.Profession || '';
        document.getElementById('editQualification').value = selectedMember.Qualification || '';
        document.getElementById('editPosition').value = selectedMember.Position || '';
        document.getElementById('editDetailAddress').value = selectedMember.DetailAddress || '';
        document.getElementById('editDetailProfession').value = selectedMember.DetailProfession || '';
        document.getElementById('editLifeStory').value = selectedMember.LifeStory || '';
        document.getElementById('editDodAge').value = selectedMember.DOD_Age || '';

        const rawPhotoUrl = selectedMember.PhotoUrl || '';
        const publicId = selectedMember.PublicId || '';
        document.getElementById('editPhotoUrl').value = rawPhotoUrl;
        document.getElementById('editPublicId').value = publicId;

        if (rawPhotoUrl) {
            const displayUrl = toPortrait3x4Url(rawPhotoUrl);
            document.getElementById('editPhotoPreview').src = displayUrl;
            document.getElementById('editPhotoPreview').style.display = 'block';
            const fileName = String(rawPhotoUrl).split('/').pop().split('?')[0] || 'Photo';
            document.getElementById('editPhotoFileName').textContent = fileName;
            document.getElementById('editPhotoFileNameDisplay').textContent = fileName;
            document.getElementById('editCurrentPhoto').style.display = 'flex';
        } else {
            document.getElementById('editPhotoPreview').style.display = 'none';
            document.getElementById('editPhotoFileName').textContent = 'कुनै फोटो छैन';
            document.getElementById('editPhotoFileNameDisplay').textContent = 'कुनै फोटो छानिएको छैन';
        }

        document.getElementById('editPhotoFile').value = '';
        document.getElementById('editUploadStatus').innerHTML = '';
        document.getElementById('editDeleteStatus').innerHTML = '';

        window._editCroppedBlob = null;
        window._editCroppedName = null;

        if (feedback) feedback.innerHTML = '';
    });

    document.getElementById('editPhotoBtn')?.addEventListener('click', function(e) {
        e.preventDefault();
        e.stopPropagation();
        document.getElementById('editPhotoFile').click();
    });

    document.getElementById('editPhotoFile')?.addEventListener('change', function() {
        if (!this.files || !this.files[0]) return;

        const originalFile = this.files[0];
        document.getElementById('editPhotoFileName').textContent = originalFile.name;
        document.getElementById('editPhotoFileNameDisplay').textContent = originalFile.name;

        document.getElementById('editUploadStatus').innerHTML = '';
        document.getElementById('editDeleteStatus').innerHTML = '';

        PhotoCropper.open(
            originalFile,
            { aspect: 3 / 4, title: 'नयाँ फोटो क्रप गर्नुहोस् (3:4)' },
            async (croppedBlob) => {
                const statusEl = document.getElementById('editUploadStatus');
                const deleteEl = document.getElementById('editDeleteStatus');
                const oldPublicId = document.getElementById('editPublicId').value;

                const previewUrl = URL.createObjectURL(croppedBlob);
                const previewImg = document.getElementById('editPhotoPreview');
                previewImg.src = previewUrl;
                previewImg.style.display = 'block';

                if (oldPublicId) {
                    deleteEl.innerHTML = '<i class="fas fa-spinner fa-spin"></i> पुरानो फोटो मेटाउँदै...';
                    try {
                        const delResult = await deleteFromCloudinary(oldPublicId);
                        if (delResult.success) {
                            deleteEl.innerHTML = delResult.alreadyDeleted
                                ? '<span style="color:#155724;">ℹ️ पुरानो फोटो पहिले नै मेटिएको थियो</span>'
                                : '<span style="color:#155724;">✅ पुरानो फोटो मेटियो</span>';
                        } else {
                            deleteEl.innerHTML = '<span style="color:#856404;">⚠️ पुरानो फोटो मेट्न सकिएन (तैपनि नयाँ फोटो अपलोड हुनेछ)</span>';
                            console.warn('Delete failed:', delResult);
                        }
                    } catch (err) {
                        deleteEl.innerHTML = '<span style="color:#856404;">⚠️ Delete error: ' + err.message + '</span>';
                    }
                }

                statusEl.innerHTML = '<i class="fas fa-spinner fa-spin"></i> नयाँ फोटो अपलोड हुँदै...';

                return new Promise((resolve) => {
                    uploadToCloudinary(
                        croppedBlob,
                        (url, publicId) => {
                            document.getElementById('editPhotoUrl').value = url;
                            document.getElementById('editPublicId').value = publicId;
                            previewImg.src = url;
                            statusEl.innerHTML = '<span style="color:#1f7b4d;">✅ फोटो अपलोड भयो!</span>';
                            setTimeout(() => URL.revokeObjectURL(previewUrl), 3000);
                            resolve();
                        },
                        (error) => {
                            statusEl.innerHTML = '<span style="color:#b02b2b;">❌ अपलोड असफल: ' + error + '</span>';
                            const oldUrl = document.getElementById('editPhotoUrl').value;
                            if (oldUrl) {
                                previewImg.src = toPortrait3x4Url(oldUrl);
                            }
                            resolve();
                        },
                        originalFile.name
                    );
                });
            }
        );

        this.value = '';
    });

    document.getElementById('closeEditModal')?.addEventListener('click', function(e) {
        e.preventDefault();
        hideAllPanels();
        isEditMode = false;
    });
    document.getElementById('closeEditModalBtn')?.addEventListener('click', function(e) {
        e.preventDefault();
        hideAllPanels();
        isEditMode = false;
    });

    document.getElementById('editForm')?.addEventListener('submit', async function(e) {
        e.preventDefault();

        if (!currentMemberData) {
            alert('कृपया पहिले माथिको ड्रपडाउनबाट एक सदस्य छान्नुहोस्।');
            return;
        }

        const payload = {
            FullName: document.getElementById('editFullName').value.trim(),
            Gender: document.getElementById('editGender').value,
            Address: document.getElementById('editAddress').value.trim(),
            Mobile: document.getElementById('editMobile').value.trim(),
            Email: document.getElementById('editEmail').value.trim(),
            Father: document.getElementById('editFather').value.trim(),
            Mother: document.getElementById('editMother').value.trim(),
            Spouse: document.getElementById('editSpouse').value.trim(),
            DOB: document.getElementById('editDob').value.trim(),
            Sons: document.getElementById('editSons').value.trim(),
            Daughters: document.getElementById('editDaughters').value.trim(),
            Profession: document.getElementById('editProfession').value.trim(),
            Qualification: document.getElementById('editQualification').value.trim(),
            Position: document.getElementById('editPosition').value.trim(),
            DetailAddress: document.getElementById('editDetailAddress').value.trim(),
            DetailProfession: document.getElementById('editDetailProfession').value.trim(),
            LifeStory: document.getElementById('editLifeStory').value.trim(),
            DOD_Age: document.getElementById('editDodAge').value.trim(),
            PhotoUrl: document.getElementById('editPhotoUrl').value.trim(),
            PublicId: document.getElementById('editPublicId').value.trim()
        };

        if (!payload.FullName) {
            alert('Full Name is required.');
            return;
        }

        if (!supabase) {
            alert('Supabase not initialized.');
            return;
        }

        try {
            const { data, error } = await supabase
                .from('MemberDataTable')
                .update(payload)
                .eq('PersonalCode', currentMemberData.PersonalCode);
            if (error) throw error;

            alert(`✅ Member "${payload.FullName}" updated successfully!`);
            hideAllPanels();
            isEditMode = false;
            await loadMembers();

        } catch(err) {
            alert(`❌ Error: ${err.message}`);
        }
    });

    // ------------------------------------------------------------
    // 16. UI Helpers
    // ------------------------------------------------------------
    function setButtonLoading(button, isLoading, loadingText) {
        if (!button) return;
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
    // 17. Load Suggestion Data
    // ------------------------------------------------------------
    function loadSuggestionData() {
        const data = localStorage.getItem('suggestionData');
        if (!data) {
            console.log('ℹ️ No suggestion data found in localStorage');
            return false;
        }

        try {
            const suggestion = JSON.parse(data);
            console.log('📋 Loading suggestion data:', suggestion);

            returnToViewRequest = suggestion.returnToViewRequest || false;
            console.log('🔄 Return to ViewRequest:', returnToViewRequest);

            const fieldMapping = {
                'fullName': suggestion.FullName,
                'fullNameEn': suggestion.FullNameEn,
                'gender': suggestion.Gender,
                'address': suggestion.Address,
                'mobile': suggestion.Mobile,
                'email': suggestion.Email,
                'father': suggestion.Father,
                'mother': suggestion.Mother,
                'spouse': suggestion.Spouse,
                'dob': suggestion.DOB,
                'sonsInput': suggestion.Sons,
                'daughtersInput': suggestion.Daughters,
                'profession': suggestion.Profession,
                'qualification': suggestion.Qualification,
                'position': suggestion.Position,
                'detailAddress': suggestion.DetailAddress,
                'detailProfession': suggestion.DetailProfession,
                'lifeStory': suggestion.LifeStory,
                'dodAge': suggestion.DOD_Age
            };

            for (const [fieldId, value] of Object.entries(fieldMapping)) {
                const element = document.getElementById(fieldId);
                if (element) {
                    element.value = value || '';
                } else {
                    console.warn(`⚠️ Element with ID "${fieldId}" not found`);
                }
            }

            if (photoUrlInput) photoUrlInput.value = '';
            if (photoPreview) {
                photoPreview.style.display = 'none';
                photoPreview.src = '';
            }
            if (photoFileNameDisplay) {
                photoFileNameDisplay.textContent = 'कुनै फोटो छानिएको छैन';
            }

            if (suggestion.SuggestionId) {
                editingSuggestionId = suggestion.SuggestionId;
                isEditMode = false;
            }

            if (feedback) {
                let message = '📝 सुझावबाट डाटा लोड गरियो। कृपया जाँच गरी सदस्य थप्नुहोस्। फोटो छुट्टै अपलोड गर्नुहोस्।';
                if (returnToViewRequest) {
                    message += ' एडिट पछि सुझाव पृष्ठमा फर्किनुहुनेछ।';
                }
                feedback.innerHTML = `<span style="color:#0066cc;"><i class="fas fa-info-circle"></i> ${message}</span>`;
            }

            localStorage.removeItem('suggestionData');
            console.log('✅ Suggestion data loaded successfully');

            showPanel('addMemberForm');
            document.getElementById('fullName')?.focus();

            return true;
        } catch (error) {
            console.error('❌ Error loading suggestion data:', error);
            return false;
        }
    }

    function checkForSuggestionData() {
        const data = localStorage.getItem('suggestionData');
        if (data) {
            loadSuggestionData();
        }
    }

    // ------------------------------------------------------------
    // 18. Add Member Form Submit
    // ------------------------------------------------------------
    const form = document.getElementById('addMemberForm');
    const submitBtn = document.getElementById('btnAddMember');
    const resetBtn = document.getElementById('btnReset');

    form?.addEventListener('submit', async function(e) {
        e.preventDefault();

        if (isSubmitting) return;
        isSubmitting = true;

        const personalCode = personalCodeInput?.value.trim();
        const fullName = document.getElementById('fullName').value.trim();

        if (!personalCode || !fullName) {
            if (feedback) feedback.innerHTML = '<span style="color:#b02b2b;"><i class="fas fa-exclamation-triangle"></i> Personal Code and Full Name are required.</span>';
            isSubmitting = false;
            return;
        }

        if (submitBtn) setButtonLoading(submitBtn, true, 'थप्दै...');

        const generation = getGenerationFromCode(personalCode);

        const payload = {
            PersonalCode: personalCode,
            FullName: fullName,
            Gender: document.getElementById('gender').value,
            Address: document.getElementById('address').value.trim(),
            Mobile: document.getElementById('mobile').value.trim(),
            Email: document.getElementById('email').value.trim(),
            Father: document.getElementById('father').value.trim(),
            Mother: document.getElementById('mother').value.trim(),
            Spouse: document.getElementById('spouse').value.trim(),
            DOB: document.getElementById('dob').value.trim(),
            Sons: document.getElementById('sonsInput').value.trim(),
            Daughters: document.getElementById('daughtersInput').value.trim(),
            Profession: document.getElementById('profession').value.trim(),
            Qualification: document.getElementById('qualification').value.trim(),
            Position: document.getElementById('position').value.trim(),
            DetailAddress: document.getElementById('detailAddress').value.trim(),
            DetailProfession: document.getElementById('detailProfession').value.trim(),
            LifeStory: document.getElementById('lifeStory').value.trim(),
            DOD_Age: document.getElementById('dodAge').value.trim(),
            PhotoUrl: document.getElementById('photoUrl').value.trim(),
            PublicId: document.getElementById('publicId').value.trim()
        };

        if (!supabase) {
            if (feedback) feedback.innerHTML = '<span style="color:#b02b2b;">❌ Supabase not initialized.</span>';
            if (submitBtn) setButtonLoading(submitBtn, false);
            isSubmitting = false;
            return;
        }

        try {
            let shouldReturnToViewRequest = false;
            let successMessage = '';

            if (editingSuggestionId && !isEditMode) {
                const { data, error } = await supabase
                    .from('MemberDataTable')
                    .insert([payload]);
                if (error) throw error;
                successMessage = `✅ Member "${fullName}" added from suggestion!`;

                const { error: updateError } = await supabase
                    .from('MemberSuggestionTable')
                    .update({ Status: 'approved' })
                    .eq('id', editingSuggestionId);
                if (updateError) {
                    console.warn('Could not update suggestion status:', updateError);
                }
                editingSuggestionId = null;
                shouldReturnToViewRequest = returnToViewRequest;
            } else if (isEditMode && currentMemberData) {
                const { data, error } = await supabase
                    .from('MemberDataTable')
                    .update(payload)
                    .eq('PersonalCode', currentMemberData.PersonalCode);
                if (error) throw error;
                successMessage = `✅ Member "${fullName}" updated successfully!`;
                isEditMode = false;
                currentMemberData = null;
                shouldReturnToViewRequest = true;
            } else {
                const { data, error } = await supabase
                    .from('MemberDataTable')
                    .insert([payload]);
                if (error) throw error;
                successMessage = `✅ Member "${fullName}" added! Code: ${personalCode} (पुस्ता ${generation})`;
                shouldReturnToViewRequest = false;
            }

            if (feedback) feedback.innerHTML = `<span style="color:#1f7b4d;"><i class="fas fa-check-circle"></i> ${successMessage}</span>`;

            allMembers.push({ PersonalCode: personalCode, FullName: fullName, ...payload });

            const textInputs = form.querySelectorAll('input:not([type="hidden"]):not([readonly]):not([id="personalCode"]), textarea');
            textInputs.forEach(input => {
                if (input.id !== 'personalCode') {
                    input.value = '';
                }
            });

            const selects = form.querySelectorAll('select');
            selects.forEach(select => {
                if (!select.id.startsWith('gen')) {
                    select.selectedIndex = 0;
                }
            });

            sons.length = 0;
            daughters.length = 0;
            renderSons();
            renderDaughters();

            if (photoFileNameDisplay) photoFileNameDisplay.textContent = 'कुनै फोटो छानिएको छैन';
            if (photoPreview) {
                photoPreview.style.display = 'none';
                photoPreview.src = '';
            }
            if (photoUrlInput) photoUrlInput.value = '';
            if (publicIdInput) publicIdInput.value = '';
            if (uploadStatus) uploadStatus.innerHTML = '';
            if (photoFileInput) photoFileInput.value = '';

            refreshDropdowns();

            if (shouldReturnToViewRequest) {
                console.log('🔄 Returning to ViewRequest page...');
                setTimeout(function() {
                    const targetUrl = '../ViewRequestPage/ViewRequestIndex.html';
                    console.log('📍 Redirecting to:', targetUrl);
                    window.location.href = targetUrl;
                }, 1500);
            } else {
                document.getElementById('fullName').focus();
            }

        } catch(err) {
            if (feedback) feedback.innerHTML = `<span style="color:#b02b2b;">❌ Error: ${err.message}</span>`;
        } finally {
            if (submitBtn) setButtonLoading(submitBtn, false);
            isSubmitting = false;
        }
    });

    // ------------------------------------------------------------
    // 19. Reset Button
    // ------------------------------------------------------------
    resetBtn?.addEventListener('click', function(e) {
        e.preventDefault();

        const textInputs = form.querySelectorAll('input:not([type="hidden"]):not([readonly]):not([id="personalCode"]), textarea');
        textInputs.forEach(input => {
            input.value = '';
        });

        const selects = form.querySelectorAll('select');
        selects.forEach(select => {
            if (!select.id.startsWith('gen')) {
                select.selectedIndex = 0;
            }
        });

        if (photoFileNameDisplay) photoFileNameDisplay.textContent = 'कुनै फोटो छानिएको छैन';
        if (photoPreview) {
            photoPreview.style.display = 'none';
            photoPreview.src = '';
        }
        if (photoUrlInput) photoUrlInput.value = '';
        if (publicIdInput) publicIdInput.value = '';
        if (uploadStatus) uploadStatus.innerHTML = '';
        if (photoFileInput) photoFileInput.value = '';

        if (feedback) feedback.innerHTML = '';
        updateCode();
        document.getElementById('fullName').focus();
    });

    // ------------------------------------------------------------
    // 20. Initialize
    // ------------------------------------------------------------
    console.log('🚀 Initializing AddMember page...');

    (async function initialize() {
        try {
            const isAuthenticated = await checkPrivatePageAccess();

            if (!isAuthenticated) {
                console.log('⛔ Authentication failed, stopping initialization');
                return;
            }

            console.log('✅ Authentication successful, loading page...');

            await loadMembers();
            checkForSuggestionData();

            console.log('✅ AddMember.html ready');

        } catch (error) {
            console.error('❌ Initialization error:', error);
            redirectToLogin();
        }
    })();

})();