let viewerUser = null;

function waitForAuthUser() {
    return new Promise(resolve => {
        const unsubscribe = auth.onAuthStateChanged(user => {
            unsubscribe();
            resolve(user);
        });
    });
}

async function loadProfile() {
    viewerUser = await waitForAuthUser();

    const urlParams = new URLSearchParams(window.location.search);
    const requestedId = urlParams.get('id');
    const profileUserId = requestedId || (viewerUser ? viewerUser.uid : null);

    if (!profileUserId) {
        renderSignedOutMessage();
        return;
    }

    try {
        const userDoc = await db.collection('users').doc(profileUserId).get();
        if (!userDoc.exists) {
            renderNotFound();
            return;
        }

        const profile = userDoc.data();
        const isOwnProfile = !!viewerUser && viewerUser.uid === profileUserId;
        renderProfile(profileUserId, profile, isOwnProfile);
        loadUserTopics(profileUserId);
    } catch (error) {
        console.error('Error loading profile:', error);
        showToast('Error loading profile', 'danger');
    }
}

function renderProfile(userId, profile, isOwnProfile) {
    const container = document.getElementById('profileContent');
    const joinDate = profile.joinDate
        ? new Date(profile.joinDate).toLocaleDateString(undefined, { year: 'numeric', month: 'long' })
        : 'Unknown';

    container.innerHTML = `
        <div class="profile-card">
            <div class="profile-header">
                <div class="profile-avatar" style="background: ${profile.avatarColor || '#3b82f6'}">
                    ${(profile.username || 'U').charAt(0).toUpperCase()}
                </div>
                <div>
                    <div class="profile-username">${profile.username || 'Unknown user'}</div>
                    <span class="profile-role">${profile.role || 'member'}</span>
                </div>
                ${isOwnProfile ? `
                    <button class="btn btn-outline" style="margin-left: auto;" onclick="toggleEditProfile()">
                        <i class="fas fa-pen"></i> Edit Profile
                    </button>
                ` : ''}
            </div>

            <div class="profile-stats">
                <div class="stat">
                    <div class="stat-value">${profile.topicCount || 0}</div>
                    <div class="stat-label">Topics</div>
                </div>
                <div class="stat">
                    <div class="stat-value">${profile.postCount || 0}</div>
                    <div class="stat-label">Replies</div>
                </div>
                <div class="stat">
                    <div class="stat-value">${profile.reputation || 0}</div>
                    <div class="stat-label">Reputation</div>
                </div>
                <div class="stat">
                    <div class="stat-value">${joinDate}</div>
                    <div class="stat-label">Joined</div>
                </div>
            </div>

            <div id="profileBioView">
                <p class="profile-bio">${profile.bio ? profile.bio : "This user hasn't written a bio yet."}</p>
            </div>

            <div id="profileBioEdit" style="display: none;">
                <div class="form-group">
                    <label class="form-label">Username</label>
                    <input type="text" class="form-input" id="editUsername" value="${profile.username || ''}">
                </div>
                <div class="form-group">
                    <label class="form-label">Bio</label>
                    <textarea class="form-input" id="editBio" rows="3" style="resize: vertical;">${profile.bio || ''}</textarea>
                </div>
                <div style="display: flex; gap: 10px;">
                    <button class="btn btn-primary" onclick="saveProfile('${userId}')">Save</button>
                    <button class="btn btn-outline" onclick="toggleEditProfile()">Cancel</button>
                </div>
            </div>
        </div>

        <div class="profile-card">
            <h3 style="margin-bottom: 10px; color: var(--secondary);">Recent Topics</h3>
            <div id="userTopicsList">
                <p style="color: var(--text-light);">Loading...</p>
            </div>
        </div>
    `;
}

function toggleEditProfile() {
    const view = document.getElementById('profileBioView');
    const edit = document.getElementById('profileBioEdit');
    const showEdit = edit.style.display === 'none';
    view.style.display = showEdit ? 'none' : 'block';
    edit.style.display = showEdit ? 'block' : 'none';
}

async function saveProfile(userId) {
    const username = document.getElementById('editUsername').value.trim();
    const bio = document.getElementById('editBio').value.trim();

    if (!username) {
        showToast('Username cannot be empty', 'warning');
        return;
    }

    try {
        await db.collection('users').doc(userId).update({ username, bio });
        showToast('Profile updated', 'success');
        loadProfile();
    } catch (error) {
        console.error('Error saving profile:', error);
        showToast('Error saving profile', 'danger');
    }
}

async function loadUserTopics(userId) {
    const list = document.getElementById('userTopicsList');

    try {
        const snapshot = await db.collection('topics')
            .where('authorId', '==', userId)
            .orderBy('createdAt', 'desc')
            .limit(10)
            .get();

        if (snapshot.empty) {
            list.innerHTML = `<p style="color: var(--text-light);">No topics started yet.</p>`;
            return;
        }

        list.innerHTML = '';
        snapshot.forEach(doc => {
            const topic = doc.data();
            const link = document.createElement('a');
            link.href = `topic.html?id=${doc.id}`;
            link.className = 'topic-list-item';
            link.innerHTML = `
                <div class="topic-list-title">${topic.title}</div>
                <div class="topic-list-meta">${topic.category} &middot; ${topic.replyCount || 0} replies</div>
            `;
            list.appendChild(link);
        });
    } catch (error) {
        console.error('Error loading user topics:', error);
        list.innerHTML = `<p style="color: var(--text-light);">Couldn't load topics.</p>`;
    }
}

function renderSignedOutMessage() {
    document.getElementById('profileContent').innerHTML = `
        <div class="profile-card" style="text-align: center;">
            <p style="margin-bottom: 15px; color: var(--text-light);">Sign in to view your profile.</p>
            <button class="btn btn-primary" onclick="showAuthModal('login')">Sign In</button>
        </div>
    `;
}

function renderNotFound() {
    document.getElementById('profileContent').innerHTML = `
        <div class="profile-card" style="text-align: center;">
            <p style="color: var(--text-light);">This user couldn't be found.</p>
        </div>
    `;
}
