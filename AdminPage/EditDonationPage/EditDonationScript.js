(function() {
    'use strict';

    // ---------------------------------------------------------
    // Supabase
    // ---------------------------------------------------------
    if (!window.SupabaseConfig || !window.SupabaseConfig.supabase) {
        console.error('❌ SupabaseConfig.js missing');
        alert('SupabaseConfig.js missing');
        return;
    }
    const supabase = window.SupabaseConfig.supabase;
    const SUPABASE_ANON_KEY = window.SupabaseConfig.SUPABASE_ANON_KEY;

    // ---------------------------------------------------------
    // Resolve Supabase URL from the client itself (robust)
    // ---------------------------------------------------------
    function getSupabaseUrl() {
        // 1) Prefer explicit config value
        if (window.SupabaseConfig.SUPABASE_URL) return window.SupabaseConfig.SUPABASE_URL;
        if (window.SupabaseConfig.url) return window.SupabaseConfig.url;

        // 2) Try to read it from the client internals
        try {
            const c = supabase;
            // Various shapes across supabase-js v2 versions
            const u = c?.supabaseUrl
                || c?.rest?.url?.split('/rest')[0]
                || c?.storageUrl?.split('/storage')[0]
                || c?.auth?.url?.split('/auth')[0]
                || c?.realtime?.url?.split('/realtime')[0];
            if (u) return u;
        } catch (e) {
            console.warn('Could not read URL from client:', e);
        }

        // 3) Hardcoded fallback (your project URL from earlier debug output)
        return 'https://icchczijubhzxkjpebps.supabase.co';
    }

    const SUPABASE_URL = getSupabaseUrl();
    console.log('🔗 Supabase URL resolved:', SUPABASE_URL);

    // ---------------------------------------------------------
    // Auth
    // ---------------------------------------------------------
    const LOGIN_PAGE_URL = '../LoginPage/LoginIndex.html';
    const SPECIAL_ADMIN_EMAIL = 'byaktigatkhata@gmail.com';

    let currentUser = null;

    async function checkPrivatePageAccess() {
        const { data: { session }, error } = await supabase.auth.getSession();
        if (error || !session?.user) {
            window.location.replace(LOGIN_PAGE_URL);
            return false;
        }
        currentUser = session.user;

        if (currentUser.email.toLowerCase() === SPECIAL_ADMIN_EMAIL.toLowerCase()) {
            return true;
        }

        const { data, error: dbError } = await supabase
            .from('admins')
            .select('admin_role, is_active')
            .eq('user_id', currentUser.id)
            .single();

        if (dbError || !data || data.is_active !== 'true') {
            alert('Access denied');
            window.location.replace(LOGIN_PAGE_URL);
            return false;
        }
        return true;
    }

    // ---------------------------------------------------------
    // Cloudinary
    // ---------------------------------------------------------
    const CLOUD_NAME = 'lv6z41ky';
    const IMG_PRESET = 'SquarePhotoPreset';
    const PDF_PRESET = 'OjhaBandhuPDFPreset';
    const IMG_URL = `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`;
    const RAW_URL = `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/raw/upload`;

    // ✅ Edge function URL — built from resolved URL
    const DELETE_FN = `${SUPABASE_URL}/functions/v1/delete-cloudinary-image`;
    console.log('🔗 Delete function URL:', DELETE_FN);

    function normalizePublicId(raw) {
        if (!raw) return '';
        let id = String(raw).trim();
        if (id.startsWith('http')) {
            try {
                const parts = id.split('/upload/');
                if (parts[1]) {
                    let afterUpload = parts[1];
                    afterUpload = afterUpload.replace(/^(?:[a-z]+_[a-z0-9]+(?:,[a-z]+_[a-z0-9]+)*\/)+/i, '');
                    afterUpload = afterUpload.replace(/^v\d+\//, '');
                    afterUpload = afterUpload.replace(/\.[a-zA-Z0-9]+(?:\?.*)?$/, '');
                    id = afterUpload;
                }
            } catch (err) {
                console.warn('⚠️ Could not parse URL:', err);
            }
        }
        return id.replace(/^\/+/, '').trim();
    }

    async function deleteCloudinaryImage(publicId) {
        const cleanId = normalizePublicId(publicId);
        if (!cleanId) {
            console.log('ℹ️ deleteCloudinaryImage: nothing to delete');
            return { success: true, skipped: true };
        }

        let token = SUPABASE_ANON_KEY;
        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (session?.access_token) token = session.access_token;
        } catch (e) {
            console.warn('Could not read session, using anon key');
        }

        const payload = { public_id: cleanId };
        console.log('🗑️ DELETE request →', DELETE_FN, payload);

        try {
            const r = await fetch(DELETE_FN, {
                method: 'POST',
                mode: 'cors',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                    // ⚠️ No 'apikey' header — it triggers the CORS preflight failure
                },
                body: JSON.stringify(payload)
            });

            const text = await r.text();
            let result;
            try { result = JSON.parse(text); } catch { result = { raw: text }; }

            console.log('🗑️ DELETE response status:', r.status, 'body:', result);

            if (!r.ok) {
                console.error('❌ Delete Cloudinary HTTP error:', r.status, result);
                return { success: false, error: result.error || result.message || r.statusText, result };
            }

            if (result.success === false) {
                const inner = result.result?.result || result.result;
                if (inner === 'not found') {
                    console.log('ℹ️ Image already deleted on Cloudinary');
                    return { success: true, alreadyDeleted: true, result };
                }
                console.error('❌ Delete Cloudinary function reported failure:', result);
                return { success: false, error: result.error || result.message || 'Unknown', result };
            }

            console.log('✅ Cloudinary image deleted:', cleanId);
            return { success: true, result };
        } catch (e) {
            console.error('❌ deleteCloudinaryImage exception:', e);
            console.error('   URL attempted:', DELETE_FN);
            console.error('   token length:', token?.length);
            return { success: false, error: e.message };
        }
    }

    async function uploadToCloudinary(file, preset, isPdf) {
        const fd = new FormData();
        fd.append('file', file);
        fd.append('upload_preset', preset);
        const r = await fetch(isPdf ? RAW_URL : IMG_URL, { method: 'POST', body: fd });
        if (!r.ok) throw new Error('Upload failed: ' + await r.text());
        const d = await r.json();
        return { secure_url: d.secure_url, public_id: d.public_id };
    }

    // ---------------------------------------------------------
    // DOM
    // ---------------------------------------------------------
    const form = document.getElementById('editDonationForm');
    const orgNameInput = document.getElementById('orgName');
    const orgAddressInput = document.getElementById('orgAddress');

    const bidhanFileInput = document.getElementById('bidhanFileInput');
    const bidhanFileUrlInput = document.getElementById('bidhanFileUrl');
    const bidhanPublicIdInput = document.getElementById('bidhanPublicId');
    const bidhanPreview = document.getElementById('bidhanPreview');
    const removeBidhanBtn = document.getElementById('removeBidhanBtn');

    const bodyRowsContainer = document.getElementById('bodyRowsContainer');
    const btnAddBodyRow = document.getElementById('btnAddBodyRow');

    const qrImageInput = document.getElementById('qrImageInput');
    const qrImageUrlInput = document.getElementById('qrImageUrl');
    const qrPreview = document.getElementById('qrPreview');
    const removeQrBtn = document.getElementById('removeQrBtn');

    const logoImageInput = document.getElementById('logoImageInput');
    const logoImageUrlInput = document.getElementById('logoImageUrl');
    const logoPreview = document.getElementById('logoPreview');
    const removeLogoBtn = document.getElementById('removeLogoBtn');

    const btnSave = document.getElementById('btnSaveDonation');
    const btnBack = document.getElementById('btnBackToDashboard');
    const btnLogout = document.getElementById('btnLogout');

    let currentQrPublicId = null, currentLogoPublicId = null;
    let currentQrUrl = null, currentLogoUrl = null;
    let currentBidhanUrl = null, currentBidhanPublicId = null;

    let membersList = [];

    // ---------------------------------------------------------
    // Devanagari → Latin transliteration
    // ---------------------------------------------------------
    const DEVANAGARI_MAP = {
        'अ':'a','आ':'aa','इ':'i','ई':'ee','उ':'u','ऊ':'oo','ऋ':'ri',
        'ए':'e','ऐ':'ai','ओ':'o','औ':'au','अं':'an','अः':'ah',
        'क':'k','ख':'kh','ग':'g','घ':'gh','ङ':'ng',
        'च':'ch','छ':'chh','ज':'j','झ':'jh','ञ':'n',
        'ट':'t','ठ':'th','ड':'d','ढ':'dh','ण':'n',
        'त':'t','थ':'th','द':'d','ध':'dh','न':'n',
        'प':'p','फ':'ph','ब':'b','भ':'bh','म':'m',
        'य':'y','र':'r','ल':'l','व':'v','श':'sh','ष':'sh','स':'s','ह':'h',
        'क्ष':'ksh','त्र':'tr','ज्ञ':'gy',
        'ा':'a','ि':'i','ी':'i','ु':'u','ू':'u','ृ':'ri',
        'े':'e','ै':'ai','ो':'o','ौ':'au','ं':'n','ः':'h','्':'',
        '१':'1','२':'2','३':'3','४':'4','५':'5',
        '६':'6','७':'7','८':'8','९':'9','०':'0'
    };

    function transliterate(text) {
        if (!text) return '';
        const normalized = String(text).normalize('NFC');
        let out = '';
        for (const ch of normalized) {
            if (ch === '\u200C' || ch === '\u200D' || ch === '\uFEFF') continue;
            out += (DEVANAGARI_MAP[ch] !== undefined) ? DEVANAGARI_MAP[ch] : ch;
        }
        return out;
    }

    // ---------------------------------------------------------
    // Load members
    // ---------------------------------------------------------
    async function loadMembersList() {
        const { data, error } = await supabase.from('MemberDataTable').select('*');

        if (error) {
            console.error('MemberDataTable error:', error);
            membersList = [];
            return;
        }
        if (!data || data.length === 0) {
            membersList = [];
            return;
        }

        const keys = Object.keys(data[0]);
        const findKey = (cands) =>
            keys.find(k => cands.some(c => c.toLowerCase() === k.toLowerCase()));

        const nameKey  = findKey(['FullName', 'full_name', 'name']);
        const codeKey  = findKey(['PersonalCode', 'personal_code', 'code']);
        const photoKey = findKey(['PhtoUrl', 'PhotoUrl', 'photo_url', 'photo']);
        const engKey   = findKey([
            'EnglishName', 'FullNameEnglish', 'NameEnglish',
            'FullNameEn', 'EnglishFullName', 'NameEn', 'english_name'
        ]);

        membersList = data.map(r => ({
            FullName:     nameKey  ? (r[nameKey]  || '') : '',
            PersonalCode: codeKey  ? (r[codeKey]  || '') : '',
            PhtoUrl:      photoKey ? (r[photoKey] || '') : '',
            EnglishName:  engKey   ? (r[engKey]   || '') : ''
        })).filter(m => m.FullName || m.PersonalCode);

        console.log(`✅ Loaded ${membersList.length} members. English column: ${engKey || '(none — using transliteration)'}`);
    }

    // ---------------------------------------------------------
    // Filter
    // ---------------------------------------------------------
    function filterMembers(query) {
        const raw = String(query || '').trim();
        if (!raw) return membersList.slice();

        const q = raw.toLowerCase();
        const isLatin = /[a-z0-9]/i.test(q) && !/[\u0900-\u097F]/.test(q);

        const results = [];

        for (const m of membersList) {
            const nepali  = String(m.FullName     || '').toLowerCase();
            const english = String(m.EnglishName  || '').toLowerCase();
            const code    = String(m.PersonalCode || '').toLowerCase();

            if (nepali.includes(q) || english.includes(q) || code.includes(q)) {
                results.push(m);
                continue;
            }

            if (isLatin) {
                const translit = transliterate(m.FullName).toLowerCase();
                const words = translit.split(/\s+/).filter(Boolean);

                if (words.some(w => w.startsWith(q))) {
                    results.push(m);
                    continue;
                }

                const skeletonMatch = words.some(w => {
                    const skel = w.replace(/[aeiou]/g, '');
                    const qSkel = q.replace(/[aeiou]/g, '');
                    return qSkel.length > 0 && skel.startsWith(qSkel);
                });
                if (skeletonMatch) results.push(m);
            }
        }

        return results;
    }

    // ---------------------------------------------------------
    // Combobox
    // ---------------------------------------------------------
    function createMemberCombobox(selectedCode = '') {
        const wrap = document.createElement('div');
        wrap.className = 'member-combo-wrap';

        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'member-combo-input';
        input.placeholder = 'सदस्य खोज्नुहोस्...';
        input.autocomplete = 'off';

        const arrow = document.createElement('i');
        arrow.className = 'fas fa-chevron-down member-combo-arrow';

        const list = document.createElement('div');
        list.className = 'member-combo-list';

        const hidden = document.createElement('input');
        hidden.type = 'hidden';
        hidden.value = selectedCode || '';

        wrap.appendChild(input);
        wrap.appendChild(arrow);
        wrap.appendChild(list);
        wrap.appendChild(hidden);

        let activeIndex = -1;
        let filtered = [];
        let isSelected = false;

        function photoHtml(m) {
            if (m.PhtoUrl) {
                return `<img class="combo-photo" src="${m.PhtoUrl}" loading="lazy"
                    onerror="this.outerHTML='<div class=\\'combo-photo placeholder\\'><i class=\\'fas fa-user\\'></i></div>'">`;
            }
            return `<div class="combo-photo placeholder"><i class="fas fa-user"></i></div>`;
        }

        function render() {
            if (filtered.length === 0) {
                list.innerHTML = '<div class="member-combo-empty">कुनै सदस्य भेटिएन</div>';
                return;
            }
            list.innerHTML = filtered.map((m, i) => {
                const codeAttr = String(m.PersonalCode || '').replace(/"/g, '&quot;');
                const eng = m.EnglishName
                    ? `<div class="combo-code">${m.EnglishName}</div>` : '';
                return `<div class="member-combo-item ${i === activeIndex ? 'active' : ''}"
                    data-code="${codeAttr}">
                    ${photoHtml(m)}
                    <div class="combo-info">
                        <div class="combo-name">${m.FullName || '(no name)'}</div>
                        ${eng}
                        <div class="combo-code">${m.PersonalCode || ''}</div>
                    </div>
                </div>`;
            }).join('');
        }

        function openList() {
            if (isSelected) {
                isSelected = false;
                hidden.value = '';
                input.value = '';
                wrap.dispatchEvent(new CustomEvent('member-selected', {
                    bubbles: true, detail: { member: null }
                }));
            }
            filtered = filterMembers(input.value);
            activeIndex = -1;
            render();
            list.classList.add('open');
        }

        function closeList() {
            list.classList.remove('open');
            activeIndex = -1;
        }

        function selectMember(code) {
            const m = membersList.find(x => String(x.PersonalCode) === String(code));
            if (!m) return;
            isSelected = true;
            hidden.value = m.PersonalCode;
            input.value = `${m.FullName} (${m.PersonalCode})`;
            wrap.dispatchEvent(new CustomEvent('member-selected', {
                bubbles: true, detail: { member: m }
            }));
            closeList();
        }

        input.addEventListener('focus', openList);

        input.addEventListener('mousedown', () => {
            if (!list.classList.contains('open')) {
                setTimeout(openList, 0);
            }
        });

        input.addEventListener('input', () => {
            isSelected = false;
            hidden.value = '';
            filtered = filterMembers(input.value);
            activeIndex = -1;
            render();
            list.classList.add('open');
        });

        input.addEventListener('keydown', (e) => {
            if (!list.classList.contains('open')) {
                if (e.key === 'ArrowDown' || e.key === 'Enter') {
                    openList();
                    e.preventDefault();
                }
                return;
            }
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                activeIndex = Math.min(activeIndex + 1, filtered.length - 1);
                render();
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                activeIndex = Math.max(activeIndex - 1, 0);
                render();
            } else if (e.key === 'Enter') {
                e.preventDefault();
                if (activeIndex >= 0 && filtered[activeIndex]) {
                    selectMember(filtered[activeIndex].PersonalCode);
                } else if (filtered.length === 1) {
                    selectMember(filtered[0].PersonalCode);
                }
            } else if (e.key === 'Escape') {
                closeList();
            }
        });

        list.addEventListener('mousedown', (e) => {
            const item = e.target.closest('.member-combo-item');
            if (!item) return;
            e.preventDefault();
            selectMember(item.dataset.code);
        });

        if (selectedCode) {
            const m = membersList.find(x => String(x.PersonalCode) === String(selectedCode));
            if (m) {
                isSelected = true;
                input.value = `${m.FullName} (${m.PersonalCode})`;
            }
        }

        wrap._getValue = () => hidden.value;
        return wrap;
    }

    document.addEventListener('mousedown', (e) => {
        document.querySelectorAll('.member-combo-wrap').forEach(w => {
            if (!w.contains(e.target)) {
                const l = w.querySelector('.member-combo-list');
                if (l) l.classList.remove('open');
            }
        });
    });

    // ---------------------------------------------------------
    // Selected member card
    // ---------------------------------------------------------
    function makeCard() {
        const c = document.createElement('div');
        c.className = 'selected-member-card empty';
        c.innerHTML = '<span>कुनै सदस्य छानिएको छैन</span>';
        return c;
    }
    function paintCard(card, m) {
        if (!m) {
            card.className = 'selected-member-card empty';
            card.innerHTML = '<span>कुनै सदस्य छानिएको छैन</span>';
            return;
        }
        card.className = 'selected-member-card';
        const photo = m.PhtoUrl
            ? `<img class="sel-photo" src="${m.PhtoUrl}" loading="lazy"
                onerror="this.outerHTML='<div class=\\'sel-photo placeholder\\'><i class=\\'fas fa-user\\'></i></div>'">`
            : `<div class="sel-photo placeholder"><i class="fas fa-user"></i></div>`;
        card.innerHTML = `${photo}
            <div class="sel-info">
                <div class="sel-name">${m.FullName}</div>
                <div class="sel-code">Code: ${m.PersonalCode}</div>
            </div>`;
    }

    // ---------------------------------------------------------
    // Body rows
    // ---------------------------------------------------------
    function createBodyRow(post = '', code = '') {
        const row = document.createElement('div');
        row.className = 'body-row';

        const postGroup = document.createElement('div');
        postGroup.className = 'field-group';
        postGroup.innerHTML = `<label>पद (Post)</label>
            <input type="text" class="body-post-input" placeholder="उदा. अध्यक्ष" value="${post}">`;

        const memberGroup = document.createElement('div');
        memberGroup.className = 'field-group';
        memberGroup.innerHTML = '<label>सदस्य (Member)</label>';

        const combo = createMemberCombobox(code);
        memberGroup.appendChild(combo);

        const card = makeCard();
        memberGroup.appendChild(card);

        if (code) {
            const m = membersList.find(x => String(x.PersonalCode) === String(code));
            paintCard(card, m || null);
        }

        combo.addEventListener('member-selected', e => paintCard(card, e.detail.member));

        const rm = document.createElement('button');
        rm.type = 'button';
        rm.className = 'btn-remove-row';
        rm.innerHTML = '<i class="fas fa-times"></i>';
        rm.addEventListener('click', () => {
            if (bodyRowsContainer.children.length <= 1) {
                alert('कम्तीमा एक सदस्य आवश्यक छ।');
                return;
            }
            row.remove();
        });

        row.appendChild(postGroup);
        row.appendChild(memberGroup);
        row.appendChild(rm);
        row._getCombo = () => combo;
        return row;
    }

    function addBodyRow(post = '', code = '') {
        bodyRowsContainer.appendChild(createBodyRow(post, code));
    }

    function getBodyRowsData() {
        const rows = [];
        bodyRowsContainer.querySelectorAll('.body-row').forEach(r => {
            const post = r.querySelector('.body-post-input').value.trim();
            const combo = r._getCombo ? r._getCombo() : null;
            const code = combo ? combo._getValue() : '';
            const m = membersList.find(x => String(x.PersonalCode) === String(code));
            if (post || code) {
                rows.push({
                    post,
                    memberCode: code,
                    memberName: m ? m.FullName : '',
                    photoUrl: m ? (m.PhtoUrl || '') : ''
                });
            }
        });
        return rows;
    }

    function renderBodyRows(bodyData) {
        bodyRowsContainer.innerHTML = '';
        if (Array.isArray(bodyData) && bodyData.length > 0) {
            bodyData.forEach(b => addBodyRow(b.post || '', b.memberCode || ''));
        } else {
            addBodyRow(); addBodyRow(); addBodyRow();
        }
    }

    btnAddBodyRow.addEventListener('click', () => addBodyRow());

    // ---------------------------------------------------------
    // Donation data
    // ---------------------------------------------------------
    async function loadDonationData() {
        const { data, error } = await supabase
            .from('DonationDataTable')
            .select('Name, Value');

        if (error) {
            console.error('DonationDataTable error:', error);
            renderBodyRows(null);
            return;
        }

        if (!data || data.length === 0) {
            renderBodyRows(null);
            return;
        }

        const map = {};
        data.forEach(r => { map[r.Name] = r.Value; });

        if (map['Name']) orgNameInput.value = map['Name'];
        if (map['Address']) orgAddressInput.value = map['Address'];

        if (map['BidhanUrl']) {
            currentBidhanUrl = map['BidhanUrl'];
            bidhanFileUrlInput.value = currentBidhanUrl;
            bidhanPreview.innerHTML =
                `<a href="${currentBidhanUrl}" target="_blank"><i class="fas fa-file-pdf"></i> विधान PDF हेर्नुहोस्</a>`;
        }
        if (map['BidhanPublicId']) {
            currentBidhanPublicId = map['BidhanPublicId'];
            bidhanPublicIdInput.value = currentBidhanPublicId;
        }

        let bodyData = null;
        if (map['Body']) {
            try { bodyData = JSON.parse(map['Body']); }
            catch (e) { console.warn('Body JSON err:', e); }
        }
        renderBodyRows(bodyData);

        if (map['QrCodeUrl']) {
            currentQrUrl = map['QrCodeUrl'];
            qrImageUrlInput.value = currentQrUrl;
            qrPreview.innerHTML = `<img src="${currentQrUrl}" loading="lazy">`;
        }
        if (map['QrCodePublicId']) currentQrPublicId = map['QrCodePublicId'];

        if (map['LogoUrl']) {
            currentLogoUrl = map['LogoUrl'];
            logoImageUrlInput.value = currentLogoUrl;
            logoPreview.innerHTML = `<img src="${currentLogoUrl}" loading="lazy">`;
        }
        if (map['LogoPublicId']) currentLogoPublicId = map['LogoPublicId'];

        console.log('📦 Loaded donation data — current PublicIds:', {
            qr: currentQrPublicId,
            logo: currentLogoPublicId,
            bidhan: currentBidhanPublicId
        });

        updateRemoveBtns();
    }

    function updateRemoveBtns() {
        removeQrBtn.style.display = currentQrUrl ? 'inline-flex' : 'none';
        removeLogoBtn.style.display = currentLogoUrl ? 'inline-flex' : 'none';
        removeBidhanBtn.style.display = currentBidhanUrl ? 'inline-flex' : 'none';
    }

    // ---------------------------------------------------------
    // Upsert + Save
    // ---------------------------------------------------------
    async function upsert(name, value) {
        const { data: existing, error: selErr } = await supabase
            .from('DonationDataTable')
            .select('id')
            .eq('Name', name)
            .maybeSingle();

        if (selErr && selErr.code !== 'PGRST116') throw selErr;

        if (existing) {
            const { error } = await supabase
                .from('DonationDataTable')
                .update({ Value: value })
                .eq('Name', name);
            if (error) throw error;
        } else {
            const { error } = await supabase
                .from('DonationDataTable')
                .insert({ Name: name, Value: value });
            if (error) throw error;
        }
    }

    async function saveDonationData() {
        btnSave.disabled = true;
        btnSave.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
        try {
            await upsert('Name', orgNameInput.value.trim());
            await upsert('Address', orgAddressInput.value.trim());
            await upsert('Body', JSON.stringify(getBodyRowsData()));

            // ---- Bidhan PDF ----
            if (bidhanFileInput.files[0]) {
                const f = bidhanFileInput.files[0];

                if (currentBidhanPublicId) {
                    console.log('🗑️ Deleting old Bidhan PDF with public_id:', currentBidhanPublicId);
                    const delRes = await deleteCloudinaryImage(currentBidhanPublicId);
                    if (!delRes.success) {
                        console.warn('⚠️ Old Bidhan PDF was not deleted:', delRes.error);
                    }
                }

                const r = await uploadToCloudinary(f, PDF_PRESET, true);
                currentBidhanUrl = r.secure_url;
                currentBidhanPublicId = r.public_id;
                bidhanFileUrlInput.value = currentBidhanUrl;
                bidhanPublicIdInput.value = currentBidhanPublicId;
                await upsert('BidhanUrl', currentBidhanUrl);
                await upsert('BidhanPublicId', currentBidhanPublicId);
                bidhanPreview.innerHTML =
                    `<a href="${currentBidhanUrl}" target="_blank"><i class="fas fa-file-pdf"></i> विधान PDF हेर्नुहोस्</a>`;
                bidhanFileInput.value = '';
            }

            // ---- QR Code image ----
            if (qrImageInput.files[0]) {
                const f = qrImageInput.files[0];

                if (currentQrPublicId) {
                    console.log('🗑️ Deleting old QR image with public_id:', currentQrPublicId);
                    const delRes = await deleteCloudinaryImage(currentQrPublicId);
                    if (!delRes.success) {
                        console.warn('⚠️ Old QR image was not deleted:', delRes.error);
                    }
                }

                const r = await uploadToCloudinary(f, IMG_PRESET, false);
                currentQrUrl = r.secure_url;
                currentQrPublicId = r.public_id;
                qrImageUrlInput.value = currentQrUrl;
                await upsert('QrCodeUrl', currentQrUrl);
                await upsert('QrCodePublicId', currentQrPublicId);
                qrPreview.innerHTML = `<img src="${currentQrUrl}" loading="lazy">`;
                qrImageInput.value = '';
            }

            // ---- Logo image ----
            if (logoImageInput.files[0]) {
                const f = logoImageInput.files[0];

                if (currentLogoPublicId) {
                    console.log('🗑️ Deleting old Logo image with public_id:', currentLogoPublicId);
                    const delRes = await deleteCloudinaryImage(currentLogoPublicId);
                    if (!delRes.success) {
                        console.warn('⚠️ Old Logo image was not deleted:', delRes.error);
                    }
                }

                const r = await uploadToCloudinary(f, IMG_PRESET, false);
                currentLogoUrl = r.secure_url;
                currentLogoPublicId = r.public_id;
                logoImageUrlInput.value = currentLogoUrl;
                await upsert('LogoUrl', currentLogoUrl);
                await upsert('LogoPublicId', currentLogoPublicId);
                logoPreview.innerHTML = `<img src="${currentLogoUrl}" loading="lazy">`;
                logoImageInput.value = '';
            }

            updateRemoveBtns();
            alert('✅ Saved!');
        } catch (e) {
            console.error('Save error:', e);
            alert('Save error: ' + e.message);
        } finally {
            btnSave.disabled = false;
            btnSave.innerHTML = '<i class="fas fa-save"></i> Save Changes';
        }
    }

    // ---------------------------------------------------------
    // Remove handlers
    // ---------------------------------------------------------
    removeQrBtn.addEventListener('click', async () => {
        if (!confirm('Remove QR?')) return;
        if (currentQrPublicId) await deleteCloudinaryImage(currentQrPublicId);
        currentQrUrl = null; currentQrPublicId = null;
        qrImageUrlInput.value = '';
        await upsert('QrCodeUrl', ''); await upsert('QrCodePublicId', '');
        qrPreview.innerHTML = '<span class="placeholder-text">कुनै QR कोड छैन</span>';
        updateRemoveBtns();
    });
    removeLogoBtn.addEventListener('click', async () => {
        if (!confirm('Remove logo?')) return;
        if (currentLogoPublicId) await deleteCloudinaryImage(currentLogoPublicId);
        currentLogoUrl = null; currentLogoPublicId = null;
        logoImageUrlInput.value = '';
        await upsert('LogoUrl', ''); await upsert('LogoPublicId', '');
        logoPreview.innerHTML = '<span class="placeholder-text">कुनै लोगो छैन</span>';
        updateRemoveBtns();
    });
    removeBidhanBtn.addEventListener('click', async () => {
        if (!confirm('Remove PDF?')) return;
        if (currentBidhanPublicId) await deleteCloudinaryImage(currentBidhanPublicId);
        currentBidhanUrl = null; currentBidhanPublicId = null;
        bidhanFileUrlInput.value = ''; bidhanPublicIdInput.value = '';
        await upsert('BidhanUrl', ''); await upsert('BidhanPublicId', '');
        bidhanPreview.innerHTML = '<span class="placeholder-text">कुनै विधान PDF छैन</span>';
        updateRemoveBtns();
    });

    // ---------------------------------------------------------
    // File inputs — shared PhotoCropper
    // ---------------------------------------------------------
    qrImageInput.addEventListener('change', function() {
        const file = this.files[0];
        if (!file) return;

        PhotoCropper.open(
            file,
            { aspect: 1, title: 'QR कोड क्रप गर्नुहोस् (1:1)' },
            (croppedBlob) => {
                const croppedFile = new File([croppedBlob], 'qr.jpg', { type: 'image/jpeg' });
                const dt = new DataTransfer();
                dt.items.add(croppedFile);
                qrImageInput.files = dt.files;

                const reader = new FileReader();
                reader.onload = e => qrPreview.innerHTML = `<img src="${e.target.result}">`;
                reader.readAsDataURL(croppedFile);
            }
        );
        this.value = '';
    });

    logoImageInput.addEventListener('change', function() {
        const file = this.files[0];
        if (!file) return;

        PhotoCropper.open(
            file,
            { aspect: 1, title: 'लोगो क्रप गर्नुहोस् (1:1)' },
            (croppedBlob) => {
                const croppedFile = new File([croppedBlob], 'logo.jpg', { type: 'image/jpeg' });
                const dt = new DataTransfer();
                dt.items.add(croppedFile);
                logoImageInput.files = dt.files;

                const reader = new FileReader();
                reader.onload = e => logoPreview.innerHTML = `<img src="${e.target.result}">`;
                reader.readAsDataURL(croppedFile);
            }
        );
        this.value = '';
    });

    bidhanFileInput.addEventListener('change', function() {
        if (this.files[0]) {
            bidhanPreview.innerHTML =
                `<span style="color:#00c;font-weight:bold;">📄 ${this.files[0].name} (ready)</span>`;
        }
    });

    // ---------------------------------------------------------
    // Navigation
    // ---------------------------------------------------------
    btnBack.addEventListener('click', () => {
        window.location.href = '../AdminDashboardPage/AdminDashboardIndex.html';
    });
    btnLogout.addEventListener('click', async () => {
        if (!confirm('Logout?')) return;
        await supabase.auth.signOut();
        window.location.replace(LOGIN_PAGE_URL);
    });

    // ---------------------------------------------------------
    // Form submit
    // ---------------------------------------------------------
    form.addEventListener('submit', async e => {
        e.preventDefault();
        if (!orgNameInput.value.trim()) { alert('Name required'); orgNameInput.focus(); return; }
        if (!orgAddressInput.value.trim()) { alert('Address required'); orgAddressInput.focus(); return; }
        await saveDonationData();
    });

    // ---------------------------------------------------------
    // Boot
    // ---------------------------------------------------------
    (async function init() {
        const ok = await checkPrivatePageAccess();
        if (!ok) return;
        await loadMembersList();
        await loadDonationData();
        console.log('✅ Edit Donation page ready.');
    })();

})();