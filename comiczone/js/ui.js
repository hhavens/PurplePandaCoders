let currentAuthMode = 'login';

function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `
        <i class="fas fa-${type === 'success' ? 'check-circle' : 'info-circle'}"
           style="color: ${type === 'success' ? 'var(--success)' : 'var(--primary)'};">
        </i>
        <div>
            <div style="font-weight: 500;">${message}</div>
            <div style="font-size: 12px; color: var(--text-light); margin-top: 4px;">
                Just now
            </div>
        </div>
        <button onclick="this.parentElement.remove()" style="margin-left: auto; background: none; border: none; color: var(--text-light); cursor: pointer;">
            <i class="fas fa-times"></i>
        </button>
    `;

    container.appendChild(toast);

    setTimeout(() => {
        if (toast.parentElement) {
            toast.remove();
        }
    }, 5000);
}

function getRandomColor() {
    const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];
    return colors[Math.floor(Math.random() * colors.length)];
}

function getErrorMessage(error) {
    switch (error.code) {
        case 'auth/email-already-in-use':
            return 'This email is already registered.';
        case 'auth/invalid-email':
            return 'Please enter a valid email address.';
        case 'auth/weak-password':
            return 'Password should be at least 6 characters.';
        case 'auth/user-not-found':
            return 'No account found with this email.';
        case 'auth/wrong-password':
            return 'Incorrect password.';
        default:
            return error.message || 'An error occurred. Please try again.';
    }
}

function showAuthModal(mode = 'login') {
    currentAuthMode = mode;
    const modal = document.getElementById('authModal');
    const title = document.getElementById('authModalTitle');
    const buttonText = document.getElementById('authButtonText');
    const usernameGroup = document.getElementById('usernameGroup');
    const confirmPasswordGroup = document.getElementById('confirmPasswordGroup');

    document.querySelectorAll('.auth-tab').forEach(tab => tab.classList.remove('active'));
    document.querySelector(`.auth-tab[onclick*="${mode}"]`).classList.add('active');

    if (mode === 'login') {
        title.textContent = 'Welcome Back';
        buttonText.textContent = 'Sign In';
        usernameGroup.style.display = 'none';
        confirmPasswordGroup.style.display = 'none';
    } else {
        title.textContent = 'Join ComicHub';
        buttonText.textContent = 'Create Account';
        usernameGroup.style.display = 'block';
        confirmPasswordGroup.style.display = 'block';
    }

    document.getElementById('authForm').reset();
    hideAuthError();
    modal.style.display = 'flex';
}

function hideAuthModal() {
    document.getElementById('authModal').style.display = 'none';
}

function switchAuthTab(mode) {
    showAuthModal(mode);
}

function showAuthError(message) {
    const errorDiv = document.getElementById('authError');
    errorDiv.textContent = message;
    errorDiv.style.display = 'block';
}

function hideAuthError() {
    document.getElementById('authError').style.display = 'none';
}

async function handleAuthSubmit(event) {
    event.preventDefault();

    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const username = document.getElementById('username').value;
    const confirmPassword = document.getElementById('confirmPassword').value;

    try {
        if (currentAuthMode === 'login') {
            await auth.signInWithEmailAndPassword(email, password);
            hideAuthModal();
        } else {
            if (password !== confirmPassword) {
                throw new Error('Passwords do not match');
            }
            if (!username.trim()) {
                throw new Error('Please choose a username');
            }

            const userCredential = await auth.createUserWithEmailAndPassword(email, password);

            await db.collection('users').doc(userCredential.user.uid).set({
                username: username.trim(),
                email: email,
                avatar: '',
                avatarColor: getRandomColor(),
                bio: '',
                role: 'member',
                joinDate: new Date().toISOString(),
                postCount: 0,
                topicCount: 0,
                reputation: 0,
                badges: ['new-member'],
                preferences: {
                    emailNotifications: true,
                    theme: 'light'
                },
                lastSeen: new Date().toISOString(),
                status: 'online'
            });

            hideAuthModal();
        }
    } catch (error) {
        console.error('Auth error:', error);
        showAuthError(getErrorMessage(error));
    }
}

window.addEventListener('click', (event) => {
    const authModal = document.getElementById('authModal');
    if (event.target === authModal) {
        hideAuthModal();
    }
});
