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
    // 2. Authentication
    // ------------------------------------------------------------
    const LOGIN_PAGE_URL = '../LoginPage/LoginIndex.html';
    const SPECIAL_ADMIN_EMAIL = 'byaktigatkhata@gmail.com';

    let currentUser = null;
    let currentUserRole = null;
    let isSpecialAdmin = false;

    async function checkPrivatePageAccess() {
        console.log('🔐 Checking authentication...');
        try {
            const { data: { session }, error } = await supabase.auth.getSession();

            if (error || !session?.user) {
                console.log('🚫 No authenticated user found');
                redirectToLogin();
                return false;
            }

            currentUser = session.user;
            console.log('✅ User authenticated:', currentUser.email);

            if (currentUser.email.toLowerCase() === SPECIAL_ADMIN_EMAIL.toLowerCase()) {
                console.log('🌟 Special admin detected!');
                isSpecialAdmin = true;
                currentUserRole = 'AdminManager';
                return true;
            }

            const { data, error: dbError } = await supabase
                .from('admins')
                .select('admin_role, is_active')
                .eq('user_id', currentUser.id)
                .single();

            if (dbError) {
                console.error('Admin check error:', dbError);
                if (dbError.code === 'PGRST116') {
                    alert('⛔ Access Denied: You do not have administrator privileges.');
                    redirectToLogin();
                    return false;
                }
                throw dbError;
            }

            if (!data || data.is_active !== 'true') {
                alert('⛔ Access Denied: You do not have administrator privileges or your account is inactive.');
                redirectToLogin();
                return false;
            }

            currentUserRole = data.admin_role;
            console.log('✅ Admin role:', currentUserRole);
            return true;

        } catch (error) {
            console.error('Auth error:', error);
            redirectToLogin();
            return false;
        }
    }

    function redirectToLogin() {
        window.location.replace(LOGIN_PAGE_URL);
    }

    // ------------------------------------------------------------
    // 3. DOM References
    // ------------------------------------------------------------
    const form = document.getElementById('createNoticeForm');
    const noticeTitle = document.getElementById('noticeTitle');
    const noticeContent = document.getElementById('noticeContent');
    const mediaType = document.getElementById('mediaType');
    const mediaSection = document.getElementById('mediaSection');
    const btnPublish = document.getElementById('btnPublish');
    const btnSaveDraft = document.getElementById('btnSaveDraft');
    const btnReset = document.getElementById('btnReset');
    const loadingOverlay = document.getElementById('loadingOverlay');

    // Image upload
    const imageUpload = document.getElementById('imageUpload');
    const imageUploadArea = document.getElementById('imageUploadArea');
    const imageFile = document.getElementById('imageFile');
    const imagePreview = document.getElementById('imagePreview');
    const imagePreviewImg = document.getElementById('imagePreviewImg');
    const imageFileName = document.getElementById('imageFileName');
    const removeImageBtn = document.getElementById('removeImageBtn');

    // YouTube
    const youtubeUpload = document.getElementById('youtubeUpload');
    const youtubeUrl = document.getElementById('youtubeUrl');
    const youtubePreview = document.getElementById('youtubePreview');
    const youtubeVideoId = document.getElementById('youtubeVideoId');
    const removeYoutubeBtn = document.getElementById('removeYoutubeBtn');

    // Facebook
    const facebookUpload = document.getElementById('facebookUpload');
    const facebookUrl = document.getElementById('facebookUrl');
    const facebookPreview = document.getElementById('facebookPreview');
    const removeFacebookBtn = document.getElementById('removeFacebookBtn');

    // PDF
    const pdfUpload = document.getElementById('pdfUpload');
    const pdfUploadArea = document.getElementById('pdfUploadArea');
    const pdfFile = document.getElementById('pdfFile');
    const pdfPreview = document.getElementById('pdfPreview');
    const pdfFileName = document.getElementById('pdfFileName');
    const removePdfBtn = document.getElementById('removePdfBtn');

    // Table
    const noticesTableBody = document.getElementById('noticesTableBody');
    const btnRefresh = document.getElementById('btnRefresh');
    const btnPrevPage = document.getElementById('btnPrevPage');
    const btnNextPage = document.getElementById('btnNextPage');
    const pageInfo = document.getElementById('pageInfo');

    // ------------------------------------------------------------
    // 4. State
    // ------------------------------------------------------------
    let allNotices = [];
    let filteredNotices = [];
    let currentPage = 1;
    const itemsPerPage = 10;
    let isSubmitting = false;
    let uploadedMedia = {
        media_type: 'none',
        media_url: '',
        media_public_id: '',
        thumbnail_url: ''
    };

    // ------------------------------------------------------------
    // 5. Initialize
    // ------------------------------------------------------------
    async function init() {
        console.log('🚀 Initializing CreateNotice page...');

        const isAuthenticated = await checkPrivatePageAccess();
        if (!isAuthenticated) {
            console.log('⛔ Authentication failed');
            return;
        }

        console.log('✅ Authentication successful');
        setupEventListeners();
        await loadNotices();
        console.log('✅ CreateNotice page ready');
    }

    // ------------------------------------------------------------
    // 6. Event Listeners
    // ------------------------------------------------------------
    function setupEventListeners() {
        // Form submission (Publish)
        form.addEventListener('submit', (e) => handleFormSubmit(e, 'published'));

        // Draft button
        btnSaveDraft.addEventListener('click', () => handleFormSubmit(null, 'draft'));

        // Reset button
        btnReset.addEventListener('click', (e) => {
            e.preventDefault(); // prevent native reset (we handle it manually)
            resetForm();
        });

        // Media type change
        mediaType.addEventListener('change', handleMediaTypeChange);

        // Image upload
        imageUploadArea.addEventListener('click', () => imageFile.click());
        imageFile.addEventListener('change', handleImageUpload);
        removeImageBtn.addEventListener('click', removeImage);

        // YouTube
        youtubeUrl.addEventListener('input', handleYoutubeChange);
        removeYoutubeBtn.addEventListener('click', removeYoutube);

        // Facebook
        facebookUrl.addEventListener('input', handleFacebookChange);
        removeFacebookBtn.addEventListener('click', removeFacebook);

        // PDF upload
        pdfUploadArea.addEventListener('click', () => pdfFile.click());
        pdfFile.addEventListener('change', handlePdfUpload);
        removePdfBtn.addEventListener('click', removePdf);

        // Refresh
        btnRefresh.addEventListener('click', loadNotices);

        // Pagination
        btnPrevPage.addEventListener('click', () => {
            if (currentPage > 1) {
                currentPage--;
                renderTable();
                updatePagination();
            }
        });

        btnNextPage.addEventListener('click', () => {
            const totalPages = Math.ceil(filteredNotices.length / itemsPerPage);
            if (currentPage < totalPages) {
                currentPage++;
                renderTable();
                updatePagination();
            }
        });

        // Navigation
        document.getElementById('btnBackToDashboard')?.addEventListener('click', () => {
            window.history.back();
        });
        document.getElementById('btnLogout')?.addEventListener('click', handleLogout);
    }

    // ------------------------------------------------------------
    // 7. Media Type Handler (FIXED + content visibility toggle)
    // ------------------------------------------------------------
    function handleMediaTypeChange() {
        const type = mediaType.value;
        const editId = form.dataset.editId || btnPublish.dataset.noticeId;
        const isEditMode = !!editId;

        let originalNotice = null;
        if (isEditMode) {
            originalNotice = allNotices.find(n => n.id === editId);
        }

        // ---- Toggle content textarea visibility ----
        toggleContentVisibility(type);

        // ---- Media state management ----
        if (isEditMode && originalNotice) {
            if (originalNotice.media_type === type) {
                uploadedMedia = {
                    media_type: originalNotice.media_type || 'none',
                    media_url: originalNotice.media_url || '',
                    media_public_id: originalNotice.media_public_id || '',
                    thumbnail_url: originalNotice.thumbnail_url || ''
                };
            } else {
                uploadedMedia = {
                    media_type: type,
                    media_url: '',
                    media_public_id: '',
                    thumbnail_url: ''
                };
            }
        } else {
            uploadedMedia = {
                media_type: type,
                media_url: '',
                media_public_id: '',
                thumbnail_url: ''
            };
        }

        // Hide all upload sections
        imageUpload.style.display = 'none';
        youtubeUpload.style.display = 'none';
        facebookUpload.style.display = 'none';
        pdfUpload.style.display = 'none';

        // Reset previews & upload areas
        imagePreview.style.display = 'none';
        youtubePreview.style.display = 'none';
        facebookPreview.style.display = 'none';
        pdfPreview.style.display = 'none';
        imageUploadArea.style.display = 'block';
        pdfUploadArea.style.display = 'block';

        // Show relevant section
        if (type === 'image' || type === 'text_image') {
            imageUpload.style.display = 'block';
            mediaSection.style.display = 'block';
        } else if (type === 'youtube') {
            youtubeUpload.style.display = 'block';
            mediaSection.style.display = 'block';
        } else if (type === 'facebook') {
            facebookUpload.style.display = 'block';
            mediaSection.style.display = 'block';
        } else if (type === 'pdf') {
            pdfUpload.style.display = 'block';
            mediaSection.style.display = 'block';
        } else {
            mediaSection.style.display = 'none';
        }

        // If edit mode and same type, show existing preview
        if (isEditMode && originalNotice && originalNotice.media_type === type && type !== 'none') {
            showMediaPreview(originalNotice);
        }
    }

    // ------------------------------------------------------------
    // Helper: Toggle content textarea visibility based on media type
    // ------------------------------------------------------------
    function toggleContentVisibility(type) {
        const contentBox = document.getElementById('FormContentBox');
        const contentField = document.getElementById('noticeContent');
        const contentLabel = document.getElementById('FormContent');
        const requiredStar = contentLabel?.querySelector('.required');

        // Media types that REQUIRE text content
        const typesRequiringText = ['none', 'text_image'];

        if (typesRequiringText.includes(type)) {
            contentBox.style.display = 'flex';
            contentField.setAttribute('required', 'required');
            if (requiredStar) requiredStar.style.display = 'inline';
        } else {
            contentBox.style.display = 'none';
            contentField.removeAttribute('required');
            if (requiredStar) requiredStar.style.display = 'none';
            // Clear any leftover content when hidden
            // (optional — uncomment next line if you want to wipe it)
            // contentField.value = '';
        }
    }

    // ------------------------------------------------------------
    // 8. Image Upload
    // ------------------------------------------------------------
    async function handleImageUpload(e) {
        const file = e.target.files[0];
        if (!file) return;

        if (file.size > 5 * 1024 * 1024) {
            alert('Image size should be less than 5MB.');
            imageFile.value = '';
            return;
        }

        const editId = form.dataset.editId || btnPublish.dataset.noticeId;
        const isEditMode = !!editId;
        let oldPublicId = null;

        if (isEditMode) {
            const originalNotice = allNotices.find(n => n.id === editId);
            if (originalNotice && originalNotice.media_public_id &&
                (originalNotice.media_type === 'image' || originalNotice.media_type === 'text_image')) {
                oldPublicId = originalNotice.media_public_id;
            }
        }

        showLoading('Uploading image...');

        try {
            const result = await uploadToCloudinary(file, 'image');

            if (result.success) {
                // ✅ Preserve the user's current selection: 'image' OR 'text_image'
                const currentType = mediaType.value;
                const preservedType = (currentType === 'text_image') ? 'text_image' : 'image';

                uploadedMedia = {
                    media_type: preservedType,        // ← keeps 'text_image' if that's what user picked
                    media_url: result.media_url,
                    media_public_id: result.public_id,
                    thumbnail_url: result.thumbnail_url
                };

                imagePreviewImg.src = result.media_url;
                imageFileName.textContent = file.name;
                imagePreview.style.display = 'flex';
                imageUploadArea.style.display = 'none';

                if (oldPublicId) {
                    try {
                        await deleteFromCloudinary(oldPublicId);
                    } catch (deleteError) {
                        console.warn('⚠️ Could not delete old image:', deleteError);
                    }
                }
            } else {
                alert('Failed to upload image: ' + result.error);
            }
        } catch (error) {
            console.error('Upload error:', error);
            alert('Failed to upload image. Please try again.');
        } finally {
            hideLoading();
        }
    }

    async function deleteFromCloudinary(publicId) {
        if (!publicId) return true;

        const functionUrl = 'https://icchczijubhzxkjpebps.supabase.co/functions/v1/delete-notice';

        try {
            const response = await fetch(functionUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
                },
                body: JSON.stringify({
                    publicId: publicId,
                    mediaOnly: true
                })
            });

            const result = await response.json();
            return result.success;
        } catch (error) {
            console.error('Delete from Cloudinary error:', error);
            return false;
        }
    }

    function removeImage() {
        uploadedMedia = { ...uploadedMedia, media_type: 'image', media_url: '', media_public_id: '', thumbnail_url: '' };
        imagePreview.style.display = 'none';
        imageUploadArea.style.display = 'block';
        imageFile.value = '';
    }

    // ------------------------------------------------------------
    // 9. YouTube Handler
    // ------------------------------------------------------------
    function handleYoutubeChange() {
        const url = youtubeUrl.value.trim();
        const videoId = extractYoutubeId(url);

        if (videoId) {
            uploadedMedia = {
                media_type: 'youtube',
                media_url: `https://www.youtube.com/embed/${videoId}`,
                media_public_id: videoId,
                thumbnail_url: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`
            };

            youtubeVideoId.textContent = `Video ID: ${videoId}`;
            youtubePreview.style.display = 'flex';
        } else {
            youtubePreview.style.display = 'none';
            if (url) {
                youtubeVideoId.textContent = 'Invalid YouTube URL';
            }
        }
    }

    function extractYoutubeId(url) {
        if (!url) return null;
        const patterns = [
            /(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&?#]+)/,
            /youtube\.com\/embed\/([^/?]+)/
        ];
        for (const pattern of patterns) {
            const match = url.match(pattern);
            if (match) return match[1];
        }
        return null;
    }

    function removeYoutube() {
        uploadedMedia = { ...uploadedMedia, media_type: 'youtube', media_url: '', media_public_id: '', thumbnail_url: '' };
        youtubeUrl.value = '';
        youtubePreview.style.display = 'none';
    }

    // ------------------------------------------------------------
    // 10. Facebook Handler
    // ------------------------------------------------------------
    function handleFacebookChange() {
        const url = facebookUrl.value.trim();

        if (url && (url.includes('facebook.com') || url.includes('fb.com'))) {
            uploadedMedia = {
                media_type: 'facebook',
                media_url: url,
                media_public_id: '',
                thumbnail_url: 'https://cdn-icons-png.flaticon.com/512/733/733547.png'
            };
            facebookPreview.style.display = 'flex';
        } else {
            facebookPreview.style.display = 'none';
        }
    }

    function removeFacebook() {
        uploadedMedia = { ...uploadedMedia, media_type: 'facebook', media_url: '', media_public_id: '', thumbnail_url: '' };
        facebookUrl.value = '';
        facebookPreview.style.display = 'none';
    }

    // ------------------------------------------------------------
    // 11. PDF Upload
    // ------------------------------------------------------------
    async function handlePdfUpload(e) {
        const file = e.target.files[0];
        if (!file) return;

        if (file.size > 10 * 1024 * 1024) {
            alert('PDF size should be less than 10MB.');
            pdfFile.value = '';
            return;
        }

        const editId = form.dataset.editId || btnPublish.dataset.noticeId;
        const isEditMode = !!editId;
        let oldPublicId = null;

        if (isEditMode) {
            const originalNotice = allNotices.find(n => n.id === editId);
            if (originalNotice && originalNotice.media_public_id && originalNotice.media_type === 'pdf') {
                oldPublicId = originalNotice.media_public_id;
            }
        }

        showLoading('Uploading PDF...');

        try {
            const result = await uploadToCloudinary(file, 'pdf');

            if (result.success) {
                uploadedMedia = {
                    media_type: 'pdf',
                    media_url: result.media_url,
                    media_public_id: result.public_id,
                    thumbnail_url: result.thumbnail_url
                };

                pdfFileName.textContent = file.name;
                pdfPreview.style.display = 'flex';
                pdfUploadArea.style.display = 'none';

                if (oldPublicId) {
                    try {
                        await deleteFromCloudinary(oldPublicId);
                    } catch (deleteError) {
                        console.warn('⚠️ Could not delete old PDF:', deleteError);
                    }
                }
            } else {
                alert('Failed to upload PDF: ' + result.error);
            }
        } catch (error) {
            console.error('Upload error:', error);
            alert('Failed to upload PDF. Please try again.');
        } finally {
            hideLoading();
        }
    }

    function removePdf() {
        uploadedMedia = { ...uploadedMedia, media_type: 'pdf', media_url: '', media_public_id: '', thumbnail_url: '' };
        pdfPreview.style.display = 'none';
        pdfUploadArea.style.display = 'block';
        pdfFile.value = '';
    }

    // ------------------------------------------------------------
    // 12. Upload to Cloudinary
    // ------------------------------------------------------------
    async function uploadToCloudinary(file, mediaType) {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('mediaType', mediaType);

        const functionUrl = 'https://icchczijubhzxkjpebps.supabase.co/functions/v1/upload-notice-media';

        const response = await fetch(functionUrl, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
            },
            body: formData
        });

        return await response.json();
    }

    // ------------------------------------------------------------
    // 13. Form Submit
    // ------------------------------------------------------------
    async function handleFormSubmit(e, status = 'published') {
        if (e) e.preventDefault();

        if (isSubmitting) return;
        isSubmitting = true;

        // ============================================================
        // STEP 1: Read values & validate title/content
        // ============================================================
        const title = noticeTitle.value.trim();
        const content = noticeContent.value.trim();

        // ---- NEW: content is only required for 'none' and 'text_image' ----
        const contentRequiringTypes = ['none', 'text_image'];
        const isContentRequired = contentRequiringTypes.includes(mediaType.value);

        if (!title) {
            alert('कृपया शीर्षक भर्नुहोस्।');
            isSubmitting = false;
            return;
        }

        if (isContentRequired && !content) {
            alert('कृपया सामग्री भर्नुहोस्।');
            isSubmitting = false;
            return;
        }

        // ============================================================
        // STEP 2: Determine edit mode & original notice
        // ============================================================
        const editId = form.dataset.editId || btnPublish.dataset.noticeId;
        const isEditMode = !!editId;

        let originalNotice = null;
        if (isEditMode) {
            originalNotice = allNotices.find(n => n.id === editId);
        }

        const type = mediaType.value;
        const isMediaTypeChanged = isEditMode && originalNotice && originalNotice.media_type !== type;
        const isNewMediaRequired = !isEditMode || (isEditMode && isMediaTypeChanged);

        // ============================================================
        // STEP 3: Validate media  ← 👇👇👇 THIS IS THE BLOCK YOU ASKED ABOUT 👇👇👇
        // ============================================================
        if (type !== 'none' && isNewMediaRequired && !uploadedMedia.media_url) {
            const messages = {
                image: 'कृपया एउटा फोटो अपलोड गर्नुहोस्।',
                text_image: 'कृपया एउटा फोटो अपलोड गर्नुहोस्।',
                youtube: 'कृपया मान्य YouTube URL प्रविष्ट गर्नुहोस्।',
                facebook: 'कृपया मान्य Facebook URL प्रविष्ट गर्नुहोस्।',
                pdf: 'कृपया PDF अपलोड गर्नुहोस्।'
            };
            alert(messages[type] || 'कृपया मिडिया थप्नुहोस्।');
            isSubmitting = false;
            return;
        }

        // If edit mode, same type, no new media uploaded → keep original
        if (isEditMode && originalNotice && originalNotice.media_type === type && type !== 'none' && !uploadedMedia.media_url) {
            uploadedMedia.media_url = originalNotice.media_url;
            uploadedMedia.media_public_id = originalNotice.media_public_id;
            uploadedMedia.thumbnail_url = originalNotice.thumbnail_url;
            uploadedMedia.media_type = originalNotice.media_type;
        }
        // 👆👆👆 END OF THE BLOCK YOU ASKED ABOUT 👆👆👆

        // ============================================================
        // STEP 4: Build payload
        // ============================================================
        const payload = {
            title: title,
            content: isContentRequired ? content : (content || ''),
            media_type: type === 'none' ? 'none' : (uploadedMedia.media_type || 'none'),
            media_url: type === 'none' ? '' : (uploadedMedia.media_url || ''),
            media_public_id: type === 'none' ? '' : (uploadedMedia.media_public_id || ''),
            thumbnail_url: type === 'none' ? '' : (uploadedMedia.thumbnail_url || ''),
            status: status
        };

        if (isEditMode) {
            payload.updated_at = new Date().toISOString();
        }

        // ============================================================
        // STEP 5: Save to Supabase (unchanged)
        // ============================================================
        setButtonLoading(btnPublish, true, 'Saving...');
        setButtonLoading(btnSaveDraft, true, 'Saving...');

        try {
            if (isEditMode) {
                console.log('📝 Updating notice:', editId);

                const { data, error } = await supabase
                    .from('notices')
                    .update(payload)
                    .eq('id', editId)
                    .select();

                if (error) throw error;

                alert(`✅ Notice "${title}" updated successfully!`);
                cancelEditMode();

            } else {
                console.log('📤 Creating new notice');

                const { data, error } = await supabase
                    .from('notices')
                    .insert([{ ...payload, created_by: currentUser?.email || 'admin' }])
                    .select();

                if (error) throw error;

                alert(`✅ Notice "${title}" ${status === 'published' ? 'प्रकाशित' : 'ड्राफ्टमा सुरक्षित'} गरियो!`);
                resetForm();
            }

            await loadNotices();

        } catch (error) {
            console.error('❌ Error saving notice:', error);

            let errorMessage = error.message;
            if (error.code === '42501') {
                errorMessage = 'अनुमति अस्वीकार गरियो। कृपया प्रशासकको रूपमा लगइन गर्नुहोस्।';
            } else if (error.code === '23505') {
                errorMessage = 'यो शीर्षकको सूचना पहिले नै अवस्थित छ।';
            }

            alert(`❌ त्रुटि: ${errorMessage}`);
        } finally {
            isSubmitting = false;
            setButtonLoading(btnPublish, false);
            setButtonLoading(btnSaveDraft, false);
        }
    }

    // ------------------------------------------------------------
    // 14. Load Notices
    // ------------------------------------------------------------
    async function loadNotices() {
        try {
            const { data, error } = await supabase
                .from('notices')
                .select('*')
                .order('created_at', { ascending: false });

            if (error) throw error;

            allNotices = data || [];
            filteredNotices = allNotices;
            currentPage = 1;
            renderTable();
            updatePagination();

            console.log(`✅ Loaded ${allNotices.length} notices`);

        } catch (error) {
            console.error('Error loading notices:', error);
            noticesTableBody.innerHTML = `
                <tr>
                    <td colspan="6" style="text-align:center; padding: 40px; color: #b02b2b;">
                        <i class="fas fa-exclamation-triangle"></i> Error: ${error.message}
                    </td>
                </tr>
            `;
        }
    }

    // ------------------------------------------------------------
    // 15. Render Table
    // ------------------------------------------------------------
    function renderTable() {
        const start = (currentPage - 1) * itemsPerPage;
        const end = start + itemsPerPage;
        const pageItems = filteredNotices.slice(start, end);

        if (pageItems.length === 0) {
            noticesTableBody.innerHTML = `
                <tr>
                    <td colspan="6" style="text-align:center; padding: 40px; color: #666;">
                        <i class="fas fa-inbox"></i> No notices found
                    </td>
                </tr>
            `;
            return;
        }

        let html = '';
        pageItems.forEach((notice, index) => {
            const globalIndex = start + index + 1;
            const statusClass = notice.status === 'published' ? 'status-published' : 'status-draft';
            const mediaIcons = {
                'image': 'fa-image',
                'text_image': 'fa-image',
                'youtube': 'fa-youtube',
                'facebook': 'fa-facebook',
                'pdf': 'fa-file-pdf',
                'none': 'fa-file-alt'
            };

            const mediaLabels = {
                'none': 'Text Only',
                'text_image': 'Image + Text',
                'image': 'Image Only',
                'youtube': 'YouTube',
                'facebook': 'Facebook',
                'pdf': 'PDF'
            };

            const mediaIcon = mediaIcons[notice.media_type] || 'fa-file-alt';
            const mediaLabel = mediaLabels[notice.media_type] || notice.media_type || 'none';

            html += `
                <tr>
                    <td>${globalIndex}</td>
                    <td><strong>${notice.title || '-'}</strong></td>
                    <td><span class="media-badge"><i class="fas ${mediaIcon}"></i> ${mediaLabel}</span></td>
                    <td><span class="status-badge ${statusClass}">${notice.status || 'draft'}</span></td>
                    <td>${formatDate(notice.created_at)}</td>
                    <td>
                        <div class="action-buttons">
                            <button class="btn-edit" data-id="${notice.id}">
                                <i class="fas fa-edit"></i>
                            </button>
                            <button class="btn-delete" data-id="${notice.id}">
                                <i class="fas fa-trash"></i>
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        });

        noticesTableBody.innerHTML = html;

        document.querySelectorAll('.btn-edit').forEach(btn => {
            btn.addEventListener('click', function() {
                const id = this.dataset.id;
                const notice = allNotices.find(n => n.id === id);
                if (notice) editNotice(notice);
            });
        });

        document.querySelectorAll('.btn-delete').forEach(btn => {
            btn.addEventListener('click', function() {
                const id = this.dataset.id;
                if (confirm('Are you sure you want to delete this notice?')) {
                    deleteNotice(id);
                }
            });
        });
    }

    // ------------------------------------------------------------
    // 16. Delete Notice
    // ------------------------------------------------------------
    async function deleteNotice(id) {
        if (!confirm('के तपाईं यो सूचना मेटाउन निश्चित हुनुहुन्छ? यसले सम्बन्धित फोटो वा PDF पनि मेटाउनेछ।')) {
            return;
        }

        const notice = allNotices.find(n => n.id === id);
        if (!notice) {
            alert('❌ सूचना फेला परेन।');
            return;
        }

        const deleteBtn = document.querySelector(`.btn-delete[data-id="${id}"]`);
        setButtonLoading(deleteBtn, true, 'Deleting...');

        try {
            const functionUrl = 'https://icchczijubhzxkjpebps.supabase.co/functions/v1/delete-notice';

            const response = await fetch(functionUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
                },
                body: JSON.stringify({
                    noticeId: id,
                    publicId: notice.media_public_id || null,
                    mediaType: notice.media_type || null
                })
            });

            const result = await response.json();

            if (!result.success) {
                throw new Error(result.error || 'Failed to delete notice');
            }

            alert('✅ सूचना र सम्बन्धित मिडिया सफलतापूर्वक मेटियो!');
            await loadNotices();

        } catch (error) {
            console.error('❌ Delete error:', error);
            alert(`❌ त्रुटि: ${error.message}`);
            await loadNotices();
        } finally {
            setButtonLoading(deleteBtn, false);
        }
    }

    // ------------------------------------------------------------
    // 17. Edit Notice
    // ------------------------------------------------------------
    function editNotice(notice) {
        console.log('📝 Editing notice:', notice);

        const confirmEdit = confirm(
            `📝 Editing Notice\n\n` +
            `You are about to edit "${notice.title}"\n` +
            `Created: ${formatDate(notice.created_at)}\n\n` +
            `Click OK to continue editing, or Cancel to abort.`
        );

        if (!confirmEdit) return;

        noticeTitle.value = notice.title || '';
        noticeContent.value = notice.content || '';
        mediaType.value = notice.media_type || 'none';

        uploadedMedia = {
            media_type: notice.media_type || 'none',
            media_url: notice.media_url || '',
            media_public_id: notice.media_public_id || '',
            thumbnail_url: notice.thumbnail_url || ''
        };

        handleMediaTypeChange();
        showMediaPreview(notice);

        // Scroll to form
        form.scrollIntoView({ behavior: 'smooth' });

        btnPublish.innerHTML = '<i class="fas fa-edit"></i> Update Notice';
        btnPublish.dataset.mode = 'edit';
        btnPublish.dataset.noticeId = notice.id;
        form.dataset.editId = notice.id;

        // Visual indicator
        const existingIndicator = document.getElementById('editModeIndicator');
        if (existingIndicator) existingIndicator.remove();

        const editIndicator = document.createElement('div');
        editIndicator.id = 'editModeIndicator';
        editIndicator.innerHTML = `
            <i class="fas fa-edit"></i>
            <strong>Edit Mode:</strong> You are editing "${notice.title}"
            <button type="button" id="cancelEditBtn" style="margin-left:auto; background:none; border:none; color:#856404; cursor:pointer; font-size:1.2rem;">
                <i class="fas fa-times"></i> Cancel
            </button>
        `;

        // Insert before the form
        form.parentNode.insertBefore(editIndicator, form);

        document.getElementById('cancelEditBtn')?.addEventListener('click', cancelEditMode);
        noticeTitle.focus();
    }

    function showMediaPreview(notice) {
        const type = notice.media_type;
        if ((type === 'image' || type === 'text_image') && notice.media_url) {
            imagePreviewImg.src = notice.media_url;
            imageFileName.textContent = notice.media_url.split('/').pop() || 'Image';
            imagePreview.style.display = 'flex';
            imageUploadArea.style.display = 'none';
            imageUpload.style.display = 'block';
            mediaSection.style.display = 'block';
        } else if (type === 'youtube' && notice.media_url) {
            const videoId = extractYoutubeId(notice.media_url) || notice.media_public_id;
            if (videoId) {
                youtubeUrl.value = `https://www.youtube.com/watch?v=${videoId}`;
                youtubeVideoId.textContent = `Video ID: ${videoId}`;
                youtubePreview.style.display = 'flex';
                youtubeUpload.style.display = 'block';
                mediaSection.style.display = 'block';
            }
        } else if (type === 'facebook' && notice.media_url) {
            facebookUrl.value = notice.media_url;
            facebookPreview.style.display = 'flex';
            facebookUpload.style.display = 'block';
            mediaSection.style.display = 'block';
        } else if (type === 'pdf' && notice.media_url) {
            pdfFileName.textContent = notice.media_url.split('/').pop() || 'PDF Document';
            pdfPreview.style.display = 'flex';
            pdfUploadArea.style.display = 'none';
            pdfUpload.style.display = 'block';
            mediaSection.style.display = 'block';
        }
    }

    function cancelEditMode() {
        resetForm();
        const indicator = document.getElementById('editModeIndicator');
        if (indicator) indicator.remove();
    }

    // ------------------------------------------------------------
    // 18. Reset Form
    // ------------------------------------------------------------
    function resetForm() {
        const indicator = document.getElementById('editModeIndicator');
        if (indicator) indicator.remove();

        btnPublish.innerHTML = '<i class="fas fa-globe"></i> Publish Notice';
        btnPublish.dataset.mode = '';
        btnPublish.dataset.noticeId = '';
        if (form) form.dataset.editId = '';

        if (form) form.reset();
        mediaType.value = 'none';
        uploadedMedia = {
            media_type: 'none',
            media_url: '',
            media_public_id: '',
            thumbnail_url: ''
        };
        imagePreview.style.display = 'none';
        imageUploadArea.style.display = 'block';
        youtubePreview.style.display = 'none';
        facebookPreview.style.display = 'none';
        pdfPreview.style.display = 'none';
        pdfUploadArea.style.display = 'block';
        imageFile.value = '';
        pdfFile.value = '';
        mediaSection.style.display = 'none';
        noticeTitle.focus();
    }

    // ------------------------------------------------------------
    // 19. Pagination
    // ------------------------------------------------------------
    function updatePagination() {
        const totalPages = Math.ceil(filteredNotices.length / itemsPerPage);
        pageInfo.textContent = `Page ${currentPage} / ${totalPages || 1}`;
        btnPrevPage.disabled = currentPage <= 1;
        btnNextPage.disabled = currentPage >= totalPages || totalPages === 0;
    }

    // ------------------------------------------------------------
    // 20. Utilities
    // ------------------------------------------------------------
    function formatDate(dateString) {
        if (!dateString) return '-';
        const date = new Date(dateString);
        return date.toLocaleDateString('ne-NP', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    function setButtonLoading(button, isLoading, loadingText) {
        if (!button) return;
        if (isLoading) {
            button.disabled = true;
            button._originalText = button.innerHTML;
            button.innerHTML = `<i class="fas fa-spinner fa-spin"></i> ${loadingText || 'Processing...'}`;
        } else {
            button.disabled = false;
            button.innerHTML = button._originalText || button.innerHTML;
        }
    }

    function showLoading(message = 'Processing...') {
        loadingOverlay.style.display = 'flex';
        loadingOverlay.querySelector('p').textContent = message;
    }

    function hideLoading() {
        loadingOverlay.style.display = 'none';
    }

    // ------------------------------------------------------------
    // 21. Logout
    // ------------------------------------------------------------
    async function handleLogout() {
        if (!confirm('Are you sure you want to logout?')) return;
        try {
            await supabase.auth.signOut();
            window.location.replace(LOGIN_PAGE_URL);
        } catch (error) {
            console.error('Logout error:', error);
        }
    }

    // ------------------------------------------------------------
    // 22. Initialize
    // ------------------------------------------------------------
    init();

})();