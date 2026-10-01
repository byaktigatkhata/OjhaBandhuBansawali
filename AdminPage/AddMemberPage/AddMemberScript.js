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

    const MIN_GENERATIONS = 5;
    let generationCount = MIN_GENERATIONS;

    let currentRootLetter = null;
    let currentRootCode = null;
    let isNewFormatMode = false;

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

            if (error) { console.error('Authentication check error:', error); redirectToLogin(); return false; }
            if (!session?.user) { console.log('🚫 No authenticated user found, redirecting...'); redirectToLogin(); return false; }
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
        if (!publicId) return { success: true, skipped: true };
        let cleanId = String(publicId).trim();

        if (cleanId.startsWith('http')) {
            try {
                const parts = cleanId.split('/upload/');
                if (parts[1]) {
                    let afterUpload = parts[1];
                    afterUpload = afterUpload.replace(/^(?:[a-z]+_[a-z0-9]+(?:,[a-z]+_[a-z0-9]+)*\/)+/i, '');
                    afterUpload = afterUpload.replace(/^v\d+\//, '');
                    afterUpload = afterUpload.replace(/\.[a-zA-Z0-9]+(?:\?.*)?$/, '');
                    cleanId = afterUpload;
                }
            } catch (err) { console.warn('⚠️ Could not parse URL:', err); }
        }

        cleanId = cleanId.replace(/^\/+/, '').trim();
        if (!cleanId) return { success: false, error: 'Invalid public_id after normalization' };

        const functionUrl = 'https://icchczijubhzxkjpebps.supabase.co/functions/v1/delete-cloudinary-image';

        try {
            const response = await fetch(functionUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` },
                body: JSON.stringify({ public_id: cleanId })
            });
            const rawText = await response.text();
            let result;
            try { result = JSON.parse(rawText); } catch (_) { result = { success: response.ok, raw: rawText }; }

            if (result.success) return { success: true, result };
            const cloudResult = result.result?.result || result.result;
            if (cloudResult === 'not found') return { success: true, alreadyDeleted: true, result };
            return { success: false, error: result.error || result.message || 'Unknown delete failure', result };
        } catch (error) {
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

        fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`, { method: 'POST', body: formData })
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
            .catch(err => onError(err.message));
    }

    // ------------------------------------------------------------
    // 7. Helper Functions
    // ------------------------------------------------------------
    function isRootCode(code) { return !!code && /^[A-Z]$/.test(String(code).trim()); }

    function isLegacyRootCode(code) {
        if (!code) return false;
        if (isNewFormatMode) return false;
        const c = String(code).trim();
        return /^[A-Z]\.([MF])?\d+m*$/.test(c);
    }

    function isSpouseCode(code) { return !!code && /m+$/.test(String(code).trim()); }

    function getSpouseRank(code) {
        if (!code) return 0;
        const m = String(code).trim().match(/m+$/);
        return m ? m[0].length : 0;
    }

    function getPartnerCode(code) {
        if (!code) return '';
        return String(code).trim().replace(/m+$/, '');
    }

    function getBaseCode(code) {
        if (!code) return '';
        let clean = String(code).trim();
        if (/^[A-Z]$/.test(clean)) return clean;
        if (/m+$/.test(clean)) return getBaseCode(clean.replace(/m+$/, ''));
        clean = clean.replace(/\.([MF])(\d+)$/g, '.$2');
        return clean;
    }

    function getBranchCode(code) { return getBaseCode(code); }

    function getGenderIndex(code) {
        if (!code) return 0;
        const m = String(code).match(/\.([MF])(\d+)$/);
        return m ? parseInt(m[2], 10) : 0;
    }

    function getChildIndex(code) {
        if (!code) return 0;
        let clean = String(code).trim().replace(/m+$/, '');
        const base = getBaseCode(clean);
        const parts = base.split('.');
        const last = parts[parts.length - 1];
        const n = parseInt(last, 10);
        return isNaN(n) ? 0 : n;
    }

    function getGenerationFromCode(code) {
        if (!code) return 0;
        const c = String(code).trim();
        if (/^[A-Z]$/.test(c)) return 0;
        const stripped = c.replace(/m+$/, '');
        if (!isNewFormatMode && /^[A-Z]\.([MF])?\d+$/.test(stripped)) return 0;
        const parts = stripped.split('.');
        return Math.max(0, parts.length - 1);
    }

    function getParentBranch(code) {
        if (!code) return null;
        const c = String(code).trim();
        if (/^[A-Z]$/.test(c)) return null;
        let cleanCode = c.replace(/m+$/, '');
        if (!isNewFormatMode && /^[A-Z]\.([MF])?\d+$/.test(cleanCode)) return null;
        const branch = getBaseCode(cleanCode);
        const parts = branch.split('.');
        if (parts.length <= 1) return null;
        return parts.slice(0, -1).join('.');
    }

    function getDirectChildren(parentCode, members) {
        if (!parentCode) return [];
        const parentBranch = getBaseCode(parentCode);
        return members.filter(m => {
            if (!m || !m.PersonalCode) return false;
            return getParentBranch(m.PersonalCode) === parentBranch;
        }).sort((a, b) => {
            const ai = getChildIndex(a.PersonalCode);
            const bi = getChildIndex(b.PersonalCode);
            if (ai !== bi) return ai - bi;
            const ag = a.PersonalCode.match(/\.([MF])\d+$/)?.[1] || '';
            const bg = b.PersonalCode.match(/\.([MF])\d+$/)?.[1] || '';
            return ag.localeCompare(bg);
        });
    }

    function getNextGenderIndex(branchCode, gender, members) {
        const prefix = branchCode + '.' + gender;
        let maxIdx = 0;
        members.forEach(m => {
            if (m && m.PersonalCode && m.PersonalCode.startsWith(prefix)) {
                const idx = getGenderIndex(m.PersonalCode);
                if (idx > maxIdx) maxIdx = idx;
            }
        });
        return maxIdx + 1;
    }

    function getNextChildNumber(branchCode, members) {
        const prefix = branchCode + '.';
        let maxIdx = 0;
        members.forEach(m => {
            if (!m || !m.PersonalCode || !m.PersonalCode.startsWith(prefix)) return;
            const remainder = m.PersonalCode.substring(prefix.length);
            const first = remainder.split('.')[0];
            if (/^[MF]\d+$/.test(first)) return;
            const n = parseInt(first, 10);
            if (!isNaN(n) && n > maxIdx) maxIdx = n;
        });
        return maxIdx + 1;
    }

    function findRootMember(members) {
        if (!members || members.length === 0) return null;
        const candidates = members.filter(m => {
            if (!m || !m.PersonalCode) return false;
            return getParentBranch(m.PersonalCode) === null;
        });
        if (candidates.length === 0) return null;
        if (candidates.length === 1) return candidates[0];

        const subtreeSize = (rootCode) => {
            const rootBranch = getBaseCode(rootCode);
            return members.filter(m => {
                if (!m || !m.PersonalCode) return false;
                const c = m.PersonalCode;
                if (c === rootCode) return true;
                if (c.startsWith(rootBranch + '.')) return true;
                return false;
            }).length;
        };

        return candidates.reduce((best, cur) => {
            return subtreeSize(cur.PersonalCode) > subtreeSize(best.PersonalCode) ? cur : best;
        });
    }

    function getRootLetterFromCode(rootCode) {
        if (!rootCode) return null;
        const c = String(rootCode).trim();
        if (/^[A-Z]$/.test(c)) return c;
        const m = c.match(/^([A-Z])/);
        return m ? m[1] : null;
    }

    function generateCodeFromSelection(selectedParentCode, members, gender) {
        let parentCode = selectedParentCode;
        if (!parentCode) {
            const root = findRootMember(members);
            if (!root) return 'K';
            parentCode = root.PersonalCode;
        }
        parentCode = getPartnerCode(parentCode);
        const branch = getBaseCode(parentCode);
        if (gender === 'M') return branch + '.M' + getNextGenderIndex(branch, 'M', members);
        if (gender === 'F') return branch + '.F' + getNextGenderIndex(branch, 'F', members);
        return branch + '.' + getNextChildNumber(branch, members);
    }

    function getNextSpouseCode(memberCode, members) {
        const base = String(memberCode).trim();
        const spouseRegex = new RegExp('^' + escapeRegex(base) + 'm+$');
        let maxRank = 0;
        members.forEach(m => {
            if (!m || !m.PersonalCode) return;
            const match = String(m.PersonalCode).trim().match(spouseRegex);
            if (match) {
                const rank = match[0].length - base.length;
                if (rank > maxRank) maxRank = rank;
            }
        });
        return base + 'm'.repeat(maxRank + 1);
    }

    function escapeRegex(s) {
        return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    function getMaxGenerationInMembers(members) {
        if (!members || members.length === 0) return 0;
        let maxGen = 0;
        members.forEach(m => {
            if (!m || !m.PersonalCode) return;
            const gen = getGenerationFromCode(m.PersonalCode);
            if (gen > maxGen) maxGen = gen;
        });
        return maxGen;
    }

    function getSelectedMember() {
        for (let i = generationCount; i >= 1; i--) {
            const sel = document.getElementById(`gen${i}`);
            if (sel && sel.value) {
                const member = allMembers.find(m => m.PersonalCode === sel.value);
                if (member) return member;
            }
        }
        return null;
    }

    function getSelectedCode() {
        for (let i = generationCount; i >= 1; i--) {
            const sel = document.getElementById(`gen${i}`);
            if (sel && sel.value) return sel.value;
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

    function toNepaliOrdinal(n) {
        const words = ['', 'पहिलो', 'दोस्रो', 'तेस्रो', 'चौथो', 'पाँचौं',
                       'छैटौं', 'सातौं', 'आठौं', 'नवौं', 'दशौं'];
        if (n >= 1 && n <= 10) return words[n];
        return n + 'औं';
    }

    function getSonsOf(parentCode, members) {
        const pattern = new RegExp('^' + escapeRegex(parentCode) + '\\.M(\\d+)$');
        return members.filter(m => {
            if (!m || !m.PersonalCode) return false;
            return pattern.test(String(m.PersonalCode).trim());
        }).sort((a, b) => {
            const an = parseInt(a.PersonalCode.match(/\.M(\d+)$/)[1], 10);
            const bn = parseInt(b.PersonalCode.match(/\.M(\d+)$/)[1], 10);
            return an - bn;
        });
    }

    // ------------------------------------------------------------
    // 8. Build Generation Dropdowns
    // ------------------------------------------------------------
    const genContainer = document.getElementById('genDropdownsContainer');
    const stickyTopBar = document.getElementById('stickyTopBar');
    let genSelects = [];

    function buildGenerationDropdowns(count) {
        if (!genContainer) return;
        if (count < 1) {
            if (stickyTopBar) stickyTopBar.classList.add('is-empty');
            genContainer.innerHTML = '';
            genSelects = [];
            return;
        }
        if (stickyTopBar) stickyTopBar.classList.remove('is-empty');

        const previousSelections = {};
        genSelects.forEach((sel, idx) => { previousSelections[idx] = sel.value; });

        genContainer.innerHTML = '';
        genSelects = [];

        for (let i = 1; i <= count; i++) {
            const labelText = (i === 1) ? 'मूल' : `पुस्ता ${i - 1}`;
            const wrapper = document.createElement('div');
            wrapper.className = 'gen-select';
            wrapper.innerHTML = `<label>${labelText}</label><select id="gen${i}"><option value="">छान्नुहोस्</option></select>`;
            genContainer.appendChild(wrapper);
            const select = wrapper.querySelector('select');
            genSelects.push(select);

            select.addEventListener('change', function() {
                const currentIndex = genSelects.indexOf(this);
                for (let j = currentIndex + 1; j < genSelects.length; j++) {
                    genSelects[j].innerHTML = '<option value="">छान्नुहोस्</option>';
                }
                if (this.value) populateNextGenDropdown(currentIndex, this.value);
                updateCode();
            });

            if (previousSelections[i - 1]) {
                select.dataset.previousValue = previousSelections[i - 1];
            }
        }
    }

    function populateNextGenDropdown(currentIndex, selectedCode) {
        const nextIndex = currentIndex + 1;
        if (nextIndex >= genSelects.length) return;
        const nextSelect = genSelects[nextIndex];
        const children = getDirectChildren(selectedCode, allMembers);
        const currentValue = nextSelect.value;
        nextSelect.innerHTML = '<option value="">छान्नुहोस्</option>';
        children.forEach(child => {
            const opt = document.createElement('option');
            opt.value = child.PersonalCode;
            opt.textContent = formatMemberLabel(child);
            nextSelect.appendChild(opt);
        });
        if (currentValue && nextSelect.querySelector(`option[value="${currentValue}"]`)) {
            nextSelect.value = currentValue;
        }
    }

    function formatMemberLabel(member) {
        const code = member.PersonalCode;
        const rank = getSpouseRank(code);
        let genderEmoji = '';
        let spouseLabel = '';

        if (rank > 0) {
            if (member.Gender === 'F') genderEmoji = '♀️ ';
            else if (member.Gender === 'M') genderEmoji = '♂️ ';
            if (rank === 1) spouseLabel = '👰 ';
            else if (rank === 2) spouseLabel = '👰(२) ';
            else if (rank === 3) spouseLabel = '👰(३) ';
            else spouseLabel = `👰(${rank}) `;
        } else if (/\.M\d+$/.test(code)) {
            genderEmoji = '♂️ ';
        } else if (/\.F\d+$/.test(code)) {
            genderEmoji = '♀️ ';
        } else if (isRootCode(code) || isLegacyRootCode(code)) {
            genderEmoji = (member.Gender === 'F') ? '♀️ ' : '♂️ ';
        }

        return `${spouseLabel}${genderEmoji}${code} - ${member.FullName}`;
    }

    function populateRootDropdown() {
        const rootSelect = document.getElementById('gen1');
        if (!rootSelect) return;
        const currentValue = rootSelect.value || rootSelect.dataset.previousValue || '';
        rootSelect.innerHTML = '<option value="">छान्नुहोस्</option>';

        const roots = allMembers.filter(m => {
            if (!m || !m.PersonalCode) return false;
            return getParentBranch(m.PersonalCode) === null;
        }).sort((a, b) => {
            const aN = getChildIndex(a.PersonalCode);
            const bN = getChildIndex(b.PersonalCode);
            if (aN !== bN) return aN - bN;
            return String(a.PersonalCode).localeCompare(String(b.PersonalCode));
        });

        roots.forEach(m => {
            const opt = document.createElement('option');
            opt.value = m.PersonalCode;
            opt.textContent = formatMemberLabel(m);
            rootSelect.appendChild(opt);
        });

        if (currentValue && rootSelect.querySelector(`option[value="${currentValue}"]`)) {
            rootSelect.value = currentValue;
        }
    }

    function refreshDropdowns() {
        const selections = {};
        genSelects.forEach((sel, index) => { selections[index] = sel.value; });

        populateRootDropdown();

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
        const selectedParentCode = getSelectedCode();
        const gender = document.getElementById('gender')?.value || 'M';
        const code = generateCodeFromSelection(selectedParentCode, allMembers, gender);
        if (personalCodeInput) personalCodeInput.value = code;
        if (genBadge) genBadge.textContent = `पुस्ता ${getGenerationFromCode(code)}`;
    }

    document.getElementById('gender')?.addEventListener('change', updateCode);

    buildGenerationDropdowns(MIN_GENERATIONS);

    // ============================================================
    // 11. PANEL MANAGEMENT
    // ============================================================
    const PANELS = {
        addMemberForm: document.getElementById('addMemberForm'),
        spouseModal:   document.getElementById('spouseModal'),
        editModal:     document.getElementById('editModal')
    };

    const TOGGLE_BTNS = {
        addMemberForm:    document.getElementById('toggleAddFormBtn'),
        spouseBtn:        document.getElementById('addSpouseBtn'),
        editBtn:          document.getElementById('editMemberBtn'),
        addGenerationBtn: document.getElementById('addGenerationBtn')
    };

    function showPanel(panelId) {
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

        if (TOGGLE_BTNS.addMemberForm) TOGGLE_BTNS.addMemberForm.classList.toggle('active', panelId === 'addMemberForm');
        if (TOGGLE_BTNS.spouseBtn)     TOGGLE_BTNS.spouseBtn.classList.toggle('active', panelId === 'spouseModal');
        if (TOGGLE_BTNS.editBtn)       TOGGLE_BTNS.editBtn.classList.toggle('active', panelId === 'editModal');
        if (TOGGLE_BTNS.ancestorBtn)   TOGGLE_BTNS.ancestorBtn.classList.toggle('active', panelId === 'ancestorPanel');
        if (TOGGLE_BTNS.removeRootBtn) TOGGLE_BTNS.removeRootBtn.classList.toggle('active', panelId === 'removeRootPanel');

        if (panelId && PANELS[panelId]) {
            setTimeout(() => {
                PANELS[panelId].scrollIntoView({ behavior: 'smooth', block: 'start' });
            }, 50);
        }
    }

    function hideAllPanels() { showPanel(null); }
    hideAllPanels();

    TOGGLE_BTNS.addMemberForm?.addEventListener('click', function (e) {
        e.preventDefault(); e.stopPropagation();
        const active = PANELS.addMemberForm?.classList.contains('is-active');
        if (active) hideAllPanels(); else showPanel('addMemberForm');
    });

    document.querySelectorAll('.panel-close-btn').forEach(btn => {
        btn.addEventListener('click', function (e) {
            e.preventDefault(); e.stopPropagation();
            const targetId = this.dataset.close;
            if (targetId === 'editModal') isEditMode = false;
            hideAllPanels();
        });
    });

    TOGGLE_BTNS.addGenerationBtn?.addEventListener('click', function(e) {
        e.preventDefault(); e.stopPropagation();
        generationCount++;
        buildGenerationDropdowns(generationCount);
        if (allMembers.length > 0) refreshDropdowns(); else updateCode();
        const feedbackEl = document.getElementById('formFeedback');
        if (feedbackEl) {
            feedbackEl.innerHTML = `<span style="color:#0066cc;"><i class="fas fa-info-circle"></i> पुस्ता थपियो। अब कुल ${generationCount - 1} पुस्ता छन्।</span>`;
            setTimeout(() => { if (feedbackEl.innerHTML.includes('पुस्ता थपियो')) feedbackEl.innerHTML = ''; }, 3000);
        }
    });

    // ============================================================
    // 12. Sons & Daughters management (form)
    // ============================================================
    const sonInput      = document.getElementById('sonInput');
    const daughterInput = document.getElementById('daughterInput');
    const sonList       = document.getElementById('sonList');
    const daughterList  = document.getElementById('daughterList');

    function renderSons() {
        if (!sonList) return;
        sonList.innerHTML = sons.map((name, idx) =>
            `<span class="tag">${name} <i class="fas fa-times" data-index="${idx}" data-type="son"></i></span>`
        ).join('');
        sonList.querySelectorAll('.tag i').forEach(el => {
            el.addEventListener('click', function() {
                sons.splice(parseInt(this.dataset.index), 1); renderSons();
            });
        });
    }
    function renderDaughters() {
        if (!daughterList) return;
        daughterList.innerHTML = daughters.map((name, idx) =>
            `<span class="tag">${name} <i class="fas fa-times" data-index="${idx}" data-type="daughter"></i></span>`
        ).join('');
        daughterList.querySelectorAll('.tag i').forEach(el => {
            el.addEventListener('click', function() {
                daughters.splice(parseInt(this.dataset.index), 1); renderDaughters();
            });
        });
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
    // 13. Cloudinary Upload for Add Member Form
    // ============================================================
    const photoFileInput        = document.getElementById('photoFile');
    const photoPreview          = document.getElementById('photoPreview');
    const photoUrlInput         = document.getElementById('photoUrl');
    const publicIdInput         = document.getElementById('publicId');
    const uploadStatus          = document.getElementById('uploadStatus');
    const uploadBtn             = document.getElementById('uploadToCloudinaryBtn');
    const photoFileNameDisplay  = document.getElementById('photoFileNameDisplay');

    uploadBtn?.addEventListener('click', function(e) {
        e.preventDefault(); e.stopPropagation();
        if (photoFileInput) photoFileInput.click();
    });

    photoFileInput?.addEventListener('change', function() {
        if (!this.files || !this.files[0]) return;
        const originalFile = this.files[0];
        if (photoFileNameDisplay) photoFileNameDisplay.textContent = originalFile.name;

        PhotoCropper.open(
            originalFile,
            { aspect: 3 / 4, title: 'फोटो क्रप गर्नुहोस् (3:4)' },
            async (croppedBlob) => {
                const previewUrl = URL.createObjectURL(croppedBlob);
                if (photoPreview) { photoPreview.src = previewUrl; photoPreview.style.display = 'block'; }
                if (uploadStatus) uploadStatus.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Uploading...';

                return new Promise((resolve) => {
                    uploadToCloudinary(
                        croppedBlob,
                        (url, publicId) => {
                            if (photoUrlInput) photoUrlInput.value = url;
                            if (publicIdInput) publicIdInput.value = publicId;
                            if (photoPreview) photoPreview.src = url;
                            if (uploadStatus) uploadStatus.innerHTML = `<span style="color:#1f7b4d;">✅ Uploaded!</span>`;
                            setTimeout(() => URL.revokeObjectURL(previewUrl), 3000);
                            resolve();
                        },
                        (error) => {
                            if (uploadStatus) uploadStatus.innerHTML = `<span style="color:#b02b2b;">❌ Error: ${error}</span>`;
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
    // 14. Load Members
    // ============================================================
    async function loadMembers() {
        if (!supabase) {
            allMembers = []; generationCount = MIN_GENERATIONS;
            buildGenerationDropdowns(generationCount);
            refreshDropdowns(); updateCode();
            return;
        }

        try {
            const { data, error } = await supabase.from('MemberDataTable').select('*');
            if (error) throw error;

            if (!data || data.length === 0) {
                allMembers = []; generationCount = MIN_GENERATIONS;
                buildGenerationDropdowns(generationCount);
                refreshDropdowns(); updateCode();
                updateAncestorButtonState();
                updateRemoveRootButtonState();
                return;
            }

            allMembers = data;
            console.log('✅ Loaded', allMembers.length, 'members');

            isNewFormatMode = allMembers.some(m =>
                m && m.PersonalCode && /^[A-Z]$/.test(String(m.PersonalCode).trim())
            );
            console.log('📐 Format mode:', isNewFormatMode ? 'NEW' : 'LEGACY');

            const roots = allMembers.filter(m => getParentBranch(m.PersonalCode) === null);
            console.log('🔍 Root candidates:', roots.length, roots.map(r => r.PersonalCode + ' (' + r.FullName + ')'));

            const root = findRootMember(allMembers);
            currentRootCode = root ? root.PersonalCode : null;
            currentRootLetter = root ? getRootLetterFromCode(root.PersonalCode) : null;
            console.log('🌳 Root:', currentRootCode, '| Letter:', currentRootLetter);

            updateAncestorButtonState();
            updateRemoveRootButtonState();

            const maxGenInDb = getMaxGenerationInMembers(allMembers);
            generationCount = Math.max(maxGenInDb + 1, MIN_GENERATIONS);

            buildGenerationDropdowns(generationCount);
            refreshDropdowns(); updateCode();
            updateAncestorPreview();
            updateRemoveRootPreview();

        } catch(e) {
            console.warn('Could not load members:', e);
            allMembers = []; generationCount = MIN_GENERATIONS;
            buildGenerationDropdowns(generationCount);
            refreshDropdowns(); updateCode();
            updateAncestorButtonState();
            updateRemoveRootButtonState();
        }
    }

    // ============================================================
    // 15. Add Spouse (unchanged logic)
    // ============================================================
    const feedback = document.getElementById('formFeedback');

    TOGGLE_BTNS.spouseBtn?.addEventListener('click', function(e) {
        e.preventDefault(); e.stopPropagation();

        if (PANELS.spouseModal?.classList.contains('is-active')) { hideAllPanels(); return; }
        showPanel('spouseModal');

        const selectedMember = getSelectedMember();
        if (!selectedMember) {
            if (feedback) feedback.innerHTML = '<span style="color:#b02b2b;"><i class="fas fa-exclamation-triangle"></i> कृपया पहिले माथिको ड्रपडाउनबाट एक सदस्य छान्नुहोस्।</span>';
            document.getElementById('spouseOfDisplay').textContent = '— कुनै सदस्य छानिएको छैन —';
            document.getElementById('spouseOf').value = '';
            document.getElementById('spouseCodeDisplay').textContent = '—';
            document.getElementById('spouseCode').value = '';
            document.getElementById('spouseModalTitle').textContent = 'श्रीमान/श्रीमती थप्नुहोस्';
            document.getElementById('spouseOfLabel').textContent = 'कस्को श्रीमान/श्रीमती';
            window._spousePhotoUrl = null; window._spousePhotoPublicId = null;
            return;
        }

        if (isSpouseCode(selectedMember.PersonalCode)) {
            if (feedback) feedback.innerHTML = '<span style="color:#b02b2b;"><i class="fas fa-exclamation-triangle"></i> यो पहिले नै श्रीमान/श्रीमतीको प्रविष्टि हो।</span>';
            return;
        }

        const partnerCode = selectedMember.PersonalCode;
        const nextSpouseCode = getNextSpouseCode(partnerCode, allMembers);
        const existingSpouses = allMembers.filter(m =>
            m.PersonalCode && new RegExp('^' + escapeRegex(partnerCode) + 'm+$').test(String(m.PersonalCode).trim())
        );
        const wifeNumber = existingSpouses.length + 1;
        const gender = selectedMember.Gender || 'M';
        let spouseLabel = 'श्रीमान/श्रीमती';
        let modalTitle = 'श्रीमान/श्रीमती थप्नुहोस्';

        if (gender === 'M') {
            spouseLabel = existingSpouses.length === 0 ? 'श्रीमती (Wife of)' : `श्रीमती #${wifeNumber}`;
            modalTitle = existingSpouses.length === 0 ? 'श्रीमती थप्नुहोस्' : `श्रीमती #${wifeNumber} थप्नुहोस्`;
        } else if (gender === 'F') {
            spouseLabel = existingSpouses.length === 0 ? 'श्रीमान (Husband of)' : `श्रीमान #${wifeNumber}`;
            modalTitle = existingSpouses.length === 0 ? 'श्रीमान थप्नुहोस्' : `श्रीमान #${wifeNumber} थप्नुहोस्`;
        }

        document.getElementById('spouseOfLabel').textContent = spouseLabel;
        document.getElementById('spouseModalTitle').textContent = modalTitle;
        document.getElementById('spouseOfDisplay').textContent =
            `${selectedMember.FullName} (${selectedMember.PersonalCode})` +
            (existingSpouses.length > 0 ? ` — पहिले नै ${existingSpouses.length} छन्` : '');
        document.getElementById('spouseOf').value = selectedMember.FullName + ' (' + selectedMember.PersonalCode + ')';
        document.getElementById('spouseCode').value = nextSpouseCode;
        document.getElementById('spouseCodeDisplay').textContent = nextSpouseCode;

        document.getElementById('spouseForm').reset();
        document.getElementById('spousePhotoPreview').style.display = 'none';
        window._spousePhotoUrl = null; window._spousePhotoPublicId = null;
        if (feedback) feedback.innerHTML = '';
    });

    document.getElementById('closeSpouseModal')?.addEventListener('click', (e) => { e.preventDefault(); hideAllPanels(); });
    document.getElementById('closeSpouseModalBtn')?.addEventListener('click', (e) => { e.preventDefault(); hideAllPanels(); });

    document.getElementById('spousePhotoBtn')?.addEventListener('click', function(e) {
        e.preventDefault(); e.stopPropagation();
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
                previewEl.src = previewUrl; previewEl.style.display = 'block';

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
                        (error) => { alert('फोटो अपलोड असफल: ' + error); resolve(); },
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
        const fullName  = document.getElementById('spouseFullName').value.trim();

        if (!spouseCode) { alert('कृपया पहिले माथिको ड्रपडाउनबाट एक सदस्य छान्नुहोस्।'); return; }
        if (!fullName)   { alert('कृपया श्रीमान/श्रीमतीको नाम प्रविष्ट गर्नुहोस्।'); return; }
        if (allMembers.some(m => m.PersonalCode === spouseCode)) {
            alert(`❌ कोड "${spouseCode}" पहिले नै अवस्थित छ।`); return;
        }

        const submitBtn = document.getElementById('addSpouseModalBtn');
        if (submitBtn) setButtonLoading(submitBtn, true, 'थप्दै...');

        try {
            const payload = {
                PersonalCode: spouseCode, FullName: fullName,
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
            if (!supabase) { alert('Supabase initialized छैन।'); return; }
            const { error } = await supabase.from('MemberDataTable').insert([payload]);
            if (error) throw error;
            alert(`✅ श्रीमान/श्रीमती "${fullName}" थपियो! Code: ${spouseCode}`);
            window._spousePhotoUrl = null; window._spousePhotoPublicId = null;
            hideAllPanels(); await loadMembers();
        } catch(err) {
            alert(`❌ Error: ${err.message}`);
        } finally {
            if (submitBtn) setButtonLoading(submitBtn, false);
        }
    });

    // ============================================================
    // 16. Edit Member (unchanged)
    // ============================================================
    TOGGLE_BTNS.editBtn?.addEventListener('click', function(e) {
        e.preventDefault(); e.stopPropagation();
        if (PANELS.editModal?.classList.contains('is-active')) { hideAllPanels(); isEditMode = false; return; }
        showPanel('editModal');

        const selectedMember = getSelectedMember();
        if (!selectedMember) {
            if (feedback) feedback.innerHTML = '<span style="color:#b02b2b;"><i class="fas fa-exclamation-triangle"></i> कृपया पहिले एक सदस्य छान्नुहोस्।</span>';
            ['editCode','editFullName','editAddress','editMobile','editEmail','editFather',
             'editMother','editSpouse','editDob','editSons','editDaughters','editProfession',
             'editQualification','editPosition','editDetailAddress','editDetailProfession',
             'editLifeStory','editDodAge','editPhotoUrl','editPublicId'].forEach(id => {
                const el = document.getElementById(id); if (el) el.value = '';
            });
            document.getElementById('editGender').value = 'M';
            document.getElementById('editPhotoPreview').style.display = 'none';
            document.getElementById('editPhotoFileName').textContent = 'कुनै फोटो छैन';
            document.getElementById('editPhotoFileNameDisplay').textContent = 'कुनै फोटो छैन';
            document.getElementById('editUploadStatus').innerHTML = '';
            document.getElementById('editDeleteStatus').innerHTML = '';
            currentMemberData = null; isEditMode = false;
            return;
        }

        currentMemberData = selectedMember; isEditMode = true;
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
            document.getElementById('editPhotoFileNameDisplay').textContent = 'कुनै फोटो छैन';
        }

        document.getElementById('editPhotoFile').value = '';
        document.getElementById('editUploadStatus').innerHTML = '';
        document.getElementById('editDeleteStatus').innerHTML = '';
        window._editCroppedBlob = null; window._editCroppedName = null;
        if (feedback) feedback.innerHTML = '';
    });

    document.getElementById('editPhotoBtn')?.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); document.getElementById('editPhotoFile').click(); });

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
                previewImg.src = previewUrl; previewImg.style.display = 'block';

                if (oldPublicId) {
                    deleteEl.innerHTML = '<i class="fas fa-spinner fa-spin"></i> पुरानो फोटो मेटाउँदै...';
                    try {
                        const delResult = await deleteFromCloudinary(oldPublicId);
                        if (delResult.success) {
                            deleteEl.innerHTML = delResult.alreadyDeleted ? '<span style="color:#155724;">ℹ️ पहिले नै मेटिएको</span>' : '<span style="color:#155724;">✅ मेटियो</span>';
                        } else {
                            deleteEl.innerHTML = '<span style="color:#856404;">⚠️ मेट्न सकिएन</span>';
                        }
                    } catch (err) { deleteEl.innerHTML = '<span style="color:#856404;">⚠️ ' + err.message + '</span>'; }
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
                            statusEl.innerHTML = '<span style="color:#b02b2b;">❌ ' + error + '</span>';
                            const oldUrl = document.getElementById('editPhotoUrl').value;
                            if (oldUrl) previewImg.src = toPortrait3x4Url(oldUrl);
                            resolve();
                        },
                        originalFile.name
                    );
                });
            }
        );
        this.value = '';
    });

    document.getElementById('closeEditModal')?.addEventListener('click', (e) => { e.preventDefault(); hideAllPanels(); isEditMode = false; });
    document.getElementById('closeEditModalBtn')?.addEventListener('click', (e) => { e.preventDefault(); hideAllPanels(); isEditMode = false; });

    document.getElementById('editForm')?.addEventListener('submit', async function(e) {
        e.preventDefault();
        if (!currentMemberData) { alert('कृपया पहिले एक सदस्य छान्नुहोस्।'); return; }

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

        if (!payload.FullName) { alert('Full Name is required.'); return; }
        if (!supabase) { alert('Supabase not initialized.'); return; }

        try {
            const { error } = await supabase.from('MemberDataTable').update(payload).eq('PersonalCode', currentMemberData.PersonalCode);
            if (error) throw error;
            alert(`✅ Member "${payload.FullName}" updated successfully!`);
            hideAllPanels(); isEditMode = false;
            await loadMembers();
        } catch(err) { alert(`❌ Error: ${err.message}`); }
    });

    // ------------------------------------------------------------
    // 17. UI Helpers
    // ------------------------------------------------------------
    function setButtonLoading(button, isLoading, loadingText) {
        if (!button) return;
        if (isLoading) {
            button.disabled = true;
            button._originalText = button.innerHTML;
            button.innerHTML = `<i class="fas fa-spinner fa-spin"></i> ${loadingText || 'Processing...'}`;
            button.style.opacity = '0.7'; button.style.cursor = 'wait';
        } else {
            button.disabled = false;
            button.innerHTML = button._originalText || button.innerHTML;
            button.style.opacity = '1'; button.style.cursor = 'pointer';
        }
    }

    // ------------------------------------------------------------
    // 18. Load Suggestion Data
    // ------------------------------------------------------------
    function loadSuggestionData() {
        const data = localStorage.getItem('suggestionData');
        if (!data) return false;

        try {
            const suggestion = JSON.parse(data);
            returnToViewRequest = suggestion.returnToViewRequest || false;
            const fieldMapping = {
                'fullName': suggestion.FullName, 'fullNameEn': suggestion.FullNameEn,
                'gender': suggestion.Gender, 'address': suggestion.Address,
                'mobile': suggestion.Mobile, 'email': suggestion.Email,
                'father': suggestion.Father, 'mother': suggestion.Mother,
                'spouse': suggestion.Spouse, 'dob': suggestion.DOB,
                'sonsInput': suggestion.Sons, 'daughtersInput': suggestion.Daughters,
                'profession': suggestion.Profession, 'qualification': suggestion.Qualification,
                'position': suggestion.Position, 'detailAddress': suggestion.DetailAddress,
                'detailProfession': suggestion.DetailProfession, 'lifeStory': suggestion.LifeStory,
                'dodAge': suggestion.DOD_Age
            };
            for (const [fieldId, value] of Object.entries(fieldMapping)) {
                const element = document.getElementById(fieldId);
                if (element) element.value = value || '';
            }
            if (photoUrlInput) photoUrlInput.value = '';
            if (photoPreview) { photoPreview.style.display = 'none'; photoPreview.src = ''; }
            if (photoFileNameDisplay) photoFileNameDisplay.textContent = 'कुनै फोटो छानिएको छैन';
            if (suggestion.SuggestionId) { editingSuggestionId = suggestion.SuggestionId; isEditMode = false; }
            if (feedback) feedback.innerHTML = `<span style="color:#0066cc;"><i class="fas fa-info-circle"></i> 📝 सुझावबाट डाटा लोड गरियो।</span>`;
            localStorage.removeItem('suggestionData');
            showPanel('addMemberForm');
            document.getElementById('fullName')?.focus();
            return true;
        } catch (error) { console.error('❌ Error loading suggestion:', error); return false; }
    }
    function checkForSuggestionData() { if (localStorage.getItem('suggestionData')) loadSuggestionData(); }

    // ------------------------------------------------------------
    // 19. Add Member Form Submit
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
            if (feedback) feedback.innerHTML = '<span style="color:#b02b2b;"><i class="fas fa-exclamation-triangle"></i> Personal Code and Full Name required.</span>';
            isSubmitting = false; return;
        }

        if (submitBtn) setButtonLoading(submitBtn, true, 'थप्दै...');
        const generation = getGenerationFromCode(personalCode);

        const payload = {
            PersonalCode: personalCode, FullName: fullName,
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
            isSubmitting = false; return;
        }

        try {
            let shouldReturnToViewRequest = false;
            let successMessage = '';

            if (editingSuggestionId && !isEditMode) {
                const { error } = await supabase.from('MemberDataTable').insert([payload]);
                if (error) throw error;
                successMessage = `✅ Member "${fullName}" added from suggestion!`;
                const { error: updateError } = await supabase.from('MemberSuggestionTable').update({ Status: 'approved' }).eq('id', editingSuggestionId);
                if (updateError) console.warn('Could not update suggestion:', updateError);
                editingSuggestionId = null; shouldReturnToViewRequest = returnToViewRequest;
            } else if (isEditMode && currentMemberData) {
                const { error } = await supabase.from('MemberDataTable').update(payload).eq('PersonalCode', currentMemberData.PersonalCode);
                if (error) throw error;
                successMessage = `✅ Member "${fullName}" updated!`;
                isEditMode = false; currentMemberData = null;
                shouldReturnToViewRequest = true;
            } else {
                const { error } = await supabase.from('MemberDataTable').insert([payload]);
                if (error) throw error;
                successMessage = `✅ Member "${fullName}" added! Code: ${personalCode}`;
            }

            if (feedback) feedback.innerHTML = `<span style="color:#1f7b4d;"><i class="fas fa-check-circle"></i> ${successMessage}</span>`;
            allMembers.push({ PersonalCode: personalCode, FullName: fullName, ...payload });

            form.querySelectorAll('input:not([type="hidden"]):not([readonly]):not([id="personalCode"]), textarea')
                .forEach(input => { if (input.id !== 'personalCode') input.value = ''; });
            form.querySelectorAll('select').forEach(select => { if (!select.id.startsWith('gen')) select.selectedIndex = 0; });
            sons.length = 0; daughters.length = 0;
            renderSons(); renderDaughters();

            if (photoFileNameDisplay) photoFileNameDisplay.textContent = 'कुनै फोटो छानिएको छैन';
            if (photoPreview) { photoPreview.style.display = 'none'; photoPreview.src = ''; }
            if (photoUrlInput) photoUrlInput.value = '';
            if (publicIdInput) publicIdInput.value = '';
            if (uploadStatus) uploadStatus.innerHTML = '';
            if (photoFileInput) photoFileInput.value = '';

            const maxGenNow = Math.max(getMaxGenerationInMembers(allMembers), MIN_GENERATIONS - 1);
            const newCount = Math.max(maxGenNow + 1, MIN_GENERATIONS);
            if (newCount > generationCount) {
                generationCount = newCount;
                buildGenerationDropdowns(generationCount);
            }
            refreshDropdowns();

            if (shouldReturnToViewRequest) {
                setTimeout(() => { window.location.href = '../ViewRequestPage/ViewRequestIndex.html'; }, 1500);
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
    // 20. Reset Button
    // ------------------------------------------------------------
    resetBtn?.addEventListener('click', function(e) {
        e.preventDefault();
        form.querySelectorAll('input:not([type="hidden"]):not([readonly]):not([id="personalCode"]), textarea')
            .forEach(input => { input.value = ''; });
        form.querySelectorAll('select').forEach(select => { if (!select.id.startsWith('gen')) select.selectedIndex = 0; });

        if (photoFileNameDisplay) photoFileNameDisplay.textContent = 'कुनै फोटो छानिएको छैन';
        if (photoPreview) { photoPreview.style.display = 'none'; photoPreview.src = ''; }
        if (photoUrlInput) photoUrlInput.value = '';
        if (publicIdInput) publicIdInput.value = '';
        if (uploadStatus) uploadStatus.innerHTML = '';
        if (photoFileInput) photoFileInput.value = '';
        if (feedback) feedback.innerHTML = '';
        updateCode();
        document.getElementById('fullName')?.focus();
    });

    // ============================================================
    // 21. ADD ANCESTOR
    // ============================================================
    function injectAncestorUI() {
        const actionBox = document.getElementById('ActionButtonBox');
        if (actionBox && !document.getElementById('addAncestorBtn')) {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.id = 'addAncestorBtn';
            btn.className = 'action-btn action-btn-orange';
            btn.innerHTML = '<i class="fas fa-arrow-up"></i> पुर्खा थप्नुहोस्';
            actionBox.appendChild(btn);
            TOGGLE_BTNS.ancestorBtn = btn;
        }

        const container = document.querySelector('.container');
        const footer = document.getElementById('FooterBox');
        if (container && !document.getElementById('ancestorPanel')) {
            const panel = document.createElement('div');
            panel.id = 'ancestorPanel'; panel.className = 'inline-panel';
            panel.innerHTML = `
                <div class="panel-header">
                    <h2><i class="fas fa-arrow-up"></i> पुर्खा (अघिल्लो पुस्ता) थप्नुहोस्</h2>
                    <button type="button" class="panel-close-btn" data-close="ancestorPanel"><i class="fas fa-times"></i></button>
                </div>
                <div class="form-group">
                    <label><i class="fas fa-info-circle"></i> हालको अवस्था</label>
                    <div id="ancestorInfoBox" class="info-box">
                        हालको मूल व्यक्ति: <strong id="ancestorCurrentRoot">—</strong><br>
                        कुल सदस्यहरू: <strong id="ancestorMemberCount">0</strong>
                    </div>
                </div>
                <form id="ancestorForm">
                    <div class="form-grid">
                        <div class="form-group">
                            <label><i class="fas fa-user"></i> पुर्खाको पुरा नामः *</label>
                            <input type="text" id="ancestorName" placeholder="जस्तोः बलराम ओझा" required />
                        </div>
                        <div class="form-group">
                            <label><i class="fas fa-font"></i> कोडको सुरुको अक्षरः *</label>
                            <input type="text" id="ancestorLetter" placeholder="जस्तोः B" maxlength="1" required style="text-transform:uppercase;" />
                        </div>
                        <div class="form-group">
                            <label><i class="fas fa-sort-numeric-up"></i> हालको मूल व्यक्तिको स्थानः *</label>
                            <input type="number" id="ancestorPosition" placeholder="जस्तोः 3" min="1" required />
                        </div>
                        <div class="form-group full-width">
                            <label><i class="fas fa-eye"></i> पूर्वावलोकन</label>
                            <div id="ancestorPreview">
                                केही टाइप गर्नुहोस्...
                            </div>
                        </div>
                    </div>
                    <div class="btn-group">
                        <button type="button" id="cancelAncestorBtn">रद्ध गर्नुहोस्</button>
                        <button type="submit" id="confirmAncestorBtn"><i class="fas fa-check"></i> पुष्टि गर्नुहोस्</button>
                    </div>
                </form>
            `;
            if (footer) container.insertBefore(panel, footer); else container.appendChild(panel);
            PANELS.ancestorPanel = panel;
        }
    }

    function updateAncestorButtonState() {
        const btn = document.getElementById('addAncestorBtn');
        if (!btn) return;
        if (currentRootCode) { btn.disabled = false; btn.style.opacity = '1'; btn.style.cursor = 'pointer'; }
        else { btn.disabled = true; btn.style.opacity = '0.5'; btn.style.cursor = 'not-allowed'; }
    }

    function computeAncestorMigration(oldRootCode, newLetter, position) {
        const oldPrefix = oldRootCode + '.';
        const newPrefix = newLetter + '.' + position + '.';
        const oldRootSpouseRegex = new RegExp('^' + escapeRegex(oldRootCode) + 'm+$');
        const map = {};

        allMembers.forEach(m => {
            if (!m || !m.PersonalCode) return;
            const code = String(m.PersonalCode).trim();
            if (code === oldRootCode) {
                map[code] = newLetter + '.M' + position;
            } else if (oldRootSpouseRegex.test(code)) {
                const ms = code.substring(oldRootCode.length);
                map[code] = newLetter + '.M' + position + ms;
            } else if (code.startsWith(oldPrefix)) {
                map[code] = newPrefix + code.substring(oldPrefix.length);
            }
        });
        return map;
    }

    function updateAncestorPreview() {
        const nameEl = document.getElementById('ancestorName');
        const letterEl = document.getElementById('ancestorLetter');
        const posEl = document.getElementById('ancestorPosition');
        const previewEl = document.getElementById('ancestorPreview');
        const rootEl = document.getElementById('ancestorCurrentRoot');
        const countEl = document.getElementById('ancestorMemberCount');
        if (!previewEl) return;

        if (rootEl) {
            const root = findRootMember(allMembers);
            rootEl.textContent = root ? `${root.PersonalCode} (${root.FullName || ''})` : '—';
        }
        if (countEl) countEl.textContent = allMembers.length;
        if (!currentRootCode) { previewEl.innerHTML = '<span style="color:#b02b2b;">कुनै मूल व्यक्ति भेटिएन।</span>'; return; }

        const letter = (letterEl?.value || '').trim().toUpperCase();
        const position = parseInt((posEl?.value || '').trim(), 10);

        if (!letter) { previewEl.innerHTML = 'कृपया नयाँ अक्षर लेख्नुहोस्।'; return; }
        if (!/^[A-Z]$/.test(letter)) { previewEl.innerHTML = 'A–Z को एक अक्षर।'; return; }
        if (letter === currentRootLetter) { previewEl.innerHTML = '<span style="color:#b02b2b;">नयाँ अक्षर फरक हुनुपर्छ।</span>'; return; }
        if (isNaN(position) || position < 1) { previewEl.innerHTML = '१ वा सो भन्दा ठूलो संख्या।'; return; }

        const map = computeAncestorMigration(currentRootCode, letter, position);
        const entries = Object.entries(map);
        const collisions = entries.filter(([oldCode, newCode]) =>
            allMembers.some(m => m.PersonalCode === newCode && m.PersonalCode !== oldCode)
        );

        const elderCount = Math.max(0, position - 1);
        const elderCodes = [];
        for (let k = 1; k < position; k++) elderCodes.push(letter + '.M' + k);
        const existingElders = elderCodes.filter(c => allMembers.some(m => m.PersonalCode === c));

        let html = '<strong>नयाँ पुर्खा:</strong> ' + letter + ' - ' + ((nameEl?.value || '').trim() || '(नाम)') + '<br>';
        html += '<strong>परिवर्तन हुने कोडहरू:</strong> ' + entries.length + ' / ' + allMembers.length + '<br>';
        if (elderCount > 0) {
            html += '<strong>स्वतः थपिने दाजुहरू:</strong> ' + elderCount + ' जना — ' + elderCodes.join(', ') + '<br>';
            if (existingElders.length > 0) {
                html += '<span style="color:#856404;">ℹ️ केही पहिले नै अवस्थित: ' + existingElders.join(', ') + '</span><br>';
            }
        } else {
            html += '<strong>स्वतः थपिने दाजुहरू:</strong> कुनै छैन<br>';
        }
        html += '<hr style="margin:6px 0;">';

        if (collisions.length > 0) {
            html += '<span style="color:#b02b2b;"><strong>⚠️ टकराव:</strong></span><br>';
            collisions.slice(0, 5).forEach(([o, n]) => { html += `&nbsp;&nbsp;${n}<br>`; });
            previewEl.innerHTML = html; return;
        }

        entries.slice(0, 12).forEach(([oldCode, newCode]) => {
            html += `${oldCode} &nbsp;→&nbsp; ${newCode}<br>`;
        });
        if (entries.length > 12) html += `... र थप ${entries.length - 12} परिवर्तन<br>`;
        previewEl.innerHTML = html;
    }

    injectAncestorUI();

    document.querySelectorAll('.panel-close-btn').forEach(btn => {
        if (btn.dataset.close === 'ancestorPanel' && !btn.dataset.boundAncestor) {
            btn.dataset.boundAncestor = '1';
            btn.addEventListener('click', function(e) { e.preventDefault(); e.stopPropagation(); hideAllPanels(); });
        }
        if (btn.dataset.close === 'removeRootPanel' && !btn.dataset.boundRemoveRoot) {
            btn.dataset.boundRemoveRoot = '1';
            btn.addEventListener('click', function(e) { e.preventDefault(); e.stopPropagation(); hideAllPanels(); });
        }
    });

    document.getElementById('addAncestorBtn')?.addEventListener('click', function(e) {
        e.preventDefault(); e.stopPropagation();
        if (PANELS.ancestorPanel?.classList.contains('is-active')) { hideAllPanels(); return; }
        const nameEl = document.getElementById('ancestorName');
        const letterEl = document.getElementById('ancestorLetter');
        const posEl = document.getElementById('ancestorPosition');
        if (nameEl) nameEl.value = '';
        if (letterEl) letterEl.value = '';
        if (posEl) posEl.value = '';
        showPanel('ancestorPanel');
        updateAncestorPreview();
    });

    ['ancestorName', 'ancestorLetter', 'ancestorPosition'].forEach(id => {
        document.getElementById(id)?.addEventListener('input', updateAncestorPreview);
    });

    document.getElementById('cancelAncestorBtn')?.addEventListener('click', (e) => { e.preventDefault(); hideAllPanels(); });

    document.getElementById('ancestorForm')?.addEventListener('submit', async function(e) {
        e.preventDefault();
        if (!currentRootCode) { alert('❌ कुनै मूल व्यक्ति भेटिएन।'); return; }

        const fullName = (document.getElementById('ancestorName')?.value || '').trim();
        const letter = (document.getElementById('ancestorLetter')?.value || '').trim().toUpperCase();
        const position = parseInt((document.getElementById('ancestorPosition')?.value || '').trim(), 10);

        if (!fullName) { alert('कृपया पुर्खाको नाम लेख्नुहोस्।'); return; }
        if (!/^[A-Z]$/.test(letter)) { alert('A–Z को एक अक्षर।'); return; }
        if (letter === currentRootLetter) { alert('नयाँ अक्षर फरक हुनुपर्छ।'); return; }
        if (isNaN(position) || position < 1) { alert('१ वा सो भन्दा ठूलो संख्या।'); return; }

        const map = computeAncestorMigration(currentRootCode, letter, position);
        const entries = Object.entries(map);
        const collisions = entries.filter(([oldCode, newCode]) =>
            allMembers.some(m => m.PersonalCode === newCode && m.PersonalCode !== oldCode)
        );
        if (collisions.length > 0) {
            alert(`❌ कोड टकराव!\n${collisions.slice(0, 5).map(c => c[1]).join('\n')}`); return;
        }

        const elderCount = Math.max(0, position - 1);
        const elderCodesToInsert = [];
        for (let k = 1; k < position; k++) {
            const code = letter + '.M' + k;
            if (!allMembers.some(m => m.PersonalCode === code)) {
                elderCodesToInsert.push({ code, index: k });
            }
        }

        const ok = window.confirm(
            `⚠️ सावधान!\n\n` +
            `${entries.length} सदस्यको कोड परिवर्तन हुनेछ, नयाँ पुर्खा "${fullName}" (${letter}) थपिनेछ` +
            (elderCodesToInsert.length > 0 ? `, र ${elderCodesToInsert.length} दाजुको placeholder` : '') + `।\n\n` +
            `- हालको मूल: ${currentRootCode}\n- नयाँ मूल: ${letter}\n- नयाँ कोड: ${letter}.M${position}\n\nपक्का?`
        );
        if (!ok) return;

        const submitBtn = document.getElementById('confirmAncestorBtn');
        if (submitBtn) setButtonLoading(submitBtn, true, 'परिवर्तन हुँदै...');

        try {
            const ancestorPayload = {
                PersonalCode: letter, FullName: fullName, Gender: 'M',
                Father: '', Mother: '', Spouse: '', Address: '', Mobile: '', Email: '', DOB: '',
                Sons: '', Daughters: '', Profession: '', Qualification: '', Position: '',
                DetailAddress: '', DetailProfession: '', LifeStory: '', DOD_Age: '', PhotoUrl: '', PublicId: ''
            };
            const { error: insertErr } = await supabase.from('MemberDataTable').insert([ancestorPayload]);
            if (insertErr) throw insertErr;

            if (elderCodesToInsert.length > 0) {
                const placeholders = elderCodesToInsert.map(({ code, index }) => ({
                    PersonalCode: code,
                    FullName: `(अज्ञात) ${fullName.split(' ')[0]}का ${toNepaliOrdinal(index)} छोरा`,
                    Gender: 'M', Father: fullName, Mother: '', Spouse: '',
                    Address: '', Mobile: '', Email: '', DOB: '', Sons: '', Daughters: '',
                    Profession: '', Qualification: '', Position: `${toNepaliOrdinal(index)} छोरा`,
                    DetailAddress: '', DetailProfession: '', LifeStory: '', DOD_Age: '', PhotoUrl: '', PublicId: ''
                }));
                const { error: elderErr } = await supabase.from('MemberDataTable').insert(placeholders);
                if (elderErr) console.warn('⚠️ Could not insert elder placeholders:', elderErr);
            }

            entries.sort((a, b) => b[0].length - a[0].length);
            let successCount = 0;
            const failures = [];

            for (const [oldCode, newCode] of entries) {
                const { error: updErr } = await supabase.from('MemberDataTable')
                    .update({ PersonalCode: newCode }).eq('PersonalCode', oldCode);
                if (updErr) failures.push({ oldCode, newCode, error: updErr.message });
                else successCount++;
            }

            if (failures.length > 0) {
                alert(`⚠️ आंशिक: ${successCount} सफल, ${failures.length} असफल।\n` +
                      failures.slice(0, 5).map(f => `${f.oldCode} → ${f.newCode}: ${f.error}`).join('\n'));
            } else {
                alert(`✅ सफल!\nनयाँ मूल: ${letter}\n${successCount} सदस्यको कोड परिवर्तन भयो।`);
            }

            hideAllPanels();
            await loadMembers();
        } catch(err) {
            console.error('❌ Error:', err);
            alert(`❌ Error: ${err.message}`);
        } finally {
            if (submitBtn) setButtonLoading(submitBtn, false);
        }
    });

    // ============================================================
    // 22. REMOVE ROOT PERSON
    // ============================================================
    function injectRemoveRootUI() {
        const actionBox = document.getElementById('ActionButtonBox');
        if (actionBox && !document.getElementById('removeRootBtn')) {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.id = 'removeRootBtn';
            btn.className = 'action-btn action-btn-danger';
            btn.innerHTML = '<i class="fas fa-user-minus"></i> मूल व्यक्ति हटाउनुहोस्';
            actionBox.appendChild(btn);
            TOGGLE_BTNS.removeRootBtn = btn;
        }

        const container = document.querySelector('.container');
        const footer = document.getElementById('FooterBox');
        if (container && !document.getElementById('removeRootPanel')) {
            const panel = document.createElement('div');
            panel.id = 'removeRootPanel'; panel.className = 'inline-panel';
            panel.innerHTML = `
                <div class="panel-header">
                    <h2><i class="fas fa-user-minus"></i> मूल व्यक्ति हटाउनुहोस् (नयाँ मूल छान्नुहोस्)</h2>
                    <button type="button" class="panel-close-btn" data-close="removeRootPanel"><i class="fas fa-times"></i></button>
                </div>
                <div class="form-group">
                    <label><i class="fas fa-info-circle"></i> हालको अवस्था</label>
                    <div class="info-box">
                        हालको मूल व्यक्ति: <strong id="removeRootCurrentRoot">—</strong><br>
                        कुल सदस्यहरू: <strong id="removeRootMemberCount">0</strong>
                    </div>
                </div>
                <form id="removeRootForm">
                    <div class="form-grid">
                        <div class="form-group">
                            <label><i class="fas fa-user-check"></i> नयाँ मूल व्यक्ति (हालको मूलको छोरा) *</label>
                            <select id="removeRootSonSelect" required>
                                <option value="">— छान्नुहोस् —</option>
                            </select>
                            <small class="inline-hint">हालको मूल व्यक्तिका छोराहरू मध्ये एउटा छान्नुहोस्।</small>
                        </div>
                        <div class="form-group">
                            <label><i class="fas fa-font"></i> नयाँ कोडको सुरुको अक्षरः *</label>
                            <input type="text" id="removeRootNewLetter" placeholder="जस्तोः K" maxlength="1" required style="text-transform:uppercase;" />
                            <small class="inline-hint">A–Z को एक अक्षर, हालको मूल अक्षर भन्दा फरक।</small>
                        </div>
                        <div class="form-group full-width">
                            <label><i class="fas fa-eye"></i> पूर्वावलोकन</label>
                            <div id="removeRootPreview">
                                केही टाइप गर्नुहोस्...
                            </div>
                        </div>
                    </div>
                    <div class="btn-group">
                        <button type="button" id="cancelRemoveRootBtn">रद्ध गर्नुहोस्</button>
                        <button type="submit" id="confirmRemoveRootBtn">
                            <i class="fas fa-trash-alt"></i> हटाएर नयाँ मूल बनाउनुहोस्
                        </button>
                    </div>
                </form>
            `;
            if (footer) container.insertBefore(panel, footer); else container.appendChild(panel);
            PANELS.removeRootPanel = panel;
        }
    }

    function updateRemoveRootButtonState() {
        const btn = document.getElementById('removeRootBtn');
        if (!btn) return;
        const hasRoot = !!currentRootCode;
        const hasSons = hasRoot && getSonsOf(currentRootCode, allMembers).length > 0;

        if (hasRoot && hasSons) {
            btn.disabled = false; btn.style.opacity = '1'; btn.style.cursor = 'pointer';
        } else {
            btn.disabled = true; btn.style.opacity = '0.5'; btn.style.cursor = 'not-allowed';
        }
    }

    function computeRootRemovalMigration(oldRootCode, newRootOldCode, newLetter) {
        const posMatch = String(newRootOldCode).trim().match(/^[A-Z]\.M(\d+)$/);
        if (!posMatch) {
            return { renameMap: {}, deleteList: [], error: 'New root code must match <Letter>.M<number>' };
        }
        const newRootPosition = parseInt(posMatch[1], 10);

        const oldPrefix = oldRootCode + '.';
        const oldBranchPrefix = oldRootCode + '.' + newRootPosition + '.';
        const newBranchPrefix = newLetter + '.';
        const oldRootSpouseRegex = new RegExp('^' + escapeRegex(oldRootCode) + 'm+$');

        const renameMap = {};
        const deleteList = [];

        allMembers.forEach(m => {
            if (!m || !m.PersonalCode) return;
            const code = String(m.PersonalCode).trim();

            // KEEP & RENAME

            if (code === newRootOldCode) {
                renameMap[code] = newLetter;
                return;
            }

            if (code.startsWith(newRootOldCode)) {
                const suffix = code.substring(newRootOldCode.length);
                if (/^m+$/.test(suffix)) {
                    renameMap[code] = newLetter + suffix;
                    return;
                }
            }

            if (code.startsWith(oldBranchPrefix)) {
                renameMap[code] = newBranchPrefix + code.substring(oldBranchPrefix.length);
                return;
            }

            // DELETE

            if (code === oldRootCode) { deleteList.push(code); return; }

            if (oldRootSpouseRegex.test(code)) { deleteList.push(code); return; }

            const siblingMatch = code.match(/^([A-Z])\.([MF])(\d+)(m*)$/);
            if (siblingMatch && code.startsWith(oldPrefix)) {
                const num = parseInt(siblingMatch[3], 10);
                if (num !== newRootPosition) { deleteList.push(code); return; }
            }

            const descMatch = code.match(/^([A-Z])\.(\d+)\./);
            if (descMatch && code.startsWith(oldPrefix)) {
                const num = parseInt(descMatch[2], 10);
                if (num !== newRootPosition) { deleteList.push(code); return; }
            }
        });

        return { renameMap, deleteList, newRootPosition };
    }

    function updateRemoveRootPreview() {
        const selectEl = document.getElementById('removeRootSonSelect');
        const letterEl = document.getElementById('removeRootNewLetter');
        const previewEl = document.getElementById('removeRootPreview');
        const currentRootEl = document.getElementById('removeRootCurrentRoot');
        const countEl = document.getElementById('removeRootMemberCount');

        if (!previewEl) return;

        if (currentRootEl) {
            const root = findRootMember(allMembers);
            currentRootEl.textContent = root ? `${root.PersonalCode} (${root.FullName || ''})` : '—';
        }
        if (countEl) countEl.textContent = allMembers.length;

        if (!currentRootCode) {
            previewEl.innerHTML = '<span style="color:#b02b2b;">कुनै मूल व्यक्ति भेटिएन।</span>';
            return;
        }

        if (selectEl) {
            const currentValue = selectEl.value;
            const sons = getSonsOf(currentRootCode, allMembers);
            selectEl.innerHTML = '<option value="">— छान्नुहोस् —</option>';
            sons.forEach(s => {
                const opt = document.createElement('option');
                opt.value = s.PersonalCode;
                opt.textContent = formatMemberLabel(s);
                selectEl.appendChild(opt);
            });
            if (currentValue && selectEl.querySelector(`option[value="${currentValue}"]`)) {
                selectEl.value = currentValue;
            }
            if (sons.length === 0) {
                previewEl.innerHTML = '<span style="color:#b02b2b;">हालको मूल व्यक्तिका कुनै छोरा भेटिएन। यो कार्य गर्न सकिँदैन।</span>';
                return;
            }
        }

        const newRootOldCode = selectEl?.value || '';
        const newLetter = (letterEl?.value || '').trim().toUpperCase();

        if (!newRootOldCode) { previewEl.innerHTML = 'कृपया नयाँ मूल व्यक्ति छान्नुहोस्।'; return; }
        if (!newLetter) { previewEl.innerHTML = 'कृपया नयाँ अक्षर लेख्नुहोस्।'; return; }
        if (!/^[A-Z]$/.test(newLetter)) { previewEl.innerHTML = 'A–Z को एक अक्षर।'; return; }
        if (newLetter === currentRootLetter) { previewEl.innerHTML = '<span style="color:#b02b2b;">नयाँ अक्षर हालको अक्षर भन्दा फरक हुनुपर्छ।</span>'; return; }

        const result = computeRootRemovalMigration(currentRootCode, newRootOldCode, newLetter);
        if (result.error) { previewEl.innerHTML = `<span style="color:#b02b2b;">${result.error}</span>`; return; }

        const { renameMap, deleteList } = result;
        const renameEntries = Object.entries(renameMap);

        const externalCollisions = allMembers.filter(m => {
            const c = String(m.PersonalCode).trim();
            if (renameMap[c]) return false;
            if (deleteList.includes(c)) return false;
            if (c === newLetter) return true;
            if (c.startsWith(newLetter + '.')) return true;
            if (new RegExp('^' + escapeRegex(newLetter) + 'm+$').test(c)) return true;
            return false;
        }).map(m => m.PersonalCode);

        let html = '';
        html += `<strong>पुरानो मूल:</strong> ${currentRootCode} (मेटिनेछ)<br>`;
        html += `<strong>नयाँ मूल:</strong> ${newLetter} — ${allMembers.find(m => m.PersonalCode === newRootOldCode)?.FullName || ''}<br>`;
        html += `<strong>नयाँ मूलको कोड:</strong> ${newRootOldCode} → ${newLetter}<br>`;
        html += `<hr style="margin:6px 0;">`;

        html += `<strong style="color:#700;">🗑️ मेटिने सदस्यहरू:</strong> ${deleteList.length}<br>`;
        deleteList.slice(0, 8).forEach(c => { html += `&nbsp;&nbsp;${c}<br>`; });
        if (deleteList.length > 8) html += `&nbsp;&nbsp;... र थप ${deleteList.length - 8}<br>`;

        html += `<hr style="margin:6px 0;">`;
        html += `<strong style="color:#070;">✏️ कोड परिवर्तन हुनेहरू:</strong> ${renameEntries.length}<br>`;
        renameEntries.slice(0, 8).forEach(([o, n]) => { html += `&nbsp;&nbsp;${o} → ${n}<br>`; });
        if (renameEntries.length > 8) html += `&nbsp;&nbsp;... र थप ${renameEntries.length - 8}<br>`;

        html += `<hr style="margin:6px 0;">`;
        const remaining = allMembers.length - deleteList.length;
        html += `<strong>सञ्चालन पछि बाँकी:</strong> ${remaining} सदस्य<br>`;

        if (externalCollisions.length > 0) {
            html += `<hr style="margin:6px 0;">`;
            html += `<span style="color:#b02b2b;"><strong>⚠️ टकराव:</strong> नयाँ अक्षर '${newLetter}' का केही कोडहरू पहिले नै अवस्थित छन्:</span><br>`;
            externalCollisions.slice(0, 5).forEach(c => { html += `&nbsp;&nbsp;${c}<br>`; });
            html += `<span style="color:#b02b2b;">कृपया फरक अक्षर छान्नुहोस्।</span>`;
        }

        previewEl.innerHTML = html;
    }

    injectRemoveRootUI();

    document.getElementById('removeRootBtn')?.addEventListener('click', function(e) {
        e.preventDefault(); e.stopPropagation();
        if (PANELS.removeRootPanel?.classList.contains('is-active')) { hideAllPanels(); return; }
        const selectEl = document.getElementById('removeRootSonSelect');
        const letterEl = document.getElementById('removeRootNewLetter');
        if (selectEl) selectEl.value = '';
        if (letterEl) letterEl.value = '';
        showPanel('removeRootPanel');
        updateRemoveRootPreview();
    });

    document.getElementById('removeRootSonSelect')?.addEventListener('change', updateRemoveRootPreview);
    document.getElementById('removeRootNewLetter')?.addEventListener('input', updateRemoveRootPreview);

    document.getElementById('cancelRemoveRootBtn')?.addEventListener('click', (e) => { e.preventDefault(); hideAllPanels(); });

    document.getElementById('removeRootForm')?.addEventListener('submit', async function(e) {
        e.preventDefault();
        if (!currentRootCode) { alert('❌ कुनै मूल व्यक्ति भेटिएन।'); return; }

        const newRootOldCode = document.getElementById('removeRootSonSelect')?.value || '';
        const newLetter = (document.getElementById('removeRootNewLetter')?.value || '').trim().toUpperCase();

        if (!newRootOldCode) { alert('कृपया नयाँ मूल व्यक्ति छान्नुहोस्।'); return; }
        if (!/^[A-Z]$/.test(newLetter)) { alert('A–Z को एक अक्षर।'); return; }
        if (newLetter === currentRootLetter) { alert('नयाँ अक्षर फरक हुनुपर्छ।'); return; }

        const result = computeRootRemovalMigration(currentRootCode, newRootOldCode, newLetter);
        if (result.error) { alert('❌ ' + result.error); return; }

        const { renameMap, deleteList } = result;
        const renameEntries = Object.entries(renameMap);

        const externalCollisions = allMembers.filter(m => {
            const c = String(m.PersonalCode).trim();
            if (renameMap[c]) return false;
            if (deleteList.includes(c)) return false;
            if (c === newLetter) return true;
            if (c.startsWith(newLetter + '.')) return true;
            if (new RegExp('^' + escapeRegex(newLetter) + 'm+$').test(c)) return true;
            return false;
        });
        if (externalCollisions.length > 0) {
            alert(`❌ नयाँ अक्षर '${newLetter}' का कोडहरू पहिले नै अवस्थित छन्:\n${externalCollisions.slice(0, 5).map(m => m.PersonalCode).join('\n')}`);
            return;
        }

        const newRootMember = allMembers.find(m => m.PersonalCode === newRootOldCode);
        const ok = window.confirm(
            `⚠️ अति सावधान!\n\n` +
            `यसले:\n` +
            `  • पुरानो मूल "${currentRootCode}" (${allMembers.find(m => m.PersonalCode === currentRootCode)?.FullName || ''}) लाई मेटाउनेछ\n` +
            `  • उनका श्रीमतीहरूलाई मेटाउनेछ\n` +
            `  • ${deleteList.length - 1} अन्य सदस्य (दाजु/बहिनी + उनीहरूका सन्तान) मेटाउनेछ\n` +
            `  • "${newRootMember?.FullName || ''}" (${newRootOldCode}) लाई नयाँ मूल "${newLetter}" बनाउनेछ\n` +
            `  • उनको शाखाका ${renameEntries.length - 1} सदस्यको कोड परिवर्तन गर्नेछ\n\n` +
            `कुल मेटिने: ${deleteList.length} सदस्य\n` +
            `कुल बाँकी: ${allMembers.length - deleteList.length} सदस्य\n\n` +
            `पक्का गर्नुहोस्?`
        );
        if (!ok) return;

        const submitBtn = document.getElementById('confirmRemoveRootBtn');
        if (submitBtn) setButtonLoading(submitBtn, true, 'मेट्दै र परिवर्तन गर्दै...');

        try {
            if (deleteList.length > 0) {
                const BATCH = 100;
                for (let i = 0; i < deleteList.length; i += BATCH) {
                    const batch = deleteList.slice(i, i + BATCH);
                    const { error: delErr } = await supabase
                        .from('MemberDataTable')
                        .delete()
                        .in('PersonalCode', batch);
                    if (delErr) throw new Error(`Delete failed: ${delErr.message}`);
                }
                console.log('✅ Deleted', deleteList.length, 'members');
            }

            renameEntries.sort((a, b) => b[0].length - a[0].length);
            let successCount = 0;
            const failures = [];

            for (const [oldCode, newCode] of renameEntries) {
                const { error: updErr } = await supabase
                    .from('MemberDataTable')
                    .update({ PersonalCode: newCode })
                    .eq('PersonalCode', oldCode);
                if (updErr) failures.push({ oldCode, newCode, error: updErr.message });
                else successCount++;
            }

            if (failures.length > 0) {
                alert(
                    `⚠️ आंशिक सफलता:\n\n🗑️ ${deleteList.length} मेटियो\n✏️ ${successCount} कोड परिवर्तन भयो\n❌ ${failures.length} असफल\n\n` +
                    failures.slice(0, 5).map(f => `${f.oldCode} → ${f.newCode}: ${f.error}`).join('\n')
                );
            } else {
                alert(
                    `✅ सफल!\n\n` +
                    `🗑️ ${deleteList.length} सदस्य मेटियो।\n` +
                    `✏️ ${successCount} सदस्यको कोड परिवर्तन भयो।\n` +
                    `🌳 नयाँ मूल: ${newLetter} (${newRootMember?.FullName || ''})`
                );
            }

            hideAllPanels();
            await loadMembers();
        } catch(err) {
            console.error('❌ Remove root error:', err);
            alert(`❌ Error: ${err.message}\n\nकृपया Supabase मा म्यानुअल जाँच गर्नुहोस्।`);
        } finally {
            if (submitBtn) setButtonLoading(submitBtn, false);
        }
    });

    // ------------------------------------------------------------
    // 23. Initialize
    // ------------------------------------------------------------
    console.log('🚀 Initializing AddMember page...');

    (async function initialize() {
        try {
            const isAuthenticated = await checkPrivatePageAccess();
            if (!isAuthenticated) { console.log('⛔ Auth failed'); return; }

            console.log('✅ Auth successful, loading page...');
            await loadMembers();
            checkForSuggestionData();
            console.log('✅ AddMember.html ready. Root:', currentRootCode, '| Dropdowns:', generationCount);
        } catch (error) {
            console.error('❌ Init error:', error);
            redirectToLogin();
        }
    })();

})();