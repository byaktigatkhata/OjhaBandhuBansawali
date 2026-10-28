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

        // NEW: Filter Members
        setupFilterFeature();
    }
    // ------------------------------------------------------------
    // NEW: FILTER MEMBERS FEATURE (Dynamic Dropdowns & Address Parser)
    // ------------------------------------------------------------
    const filterState = {
        country: '',
        district: '',
        province: '',
        area: '',
        generation: '',
        profession: '',
        category: '',
        searchText: ''
    };

    const NEPAL_DISTRICTS = {
        'kathmandu': ['काठमाडौं', 'काठमाडौ', 'काठमाण्डू', 'kathmandu'],
        'lalitpur': ['ललितपुर', 'ललितपूर', 'पाटन', 'lalitpur', 'patan'],
        'bhaktapur': ['भक्तपुर', 'भक्तपूर', 'bhaktapur'],
        'kavrepalanchok': ['काभ्रेपलाञ्चोक', 'काभ्रे', 'kavre', 'kavrepalanchok'],
        'jhapa': ['झापा', 'jhapa'],
        'morang': ['मोरङ', 'मोरंग', 'morang'],
        'sunsari': ['सुनसरी', 'sunsari'],
        'ilam': ['इलाम', 'ilam'],
        'dhankuta': ['धनकुटा', 'dhankuta'],
        'chitwan': ['चितवन', 'चितवन', 'chitwan'],
        'kaski': ['कास्की', 'kaski', 'पोखरा', 'pokhara'],
        'rupandehi': ['रुपन्देही', 'rupandehi', 'भैरहवा', 'butwal'],
        'dhanusha': ['धनुषा', 'dhanusha', 'janakpur'],
        'bara': ['बारा', 'bara'],
        'parsa': ['पर्सा', 'parsa', 'birgunj'],
        'banke': ['बाँके', 'banke', 'nepalgunj'],
        'kailali': ['कैलाली', 'kailali', 'dhangadhi'],
        'kanchanpur': ['कञ्चनपुर', 'kanchanpur', 'mahendranagar'],
        'sarlahi': ['सर्लाही', 'sarlahi'],
        'mahottari': ['महोत्तरी', 'mahottari'],
        'saptari': ['सप्तरी', 'saptari'],
        'siraha': ['सिराहा', 'siraha'],
        'udayapur': ['उदयपुर', 'udayapur'],
        'sindhuli': ['सिन्धुली', 'sindhuli'],
        'dolakha': ['दोलखा', 'dolakha'],
        'sindhupalchok': ['सिन्धुपाल्चोक', 'sindhupalchok'],
        'nuwakot': ['नुवाकोट', 'nuwakot'],
        'dhading': ['धादिङ', 'dhading'],
        'makwanpur': ['मकवानपुर', 'makwanpur', 'hetauda'],
        'gorkha': ['गोरखा', 'gorkha'],
        'lamjung': ['लमजुङ', 'lamjung'],
        'tanahun': ['तनहुँ', 'tanahun', 'damauli'],
        'syangja': ['स्याङ्जा', 'syangja'],
        'parbat': ['पर्वत', 'parbat'],
        'baglung': ['बागलुङ', 'baglung'],
        'myagdi': ['म्याग्दी', 'myagdi'],
        'mustang': ['मुस्ताङ', 'mustang'],
        'manang': ['मनाङ', 'manang'],
        'palpa': ['पाल्पा', 'palpa', 'tansen'],
        'gulmi': ['गुल्मी', 'gulmi'],
        'arghakhanchi': ['अर्घाखाँची', 'arghakhanchi'],
        'kapilvastu': ['कपिलवस्तु', 'kapilvastu', 'taulihawa'],
        'nawalparasi': ['नवलपरासी', 'nawalparasi', 'nawalpur'],
        'dang': ['दाङ', 'dang', 'ghorahi', 'tulsipur'],
        'pyuthan': ['प्युठान', 'pyuthan'],
        'rolpa': ['रोल्पा', 'rolpa'],
        'rukum': ['रुकुम', 'rukum'],
        'salyan': ['सल्यान', 'salyan'],
        'jajarkot': ['जाजरकोट', 'jajarkot'],
        'dailekh': ['दैलेख', 'dailekh'],
        'surkhet': ['सुर्खेत', 'surkhet', 'birendranagar'],
        'bajura': ['बाजुरा', 'bajura'],
        'bajhang': ['बझाङ', 'bajhang'],
        'achham': ['अछाम', 'achham'],
        'doti': ['डोटी', 'doti'],
        'dadeldhura': ['डडेल्धुरा', 'dadeldhura'],
        'baitadi': ['बैतडी', 'baitadi'],
        'darchula': ['दार्चुला', 'darchula'],
        'terhathum': ['तेह्रथुम', 'terhathum'],
        'bhojpur': ['भोजपुर', 'bhojpur'],
        'sankhuwasabha': ['संखुवासभा', 'sankhuwasabha'],
        'solukhumbu': ['सोलुखुम्बु', 'solukhumbu'],
        'okhaldhunga': ['ओखलढुङ्गा', 'okhaldhunga'],
        'khotang': ['खोटाङ', 'khotang'],
        'panchthar': ['पाँचथर', 'panchthar'],
        'taplejung': ['ताप्लेजुङ', 'taplejung'],
        'dolpa': ['डोल्पा', 'dolpa'],
        'mugu': ['मुगु', 'mugu'],
        'humla': ['हुम्ला', 'humla'],
        'jumla': ['जुम्ला', 'jumla'],
        'kalikot': ['कालीकोट', 'kalikot'],
        'ramechhap': ['रामेछाप', 'ramechhap'],
        'rasuwa': ['रसुवा', 'rasuwa'],
        'rautahat': ['रौतहट', 'rautahat'],
        'bardiya': ['बर्दिया', 'bardiya', 'gulariya']
    };

    const VALLEY_DISTRICTS = ['kathmandu', 'lalitpur', 'bhaktapur', 'kavrepalanchok'];
    
    const PROVINCES = {
        'Koshi': ['jhapa', 'morang', 'sunsari', 'ilam', 'dhankuta', 'terhathum', 'bhojpur', 'sankhuwasabha', 'solukhumbu', 'okhaldhunga', 'khotang', 'panchthar', 'taplejung', 'udayapur'],
        'Madhesh': ['saptari', 'siraha', 'dhanusha', 'mahottari', 'sarlahi', 'bara', 'parsa', 'rautahat'],
        'Bagmati': ['kathmandu', 'lalitpur', 'bhaktapur', 'kavrepalanchok', 'sindhuli', 'dolakha', 'sindhupalchok', 'nuwakot', 'dhading', 'makwanpur', 'chitwan', 'rasuwa', 'ramechhap'],
        'Gandaki': ['gorkha', 'lamjung', 'tanahun', 'syangja', 'parbat', 'baglung', 'myagdi', 'mustang', 'manang', 'kaski', 'nawalparasi'],
        'Lumbini': ['palpa', 'gulmi', 'arghakhanchi', 'kapilvastu', 'rupandehi', 'dang', 'pyuthan', 'rolpa', 'rukum', 'banke', 'bardiya'],
        'Karnali': ['salyan', 'jajarkot', 'dailekh', 'surkhet', 'bajura', 'bajhang', 'achham', 'doti', 'dolpa', 'mugu', 'humla', 'jumla', 'kalikot'],
        'Sudurpashchim': ['kailali', 'kanchanpur', 'dadeldhura', 'baitadi', 'darchula']
    };

    const FOREIGN_COUNTRIES = {
        'USA': ['america', 'अमेरिका', 'usa', 'us', 'united states'],
        'UK': ['uk', 'england', 'बेलायत', 'लन्डन', 'london'],
        'Australia': ['australia', 'अस्ट्रेलिया', 'सिड्नी', 'sydney'],
        'Japan': ['japan', 'जापान', 'tokyo'],
        'UAE': ['uae', 'दुबई', 'dubai', 'abu dhabi', 'अबुधाबी'],
        'Qatar': ['qatar', 'कतार', 'doha'],
        'Saudi Arabia': ['saudi', 'साउदी', 'riyadh', 'जेद्दा'],
        'Malaysia': ['malaysia', 'मलेसिया', 'kuala lumpur'],
        'South Korea': ['korea', 'कोरिया', 'seoul'],
        'India': ['india', 'भारत', 'दिल्ली', 'delhi', 'mumbai', 'bihar'],
        'Myanmar': ['myanmar', 'म्यानमार', 'burma', 'बर्मा', 'वर्मा']
    };

    function getGenerationFromCode(code) {
        if (!code) return '0';
        return String((String(code).match(/\./g) || []).length);
    }

    function getCategoryFromCode(code) {
        if (!code) return '';
        const parts = String(code).split('.');
        const lastBlock = parts[parts.length - 1].trim();

        if (lastBlock.startsWith('M') && !lastBlock.endsWith('m')) return 'Son';
        if (lastBlock.startsWith('F') && !lastBlock.endsWith('m')) return 'Daughter';
        if (lastBlock.startsWith('F') && lastBlock.endsWith('m')) return 'SonInLaw';
        if (lastBlock.startsWith('M') && lastBlock.endsWith('m')) return 'DaughterInLaw';
        
        return ''; 
    }

    function parseAddress(addressStr) {
        const defaultResult = { country: 'Nepal', district: '', province: '', area: '' };
        if (!addressStr) return defaultResult;

        const addr = addressStr.toLowerCase().trim();
        const result = { ...defaultResult };

        for (const [country, keywords] of Object.entries(FOREIGN_COUNTRIES)) {
            if (keywords.some(k => addr.includes(k))) {
                result.country = country;
                return result; 
            }
        }

        for (const [key, variations] of Object.entries(NEPAL_DISTRICTS)) {
            if (variations.some(v => addr.includes(v.toLowerCase()))) {
                result.district = key.charAt(0).toUpperCase() + key.slice(1); 
                break;
            }
        }

        if (result.district) {
            if (VALLEY_DISTRICTS.includes(result.district.toLowerCase())) {
                result.area = 'Kathmandu Valley';
            } else {
                result.area = 'Outside Valley';
            }

            for (const [prov, dists] of Object.entries(PROVINCES)) {
                if (dists.includes(result.district.toLowerCase())) {
                    result.province = prov;
                    break;
                }
            }
        }

        return result;
    }

    function matchesProfession(userProfessionStr, filterCategory) {
        if (!filterCategory) return true;
        const prof = (userProfessionStr || '').toLowerCase();

        const synonyms = {
            'Teaching': ['teaching', 'teacher', 'शिक्षक', 'शिक्षण', 'प्राध्यापक', 'professor', 'school', 'college'],
            'Business': ['business', 'shop', 'व्यापार', 'व्यवसाय', 'पसल', 'trade', 'trader'],
            'Agriculture': ['agriculture', 'farming', 'कृषि', 'खेती', 'खेतीपाती', 'कृषक', 'farmer', 'कृषि व्यवसाय'],
            'Public Servant': ['public servant', 'government', 'सरकारी', 'सरकारी सेवा', 'civil servant', 'nepal government'],
            'Private Employee': ['private employee', 'private job', 'निजी', 'निजी कर्मचारी', 'company', 'staff'],
            'Doctor': ['doctor', 'डाक्टर', 'चिकित्सक', 'physician', 'surgeon'],
            'Engineer': ['engineer', 'इन्जिनियर', 'अभियन्ता'],
            'Lawyer': ['lawyer', 'वकिल', 'अधिवक्ता', 'advocate', 'legal'],
            'Student': ['student', 'विद्यार्थी', 'अध्ययन', 'studying', 'पढ्दै'],
            'Retired': ['retired', 'अवकाश', 'अवकाश प्राप्त', 'pension', 'पेन्सन']
        };

        const keywords = synonyms[filterCategory] || [filterCategory.toLowerCase()];
        return keywords.some(k => prof.includes(k));
    }

    function populateFilterDropdowns() {
        const countries = new Set();
        const districts = new Set();
        const provinces = new Set();

        allMembers.forEach(m => {
            const addrStr = m.Address || m.Thegana || m.PermanentAddress || m.CurrentAddress || '';
            const parsed = parseAddress(addrStr);
            
            if (parsed.country) countries.add(parsed.country);
            if (parsed.district) districts.add(parsed.district);
            if (parsed.province) provinces.add(parsed.province);
        });

        const countrySel = document.getElementById('filterCountry');
        const prevCountry = countrySel.value;
        countrySel.innerHTML = '<option value="">-- सबै देश --</option>' + 
            [...countries].sort().map(c => `<option value="${c}">${c}</option>`).join('');
        countrySel.value = prevCountry;

        const districtSel = document.getElementById('filterDistrict');
        const prevDistrict = districtSel.value;
        districtSel.innerHTML = '<option value="">-- सबै जिल्ला --</option>' + 
            [...districts].sort().map(d => `<option value="${d}">${d}</option>`).join('');
        districtSel.value = prevDistrict;

        const provinceSel = document.getElementById('filterProvince');
        const prevProvince = provinceSel.value;
        provinceSel.innerHTML = '<option value="">-- सबै प्रदेश --</option>' + 
            [...provinces].sort().map(p => `<option value="${p}">${p}</option>`).join('');
        provinceSel.value = prevProvince;
    }

    function setupFilterFeature() {
        document.getElementById('btnFilterMembers')?.addEventListener('click', openFilterModal);
        document.getElementById('closeFilterModal')?.addEventListener('click', closeFilterModal);
        document.getElementById('filterModal')?.addEventListener('click', function (e) {
            if (e.target === this) closeFilterModal();
        });
        
        document.getElementById('btnApplyFilter')?.addEventListener('click', applyFilter);
        document.getElementById('btnResetFilter')?.addEventListener('click', resetFilter);
        document.getElementById('btnSaveFilterJPG')?.addEventListener('click', downloadFilteredJPG);

        ['filterCountry','filterDistrict','filterProvince','filterArea','filterGeneration','filterProfession','filterCategory'].forEach(id => {
            document.getElementById(id)?.addEventListener('change', applyFilter);
        });

        let searchTimer;
        document.getElementById('filterSearchText')?.addEventListener('input', () => {
            clearTimeout(searchTimer);
            searchTimer = setTimeout(applyFilter, 300);
        });
    }

    // --- यी फंक्शनहरू हराएकोले Error आएको थियो ---
    function openFilterModal() {
        if (allMembers.length === 0) {
            alert('सदस्यहरूको डाटा लोड हुँदैछ, कृपया केही सेकेन्ड पर्खनुहोस्।');
            return;
        }
        populateFilterDropdowns();
        document.getElementById('filterModal').style.display = 'flex';
        document.body.style.overflow = 'hidden';
        document.addEventListener('keydown', handleFilterKeydown);
        applyFilter(); 
    }

    function closeFilterModal() {
        document.getElementById('filterModal').style.display = 'none';
        document.body.style.overflow = 'auto';
        document.removeEventListener('keydown', handleFilterKeydown);
    }

    function handleFilterKeydown(e) {
        if (e.key === 'Escape') closeFilterModal();
    }

    function resetFilter() {
        document.getElementById('filterCountry').value = '';
        document.getElementById('filterDistrict').value = '';
        document.getElementById('filterProvince').value = '';
        document.getElementById('filterArea').value = '';
        document.getElementById('filterGeneration').value = '';
        document.getElementById('filterProfession').value = '';
        document.getElementById('filterCategory').value = '';
        document.getElementById('filterSearchText').value = '';
        applyFilter();
    }

    function applyFilter() {
        filterState.country = document.getElementById('filterCountry').value;
        filterState.district = document.getElementById('filterDistrict').value;
        filterState.province = document.getElementById('filterProvince').value;
        filterState.area = document.getElementById('filterArea').value;
        filterState.generation = document.getElementById('filterGeneration').value;
        filterState.profession = document.getElementById('filterProfession').value;
        filterState.category = document.getElementById('filterCategory').value;
        filterState.searchText = document.getElementById('filterSearchText').value.trim().toLowerCase();

        const filtered = allMembers.filter(m => matchesFilter(m));
        renderFilterResults(filtered);
        document.getElementById('filterCount').textContent = `फिल्टर गरिएको: ${filtered.length} / ${allMembers.length}`;
    }

    function matchesFilter(member) {
        const addressStr = member.Address || member.Thegana || member.PermanentAddress || member.CurrentAddress || '';
        const parsed = parseAddress(addressStr);
        
        const genCode = getGenerationFromCode(member.PersonalCode);
        const categoryCode = getCategoryFromCode(member.PersonalCode);
        const profession = member.Profession || member.Occupation || member.Job || '';

        if (filterState.country && parsed.country !== filterState.country) return false;
        if (filterState.district && parsed.district !== filterState.district) return false;
        if (filterState.province && parsed.province !== filterState.province) return false;
        if (filterState.area && parsed.area !== filterState.area) return false;
        if (filterState.generation && genCode !== filterState.generation) return false;
        if (filterState.category && categoryCode !== filterState.category) return false;
        if (filterState.profession && !matchesProfession(profession, filterState.profession)) return false;

        if (filterState.searchText) {
            const name = (member.FullName || '').toLowerCase();
            const code = (member.PersonalCode || '').toLowerCase();
            if (!name.includes(filterState.searchText) && !code.includes(filterState.searchText)) return false;
        }

        return true;
    }

    function renderFilterResults(members) {
        const container = document.getElementById('filterResults');
        if (!container) return;

        if (!members || members.length === 0) {
            container.innerHTML = `
                <div class="filter-empty">
                    <i class="fas fa-user-slash"></i>
                    कुनै सदस्य भेटिएन। फिल्टर परिवर्तन गर्नुहोस्।
                </div>`;
            return;
        }

        const sorted = [...members].sort((a, b) => {
            const ca = String(a.PersonalCode || '');
            const cb = String(b.PersonalCode || '');
            if (ca.length !== cb.length) return ca.length - cb.length;
            return ca.localeCompare(cb);
        });

        container.innerHTML = sorted.map(m => {
            const photo = m.PhotoUrl || '';
            const avatar = photo
                ? `<img src="${escapeHtml(photo)}" alt="" loading="lazy" onerror="this.parentNode.innerHTML='<i class=\\'fas fa-user\\'></i>'">`
                : `<i class="fas fa-user"></i>`;

            const addressStr = m.Address || m.Thegana || m.PermanentAddress || m.CurrentAddress || '';
            const parsed = parseAddress(addressStr);
            const genCode = getGenerationFromCode(m.PersonalCode);
            const category = getCategoryFromCode(m.PersonalCode);
            const prof = m.Profession || m.Occupation || m.Job || '';
            
            const catLabels = { 'Son': 'छोरा', 'Daughter': 'छोरी', 'SonInLaw': 'ज्वाइँ', 'DaughterInLaw': 'बुहारी' };
            const catLabel = catLabels[category] || '';

            const tagClass = parsed.country === 'Nepal' ? 'tag-nepal' : 'tag-foreign';

            return `
                <div class="filter-member-item ${tagClass}">
                    <div class="filter-member-avatar">${avatar}</div>
                    <div class="filter-member-info">
                        <div class="filter-member-name">${escapeHtml(m.FullName || 'Unknown')} ${catLabel ? `<span style="font-size:0.75rem; color:#666; font-weight:normal;">(${catLabel})</span>` : ''}</div>
                        <div class="filter-member-meta">
                            <span><i class="fas fa-layer-group"></i> पुस्ता ${genCode}</span>
                            ${prof ? `<span><i class="fas fa-briefcase"></i> ${escapeHtml(prof)}</span>` : ''}
                            <span><i class="fas fa-map-marker-alt"></i> ${escapeHtml(parsed.country)} ${parsed.district ? '- ' + escapeHtml(parsed.district) : ''}</span>
                        </div>
                    </div>
                    <div class="filter-member-code">${escapeHtml(m.PersonalCode || '')}</div>
                </div>
            `;
        }).join('');
    }

    async function downloadFilteredJPG() {
        const filteredMembers = allMembers.filter(m => matchesFilter(m));
        
        if (filteredMembers.length === 0) {
            alert('सेभ गर्नको लागि कुनै डाटा भेटिएन। कृपया फिल्टर परिवर्तन गर्नुहोस्।');
            return;
        }

        // Check if html2canvas is loaded
        if (typeof html2canvas === 'undefined') {
            alert('html2canvas लाइब्रेरी लोड भएको छैन। कृपया पेज रिफ्रेस गर्नुहोस् वा इन्टरनेट चेक गर्नुहोस्।');
            return;
        }

        const btn = document.getElementById('btnSaveFilterJPG');
        const originalHtml = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> बन्दैछ...';
        btn.disabled = true;

        // Create an off-screen container
        const container = document.createElement('div');
        container.style.position = 'fixed';
        container.style.top = '0';
        container.style.left = '0';
        container.style.width = '850px'; // Wider for better layout
        container.style.background = '#ffffff';
        container.style.padding = '40px';
        container.style.zIndex = '-9999';
        container.style.fontFamily = "'Sanskrit-Text', 'MySanskritFont', sans-serif";

        // Build the HTML content for JPG
        let itemsHtml = '';
        filteredMembers.sort((a, b) => String(a.PersonalCode).localeCompare(String(b.PersonalCode))).forEach(m => {
            const addressStr = m.Address || m.Thegana || m.PermanentAddress || m.CurrentAddress || '';
            const parsed = parseAddress(addressStr);
            const genCode = getGenerationFromCode(m.PersonalCode);
            const category = getCategoryFromCode(m.PersonalCode);
            const prof = m.Profession || m.Occupation || m.Job || '';
            
            const catLabels = { 'Son': 'छोरा', 'Daughter': 'छोरी', 'SonInLaw': 'ज्वाइँ', 'DaughterInLaw': 'बुहारी' };
            const catLabel = catLabels[category] ? `(${catLabels[category]})` : '';

            itemsHtml += `
                <tr style="border-bottom: 1px solid #ddd;">
                    <td style="padding: 10px 8px; font-weight: bold; width: 15%; color: #0a6b3e;">${escapeHtml(m.PersonalCode || '')}</td>
                    <td style="padding: 10px 8px; width: 25%; font-weight: bold;">${escapeHtml(m.FullName || 'Unknown')} <span style="font-size: 11px; color: #666; font-weight: normal;">${catLabel}</span></td>
                    <td style="padding: 10px 8px; width: 15%; font-size: 14px;">पुस्ता ${genCode}</td>
                    <td style="padding: 10px 8px; width: 20%; font-size: 14px;">${escapeHtml(prof || '-')}</td>
                    <td style="padding: 10px 8px; width: 25%; font-size: 14px;">${escapeHtml(parsed.country)} ${parsed.district ? '- ' + escapeHtml(parsed.district) : ''}</td>
                </tr>
            `;
        });

        // Get active filters for the header
        const activeFilters = [];
        if (filterState.country) activeFilters.push(`देश: ${filterState.country}`);
        if (filterState.province) activeFilters.push(`प्रदेश: ${filterState.province}`);
        if (filterState.district) activeFilters.push(`जिल्ला: ${filterState.district}`);
        if (filterState.area) activeFilters.push(`क्षेत्र: ${filterState.area}`);
        if (filterState.generation) activeFilters.push(`पुस्ता: ${filterState.generation}`);
        if (filterState.profession) activeFilters.push(`पेशा: ${filterState.profession}`);
        if (filterState.category) activeFilters.push(`वर्ग: ${filterState.category}`);
        
        const filterText = activeFilters.length > 0 ? activeFilters.join(' | ') : 'सबै सदस्यहरू';

        container.innerHTML = `
            <div style="text-align: center; margin-bottom: 25px; border-bottom: 3px solid #0a6b3e; padding-bottom: 15px;">
                <h1 style="color: #0a6b3e; margin: 0 0 10px 0; font-size: 28px;">ओझा बन्धु वंशावली - फिल्टर गरिएको सूची</h1>
                <p style="margin: 0; color: #555; font-size: 15px;">मिति: ${new Date().toLocaleDateString('ne-NP')} | कुल सदस्य: ${filteredMembers.length}</p>
                <p style="margin: 8px 0 0 0; color: #d9534f; font-size: 13px; font-weight: bold;">फिल्टर: ${filterText}</p>
            </div>
            <table style="width: 100%; border-collapse: collapse; font-size: 15px;">
                <thead>
                    <tr style="background: #f4f4f4; border-bottom: 2px solid #ccc;">
                        <th style="padding: 12px 8px; text-align: left; width: 15%;">कोड</th>
                        <th style="padding: 12px 8px; text-align: left; width: 25%;">नाम</th>
                        <th style="padding: 12px 8px; text-align: left; width: 15%;">पुस्ता</th>
                        <th style="padding: 12px 8px; text-align: left; width: 20%;">पेशा</th>
                        <th style="padding: 12px 8px; text-align: left; width: 25%;">ठेगाना</th>
                    </tr>
                </thead>
                <tbody>
                    ${itemsHtml}
                </tbody>
            </table>
            <div style="text-align: center; margin-top: 25px; font-size: 13px; color: #888;">
                Generated from Ojha Bandhu Bansawali App
            </div>
        `;

        document.body.appendChild(container);

        try {
            // Generate canvas
            const canvas = await html2canvas(container, {
                scale: 2, // High quality
                useCORS: true,
                backgroundColor: '#ffffff',
                logging: false
            });

            // Convert canvas to JPG data URL
            const imgData = canvas.toDataURL('image/jpeg', 0.95);

            // Create a temporary link to trigger download
            const link = document.createElement('a');
            link.download = `Ojha_Filtered_Members_${Date.now()}.jpg`;
            link.href = imgData;
            document.body.appendChild(link); // Required for Firefox
            link.click();
            document.body.removeChild(link);

        } catch (error) {
            console.error('JPG Save Error:', error);
            alert('JPG फाइल सेभ गर्न सकिएन। कृपया पुनः प्रयास गर्नुहोस्। (Error details in console)');
        } finally {
            // Cleanup
            if (container.parentNode) {
                container.parentNode.removeChild(container);
            }
            btn.innerHTML = originalHtml;
            btn.disabled = false;
        }
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
            // MemberSearch.js मा रहेको स्मार्ट सर्च युटिलिटी प्रयोग गर्ने
            if (typeof MemberSearch !== 'undefined' && MemberSearch.filterMembers) {
                return MemberSearch.filterMembers(allMembers, query);
            }
            // यदि कुनै कारणले MemberSearch लोड भएको छैन भने Fallback
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
                        inputEl.blur(); // ड्रपडाउन बन्द गर्ने
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