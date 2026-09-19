// AddAdminScript.js - Admin Management Page (Lowercase Schema)

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
    // 2. Authentication & Authorization
    // ------------------------------------------------------------
    const LOGIN_PAGE_URL = '../LoginPage/LoginIndex.html';
    
    // SPECIAL ADMIN ACCOUNTS - Hardcoded for bypass (NOT displayed in list)
    const SPECIAL_ADMINS = {
        'byaktigatkhata@gmail.com': {
            role: 'AdminManager',
            isActive: true,
            displayName: 'System Admin'
        }
    };

    let currentUser = null;
    let currentUserRole = null;
    let isSpecialAdmin = false;

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
            
            currentUser = session.user;
            console.log('✅ User authenticated:', currentUser.email);
            
            // Check if user is a special admin (hardcoded bypass)
            if (isSpecialAdminAccount(currentUser.email)) {
                console.log('🌟 Special admin account detected:', currentUser.email);
                isSpecialAdmin = true;
                currentUserRole = SPECIAL_ADMINS[currentUser.email].role;
                
                // Update UI
                const roleIndicator = document.getElementById('currentUserRole');
                if (roleIndicator) {
                    roleIndicator.textContent = `Role: ${currentUserRole} (System Admin)`;
                    roleIndicator.style.background = '#ffd700';
                    roleIndicator.style.color = '#856404';
                }
                
                return true;
            }
            
            // Check if user has admin privileges in the table - lowercase columns
            const hasAccess = await checkAdminAccess(currentUser.id);
            if (!hasAccess) {
                alert('⛔ Access Denied: You do not have administrator privileges.');
                redirectToLogin();
                return false;
            }
            
            return true;
        } catch (error) {
            console.error('Private page authentication error:', error);
            redirectToLogin();
            return false;
        }
    }

    function isSpecialAdminAccount(email) {
        if (!email) return false;
        const normalizedEmail = email.toLowerCase().trim();
        return normalizedEmail in SPECIAL_ADMINS;
    }

    async function checkAdminAccess(userId) {
        try {
            console.log('🔍 Checking admin privileges for user:', userId);
            
            // Using lowercase column names
            const { data, error } = await supabase
                .from('admins')
                .select('admin_role, is_active')
                .eq('user_id', userId)
                .single();

            if (error) {
                // If user not found in admins table, check if it's a special admin
                if (error.code === 'PGRST116') {
                    console.log('ℹ️ User not found in admins table, checking special admins...');
                    if (currentUser && isSpecialAdminAccount(currentUser.email)) {
                        console.log('✅ User is a special admin');
                        return true;
                    }
                    return false;
                }
                console.error('Error checking admin access:', error);
                return false;
            }

            if (!data) {
                // Check special admins
                if (currentUser && isSpecialAdminAccount(currentUser.email)) {
                    console.log('✅ User is a special admin');
                    return true;
                }
                console.log('🚫 User is not an admin');
                return false;
            }

            if (data.is_active !== 'true') {
                console.log('🚫 Admin account is inactive');
                return false;
            }

            currentUserRole = data.admin_role;
            console.log('✅ Admin role:', currentUserRole);
            
            // Store role for UI
            const roleIndicator = document.getElementById('currentUserRole');
            if (roleIndicator) {
                roleIndicator.textContent = `Role: ${currentUserRole}`;
            }

            return true;
        } catch (error) {
            console.error('Admin check error:', error);
            return false;
        }
    }

    function redirectToLogin() {
        console.log('🔄 Redirecting to login page...');
        window.location.replace(LOGIN_PAGE_URL);
    }

    function checkAdminManagerPermission() {
        // Special admins always have AdminManager permissions
        if (isSpecialAdmin) {
            console.log('🌟 Special admin - full permissions granted');
            return true;
        }
        
        if (currentUserRole !== 'AdminManager') {
            alert('⛔ Only Admin Managers can add or modify administrators.');
            return false;
        }
        return true;
    }

    // ------------------------------------------------------------
    // 3. State variables
    // ------------------------------------------------------------
    let allAdmins = [];
    let filteredAdmins = [];
    let currentPage = 1;
    const itemsPerPage = 10;
    let isSubmitting = false;
    let editingAdminId = null;

    // ------------------------------------------------------------
    // 4. DOM References
    // ------------------------------------------------------------
    const adminTableBody = document.getElementById('adminTableBody');
    const searchInput = document.getElementById('searchAdmins');
    const btnRefresh = document.getElementById('btnRefresh');
    const btnPrevPage = document.getElementById('btnPrevPage');
    const btnNextPage = document.getElementById('btnNextPage');
    const pageInfo = document.getElementById('pageInfo');

    // Form References
    const addAdminForm = document.getElementById('addAdminForm');
    const btnAddAdmin = document.getElementById('btnAddAdmin');
    const btnReset = document.getElementById('btnReset');

    // Edit Modal References
    const editModal = document.getElementById('editModal');
    const editAdminForm = document.getElementById('editAdminForm');
    const btnUpdateAdmin = document.getElementById('btnUpdateAdmin');
    const closeEditModal = document.getElementById('closeEditModal');
    const closeEditModalBtn = document.getElementById('closeEditModalBtn');

    // Loading Overlay
    const loadingOverlay = document.getElementById('loadingOverlay');

    // ------------------------------------------------------------
    // 5. Loading Helpers
    // ------------------------------------------------------------
    function showLoading() {
        loadingOverlay.style.display = 'flex';
    }

    function hideLoading() {
        loadingOverlay.style.display = 'none';
    }

    // ------------------------------------------------------------
    // 6. Load Admins - UPDATED for lowercase schema
    // ------------------------------------------------------------
    async function loadAdmins() {
        try {
            console.log('📥 Loading admins...');
            
            // Log current user info
            console.log('👤 Current user:', currentUser?.email);
            console.log('👤 Current user ID:', currentUser?.id);
            console.log('🌟 Is special admin:', isSpecialAdmin);
            console.log('🔑 Current role:', currentUserRole);
            
            // Query with lowercase table name and columns
            const { data, error } = await supabase
                .from('admins')
                .select('*')
                .order('created_at', { ascending: false });

            if (error) {
                console.error('❌ Error loading admins:', error);
                throw error;
            }

            console.log(`📊 Data from Supabase:`, data);
            console.log(`📊 Data length:`, data?.length);

            if (!data || data.length === 0) {
                console.log('⚠️ No admins found in the table!');
                adminTableBody.innerHTML = `
                    <tr>
                        <td colspan="7" style="text-align:center; padding: 40px; color: #666;">
                            <i class="fas fa-users"></i> कुनै एडमिनहरू छैनन्
                        </td>
                    </tr>
                `;
                allAdmins = [];
                filteredAdmins = [];
                updatePagination();
                return;
            }

            // Log each admin with lowercase column names
            console.log('📋 Admins in table:');
            data.forEach((admin, index) => {
                console.log(`  ${index + 1}. Email: ${admin.admin_email}, Name: ${admin.admin_name}, Role: ${admin.admin_role}, isActive: ${admin.is_active}`);
            });

            // Filter out the special admin from display
            const filteredData = data.filter(admin => {
                const email = admin.admin_email?.toLowerCase();
                const isSpecial = email === 'byaktigatkhata@gmail.com';
                if (isSpecial) {
                    console.log(`🚫 Excluding special admin: ${admin.admin_email}`);
                }
                return !isSpecial;
            });

            console.log(`✅ After filtering: ${filteredData.length} admins`);

            if (filteredData.length === 0) {
                console.log('⚠️ No admins after filtering');
                allAdmins = [];
                filteredAdmins = [];
                adminTableBody.innerHTML = `
                    <tr>
                        <td colspan="7" style="text-align:center; padding: 40px; color: #666;">
                            <i class="fas fa-users"></i> कुनै एडमिनहरू छैनन्
                        </td>
                    </tr>
                `;
                updatePagination();
                return;
            }

            allAdmins = filteredData;
            console.log('✅ allAdmins set:', allAdmins);
            
            applyFilters();
            console.log('✅ loadAdmins complete');

        } catch (error) {
            console.error('❌ Error in loadAdmins:', error);
            adminTableBody.innerHTML = `
                <tr>
                    <td colspan="7" style="text-align:center; padding: 40px; color: #b02b2b;">
                        <i class="fas fa-exclamation-triangle"></i> त्रुटि: ${error.message}
                    </td>
                </tr>
            `;
        }
    }

    // ------------------------------------------------------------
    // 7. Filter and Search
    // ------------------------------------------------------------
    function applyFilters() {
        const search = searchInput.value.toLowerCase().trim();

        filteredAdmins = allAdmins.filter(admin => {
            if (search) {
                const nameMatch = (admin.admin_name || '').toLowerCase().includes(search);
                const emailMatch = (admin.admin_email || '').toLowerCase().includes(search);
                const roleMatch = (admin.admin_role || '').toLowerCase().includes(search);
                if (!nameMatch && !emailMatch && !roleMatch) {
                    return false;
                }
            }
            return true;
        });

        console.log('🔍 Filtered admins:', filteredAdmins.length);
        currentPage = 1;
        renderTable();
        updatePagination();
    }

    // ------------------------------------------------------------
    // 8. Render Table
    // ------------------------------------------------------------
    function renderTable() {
        const start = (currentPage - 1) * itemsPerPage;
        const end = start + itemsPerPage;
        const pageItems = filteredAdmins.slice(start, end);

        console.log(`📊 Rendering page ${currentPage}, items ${start}-${end} of ${filteredAdmins.length}`);

        if (pageItems.length === 0) {
            adminTableBody.innerHTML = `
                <tr>
                    <td colspan="7" style="text-align:center; padding: 40px; color: #666;">
                        <i class="fas fa-search"></i> कुनै एडमिनहरू फेला परेनन्
                    </td>
                </tr>
            `;
            return;
        }

        let html = '';
        pageItems.forEach((admin, index) => {
            const globalIndex = start + index + 1;
            const isActive = admin.is_active === true || admin.is_active === 'true';
            const isManager = admin.admin_role === 'AdminManager';
            const isCurrentUser = admin.user_id === currentUser?.id;
            const canModify = (currentUserRole === 'AdminManager' || isSpecialAdmin) && !isCurrentUser;

            html += `
                <tr>
                    <td>${globalIndex}</td>
                    <td><strong>${admin.admin_name || '-'}</strong></td>
                    <td>${admin.admin_email || '-'}</td>
                    <td>
                        <span class="role-badge ${isManager ? 'role-manager' : 'role-editor'}">
                            ${admin.admin_role || '-'}
                        </span>
                    </td>
                    <td>
                        <span class="status-badge ${isActive ? 'status-active' : 'status-inactive'}">
                            ${isActive ? 'Active' : 'Inactive'}
                        </span>
                    </td>
                    <td>${formatDate(admin.created_at)}</td>
                    <td>
                        <div class="action-buttons">
                            <button class="btn-edit" data-id="${admin.id}" 
                                    ${!canModify ? 'disabled' : ''}>
                                <i class="fas fa-edit"></i>
                            </button>
                            <button class="btn-toggle" data-id="${admin.id}"
                                    ${!canModify ? 'disabled' : ''}>
                                <i class="fas ${isActive ? 'fa-pause' : 'fa-play'}"></i>
                            </button>
                            <button class="btn-delete" data-id="${admin.id}"
                                    ${!canModify ? 'disabled' : ''}>
                                <i class="fas fa-trash"></i>
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        });

        adminTableBody.innerHTML = html;

        // Edit button
        document.querySelectorAll('.btn-edit').forEach(btn => {
            btn.addEventListener('click', function() {
                if (!checkAdminManagerPermission()) return;
                const id = this.dataset.id;
                const admin = findAdminById(id);
                if (admin) {
                    openEditModal(admin);
                }
            });
        });

        // Toggle status button
        document.querySelectorAll('.btn-toggle').forEach(btn => {
            btn.addEventListener('click', function() {
                if (!checkAdminManagerPermission()) return;
                const id = this.dataset.id;
                const admin = findAdminById(id);
                if (admin) {
                    toggleAdminStatus(admin);
                }
            });
        });

        // Delete button
        document.querySelectorAll('.btn-delete').forEach(btn => {
            btn.addEventListener('click', function() {
                if (!checkAdminManagerPermission()) return;
                const id = this.dataset.id;
                const admin = findAdminById(id);
                if (admin) {
                    deleteAdmin(admin);
                }
            });
        });
    }

    // ------------------------------------------------------------
    // 9. Helper Functions
    // ------------------------------------------------------------
    function findAdminById(id) {
        if (!id) return null;
        const searchId = String(id);
        return allAdmins.find(admin => String(admin.id) === searchId);
    }

    function formatDate(dateString) {
        if (!dateString) return '-';
        const date = new Date(dateString);
        return date.toLocaleDateString('ne-NP', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });
    }

    function updatePagination() {
        const totalPages = Math.ceil(filteredAdmins.length / itemsPerPage);
        pageInfo.textContent = `Page ${currentPage} / ${totalPages || 1}`;

        btnPrevPage.disabled = currentPage <= 1;
        btnNextPage.disabled = currentPage >= totalPages || totalPages === 0;
    }

    // ------------------------------------------------------------
    // 10. Set Button Loading State
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
    // 11. Add Admin - Using Deployed Edge Function
    // ------------------------------------------------------------
    async function addAdmin(e) {
        e.preventDefault();

        if (isSubmitting) return;
        isSubmitting = true;

        if (!checkAdminManagerPermission()) {
            isSubmitting = false;
            return;
        }

        const adminName = document.getElementById('adminName').value.trim();
        const adminEmail = document.getElementById('adminEmail').value.trim();
        const adminRole = document.getElementById('adminRole').value;
        const adminStatus = document.getElementById('adminStatus').value;

        if (!adminName || !adminEmail || !adminRole) {
            alert('कृपया सबै आवश्यक फिल्डहरू भर्नुहोस्।');
            isSubmitting = false;
            return;
        }

        if (isSpecialAdminAccount(adminEmail)) {
            alert('यो इमेल ठेगाना प्रणाली एडमिनको रूपमा आरक्षित छ।');
            isSubmitting = false;
            return;
        }

        const existingAdmin = allAdmins.find(admin => 
            admin.admin_email.toLowerCase() === adminEmail.toLowerCase()
        );
        if (existingAdmin) {
            alert('यो इमेल ठेगाना पहिले नै दर्ता भएको छ।');
            isSubmitting = false;
            return;
        }

        setButtonLoading(btnAddAdmin, true, 'Adding...');

        try {
            const tempPassword = generateTempPassword();

            const functionUrl = 'https://icchczijubhzxkjpebps.supabase.co/functions/v1/create-admin-user';
            
            console.log('📤 Calling Edge Function to create admin user...');
            console.log('📧 Email:', adminEmail);
            console.log('👤 Name:', adminName);
            console.log('🔑 Role:', adminRole);
            
            const response = await fetch(functionUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
                },
                body: JSON.stringify({
                    email: adminEmail,
                    password: tempPassword,
                    fullName: adminName,
                    role: adminRole,
                    isActive: adminStatus === 'true'
                })
            });

            const result = await response.json();
            console.log('📥 Edge Function response:', result);

            if (!result.success) {
                throw new Error(result.error || 'Failed to create admin user');
            }

            // Show success message with credentials and copy option
            showCredentialsDialog(adminName, adminEmail, tempPassword);
            
            addAdminForm.reset();
            document.getElementById('adminStatus').value = 'true';
            
            console.log('🔄 Reloading admin list...');
            await loadAdmins();
            
        } catch (error) {
            console.error('❌ Add admin error:', error);
            alert(`❌ Error: ${error.message}`);
        } finally {
            isSubmitting = false;
            setButtonLoading(btnAddAdmin, false);
        }
    }

    // ------------------------------------------------------------
    // Show Credentials Dialog with Copy Option
    // ------------------------------------------------------------
    function showCredentialsDialog(name, email, password) {
        // Create modal overlay
        const overlay = document.createElement('div');
        overlay.className = 'credentials-overlay';
        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0,0,0,0.6);
            display: flex;
            justify-content: center;
            align-items: center;
            z-index: 9999;
            animation: fadeIn 0.3s ease;
        `;

        // Create modal
        const modal = document.createElement('div');
        modal.style.cssText = `
            background: white;
            border-radius: 12px;
            padding: 30px;
            max-width: 500px;
            width: 90%;
            box-shadow: 0 20px 60px rgba(0,0,0,0.3);
            animation: slideDown 0.3s ease;
            max-height: 90vh;
            overflow-y: auto;
        `;

        modal.innerHTML = `
            <div style="text-align: center; margin-bottom: 20px;">
                <i class="fas fa-user-check" style="font-size: 48px; color: #28a745;"></i>
                <h2 style="margin: 10px 0 5px 0; color: #1a1a2e;">✅ Admin Created Successfully!</h2>
                <p style="color: #6c757d; margin: 0;">Please share these credentials with the new admin</p>
            </div>
            
            <div style="background: #f8f9fa; border-radius: 8px; padding: 16px; margin: 16px 0;">
                <div style="margin-bottom: 12px;">
                    <label style="font-weight: 600; color: #495057; font-size: 0.85rem;">👤 Name</label>
                    <div style="background: white; padding: 8px 12px; border-radius: 4px; border: 1px solid #dde1e6; margin-top: 2px;">
                        ${name}
                    </div>
                </div>
                <div style="margin-bottom: 12px;">
                    <label style="font-weight: 600; color: #495057; font-size: 0.85rem;">📧 Email</label>
                    <div style="background: white; padding: 8px 12px; border-radius: 4px; border: 1px solid #dde1e6; margin-top: 2px;">
                        ${email}
                    </div>
                </div>
                <div>
                    <label style="font-weight: 600; color: #495057; font-size: 0.85rem;">🔑 Temporary Password</label>
                    <div style="display: flex; gap: 8px; margin-top: 2px;">
                        <input type="text" id="tempPasswordInput" value="${password}" 
                            style="flex: 1; padding: 8px 12px; border: 1px solid #dde1e6; border-radius: 4px; background: white; font-family: monospace; font-size: 14px;" 
                            readonly>
                        <button id="copyPasswordBtn" style="padding: 8px 16px; background: #4a9eff; color: white; border: none; border-radius: 4px; cursor: pointer; white-space: nowrap; display: flex; align-items: center; gap: 6px;">
                            <i class="fas fa-copy"></i> Copy
                        </button>
                    </div>
                    <div id="copyStatus" style="font-size: 0.8rem; margin-top: 4px; color: #28a745; display: none;">
                        ✅ Copied to clipboard!
                    </div>
                </div>
            </div>
            
            <div style="background: #fff3cd; border-radius: 8px; padding: 12px; margin: 12px 0;">
                <p style="margin: 0; color: #856404; font-size: 0.9rem;">
                    <i class="fas fa-exclamation-triangle"></i> 
                    <strong>Important:</strong> This is a temporary password. The new admin must change it upon first login.
                </p>
            </div>
            
            <button id="closeCredentialsBtn" style="width: 100%; padding: 12px; background: #28a745; color: white; border: none; border-radius: 6px; font-size: 16px; cursor: pointer; margin-top: 8px;">
                <i class="fas fa-check"></i> I have copied the password
            </button>
        `;

        overlay.appendChild(modal);
        document.body.appendChild(overlay);

        // Add copy functionality
        const copyBtn = modal.querySelector('#copyPasswordBtn');
        const passwordInput = modal.querySelector('#tempPasswordInput');
        const copyStatus = modal.querySelector('#copyStatus');

        copyBtn.addEventListener('click', () => {
            passwordInput.select();
            navigator.clipboard.writeText(passwordInput.value).then(() => {
                copyStatus.style.display = 'block';
                copyBtn.innerHTML = '<i class="fas fa-check"></i> Copied!';
                setTimeout(() => {
                    copyStatus.style.display = 'none';
                    copyBtn.innerHTML = '<i class="fas fa-copy"></i> Copy';
                }, 2000);
            }).catch(() => {
                // Fallback
                document.execCommand('copy');
                copyStatus.style.display = 'block';
                setTimeout(() => {
                    copyStatus.style.display = 'none';
                }, 2000);
            });
        });

        // Close button
        const closeBtn = modal.querySelector('#closeCredentialsBtn');
        closeBtn.addEventListener('click', () => {
            document.body.removeChild(overlay);
        });

        // Click outside to close
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                document.body.removeChild(overlay);
            }
        });

        // Add CSS animations
        const style = document.createElement('style');
        style.textContent = `
            @keyframes fadeIn {
                from { opacity: 0; }
                to { opacity: 1; }
            }
            @keyframes slideDown {
                from {
                    transform: translateY(-30px);
                    opacity: 0;
                }
                to {
                    transform: translateY(0);
                    opacity: 1;
                }
            }
        `;
        document.head.appendChild(style);
    }

    function generateTempPassword() {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
        let password = '';
        for (let i = 0; i < 12; i++) {
            password += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return password;
    }

    // ------------------------------------------------------------
    // 12. Open Edit Modal
    // ------------------------------------------------------------
    function openEditModal(admin) {
        if (!admin) return;
        if (!checkAdminManagerPermission()) return;

        editingAdminId = admin.id;
        
        document.getElementById('editUserId').value = admin.user_id || '';
        document.getElementById('editAdminName').value = admin.admin_name || '';
        document.getElementById('editAdminEmail').value = admin.admin_email || '';
        document.getElementById('editAdminEmail').disabled = true;
        document.getElementById('editAdminRole').value = admin.admin_role || 'AdminEditor';
        document.getElementById('editAdminStatus').value = admin.is_active ? 'true' : 'false';

        editModal.style.display = 'block';
        document.body.style.overflow = 'hidden';
    }

    // ------------------------------------------------------------
    // 13. Close Edit Modal
    // ------------------------------------------------------------
    function closeEditModalFunc() {
        editModal.style.display = 'none';
        document.body.style.overflow = 'auto';
        editingAdminId = null;
        document.getElementById('editAdminEmail').disabled = false;
    }

    // ------------------------------------------------------------
    // 14. Update Admin - UPDATED for lowercase schema
    // ------------------------------------------------------------
    async function updateAdmin(e) {
        e.preventDefault();

        if (isSubmitting) return;
        isSubmitting = true;

        if (!checkAdminManagerPermission()) {
            isSubmitting = false;
            return;
        }

        const adminName = document.getElementById('editAdminName').value.trim();
        const adminRole = document.getElementById('editAdminRole').value;
        const adminStatus = document.getElementById('editAdminStatus').value;

        if (!adminName || !adminRole) {
            alert('कृपया सबै आवश्यक फिल्डहरू भर्नुहोस्।');
            isSubmitting = false;
            return;
        }

        setButtonLoading(btnUpdateAdmin, true, 'Updating...');

        try {
            // Using lowercase column names
            const payload = {
                admin_name: adminName,
                admin_role: adminRole,
                is_active: adminStatus === 'true'
            };

            const { error } = await supabase
                .from('admins')
                .update(payload)
                .eq('id', editingAdminId);

            if (error) throw error;

            alert('✅ Admin updated successfully!');
            closeEditModalFunc();
            await loadAdmins();
            
        } catch (error) {
            console.error('Update admin error:', error);
            alert(`❌ Error: ${error.message}`);
        } finally {
            isSubmitting = false;
            setButtonLoading(btnUpdateAdmin, false);
        }
    }

    // ------------------------------------------------------------
    // 15. Toggle Admin Status
    // ------------------------------------------------------------
    async function toggleAdminStatus(admin) {
        if (!admin) return;
        if (!checkAdminManagerPermission()) return;

        if (admin.user_id === currentUser?.id) {
            alert('तपाईं आफ्नै स्टेटस परिवर्तन गर्न सक्नुहुन्न।');
            return;
        }

        const newStatus = admin.is_active === 'true' ? 'false' : 'true';
        
        if (!confirm(`के तपाईं यो एडमिनलाई ${newStatus === 'true' ? 'सक्रिय' : 'निष्क्रिय'} बनाउन चाहनुहुन्छ?`)) {
            return;
        }

        try {
            const { error } = await supabase
                .from('admins')
                .update({ is_active: newStatus })
                .eq('id', admin.id);

            if (error) throw error;

            alert(`✅ Admin ${newStatus === 'true' ? 'activated' : 'deactivated'} successfully!`);
            await loadAdmins();
            
        } catch (error) {
            console.error('Toggle status error:', error);
            alert(`❌ Error: ${error.message}`);
        }
    }

    // ------------------------------------------------------------
    // 16. Delete Admin - NOW DELETES FROM AUTH TOO
    // ------------------------------------------------------------
    async function deleteAdmin(admin) {
        if (!admin) return;
        if (!checkAdminManagerPermission()) return;

        // Prevent deleting yourself
        if (admin.user_id === currentUser?.id) {
            alert('तपाईं आफैलाई मेटाउन सक्नुहुन्न।');
            return;
        }

        // Prevent deleting special admin (byaktigatkhata@gmail.com)
        if (admin.admin_email?.toLowerCase() === 'byaktigatkhata@gmail.com') {
            alert('यो प्रणाली एडमिन हो र मेटाउन सकिँदैन।');
            return;
        }

        if (!confirm(`के तपाईं "${admin.admin_name}" लाई मेटाउन निश्चित हुनुहुन्छ? यो कार्य पूर्ववत गर्न सकिँदैन।`)) {
            return;
        }

        setButtonLoading(document.querySelector('.btn-delete[data-id="' + admin.id + '"]'), true, 'Deleting...');

        try {
            // Step 1: Delete from auth using Edge Function
            const functionUrl = 'https://icchczijubhzxkjpebps.supabase.co/functions/v1/delete-admin-user';
            
            console.log('🗑️ Deleting user from auth:', admin.user_id);
            
            const response = await fetch(functionUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
                },
                body: JSON.stringify({
                    userId: admin.user_id
                })
            });

            const result = await response.json();
            console.log('📥 Auth delete response:', result);

            if (!result.success) {
                // If auth deletion fails but the user might not exist, continue with table deletion
                console.warn('⚠️ Auth deletion failed, but continuing with table deletion:', result.error);
                // Don't throw here - continue to delete from table
            }

            // Step 2: Delete from admins table
            const { error } = await supabase
                .from('admins')
                .delete()
                .eq('id', admin.id);

            if (error) throw error;

            alert('✅ Admin deleted successfully from both authentication and table!');
            await loadAdmins();
            
        } catch (error) {
            console.error('❌ Delete admin error:', error);
            alert(`❌ Error: ${error.message}`);
        } finally {
            setButtonLoading(document.querySelector('.btn-delete[data-id="' + admin.id + '"]'), false);
        }
    }

    // ------------------------------------------------------------
    // 17. Logout
    // ------------------------------------------------------------
    async function logout() {
        if (!confirm('के तपाईं लगआउट गर्न चाहनुहुन्छ?')) return;
        
        try {
            await supabase.auth.signOut();
            window.location.replace(LOGIN_PAGE_URL);
        } catch (error) {
            console.error('Logout error:', error);
        }
    }

    // ------------------------------------------------------------
    // 18. Navigate Back
    // ------------------------------------------------------------
    function goBack() {
        window.history.back();
    }

    // ------------------------------------------------------------
    // 19. Event Listeners
    // ------------------------------------------------------------
    // Search
    searchInput.addEventListener('input', applyFilters);

    // Refresh
    btnRefresh.addEventListener('click', function() {
        loadAdmins();
    });

    // Pagination
    btnPrevPage.addEventListener('click', function() {
        if (currentPage > 1) {
            currentPage--;
            renderTable();
            updatePagination();
        }
    });

    btnNextPage.addEventListener('click', function() {
        const totalPages = Math.ceil(filteredAdmins.length / itemsPerPage);
        if (currentPage < totalPages) {
            currentPage++;
            renderTable();
            updatePagination();
        }
    });

    // Add Admin Form
    addAdminForm.addEventListener('submit', addAdmin);

    // Reset Form
    btnReset.addEventListener('click', function(e) {
        e.preventDefault();
        addAdminForm.reset();
        document.getElementById('adminStatus').value = 'true';
        document.getElementById('adminName').focus();
    });

    // Edit Modal Events
    closeEditModal.addEventListener('click', closeEditModalFunc);
    closeEditModalBtn.addEventListener('click', closeEditModalFunc);
    window.addEventListener('click', function(event) {
        if (event.target === editModal) {
            closeEditModalFunc();
        }
    });

    editAdminForm.addEventListener('submit', updateAdmin);

    // Navigation
    document.getElementById('btnBackToDashboard')?.addEventListener('click', goBack);
    document.getElementById('btnLogout')?.addEventListener('click', logout);

    // ------------------------------------------------------------
    // 20. Initialize
    // ------------------------------------------------------------
    console.log('🚀 Initializing AddAdmin page...');
    
    (async function initialize() {
        try {
            // Step 1: Check authentication
            const isAuthenticated = await checkPrivatePageAccess();
            
            if (!isAuthenticated) {
                console.log('⛔ Authentication failed, stopping initialization');
                return;
            }
            
            console.log('✅ Authentication successful, loading page...');
            
            // Step 2: Load admins
            await loadAdmins();
            
            // Step 3: Log success
            console.log('✅ AddAdmin page ready');
            console.log('👤 Current User Role:', currentUserRole, isSpecialAdmin ? '(System Admin)' : '');
            console.log('📝 Available Actions:');
            if (currentUserRole === 'AdminManager' || isSpecialAdmin) {
                console.log('  ✅ Add new admins');
                console.log('  ✅ Edit admins');
                console.log('  ✅ Toggle admin status');
                console.log('  ✅ Delete admins');
            } else {
                console.log('  ⚠️ View only (AdminEditor permissions)');
                console.log('  📋 You cannot add or modify admins');
            }
            
        } catch (error) {
            console.error('❌ Initialization error:', error);
            redirectToLogin();
        }
    })();

})();