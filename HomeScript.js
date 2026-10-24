// HomeScript.js - Public Home Page with Notices, PDF Export, and Relation Finder

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
    console.log('✅ Supabase client loaded from SupabaseConfig');

    // ------------------------------------------------------------
    // 2. State
    // ------------------------------------------------------------
    let allNotices = [];
    let currentPage = 1;
    const NOTICES_PER_PAGE = 10;
    let isLoading = false;
    
    // Cache for PDF and Relation Finder
    let allMembers = [];
    let selectedMemberA = null;
    let selectedMemberB = null;

    // ------------------------------------------------------------
    // 3. DOM References
    // ------------------------------------------------------------
    const noticeGrid = document.getElementById('noticeGrid');
    const paginationControls = document.getElementById('paginationControls');
    const pageNumbers = document.getElementById('pageNumbers');
    const prevPageBtn = document.getElementById('prevPageBtn');
    const nextPageBtn = document.getElementById('nextPageBtn');
    const pageInfo = document.getElementById('pageInfo');

    // ------------------------------------------------------------
    // 4. Initialize
    // ------------------------------------------------------------
    document.addEventListener('DOMContentLoaded', init);

    async function init() {
        console.log('🚀 Initializing Home page...');
        
        // Load data for the new features
        await loadMembersCache();
        
        // Load notices
        await loadNotices();
        
        // Setup listeners
        setupEventListeners();
        setupNewFeatureListeners();

        if (window.FB) {
            window.FB.XFBML.parse();
        }

        console.log('✅ Home page ready');
    }

    // ------------------------------------------------------------
    // 5. Load Notices from Supabase
    // ------------------------------------------------------------
    async function loadNotices() {
        try {
            console.log('📥 Loading notices...');

            const { data, error } = await supabase
                .from('notices')
                .select('*')
                .eq('status', 'published')
                .order('created_at', { ascending: false });

            if (error) throw error;

            allNotices = data || [];
            console.log(`✅ Loaded ${allNotices.length} published notices`);

            currentPage = 1;
            renderNotices();
            renderPagination();

        } catch (error) {
            console.error('Error loading notices:', error);
            noticeGrid.innerHTML = `
                <div id="noNotices">
                    <i class="fas fa-exclamation-triangle"></i>
                    सूचनाहरू लोड गर्न सकिएन। कृपया पुनः प्रयास गर्नुहोस्।
                </div>
            `;
            paginationControls.style.display = 'none';
            pageInfo.textContent = '';
        }
    }

    // ------------------------------------------------------------
    // 6. Cache Members for PDF & Relation Finder
    // ------------------------------------------------------------
    async function loadMembersCache() {
        try {
            const { data, error } = await supabase.from('MemberDataTable').select('*');
            if (error) throw error;
            allMembers = data || [];
            console.log(`✅ Cached ${allMembers.length} members for PDF & Relation.`);
        } catch (err) {
            console.warn('⚠️ Could not load members cache:', err);
        }
    }

    // ------------------------------------------------------------
    // 7. Get Total Pages
    // ------------------------------------------------------------
    function getTotalPages() {
        return Math.ceil(allNotices.length / NOTICES_PER_PAGE);
    }

    // ------------------------------------------------------------
    // 8. Render Notices for Current Page
    // ------------------------------------------------------------
    function renderNotices() {
        if (allNotices.length === 0) {
            noticeGrid.innerHTML = `
                <div id="noNotices">
                    <i class="fas fa-newspaper"></i>
                    हाल कुनै सूचनाहरू छैनन्।
                </div>
            `;
            return;
        }

        const start = (currentPage - 1) * NOTICES_PER_PAGE;
        const end = start + NOTICES_PER_PAGE;
        const pageNotices = allNotices.slice(start, end);

        noticeGrid.innerHTML = '';

        pageNotices.forEach(notice => {
            const card = createNoticeCard(notice);
            noticeGrid.appendChild(card);
        });
    }

    // ------------------------------------------------------------
    // 9. Create Notice Card
    // ------------------------------------------------------------
    function createNoticeCard(notice) {
        const card = document.createElement('div');
        card.className = 'notice-card';
        card.dataset.id = notice.id;
        card.dataset.media = notice.media_type || 'none';

        const mediaType = notice.media_type || 'none';

        if (mediaType === 'text_image') card.classList.add('is-text-image');
        if (mediaType === 'image') card.classList.add('is-image');
        if (mediaType === 'facebook') card.classList.add('is-facebook');

        let thumbnailHtml = '';

        // ---- TEXT ONLY ('none') ----
        if (mediaType === 'none') {
            const titleText = escapeHtml(notice.title || 'Untitled');
            const fullContent = notice.content || '';
            const excerpt = fullContent.length > 140
                ? fullContent.substring(0, 140) + '...'
                : fullContent;

            thumbnailHtml = `
                <div class="text-thumbnail">
                    <div class="text-thumbnail-title">${titleText}</div>
                    <div class="text-thumbnail-excerpt">${escapeHtml(excerpt)}</div>
                </div>
            `;
        }
        // ---- IMAGE or TEXT_IMAGE ----
        else if ((mediaType === 'image' || mediaType === 'text_image') &&
                 (notice.thumbnail_url || notice.media_url)) {

            let imgSrc;
            if (mediaType === 'text_image') {
                imgSrc = notice.media_url || notice.thumbnail_url;
            } else {
                imgSrc = notice.thumbnail_url || notice.media_url;
            }

            thumbnailHtml = `<img src="${imgSrc}" alt="${escapeHtml(notice.title)}" loading="lazy">`;
        }
        // ---- YOUTUBE ----
        else if (mediaType === 'youtube') {
            const videoId = extractYoutubeId(notice.media_url);
            const thumbUrl = notice.thumbnail_url ||
                (videoId ? `https://img.youtube.com/vi/${videoId}/hqdefault.jpg` : '');
            thumbnailHtml = `
                ${thumbUrl ? `<img src="${thumbUrl}" alt="${escapeHtml(notice.title)}" loading="lazy">` : ''}
                <div class="youtube-overlay">
                    <i class="fab fa-youtube"></i>
                </div>
            `;
        }
        // ---- PDF ----
        else if (mediaType === 'pdf') {
            thumbnailHtml = `
                <div class="no-image" style="background: #f8f9fa;">
                    <i class="fas fa-file-pdf" style="color: #dc3545; font-size: 4rem;"></i>
                </div>
            `;
        }
        // ---- FACEBOOK ----
        else if (mediaType === 'facebook' && notice.media_url) {
            const fbUrl = notice.media_url;
            thumbnailHtml = `
                <div class="facebook-thumbnail-wrapper">
                    <iframe
                        src="https://www.facebook.com/plugins/post.php?href=${encodeURIComponent(fbUrl)}&width=500&show_text=true&height=400"
                        style="border:none;overflow:hidden;width:100%;height:100%;"
                        scrolling="no"
                        frameborder="0"
                        allowfullscreen="true"
                        allow="autoplay; clipboard-write; encrypted-media; picture-in-picture; web-share"
                        loading="lazy">
                    </iframe>
                    <div class="facebook-click-overlay"></div>
                </div>
            `;
        }
        // ---- Fallback ----
        else {
            thumbnailHtml = `
                <div class="no-image">
                    <i class="fas fa-file-alt"></i>
                </div>
            `;
        }

        const showsTextInBody = ['image', 'youtube', 'facebook', 'pdf'].includes(mediaType);
        const excerpt = (showsTextInBody && notice.content)
            ? notice.content.substring(0, 120) + (notice.content.length > 120 ? '...' : '')
            : '';

        card.innerHTML = `
            <div class="notice-thumbnail">
                ${thumbnailHtml}
            </div>
            <div class="notice-body">
                <h3>${escapeHtml(notice.title || 'Untitled')}</h3>
                ${excerpt ? `<div class="notice-excerpt">${escapeHtml(excerpt)}</div>` : ''}
                <div class="notice-meta">
                    <span class="date">
                        <i class="far fa-calendar-alt"></i>
                        ${formatDate(notice.created_at)}
                    </span>
                </div>
            </div>
        `;

        card.addEventListener('click', () => openMediaDirectly(notice));

        return card;
    }

    // ------------------------------------------------------------
    // 10. Render Pagination Controls
    // ------------------------------------------------------------
    function renderPagination() {
        const totalPages = getTotalPages();

        if (totalPages <= 1) {
            paginationControls.style.display = 'none';
            pageInfo.textContent = allNotices.length > 0
                ? `कुल ${allNotices.length} सूचनाहरू`
                : '';
            return;
        }

        paginationControls.style.display = 'flex';

        prevPageBtn.disabled = (currentPage === 1);
        nextPageBtn.disabled = (currentPage === totalPages);

        pageNumbers.innerHTML = '';
        const pages = buildPageList(currentPage, totalPages);

        pages.forEach(p => {
            if (p === '...') {
                const ellipsis = document.createElement('span');
                ellipsis.className = 'page-ellipsis';
                ellipsis.textContent = '…';
                pageNumbers.appendChild(ellipsis);
            } else {
                const btn = document.createElement('button');
                btn.className = 'page-number-btn';
                btn.textContent = p;
                btn.dataset.page = p;
                if (p === currentPage) btn.classList.add('active');
                btn.addEventListener('click', () => goToPage(p));
                pageNumbers.appendChild(btn);
            }
        });

        const start = (currentPage - 1) * NOTICES_PER_PAGE + 1;
        const end = Math.min(currentPage * NOTICES_PER_PAGE, allNotices.length);
        pageInfo.textContent = `पृष्ठ ${currentPage} / ${totalPages} — सूचना ${start}–${end} (कुल ${allNotices.length})`;
    }

    // ------------------------------------------------------------
    // 11. Build Smart Page List
    // ------------------------------------------------------------
    function buildPageList(current, total) {
        const pages = [1];

        let windowStart = Math.max(2, current - 1);
        let windowEnd = Math.min(total - 1, current + 1);

        if (windowStart > 2) pages.push('...');
        for (let i = windowStart; i <= windowEnd; i++) pages.push(i);
        if (windowEnd < total - 1) pages.push('...');
        if (total > 1) pages.push(total);

        return pages;
    }

    // ------------------------------------------------------------
    // 12. Navigate to a Page
    // ------------------------------------------------------------
    function goToPage(page) {
        const totalPages = getTotalPages();
        if (page < 1 || page > totalPages || page === currentPage) return;

        currentPage = page;
        renderNotices();
        renderPagination();

        const noticeSection = document.getElementById('noticeSection');
        if (noticeSection) {
            noticeSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    }

    // ------------------------------------------------------------
    // 13. Extract YouTube ID
    // ------------------------------------------------------------
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

    // ------------------------------------------------------------
    // 14. Format Date
    // ------------------------------------------------------------
    function formatDate(dateString) {
        if (!dateString) return '-';
        const date = new Date(dateString);
        return date.toLocaleDateString('ne-NP', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });
    }

    // ------------------------------------------------------------
    // 15. HTML Escape Helper
    // ------------------------------------------------------------
    function escapeHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    // ------------------------------------------------------------
    // 16. Open Media Directly
    // ------------------------------------------------------------
    function openMediaDirectly(notice) {
        console.log('📖 Opening notice:', notice.id, '| type:', notice.media_type);

        const mediaType = notice.media_type || 'none';

        if (mediaType === 'none') {
            openTextOnlyPopup(notice);
            return;
        }
        if (mediaType === 'image' && notice.media_url) {
            showPictureViewer(notice.media_url, notice.title);
            return;
        }
        if (mediaType === 'text_image' && notice.media_url) {
            openImageWithTextPopup(notice);
            return;
        }
        if (mediaType === 'pdf' && notice.media_url) {
            let pdfUrl = notice.media_url;
            if (pdfUrl.includes('/image/upload/')) {
                pdfUrl = pdfUrl.replace('/image/upload/', '/raw/upload/');
            }
            openPdfReader(pdfUrl, notice.title);
            return;
        }

        openEmbeddedPopup(notice);
    }

    // ------------------------------------------------------------
    // 17. TEXT ONLY POPUP
    // ------------------------------------------------------------
    function openTextOnlyPopup(notice) {
        const existing = document.getElementById('noticePopup');
        if (existing) existing.remove();

        const html = `
            <div id="noticePopup" class="notice-popup" style="display: flex;">
                <div class="popup-content text-only-popup">
                    <button class="popup-close" id="closePopupBtn">
                        <i class="fas fa-times"></i>
                    </button>
                    <div class="text-only-scroll">
                        <h1 class="text-only-title">${escapeHtml(notice.title || '')}</h1>
                        <div class="text-only-date">
                            <i class="far fa-calendar-alt"></i> ${formatDate(notice.created_at)}
                        </div>
                        <div class="text-only-content">${(notice.content || '').replace(/\n/g, '<br>')}</div>
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', html);
        wireUpPopupClose();
    }

    // ------------------------------------------------------------
    // 18. IMAGE + TEXT POPUP
    // ------------------------------------------------------------
    function openImageWithTextPopup(notice) {
        const existing = document.getElementById('noticePopup');
        if (existing) existing.remove();

        const html = `
            <div id="noticePopup" class="notice-popup" style="display: flex;">
                <div class="popup-content text-image-popup">
                    <button class="popup-close" id="closePopupBtn">
                        <i class="fas fa-times"></i>
                    </button>
                    <div class="text-image-scroll">
                        <h1 class="text-image-title">${escapeHtml(notice.title || '')}</h1>
                        <div class="text-image-date">
                            <i class="far fa-calendar-alt"></i> ${formatDate(notice.created_at)}
                        </div>
                        <div class="text-image-content">
                            <img class="text-image-float"
                                 src="${notice.media_url}"
                                 alt="${escapeHtml(notice.title)}">
                            ${(notice.content || '').replace(/\n/g, '<br>')}
                            <div class="text-image-clearfix"></div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', html);
        wireUpPopupClose();
    }

    // ------------------------------------------------------------
    // 19. YOUTUBE / FACEBOOK POPUP
    // ------------------------------------------------------------
    function openEmbeddedPopup(notice) {
        console.log('📖 Opening embedded popup for:', notice.media_type);

        const mediaType = notice.media_type || 'none';
        const isFacebook = (mediaType === 'facebook');

        let popupHTML = `
            <div id="noticePopup" class="notice-popup" style="display: flex;">
                <div class="popup-content ${isFacebook ? 'is-facebook-popup' : ''}">
                    <button class="popup-close" id="closePopupBtn">
                        <i class="fas fa-times"></i>
                    </button>
                    ${isFacebook ? `
                        <div class="fb-popup-header">
                            <span class="fb-popup-header-title">
                                <i class="fab fa-facebook-f"></i> Facebook Post
                            </span>
                            <a href="${notice.media_url}" target="_blank" rel="noopener noreferrer" class="fb-popup-header-link">
                                Open on Facebook <i class="fas fa-external-link-alt"></i>
                            </a>
                        </div>
                    ` : ''}
                    <div class="popup-media" id="popupMedia">
        `;

        if (mediaType === 'youtube' && notice.media_url) {
            const videoId = extractYoutubeId(notice.media_url);
            const embedUrl = notice.media_url.includes('embed')
                ? notice.media_url
                : `https://www.youtube.com/embed/${videoId}`;
            popupHTML += `
                <div class="video-wrapper">
                    <iframe id="youtubeIframe" src="${embedUrl}?enablejsapi=1&autoplay=1"
                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                            allowfullscreen>
                    </iframe>
                </div>
            `;
        } else if (mediaType === 'facebook' && notice.media_url) {
            const fbUrl = notice.media_url;
            const isVideo = fbUrl.includes('/videos/') || fbUrl.includes('/video/');

            if (isVideo) {
                popupHTML += `
                    <div class="fb-scroll-box">
                        <iframe
                            src="https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(fbUrl)}&show_text=true&width=560&height=400"
                            style="border:none;overflow:hidden;"
                            scrolling="no"
                            frameborder="0"
                            allowfullscreen="true"
                            allow="autoplay; clipboard-write; encrypted-media; picture-in-picture; web-share">
                        </iframe>
                    </div>
                `;
            } else {
                popupHTML += `
                    <div class="fb-scroll-box">
                        <iframe
                            src="https://www.facebook.com/plugins/post.php?href=${encodeURIComponent(fbUrl)}&width=500&show_text=true&height=700"
                            style="border:none;overflow:hidden;"
                            scrolling="no"
                            frameborder="0"
                            allowfullscreen="true"
                            allow="autoplay; clipboard-write; encrypted-media; picture-in-picture; web-share">
                        </iframe>
                    </div>
                `;
            }
        }

        popupHTML += `
                    </div>
                </div>
            </div>
        `;

        const existingPopup = document.getElementById('noticePopup');
        if (existingPopup) existingPopup.remove();

        document.body.insertAdjacentHTML('beforeend', popupHTML);
        wireUpPopupClose();

        const youtubeIframe = document.getElementById('youtubeIframe');
        if (youtubeIframe) {
            window._currentYoutubeIframe = youtubeIframe;
        }
    }

    // ------------------------------------------------------------
    // 20. Wire Up Popup Close
    // ------------------------------------------------------------
    function wireUpPopupClose() {
        const closeBtn = document.getElementById('closePopupBtn');
        const popupElement = document.getElementById('noticePopup');

        if (closeBtn) closeBtn.addEventListener('click', closePopupFunc);

        if (popupElement) {
            popupElement.addEventListener('click', function(e) {
                if (e.target === this) closePopupFunc();
            });
        }

        document.body.style.overflow = 'hidden';
        document.addEventListener('keydown', handlePopupKeydown);
    }

    // ------------------------------------------------------------
    // 21. Close Popup
    // ------------------------------------------------------------
    function closePopupFunc() {
        if (window._currentYoutubeIframe) {
            try {
                const iframe = window._currentYoutubeIframe;
                if (iframe && iframe.src) {
                    iframe.src = iframe.src.replace('?enablejsapi=1', '');
                }
            } catch (e) {
                console.warn('Could not stop YouTube video:', e);
            }
            window._currentYoutubeIframe = null;
        }

        const popup = document.getElementById('noticePopup');
        if (popup) popup.remove();

        document.body.style.overflow = 'auto';
        document.removeEventListener('keydown', handlePopupKeydown);
    }

    // ------------------------------------------------------------
    // 22. Handle Popup Keydown (Escape key)
    // ------------------------------------------------------------
    function handlePopupKeydown(e) {
        if (e.key === 'Escape') closePopupFunc();
    }

    // ------------------------------------------------------------
    // 23. Setup Event Listeners (Notice Pagination)
    // ------------------------------------------------------------
    function setupEventListeners() {
        prevPageBtn.addEventListener('click', () => {
            if (isLoading) return;
            goToPage(currentPage - 1);
        });

        nextPageBtn.addEventListener('click', () => {
            if (isLoading) return;
            goToPage(currentPage + 1);
        });
    }

    // ============================================================
    // NEW FEATURES: PDF EXPORT & RELATION FINDER
    // ============================================================

    function setupNewFeatureListeners() {
        document.getElementById('btnSaveBansawali')?.addEventListener('click', downloadBansawaliPDF);
        document.getElementById('btnFindRelation')?.addEventListener('click', openFindRelationModal);
        
        // Modal close events
        document.getElementById('closeRelationModal')?.addEventListener('click', closeFindRelationModal);
        document.getElementById('relationModal')?.addEventListener('click', function(e) {
            if (e.target === this) closeFindRelationModal();
        });
        
        // Relation Finder Buttons
        document.getElementById('btnFindRelationNow')?.addEventListener('click', calculateAndDisplayRelation);
        
        // Setup comboboxes inside modal
        setupRelationComboboxes();
    }

    // ------------------------------------------------------------
    // 24. PDF EXPORT (Seamless Page Breaks, No Blank Gaps)
    // ------------------------------------------------------------
    async function downloadBansawaliPDF() {
        if (allMembers.length === 0) {
            alert('सदस्यहरूको डाटा लोड हुँदैछ, कृपया केही सेकेन्ड पर्खनुहोस्।');
            return;
        }

        const btn = document.getElementById('btnSaveBansawali');
        const orig = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> बन्दैछ...';
        btn.disabled = true;

        let wrapper = null;

        try {
            const sortedMembers = [...allMembers].sort((a, b) => {
                const codeA = String(a.PersonalCode || '').trim();
                const codeB = String(b.PersonalCode || '').trim();
                
                if (codeA.length !== codeB.length) {
                    return codeA.length - codeB.length;
                }
                return codeA.localeCompare(codeB);
            });

            // Off-screen container locked to top-left (0,0) with exact A4 pixel width
            wrapper = document.createElement('div');
            wrapper.style.position = 'fixed';
            wrapper.style.left = '0';
            wrapper.style.top = '0';
            wrapper.style.width = '794px'; 
            wrapper.style.zIndex = '-99999';
            wrapper.style.opacity = '0'; 
            wrapper.style.background = '#ffffff';
            wrapper.style.pointerEvents = 'none';
            
            const printContainer = document.createElement('div');
            printContainer.style.width = '794px';
            printContainer.style.background = '#ffffff';
            printContainer.style.color = '#000000';
            printContainer.style.fontFamily = "'Sanskrit-Text', 'MySanskritFont', sans-serif";
            printContainer.style.boxSizing = 'border-box';

            // 22 rows per page fits comfortably inside standard A4 height with header/footer margins
            const rowsPerPage = 22;
            const chunks = [];
            for (let i = 0; i < sortedMembers.length; i += rowsPerPage) {
                chunks.push(sortedMembers.slice(i, i + rowsPerPage));
            }

            let pagesHtml = '';
            chunks.forEach((chunk, index) => {
                let startIdx = index * rowsPerPage;
                let rowsHtml = chunk.map((m, idx) => `
                    <tr>
                        <td style="border:1px solid #c0c0c0; padding:5px 2px; font-size:11px; text-align:center; width:4%; box-sizing:border-box;">${startIdx + idx + 1}</td>
                        <td style="border:1px solid #c0c0c0; padding:5px 3px; font-size:11px; text-align:center; word-break:break-word; width:13%; box-sizing:border-box;">${m.PersonalCode || ''}</td>
                        <td style="border:1px solid #c0c0c0; padding:5px 4px; font-size:11px; word-break:break-word; width:18%; box-sizing:border-box;">${m.FullName || ''}</td>
                        <td style="border:1px solid #c0c0c0; padding:5px 4px; font-size:11px; word-break:break-word; width:17%; box-sizing:border-box;">${m.Father || ''}</td>
                        <td style="border:1px solid #c0c0c0; padding:5px 4px; font-size:11px; word-break:break-word; width:17%; box-sizing:border-box;">${m.Mother || ''}</td>
                        <td style="border:1px solid #c0c0c0; padding:5px 4px; font-size:11px; word-break:break-word; width:15.5%; box-sizing:border-box;">${m.Spouse || ''}</td>
                        <td style="border:1px solid #c0c0c0; padding:5px 4px; font-size:11px; word-break:break-word; width:15.5%; box-sizing:border-box;">${m.Address || m.Thegana || ''}</td>
                    </tr>
                `).join('');

                pagesHtml += `
                    <div class="pdf-page" style="
                        width: 794px; 
                        height: 1120px; 
                        padding: 25px 20px; 
                        box-sizing: border-box; 
                        background: #ffffff; 
                        page-break-after: always; 
                        page-break-inside: avoid;
                        ${index === chunks.length - 1 ? 'page-break-after: auto;' : ''}
                    ">
                        <div style="text-align:center; margin-bottom: 10px;">
                            <h1 style="color:#0a6b3e; margin:0 0 3px 0; font-size: 20px;">ओझा बन्धु वंशावली</h1>
                            <p style="margin:0; color:#555; font-size:11px;">मिति: ${new Date().toLocaleDateString('ne-NP')} (पृष्ठ ${index + 1} / ${chunks.length})</p>
                        </div>
                        <table style="width:100%; border-collapse:collapse; table-layout: fixed; border:1px solid #c0c0c0;">
                            <thead>
                                <tr style="background:#0a6b3e; color:#fff;">
                                    <th style="border:1px solid #0a6b3e; padding:6px 2px; font-size:11px; text-align:center; width:4%; box-sizing:border-box;">क्र.सं.</th>
                                    <th style="border:1px solid #0a6b3e; padding:6px 3px; font-size:11px; text-align:center; width:13%; box-sizing:border-box;">कोड</th>
                                    <th style="border:1px solid #0a6b3e; padding:6px 4px; font-size:11px; width:18%; box-sizing:border-box;">पुरा नाम</th>
                                    <th style="border:1px solid #0a6b3e; padding:6px 4px; font-size:11px; width:17%; box-sizing:border-box;">बाबुको नाम</th>
                                    <th style="border:1px solid #0a6b3e; padding:6px 4px; font-size:11px; width:17%; box-sizing:border-box;">आमाको नाम</th>
                                    <th style="border:1px solid #0a6b3e; padding:6px 4px; font-size:11px; width:15.5%; box-sizing:border-box;">श्रीमान/श्रीमती</th>
                                    <th style="border:1px solid #0a6b3e; padding:6px 4px; font-size:11px; width:15.5%; box-sizing:border-box;">ठेगाना</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${rowsHtml}
                            </tbody>
                        </table>
                    </div>
                `;
            });

            printContainer.innerHTML = pagesHtml;
            wrapper.appendChild(printContainer);
            document.body.appendChild(wrapper);

            const opt = {
                margin:       0, // Zero canvas margins since each .pdf-page handles internal A4 padding
                filename:     'Ojha_Bandhu_Bansawali.pdf',
                image:        { type: 'jpeg', quality: 1 }, 
                html2canvas:  { 
                    scale: 2, 
                    useCORS: true, 
                    scrollX: 0,
                    scrollY: 0,
                    x: 0,
                    y: 0,
                    windowWidth: 794,
                    width: 794
                },
                jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' },
                pagebreak:    { mode: ['css', 'legacy'] } 
            };

            await html2pdf().set(opt).from(printContainer).save();

        } catch (err) {
            console.error('PDF Error:', err);
            alert('PDF बनाउन सकिएन। कृपया पुनः प्रयास गर्नुहोस्।');
        } finally {
            if (wrapper && wrapper.parentNode) {
                wrapper.parentNode.removeChild(wrapper);
            }
            btn.innerHTML = orig;
            btn.disabled = false;
        }
    }

    function openFindRelationModal() {
        const modal = document.getElementById('relationModal');
        const body = modal.querySelector('.relation-body');
        
        // Ensure the inputs are wrapped in our new grid
        if (body && !body.querySelector('.relation-inputs-grid')) {
            const groups = body.querySelectorAll('.relation-select-group');
            if (groups.length >= 2) {
                const grid = document.createElement('div');
                grid.className = 'relation-inputs-grid';
                // Insert grid before the first group
                groups[0].parentNode.insertBefore(grid, groups[0]);
                // Move the two groups into the grid
                grid.appendChild(groups[0]);
                grid.appendChild(groups[1]);
            }
        }

        modal.style.display = 'flex';
        document.getElementById('personA').value = '';
        document.getElementById('personB').value = '';
        document.getElementById('relationResultBox').innerHTML = '<p class="relation-placeholder">नाता पत्ता लगाउन दुबै व्यक्ति छान्नुहोस्।</p>';
        selectedMemberA = null;
        selectedMemberB = null;
    }

    function closeFindRelationModal() {
        document.getElementById('relationModal').style.display = 'none';
    }

    function setupRelationComboboxes() {
        const inputA = document.getElementById('personA');
        const resultsA = document.getElementById('resultsA');
        const inputB = document.getElementById('personB');
        const resultsB = document.getElementById('resultsB');

        if (!inputA || !inputB) return;

        function filterMembersLocal(query) {
            const q = query.toLowerCase().trim();
            if (!q) return allMembers.slice(0, 30);
            return allMembers.filter(m => (m.FullName || '').toLowerCase().includes(q) || (m.PersonalCode || '').toLowerCase().includes(q)).slice(0, 50);
        }

        function renderResults(el, results, inputEl, isA) {
            if (results.length === 0) {
                el.innerHTML = '<div class="combo-empty">कुनै सदस्य भेटिएन</div>';
                el.hidden = false;
                return;
            }
            el.innerHTML = results.map(m => `
                <div class="combo-item" data-id="${m.PersonalCode}">
                    <span class="combo-code">${m.PersonalCode}</span>
                    <span class="combo-name">${m.FullName}</span>
                </div>
            `).join('');
            el.hidden = false;

            el.querySelectorAll('.combo-item').forEach(item => {
                item.addEventListener('mousedown', (e) => {
                    e.preventDefault();
                    const code = item.dataset.id;
                    const member = allMembers.find(m => m.PersonalCode === code);
                    if (member) {
                        inputEl.value = `${member.FullName} (${member.PersonalCode})`;
                        if (isA) selectedMemberA = member;
                        else selectedMemberB = member;
                        el.hidden = true;
                        inputEl.blur(); // Force close dropdown by blurring input
                    }
                });
            });
        }

        inputA.addEventListener('focus', () => renderResults(resultsA, filterMembersLocal(inputA.value), inputA, true));
        inputA.addEventListener('input', () => renderResults(resultsA, filterMembersLocal(inputA.value), inputA, true));
        inputB.addEventListener('focus', () => renderResults(resultsB, filterMembersLocal(inputB.value), inputB, false));
        inputB.addEventListener('input', () => renderResults(resultsB, filterMembersLocal(inputB.value), inputB, false));

        document.addEventListener('click', (e) => {
            if (!inputA.contains(e.target) && !resultsA.contains(e.target)) resultsA.hidden = true;
            if (!inputB.contains(e.target) && !resultsB.contains(e.target)) resultsB.hidden = true;
        });
    }

    function calculateAndDisplayRelation() {
        if (!selectedMemberA || !selectedMemberB) {
            alert('कृपया दुबै व्यक्ति छान्नुहोस्।');
            return;
        }
        if (selectedMemberA.PersonalCode === selectedMemberB.PersonalCode) {
            document.getElementById('relationResultBox').innerHTML = `<p class="relation-highlight">यी दुबै एउटै व्यक्ति हुन्।</p>`;
            return;
        }

        const result = RelationCalculator.calculateRelation(selectedMemberA, selectedMemberB, allMembers);

        if (!result.success) {
            document.getElementById('relationResultBox').innerHTML = `<p class="relation-highlight">${result.message}</p>`;
            return;
        }

        const nameA = selectedMemberA.FullName;
        const nameB = selectedMemberB.FullName;

        const photoA = selectedMemberA.PhotoUrl || 'https://via.placeholder.com/100x133?text=No+Photo';
        const photoB = selectedMemberB.PhotoUrl || 'https://via.placeholder.com/100x133?text=No+Photo';

        let lcaHtml = '';
        if (result.lcaName && result.lcaCode) {
            lcaHtml = `
                <div class="relation-lca" style="background: #f8f9fa; padding: 12px; border-radius: 8px; width: 100%; border: 1px solid #eee; box-sizing: border-box; text-align: center; font-size: 0.9rem; color: #555; margin-bottom: 10px;">
                    <strong>साझा पुर्खा:</strong> ${result.lcaName} (${result.lcaCode})
                </div>
            `;
        }

        const html = `
            <div class="relation-photos-wrapper">
                <div class="relation-person-col">
                    <div class="relation-img-box">
                        <img src="${photoA}" alt="${nameA}">
                    </div>
                    <div style="font-weight: 600; color: #064b2b;">${nameA}</div>
                    <div style="font-size: 0.85rem; color: #6c757d;">${selectedMemberA.PersonalCode}</div>
                </div>
                
                <div class="relation-link-icon">
                    <i class="fas fa-link"></i>
                </div>
                
                <div class="relation-person-col">
                    <div class="relation-img-box">
                        <img src="${photoB}" alt="${nameB}">
                    </div>
                    <div style="font-weight: 600; color: #064b2b;">${nameB}</div>
                    <div style="font-size: 0.85rem; color: #6c757d;">${selectedMemberB.PersonalCode}</div>
                </div>
            </div>
            
            <div class="relation-result-title">
                <strong>${nameA} र ${nameB} बिचको सम्बन्ध:</strong>
            </div>
            
            <div class="relation-highlight">
                ${result.message}
            </div>
            
            <div style="font-size: 0.9rem; color: #555; margin-bottom: 5px;">
                <strong>पुस्ता अन्तर:</strong> ${result.genDiff}
            </div>

            <div style="font-size: 0.9rem; color: #555; margin-bottom: 15px;">
                <strong>पिण्ड अन्तरः</strong> ${result.pindaAntar} (साझा पुस्ता: ${result.commonGen})
            </div>
            
            ${lcaHtml}
        `;

        document.getElementById('relationResultBox').innerHTML = html;
    }

})();