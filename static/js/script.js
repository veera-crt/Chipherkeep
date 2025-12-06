document.addEventListener('DOMContentLoaded', () => {
    // --- State ---
    let editingId = null;
    let authMode = 'login'; // 'login' or 'register'
    let currentEmail = '';

    // --- DOM Elements ---
    const views = {
        landing: document.getElementById('landing-view'),
        auth: document.getElementById('auth-view'),
        otp: document.getElementById('otp-view'),
        dashboard: document.getElementById('dashboard-view')
    };

    // Buttons
    const navLoginBtn = document.getElementById('nav-login-btn');
    const heroCtaBtn = document.getElementById('hero-cta-btn');
    const authBackBtn = document.getElementById('auth-back-btn');
    const otpBackBtn = document.getElementById('otp-back-btn');
    const logoutBtn = document.getElementById('logout-btn');
    const addBtn = document.getElementById('add-btn');

    // Auth Form
    const authForm = document.getElementById('auth-form');
    const emailInput = document.getElementById('email');
    const passwordInput = document.getElementById('master-password');
    const authSubmitBtn = document.getElementById('auth-submit-btn');
    const authSubtitle = document.getElementById('auth-subtitle');
    const switchAuthLink = document.getElementById('switch-auth-link');
    const authSwitchText = document.getElementById('auth-switch-text');
    const authToggleBtn = document.querySelector('.auth-toggle');

    // OTP Form
    const otpForm = document.getElementById('otp-form');
    const otpInput = document.getElementById('otp-input');
    const otpEmailDisplay = document.getElementById('otp-email-display');
    const resendOtpBtn = document.getElementById('resend-otp');

    // Dashboard
    const passwordList = document.getElementById('password-list');
    const emptyState = document.getElementById('empty-state');
    const itemCount = document.getElementById('item-count');
    const userEmailDisplay = document.getElementById('user-email-display');

    // Modal
    const modalOverlay = document.getElementById('modal-overlay');
    const closeModalBtn = document.getElementById('close-modal');
    const addPasswordForm = document.getElementById('add-password-form');
    const generateBtn = document.getElementById('generate-btn');
    const modalTitle = document.querySelector('.modal-header h3');
    const modalSubmitBtn = addPasswordForm.querySelector('button[type="submit"]');

    // Mobile Nav
    const mobileMenuBtn = document.getElementById('mobile-menu-btn');
    const closeSidebarBtn = document.getElementById('close-sidebar-btn');
    const sidebar = document.querySelector('.sidebar');

    // Toast
    const toast = document.getElementById('toast');

    // --- Initialization ---
    checkSession();

    // --- Auth Flow Logic ---

    // Toggle Auth Mode (Login vs Register)
    switchAuthLink.addEventListener('click', (e) => {
        e.preventDefault();
        authMode = authMode === 'login' ? 'register' : 'login';
        updateAuthUI();
    });

    function updateAuthUI() {
        if (authMode === 'login') {
            document.querySelector('.auth-card h1').textContent = 'CipherKeep';
            authSubtitle.textContent = 'Welcome back. Unlock your vault.';
            authSubmitBtn.innerHTML = '<span>Sign In</span><i class="fa-solid fa-arrow-right"></i>';
            authSwitchText.innerHTML = 'Don\'t have an account? <a href="#" id="switch-auth-link">Sign up</a>';
        } else {
            document.querySelector('.auth-card h1').textContent = 'Create Account';
            authSubtitle.textContent = 'Join the secure future.';
            authSubmitBtn.innerHTML = '<span>Sign Up</span><i class="fa-solid fa-user-plus"></i>';
            authSwitchText.innerHTML = 'Already have an account? <a href="#" id="switch-auth-link">Sign in</a>';
        }
        // Re-attach listener after innerHTML replacement
        document.getElementById('switch-auth-link').addEventListener('click', (e) => {
            e.preventDefault();
            authMode = authMode === 'login' ? 'register' : 'login';
            updateAuthUI();
        });
    }

    // Submit Auth Form
    authForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = emailInput.value;
        const password = passwordInput.value;
        currentEmail = email;

        try {
            if (authMode === 'register') {
                setLoading(authSubmitBtn, true);
                const res = await fetch('/api/register', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email, password })
                });
                const data = await res.json();
                setLoading(authSubmitBtn, false);

                if (res.ok) {
                    showView('otp');
                    otpEmailDisplay.textContent = email;
                    showToast('OTP sent to email');
                } else {
                    showToast(data.error || 'Registration failed');
                }

            } else {
                // Login
                setLoading(authSubmitBtn, true);
                const res = await fetch('/api/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email, password })
                });
                const data = await res.json();
                setLoading(authSubmitBtn, false);

                if (res.ok) {
                    showDashboard();
                } else {
                    showToast(data.error || 'Login failed');
                }
            }
        } catch (err) {
            setLoading(authSubmitBtn, false);
            showToast('Network error');
            console.error(err);
        }
    });

    // Verify OTP
    otpForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const otp = otpInput.value;

        try {
            const btn = otpForm.querySelector('button');
            setLoading(btn, true);
            const res = await fetch('/api/verify-otp', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: currentEmail, otp })
            });
            const data = await res.json();
            setLoading(btn, false);

            if (res.ok) {
                showToast('Account verified! Please login.');
                showView('auth');
                authMode = 'login';
                updateAuthUI();
                otpForm.reset();
            } else {
                showToast(data.error || 'Invalid OTP');
            }
        } catch (err) {
            showToast('Verification failed');
        }
    });

    // Logout
    logoutBtn.addEventListener('click', async () => {
        await fetch('/api/logout', { method: 'POST' });
        showView('landing');
        passwordList.innerHTML = '';
        currentEmail = '';
    });

    // --- Core Funcs ---

    async function checkSession() {
        try {
            const res = await fetch('/api/check-session');
            const data = await res.json();
            if (data.isLoggedIn) {
                currentEmail = data.email;
                showDashboard();
            } else {
                showView('landing');
            }
        } catch (err) {
            showView('landing');
        }
    }

    async function showDashboard() {
        showView('dashboard');
        userEmailDisplay.textContent = currentEmail.split('@')[0];
        await fetchPasswords();
    }

    // --- Vault Logic ---

    async function fetchPasswords() {
        try {
            const res = await fetch('/api/passwords');
            const passwords = await res.json();
            renderPasswords(passwords);
        } catch (err) {
            showToast('Error loading passwords');
        }
    }

    function renderPasswords(passwords) {
        passwordList.innerHTML = '';
        itemCount.textContent = passwords.length;

        if (passwords.length === 0) {
            emptyState.style.display = 'flex';
        } else {
            emptyState.style.display = 'none';
            passwords.forEach(pwd => {
                const card = createPasswordCard(pwd);
                passwordList.appendChild(card);
            });
        }
    }

    function createPasswordCard(pwd) {
        const div = document.createElement('div');
        div.className = 'password-card glass-panel';
        const initial = pwd.siteName.charAt(0).toUpperCase();

        div.innerHTML = `
            <div class="card-header">
                <div class="site-icon">${initial}</div>
                <div class="site-info">
                    <h3>${pwd.siteName}</h3>
                    <p>${pwd.username}</p>
                </div>
            </div>
            <div class="card-actions">
                <div class="password-display">••••••••</div>
                <div class="action-btns">
                    <button class="icon-btn copy-btn" title="Copy Password"><i class="fa-regular fa-copy"></i></button>
                    <button class="icon-btn toggle-btn" title="Show Password"><i class="fa-solid fa-eye"></i></button>
                    <button class="icon-btn edit-btn" title="Edit"><i class="fa-solid fa-pen"></i></button>
                    <button class="icon-btn delete-btn" title="Delete"><i class="fa-solid fa-trash"></i></button>
                </div>
            </div>
        `;

        // Logic
        const toggleBtn = div.querySelector('.toggle-btn');
        const displayEl = div.querySelector('.password-display');
        let isVisible = false;

        toggleBtn.addEventListener('click', () => {
            isVisible = !isVisible;
            displayEl.textContent = isVisible ? pwd.password : '••••••••';
            toggleBtn.innerHTML = isVisible ? '<i class="fa-solid fa-eye-slash"></i>' : '<i class="fa-solid fa-eye"></i>';
        });

        div.querySelector('.copy-btn').addEventListener('click', () => {
            navigator.clipboard.writeText(pwd.password);
            showToast('Copied to clipboard');
        });

        div.querySelector('.delete-btn').addEventListener('click', async () => {
            if (confirm('Delete this password?')) {
                await fetch(`/api/passwords/${pwd.id}`, { method: 'DELETE' });
                fetchPasswords();
                showToast('Password deleted');
            }
        });

        div.querySelector('.edit-btn').addEventListener('click', () => {
            editingId = pwd.id;
            document.getElementById('site-name').value = pwd.siteName;
            document.getElementById('username').value = pwd.username;
            document.getElementById('password').value = pwd.password;

            modalTitle.textContent = 'Edit Password';
            modalSubmitBtn.textContent = 'Update Password';
            modalOverlay.classList.remove('hidden');
        });

        return div;
    }

    // Add/Update Password
    addPasswordForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const siteName = document.getElementById('site-name').value;
        const username = document.getElementById('username').value;
        const password = document.getElementById('password').value;

        try {
            if (editingId) {
                // Update
                await fetch(`/api/passwords/${editingId}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ siteName, username, password })
                });
                showToast('Password updated');
            } else {
                // Add
                await fetch('/api/passwords', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ siteName, username, password })
                });
                showToast('Password saved');
            }

            addPasswordForm.reset();
            modalOverlay.classList.add('hidden');
            editingId = null;
            fetchPasswords();

        } catch (err) {
            showToast('Error saving password');
        }
    });

    // --- Utils ---
    function showView(viewId) {
        Object.values(views).forEach(el => {
            el.classList.remove('active');
            el.classList.add('hidden');
            el.style.display = 'none';
        });
        const target = views[viewId];
        target.classList.remove('hidden');
        target.style.display = viewId === 'dashboard' ? 'flex' : 'block'; // Dashboard is flex
        if (viewId === 'auth' || viewId === 'otp') target.style.display = 'flex'; // Centered views

        setTimeout(() => target.classList.add('active'), 10);
    }

    function showToast(msg) {
        toast.querySelector('span').textContent = msg;
        toast.classList.remove('hidden');
        toast.style.animation = 'none';
        toast.offsetHeight;
        toast.style.animation = 'slideIn 0.3s ease-out';
        setTimeout(() => toast.classList.add('hidden'), 3000);
    }

    function setLoading(btn, isLoading) {
        if (isLoading) {
            btn.dataset.original = btn.innerHTML;
            btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Loading...';
            btn.disabled = true;
        } else {
            btn.innerHTML = btn.dataset.original;
            btn.disabled = false;
        }
    }

    // --- Misc Listeners ---
    navLoginBtn.addEventListener('click', () => { showView('auth'); authMode = 'login'; updateAuthUI(); });
    heroCtaBtn.addEventListener('click', () => { showView('auth'); authMode = 'register'; updateAuthUI(); });

    // Back Buttons
    authBackBtn.addEventListener('click', () => showView('landing'));
    otpBackBtn.addEventListener('click', () => showView('auth'));

    addBtn.addEventListener('click', () => {
        editingId = null;
        addPasswordForm.reset();
        modalTitle.textContent = 'Add New Password';
        modalSubmitBtn.textContent = 'Save Password';
        modalOverlay.classList.remove('hidden');
    });

    closeModalBtn.addEventListener('click', () => modalOverlay.classList.add('hidden'));

    generateBtn.addEventListener('click', () => {
        const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()_+";
        let newVal = "";
        for (let i = 0; i < 16; ++i) newVal += charset.charAt(Math.floor(Math.random() * charset.length));
        document.getElementById('password').value = newVal;
    });

    authToggleBtn.addEventListener('click', () => {
        const type = passwordInput.getAttribute('type') === 'password' ? 'text' : 'password';
        passwordInput.setAttribute('type', type);
        authToggleBtn.innerHTML = type === 'password' ? '<i class="fa-solid fa-eye"></i>' : '<i class="fa-solid fa-eye-slash"></i>';
    });

    // Mobile Sidebar
    if (mobileMenuBtn) mobileMenuBtn.addEventListener('click', () => sidebar.classList.add('active'));
    if (closeSidebarBtn) closeSidebarBtn.addEventListener('click', () => sidebar.classList.remove('active'));

    // Modal Password Visibility
    const modalPassInput = document.getElementById('password');
    const modalToggle = addPasswordForm.querySelector('.toggle-visibility');
    modalToggle.addEventListener('click', () => {
        const type = modalPassInput.getAttribute('type') === 'password' ? 'text' : 'password';
        modalPassInput.setAttribute('type', type);
        modalToggle.innerHTML = type === 'password' ? '<i class="fa-solid fa-eye"></i>' : '<i class="fa-solid fa-eye-slash"></i>';
    });
});
