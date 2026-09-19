'use strict';

const supabaseDB = window.SupabaseConfig?.supabase;

if (!supabaseDB) {
    console.error('SupabaseConfig.js is not loaded.');
    throw new Error('Supabase client not found.');
}

const LOGIN_PAGE_URL =
    '../LoginPage/LoginIndex.html';

const resetForm =
    document.getElementById('resetPasswordForm');

const newPassword =
    document.getElementById('newPassword');

const confirmPassword =
    document.getElementById('confirmPassword');

const newPasswordError =
    document.getElementById('newPasswordError');

const confirmPasswordError =
    document.getElementById('confirmPasswordError');

const resetMessage =
    document.getElementById('resetMessage');

const resetPasswordBtn =
    document.getElementById('resetPasswordBtn');

const resetPasswordBtnText =
    document.getElementById('resetPasswordBtnText');

const toggleNewPassword =
    document.getElementById('toggleNewPassword');

const toggleConfirmPassword =
    document.getElementById('toggleConfirmPassword');

const newPasswordIcon =
    document.getElementById('newPasswordIcon');

const confirmPasswordIcon =
    document.getElementById('confirmPasswordIcon');

let resetSessionReady = false;
let recoveryEventReceived = false;

document.addEventListener(
    'DOMContentLoaded',
    initializeResetPage
);

async function initializeResetPage() {

    setupPasswordToggles();
    setupForm();

    supabaseDB.auth.onAuthStateChange(
        async (event, session) => {

            console.log(
                'Reset page auth event:',
                event
            );

            if (
                event === 'PASSWORD_RECOVERY' &&
                session?.user
            ) {

                recoveryEventReceived = true;
                resetSessionReady = true;

                enableResetForm();

                return;
            }

            if (
                event === 'SIGNED_IN' &&
                session?.user
            ) {

                if (recoveryEventReceived) {
                    resetSessionReady = true;
                    enableResetForm();
                }
            }
        }
    );

    await checkResetSession();
}

function setupForm() {

    resetForm.addEventListener(
        'submit',
        handlePasswordReset
    );

    newPassword.addEventListener(
        'input',
        validatePasswords
    );

    confirmPassword.addEventListener(
        'input',
        validatePasswords
    );
}

function setupPasswordToggles() {

    toggleNewPassword.addEventListener(
        'click',
        () => {

            const show =
                newPassword.type === 'password';

            newPassword.type =
                show ? 'text' : 'password';

            newPasswordIcon.className =
                show
                    ? 'fas fa-eye-slash'
                    : 'fas fa-eye';

            toggleNewPassword.setAttribute(
                'aria-label',
                show
                    ? 'Hide password'
                    : 'Show password'
            );
        }
    );

    toggleConfirmPassword.addEventListener(
        'click',
        () => {

            const show =
                confirmPassword.type === 'password';

            confirmPassword.type =
                show ? 'text' : 'password';

            confirmPasswordIcon.className =
                show
                    ? 'fas fa-eye-slash'
                    : 'fas fa-eye';

            toggleConfirmPassword.setAttribute(
                'aria-label',
                show
                    ? 'Hide password'
                    : 'Show password'
            );
        }
    );
}

async function checkResetSession() {

    try {

        const {
            data: { session },
            error
        } = await supabaseDB.auth.getSession();

        if (error) {

            console.error(
                'Reset session error:',
                error
            );

            redirectToLogin();
            return;
        }

        if (session?.user) {

            resetSessionReady = true;
            enableResetForm();

            return;
        }

        setTimeout(() => {

            if (!resetSessionReady) {
                redirectToLogin();
            }

        }, 1500);

    } catch (error) {

        console.error(
            'Reset session check error:',
            error
        );

        redirectToLogin();
    }
}

async function handlePasswordReset(event) {

    event.preventDefault();

    clearErrors();
    clearMessage();

    if (!resetSessionReady) {

        showMessage(
            'Password reset session उपलब्ध छैन।',
            'error'
        );

        return;
    }

    if (!validatePasswords()) {
        return;
    }

    setLoading(true);

    try {

        const {
            data,
            error
        } = await supabaseDB.auth.updateUser({
            password: newPassword.value
        });

        if (error) {

            console.error(
                'Password update error:',
                error
            );

            showMessage(
                getPasswordUpdateError(error),
                'error'
            );

            return;
        }

        if (!data?.user) {

            showMessage(
                'Password update हुन सकेन।',
                'error'
            );

            return;
        }

        showMessage(
            'Password successfully changed. Login page मा redirect हुँदैछ...',
            'success'
        );

        resetForm.reset();

        setTimeout(
            async () => {

                await supabaseDB.auth.signOut();

                redirectToLogin();

            },
            1800
        );

    } catch (error) {

        console.error(
            'Password reset error:',
            error
        );

        showMessage(
            'Password reset गर्दा समस्या भयो। कृपया पुनः प्रयास गर्नुहोस्।',
            'error'
        );

    } finally {

        setLoading(false);
    }
}

function validatePasswords() {

    clearPasswordErrors();

    const password =
        newPassword.value;

    const confirm =
        confirmPassword.value;

    let valid = true;

    if (!password) {

        newPasswordError.textContent =
            'New password is required.';

        valid = false;

    } else if (password.length < 6) {

        newPasswordError.textContent =
            'Password must contain at least 6 characters.';

        valid = false;
    }

    if (!confirm) {

        confirmPasswordError.textContent =
            'Please confirm your password.';

        valid = false;

    } else if (password !== confirm) {

        confirmPasswordError.textContent =
            'Passwords do not match.';

        valid = false;
    }

    return valid;
}

function clearPasswordErrors() {

    newPasswordError.textContent = '';
    confirmPasswordError.textContent = '';
}

function clearErrors() {
    clearPasswordErrors();
}

function showMessage(message, type) {

    resetMessage.textContent = message;

    resetMessage.className =
        `reset-message ${type}`;

    resetMessage.style.display =
        'block';
}

function clearMessage() {

    resetMessage.textContent = '';

    resetMessage.className =
        'reset-message';

    resetMessage.style.display =
        'none';
}

function setLoading(isLoading) {

    resetPasswordBtn.disabled =
        isLoading;

    if (isLoading) {

        resetPasswordBtnText.textContent =
            'Updating...';

        resetPasswordBtn.querySelector('i').className =
            'fas fa-spinner fa-spin';

    } else {

        resetPasswordBtnText.textContent =
            'Reset Password';

        resetPasswordBtn.querySelector('i').className =
            'fas fa-key';
    }
}

function enableResetForm() {

    resetPasswordBtn.disabled = false;
    newPassword.disabled = false;
    confirmPassword.disabled = false;
}

function getPasswordUpdateError(error) {

    const message =
        error?.message?.toLowerCase() || '';

    if (
        message.includes('password should be at least')
    ) {
        return 'Password is too short.';
    }

    if (
        message.includes('same password')
    ) {
        return 'New password must be different from your old password.';
    }

    if (
        message.includes('session')
    ) {
        return 'Reset session expired. Please request a new password reset link.';
    }

    return (
        error?.message ||
        'Password update failed.'
    );
}

function redirectToLogin() {

    window.location.replace(
        LOGIN_PAGE_URL
    );
}