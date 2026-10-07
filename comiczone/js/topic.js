let topicId = null;
let topicData = null;
let postsListener = null;
let uploadedFiles = [];

async function loadTopic() {
    // Get topic ID from URL
    const urlParams = new URLSearchParams(window.location.search);
    topicId = urlParams.get('id');
    
    if (!topicId) {
        window.location.href = 'index.html';
        return;
    }
    
    try {
        // Load topic data
        const topicDoc = await db.collection('topics').doc(topicId).get();
        if (!topicDoc.exists) {
            showToast('Topic not found', 'danger');
            window.location.href = 'index.html';
            return;
        }
        
        topicData = topicDoc.data();
        renderTopic();
        
        // Increment view count
        await incrementViewCount();
        
        // Load posts in real-time
        loadPosts();
        
    } catch (error) {
        console.error('Error loading topic:', error);
        showToast('Error loading topic', 'danger');
    }
}

function renderTopic() {
    const topicContent = document.getElementById('topicContent');
    
    topicContent.innerHTML = `
        <!-- Topic Header -->
        <div class="topic-header">
            <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px;">
                <div>
                    <h1 style="font-size: 28px; font-weight: 800; color: var(--secondary); margin-bottom: 10px;">
                        ${topicData.title}
                        ${topicData.isLocked ? '<span style="background: var(--danger); color: white; padding: 4px 10px; border-radius: 20px; font-size: 12px; margin-left: 10px;">Locked</span>' : ''}
                        ${topicData.isPinned ? '<span style="background: var(--success); color: white; padding: 4px 10px; border-radius: 20px; font-size: 12px; margin-left: 10px;">Pinned</span>' : ''}
                    </h1>
                    <div style="display: flex; gap: 15px; color: var(--text-light); font-size: 14px;">
                        <span>In <strong>${topicData.category}</strong></span>
                        <span>•</span>
                        <span>${topicData.viewCount || 0} views</span>
                        <span>•</span>
                        <span>${topicData.replyCount || 0} replies</span>
                    </div>
                </div>
                
                <div style="display: flex; gap: 10px;">
                    <button onclick="shareTopic()" style="padding: 8px 16px; border: 1px solid var(--border); 
                            border-radius: 6px; background: white; color: var(--text); cursor: pointer;">
                        <i class="fas fa-share"></i> Share
                    </button>
                    <button onclick="toggleSubscribe()" id="subscribeBtn" 
                            style="padding: 8px 16px; border: 1px solid var(--border); 
                            border-radius: 6px; background: white; color: var(--text); cursor: pointer;">
                        <i class="far fa-bell"></i> Subscribe
                    </button>
                </div>
            </div>
            
            <!-- Original Post -->
            <div id="originalPost"></div>
        </div>
        
        <!-- Replies -->
        <div id="postsContainer" style="margin-top: 30px;">
            <div style="text-align: center; padding: 30px;">
                <div class="loading"></div>
                <p style="margin-top: 10px; color: var(--text-light);">Loading replies...</p>
            </div>
        </div>
        
        <!-- Reply Form -->
        <div id="replyFormContainer"></div>
    `;
    
    // Load original post
    loadOriginalPost();
}

async function loadOriginalPost() {
    try {
        const postsSnapshot = await db.collection('posts')
            .where('topicId', '==', topicId)
            .where('isFirstPost', '==', true)
            .limit(1)
            .get();
        
        if (!postsSnapshot.empty) {
            const postDoc = postsSnapshot.docs[0];
            const post = postDoc.data();
            renderPost(postDoc.id, post, true);
        }
    } catch (error) {
        console.error('Error loading original post:', error);
    }
}

function loadPosts() {
    // Clean up existing listener
    if (postsListener) {
        postsListener();
    }
    
    // Listen for posts in real-time. Filtering on topicId alone avoids needing a
    // composite index; replies are picked out and sorted in the browser instead.
    postsListener = db.collection('posts')
        .where('topicId', '==', topicId)
        .onSnapshot((snapshot) => {
            const postsContainer = document.getElementById('postsContainer');
            postsContainer.innerHTML = '';
            
            const replies = snapshot.docs
                .filter(doc => !doc.data().isFirstPost)
                .sort((a, b) => String(a.data().createdAt).localeCompare(String(b.data().createdAt)));
            
            if (replies.length === 0) {
                postsContainer.innerHTML = `
                    <div style="text-align: center; padding: 40px; color: var(--text-light);">
                        <i class="fas fa-comment-slash" style="font-size: 48px; margin-bottom: 20px;"></i>
                        <h3 style="margin-bottom: 10px;">No replies yet</h3>
                        <p>Be the first to reply to this discussion!</p>
                    </div>
                `;
            } else {
                replies.forEach((doc) => {
                    renderPost(doc.id, doc.data(), false, postsContainer);
                });
            }
            
            // Update reply count
            updateReplyCount(replies.length);
            
            // Render reply form
            renderReplyForm();
        }, (error) => {
            console.error('Error loading replies:', error);
            document.getElementById('postsContainer').innerHTML = `
                <div style="text-align: center; padding: 40px; color: var(--text-light);">
                    <p>Couldn't load replies: ${error.message || error}</p>
                </div>
            `;
            renderReplyForm();
        });
}

function renderPost(postId, post, isOriginal = false, container = null) {
    const postElement = document.createElement('div');
    postElement.className = 'post';
    postElement.id = `post-${postId}`;
    
    if (isOriginal) {
        postElement.style.border = '2px solid var(--primary)';
        postElement.style.background = 'linear-gradient(to right, white, #f0f9ff)';
    }
    
    postElement.innerHTML = `
        <div class="post-header">
            <div class="user-avatar" style="background: ${post.authorAvatarColor || '#3b82f6'}">
                ${post.authorName?.charAt(0) || 'U'}
            </div>
            <div style="flex: 1;">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <div>
                        <a href="profile.html?id=${post.authorId}" 
                           style="font-weight: 600; color: var(--secondary); text-decoration: none;">
                            ${post.authorName}
                        </a>
                        ${isOriginal ? '<span style="background: var(--primary); color: white; padding: 2px 8px; border-radius: 12px; font-size: 11px; margin-left: 8px;">OP</span>' : ''}
                    </div>
                    <div style="color: var(--text-light); font-size: 14px;">
                        ${formatTimeAgo(post.createdAt)}
                        ${post.editedAt ? ' (edited)' : ''}
                    </div>
                </div>
                <div style="display: flex; gap: 10px; margin-top: 5px;">
                    <div style="font-size: 13px; color: var(--text-light);">
                        ${post.authorRole || 'Member'}
                    </div>
                </div>
            </div>
        </div>
        
        <div class="post-content">
            ${post.content}
        </div>
        
        ${post.attachments && post.attachments.length > 0 ? `
            <div class="upload-preview" style="margin-top: 20px;">
                ${post.attachments.map(attachment => attachment.type?.startsWith('image/') ? `
                    <div class="upload-item">
                        <img data-attachment-id="${attachment.id}" alt="${attachment.name}">
                    </div>
                ` : `
                    <a href="#" onclick="downloadAttachment(event, '${attachment.id}')"
                       style="display: inline-flex; align-items: center; gap: 8px; padding: 10px 14px; 
                              border: 1px solid var(--border); border-radius: 8px; color: var(--text); text-decoration: none;">
                        <i class="fas fa-file-download"></i> ${attachment.name}
                    </a>
                `).join('')}
            </div>
        ` : ''}
        
        <div class="post-actions">
            <button onclick="likePost('${postId}')" 
                    style="background: none; border: none; color: var(--text-light); cursor: pointer; 
                           display: flex; align-items: center; gap: 5px;">
                <i class="far fa-heart"></i>
                <span id="likeCount-${postId}">${post.likes || 0}</span>
            </button>
            
            <button onclick="quotePost('${postId}', '${post.authorName}')" 
                    style="background: none; border: none; color: var(--text-light); cursor: pointer; 
                           display: flex; align-items: center; gap: 5px;">
                <i class="fas fa-quote-right"></i> Quote
            </button>
            
            <button onclick="replyToPost('${postId}', '${post.authorName}')" 
                    style="background: none; border: none; color: var(--text-light); cursor: pointer; 
                           display: flex; align-items: center; gap: 5px;">
                <i class="fas fa-reply"></i> Reply
            </button>
            
            ${currentUser && (currentUser.uid === post.authorId || userData?.role === 'admin' || userData?.role === 'moderator') ? `
                <button onclick="editPost('${postId}')" 
                        style="background: none; border: none; color: var(--text-light); cursor: pointer; 
                               display: flex; align-items: center; gap: 5px;">
                    <i class="fas fa-edit"></i> Edit
                </button>
            ` : ''}
            
            ${currentUser && (userData?.role === 'admin' || userData?.role === 'moderator') ? `
                <button onclick="deletePost('${postId}')" 
                        style="background: none; border: none; color: var(--danger); cursor: pointer; 
                               display: flex; align-items: center; gap: 5px; margin-left: auto;">
                    <i class="fas fa-trash"></i> Delete
                </button>
            ` : ''}
        </div>
    `;
    
    if (container) {
        container.appendChild(postElement);
        loadAttachmentImages(postElement);
    } else {
        const originalPost = document.getElementById('originalPost');
        originalPost.innerHTML = postElement.outerHTML;
        loadAttachmentImages(originalPost);
    }
}

// Attachment file contents live in the attachments collection; fill in image sources after render
function loadAttachmentImages(element) {
    element.querySelectorAll('img[data-attachment-id]').forEach(async (img) => {
        try {
            const doc = await db.collection('attachments').doc(img.dataset.attachmentId).get();
            if (doc.exists) img.src = doc.data().data;
        } catch (error) {
            console.error('Error loading attachment:', error);
        }
    });
}

async function downloadAttachment(event, attachmentId) {
    event.preventDefault();
    try {
        const doc = await db.collection('attachments').doc(attachmentId).get();
        if (!doc.exists) {
            showToast('Attachment not found', 'danger');
            return;
        }
        
        const { name, data } = doc.data();
        const blob = await (await fetch(data)).blob();
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = name;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
    } catch (error) {
        console.error('Error downloading attachment:', error);
        showToast('Error downloading attachment', 'danger');
    }
}

function renderReplyForm() {
    const replyFormContainer = document.getElementById('replyFormContainer');
    if (!replyFormContainer) return;
    
    // Check if topic is locked
    if (topicData.isLocked && userData?.role !== 'admin' && userData?.role !== 'moderator') {
        replyFormContainer.innerHTML = `
            <div class="reply-form" style="text-align: center; color: var(--text-light);">
                <i class="fas fa-lock" style="font-size: 48px; margin-bottom: 20px;"></i>
                <h3>This topic is locked</h3>
                <p>New replies cannot be posted.</p>
            </div>
        `;
        return;
    }
    
    // Check if user is logged in
    if (!currentUser) {
        replyFormContainer.innerHTML = `
            <div class="reply-form" style="text-align: center;">
                <h3 style="margin-bottom: 15px;">Join the discussion</h3>
                <p style="color: var(--text-light); margin-bottom: 20px;">
                    Sign in to reply to this topic
                </p>
                <button onclick="showAuthModal('login')" 
                        style="padding: 12px 24px; background: var(--primary); color: white; 
                               border: none; border-radius: 8px; cursor: pointer; font-weight: 600;">
                    Sign In to Reply
                </button>
            </div>
        `;
        return;
    }
    
    replyFormContainer.innerHTML = `
        <div class="reply-form">
            <h3 style="margin-bottom: 20px;">Post a reply</h3>
            
            <div class="editor-toolbar">
                <button type="button" onclick="formatText('bold')"><i class="fas fa-bold"></i></button>
                <button type="button" onclick="formatText('italic')"><i class="fas fa-italic"></i></button>
                <button type="button" onclick="formatText('underline')"><i class="fas fa-underline"></i></button>
                <button type="button" onclick="insertLink()"><i class="fas fa-link"></i></button>
                <button type="button" onclick="insertImage()"><i class="fas fa-image"></i></button>
                <button type="button" onclick="insertCode()"><i class="fas fa-code"></i></button>
                <button type="button" onclick="insertQuote()"><i class="fas fa-quote-right"></i></button>
                
                <label style="margin-left: auto; cursor: pointer; padding: 8px 12px; border: 1px solid var(--border); 
                       border-radius: 6px; background: white; color: var(--text);">
                    <i class="fas fa-paperclip"></i> Attach Files
                    <input type="file" multiple accept="image/*,.pdf,.doc,.docx,.cbl" 
                           onchange="handleFileUpload(event)" style="display: none;">
                </label>
            </div>
            
            <div id="replyEditor" contenteditable="true" placeholder="Type your reply here..."></div>
            
            <div class="upload-preview" id="uploadPreview"></div>
            
            <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 20px;">
                <div style="font-size: 14px; color: var(--text-light);">
                    <i class="fas fa-info-circle"></i> Markdown is supported
                </div>
                <div style="display: flex; gap: 10px;">
                    <button onclick="previewReply()" 
                            style="padding: 10px 20px; border: 1px solid var(--border); background: white; 
                                   border-radius: 6px; color: var(--text); cursor: pointer;">
                        Preview
                    </button>
                    <button onclick="submitReply()" 
                            style="padding: 10px 20px; background: var(--primary); color: white; 
                                   border: none; border-radius: 6px; cursor: pointer; font-weight: 600;">
                        Post Reply
                    </button>
                </div>
            </div>
        </div>
    `;
}

async function submitReply() {
    const editor = document.getElementById('replyEditor');
    const content = editor.innerHTML.trim();
    
    if (!content) {
        showToast('Please enter a reply', 'warning');
        return;
    }
    
    try {
        // Upload files first
        const attachments = [];
        for (const file of uploadedFiles) {
            const attachment = await uploadFile(file);
            if (attachment) {
                attachments.push(attachment);
            }
        }
        
        // Create post
        const postData = {
            topicId: topicId,
            content: content,
            authorId: currentUser.uid,
            authorName: userData.username,
            authorAvatarColor: userData.avatarColor,
            authorRole: userData.role,
            isFirstPost: false,
            createdAt: new Date().toISOString(),
            likes: 0,
            attachments: attachments
        };
        
        await db.collection('posts').add(postData);
        
        // Update topic's last reply timestamp and reply count
        await db.collection('topics').doc(topicId).update({
            lastReplyAt: new Date().toISOString(),
            replyCount: firebase.firestore.FieldValue.increment(1)
        });
        
        // Update user's post count
        await db.collection('users').doc(currentUser.uid).update({
            postCount: firebase.firestore.FieldValue.increment(1)
        });
        
        // Create notification for topic author (if not the same user)
        if (topicData.authorId !== currentUser.uid) {
            await createNotification({
                userId: topicData.authorId,
                type: 'topic_reply',
                senderId: currentUser.uid,
                senderName: userData.username,
                senderAvatarColor: userData.avatarColor,
                topicId: topicId,
                topicTitle: topicData.title,
                message: `replied to your topic "${topicData.title}"`
            });
        }
        
        // Clear editor and uploaded files
        editor.innerHTML = '';
        uploadedFiles = [];
        document.getElementById('uploadPreview').innerHTML = '';
        
        showToast('Reply posted successfully', 'success');
        
        // Scroll to the new post
        setTimeout(() => {
            window.scrollTo(0, document.body.scrollHeight);
        }, 500);
        
    } catch (error) {
        console.error('Error posting reply:', error);
        showToast('Error posting reply', 'danger');
    }
}

// Attachments are stored in Firestore (one doc per file) instead of Firebase Storage.
// A Firestore doc maxes out at 1 MiB and base64 adds ~33%, so files must stay under ~700 KB.
const MAX_ATTACHMENT_BYTES = 700 * 1024;

function readAsDataURL(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(blob);
    });
}

async function uploadFile(file) {
    try {
        showToast(`Uploading ${file.name}...`, 'info');
        
        // Shrink photos so they fit; GIFs are left alone so animations survive
        let blob = file;
        if (file.type.startsWith('image/') && file.type !== 'image/gif') {
            blob = await uploadImage(file);
        }
        
        if (blob.size > MAX_ATTACHMENT_BYTES) {
            showToast(`${file.name} is too large (max 700 KB)`, 'warning');
            return null;
        }
        
        const type = blob.type || file.type || 'application/octet-stream';
        const docRef = await db.collection('attachments').add({
            name: file.name,
            type: type,
            size: blob.size,
            data: await readAsDataURL(blob),
            topicId: topicId,
            authorId: currentUser.uid,
            createdAt: new Date().toISOString()
        });
        
        return {
            id: docRef.id,
            name: file.name,
            type: type,
            size: blob.size
        };
    } catch (error) {
        console.error('Error uploading file:', error);
        showToast(`Error uploading ${file.name}: ${error.message || error}`, 'danger');
        return null;
    }
}

function handleFileUpload(event) {
    const files = Array.from(event.target.files);
    const preview = document.getElementById('uploadPreview');
    
    files.forEach(file => {
        if (uploadedFiles.length >= 5) {
            showToast('Maximum 5 files allowed', 'warning');
            return;
        }
        
        if (!file.type.startsWith('image/') && file.size > MAX_ATTACHMENT_BYTES) {
            showToast(`${file.name} is too large (max 700 KB)`, 'warning');
            return;
        }
        
        uploadedFiles.push(file);
        appendUploadPreview(preview, file);
    });
    
    event.target.value = '';
}

function appendUploadPreview(preview, file) {
    const previewItem = document.createElement('div');
    previewItem.className = 'upload-item';
    const removeButton = `
        <button class="remove-upload" onclick="removeUpload('${file.name}')">
            <i class="fas fa-times"></i>
        </button>
    `;
    
    if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = (e) => {
            previewItem.innerHTML = `<img src="${e.target.result}" alt="${file.name}">${removeButton}`;
        };
        reader.readAsDataURL(file);
    } else {
        previewItem.innerHTML = `
            <div style="width: 100px; height: 100px; background: var(--light-bg); border-radius: 8px; 
                 display: flex; flex-direction: column; align-items: center; justify-content: center;">
                <i class="fas fa-file" style="font-size: 24px; color: var(--text-light); margin-bottom: 8px;"></i>
                <div style="font-size: 11px; color: var(--text); text-align: center; padding: 0 5px;">
                    ${file.name}
                </div>
            </div>
            ${removeButton}
        `;
    }
    
    preview.appendChild(previewItem);
}

function removeUpload(fileName) {
    uploadedFiles = uploadedFiles.filter(file => file.name !== fileName);
    renderUploadPreview();
}

function renderUploadPreview() {
    const preview = document.getElementById('uploadPreview');
    preview.innerHTML = '';
    uploadedFiles.forEach(file => appendUploadPreview(preview, file));
}

async function incrementViewCount() {
    try {
        await db.collection('topics').doc(topicId).update({
            viewCount: firebase.firestore.FieldValue.increment(1)
        });
    } catch (error) {
        console.error('Error incrementing view count:', error);
    }
}

async function likePost(postId) {
    if (!currentUser) {
        showAuthModal('login');
        return;
    }
    
    try {
        const likeRef = db.collection('likes').doc(`${postId}_${currentUser.uid}`);
        const likeDoc = await likeRef.get();
        
        if (likeDoc.exists) {
            // Unlike
            await likeRef.delete();
            await db.collection('posts').doc(postId).update({
                likes: firebase.firestore.FieldValue.increment(-1)
            });
            showToast('Post unliked', 'info');
        } else {
            // Like
            await likeRef.set({
                userId: currentUser.uid,
                postId: postId,
                createdAt: new Date().toISOString()
            });
            await db.collection('posts').doc(postId).update({
                likes: firebase.firestore.FieldValue.increment(1)
            });
            showToast('Post liked', 'success');
            
            // Create notification for post author
            const postDoc = await db.collection('posts').doc(postId).get();
            const post = postDoc.data();
            
            if (post.authorId !== currentUser.uid) {
                await createNotification({
                    userId: post.authorId,
                    type: 'like',
                    senderId: currentUser.uid,
                    senderName: userData.username,
                    senderAvatarColor: userData.avatarColor,
                    postId: postId,
                    topicId: post.topicId,
                    message: `liked your post`
                });
            }
        }
        
        // Update like count display
        const likeCountElement = document.getElementById(`likeCount-${postId}`);
        if (likeCountElement) {
            const currentLikes = parseInt(likeCountElement.textContent) || 0;
            likeCountElement.textContent = likeDoc.exists ? currentLikes - 1 : currentLikes + 1;
        }
        
    } catch (error) {
        console.error('Error liking post:', error);
        showToast('Error liking post', 'danger');
    }
}

async function toggleSubscribe() {
    if (!currentUser) {
        showAuthModal('login');
        return;
    }
    
    try {
        const subscriptionRef = db.collection('subscriptions').doc(`${topicId}_${currentUser.uid}`);
        const subscriptionDoc = await subscriptionRef.get();
        
        const button = document.getElementById('subscribeBtn');
        
        if (subscriptionDoc.exists) {
            // Unsubscribe
            await subscriptionRef.delete();
            button.innerHTML = '<i class="far fa-bell"></i> Subscribe';
            showToast('Unsubscribed from topic', 'info');
        } else {
            // Subscribe
            await subscriptionRef.set({
                userId: currentUser.uid,
                topicId: topicId,
                subscribedAt: new Date().toISOString()
            });
            button.innerHTML = '<i class="fas fa-bell"></i> Subscribed';
            showToast('Subscribed to topic', 'success');
        }
    } catch (error) {
        console.error('Error toggling subscription:', error);
        showToast('Error updating subscription', 'danger');
    }
}

function shareTopic() {
    const url = window.location.href;
    const title = topicData.title;
    
    if (navigator.share) {
        navigator.share({
            title: title,
            text: `Check out this topic on ComicHub: ${title}`,
            url: url
        });
    } else {
        // Fallback: copy to clipboard
        navigator.clipboard.writeText(url).then(() => {
            showToast('Link copied to clipboard', 'success');
        });
    }
}

function formatText(command) {
    document.execCommand(command, false, null);
}

function insertLink() {
    const url = prompt('Enter URL:');
    if (url) {
        document.execCommand('createLink', false, url);
    }
}

function insertImage() {
    const url = prompt('Enter image URL:');
    if (url) {
        const editor = document.getElementById('replyEditor');
        const img = `<img src="${url}" alt="Image" style="max-width: 100%;">`;
        editor.innerHTML += img;
    }
}

function insertCode() {
    const code = prompt('Enter code:');
    if (code) {
        const editor = document.getElementById('replyEditor');
        editor.innerHTML += `<pre><code>${code}</code></pre>`;
    }
}

function insertQuote() {
    const quote = prompt('Enter quote:');
    if (quote) {
        const editor = document.getElementById('replyEditor');
        editor.innerHTML += `<blockquote>${quote}</blockquote>`;
    }
}

function quotePost(postId, authorName) {
    const postContent = document.querySelector(`#post-${postId} .post-content`).textContent;
    const editor = document.getElementById('replyEditor');
    
    const quoteText = `> **${authorName} wrote:**\n> ${postContent}\n\n`;
    editor.innerHTML += quoteText;
    editor.focus();
}

function replyToPost(postId, authorName) {
    const editor = document.getElementById('replyEditor');
    editor.innerHTML += `@${authorName} `;
    editor.focus();
}

function previewReply() {
    const editor = document.getElementById('replyEditor');
    const content = editor.innerHTML;
    
    // Show preview in a modal
    alert('Preview:\n\n' + content);
}

function updateReplyCount(count) {
    const replyCountElement = document.querySelector('.topic-header span:nth-child(5)');
    if (replyCountElement) {
        replyCountElement.textContent = `${count} replies`;
    }
}

// Clean up listeners when leaving page
window.addEventListener('beforeunload', () => {
    if (postsListener) {
        postsListener();
    }
});

window.loadTopic = loadTopic;
window.handleFileUpload = handleFileUpload;
window.removeUpload = removeUpload;
window.submitReply = submitReply;
window.likePost = likePost;
window.toggleSubscribe = toggleSubscribe;
window.shareTopic = shareTopic;
window.formatText = formatText;
window.insertLink = insertLink;
window.insertImage = insertImage;
window.insertCode = insertCode;
window.insertQuote = insertQuote;
window.quotePost = quotePost;
window.replyToPost = replyToPost;
window.previewReply = previewReply;
window.downloadAttachment = downloadAttachment;

async function uploadImage(file) {
    // Compress image before upload
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        
        reader.onload = (event) => {
            const img = new Image();
            img.src = event.target.result;
            
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                
                // Calculate new dimensions
                let width = img.width;
                let height = img.height;
                const maxSize = 1200;
                
                if (width > height && width > maxSize) {
                    height *= maxSize / width;
                    width = maxSize;
                } else if (height > maxSize) {
                    width *= maxSize / height;
                    height = maxSize;
                }
                
                canvas.width = width;
                canvas.height = height;
                
                // Draw and compress
                ctx.drawImage(img, 0, 0, width, height);
                canvas.toBlob((blob) => {
                    resolve(blob);
                }, 'image/jpeg', 0.8);
            };
        };
    });
}

let typingTimeout;
let isTyping = false;

function setupTypingIndicator() {
    const editor = document.getElementById('replyEditor');
    editor.addEventListener('input', () => {
        if (!isTyping) {
            isTyping = true;
            db.collection('typing_indicators').doc(topicId).set({
                [currentUser.uid]: userData.username,
                lastTyped: new Date().toISOString()
            });
        }
        
        clearTimeout(typingTimeout);
        typingTimeout = setTimeout(() => {
            isTyping = false;
            db.collection('typing_indicators').doc(topicId).update({
                [currentUser.uid]: firebase.firestore.FieldValue.delete()
            });
        }, 1000);
    });
}