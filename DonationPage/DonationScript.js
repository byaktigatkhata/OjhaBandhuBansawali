(function() {
    'use strict';

    // ============================================================
    // 1. Supabase
    // ============================================================
    if (!window.SupabaseConfig || !window.SupabaseConfig.supabase) {
        console.error('❌ SupabaseConfig.js not loaded properly!');
        alert('Configuration error: SupabaseConfig.js is missing.');
        return;
    }
    const supabase = window.SupabaseConfig.supabase;
    const SUPABASE_ANON_KEY = window.SupabaseConfig.SUPABASE_ANON_KEY;

    function getSupabaseUrl() {
        if (window.SupabaseConfig.SUPABASE_URL) return window.SupabaseConfig.SUPABASE_URL;
        if (window.SupabaseConfig.url) return window.SupabaseConfig.url;
        try {
            const u = supabase?.supabaseUrl || supabase?.rest?.url?.split('/rest')[0];
            if (u) return u;
        } catch (e) {}
        return 'https://icchczijubhzxkjpebps.supabase.co';
    }
    const SUPABASE_URL = getSupabaseUrl();
    const UPLOAD_FN = `${SUPABASE_URL}/functions/v1/upload-to-imgbb`;

    // ============================================================
    // 2. DOM References
    // ============================================================
    const orgLogo = document.getElementById('orgLogo');
    const orgLogoPlaceholder = document.getElementById('orgLogoPlaceholder');
    const orgNameDisplay = document.getElementById('orgNameDisplay');
    const orgAddressDisplay = document.getElementById('orgAddressDisplay');

    const orgQr = document.getElementById('orgQr');
    const orgQrPlaceholder = document.getElementById('orgQrPlaceholder');

    const bodyToggleBtn = document.getElementById('bodyToggleBtn');
    const bodyToggleChevron = document.getElementById('bodyToggleChevron');
    const orgBodySection = document.getElementById('orgBodySection');
    const orgBodyList = document.getElementById('orgBodyList');

    const form = document.getElementById('donationForm');
    const donnerNameInput = document.getElementById('donnerName');
    const donnerAddressInput = document.getElementById('donnerAddress');
    const donationAmountInput = document.getElementById('donationAmount');
    const donationDateInput = document.getElementById('donationDate');

    const photoInput = document.getElementById('photoInput');
    const choosePhotoBtn = document.getElementById('choosePhotoBtn');
    const photoFileName = document.getElementById('photoFileName');
    const photoPreview = document.getElementById('photoPreview');
    const removePhotoBtn = document.getElementById('removePhotoBtn');
    const photoUrlInput = document.getElementById('photoUrl');

    const feedback = document.getElementById('formFeedback');
    const btnSubmit = document.getElementById('btnSubmit');
    const btnReset = document.getElementById('btnReset');
    const btnBidhan = document.getElementById('btnBidhan');

    // Bidhan modal
    const bidhanModal = document.getElementById('bidhanModal');
    const bidhanFrame = document.getElementById('bidhanFrame');
    const bidhanDownloadLink = document.getElementById('bidhanDownloadLink');
    const bidhanModalClose = document.getElementById('bidhanModalClose');

    // Member modal
    const memberModal = document.getElementById('memberModal');
    const memberModalTitle = document.getElementById('memberModalTitle');
    const memberModalBody = document.getElementById('memberModalBody');
    const memberModalClose = document.getElementById('memberModalClose');

    // ============================================================
    // 3. State
    // ============================================================
    let membersMap = {};        // PersonalCode -> full member record
    let currentBidhanUrl = '';  // set on load

    // ============================================================
    // 4. Load org info
    // ============================================================
    async function loadOrgInfo() {
        try {
            const { data, error } = await supabase
                .from('DonationDataTable')
                .select('Name, Value')
                .in('Name', [
                    'Name', 'Address', 'BidhanUrl',
                    'QrCodeUrl', 'LogoUrl', 'Body'
                ]);

            if (error) throw error;

            const map = {};
            (data || []).forEach(r => { map[r.Name] = r.Value; });

            if (map['Name']) orgNameDisplay.textContent = map['Name'];
            if (map['Address']) orgAddressDisplay.textContent = map['Address'];

            if (map['BidhanUrl']) {
                currentBidhanUrl = map['BidhanUrl'];
                btnBidhan.disabled = false;
            } else {
                btnBidhan.disabled = true;
                btnBidhan.title = 'विधान उपलब्ध छैन';
            }

            if (map['LogoUrl']) {
                orgLogo.src = map['LogoUrl'];
                orgLogo.style.display = 'block';
                orgLogoPlaceholder.style.display = 'none';
            }

            if (map['QrCodeUrl']) {
                orgQr.src = map['QrCodeUrl'];
                orgQr.style.display = 'block';
                orgQrPlaceholder.style.display = 'none';
            }

            // Preload members BEFORE rendering body
            await loadMembersLookup();

            // Body JSON
            let bodyData = null;
            if (map['Body']) {
                try { bodyData = JSON.parse(map['Body']); }
                catch (e) { console.warn('Body JSON parse error:', e); }
            }

            if (Array.isArray(bodyData) && bodyData.length > 0) {
                renderBody(bodyData);
            } else {
                // Hide the toggle entirely if no body
                document.getElementById('BodyBox').style.display = 'none';
            }

        } catch (err) {
            console.error('❌ loadOrgInfo error:', err);
        }
    }

    async function loadMembersLookup() {
        try {
            // Fetch all columns we may need for the detail popup
            const { data, error } = await supabase
                .from('MemberDataTable')
                .select('*');

            if (error) {
                console.warn('Could not preload members:', error);
                return;
            }

            (data || []).forEach(m => {
                const photo = m.PhotoUrl || m.PhtoUrl || '';
                membersMap[m.PersonalCode] = { ...m, _photo: photo };
            });

            console.log(`✅ Preloaded ${Object.keys(membersMap).length} members.`);
        } catch (err) {
            console.warn('loadMembersLookup error:', err);
        }
    }

    // ============================================================
    // 5. Render body
    // ============================================================
    function renderBody(bodyArray) {
        orgBodyList.innerHTML = '';

        bodyArray.forEach(item => {
            const post = item.post || '';
            const code = item.memberCode || '';
            const lookup = membersMap[code] || {};
            const name = item.memberName || lookup.FullName || '';
            const photo = item.photoUrl || lookup._photo || '';

            if (!post && !code) return;

            const div = document.createElement('div');
            div.className = 'org-body-item';
            div.dataset.code = code;

            const photoHtml = photo
                ? `<img class="org-body-photo" src="${photo}" alt="${name}" loading="lazy"
                        onerror="this.outerHTML='<div class=\\'org-body-photo placeholder\\'><i class=\\'fas fa-user\\'></i></div>'">`
                : `<div class="org-body-photo placeholder"><i class="fas fa-user"></i></div>`;

            div.innerHTML = `
                ${photoHtml}
                <div class="org-body-info">
                    <div class="org-body-post">${post || 'सदस्य'}</div>
                    <div class="org-body-name">${name || '(नाम अज्ञात)'}</div>
                    ${code ? `<div class="org-body-code">${code}</div>` : ''}
                </div>
            `;

            div.addEventListener('click', () => showMemberDetail(code, post));
            orgBodyList.appendChild(div);
        });

        if (orgBodyList.children.length > 0) {
            document.getElementById('BodyBox').style.display = 'block';
        }
    }

    // ============================================================
    // 6. Body toggle (collapsible)
    // ============================================================
    bodyToggleBtn.addEventListener('click', () => {
        const isOpen = orgBodySection.style.display !== 'none';
        if (isOpen) {
            orgBodySection.style.display = 'none';
            bodyToggleChevron.classList.remove('open');
        } else {
            orgBodySection.style.display = 'block';
            bodyToggleChevron.classList.add('open');
        }
    });

    // ============================================================
    // 7. Member detail popup
    // ============================================================
    function showMemberDetail(code, post) {
        const m = membersMap[code];

        if (!m) {
            memberModalTitle.textContent = 'सदस्यको विवरण';
            memberModalBody.innerHTML = `
                <div class="member-detail-row">
                    <div class="dt-label">जानकारी</div>
                    <div class="dt-value empty">यो सदस्यको थप जानकारी उपलब्ध छैन।</div>
                </div>
                <div class="member-detail-row">
                    <div class="dt-label">कोड</div>
                    <div class="dt-value">${code || '—'}</div>
                </div>
                ${post ? `<div class="member-detail-row"><div class="dt-label">पद</div><div class="dt-value">${post}</div></div>` : ''}
            `;
            memberModal.style.display = 'flex';
            return;
        }

        const photo = m._photo || '';
        const name = m.FullName || '(नाम अज्ञात)';

        memberModalTitle.textContent = name;

        const photoHtml = photo
            ? `<img class="member-detail-photo" src="${photo}" alt="${name}"
                    onerror="this.outerHTML='<div class=\\'member-detail-photo placeholder\\'><i class=\\'fas fa-user\\'></i></div>'">`
            : `<div class="member-detail-photo placeholder"><i class="fas fa-user"></i></div>`;

        const rows = [
            ['पद', post || m.Position || ''],
            ['व्यक्तिगत कोड', m.PersonalCode || ''],
            ['पुरा नाम', m.FullName || ''],
            ['लिङ्ग', formatGender(m.Gender)],
            ['ठेगाना', m.Address || ''],
            ['मोबाइल', m.Mobile || ''],
            ['इमेल', m.Email || ''],
            ['बाबुको नाम', m.Father || ''],
            ['आमाको नाम', m.Mother || ''],
            ['श्रीमान/श्रीमती', m.Spouse || ''],
            ['जन्म मिति', m.DOB || ''],
            ['छोराहरू', m.Sons || ''],
            ['छोरीहरू', m.Daughters || ''],
            ['पेशा', m.Profession || ''],
            ['शैक्षिक योग्यता', m.Qualification || ''],
            ['स्थान', m.Position || ''],
            ['विस्तृत ठेगाना', m.DetailAddress || ''],
            ['विस्तृत व्यवसाय', m.DetailProfession || ''],
            ['जीवन कथा', m.LifeStory || ''],
            ['मृत्यु मिति/उमेर', m.DOD_Age || '']
        ];

        const rowsHtml = rows
            .filter(([_, v]) => v && String(v).trim() !== '')
            .map(([label, value]) => `
                <div class="member-detail-row">
                    <div class="dt-label">${label}</div>
                    <div class="dt-value">${escapeHtml(value)}</div>
                </div>
            `).join('');

        memberModalBody.innerHTML = `
            <div class="member-detail-header">
                ${photoHtml}
                <div class="member-detail-info">
                    ${post ? `<div class="member-detail-post">${escapeHtml(post)}</div>` : ''}
                    <div class="member-detail-name">${escapeHtml(name)}</div>
                    <div class="member-detail-code">${escapeHtml(m.PersonalCode || '')}</div>
                </div>
            </div>
            ${rowsHtml || '<div class="member-detail-row"><div class="dt-value empty">थप विवरण उपलब्ध छैन।</div></div>'}
        `;

        memberModal.style.display = 'flex';
    }

    function formatGender(g) {
        if (g === 'M') return 'पुरूष';
        if (g === 'F') return 'महिला';
        if (g === 'N' || g === 'O') return 'अन्य';
        return '';
    }

    function escapeHtml(s) {
        return String(s || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    memberModalClose.addEventListener('click', () => memberModal.style.display = 'none');
    memberModal.addEventListener('click', (e) => {
        if (e.target === memberModal) memberModal.style.display = 'none';
    });

    // ============================================================
    // 8. Bidhan modal
    // ============================================================
    btnBidhan.addEventListener('click', () => {
        if (!currentBidhanUrl) return;
        bidhanFrame.src = currentBidhanUrl;
        bidhanDownloadLink.href = currentBidhanUrl;
        bidhanModal.style.display = 'flex';
    });
    bidhanModalClose.addEventListener('click', () => {
        bidhanFrame.src = '';
        bidhanModal.style.display = 'none';
    });
    bidhanModal.addEventListener('click', (e) => {
        if (e.target === bidhanModal) {
            bidhanFrame.src = '';
            bidhanModal.style.display = 'none';
        }
    });

    // ============================================================
    // 9. Photo crop (matching EditDonationPage)
    // ============================================================
    const cropModal = document.getElementById('cropModal');
    const cropStage = document.getElementById('cropStage');
    const cropImage = document.getElementById('cropImage');
    const cropFrame = document.getElementById('cropFrame');
    const cropZoom = document.getElementById('cropZoom');
    const cropResetBtn = document.getElementById('cropResetBtn');
    const cropCancelBtn = document.getElementById('cropCancelBtn');
    const cropConfirmBtn = document.getElementById('cropConfirmBtn');
    const cropModalClose = document.getElementById('cropModalClose');

    const ASPECT = 3 / 4;   // width / height

    const cropState = {
        naturalW: 0,
        naturalH: 0,
        offsetX: 0,
        offsetY: 0,
        zoom: 1,
        baseScale: 1,
        stageSize: 0,
        frameSize: 0,
        frameLeft: 0,
        frameTop: 0,
        dragging: false,
        dragStartX: 0,
        dragStartY: 0,
        dragOriginX: 0,
        dragOriginY: 0,
        onConfirm: null,
        objectUrl: null,
        _resolve: null,
        _reject: null
    };

    let croppedBlob = null;

    function openCropper(file, onConfirm) {
        if (cropState.objectUrl) URL.revokeObjectURL(cropState.objectUrl);
        cropState.objectUrl = URL.createObjectURL(file);
        cropState.onConfirm = onConfirm;

        cropImage.onload = () => {
            cropState.naturalW = cropImage.naturalWidth;
            cropState.naturalH = cropImage.naturalHeight;
            cropState.offsetX = 0;
            cropState.offsetY = 0;
            cropState.zoom = 1;
            cropZoom.value = 1;

            cropModal.style.display = 'flex';

            requestAnimationFrame(() => {
                layoutCropStage();
                applyCropTransform();
            });
        };
        cropImage.onerror = () => {
            alert('फोटो लोड गर्न सकिएन।');
            closeCropper();
        };
        cropImage.src = cropState.objectUrl;
    }

    function layoutCropStage() {
        const rect = cropStage.getBoundingClientRect();
        const stageSize = Math.min(rect.width, rect.height);
        cropState.stageSize = stageSize;

        // Frame is square inside the stage, but we adjust to 3:4 aspect.
        // Stage is square (aspect-ratio 1/1). We use a 3:4 frame inside it.
        const pad = stageSize * 0.10;
        const availW = stageSize - pad * 2;
        const availH = stageSize - pad * 2;

        let frameW = availW;
        let frameH = frameW / ASPECT;
        if (frameH > availH) {
            frameH = availH;
            frameW = frameH * ASPECT;
        }

        const frameLeft = (rect.width - frameW) / 2;
        const frameTop = (rect.height - frameH) / 2;

        cropState.frameSize = frameW;
        cropState.frameW = frameW;
        cropState.frameH = frameH;
        cropState.frameLeft = frameLeft;
        cropState.frameTop = frameTop;

        cropFrame.style.left = frameLeft + 'px';
        cropFrame.style.top = frameTop + 'px';
        cropFrame.style.width = frameW + 'px';
        cropFrame.style.height = frameH + 'px';

        // Base scale: make image "cover" the frame
        cropState.baseScale = Math.max(
            frameW / cropState.naturalW,
            frameH / cropState.naturalH
        );

        // Image center is at stage center
        cropImage.style.left = (rect.width / 2) + 'px';
        cropImage.style.top = (rect.height / 2) + 'px';
    }

    function applyCropTransform() {
        const scale = cropState.baseScale * cropState.zoom;
        cropImage.style.transform =
            `translate(-50%, -50%) translate(${cropState.offsetX}px, ${cropState.offsetY}px) scale(${scale})`;
    }

    function clampCropOffset() {
        const scale = cropState.baseScale * cropState.zoom;
        const imgW = cropState.naturalW * scale;
        const imgH = cropState.naturalH * scale;

        const halfFrameW = cropState.frameW / 2;
        const halfFrameH = cropState.frameH / 2;
        const halfImgW = imgW / 2;
        const halfImgH = imgH / 2;

        const stageCenterX = cropState.stageSize / 2;
        const stageCenterY = cropState.stageSize / 2;
        const frameCenterX = cropState.frameLeft + halfFrameW;
        const frameCenterY = cropState.frameTop + halfFrameH;

        // Image must cover the frame entirely
        const minOffsetX = (frameCenterX + halfFrameW) - stageCenterX - halfImgW;
        const maxOffsetX = (frameCenterX - halfFrameW) - stageCenterX + halfImgW;
        const minOffsetY = (frameCenterY + halfFrameH) - stageCenterY - halfImgH;
        const maxOffsetY = (frameCenterY - halfFrameH) - stageCenterY + halfImgH;

        cropState.offsetX = Math.min(maxOffsetX, Math.max(minOffsetX, cropState.offsetX));
        cropState.offsetY = Math.min(maxOffsetY, Math.max(minOffsetY, cropState.offsetY));
    }

    function startDrag(x, y) {
        cropState.dragging = true;
        cropState.dragStartX = x;
        cropState.dragStartY = y;
        cropState.dragOriginX = cropState.offsetX;
        cropState.dragOriginY = cropState.offsetY;
        cropStage.classList.add('dragging');
    }
    function moveDrag(x, y) {
        if (!cropState.dragging) return;
        cropState.offsetX = cropState.dragOriginX + (x - cropState.dragStartX);
        cropState.offsetY = cropState.dragOriginY + (y - cropState.dragStartY);
        clampCropOffset();
        applyCropTransform();
    }
    function endDrag() {
        cropState.dragging = false;
        cropStage.classList.remove('dragging');
    }

    cropStage.addEventListener('mousedown', e => { e.preventDefault(); startDrag(e.clientX, e.clientY); });
    window.addEventListener('mousemove', e => moveDrag(e.clientX, e.clientY));
    window.addEventListener('mouseup', endDrag);

    cropStage.addEventListener('touchstart', e => {
        if (e.touches.length !== 1) return;
        startDrag(e.touches[0].clientX, e.touches[0].clientY);
    }, { passive: true });
    cropStage.addEventListener('touchmove', e => {
        if (e.touches.length !== 1) return;
        moveDrag(e.touches[0].clientX, e.touches[0].clientY);
    }, { passive: true });
    cropStage.addEventListener('touchend', endDrag);

    cropStage.addEventListener('wheel', e => {
        e.preventDefault();
        const delta = -Math.sign(e.deltaY) * 0.08;
        cropState.zoom = Math.max(0.2, Math.min(3, cropState.zoom + delta));
        cropZoom.value = cropState.zoom;
        clampCropOffset();
        applyCropTransform();
    }, { passive: false });

    cropZoom.addEventListener('input', () => {
        cropState.zoom = parseFloat(cropZoom.value);
        clampCropOffset();
        applyCropTransform();
    });

    cropResetBtn.addEventListener('click', () => {
        cropState.offsetX = 0;
        cropState.offsetY = 0;
        cropState.zoom = 1;
        cropZoom.value = 1;
        applyCropTransform();
    });

    cropCancelBtn.addEventListener('click', closeCropper);
    cropModalClose.addEventListener('click', closeCropper);
    cropModal.addEventListener('click', (e) => { if (e.target === cropModal) closeCropper(); });

    function closeCropper() {
        cropModal.style.display = 'none';
        if (cropState.objectUrl) {
            URL.revokeObjectURL(cropState.objectUrl);
            cropState.objectUrl = null;
        }
        cropImage.removeAttribute('src');
    }

    cropConfirmBtn.addEventListener('click', async () => {
        cropConfirmBtn.disabled = true;
        const orig = cropConfirmBtn.innerHTML;
        cropConfirmBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> क्रप हुँदै...';
        try {
            const blob = await renderCroppedBlob();
            const cb = cropState.onConfirm;
            closeCropper();
            if (cb) cb(blob);
        } catch (err) {
            console.error('Crop error:', err);
            alert('क्रप गर्न सकिएन: ' + err.message);
        } finally {
            cropConfirmBtn.disabled = false;
            cropConfirmBtn.innerHTML = orig;
        }
    });

    function renderCroppedBlob() {
        return new Promise((resolve, reject) => {
            try {
                const OUT_W = 600;
                const OUT_H = 800;

                const canvas = document.createElement('canvas');
                canvas.width = OUT_W;
                canvas.height = OUT_H;
                const ctx = canvas.getContext('2d');
                ctx.fillStyle = '#fff';
                ctx.fillRect(0, 0, OUT_W, OUT_H);

                const scale = cropState.baseScale * cropState.zoom;
                const stageCenter = cropState.stageSize / 2;
                const imgCenterX = stageCenter + cropState.offsetX;
                const imgCenterY = stageCenter + cropState.offsetY;

                const srcX = (cropState.frameLeft - imgCenterX) / scale + cropState.naturalW / 2;
                const srcY = (cropState.frameTop  - imgCenterY) / scale + cropState.naturalH / 2;
                const srcW = cropState.frameW / scale;
                const srcH = cropState.frameH / scale;

                ctx.drawImage(
                    cropImage,
                    srcX, srcY, srcW, srcH,
                    0, 0, OUT_W, OUT_H
                );

                canvas.toBlob(b => {
                    if (!b) reject(new Error('Canvas toBlob failed'));
                    else resolve(b);
                }, 'image/jpeg', 0.92);
            } catch (err) {
                reject(err);
            }
        });
    }

    window.addEventListener('resize', () => {
        if (cropModal.style.display === 'flex') {
            layoutCropStage();
            clampCropOffset();
            applyCropTransform();
        }
    });

    // ============================================================
    // 10. Photo choose / remove
    // ============================================================
    choosePhotoBtn.addEventListener('click', () => photoInput.click());

    photoInput.addEventListener('change', function() {
        const file = this.files[0];
        if (!file) return;

        if (!file.type.startsWith('image/')) {
            alert('कृपया एउटा फोटो फाइल छान्नुहोस्।');
            return;
        }

        openCropper(file, (blob) => {
            croppedBlob = blob;
            const url = URL.createObjectURL(blob);
            photoPreview.src = url;
            photoPreview.style.display = 'block';
            removePhotoBtn.style.display = 'inline-flex';
            photoFileName.textContent = file.name;
        });

        this.value = '';
    });

    removePhotoBtn.addEventListener('click', () => {
        croppedBlob = null;
        photoPreview.src = '';
        photoPreview.style.display = 'none';
        removePhotoBtn.style.display = 'none';
        photoFileName.textContent = 'कुनै फोटो छानिएको छैन';
        photoUrlInput.value = '';
    });

    // ============================================================
    // 11. Upload via Edge Function (ImgBB)
    // ============================================================
    async function uploadPhotoToImgBB(blob) {
        const dataUrl = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
        const base64 = dataUrl.split(',')[1];

        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token || SUPABASE_ANON_KEY;

        const res = await fetch(UPLOAD_FN, {
            method: 'POST',
            mode: 'cors',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                image: base64,
                name: `donation_${Date.now()}.jpg`
            })
        });

        if (!res.ok) throw new Error('ImgBB upload failed: ' + await res.text());
        const json = await res.json();
        const url = json?.data?.url || json?.url || json?.data?.display_url;
        if (!url) throw new Error('ImgBB returned no URL');
        return url;
    }

    // ============================================================
    // 12. Form submission
    // ============================================================
    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const donnerName = donnerNameInput.value.trim();
        const donnerAddress = donnerAddressInput.value.trim();
        const donationAmount = parseFloat(donationAmountInput.value);
        const donationDate = donationDateInput.value;

        if (!donnerName) { setFeedback('कृपया दान गर्नेको नाम लेख्नुहोस्।', 'error'); donnerNameInput.focus(); return; }
        if (!donnerAddress) { setFeedback('कृपया दान गर्नेको ठेगाना लेख्नुहोस्।', 'error'); donnerAddressInput.focus(); return; }
        if (!donationAmount || donationAmount <= 0) { setFeedback('कृपया सही डोनेसन रकम हाल्नुहोस्।', 'error'); donationAmountInput.focus(); return; }
        if (!donationDate) { setFeedback('कृपया डोनेसन मिति छान्नुहोस्।', 'error'); donationDateInput.focus(); return; }

        setButtonLoading(btnSubmit, true, 'पठाउँदै...');
        setFeedback('जानकारी पठाइँदैछ...', 'info');

        try {
            let photoUrl = '';
            if (croppedBlob) {
                try {
                    photoUrl = await uploadPhotoToImgBB(croppedBlob);
                    photoUrlInput.value = photoUrl;
                } catch (upErr) {
                    console.error('Photo upload error:', upErr);
                    setFeedback('फोटो अपलोड असफल — डोनेसन जानकारी मात्र पठाइँदैछ...', 'info');
                }
            }

            const payload = {
                Name: null,
                Value: null,
                DonnerName: donnerName,
                DonnerAddress: donnerAddress,
                DonationAmount: donationAmount,
                DonationDate: donationDate
            };
            if (photoUrl) payload.PhotoUrl = photoUrl;

            const { error } = await supabase
                .from('DonationDataTable')
                .insert([payload]);

            if (error) throw error;

            setFeedback('✅ धन्यवाद! तपाईंको डोनेसन जानकारी सफलतापूर्वक पठाइयो।', 'success');
            form.reset();
            removePhotoBtn.click();
            setTodayDate();
        } catch (err) {
            console.error('❌ Submit error:', err);
            setFeedback('❌ त्रुटि: ' + (err.message || 'पठाउन सकिएन'), 'error');
        } finally {
            setButtonLoading(btnSubmit, false);
        }
    });

    btnReset.addEventListener('click', (e) => {
        e.preventDefault();
        form.reset();
        removePhotoBtn.click();
        setFeedback('');
        setTodayDate();
    });

    function setFeedback(msg, type = 'info') {
        feedback.textContent = msg;
        feedback.className = 'form-feedback ' + type;
    }

    function setButtonLoading(btn, loading, text) {
        if (!btn) return;
        if (loading) {
            btn._orig = btn.innerHTML;
            btn.disabled = true;
            btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> ${text || 'Loading...'}`;
        } else {
            btn.disabled = false;
            btn.innerHTML = btn._orig || btn.innerHTML;
        }
    }

    function setTodayDate() {
        const today = new Date();
        const yyyy = today.getFullYear();
        const mm = String(today.getMonth() + 1).padStart(2, '0');
        const dd = String(today.getDate()).padStart(2, '0');
        donationDateInput.value = `${yyyy}-${mm}-${dd}`;
    }

    // ============================================================
    // 13. Boot
    // ============================================================
    (async function init() {
        setTodayDate();
        await loadOrgInfo();
        console.log('✅ Donation page ready.');
    })();

})();