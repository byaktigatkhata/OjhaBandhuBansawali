'use strict';

const supabaseDB = window.SupabaseConfig?.supabase;

const DEFAULT_ADMIN_EMAIL = 'byaktigatkhata@gmail.com';
const ADMIN_DASHBOARD_URL = '../AdminDashboardPage/AdminDashboardIndex.html';

if (!supabaseDB) {
    console.error('SupabaseConfig.js is not loaded.');
    throw new Error('Supabase client not found.');
}

const loginForm = document.getElementById('loginForm');
const loginEmail = document.getElementById('loginEmail');
const loginPassword = document.getElementById('loginPassword');
const loginBtn = document.getElementById('loginBtn');
const loginBtnText = document.getElementById('loginBtnText');
const loginMessage = document.getElementById('loginMessage');

const emailError = document.getElementById('emailError');
const passwordError = document.getElementById('passwordError');

const togglePasswordBtn = document.getElementById('togglePasswordBtn');
const togglePasswordIcon = document.getElementById('togglePasswordIcon');

const currentYear = document.getElementById('currentYear');
const forgotPasswordBtn = document.getElementById('forgotPasswordBtn');

document.addEventListener('DOMContentLoaded', initializeLoginPage);

async function initializeLoginPage() {

    if (currentYear) {
        currentYear.textContent = new Date().getFullYear();
    }

    setupPasswordToggle();
    setupForm();

    await checkExistingSession();
}

function setupForm() {
    loginForm.addEventListener('submit', handleLogin);

    forgotPasswordBtn.addEventListener(
        'click',
        handleForgotPassword
    );

    loginEmail.addEventListener('input', () => {
        emailError.textContent = '';
        clearMessage();
    });

    loginPassword.addEventListener('input', () => {
        passwordError.textContent = '';
        clearMessage();
    });
}

function setupPasswordToggle() {

    togglePasswordBtn.addEventListener('click', () => {

        const isPassword =
            loginPassword.type === 'password';

        loginPassword.type =
            isPassword ? 'text' : 'password';

        togglePasswordIcon.className =
            isPassword
                ? 'fas fa-eye-slash'
                : 'fas fa-eye';

        togglePasswordBtn.setAttribute(
            'aria-label',
            isPassword
                ? 'Hide password'
                : 'Show password'
        );

        togglePasswordBtn.setAttribute(
            'title',
            isPassword
                ? 'Hide password'
                : 'Show password'
        );
    });
}

async function checkExistingSession() {

    try {

        const {
            data: { session },
            error
        } = await supabaseDB.auth.getSession();

        if (error) {
            console.error(
                'Session error:',
                error
            );
            return;
        }

        if (!session?.user) {
            return;
        }

        const admin =
            await identifyAdmin(session.user);

        if (!admin) {

            await supabaseDB.auth.signOut();

            sessionStorage.removeItem(
                'ojhaAdminInfo'
            );

            return;
        }

        saveAdminInfo(admin);
        redirectToDashboard();

    } catch (error) {

        console.error(
            'Session check error:',
            error
        );
    }
}

async function handleLogin(event) {

    event.preventDefault();

    clearErrors();
    clearMessage();

    const email =
        loginEmail.value.trim().toLowerCase();

    const password =
        loginPassword.value;

    if (!validateForm(email, password)) {
        return;
    }

    setLoginLoading(true);

    try {

        const {
            data,
            error
        } = await supabaseDB.auth.signInWithPassword({
            email: email,
            password: password
        });

        if (error) {

            console.error(
                'Supabase login error:',
                error
            );

            showMessage(
                getLoginErrorMessage(error),
                'error'
            );

            return;
        }

        if (!data?.user) {

            showMessage(
                'Login सफल भएन। कृपया पुनः प्रयास गर्नुहोस्।',
                'error'
            );

            return;
        }

        const admin =
            await identifyAdmin(data.user);

        if (!admin) {

            await supabaseDB.auth.signOut();

            sessionStorage.removeItem(
                'ojhaAdminInfo'
            );

            showMessage(
                'यो Account लाई Admin access दिइएको छैन।',
                'error'
            );

            return;
        }

        saveAdminInfo(admin);

        showMessage(
            `स्वागत छ, ${admin.name}!`,
            'success'
        );

        setTimeout(() => {
            redirectToDashboard();
        }, 700);

    } catch (error) {

        console.error(
            'Login error:',
            error
        );

        await supabaseDB.auth.signOut();

        showMessage(
            'Login गर्दा समस्या भयो। कृपया पुनः प्रयास गर्नुहोस्।',
            'error'
        );

    } finally {

        setLoginLoading(false);
    }
}

async function handleForgotPassword() {

    clearErrors();
    clearMessage();

    const email =
        loginEmail.value.trim().toLowerCase();

    if (!email) {
        emailError.textContent =
            'Please enter your email address first.';
        loginEmail.focus();
        return;
    }

    if (!isValidEmail(email)) {
        emailError.textContent =
            'Please enter a valid email address.';
        loginEmail.focus();
        return;
    }

    forgotPasswordBtn.disabled = true;
    forgotPasswordBtn.textContent =
        'Sending...';

    try {

        const resetUrl =
            `${window.location.origin}/AdminPage/ResetPasswordPage/ResetPasswordIndex.html`;

        const { error } =
            await supabaseDB.auth.resetPasswordForEmail(
                email,
                {
                    redirectTo: resetUrl
                }
            );

        if (error) {

            console.error(
                'Password reset error:',
                error
            );

            showMessage(
                getPasswordResetErrorMessage(error),
                'error'
            );

            return;
        }

        showMessage(
            'Password reset link तपाईंको email मा पठाइएको छ।',
            'success'
        );

    } catch (error) {

        console.error(
            'Forgot password error:',
            error
        );

        showMessage(
            'Password reset email पठाउँदा समस्या भयो।',
            'error'
        );

    } finally {

        forgotPasswordBtn.disabled = false;
        forgotPasswordBtn.textContent =
            'Forgot Password?';
    }
}

function getPasswordResetErrorMessage(error) {

    const message =
        error?.message?.toLowerCase() || '';

    if (message.includes('rate limit')) {
        return 'धेरै पटक प्रयास गरिएको छ। केही समयपछि पुनः प्रयास गर्नुहोस्।';
    }

    if (message.includes('email')) {
        return 'Email address जाँच गर्नुहोस्।';
    }

    return (
        error?.message ||
        'Password reset email पठाउन सकिएन।'
    );
}

async function identifyAdmin(user) {

    if (!user?.id || !user?.email) {
        return null;
    }

    const email =
        user.email.trim().toLowerCase();

    // Permanent AdminManager
    if (email === DEFAULT_ADMIN_EMAIL) {

        return {
            user_id: user.id,
            name: 'Permanent Administrator',
            email: DEFAULT_ADMIN_EMAIL,
            role: 'AdminManager',
            isActive: true,
            isPermanent: true
        };
    }

    // All other admins must exist in admins table (lowercase)
    return await getAdminByUserId(user.id);
}

async function getAdminByUserId(userId) {

    // UPDATED: Using lowercase table name 'admins' and lowercase column names
    const {
        data,
        error
    } = await supabaseDB
        .from('admins')  // Changed from 'Admins' to 'admins'
        .select(
            'user_id, admin_name, admin_email, admin_role, is_active'  // Changed column names
        )
        .eq('user_id', userId)
        .maybeSingle();

    if (error) {

        console.error(
            'Admin lookup error:',
            error
        );

        throw error;
    }

    if (!data) {
        return null;
    }

    // Check if admin is active
    if (data.is_active !== 'true') {  // Changed to string comparison

        showMessage(
            'तपाईंको Admin Account अहिले निष्क्रिय छ।',
            'error'
        );

        return null;
    }

    if (!isValidAdminRole(data.admin_role)) {  // Changed from AdminRole

        console.error(
            'Invalid AdminRole:',
            data.admin_role
        );

        showMessage(
            'तपाईंको Admin Role मान्य छैन।',
            'error'
        );

        return null;
    }

    return {
        user_id: data.user_id,
        name: data.admin_name,  // Changed from AdminName
        email: data.admin_email,  // Changed from AdminEmail
        role: data.admin_role,  // Changed from AdminRole
        isActive: data.is_active,  // Changed from isActive
        isPermanent: false
    };
}

function isValidAdminRole(role) {

    return (
        role === 'AdminManager' ||
        role === 'AdminEditor'
    );
}

function saveAdminInfo(admin) {

    const adminInfo = {
        user_id: admin.user_id,
        name: admin.name,
        email: admin.email,
        role: admin.role,
        isActive: admin.isActive,
        isPermanent: admin.isPermanent === true
    };

    sessionStorage.setItem(
        'ojhaAdminInfo',
        JSON.stringify(adminInfo)
    );
}

function getAdminInfo() {

    const storedInfo =
        sessionStorage.getItem(
            'ojhaAdminInfo'
        );

    if (!storedInfo) {
        return null;
    }

    try {

        return JSON.parse(storedInfo);

    } catch (error) {

        console.error(
            'Invalid admin information:',
            error
        );

        sessionStorage.removeItem(
            'ojhaAdminInfo'
        );

        return null;
    }
}

function redirectToDashboard() {
    window.location.href =
        ADMIN_DASHBOARD_URL;
}

function validateForm(email, password) {

    let valid = true;

    if (!email) {

        emailError.textContent =
            'Email is required.';

        valid = false;

    } else if (!isValidEmail(email)) {

        emailError.textContent =
            'Please enter a valid email address.';

        valid = false;
    }

    if (!password) {

        passwordError.textContent =
            'Password is required.';

        valid = false;
    }

    if (!valid) {

        if (!email) {
            loginEmail.focus();
        } else if (!password) {
            loginPassword.focus();
        }
    }

    return valid;
}

function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function getLoginErrorMessage(error) {

    if (!error) {
        return 'Login failed. Please try again.';
    }

    const message =
        error.message?.toLowerCase() || '';

    if (
        message.includes(
            'invalid login credentials'
        )
    ) {
        return 'Email वा Password गलत छ।';
    }

    if (
        message.includes(
            'email not confirmed'
        )
    ) {
        return 'कृपया पहिले आफ्नो Email confirm गर्नुहोस्।';
    }

    if (
        message.includes(
            'too many requests'
        )
    ) {
        return 'धेरै पटक प्रयास गरिएको छ। केही समयपछि पुनः प्रयास गर्नुहोस्।';
    }

    return (
        error.message ||
        'Login failed. Please try again.'
    );
}

function setLoginLoading(isLoading) {

    loginBtn.disabled = isLoading;

    if (isLoading) {

        loginBtnText.textContent =
            'Logging in...';

        loginBtn.querySelector('i').className =
            'fas fa-spinner fa-spin';

    } else {

        loginBtnText.textContent =
            'Login';

        loginBtn.querySelector('i').className =
            'fas fa-right-to-bracket';
    }
}

function showMessage(message, type) {

    loginMessage.textContent = message;
    loginMessage.className = type;
    loginMessage.style.display = 'block';
}

function clearMessage() {

    loginMessage.textContent = '';
    loginMessage.className = '';
    loginMessage.style.display = 'none';
}

function clearErrors() {

    emailError.textContent = '';
    passwordError.textContent = '';
}