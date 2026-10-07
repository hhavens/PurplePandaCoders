let notificationsListener = null;

async function subscribeToNotifications(userId) {
    // Clean up existing listener
    if (notificationsListener) {
        notificationsListener();
    }
    
    // Listen for new notifications
    notificationsListener = db.collection('notifications')
        .where('userId', '==', userId)
        .where('read', '==', false)
        .orderBy('createdAt', 'desc')
        .limit(20)
        .onSnapshot((snapshot) => {
            updateNotificationBadge(snapshot.size);
            renderNotifications(snapshot);
        });
}

function updateNotificationBadge(count) {
    const badge = document.getElementById('notificationBadge');
    if (badge) {
        if (count > 0) {
            badge.textContent = count > 99 ? '99+' : count;
            badge.style.display = 'flex';
        } else {
            badge.style.display = 'none';
        }
    }
}

function renderNotifications(snapshot) {
    const notificationList = document.getElementById('notificationList');
    if (!notificationList) return;
    
    notificationList.innerHTML = '';
    
    if (snapshot.empty) {
        notificationList.innerHTML = `
            <div style="padding: 30px; text-align: center; color: var(--text-light);">
                <i class="fas fa-bell-slash" style="font-size: 24px; margin-bottom: 10px;"></i>
                <div>No new notifications</div>
            </div>
        `;
        return;
    }
    
    snapshot.forEach((doc) => {
        const notification = doc.data();
        const notificationElement = document.createElement('div');
        notificationElement.className = `notification-item ${notification.read ? '' : 'unread'}`;
        notificationElement.innerHTML = `
            <div style="display: flex; align-items: flex-start; gap: 10px;">
                <div style="width: 32px; height: 32px; border-radius: 50%; background: ${notification.senderAvatarColor || '#3b82f6'}; 
                     display: flex; align-items: center; justify-content: center; color: white; font-weight: 600; flex-shrink: 0;">
                    ${notification.senderName?.charAt(0) || 'U'}
                </div>
                <div style="flex: 1;">
                    <div style="font-size: 14px;">
                        <strong>${notification.senderName}</strong> ${getNotificationText(notification.type)}
                        ${notification.topicTitle ? `<div style="color: var(--primary); font-weight: 500; margin-top: 2px;">${notification.topicTitle}</div>` : ''}
                    </div>
                    <div style="font-size: 12px; color: var(--text-light); margin-top: 4px;">
                        ${formatTimeAgo(notification.createdAt)}
                    </div>
                </div>
                <button onclick="markNotificationAsRead('${doc.id}')" style="background: none; border: none; color: var(--text-light); cursor: pointer; padding: 4px;">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        `;
        
        // Add click handler to view the notification
        notificationElement.addEventListener('click', () => {
            handleNotificationClick(notification);
            markNotificationAsRead(doc.id);
        });
        
        notificationList.appendChild(notificationElement);
    });
}

function getNotificationText(type) {
    const texts = {
        'reply': 'replied to your post',
        'mention': 'mentioned you in a post',
        'like': 'liked your post',
        'follow': 'started following you',
        'topic_reply': 'replied to your topic',
        'admin': 'sent you an admin message',
        'system': 'sent a system notification'
    };
    return texts[type] || 'sent you a notification';
}

async function markNotificationAsRead(notificationId) {
    try {
        await db.collection('notifications').doc(notificationId).update({
            read: true,
            readAt: new Date().toISOString()
        });
    } catch (error) {
        console.error('Error marking notification as read:', error);
    }
}

async function markAllAsRead() {
    try {
        const userId = auth.currentUser?.uid;
        if (!userId) return;
        
        const snapshot = await db.collection('notifications')
            .where('userId', '==', userId)
            .where('read', '==', false)
            .get();
        
        const batch = db.batch();
        snapshot.docs.forEach(doc => {
            batch.update(doc.ref, {
                read: true,
                readAt: new Date().toISOString()
            });
        });
        
        await batch.commit();
        showToast('All notifications marked as read', 'success');
    } catch (error) {
        console.error('Error marking all as read:', error);
        showToast('Error marking notifications', 'danger');
    }
}

function handleNotificationClick(notification) {
    switch (notification.type) {
        case 'reply':
        case 'mention':
        case 'topic_reply':
            // Navigate to the topic
            window.location.href = `topic.html?id=${notification.topicId}#post-${notification.postId}`;
            break;
        case 'follow':
            // Navigate to user profile
            window.location.href = `profile.html?id=${notification.senderId}`;
            break;
        default:
            // Default action
            break;
    }
}

// Create notification function (for other modules to use)
async function createNotification(data) {
    try {
        await db.collection('notifications').add({
            ...data,
            read: false,
            createdAt: new Date().toISOString()
        });
    } catch (error) {
        console.error('Error creating notification:', error);
    }
}

window.subscribeToNotifications = subscribeToNotifications;
window.markAllAsRead = markAllAsRead;
window.createNotification = createNotification;