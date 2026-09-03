let currentUser = null;
let userData = null;

function initAuth() {
    // Listen for auth state changes
    auth.onAuthStateChanged(async (user) => {
        currentUser = user;
        
        if (user) {
            // User is signed in
            await loadUserData(user.uid);
            updateUIForLoggedInUser();
            showToast(`Welcome back, ${userData?.username || 'User'}!`, 'success');
            
            // Update user status to online
            await updateUserStatus('online');
            
            // Subscribe to user's notifications
            subscribeToNotifications(user.uid);
        } else {
            // User is signed out
            updateUIForLoggedOutUser();
        }
    });
}

async function loadUserData(userId) {
    try {
        const userDoc = await db.collection('users').doc(userId).get();
        if (userDoc.exists) {
            userData = userDoc.data();
        } else {
            // Create user profile if it doesn't exist
            userData = await createUserProfile(userId);
        }
    } catch (error) {
        console.error('Error loading user data:', error);
    }
}

async function createUserProfile(userId) {
    const user = auth.currentUser;
    const userProfile = {
        username: user.displayName || user.email.split('@')[0],
        email: user.email,
        avatar: user.photoURL || '',
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
    };
    
    await db.collection('users').doc(userId).set(userProfile);
    return userProfile;
}

async function updateUserStatus(status) {
    if (!currentUser) return;
    
    try {
        await db.collection('users').doc(currentUser.uid).update({
            status: status,
            lastSeen: new Date().toISOString()
        });
        
        // Also update in online_users collection for real-time presence
        if (status === 'online') {
            await db.collection('online_users').doc(currentUser.uid).set({
                userId: currentUser.uid,
                username: userData?.username,
                avatar: userData?.avatar,
                lastActive: new Date().toISOString()
            });
        } else {
            await db.collection('online_users').doc(currentUser.uid).delete();
        }
    } catch (error) {
        console.error('Error updating user status:', error);
    }
}

function updateUIForLoggedInUser() {
    const userSection = document.getElementById('userSection');
    if (!userSection) return;
    
    userSection.innerHTML = `
        <div style="display: flex; align-items: center; gap: 12px;">
            <a href="profile.html" style="display: flex; align-items: center; gap: 8px; text-decoration: none; color: var(--text);">
                <div style="width: 36px; height: 36px; border-radius: 50%; background: ${userData?.avatarColor || '#3b82f6'}; 
                     display: flex; align-items: center; justify-content: center; color: white; font-weight: 600;">
                    ${userData?.username?.charAt(0) || 'U'}
                </div>
                <span style="font-weight: 500;">${userData?.username}</span>
            </a>
            <button onclick="logout()" style="background: none; border: 1px solid var(--border); padding: 8px 12px; 
                    border-radius: 6px; color: var(--text-light); cursor: pointer; font-size: 14px;">
                Logout
            </button>
        </div>
    `;
}

function updateUIForLoggedOutUser() {
    const userSection = document.getElementById('userSection');
    if (!userSection) return;
    
    userSection.innerHTML = `
        <div style="display: flex; gap: 10px;">
            <button onclick="showAuthModal('login')" style="padding: 8px 16px; border: 1px solid var(--border); 
                    border-radius: 6px; background: none; color: var(--text); cursor: pointer;">
                Login
            </button>
            <button onclick="showAuthModal('register')" style="padding: 8px 16px; border-radius: 6px; 
                    background: var(--primary); color: white; border: none; cursor: pointer;">
                Sign Up
            </button>
        </div>
    `;
}

async function logout() {
    try {
        await updateUserStatus('offline');
        await auth.signOut();
        showToast('Logged out successfully', 'success');
    } catch (error) {
        console.error('Error logging out:', error);
        showToast('Error logging out', 'danger');
    }
}

// Add these to window for global access
window.auth = auth;
window.currentUser = () => currentUser;
window.userData = () => userData;
window.logout = logout;