// ViewRequestScript.js - View Suggestions Page

(function() {
    'use strict';

    // ------------------------------------------------------------
    // 1. Supabase from Config
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

    async function checkPrivatePageAccess() {
        console.log('🔐 Checking authentication...');
        try {
            const { data: { session }, error } = await supabase.auth.getSession();
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
    // 3. State variables
    // ------------------------------------------------------------
    let allSuggestions = [];
    let filteredSuggestions = [];
    let currentPage = 1;
    const itemsPerPage = 20;
    let currentEditingSuggestion = null;
    let currentViewingSuggestion = null;
    let isSubmitting = false;

    // ------------------------------------------------------------
    // 4. DOM References
    // ------------------------------------------------------------
    const tableBody       = document.getElementById('SuggestionTableBody');
    const filterType      = document.getElementById('filterType');
    const filterSearch    = document.getElementById('filterSearch');
    const btnRefresh      = document.getElementById('btnRefresh');
    const btnPrevPage     = document.getElementById('btnPrevPage');
    const btnNextPage     = document.getElementById('btnNextPage');
    const pageInfo        = document.getElementById('pageInfo');

    const editModal         = document.getElementById('editModal');
    const closeEditModal    = document.getElementById('closeEditModal');
    const closeEditModalBtn = document.getElementById('closeEditModalBtn');
    const editForm          = document.getElementById('editSuggestionForm');
    const saveEditBtn       = document.getElementById('saveEditBtn');

    const viewModal            = document.getElementById('viewModal');
    const viewModalBody        = document.getElementById('viewModalBody');
    const closeViewModal       = document.getElementById('closeViewModal');
    const viewActionEdit       = document.getElementById('viewActionEdit');
    const viewActionAdd        = document.getElementById('viewActionAdd');
    const viewActionDownload   = document.getElementById('viewActionDownload');
    const viewActionDelete     = document.getElementById('viewActionDelete');

    // ------------------------------------------------------------
    // 5. Helpers
    // ------------------------------------------------------------
    function getSuggestionId(item) {
        if (!item) return null;
        if (item.id !== undefined && item.id !== null) return item.id;
        if (item.Id !== undefined && item.Id !== null) return item.Id;
        if (item.suggestion_id !== undefined && item.suggestion_id !== null) return item.suggestion_id;
        if (item.SuggestionId !== undefined && item.SuggestionId !== null) return item.SuggestionId;
        if (item._id !== undefined && item._id !== null) return item._id;
        return null;
    }

    function findSuggestionById(id) {
        if (!id) return null;
        const searchId = String(id);
        return allSuggestions.find(item => {
            const itemId = getSuggestionId(item);
            return itemId !== null && String(itemId) === searchId;
        });
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

    function normalizeGender(g) {
        if (!g) return 'M';
        const s = String(g).trim().toUpperCase();
        if (s === 'O') return 'N';
        if (s === 'M' || s === 'F' || s === 'N') return s;
        return 'M';
    }

    function getGenderLabel(g) {
        const s = normalizeGender(g);
        if (s === 'M') return 'पुरूष';
        if (s === 'F') return 'महिला';
        return 'अन्य';
    }

    function getRequestType(item) {
        if (!item) return 'add';
        if (item.RequestType !== undefined && item.RequestType !== null) {
            const rt = String(item.RequestType).trim().toLowerCase();
            if (rt === 'edit'   || rt === 'सम्पादन')    return 'edit';
            if (rt === 'add'    || rt === 'थप')         return 'add';
            if (rt === 'edited' || rt === 'सम्पादित')   return 'edited';
            if (rt === 'added'  || rt === 'थपिएको' || rt === 'थपिएका') return 'added';
        }
        return (item.MemberCode && String(item.MemberCode).trim() !== '')
            ? 'edit'
            : 'add';
    }

    function getRequestTypeLabel(type) {
        switch (type) {
            case 'edit':   return 'सम्पादन';
            case 'add':    return 'थप';
            case 'edited': return 'सम्पादित';
            case 'added':  return 'थपिएको';
            default:       return 'थप';
        }
    }

    function getTypeBadgeClass(type) {
        switch (type) {
            case 'edit':   return 'type-edit';
            case 'add':    return 'type-add';
            case 'edited': return 'type-edited';
            case 'added':  return 'type-added';
            default:       return 'type-add';
        }
    }

    function getPhotoUrl(item) {
        if (!item) return '';
        return item.MemberPhotoUrl || item.PhotoUrl || item.photoUrl || '';
    }

    // ------------------------------------------------------------
    // 6. Load Suggestions
    // ------------------------------------------------------------
    async function loadSuggestions() {
        try {
            let data = null;
            let error = null;

            ({ data, error } = await supabase
                .from('MemberSuggestionTable')
                .select('*')
                .order('id', { ascending: false }));

            if (error) {
                console.warn('⚠️ order by id failed, retrying without order:', error.message);
                ({ data, error } = await supabase
                    .from('MemberSuggestionTable')
                    .select('*'));
            }

            if (error) throw error;

            if (!data || data.length === 0) {
                allSuggestions = [];
                filteredSuggestions = [];
                tableBody.innerHTML = `
                    <tr>
                        <td colspan="10" style="text-align:center; padding: 40px; color: #666;">
                            <i class="fas fa-inbox"></i> कुनै सुझावहरू छैनन्
                        </td>
                    </tr>
                `;
                updatePagination();
                return;
            }

            data.sort((a, b) => {
                const ai = Number(getSuggestionId(a)) || 0;
                const bi = Number(getSuggestionId(b)) || 0;
                return bi - ai;
            });

            allSuggestions = data;
            console.log('✅ Loaded', allSuggestions.length, 'suggestions');
            applyFilters();

        } catch (error) {
            console.error('Error loading suggestions:', error);
            tableBody.innerHTML = `
                <tr>
                    <td colspan="10" style="text-align:center; padding: 40px; color: #b02b2b;">
                        <i class="fas fa-exclamation-triangle"></i> त्रुटि: ${escapeHtml(error.message)}
                    </td>
                </tr>
            `;
        }
    }

    // ------------------------------------------------------------
    // 7. Filter and Search
    // ------------------------------------------------------------
    function applyFilters() {
        const typeFilter = filterType ? filterType.value : 'all';
        const search = filterSearch ? filterSearch.value.toLowerCase().trim() : '';

        filteredSuggestions = allSuggestions.filter(item => {
            const type = getRequestType(item);

            if (typeFilter === 'edit'   && type !== 'edit')   return false;
            if (typeFilter === 'add'    && type !== 'add')    return false;
            if (typeFilter === 'edited' && type !== 'edited') return false;
            if (typeFilter === 'added'  && type !== 'added')  return false;

            if (search) {
                const nameMatch  = (item.MemberFullName || '').toLowerCase().includes(search);
                const codeMatch  = (item.MemberCode || '').toLowerCase().includes(search);
                const phoneMatch = (item.MemberMobile || '').toLowerCase().includes(search);
                const emailMatch = (item.MemberEmail || '').toLowerCase().includes(search);
                const connName   = (item.ConnectedName || '').toLowerCase().includes(search);
                const connCode   = (item.ConnectedCode || '').toLowerCase().includes(search);
                if (!nameMatch && !codeMatch && !phoneMatch && !emailMatch && !connName && !connCode) return false;
            }

            return true;
        });

        currentPage = 1;
        rebuildTableHead();
        renderTable();
        updatePagination();
    }

    // ------------------------------------------------------------
    // 7b. Rebuild the table header based on the current filter
    // ------------------------------------------------------------
    function isAddLayout() {
        const t = filterType ? filterType.value : 'all';
        return (t === 'add' || t === 'added');
    }

    function rebuildTableHead() {
        const thead = document.getElementById('SuggestionTableHead');
        const table = document.getElementById('SuggestionTable');
        if (!thead || !table) return;

        if (isAddLayout()) {
            thead.innerHTML = `
                <tr>
                    <th title="क्रम संख्या">क्र.सं.</th>
                    <th title="सदस्यको नाम">सदस्यको नाम</th>
                    <th title="जोडिएको व्यक्ति">जोडिएको व्यक्ति</th>
                    <th title="जोडिएको सम्बन्ध">जोडिएको सम्बन्ध</th>
                    <th title="जोडिएको कोड">जोडिएको कोड</th>
                    <th title="बाबुको नाम">बाबुको नाम</th>
                    <th title="आमाको नाम">आमाको नाम</th>
                    <th title="सम्पर्क फोन नम्बर">फोन</th>
                    <th title="सम्पर्क इमेल ठेगाना">इमेल</th>
                    <th title="अनुरोधको प्रकार">प्रकार</th>
                    <th title="अनुरोध मिति">मिति</th>
                    <th title="कार्यहरू">कार्य</th>
                </tr>
            `;
            table.dataset.layout = 'add';
            table.style.minWidth = '1760px';
        } else {
            thead.innerHTML = `
                <tr>
                    <th title="क्रम संख्या">क्र.सं.</th>
                    <th title="सदस्यको नाम">सदस्यको नाम</th>
                    <th title="सदस्यको व्यक्तिगत कोड">कोड</th>
                    <th title="बाबुको नाम">बाबुको नाम</th>
                    <th title="आमाको नाम">आमाको नाम</th>
                    <th title="सम्पर्क फोन नम्बर">फोन</th>
                    <th title="सम्पर्क इमेल ठेगाना">इमेल</th>
                    <th title="अनुरोधको प्रकार">प्रकार</th>
                    <th title="अनुरोध मिति">मिति</th>
                    <th title="कार्यहरू">कार्य</th>
                </tr>
            `;
            table.dataset.layout = 'edit';
            table.style.minWidth = '1440px';
        }
    }

    // ------------------------------------------------------------
    // 8. Render Table
    // ------------------------------------------------------------
    function renderTable() {
        const start = (currentPage - 1) * itemsPerPage;
        const end = start + itemsPerPage;
        const pageItems = filteredSuggestions.slice(start, end);

        const usingAddLayout = isAddLayout();
        const colCount = usingAddLayout ? 12 : 10;

        if (pageItems.length === 0) {
            tableBody.innerHTML = `
                <tr>
                    <td colspan="${colCount}" style="text-align:center; padding: 40px; color: #666;">
                        <i class="fas fa-search"></i> कुनै सुझावहरू फेला परेनन्
                    </td>
                </tr>
            `;
            return;
        }

        let html = '';
        pageItems.forEach((item, index) => {
            const globalIndex = start + index + 1;
            const type = getRequestType(item);
            const typeClass = getTypeBadgeClass(type);
            const typeLabel = getRequestTypeLabel(type);
            const itemId = getSuggestionId(item);
            const hasPhoto = !!getPhotoUrl(item);

            // Common cell fragments
            const cellIndex = `<td>${globalIndex}</td>`;
            const cellName  = `<td>${escapeHtml(item.MemberFullName || '-')}</td>`;
            const cellFather = `<td>${escapeHtml(item.MemberFather || '-')}</td>`;
            const cellMother = `<td>${escapeHtml(item.MemberMother || '-')}</td>`;
            const cellPhone  = `<td>${escapeHtml(item.MemberMobile || '-')}</td>`;
            const cellEmail  = `<td>${escapeHtml(item.MemberEmail || '-')}</td>`;
            const cellType   = `<td><span class="type-badge ${typeClass}">${typeLabel}</span></td>`;
            const cellDate   = `<td>${escapeHtml(formatDate(item.created_at))}</td>`;
            const cellActions = `
                <td>
                    <div class="action-buttons">
                        <button class="btn-action btn-action-view" data-id="${itemId}" title="पूर्ण विवरण हेर्नुहोस्">
                            <i class="fas fa-eye"></i> हेर्नुहोस्
                        </button>
                        ${type === 'edit' || type === 'edited'
                            ? `<button class="btn-action btn-action-edit" data-id="${itemId}" title="यो सुझाव सम्पादन गर्नुहोस्">
                                <i class="fas fa-edit"></i> सम्पादन
                            </button>`
                            : `<button class="btn-action btn-action-add" data-id="${itemId}" title="यसलाई नयाँ सदस्यको रूपमा थप्नुहोस्">
                                <i class="fas fa-user-plus"></i> थप्नुहोस्
                            </button>`}
                        <button class="btn-action btn-action-download" data-id="${itemId}"
                                title="${hasPhoto ? 'फोटो डाउनलोड गर्नुहोस्' : 'कुनै फोटो उपलब्ध छैन'}"
                                ${hasPhoto ? '' : 'disabled'}>
                            <i class="fas fa-download"></i> फोटो
                        </button>
                        <button class="btn-action btn-action-delete" data-id="${itemId}" title="यो सुझाव मेटाउनुहोस्">
                            <i class="fas fa-trash"></i> मेट्नुहोस्
                        </button>
                    </div>
                </td>
            `;

            if (usingAddLayout) {
                // 12 columns:
                // क्र.सं., नाम, जोडिएको व्यक्ति, जोडिएको सम्बन्ध, जोडिएको कोड,
                // बाबुको नाम, आमाको नाम, फोन, इमेल, प्रकार, मिति, कार्य
                const cellConnName = `<td>${escapeHtml(item.ConnectedName || '-')}</td>`;
                const cellConnRel  = `<td>${escapeHtml(item.ConnectedRelation || '-')}</td>`;
                const cellConnCode = `<td>${escapeHtml(item.ConnectedCode || '-')}</td>`;

                html += `
                    <tr>
                        ${cellIndex}
                        ${cellName}
                        ${cellConnName}
                        ${cellConnRel}
                        ${cellConnCode}
                        ${cellFather}
                        ${cellMother}
                        ${cellPhone}
                        ${cellEmail}
                        ${cellType}
                        ${cellDate}
                        ${cellActions}
                    </tr>
                `;
            } else {
                // 10 columns:
                // क्र.सं., नाम, कोड, बाबुको नाम, आमाको नाम, फोन, इमेल, प्रकार, मिति, कार्य
                const cellCode = `<td>${escapeHtml(item.MemberCode || '-')}</td>`;
                html += `
                    <tr>
                        ${cellIndex}
                        ${cellName}
                        ${cellCode}
                        ${cellFather}
                        ${cellMother}
                        ${cellPhone}
                        ${cellEmail}
                        ${cellType}
                        ${cellDate}
                        ${cellActions}
                    </tr>
                `;
            }
        });

        tableBody.innerHTML = html;

        // Reattach listeners
        document.querySelectorAll('.btn-action-view').forEach(btn => {
            btn.addEventListener('click', function () {
                const s = findSuggestionById(this.dataset.id);
                if (s) openViewModal(s);
            });
        });

        document.querySelectorAll('.btn-action-add').forEach(btn => {
            btn.addEventListener('click', function () {
                const s = findSuggestionById(this.dataset.id);
                if (s) openAddMemberPage(s);
            });
        });

        document.querySelectorAll('.btn-action-edit').forEach(btn => {
            btn.addEventListener('click', function () {
                const s = findSuggestionById(this.dataset.id);
                if (s) openEditModal(s);
            });
        });

        document.querySelectorAll('.btn-action-download').forEach(btn => {
            btn.addEventListener('click', function () {
                const s = findSuggestionById(this.dataset.id);
                if (s) downloadPhoto(s);
            });
        });

        document.querySelectorAll('.btn-action-delete').forEach(btn => {
            btn.addEventListener('click', function () {
                const id = this.dataset.id;
                if (confirm('के तपाईं यो सुझाव मेटाउन निश्चित हुनुहुन्छ?')) {
                    deleteSuggestion(id);
                }
            });
        });
    }

    function formatDate(dateString) {
        if (!dateString) return '-';
        const date = new Date(dateString);
        if (isNaN(date.getTime())) return '-';
        return date.toLocaleDateString('ne-NP', {
            year: 'numeric', month: 'short', day: 'numeric',
            hour: '2-digit', minute: '2-digit'
        });
    }

    // ------------------------------------------------------------
    // 9. Pagination
    // ------------------------------------------------------------
    function updatePagination() {
        const totalPages = Math.ceil(filteredSuggestions.length / itemsPerPage);
        pageInfo.textContent = `पृष्ठ ${currentPage} / ${totalPages || 1}`;
        btnPrevPage.disabled = currentPage <= 1;
        btnNextPage.disabled = currentPage >= totalPages || totalPages === 0;
    }

    // ------------------------------------------------------------
    // 10. Download Photo
    // ------------------------------------------------------------
    function downloadPhoto(suggestion) {
        const photoUrl = getPhotoUrl(suggestion);
        if (!photoUrl) {
            alert('यस सुझावमा कुनै फोटो छैन।');
            return;
        }
        const filename = photoUrl.split('/').pop().split('?')[0] || 'photo.jpg';
        fetch(photoUrl)
            .then(response => response.blob())
            .then(blob => {
                const url = window.URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = url;
                link.download = filename;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                window.URL.revokeObjectURL(url);
            })
            .catch(error => {
                console.error('Download error:', error);
                window.open(photoUrl, '_blank');
            });
    }

    // ------------------------------------------------------------
    // 11. Open AddMember Page
    // ------------------------------------------------------------
    async function openAddMemberPage(suggestion) {
        if (!suggestion) { alert('कुनै सुझाव चयन गरिएको छैन।'); return; }

        const id = getSuggestionId(suggestion);
        if (id) {
            try {
                const { error } = await supabase
                    .from('MemberSuggestionTable')
                    .update({ RequestType: 'added' })
                    .eq('id', id);
                if (error) {
                    console.warn('⚠️ Could not update RequestType to "added":', error.message);
                } else {
                    console.log('✅ RequestType updated to "added"');
                    suggestion.RequestType = 'added';
                }
            } catch (e) {
                console.warn('⚠️ Exception updating RequestType:', e);
            }
        }

        const suggestionData = {
            FullName: suggestion.MemberFullName || '',
            Gender: normalizeGender(suggestion.MemberGender),
            Address: suggestion.MemberAddress || '',
            Mobile: suggestion.MemberMobile || '',
            Email: suggestion.MemberEmail || '',
            Father: suggestion.MemberFather || '',
            Mother: suggestion.MemberMother || '',
            Spouse: suggestion.MemberSpouse || '',
            DOB: suggestion.MemberDOB || '',
            Sons: suggestion.MemberSons || '',
            Daughters: suggestion.MemberDaughters || '',
            Profession: suggestion.MemberProfession || '',
            Qualification: suggestion.MemberQualification || '',
            Position: suggestion.MemberPlace || '',
            DetailAddress: suggestion.MemberDetailAddress || '',
            DetailProfession: suggestion.MemberDetailProfession || '',
            LifeStory: suggestion.MemberLifeStory || '',
            DOD_Age: suggestion.MemberDOD || '',
            PhotoUrl: getPhotoUrl(suggestion),
            SuggestionId: id,

            ConnectedName: suggestion.ConnectedName || '',
            ConnectedRelation: suggestion.ConnectedRelation || '',
            ConnectedCode: suggestion.ConnectedCode || '',
            RequestType: 'added',

            MemberCode: suggestion.MemberCode || '',
            returnToViewRequest: true
        };

        localStorage.setItem('suggestionData', JSON.stringify(suggestionData));
        window.location.href = '../AddMemberPage/AddMemberIndex.html';
    }

    // ------------------------------------------------------------
    // 12. Edit Modal
    // ------------------------------------------------------------
    function openEditModal(suggestion) {
        currentEditingSuggestion = suggestion;

        document.getElementById('editMemberCode').value = suggestion.MemberCode || '';
        document.getElementById('editFullName').value     = suggestion.MemberFullName || '';
        document.getElementById('editGender').value       = normalizeGender(suggestion.MemberGender);
        document.getElementById('editAddress').value      = suggestion.MemberAddress || '';
        document.getElementById('editMobile').value       = suggestion.MemberMobile || '';
        document.getElementById('editEmail').value        = suggestion.MemberEmail || '';
        document.getElementById('editFather').value       = suggestion.MemberFather || '';
        document.getElementById('editMother').value       = suggestion.MemberMother || '';
        document.getElementById('editSpouse').value       = suggestion.MemberSpouse || '';
        document.getElementById('editDob').value          = suggestion.MemberDOB || '';
        document.getElementById('editSons').value         = suggestion.MemberSons || '';
        document.getElementById('editDaughters').value    = suggestion.MemberDaughters || '';
        document.getElementById('editProfession').value   = suggestion.MemberProfession || '';
        document.getElementById('editQualification').value = suggestion.MemberQualification || '';
        document.getElementById('editPosition').value     = suggestion.MemberPlace || '';
        document.getElementById('editDetailAddress').value = suggestion.MemberDetailAddress || '';
        document.getElementById('editDetailProfession').value = suggestion.MemberDetailProfession || '';
        document.getElementById('editLifeStory').value    = suggestion.MemberLifeStory || '';
        document.getElementById('editDodAge').value       = suggestion.MemberDOD || '';

        const photoUrl = getPhotoUrl(suggestion);
        document.getElementById('editPhotoUrl').value = photoUrl;

        if (photoUrl) {
            document.getElementById('editPhotoPreview').src = photoUrl;
            document.getElementById('editPhotoPreview').style.display = 'block';
            const filename = photoUrl.split('/').pop().split('?')[0] || 'फोटो';
            document.getElementById('editPhotoFileNameDisplay').textContent = filename;
        } else {
            document.getElementById('editPhotoPreview').style.display = 'none';
            document.getElementById('editPhotoFileNameDisplay').textContent = 'कुनै फोटो छैन';
        }

        document.getElementById('editPhotoFile').value = '';
        document.getElementById('editUploadStatus').innerHTML = '';

        editModal.style.display = 'block';
        document.body.style.overflow = 'hidden';
    }

    function closeEditModalFunc() {
        editModal.style.display = 'none';
        document.body.style.overflow = '';
        currentEditingSuggestion = null;
    }

    // ------------------------------------------------------------
    // 13. View Modal
    // ------------------------------------------------------------
    function openViewModal(suggestion) {
        if (!suggestion) return;
        currentViewingSuggestion = suggestion;

        const type = getRequestType(suggestion);
        const hasPhoto = !!getPhotoUrl(suggestion);

        const row = (label, value) => {
            const v = (value === null || value === undefined || String(value).trim() === '')
                ? '-' : String(value);
            return `
                <div class="view-row">
                    <div class="view-label">${escapeHtml(label)}</div>
                    <div class="view-value">${escapeHtml(v)}</div>
                </div>`;
        };

        let html = '';

        html += `<div class="view-section">
                    <div class="view-section-title"><i class="fas fa-info-circle"></i> सामान्य जानकारी</div>
                    ${row('अनुरोधको प्रकार', getRequestTypeLabel(type))}
                    ${row('सदस्य कोड', suggestion.MemberCode || '')}
                    ${row('सम्बन्धित व्यक्तिको नाम', suggestion.ConnectedName || '')}
                    ${row('सम्बन्ध', suggestion.ConnectedRelation || '')}
                    ${row('सम्बन्धित व्यक्तिको कोड', suggestion.ConnectedCode || '')}
                    ${row('अनुरोध मिति', formatDate(suggestion.created_at))}
                </div>`;

        html += `<div class="view-section">
                    <div class="view-section-title"><i class="fas fa-user"></i> व्यक्तिगत जानकारी</div>
                    ${row('पुरा नाम (नेपाली)', suggestion.MemberFullName)}
                    ${row('लिङ्ग', getGenderLabel(suggestion.MemberGender))}
                    ${row('जन्म मिति', suggestion.MemberDOB)}
                    ${row('मृत्यु मिति / उमेर', suggestion.MemberDOD)}
                </div>`;

        html += `<div class="view-section">
                    <div class="view-section-title"><i class="fas fa-users"></i> पारिवारिक जानकारी</div>
                    ${row('बाबुको नाम', suggestion.MemberFather)}
                    ${row('आमाको नाम', suggestion.MemberMother)}
                    ${row('श्रीमान/श्रीमतीको नाम', suggestion.MemberSpouse)}
                    ${row('छोराहरू', suggestion.MemberSons)}
                    ${row('छोरीहरू', suggestion.MemberDaughters)}
                    ${row('परिवारमा स्थान', suggestion.MemberPlace)}
                </div>`;

        html += `<div class="view-section">
                    <div class="view-section-title"><i class="fas fa-address-book"></i> सम्पर्क तथा ठेगाना</div>
                    ${row('स्थायी ठेगाना', suggestion.MemberAddress)}
                    ${row('विस्तृत ठेगाना', suggestion.MemberDetailAddress)}
                    ${row('मोबाइल', suggestion.MemberMobile)}
                    ${row('इमेल', suggestion.MemberEmail)}
                </div>`;

        html += `<div class="view-section">
                    <div class="view-section-title"><i class="fas fa-briefcase"></i> पेशा तथा शिक्षा</div>
                    ${row('पेशा', suggestion.MemberProfession)}
                    ${row('विस्तृत व्यवसाय', suggestion.MemberDetailProfession)}
                    ${row('शैक्षिक योग्यता', suggestion.MemberQualification)}
                </div>`;

        html += `<div class="view-section">
                    <div class="view-section-title"><i class="fas fa-book-open"></i> जीवन कथा</div>
                    ${row('जीवन कथा', suggestion.MemberLifeStory)}
                </div>`;

        const photoUrl = getPhotoUrl(suggestion);
        html += `<div class="view-section">
                    <div class="view-section-title"><i class="fas fa-image"></i> फोटो</div>
                    <div class="view-photo-wrap">
                        ${photoUrl
                            ? `<img src="${escapeHtml(photoUrl)}" alt="photo" class="view-photo" />`
                            : `<div class="view-no-photo"><i class="fas fa-user-slash"></i> कुनै फोटो उपलब्ध छैन</div>`}
                    </div>
                </div>`;

        viewModalBody.innerHTML = html;

        viewActionEdit.dataset.id       = getSuggestionId(suggestion);
        viewActionAdd.dataset.id        = getSuggestionId(suggestion);
        viewActionDownload.dataset.id   = getSuggestionId(suggestion);
        viewActionDelete.dataset.id     = getSuggestionId(suggestion);

        if (type === 'edit' || type === 'edited') {
            viewActionEdit.style.display = '';
            viewActionAdd.style.display = 'none';
        } else {
            viewActionEdit.style.display = 'none';
            viewActionAdd.style.display = '';
        }

        viewActionDownload.disabled = !hasPhoto;

        viewModal.style.display = 'block';
        document.body.style.overflow = 'hidden';
    }

    function closeViewModalFunc() {
        viewModal.style.display = 'none';
        document.body.style.overflow = '';
        currentViewingSuggestion = null;
    }

    // ------------------------------------------------------------
    // 14. Invisible File Upload for Edit modal
    // ------------------------------------------------------------
    function setupInvisibleFileUpload(triggerBtnId, fileInputId, displayId, previewId) {
        const triggerBtn = document.getElementById(triggerBtnId);
        const fileInput  = document.getElementById(fileInputId);
        const display    = document.getElementById(displayId);
        const preview    = document.getElementById(previewId);
        if (!triggerBtn || !fileInput) return;

        triggerBtn.addEventListener('click', () => fileInput.click());

        fileInput.addEventListener('change', function() {
            if (this.files && this.files[0]) {
                const fileName = this.files[0].name;
                if (display) display.textContent = fileName;
                if (preview) {
                    const reader = new FileReader();
                    reader.onload = (e) => {
                        preview.src = e.target.result;
                        preview.style.display = 'block';
                    };
                    reader.readAsDataURL(this.files[0]);
                }
            }
        });
    }

    // ------------------------------------------------------------
    // 15. Upload Photo
    // ------------------------------------------------------------
    async function uploadEditPhoto(file) {
        const formData = new FormData();
        formData.append('file', file);
        try {
            const functionUrl = 'https://icchczijubhzxkjpebps.supabase.co/functions/v1/upload-to-imgbb';
            const response = await fetch(functionUrl, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` },
                body: formData
            });
            const result = await response.json();
            if (result.success && result.url) return { success: true, url: result.url };
            return { success: false, error: result.error || 'Upload failed' };
        } catch (error) {
            console.error('Upload error:', error);
            return { success: false, error: error.message };
        }
    }

    // ------------------------------------------------------------
    // 16. Update MemberDataTable with verification
    // ------------------------------------------------------------
    async function updateMemberDataTable(memberCodeRaw, memberPayload) {
        const memberCode = String(memberCodeRaw || '').trim();
        if (!memberCode) {
            console.warn('⚠️ No MemberCode, skipping MemberDataTable update');
            return { ok: false, matched: 0 };
        }

        console.log('🔎 Updating MemberDataTable where PersonalCode =', JSON.stringify(memberCode));
        console.log('   Payload keys:', Object.keys(memberPayload));

        // ✅ CRITICAL: .select() makes Supabase return the updated rows,
        //    so we can detect a 0-match (silent failure).
        const { data, error, status, statusText } = await supabase
            .from('MemberDataTable')
            .update(memberPayload)
            .eq('PersonalCode', memberCode)
            .select();

        console.log('   Response status:', status, statusText);
        console.log('   Rows returned:', Array.isArray(data) ? data.length : data);
        console.log('   Error:', error);

        if (error) {
            return { ok: false, matched: 0, error: error.message };
        }

        const matched = Array.isArray(data) ? data.length : 0;
        if (matched === 0) {
            // The query ran but matched no rows.
            // Verify the code really exists first, so we can report accurately.
            console.warn('⚠️ 0 rows updated. Verifying if the code exists...');
            const { data: check, error: checkErr } = await supabase
                .from('MemberDataTable')
                .select('PersonalCode')
                .eq('PersonalCode', memberCode)
                .limit(1);

            if (checkErr) {
                return { ok: false, matched: 0, error: `Verify failed: ${checkErr.message}` };
            }
            if (!check || check.length === 0) {
                return { ok: false, matched: 0, codeNotFound: true };
            }
            // Row exists but update matched 0 — this shouldn't happen, but report it
            return { ok: false, matched: 0, error: 'Row exists but update matched 0 rows' };
        }

        return { ok: true, matched, rows: data };
    }

    // ------------------------------------------------------------
    // 17. Save Edited Suggestion
    // ------------------------------------------------------------
    async function saveEditedSuggestion(e) {
        e.preventDefault();
        if (isSubmitting) return;
        isSubmitting = true;

        if (!currentEditingSuggestion) {
            alert('कुनै सुझाव चयन गरिएको छैन।');
            isSubmitting = false;
            return;
        }

        const fullName = document.getElementById('editFullName').value.trim();
        if (!fullName) {
            alert('कृपया पुरा नाम भर्नुहोस्।');
            isSubmitting = false;
            return;
        }

        if (saveEditBtn) {
            saveEditBtn.disabled = true;
            saveEditBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> सेभ गर्दै...';
        }

        let photoUrl = document.getElementById('editPhotoUrl').value || '';
        const photoFile = document.getElementById('editPhotoFile').files[0];

        if (photoFile) {
            const result = await uploadEditPhoto(photoFile);
            if (result.success) {
                photoUrl = result.url;
                document.getElementById('editUploadStatus').innerHTML = '<span style="color:#1f7b4d;">✅ फोटो अपलोड भयो</span>';
            } else {
                document.getElementById('editUploadStatus').innerHTML = `<span style="color:#b02b2b;">❌ ${escapeHtml(result.error)}</span>`;
                isSubmitting = false;
                if (saveEditBtn) {
                    saveEditBtn.disabled = false;
                    saveEditBtn.innerHTML = '<i class="fas fa-save"></i> सुझाव अपडेट गर्नुहोस्';
                }
                return;
            }
        }

        let gender = document.getElementById('editGender').value;
        if (gender === 'O') gender = 'N';

        // Suggestion payload (all columns including MemberQualification)
        const suggestionPayload = {
            MemberCode:             document.getElementById('editMemberCode').value.trim(),
            MemberFullName:         fullName,
            MemberGender:           gender,
            MemberAddress:          document.getElementById('editAddress').value.trim(),
            MemberMobile:           document.getElementById('editMobile').value.trim(),
            MemberEmail:            document.getElementById('editEmail').value.trim(),
            MemberFather:           document.getElementById('editFather').value.trim(),
            MemberMother:           document.getElementById('editMother').value.trim(),
            MemberSpouse:           document.getElementById('editSpouse').value.trim(),
            MemberDOB:              document.getElementById('editDob').value.trim(),
            MemberSons:             document.getElementById('editSons').value.trim(),
            MemberDaughters:        document.getElementById('editDaughters').value.trim(),
            MemberProfession:       document.getElementById('editProfession').value.trim(),
            MemberQualification:    document.getElementById('editQualification').value.trim(),
            MemberPlace:            document.getElementById('editPosition').value.trim(),
            MemberDetailAddress:    document.getElementById('editDetailAddress').value.trim(),
            MemberDetailProfession: document.getElementById('editDetailProfession').value.trim(),
            MemberLifeStory:        document.getElementById('editLifeStory').value.trim(),
            MemberDOD:              document.getElementById('editDodAge').value.trim(),
            MemberPhotoUrl:         photoUrl
        };

        // Preserve Connected* fields
        if (currentEditingSuggestion) {
            if (currentEditingSuggestion.ConnectedName !== undefined) {
                suggestionPayload.ConnectedName = currentEditingSuggestion.ConnectedName;
            }
            if (currentEditingSuggestion.ConnectedRelation !== undefined) {
                suggestionPayload.ConnectedRelation = currentEditingSuggestion.ConnectedRelation;
            }
            if (currentEditingSuggestion.ConnectedCode !== undefined) {
                suggestionPayload.ConnectedCode = currentEditingSuggestion.ConnectedCode;
            }
        }

        // Flip RequestType to 'edited'
        const originalType = getRequestType(currentEditingSuggestion);
        if (originalType === 'edit' || originalType === 'edited') {
            suggestionPayload.RequestType = 'edited';
        }

        try {
            // ---- 1) Save to MemberSuggestionTable ----
            const id = getSuggestionId(currentEditingSuggestion);
            const { error: suggestionError } = await supabase
                .from('MemberSuggestionTable')
                .update(suggestionPayload)
                .eq('id', id);
            if (suggestionError) throw suggestionError;
            console.log('✅ MemberSuggestionTable updated');

            // ---- 2) Save to MemberDataTable (mapped columns) ----
            const memberCode = String(suggestionPayload.MemberCode || '').trim();
            let memberUpdateResult = { ok: false, matched: 0 };

            if (memberCode) {
                const memberPayload = {
                    FullName:         suggestionPayload.MemberFullName,
                    Gender:           suggestionPayload.MemberGender,
                    Address:          suggestionPayload.MemberAddress,
                    Mobile:           suggestionPayload.MemberMobile,
                    Email:            suggestionPayload.MemberEmail,
                    Father:           suggestionPayload.MemberFather,
                    Mother:           suggestionPayload.MemberMother,
                    Spouse:           suggestionPayload.MemberSpouse,
                    DOB:              suggestionPayload.MemberDOB,
                    Sons:             suggestionPayload.MemberSons,
                    Daughters:        suggestionPayload.MemberDaughters,
                    Profession:       suggestionPayload.MemberProfession,
                    Qualification:    suggestionPayload.MemberQualification,
                    Position:         suggestionPayload.MemberPlace,
                    DetailAddress:    suggestionPayload.MemberDetailAddress,
                    DetailProfession: suggestionPayload.MemberDetailProfession,
                    LifeStory:        suggestionPayload.MemberLifeStory,
                    DOD_Age:          suggestionPayload.MemberDOD,
                    PhotoUrl:         suggestionPayload.MemberPhotoUrl
                };

                memberUpdateResult = await updateMemberDataTable(memberCode, memberPayload);
            }

            // ---- 3) Report outcome ----
            if (memberUpdateResult.ok) {
                alert(`✅ सुझाव अपडेट भयो र सदस्य तालिकामा पनि ${memberUpdateResult.matched} रेकर्ड अपडेट भयो!`);
            } else if (memberUpdateResult.codeNotFound) {
                alert(`⚠️ सुझाव सेभ भयो तर MemberDataTable मा कोड "${memberCode}" भेटिएन।\nकृपया सदस्य कोड जाँच्नुहोस्।`);
            } else if (memberUpdateResult.error) {
                alert(`⚠️ सुझाव सेभ भयो तर सदस्य तालिका अपडेट गर्न सकिएन:\n${memberUpdateResult.error}`);
            } else {
                alert('✅ सुझाव सफलतापूर्वक अपडेट गरियो!');
            }

            closeEditModalFunc();
            await loadSuggestions();

        } catch (error) {
            console.error('Update error:', error);
            alert(`❌ त्रुटि: ${error.message}`);
        } finally {
            isSubmitting = false;
            if (saveEditBtn) {
                saveEditBtn.disabled = false;
                saveEditBtn.innerHTML = '<i class="fas fa-save"></i> सुझाव अपडेट गर्नुहोस्';
            }
        }
    }

    // ------------------------------------------------------------
    // 18. Delete Suggestion
    // ------------------------------------------------------------
    async function deleteSuggestion(id) {
        if (!id) return;
        try {
            const { error } = await supabase
                .from('MemberSuggestionTable')
                .delete()
                .eq('id', id);
            if (error) throw error;

            alert('✅ सुझाव सफलतापूर्वक मेटियो!');
            await loadSuggestions();
        } catch (error) {
            console.error('Delete error:', error);
            alert(`❌ त्रुटि: ${error.message}`);
        }
    }

    // ------------------------------------------------------------
    // 19. Event Listeners
    // ------------------------------------------------------------
    if (filterType)   filterType.addEventListener('change', applyFilters);
    if (filterSearch) filterSearch.addEventListener('input', applyFilters);

    if (btnRefresh) {
        btnRefresh.addEventListener('click', () => loadSuggestions());
    }

    if (btnPrevPage) {
        btnPrevPage.addEventListener('click', () => {
            if (currentPage > 1) {
                currentPage--;
                renderTable();
                updatePagination();
            }
        });
    }
    if (btnNextPage) {
        btnNextPage.addEventListener('click', () => {
            const totalPages = Math.ceil(filteredSuggestions.length / itemsPerPage);
            if (currentPage < totalPages) {
                currentPage++;
                renderTable();
                updatePagination();
            }
        });
    }

    closeEditModal?.addEventListener('click', closeEditModalFunc);
    closeEditModalBtn?.addEventListener('click', closeEditModalFunc);
    window.addEventListener('click', (event) => {
        if (event.target === editModal) closeEditModalFunc();
        if (event.target === viewModal) closeViewModalFunc();
    });
    editForm?.addEventListener('submit', saveEditedSuggestion);
    setupInvisibleFileUpload('editPhotoBtn', 'editPhotoFile', 'editPhotoFileNameDisplay', 'editPhotoPreview');

    closeViewModal?.addEventListener('click', closeViewModalFunc);

    viewActionEdit?.addEventListener('click', () => {
        if (!currentViewingSuggestion) return;
        const s = currentViewingSuggestion;
        closeViewModalFunc();
        openEditModal(s);
    });
    viewActionAdd?.addEventListener('click', () => {
        if (!currentViewingSuggestion) return;
        openAddMemberPage(currentViewingSuggestion);
    });
    viewActionDownload?.addEventListener('click', () => {
        if (!currentViewingSuggestion) return;
        downloadPhoto(currentViewingSuggestion);
    });
    viewActionDelete?.addEventListener('click', () => {
        if (!currentViewingSuggestion) return;
        const id = getSuggestionId(currentViewingSuggestion);
        if (confirm('के तपाईं यो सुझाव मेटाउन निश्चित हुनुहुन्छ?')) {
            closeViewModalFunc();
            deleteSuggestion(id);
        }
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            if (viewModal && viewModal.style.display === 'block') closeViewModalFunc();
            else if (editModal && editModal.style.display === 'block') closeEditModalFunc();
        }
    });

    // ------------------------------------------------------------
    // 20. Initialize
    // ------------------------------------------------------------
    console.log('🚀 Initializing ViewRequest page...');

    (async function initialize() {
        try {
            const isAuthenticated = await checkPrivatePageAccess();
            if (!isAuthenticated) {
                console.log('⛔ Authentication failed, stopping initialization');
                return;
            }
            console.log('✅ Authentication successful, loading page...');
            await loadSuggestions();
            console.log('✅ ViewRequest page ready');
        } catch (error) {
            console.error('❌ Initialization error:', error);
            redirectToLogin();
        }
    })();

})();