// SearchScript.js - Public Search Page

(function() {
    'use strict';

    // ------------------------------------------------------------
    // 1. Supabase Initialization
    // ------------------------------------------------------------
    let supabase = null;
    let allMembers = [];
    let currentSelectedMember = null;

    function initSupabase() {
        if (window.SupabaseConfig && window.SupabaseConfig.supabase) {
            supabase = window.SupabaseConfig.supabase;
            console.log('✅ Supabase client loaded from SupabaseConfig');
            return true;
        } else {
            try {
                const url = 'https://icchczijubhzxkjpebps.supabase.co';
                const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImljY2hjemlqdWJoenhranBlYnBzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ5MDI1MjEsImV4cCI6MjEwMDQ3ODUyMX0.8Q-610HCGfdeIH-I18ZyJthTF5fYq2YBFD-d5-F39ZA';
                supabase = window.supabase.createClient(url, key);
                console.warn('⚠️ Using inline Supabase config');
                return true;
            } catch(e) {
                console.error('❌ Supabase init error:', e);
                return false;
            }
        }
    }
    initSupabase();

    // ------------------------------------------------------------
    // 2. Helper Functions
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
        // ✅ Simple: number of dot-separated blocks = generation
        return code.split('.').length;
    }

    function getParentCode(code) {
        if (!code) return null;
        const parts = code.split('.');
        if (parts.length <= 1) return null;
        return parts.slice(0, -1).join('.');
    }

    /**
     * ✅ CORRECT father-code derivation
     * Rule:
     *   1. Drop the last dot-segment.
     *   2. In the new last segment, prefix "M" to its number.
     *      - "K6"  -> "KM6"
     *      - "1"   -> "M1"
     *   3. Return null if there's only one segment (root has no father in DB).
     *
     * Examples:
     *   K6.1.1.M5  ->  K6.1.M1
     *   K6.1.M1    ->  K6.M1
     *   K6.M1      ->  KM6
     *   K6.1       ->  KM6
     *   KM6        ->  null
     */
    function getFatherCode(code) {
        if (!code) return null;
        const parts = code.split('.');
        if (parts.length <= 1) return null;

        parts.pop();   // drop last segment

        const lastIdx = parts.length - 1;
        const seg = parts[lastIdx];
        const m = seg.match(/^([KMF]?)(\d+)$/i);
        if (m) {
            const prefix = (m[1] || '').toUpperCase();
            const num = m[2];
            parts[lastIdx] = (prefix === 'K') ? ('KM' + num) : ('M' + num);
        }

        return parts.join('.');
    }

    function getDirectChildren(parentCode, members) {
        if (!parentCode) return [];
        const parentBase = getBaseCode(parentCode);
        return members
            .filter(m => {
                const code = m.PersonalCode || '';
                if (code.endsWith('M')) return false;   // exclude spouses
                const childParent = getParentCode(code);
                if (!childParent) return false;
                return getBaseCode(childParent) === parentBase;
            })
            .sort((a, b) => a.PersonalCode.localeCompare(b.PersonalCode));
    }

    function getGenderLabel(memberOrCode) {
        let genderCode = null;
        if (memberOrCode && typeof memberOrCode === 'object') {
            const g = (memberOrCode.Gender || '').toString().trim().toUpperCase();
            if (g === 'M' || g === 'F' || g === 'O') genderCode = g;
        }
        if (!genderCode && typeof memberOrCode === 'string') {
            const code = memberOrCode;
            if (code.startsWith('KM')) genderCode = 'M';
            else if (code.startsWith('KF')) genderCode = 'F';
            else {
                const parts = code.split('.');
                const lastPart = parts[parts.length - 1];
                if (lastPart.startsWith('M')) genderCode = 'M';
                else if (lastPart.startsWith('F')) genderCode = 'F';
            }
        }
        if (genderCode === 'M') return 'पुरूष (Male)';
        if (genderCode === 'F') return 'महिला (Female)';
        if (genderCode === 'O') return 'अन्य (Other)';
        return 'अन्य (Other)';
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

    function formatDob(member) {
        const v = member && member.DOB;
        return (v && String(v).trim() !== '') ? v : '-';
    }

    // ------------------------------------------------------------
    // 3. Load Members
    // ------------------------------------------------------------
    async function loadMembers() {
        if (!supabase) return;
        try {
            const { data, error } = await supabase
                .from('MemberDataTable')
                .select('*')
                .order('PersonalCode');

            if (error) throw error;

            if (!data || data.length === 0) {
                allMembers = [];
                populateDropdowns();
                return;
            }

            allMembers = data;
            console.log('✅ Loaded', allMembers.length, 'members');
            populateDropdowns();

        } catch(e) {
            console.warn('Could not load members:', e);
            allMembers = [];
            populateDropdowns();
        }
    }

    // ------------------------------------------------------------
    // 4. Populate Dropdowns
    // ------------------------------------------------------------
    function populateDropdowns() {
        const gen1Select = document.getElementById('gen-1');
        if (gen1Select) {
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
                let prefix = '';
                if (m.PersonalCode.startsWith('KM')) prefix = '♂️ ';
                else if (m.PersonalCode.startsWith('KF')) prefix = '♀️ ';
                opt.textContent = `${prefix}${m.PersonalCode} - ${m.FullName}`;
                gen1Select.appendChild(opt);
            });

            if (currentValue && gen1Select.querySelector(`option[value="${currentValue}"]`)) {
                gen1Select.value = currentValue;
            }
        }

        for (let i = 2; i <= 10; i++) {
            const sel = document.getElementById(`gen-${i}`);
            if (sel) {
                sel.innerHTML = '<option value="">छान्नुहोस्</option>';
                sel.disabled = true;
            }
        }

        rebuildCascading();
    }

    function rebuildCascading() {
        const genSelects = [];
        for (let i = 1; i <= 10; i++) {
            const sel = document.getElementById(`gen-${i}`);
            if (sel) genSelects.push(sel);
        }

        let previousValue = null;
        for (let i = 0; i < genSelects.length; i++) {
            const sel = genSelects[i];
            if (i === 0) {
                sel.disabled = false;
                previousValue = sel.value;
            } else {
                if (previousValue) {
                    const children = getDirectChildren(previousValue, allMembers);
                    const currentValue = sel.value;
                    sel.innerHTML = '<option value="">छान्नुहोस्</option>';
                    children.forEach(child => {
                        const opt = document.createElement('option');
                        opt.value = child.PersonalCode;
                        let prefix = '';
                        const parts = child.PersonalCode.split('.');
                        const lastPart = parts[parts.length - 1];
                        if (lastPart.startsWith('M')) prefix = '♂️ ';
                        else if (lastPart.startsWith('F')) prefix = '♀️ ';
                        opt.textContent = `${prefix}${child.PersonalCode} - ${child.FullName}`;
                        sel.appendChild(opt);
                    });
                    sel.disabled = false;
                    if (currentValue && sel.querySelector(`option[value="${currentValue}"]`)) {
                        sel.value = currentValue;
                    }
                    previousValue = sel.value;
                } else {
                    sel.innerHTML = '<option value="">छान्नुहोस्</option>';
                    sel.disabled = true;
                    previousValue = null;
                    for (let j = i + 1; j < genSelects.length; j++) {
                        genSelects[j].innerHTML = '<option value="">छान्नुहोस्</option>';
                        genSelects[j].disabled = true;
                    }
                    break;
                }
            }
        }

        updateMemberDisplay();
    }

    function attachDropdownEvents() {
        for (let i = 1; i <= 10; i++) {
            const sel = document.getElementById(`gen-${i}`);
            if (sel) {
                sel.removeEventListener('change', dropdownChangeHandler);
                sel.addEventListener('change', dropdownChangeHandler);
            }
        }
    }

    function dropdownChangeHandler() {
        let currentIndex = 1;
        for (let i = 1; i <= 10; i++) {
            const sel = document.getElementById(`gen-${i}`);
            if (sel && sel === this) { currentIndex = i; break; }
        }
        for (let j = currentIndex + 1; j <= 10; j++) {
            const nextSel = document.getElementById(`gen-${j}`);
            if (nextSel) {
                nextSel.innerHTML = '<option value="">छान्नुहोस्</option>';
                nextSel.disabled = true;
            }
        }
        rebuildCascading();
    }

    // ============================================================
    // 5. PANEL MANAGEMENT
    // ============================================================
    const PANEL_IDS = {
        short:    'DescriptionBoxWrapper',
        detail:   'detailPanel',
        family:   'FamilyBox',
        ancestor: 'AnsestorsBox'
    };

    const BTN_IDS = {
        short:    'btnShortDescription',
        detail:   'btnDetailDescription',
        family:   'btnShowFamily',
        ancestor: 'btnShowAnsestors'
    };

    function showSearchPanel(which) {
        Object.keys(PANEL_IDS).forEach(key => {
            const panel = document.getElementById(PANEL_IDS[key]);
            const btn = document.getElementById(BTN_IDS[key]);
            const isActive = (key === which);
            if (panel) panel.classList.toggle('is-active', isActive);
            if (btn) btn.classList.toggle('active', isActive);
        });

        if (which) {
            const target = document.getElementById(PANEL_IDS[which]);
            if (target) {
                setTimeout(() => target.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
            }
        }
    }

    function hideAllSearchPanels() {
        showSearchPanel(null);
    }

    function initViewToggleButtons() {
        document.getElementById('btnShortDescription')?.addEventListener('click', function (e) {
            e.preventDefault(); e.stopPropagation();
            if (!currentSelectedMember) { alert('कृपया पहिले एक सदस्य छान्नुहोस्।'); return; }
            const isActive = document.getElementById('DescriptionBoxWrapper')?.classList.contains('is-active');
            isActive ? hideAllSearchPanels() : showSearchPanel('short');
        });

        document.getElementById('btnDetailDescription')?.addEventListener('click', function (e) {
            e.preventDefault(); e.stopPropagation();
            if (!currentSelectedMember) { alert('कृपया पहिले एक सदस्य छान्नुहोस्।'); return; }
            const isActive = document.getElementById('detailPanel')?.classList.contains('is-active');
            if (isActive) { hideAllSearchPanels(); }
            else { populateDetailPanel(currentSelectedMember); showSearchPanel('detail'); }
        });

        document.getElementById('btnShowFamily')?.addEventListener('click', function (e) {
            e.preventDefault(); e.stopPropagation();
            if (!currentSelectedMember) { alert('कृपया पहिले एक सदस्य छान्नुहोस्।'); return; }
            const isActive = document.getElementById('FamilyBox')?.classList.contains('is-active');
            if (isActive) { hideAllSearchPanels(); }
            else { populateFamilyBox(currentSelectedMember); showSearchPanel('family'); }
        });

        document.getElementById('btnShowAnsestors')?.addEventListener('click', function (e) {
            e.preventDefault(); e.stopPropagation();
            if (!currentSelectedMember) { alert('कृपया पहिले एक सदस्य छान्नुहोस्।'); return; }
            const isActive = document.getElementById('AnsestorsBox')?.classList.contains('is-active');
            if (isActive) { hideAllSearchPanels(); }
            else { populateAncestorBox(currentSelectedMember); showSearchPanel('ancestor'); }
        });
    }

    // ------------------------------------------------------------
    // 6. Update Member Display
    // ------------------------------------------------------------
    function updateMemberDisplay() {
        let selectedMember = null;
        for (let i = 10; i >= 1; i--) {
            const sel = document.getElementById(`gen-${i}`);
            if (sel && sel.value) {
                const member = getMemberByCode(sel.value, allMembers);
                if (member) { selectedMember = member; break; }
            }
        }

        currentSelectedMember = selectedMember;

        const outputs = {
            code: document.getElementById('code-output'),
            name: document.getElementById('name-output'),
            gender: document.getElementById('gender-output'),
            address: document.getElementById('address-output'),
            birthDate: document.getElementById('birth-date-output'),
            father: document.getElementById('father-output'),
            mother: document.getElementById('mother-output'),
            mobile: document.getElementById('mobile-output'),
            email: document.getElementById('email-output'),
            spouse: document.getElementById('spouse-output'),
            occupation: document.getElementById('occupation-output'),
            education: document.getElementById('education-output'),
            position: document.getElementById('position-output'),
            dod: document.getElementById('dod-output'),
            sons: document.getElementById('sons-output'),
            daughters: document.getElementById('daughters-output')
        };

        const photo = document.getElementById('MemberPhoto');
        const saveBtn = document.getElementById('btnSaveImage');
        const allToggleBtns = Object.values(BTN_IDS).map(id => document.getElementById(id));

        if (!selectedMember) {
            Object.values(outputs).forEach(el => { if (el) el.textContent = '-'; });
            if (photo) { photo.src = '../no_pic.png'; photo.style.width = '100%'; photo.style.height = 'auto'; }
            if (saveBtn) saveBtn.disabled = true;
            allToggleBtns.forEach(b => { if (b) b.disabled = true; });
            hideAllSearchPanels();
            return;
        }

        if (outputs.code) outputs.code.textContent = selectedMember.PersonalCode || '-';
        if (outputs.name) outputs.name.textContent = selectedMember.FullName || '-';
        if (outputs.gender) outputs.gender.textContent = getGenderLabel(selectedMember);
        if (outputs.address) outputs.address.textContent = selectedMember.Address || '-';
        if (outputs.birthDate) outputs.birthDate.textContent = selectedMember.DOB || '-';
        if (outputs.father) outputs.father.textContent = selectedMember.Father || '-';
        if (outputs.mother) outputs.mother.textContent = selectedMember.Mother || '-';
        if (outputs.mobile) outputs.mobile.textContent = selectedMember.Mobile || '-';
        if (outputs.email) outputs.email.textContent = selectedMember.Email || '-';
        if (outputs.spouse) outputs.spouse.textContent = selectedMember.Spouse || '-';
        if (outputs.occupation) outputs.occupation.textContent = selectedMember.Profession || '-';
        if (outputs.education) outputs.education.textContent = selectedMember.Qualification || '-';
        if (outputs.position) outputs.position.textContent = selectedMember.Position || '-';
        if (outputs.dod) outputs.dod.textContent = selectedMember.DOD_Age || '-';

        if (outputs.sons) {
            const v = selectedMember.Sons;
            outputs.sons.textContent = (v && v.trim() !== '') ? v : '-';
        }
        if (outputs.daughters) {
            const v = selectedMember.Daughters;
            outputs.daughters.textContent = (v && v.trim() !== '') ? v : '-';
        }

        if (photo) {
            photo.src = (selectedMember.PhotoUrl && selectedMember.PhotoUrl.trim() !== '')
                ? selectedMember.PhotoUrl
                : '../no_pic.png';
        }

        if (saveBtn) saveBtn.disabled = false;
        allToggleBtns.forEach(b => { if (b) b.disabled = false; });

        // Live-refresh open panels
        if (document.getElementById('detailPanel')?.classList.contains('is-active')) {
            populateDetailPanel(selectedMember);
        }
        if (document.getElementById('FamilyBox')?.classList.contains('is-active')) {
            populateFamilyBox(selectedMember);
        }
        if (document.getElementById('AnsestorsBox')?.classList.contains('is-active')) {
            populateAncestorBox(selectedMember);
        }
    }

    // ------------------------------------------------------------
    // 7. Populate Detail Panel
    // ------------------------------------------------------------
    function populateDetailPanel(m) {
        if (!m) return;
        const setText = (id, value) => {
            const el = document.getElementById(id);
            if (el) el.textContent = (value && String(value).trim() !== '') ? value : '-';
        };
        setText('detail-name-hero', m.FullName);
        setText('detail-code', m.PersonalCode);
        setText('detail-gender', getGenderLabel(m));
        setText('detail-father', m.Father);
        setText('detail-mother', m.Mother);
        setText('detail-spouse', m.Spouse);
        setText('detail-sons', m.Sons);
        setText('detail-daughters', m.Daughters);
        setText('detail-position', m.Position);
        setText('detail-address', m.Address);
        setText('detail-detailAddress', m.DetailAddress);
        setText('detail-mobile', m.Mobile);
        setText('detail-email', m.Email);
        setText('detail-dob', m.DOB);
        setText('detail-dod', m.DOD_Age);
        setText('detail-education', m.Qualification);
        setText('detail-occupation', m.Profession);
        setText('detail-detailProfession', m.DetailProfession);
        setText('detail-lifeStory', m.LifeStory);

        const detailPhoto = document.getElementById('detail-photo');
        if (detailPhoto) {
            detailPhoto.src = (m.PhotoUrl && m.PhotoUrl.trim() !== '') ? m.PhotoUrl : '../no_pic.png';
        }
    }

    // ============================================================
    // 8. FAMILY BOX
    // ============================================================
    function getSpouseOf(member) {
        if (!member) return null;
        const spouseCode = member.PersonalCode + 'M';
        return getMemberByCode(spouseCode, allMembers);
    }

    function getChildrenOf(member) {
        if (!member) return [];
        return getDirectChildren(member.PersonalCode, allMembers);
    }

    function getSonsOf(member) {
        return getChildrenOf(member).filter(c => (c.Gender || '').toUpperCase() === 'M');
    }

    function getDaughtersOf(member) {
        return getChildrenOf(member).filter(c => (c.Gender || '').toUpperCase() === 'F');
    }

    function populateFamilyBox(m) {
        if (!m) return;
        const container = document.getElementById('familyContent');
        if (!container) return;

        const spouse = getSpouseOf(m);
        const sons = getSonsOf(m);
        const daughters = getDaughtersOf(m);

        const daughtersInLaw = sons.map(s => getSpouseOf(s)).filter(Boolean);
        const sonsInLaw = daughters.map(d => getSpouseOf(d)).filter(Boolean);

        const grandsons = [];
        const granddaughters = [];
        sons.forEach(s => {
            getSonsOf(s).forEach(gs => grandsons.push(gs));
            getDaughtersOf(s).forEach(gd => granddaughters.push(gd));
        });

        const grandDaughtersInLaw = grandsons.map(gs => getSpouseOf(gs)).filter(Boolean);
        const grandSonsInLaw = granddaughters.map(gd => getSpouseOf(gd)).filter(Boolean);

        let html = '';

        html += `
            <div class="family-section family-hero">
                <div class="family-section-title">
                    <i class="fas fa-home"></i> घरमुली
                </div>
                ${renderFamilyMemberCard(m, 'primary')}
            </div>
        `;

        if (spouse) {
            html += `
                <div class="family-section">
                    <div class="family-section-title">
                        <i class="fas fa-heart"></i> ${m.Gender === 'F' ? 'श्रीमान' : 'श्रीमती'}
                    </div>
                    ${renderFamilyMemberCard(spouse, 'spouse')}
                </div>
            `;
        }

        if (sons.length > 0) {
            html += `
                <div class="family-section">
                    <div class="family-section-title">
                        <i class="fas fa-mars"></i> छोराहरू (${sons.length})
                    </div>
                    <div class="family-cards-grid">
                        ${sons.map(s => renderFamilyMemberCard(s, 'son')).join('')}
                    </div>
                </div>
            `;
        }

        if (daughters.length > 0) {
            html += `
                <div class="family-section">
                    <div class="family-section-title">
                        <i class="fas fa-venus"></i> छोरीहरू (${daughters.length})
                    </div>
                    <div class="family-cards-grid">
                        ${daughters.map(d => renderFamilyMemberCard(d, 'daughter')).join('')}
                    </div>
                </div>
            `;
        }

        if (daughtersInLaw.length > 0) {
            html += `
                <div class="family-section">
                    <div class="family-section-title">
                        <i class="fas fa-female"></i> बुहारीहरू (${daughtersInLaw.length})
                    </div>
                    <div class="family-cards-grid">
                        ${daughtersInLaw.map(d => renderFamilyMemberCard(d, 'inlaw')).join('')}
                    </div>
                </div>
            `;
        }

        if (sonsInLaw.length > 0) {
            html += `
                <div class="family-section">
                    <div class="family-section-title">
                        <i class="fas fa-male"></i> ज्वाइँहरू (${sonsInLaw.length})
                    </div>
                    <div class="family-cards-grid">
                        ${sonsInLaw.map(s => renderFamilyMemberCard(s, 'inlaw')).join('')}
                    </div>
                </div>
            `;
        }

        if (grandsons.length > 0) {
            html += `
                <div class="family-section">
                    <div class="family-section-title">
                        <i class="fas fa-child"></i> नातिहरू (${grandsons.length})
                    </div>
                    <div class="family-cards-grid">
                        ${grandsons.map(gs => renderFamilyMemberCard(gs, 'grandson')).join('')}
                    </div>
                </div>
            `;
        }

        if (granddaughters.length > 0) {
            html += `
                <div class="family-section">
                    <div class="family-section-title">
                        <i class="fas fa-child"></i> नातिनीहरू (${granddaughters.length})
                    </div>
                    <div class="family-cards-grid">
                        ${granddaughters.map(gd => renderFamilyMemberCard(gd, 'granddaughter')).join('')}
                    </div>
                </div>
            `;
        }

        if (grandDaughtersInLaw.length > 0) {
            html += `
                <div class="family-section">
                    <div class="family-section-title">
                        <i class="fas fa-female"></i> नाति बुहारीहरू (${grandDaughtersInLaw.length})
                    </div>
                    <div class="family-cards-grid">
                        ${grandDaughtersInLaw.map(d => renderFamilyMemberCard(d, 'inlaw')).join('')}
                    </div>
                </div>
            `;
        }

        if (grandSonsInLaw.length > 0) {
            html += `
                <div class="family-section">
                    <div class="family-section-title">
                        <i class="fas fa-male"></i> नातिनी ज्वाइँहरू (${grandSonsInLaw.length})
                    </div>
                    <div class="family-cards-grid">
                        ${grandSonsInLaw.map(s => renderFamilyMemberCard(s, 'inlaw')).join('')}
                    </div>
                </div>
            `;
        }

        if (!spouse && sons.length === 0 && daughters.length === 0) {
            html += `
                <div class="family-empty">
                    <i class="fas fa-info-circle"></i>
                    यो सदस्यको लागि कुनै पारिवारिक जानकारी उपलब्ध छैन।
                </div>
            `;
        }

        container.innerHTML = html;
    }

    function renderFamilyMemberCard(m, role) {
        if (!m) return '';
        const photo = (m.PhotoUrl && m.PhotoUrl.trim() !== '') ? m.PhotoUrl : '../no_pic.png';
        const dob = formatDob(m);
        const roleClass = 'family-card-' + role;

        return `
            <div class="family-card ${roleClass}">
                <div class="family-card-photo">
                    <img src="${escapeHtml(photo)}" alt="${escapeHtml(m.FullName || '')}" loading="lazy">
                </div>
                <div class="family-card-info">
                    <div class="family-card-name">${escapeHtml(m.FullName || '-')}</div>
                    <div class="family-card-code"><i class="fas fa-qrcode"></i> ${escapeHtml(m.PersonalCode || '-')}</div>
                    <div class="family-card-dob"><i class="fas fa-calendar-alt"></i> ${escapeHtml(dob)}</div>
                    ${m.Address ? `<div class="family-card-address"><i class="fas fa-map-pin"></i> ${escapeHtml(m.Address)}</div>` : ''}
                    ${m.Mobile ? `<div class="family-card-mobile"><i class="fas fa-phone"></i> ${escapeHtml(m.Mobile)}</div>` : ''}
                </div>
            </div>
        `;
    }

    // ============================================================
    // 9. ANCESTOR BOX  —  FIXED father-walking
    // ============================================================
    /**
     * Build ancestor chain: [काँशीनाथ, Gen1, Gen2, ..., selected]
     * काँशीनाथ is always the first entry (he's the originator, not in DB necessarily).
     */
    function getAncestorChain(m) {
        if (!m || !m.PersonalCode) return [];

        const chain = [];
        let code = m.PersonalCode;
        let safety = 25;

        while (code && safety-- > 0) {
            let node = getMemberByCode(code, allMembers);
            if (!node) {
                const base = getBaseCode(code);
                if (base && base !== code) {
                    node = getMemberByCode(base, allMembers);
                }
            }

            if (node) {
                if (!chain.some(c => c.PersonalCode === node.PersonalCode)) {
                    chain.unshift(node);   // prepend → root ends up at index 0
                }
            }

            const fatherCode = getFatherCode(code);
            if (!fatherCode || fatherCode === code) break;
            code = fatherCode;
        }

        // ✅ Always prepend काँशीनाथ ओझा (the originator)
        const KANSHINATH = {
            PersonalCode: '__KANSHINATH__',
            FullName: 'काँशीनाथ ओझा',
            Gender: 'M',
            DOB: '',
            PhotoUrl: '',
            Address: '',
            Mobile: '',
            __isOriginator: true
        };

        // Only add him if he's not already the top entry
        if (chain.length === 0 || chain[0].PersonalCode !== '__KANSHINATH__') {
            chain.unshift(KANSHINATH);
        }

        return chain;   // [काँशीनाथ, Gen1, ..., selected]
    }

    function populateAncestorBox(m) {
        if (!m) return;
        const container = document.getElementById('ancestorContent');
        if (!container) return;

        const chain = getAncestorChain(m);   // [काँशीनाथ, Gen1, ..., selected]

        if (chain.length === 0) {
            container.innerHTML = `
                <div class="family-empty">
                    <i class="fas fa-info-circle"></i>
                    कुनै वंशावली जानकारी उपलब्ध छैन।
                </div>
            `;
            return;
        }

        // "Total पुस्ता" should not count काँशीनाथ himself as a numbered पुस्ता
        // but the user sees him at the top. We'll show the count of named generations.
        const generationCount = chain.length - 1;   // exclude काँशीनाथ

        let html = `
            <div class="ancestor-summary">
                <div class="ancestor-summary-line">
                    <i class="fas fa-sitemap"></i>
                    <span>काँशीनाथ ओझाबाट <strong>${escapeHtml(m.FullName || '-')}</strong> सम्मको वंशावली</span>
                </div>
                <div class="ancestor-summary-count">
                    कुल पुस्ता: <strong>${generationCount}</strong>
                </div>
            </div>
            <div class="ancestor-chain">
        `;

        chain.forEach((ancestor, idx) => {
            const isOriginator = ancestor.__isOriginator === true;
            const isSelected = !isOriginator && (ancestor.PersonalCode === m.PersonalCode);

            // Generation number:
            //  - काँशीनाथ → 0 (or show a special icon)
            //  - others   → number of dot blocks
            let generation;
            if (isOriginator) {
                generation = '★';               // star icon
            } else {
                generation = getGenerationFromCode(ancestor.PersonalCode);
            }

            const photo = (ancestor.PhotoUrl && ancestor.PhotoUrl.trim() !== '')
                ? ancestor.PhotoUrl
                : '../no_pic.png';

            let nodeClasses = 'ancestor-node';
            if (isOriginator) nodeClasses += ' ancestor-originator';
            if (isSelected)   nodeClasses += ' ancestor-selected';

            // ✅ Uniform label: "मूलपुरूष" for काँशीनाथ, "पुस्ता N" for everyone else
            let roleLabel;
            if (isOriginator) {
                roleLabel = 'मूलपुरूष';
            } else {
                roleLabel = `पुस्ता ${generation}`;
            }

            html += `
                <div class="${nodeClasses}">
                    <div class="ancestor-step">
                        <span class="ancestor-step-badge ${isOriginator ? 'badge-originator' : ''}">${generation}</span>
                    </div>
                    <div class="ancestor-card">
                        <div class="ancestor-card-role">${roleLabel}</div>
                        <div class="ancestor-card-photo">
                            <img src="${escapeHtml(photo)}" alt="${escapeHtml(ancestor.FullName || '')}" loading="lazy">
                        </div>
                        <div class="ancestor-card-info">
                            <div class="ancestor-card-name">${escapeHtml(ancestor.FullName || '-')}</div>
                            <div class="ancestor-card-code"><i class="fas fa-qrcode"></i> ${escapeHtml(ancestor.PersonalCode || '-')}</div>
                            <div class="ancestor-card-dob"><i class="fas fa-calendar-alt"></i> ${escapeHtml(formatDob(ancestor))}</div>
                            ${ancestor.Address ? `<div class="ancestor-card-address"><i class="fas fa-map-pin"></i> ${escapeHtml(ancestor.Address)}</div>` : ''}
                            ${ancestor.Mobile ? `<div class="ancestor-card-mobile"><i class="fas fa-phone"></i> ${escapeHtml(ancestor.Mobile)}</div>` : ''}
                        </div>
                    </div>
                </div>
            `;

            if (idx < chain.length - 1) {
                html += `
                    <div class="ancestor-connector">
                        <span class="ancestor-connector-line"></span>
                        <i class="fas fa-chevron-down ancestor-connector-arrow"></i>
                    </div>
                `;
            }
        });

        html += '</div>';
        container.innerHTML = html;
    }

    // ------------------------------------------------------------
    // 10. Save as Image
    // ------------------------------------------------------------
    function saveElementAsImage(elementId, filename, saveBtn) {
        const element = document.getElementById(elementId);
        if (!element) {
            console.error('Element not found:', elementId);
            alert('तस्वीर सुरक्षित गर्न मिलेन। कृपया पुन: प्रयास गर्नुहोस्।');
            return;
        }

        if (saveBtn) {
            saveBtn.disabled = true;
            saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
        }

        const clone = element.cloneNode(true);
        const buttonsInClone = clone.querySelectorAll('button, .save-btn-icon, .btn-group');
        buttonsInClone.forEach(btn => btn.remove());

        const tempContainer = document.createElement('div');
        tempContainer.style.position = 'absolute';
        tempContainer.style.left = '-9999px';
        tempContainer.style.top = '-9999px';
        tempContainer.style.width = element.scrollWidth + 'px';
        tempContainer.style.background = '#ffffff';
        tempContainer.appendChild(clone);
        document.body.appendChild(tempContainer);

        html2canvas(clone, {
            scale: 2,
            useCORS: true,
            allowTaint: true,
            backgroundColor: '#ffffff',
            logging: false,
            width: clone.scrollWidth,
            height: clone.scrollHeight,
            windowWidth: clone.scrollWidth,
            windowHeight: clone.scrollHeight
        }).then(canvas => {
            document.body.removeChild(tempContainer);

            const link = document.createElement('a');
            link.download = filename || 'member-details.jpg';
            link.href = canvas.toDataURL('image/jpeg', 0.95);
            link.click();

            if (saveBtn) {
                saveBtn.disabled = false;
                saveBtn.innerHTML = '<i class="fas fa-save"></i>';
            }
        }).catch(error => {
            console.error('Error generating image:', error);
            document.body.removeChild(tempContainer);
            alert('तस्वीर सुरक्षित गर्न मिलेन। कृपया पुन: प्रयास गर्नुहोस्।');
            if (saveBtn) {
                saveBtn.disabled = false;
                saveBtn.innerHTML = '<i class="fas fa-save"></i>';
            }
        });
    }

    function makeFilename(prefix) {
        if (!currentSelectedMember) return 'member.jpg';
        const safe = (currentSelectedMember.FullName || 'member').replace(/[^a-zA-Z0-9\u0900-\u097F]+/g, '_');
        const code = (currentSelectedMember.PersonalCode || 'code').replace(/\./g, '-');
        return `${safe}_${code}_${prefix}.jpg`;
    }

    function saveMainViewAsImage() {
        if (!currentSelectedMember) { alert('कृपया पहिले एक सदस्य छान्नुहोस्।'); return; }
        saveElementAsImage('DescriptionBox', makeFilename('short'), document.getElementById('btnSaveImage'));
    }

    function saveDetailViewAsImage() {
        if (!currentSelectedMember) { alert('कृपया पहिले एक सदस्य छान्नुहोस्।'); return; }
        saveElementAsImage('modalCaptureArea', makeFilename('detail'), document.getElementById('btnSaveDetailImage'));
    }

    function saveFamilyViewAsImage() {
        if (!currentSelectedMember) { alert('कृपया पहिले एक सदस्य छान्नुहोस्।'); return; }
        saveElementAsImage('familyCaptureArea', makeFilename('family'), document.getElementById('btnSaveFamilyImage'));
    }

    function saveAncestorViewAsImage() {
        if (!currentSelectedMember) { alert('कृपया पहिले एक सदस्य छान्नुहोस्।'); return; }
        saveElementAsImage('ancestorCaptureArea', makeFilename('ancestors'), document.getElementById('btnSaveAncestorImage'));
    }

    // ------------------------------------------------------------
    // 11. Initialize
    // ------------------------------------------------------------
    function init() {
        attachDropdownEvents();
        initViewToggleButtons();

        document.getElementById('btnSaveImage')?.addEventListener('click', saveMainViewAsImage);
        document.getElementById('btnSaveDetailImage')?.addEventListener('click', saveDetailViewAsImage);
        document.getElementById('btnSaveFamilyImage')?.addEventListener('click', saveFamilyViewAsImage);
        document.getElementById('btnSaveAncestorImage')?.addEventListener('click', saveAncestorViewAsImage);

        hideAllSearchPanels();
        loadMembers();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    console.log('✅ SearchPage ready');
})();