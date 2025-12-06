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
    const initialLoader = document.getElementById('initial-loader');

    // Settings & Tabs
    const navVault = document.getElementById('nav-vault');
    const navSettings = document.getElementById('nav-settings');
    const vaultTab = document.getElementById('vault-tab');
    const settingsTab = document.getElementById('settings-tab');

    // Settings Forms
    const changePasswordForm = document.getElementById('change-password-form');

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

    // --- Functions ---

    async function checkSession() {
        try {
            const res = await fetch('/api/check-session');
            const data = await res.json();
            if (data.logged_in) {
                currentEmail = data.email;
                await showDashboard(data.remaining_seconds);
                // Ensure landing is hidden if we go straight to dashboard
                document.getElementById('landing-view').classList.add('hidden');
            } else {
                showView('landing');
            }
        } catch (err) {
            console.error(err);
            showView('landing');
        } finally {
            // Remove initial loader once we know where to go
            if (initialLoader) {
                initialLoader.style.opacity = '0';
                setTimeout(() => initialLoader.remove(), 500);
            }
        }
    }

    async function showDashboard(remainingSeconds = 600) {
        showView('dashboard');
        switchTab('vault'); // Ensure start on vault
        userEmailDisplay.textContent = currentEmail.split('@')[0];
        startSessionTimer(remainingSeconds); // Start the visual countdown
        await fetchPasswords();
    }

    // --- Search Logic ---
    const searchInput = document.querySelector('.search-bar input');

    searchInput.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase();
        const cards = document.querySelectorAll('.password-card');
        let visibleCount = 0;

        cards.forEach(card => {
            const siteName = card.querySelector('.site-info h3').textContent.toLowerCase();
            const username = card.querySelector('.site-info p').textContent.toLowerCase();

            if (siteName.includes(query) || username.includes(query)) {
                card.style.display = 'block';
                visibleCount++;
            } else {
                card.style.display = 'none';
            }
        });

        // Toggle empty state based on search results
        if (visibleCount === 0 && cards.length > 0) {
            // Optional: Show a "No results found" message instead of generic empty state?
            // For now, let's just create a 'no-results' specific state or reuse empty state if strictly empty
            // But simply hiding all cards might look like empty state.
            // Let's rely on the fact that if all are hidden, the grid is empty visually.
        }
    });

    // --- Modal Logic ---

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

    // --- Settings Logic ---
    navVault.addEventListener('click', (e) => {
        e.preventDefault();
        switchTab('vault');
    });

    navSettings.addEventListener('click', (e) => {
        e.preventDefault();
        switchTab('settings');
        // Pre-fill current email if possible, though 'new email' implies empty
    });

    function switchTab(tabName) {
        if (tabName === 'vault') {
            vaultTab.classList.remove('hidden');
            settingsTab.classList.add('hidden');
            navVault.classList.add('active');
            navSettings.classList.remove('active');
        } else {
            vaultTab.classList.add('hidden');
            settingsTab.classList.remove('hidden');
            navVault.classList.remove('active');
            navSettings.classList.add('active');
        }
    }

    changePasswordForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const oldPassword = document.getElementById('settings-old-password').value;
        const newPassword = document.getElementById('settings-new-password').value;
        const confirmPassword = document.getElementById('settings-confirm-password').value;
        const btn = changePasswordForm.querySelector('button');

        if (newPassword !== confirmPassword) {
            showToast('New passwords do not match');
            return;
        }

        setLoading(btn, true);
        try {
            const res = await fetch('/api/change-password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ oldPassword, newPassword })
            });
            const data = await res.json();
            setLoading(btn, false);

            if (res.ok) {
                showToast('Password updated successfully');
                changePasswordForm.reset();
            } else {
                showToast(data.error || 'Failed to update password');
            }
        } catch (err) {
            setLoading(btn, false);
            showToast('Network error');
        }
    });

    // --- Utils ---

    function startSessionTimer(remaining = 600) {
        const bar = document.getElementById('session-progress-bar');
        if (bar) {
            // Reset animation
            bar.classList.remove('animate');
            void bar.offsetWidth; // Trigger reflow

            // Calculate elapsed time to set animation start point
            // Total duration is 600s (10 mins)
            const totalDuration = 600;
            const elapsed = totalDuration - remaining;

            if (remaining <= 0) {
                // If already expired
                bar.style.width = '0%';
                window.location.reload(); // Force refresh to logout
                return;
            }

            // Negative delay seeks the animation to that point in time
            bar.style.animationDelay = `-${elapsed}s`;
            bar.classList.add('animate');

            // Auto-logout when timer ends
            setTimeout(() => {
                window.location.reload();
            }, remaining * 1000);
        }
    }

    function showView(viewId) {
        // Clear hash when switching main views (e.g. removing #about from dashboard)
        if (viewId === 'dashboard' || viewId === 'auth') {
            history.replaceState(null, null, ' ');
        }

        Object.values(views).forEach(el => {
            el.classList.remove('active');
            el.classList.add('hidden');
            el.style.display = 'none'; // Keep original display logic
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
