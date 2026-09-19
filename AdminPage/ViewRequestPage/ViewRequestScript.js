// ViewRequestScript.js - View Suggestions Page

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

    async function checkPrivatePageAccess() {
        console.log('🔐 Checking authentication...');
        try {
            const {
                data: { session },
                error
            } = await supabase.auth.getSession();
            
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
    // 3. State variables
    // ------------------------------------------------------------
    let allSuggestions = [];
    let filteredSuggestions = [];
    let currentPage = 1;
    const itemsPerPage = 20;
    let currentEditingSuggestion = null;
    let isSubmitting = false;

    // ------------------------------------------------------------
    // 4. DOM References
    // ------------------------------------------------------------
    const tableBody = document.getElementById('SuggestionTableBody');
    const filterStatus = document.getElementById('filterStatus');
    const filterSearch = document.getElementById('filterSearch');
    const btnRefresh = document.getElementById('btnRefresh');
    const btnPrevPage = document.getElementById('btnPrevPage');
    const btnNextPage = document.getElementById('btnNextPage');
    const pageInfo = document.getElementById('pageInfo');

    // Edit Modal References
    const editModal = document.getElementById('editModal');
    const closeEditModal = document.getElementById('closeEditModal');
    const closeEditModalBtn = document.getElementById('closeEditModalBtn');
    const editForm = document.getElementById('editSuggestionForm');
    const saveEditBtn = document.getElementById('saveEditBtn');

    // ------------------------------------------------------------
    // 5. Helper: Get Suggestion ID
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

    // ------------------------------------------------------------
    // 6. Helper: Find Suggestion by ID
    // ------------------------------------------------------------
    function findSuggestionById(id) {
        if (!id) return null;
        const searchId = String(id);
        return allSuggestions.find(item => {
            const itemId = getSuggestionId(item);
            return itemId !== null && String(itemId) === searchId;
        });
    }

    // ------------------------------------------------------------
    // 7. Load Suggestions from Supabase
    // ------------------------------------------------------------
    async function loadSuggestions() {
        try {
            const { data, error } = await supabase
                .from('MemberSuggestionTable')
                .select('*')
                .order('created_at', { ascending: false });

            if (error) throw error;

            if (!data || data.length === 0) {
                allSuggestions = [];
                filteredSuggestions = [];
                tableBody.innerHTML = `
                    <tr>
                        <td colspan="7" style="text-align:center; padding: 40px; color: #666;">
                            <i class="fas fa-inbox"></i> कुनै सुझावहरू छैनन्
                        </td>
                    </tr>
                `;
                updatePagination();
                return;
            }

            allSuggestions = data;
            console.log('✅ Loaded', allSuggestions.length, 'suggestions');
            applyFilters();

        } catch (error) {
            console.error('Error loading suggestions:', error);
            tableBody.innerHTML = `
                <tr>
                    <td colspan="7" style="text-align:center; padding: 40px; color: #b02b2b;">
                        <i class="fas fa-exclamation-triangle"></i> त्रुटि: ${error.message}
                    </td>
                </tr>
            `;
        }
    }

    // ------------------------------------------------------------
    // 8. Filter and Search
    // ------------------------------------------------------------
    function applyFilters() {
        const status = filterStatus.value;
        const search = filterSearch.value.toLowerCase().trim();

        filteredSuggestions = allSuggestions.filter(item => {
            if (status !== 'all' && item.Status !== status) {
                return false;
            }

            if (search) {
                const nameMatch = (item.MemberFullNameNepali || '').toLowerCase().includes(search);
                const codeMatch = (item.FillerCode || '').toLowerCase().includes(search);
                const fillerNameMatch = (item.FillerName || '').toLowerCase().includes(search);
                if (!nameMatch && !codeMatch && !fillerNameMatch) {
                    return false;
                }
            }

            return true;
        });

        currentPage = 1;
        renderTable();
        updatePagination();
    }

    // ------------------------------------------------------------
    // 9. Render Table
    // ------------------------------------------------------------
    function renderTable() {
        const start = (currentPage - 1) * itemsPerPage;
        const end = start + itemsPerPage;
        const pageItems = filteredSuggestions.slice(start, end);

        if (pageItems.length === 0) {
            tableBody.innerHTML = `
                <tr>
                    <td colspan="7" style="text-align:center; padding: 40px; color: #666;">
                        <i class="fas fa-search"></i> कुनै सुझावहरू फेला परेनन्
                    </td>
                </tr>
            `;
            return;
        }

        let html = '';
        pageItems.forEach((item, index) => {
            const globalIndex = start + index + 1;
            const statusClass = getStatusClass(item.Status);
            const statusLabel = getStatusLabel(item.Status);
            const itemId = getSuggestionId(item);
            const hasPhoto = !!(item.MemberPhotoUrl || item.PhotoUrl || item.photoUrl);

            html += `
                <tr>
                    <td>${globalIndex}</td>
                    <td>${item.FillerName || '-'}</td>
                    <td>${item.FillerCode || '-'}</td>
                    <td>${item.MemberFullNameNepali || '-'}</td>
                    <td><span class="status-badge ${statusClass}">${statusLabel}</span></td>
                    <td>${formatDate(item.created_at)}</td>
                    <td>
                        <div class="action-buttons">
                            ${item.MemberCode ? 
                                `<button class="btn-edit" data-id="${itemId}">
                                    <i class="fas fa-edit"></i>
                                </button>` : 
                                `<button class="btn-add" data-id="${itemId}">
                                    <i class="fas fa-user-plus"></i>
                                </button>`
                            }
                            <button class="btn-download" data-id="${itemId}" ${hasPhoto ? '' : 'disabled'}>
                                <i class="fas fa-download"></i>
                            </button>
                            <button class="btn-delete" data-id="${itemId}">
                                <i class="fas fa-trash"></i>
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        });

        tableBody.innerHTML = html;

        // Add Member button (new suggestion)
        document.querySelectorAll('.btn-add').forEach(btn => {
            btn.addEventListener('click', function() {
                const id = this.dataset.id;
                const suggestion = findSuggestionById(id);
                if (suggestion) {
                    openAddMemberPage(suggestion);
                }
            });
        });

        // Edit button (existing member suggestion)
        document.querySelectorAll('.btn-edit').forEach(btn => {
            btn.addEventListener('click', function() {
                const id = this.dataset.id;
                const suggestion = findSuggestionById(id);
                if (suggestion) {
                    openEditModal(suggestion);
                }
            });
        });

        // Download button
        document.querySelectorAll('.btn-download').forEach(btn => {
            btn.addEventListener('click', function() {
                const id = this.dataset.id;
                const suggestion = findSuggestionById(id);
                if (suggestion) {
                    downloadPhoto(suggestion);
                }
            });
        });

        // Delete button
        document.querySelectorAll('.btn-delete').forEach(btn => {
            btn.addEventListener('click', function() {
                const id = this.dataset.id;
                if (confirm('के तपाईं यो सुझाव मेटाउन निश्चित हुनुहुन्छ?')) {
                    deleteSuggestion(id);
                }
            });
        });
    }

    // ------------------------------------------------------------
    // 10. Status Helpers
    // ------------------------------------------------------------
    function getStatusClass(status) {
        switch(status) {
            case 'pending': return 'status-pending';
            case 'approved': return 'status-approved';
            case 'rejected': return 'status-rejected';
            default: return '';
        }
    }

    function getStatusLabel(status) {
        switch(status) {
            case 'pending': return 'पेन्डिङ';
            case 'approved': return 'स्वीकृत';
            case 'rejected': return 'अस्वीकृत';
            default: return status || '-';
        }
    }

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

    // ------------------------------------------------------------
    // 11. Pagination
    // ------------------------------------------------------------
    function updatePagination() {
        const totalPages = Math.ceil(filteredSuggestions.length / itemsPerPage);
        pageInfo.textContent = `पृष्ठ ${currentPage} / ${totalPages || 1}`;

        btnPrevPage.disabled = currentPage <= 1;
        btnNextPage.disabled = currentPage >= totalPages || totalPages === 0;
    }

    // ------------------------------------------------------------
    // 12. Download Photo
    // ------------------------------------------------------------
    function downloadPhoto(suggestion) {
        let photoUrl = suggestion.MemberPhotoUrl || suggestion.PhotoUrl || suggestion.photoUrl || '';
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
    // 13. Open AddMember Page (New Suggestion) - WITH returnToViewRequest = true
    // ------------------------------------------------------------
    function openAddMemberPage(suggestion) {
        if (!suggestion) {
            alert('कुनै सुझाव चयन गरिएको छैन।');
            return;
        }

        const suggestionData = {
            FullName: suggestion.MemberFullNameNepali || '',
            FullNameEn: suggestion.MemberFullNameEnglish || '',
            Gender: suggestion.MemberGender || 'M',
            Address: suggestion.MemberAddress || '',
            Mobile: suggestion.MemberMobile || '',
            Email: suggestion.MemberEmail || '',
            Father: suggestion.MemberFather || '',
            Mother: suggestion.MemberMother || '',
            Spouse: suggestion.MemberSpouse || '',
            DOB: suggestion.MemberDOB || '',
            Sons: suggestion.MemberSons || '',
            Daughters: suggestion.MemberDaughters || '',
            Profession: suggestion.MemberProffession || '',
            Qualification: suggestion.MemberQualification || '',
            Position: suggestion.MemberPlace || '',
            DetailAddress: suggestion.MemberDetailAddress || '',
            DetailProfession: suggestion.MemberDetailProfession || '',
            LifeStory: suggestion.MemberLifeStory || '',
            DOD_Age: suggestion.MemberDOD || '',
            PhotoUrl: '',
            SuggestionId: suggestion.id,
            FillerName: suggestion.FillerName || '',
            FillerCode: suggestion.FillerCode || '',
            MemberCode: suggestion.MemberCode || '',
            returnToViewRequest: true  // IMPORTANT: Set to true to return to ViewRequest
        };

        console.log('📤 Opening AddMember page with returnToViewRequest = true');
        localStorage.setItem('suggestionData', JSON.stringify(suggestionData));
        window.location.href = '../AddMemberPage/AddMemberIndex.html';
    }

    // ------------------------------------------------------------
    // 14. Open Edit Modal (Existing Member Suggestion)
    // ------------------------------------------------------------
    function openEditModal(suggestion) {
        console.log('📝 Opening edit modal for suggestion:', suggestion);
        currentEditingSuggestion = suggestion;

        document.getElementById('editMemberCode').value = suggestion.MemberCode || '';
        document.getElementById('editFullName').value = suggestion.MemberFullNameNepali || '';
        document.getElementById('editGender').value = suggestion.MemberGender || 'M';
        document.getElementById('editAddress').value = suggestion.MemberAddress || '';
        document.getElementById('editMobile').value = suggestion.MemberMobile || '';
        document.getElementById('editEmail').value = suggestion.MemberEmail || '';
        document.getElementById('editFather').value = suggestion.MemberFather || '';
        document.getElementById('editMother').value = suggestion.MemberMother || '';
        document.getElementById('editSpouse').value = suggestion.MemberSpouse || '';
        document.getElementById('editDob').value = suggestion.MemberDOB || '';
        document.getElementById('editSons').value = suggestion.MemberSons || '';
        document.getElementById('editDaughters').value = suggestion.MemberDaughters || '';
        document.getElementById('editProfession').value = suggestion.MemberProffession || '';
        document.getElementById('editQualification').value = suggestion.MemberQualification || '';
        document.getElementById('editPosition').value = suggestion.MemberPlace || '';
        document.getElementById('editDetailAddress').value = suggestion.MemberDetailAddress || '';
        document.getElementById('editDetailProfession').value = suggestion.MemberDetailProfession || '';
        document.getElementById('editLifeStory').value = suggestion.MemberLifeStory || '';
        document.getElementById('editDodAge').value = suggestion.MemberDOD || '';

        let photoUrl = suggestion.MemberPhotoUrl || suggestion.PhotoUrl || suggestion.photoUrl || '';
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

    // ------------------------------------------------------------
    // 15. Close Edit Modal
    // ------------------------------------------------------------
    function closeEditModalFunc() {
        editModal.style.display = 'none';
        document.body.style.overflow = 'auto';
        currentEditingSuggestion = null;
    }

    // ------------------------------------------------------------
    // 16. Setup Invisible File Upload
    // ------------------------------------------------------------
    function setupInvisibleFileUpload(triggerBtnId, fileInputId, displayId, previewId) {
        const triggerBtn = document.getElementById(triggerBtnId);
        const fileInput = document.getElementById(fileInputId);
        const display = document.getElementById(displayId);
        const preview = document.getElementById(previewId);

        if (!triggerBtn || !fileInput) return;

        triggerBtn.addEventListener('click', function() {
            fileInput.click();
        });

        fileInput.addEventListener('change', function() {
            if (this.files && this.files[0]) {
                const fileName = this.files[0].name;
                if (display) {
                    display.textContent = fileName;
                }
                if (preview) {
                    const reader = new FileReader();
                    reader.onload = function(e) {
                        preview.src = e.target.result;
                        preview.style.display = 'block';
                    };
                    reader.readAsDataURL(this.files[0]);
                }
            }
        });
    }

    // ------------------------------------------------------------
    // 17. Upload Photo to ImgBB (for edit modal)
    // ------------------------------------------------------------
    async function uploadEditPhoto(file) {
        const formData = new FormData();
        formData.append('file', file);

        try {
            const functionUrl = 'https://icchczijubhzxkjpebps.supabase.co/functions/v1/upload-to-imgbb';
            
            const response = await fetch(functionUrl, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
                },
                body: formData
            });

            const result = await response.json();
            if (result.success && result.url) {
                return { success: true, url: result.url };
            } else {
                return { success: false, error: result.error || 'Upload failed' };
            }
        } catch (error) {
            console.error('Upload error:', error);
            return { success: false, error: error.message };
        }
    }

    // ------------------------------------------------------------
    // 18. Save Edited Suggestion
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

        // Show loading state
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
                document.getElementById('editUploadStatus').innerHTML = `<span style="color:#b02b2b;">❌ ${result.error}</span>`;
                isSubmitting = false;
                if (saveEditBtn) {
                    saveEditBtn.disabled = false;
                    saveEditBtn.innerHTML = 'सुझाव सेभ गर्नुहोस्';
                }
                return;
            }
        }

        const payload = {
            MemberCode: document.getElementById('editMemberCode').value.trim(),
            MemberFullNameNepali: fullName,
            MemberGender: document.getElementById('editGender').value,
            MemberAddress: document.getElementById('editAddress').value.trim(),
            MemberMobile: document.getElementById('editMobile').value.trim(),
            MemberEmail: document.getElementById('editEmail').value.trim(),
            MemberFather: document.getElementById('editFather').value.trim(),
            MemberMother: document.getElementById('editMother').value.trim(),
            MemberSpouse: document.getElementById('editSpouse').value.trim(),
            MemberDOB: document.getElementById('editDob').value.trim(),
            MemberSons: document.getElementById('editSons').value.trim(),
            MemberDaughters: document.getElementById('editDaughters').value.trim(),
            MemberProffession: document.getElementById('editProfession').value.trim(),
            MemberQualification: document.getElementById('editQualification').value.trim(),
            MemberPlace: document.getElementById('editPosition').value.trim(),
            MemberDetailAddress: document.getElementById('editDetailAddress').value.trim(),
            MemberDetailProfession: document.getElementById('editDetailProfession').value.trim(),
            MemberLifeStory: document.getElementById('editLifeStory').value.trim(),
            MemberDOD: document.getElementById('editDodAge').value.trim(),
            MemberPhotoUrl: photoUrl,
            Status: 'pending'
        };

        try {
            const { error } = await supabase
                .from('MemberSuggestionTable')
                .update(payload)
                .eq('id', currentEditingSuggestion.id);

            if (error) throw error;

            alert('✅ सुझाव सफलतापूर्वक अपडेट गरियो!');
            closeEditModalFunc();
            await loadSuggestions();
        } catch (error) {
            console.error('Update error:', error);
            alert(`❌ त्रुटि: ${error.message}`);
        } finally {
            isSubmitting = false;
            if (saveEditBtn) {
                saveEditBtn.disabled = false;
                saveEditBtn.innerHTML = 'सुझाव सेभ गर्नुहोस्';
            }
        }
    }

    // ------------------------------------------------------------
    // 19. Delete Suggestion
    // ------------------------------------------------------------
    async function deleteSuggestion(id) {
        if (!confirm('के तपाईं यो सुझाव मेटाउन निश्चित हुनुहुन्छ?')) {
            return;
        }

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
    // 20. UI Helpers for Button States
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
    // 21. Event Listeners
    // ------------------------------------------------------------
    filterStatus.addEventListener('change', applyFilters);
    filterSearch.addEventListener('input', applyFilters);

    btnRefresh.addEventListener('click', function() {
        loadSuggestions();
    });

    btnPrevPage.addEventListener('click', function() {
        if (currentPage > 1) {
            currentPage--;
            renderTable();
            updatePagination();
        }
    });

    btnNextPage.addEventListener('click', function() {
        const totalPages = Math.ceil(filteredSuggestions.length / itemsPerPage);
        if (currentPage < totalPages) {
            currentPage++;
            renderTable();
            updatePagination();
        }
    });

    // Edit Modal Events
    closeEditModal.addEventListener('click', closeEditModalFunc);
    closeEditModalBtn.addEventListener('click', closeEditModalFunc);
    window.addEventListener('click', function(event) {
        if (event.target === editModal) {
            closeEditModalFunc();
        }
    });

    editForm.addEventListener('submit', saveEditedSuggestion);

    // Setup file upload for edit modal
    setupInvisibleFileUpload('editPhotoBtn', 'editPhotoFile', 'editPhotoFileNameDisplay', 'editPhotoPreview');

    // ------------------------------------------------------------
    // 22. Initialize - FIXED: Proper async/await handling
    // ------------------------------------------------------------
    console.log('🚀 Initializing ViewRequest page...');
    
    (async function initialize() {
        try {
            // Step 1: Check authentication
            const isAuthenticated = await checkPrivatePageAccess();
            
            // If not authenticated, checkPrivatePageAccess already redirected
            if (!isAuthenticated) {
                console.log('⛔ Authentication failed, stopping initialization');
                return;
            }
            
            console.log('✅ Authentication successful, loading page...');
            
            // Step 2: Load suggestions
            await loadSuggestions();
            
            // Step 3: Log success
            console.log('✅ ViewRequest page ready');
            console.log('📝 Actions:');
            console.log('  🟢 + Add Member (New suggestion)');
            console.log('  🟡 ✏️ Edit (Existing member suggestion)');
            console.log('  🔵 📥 Download Photo');
            console.log('  🔴 🗑️ Delete');
            
        } catch (error) {
            console.error('❌ Initialization error:', error);
            // If any error occurs during initialization, redirect to login
            redirectToLogin();
        }
    })();

})();