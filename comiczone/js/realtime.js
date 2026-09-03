let realtimeListeners = [];
let activityFeedActive = true;

function initRealtimeListeners() {
    // Listen for new topics in real-time
    const topicsListener = db.collection('topics')
        .orderBy('createdAt', 'desc')
        .limit(10)
        .onSnapshot((snapshot) => {
            snapshot.docChanges().forEach((change) => {
                if (change.type === 'added') {
                    const topic = change.doc.data();
                    addToActivityFeed({
                        type: 'new_topic',
                        userId: topic.authorId,
                        username: topic.authorName,
                        title: topic.title,
                        topicId: change.doc.id,
                        timestamp: new Date().toISOString()
                    });
                    
                    showToast(`New topic: "${topic.title}"`, 'info');
                }
            });
        });
    
    realtimeListeners.push(topicsListener);
    
    // Listen for new posts/replies
    const postsListener = db.collection('posts')
        .where('isFirstPost', '==', false)
        .orderBy('createdAt', 'desc')
        .limit(10)
        .onSnapshot((snapshot) => {
            snapshot.docChanges().forEach((change) => {
                if (change.type === 'added') {
                    const post = change.doc.data();
                    addToActivityFeed({
                        type: 'new_reply',
                        userId: post.authorId,
                        username: post.authorName,
                        topicId: post.topicId,
                        timestamp: new Date().toISOString()
                    });
                }
            });
        });
    
    realtimeListeners.push(postsListener);
    
    // Listen for online users
    const onlineUsersListener = db.collection('online_users')
        .onSnapshot((snapshot) => {
            updateOnlineUsers(snapshot);
        });
    
    realtimeListeners.push(onlineUsersListener);
    
    // Listen for user status changes
    const usersListener = db.collection('users')
        .where('status', '==', 'online')
        .onSnapshot((snapshot) => {
            updateUserStatusDisplay(snapshot);
        });
    
    realtimeListeners.push(usersListener);
}

function updateOnlineUsers(snapshot) {
    const onlineCount = snapshot.size;
    const onlineUsersList = document.getElementById('onlineUsersList');
    const onlineCountElement = document.getElementById('onlineCount');
    
    if (onlineCountElement) {
        onlineCountElement.textContent = onlineCount;
    }
    
    if (onlineUsersList) {
        onlineUsersList.innerHTML = '';
        
        snapshot.forEach((doc) => {
            const user = doc.data();
            const userElement = document.createElement('div');
            userElement.className = 'online-user';
            userElement.innerHTML = `
                <div class="user-status"></div>
                <div style="width: 32px; height: 32px; border-radius: 50%; background: ${user.avatarColor || '#3b82f6'}; 
                     display: flex; align-items: center; justify-content: center; color: white; font-weight: 600;">
                    ${user.username?.charAt(0) || 'U'}
                </div>
                <div>
                    <div style="font-weight: 500; font-size: 14px;">${user.username}</div>
                    <div style="font-size: 12px; color: var(--text-light);">Active now</div>
                </div>
            `;
            onlineUsersList.appendChild(userElement);
        });
    }
}

function addToActivityFeed(activity) {
    if (!activityFeedActive) return;
    
    const activityFeed = document.getElementById('activityFeed');
    if (!activityFeed) return;
    
    const activityElement = document.createElement('div');
    activityElement.className = 'activity-item';
    
    const icon = activity.type === 'new_topic' ? 'fa-comment-alt' : 'fa-reply';
    const text = activity.type === 'new_topic' 
        ? ` started a new topic: "${activity.title}"` 
        : ' replied to a topic';
    
    activityElement.innerHTML = `
        <div class="activity-icon">
            <i class="fas ${icon}"></i>
        </div>
        <div>
            <div style="font-weight: 500;">
                <a href="#" style="color: var(--primary); text-decoration: none;">${activity.username}</a>
                ${text}
            </div>
            <div style="font-size: 12px; color: var(--text-light); margin-top: 4px;">
                ${formatTimeAgo(activity.timestamp)}
            </div>
        </div>
    `;
    
    // Add to top of feed
    activityFeed.insertBefore(activityElement, activityFeed.firstChild);
    
    // Limit feed to 10 items
    if (activityFeed.children.length > 10) {
        activityFeed.removeChild(activityFeed.lastChild);
    }
}

function formatTimeAgo(timestamp) {
    const now = new Date();
    const date = new Date(timestamp);
    const seconds = Math.floor((now - date) / 1000);
    
    if (seconds < 60) return 'Just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
}

function toggleActivityFeed() {
    activityFeedActive = !activityFeedActive;
    const button = document.querySelector('[onclick="toggleActivityFeed()"]');
    if (button) {
        button.textContent = activityFeedActive ? 'Pause' : 'Resume';
    }
}

// Clean up listeners when leaving page
window.addEventListener('beforeunload', () => {
    realtimeListeners.forEach(unsubscribe => unsubscribe());
    
    // Update user status to offline
    if (currentUser) {
        updateUserStatus('offline');
    }
});

window.initRealtimeListeners = initRealtimeListeners;