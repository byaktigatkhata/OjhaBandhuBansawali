// HomeScript.js - Public Home Page with Notices (Paginated)

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
        await loadNotices();
        setupEventListeners();

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
    // 6. Get Total Pages
    // ------------------------------------------------------------
    function getTotalPages() {
        return Math.ceil(allNotices.length / NOTICES_PER_PAGE);
    }

    // ------------------------------------------------------------
    // 7. Render Notices for Current Page
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

        console.log(`📊 Page ${currentPage}/${getTotalPages()} — showing notices ${start + 1}–${Math.min(end, allNotices.length)} of ${allNotices.length}`);
    }

    // ------------------------------------------------------------
    // 8. Create Notice Card
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
                imgSrc = stripSupabaseTransform(imgSrc);
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
    // 9. Strip Supabase transform params
    // ------------------------------------------------------------
    function stripSupabaseTransform(url) {
        if (!url) return url;
        if (!url.includes('/storage/v1/')) return url;

        try {
            const u = new URL(url);

            if (u.pathname.includes('/storage/v1/render/image/')) {
                u.pathname = u.pathname.replace(
                    '/storage/v1/render/image/',
                    '/storage/v1/object/public/'
                );
            }

            const paramsToRemove = ['width', 'height', 'resize', 'quality', 'format'];
            paramsToRemove.forEach(p => u.searchParams.delete(p));

            return u.toString();
        } catch (e) {
            return url.split('?')[0];
        }
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

            // Scrollable container so the post is never clipped, even if
            // Facebook renders wider/taller than the popup viewport.
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
    // 23. Setup Event Listeners
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

})();