'use strict';

// ============================================================
// 1. Supabase Client
// ============================================================
const supabaseDB = window.SupabaseConfig?.supabase;
if (!supabaseDB) {
    console.error('SupabaseConfig.js is not loaded.');
    throw new Error('Supabase client not found.');
}

// ============================================================
// 2. Constants
// ============================================================
const DEFAULT_ADMIN_EMAIL = 'byaktigatkhata@gmail.com';
const LOGIN_PAGE_URL = '../LoginPage/LoginIndex.html';

// ============================================================
// 3. DOM References
// ============================================================
const addAdminLink = document.getElementById('addAdminLink');
const logoutBtn = document.getElementById('logoutBtn');
const logoutBtnText = document.getElementById('logoutBtnText');
const adminName = document.getElementById('adminName');
const adminRole = document.getElementById('adminRole');
const welcomeAdminName = document.getElementById('welcomeAdminName');
const currentYear = document.getElementById('currentYear');
const dashboardMessage = document.getElementById('dashboardMessage');

// Password Modal References
const changePasswordBtn = document.getElementById('changePasswordBtn');
const changePasswordModal = document.getElementById('changePasswordModal');
const closePasswordModal = document.getElementById('closePasswordModal');
const closePasswordModalBtn = document.getElementById('closePasswordModalBtn');
const changePasswordForm = document.getElementById('changePasswordForm');
const btnChangePassword = document.getElementById('btnChangePassword');
const passwordChangeMessage = document.getElementById('passwordChangeMessage');
const currentPasswordInput = document.getElementById('currentPassword');
const newPasswordInput = document.getElementById('newPassword');
const confirmPasswordInput = document.getElementById('confirmPassword');

// ============================================================
// 4. State
// ============================================================
let currentAdmin = null;

// ============================================================
// 5. Initialize
// ============================================================
document.addEventListener('DOMContentLoaded', initializeDashboard);

async function initializeDashboard() {
    // Set current year
    if (currentYear) {
        currentYear.textContent = new Date().getFullYear();
    }

    // Add event listeners
    logoutBtn?.addEventListener('click', handleLogout);
    changePasswordBtn?.addEventListener('click', () => openChangePasswordModal(false));
    closePasswordModal?.addEventListener('click', closePasswordModalFunc);
    closePasswordModalBtn?.addEventListener('click', closePasswordModalFunc);
    changePasswordForm?.addEventListener('submit', handlePasswordChange);

    // Close modal on outside click
    window.addEventListener('click', function(event) {
        if (event.target === changePasswordModal) {
            const isRequired = document.querySelector('#changePasswordModal .required-message');
            if (!isRequired) {
                closePasswordModalFunc();
            }
        }
    });

    // Check authentication
    await checkAuthentication();

    // Check if password change is required
    await checkPasswordChangeRequired();
}

// ============================================================
// 6. Authentication
// ============================================================
async function checkAuthentication() {
    try {
        const { data: { session }, error: sessionError } = await supabaseDB.auth.getSession();

        if (sessionError) {
            console.error('Session error:', sessionError);
            redirectToLogin();
            return;
        }

        if (!session?.user) {
            redirectToLogin();
            return;
        }

        const authUser = session.user;
        const email = (authUser.email || '').trim().toLowerCase();

        if (!email) {
            showMessage('Admin email प्राप्त गर्न सकिएन।', 'error');
            await supabaseDB.auth.signOut();
            redirectToLogin();
            return;
        }

        const admin = await getAdminInformation(authUser, email);

        if (!admin) {
            showMessage('तपाईंलाई Admin Dashboard प्रयोग गर्ने अनुमति छैन।', 'error');
            await supabaseDB.auth.signOut();
            setTimeout(redirectToLogin, 1500);
            return;
        }

        currentAdmin = admin;
        displayAdminInformation(admin);

    } catch (error) {
        console.error('Dashboard authentication error:', error);
        redirectToLogin();
    }
}

// ============================================================
// 7. Get Admin Information
// ============================================================
async function getAdminInformation(authUser, email) {
    // Check if permanent admin (bypasses database)
    if (email === DEFAULT_ADMIN_EMAIL) {
        return {
            user_id: authUser.id,
            admin_name: 'Permanent Admin',
            admin_email: email,
            admin_role: 'AdminManager',
            is_active: 'true',
            isPermanent: true
        };
    }

    // Check in admins table (lowercase)
    const { data, error } = await supabaseDB
        .from('admins')
        .select('user_id, admin_name, admin_email, admin_role, is_active')
        .eq('user_id', authUser.id)
        .maybeSingle();

    if (error) {
        console.error('Admin lookup error:', error);
        return null;
    }

    if (!data) {
        console.log('No admin data found for user:', authUser.id);
        return null;
    }

    // Check if admin is active
    if (data.is_active !== 'true') {
        showMessage('तपाईंको Admin account अहिले inactive छ।', 'error');
        return null;
    }

    // Validate role
    if (data.admin_role !== 'AdminManager' && data.admin_role !== 'AdminEditor') {
        console.error('Invalid admin role:', data.admin_role);
        return null;
    }

    return {
        user_id: data.user_id,
        admin_name: data.admin_name,
        admin_email: data.admin_email,
        admin_role: data.admin_role,
        is_active: data.is_active,
        isPermanent: false
    };
}

// ============================================================
// 8. Display Admin Information
// ============================================================
function displayAdminInformation(admin) {
    const name = admin.admin_name || admin.admin_email;
    const role = admin.admin_role;

    adminName.textContent = name;
    adminRole.textContent = role;
    welcomeAdminName.textContent = name;

    // Show Add Admin link only for AdminManager
    if (role === 'AdminManager') {
        addAdminLink.style.display = 'flex';
    } else {
        addAdminLink.style.display = 'none';
    }
}

// ============================================================
// 9. Check if Password Change is Required
// ============================================================
async function checkPasswordChangeRequired() {
    try {
        const { data: { user }, error } = await supabaseDB.auth.getUser();

        if (error) {
            console.error('Error getting user:', error);
            return;
        }

        // Check if user metadata has must_change_password flag
        if (user?.user_metadata?.must_change_password === true) {
            // Show password change modal automatically
            setTimeout(() => {
                openChangePasswordModal(true);
            }, 1000);
        }
    } catch (error) {
        console.error('Error checking password change requirement:', error);
    }
}

// ============================================================
// 10. Password Change Modal
// ============================================================
function openChangePasswordModal(isRequired = false) {
    changePasswordModal.style.display = 'block';
    document.body.style.overflow = 'hidden';

    // Clear previous messages
    passwordChangeMessage.style.display = 'none';
    passwordChangeMessage.textContent = '';
    changePasswordForm.reset();

    if (isRequired) {
        // Show required message
        const message = document.createElement('div');
        message.style.cssText = `
            background: #fff3cd;
            color: #856404;
            padding: 12px 16px;
            border-radius: 8px;
            margin-bottom: 16px;
            display: flex;
            align-items: center;
            gap: 8px;
            border: 1px solid #ffc107;
        `;
        message.innerHTML = `
            <i class="fas fa-exclamation-triangle" style="font-size: 18px;"></i>
            <strong>Password Change Required:</strong> You must change your temporary password to continue.
        `;

        const modalBody = document.querySelector('#changePasswordModal .modal-body');
        const existingMessage = modalBody.querySelector('.required-message');
        if (existingMessage) existingMessage.remove();

        message.className = 'required-message';
        modalBody.prepend(message);

        // Disable cancel buttons
        closePasswordModalBtn.disabled = true;
        closePasswordModal.disabled = true;
    } else {
        // Remove required message if exists
        const existingMessage = document.querySelector('#changePasswordModal .required-message');
        if (existingMessage) existingMessage.remove();
        closePasswordModalBtn.disabled = false;
        closePasswordModal.disabled = false;
    }

    // Focus on first input
    setTimeout(() => {
        currentPasswordInput.focus();
    }, 300);
}

function closePasswordModalFunc() {
    changePasswordModal.style.display = 'none';
    document.body.style.overflow = 'auto';
    changePasswordForm.reset();
    passwordChangeMessage.style.display = 'none';
    passwordChangeMessage.textContent = '';
    passwordChangeMessage.className = '';
    btnChangePassword.disabled = false;
    btnChangePassword.innerHTML = '<i class="fas fa-save"></i> Update Password';
}

// ============================================================
// 11. Handle Password Change
// ============================================================
async function handlePasswordChange(e) {
    e.preventDefault();

    const currentPassword = currentPasswordInput.value;
    const newPassword = newPasswordInput.value;
    const confirmPassword = confirmPasswordInput.value;

    // Validate
    if (!currentPassword || !newPassword || !confirmPassword) {
        showPasswordChangeMessage('कृपया सबै फिल्डहरू भर्नुहोस्।', 'error');
        return;
    }

    if (newPassword.length < 6) {
        showPasswordChangeMessage('नयाँ पासवर्ड कम्तिमा ६ वर्णको हुनुपर्छ।', 'error');
        return;
    }

    if (newPassword !== confirmPassword) {
        showPasswordChangeMessage('नयाँ पासवर्ड र पुष्टि पासवर्ड मिलेन।', 'error');
        return;
    }

    setPasswordChangeLoading(true);

    try {
        // Update password using Supabase
        const { error } = await supabaseDB.auth.updateUser({
            password: newPassword
        });

        if (error) {
            if (error.message.toLowerCase().includes('password')) {
                showPasswordChangeMessage('हालको पासवर्ड गलत छ।', 'error');
            } else {
                showPasswordChangeMessage(`Error: ${error.message}`, 'error');
            }
            return;
        }

        // After successful password change, clear the must_change_password flag
        const { error: updateError } = await supabaseDB.auth.updateUser({
            data: {
                must_change_password: false
            }
        });

        if (updateError) {
            console.warn('Could not update metadata:', updateError);
        }

        showPasswordChangeMessage('✅ पासवर्ड सफलतापूर्वक परिवर्तन गरियो!', 'success');

        // Close modal after success
        setTimeout(() => {
            closePasswordModalFunc();
            showMessage('पासवर्ड सफलतापूर्वक परिवर्तन गरियो।', 'success');
        }, 1500);

    } catch (error) {
        console.error('Password change error:', error);
        showPasswordChangeMessage('पासवर्ड परिवर्तन गर्दा समस्या भयो।', 'error');
    } finally {
        setPasswordChangeLoading(false);
    }
}

function showPasswordChangeMessage(message, type) {
    passwordChangeMessage.textContent = message;
    passwordChangeMessage.className = type;
    passwordChangeMessage.style.display = 'block';
}

function setPasswordChangeLoading(isLoading) {
    if (isLoading) {
        btnChangePassword.disabled = true;
        btnChangePassword.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Updating...';
    } else {
        btnChangePassword.disabled = false;
        btnChangePassword.innerHTML = '<i class="fas fa-save"></i> Update Password';
    }
}

// ============================================================
// 12. Logout
// ============================================================
async function handleLogout() {
    logoutBtn.disabled = true;
    logoutBtnText.textContent = 'Logging out...';

    try {
        const { error } = await supabaseDB.auth.signOut();

        if (error) {
            console.error('Logout error:', error);
            showMessage('Logout गर्न सकिएन। कृपया पुनः प्रयास गर्नुहोस्।', 'error');
            logoutBtn.disabled = false;
            logoutBtnText.textContent = 'Logout';
            return;
        }

        sessionStorage.removeItem('ojhaAdminInfo');
        localStorage.removeItem('ojhaAdminInfo');
        redirectToLogin();

    } catch (error) {
        console.error('Logout error:', error);
        showMessage('Logout गर्दा समस्या भयो।', 'error');
        logoutBtn.disabled = false;
        logoutBtnText.textContent = 'Logout';
    }
}

// ============================================================
// 13. Utility Functions
// ============================================================
function redirectToLogin() {
    window.location.replace(LOGIN_PAGE_URL);
}

function showMessage(message, type) {
    dashboardMessage.textContent = message;
    dashboardMessage.className = `dashboardMessage ${type}`;
    dashboardMessage.style.display = 'block';

    setTimeout(() => {
        dashboardMessage.style.display = 'none';
    }, 4000);
}

// ============================================================
// 14. Handle Page Restore (back/forward cache)
// ============================================================
window.addEventListener('pageshow', async event => {
    if (event.persisted) {
        await checkAuthentication();
    }
});