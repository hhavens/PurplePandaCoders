const functions = require('firebase-functions');
const admin = require('firebase-admin');
const nodemailer = require('nodemailer');
const algoliasearch = require('algoliasearch');

// Initialize Firebase Admin
admin.initializeApp();

// Initialize Algolia
const algoliaClient = algoliasearch(
  functions.config().algolia.appid,
  functions.config().algolia.apikey
);
const topicsIndex = algoliaClient.initIndex('forum_topics');
const usersIndex = algoliaClient.initIndex('forum_users');

// Email transporter
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: functions.config().gmail.user,
    pass: functions.config().gmail.pass
  }
});

// ============ ALGOLIA SYNC FUNCTIONS ============

// Sync topics to Algolia
exports.syncTopicToAlgolia = functions.firestore
  .document('topics/{topicId}')
  .onWrite(async (change, context) => {
    const topicId = context.params.topicId;
    const topic = change.after.exists ? change.after.data() : null;
    
    if (!topic) {
      // Topic was deleted
      await topicsIndex.deleteObject(topicId);
      return;
    }
    
    // Add object to Algolia
    const record = {
      objectID: topicId,
      title: topic.title,
      content: topic.content || '',
      category: topic.category,
      authorName: topic.authorName,
      authorId: topic.authorId,
      replyCount: topic.replyCount || 0,
      viewCount: topic.viewCount || 0,
      createdAt: topic.createdAt,
      lastReplyAt: topic.lastReplyAt,
      isPinned: topic.isPinned || false,
      isLocked: topic.isLocked || false,
      tags: topic.tags || []
    };
    
    await topicsIndex.saveObject(record);
  });

// Sync users to Algolia
exports.syncUserToAlgolia = functions.firestore
  .document('users/{userId}')
  .onWrite(async (change, context) => {
    const userId = context.params.userId;
    const user = change.after.exists ? change.after.data() : null;
    
    if (!user) {
      // User was deleted
      await usersIndex.deleteObject(userId);
      return;
    }
    
    // Add object to Algolia
    const record = {
      objectID: userId,
      username: user.username,
      email: user.email,
      bio: user.bio || '',
      role: user.role,
      postCount: user.postCount || 0,
      topicCount: user.topicCount || 0,
      reputation: user.reputation || 0,
      badges: user.badges || [],
      joinDate: user.joinDate,
      avatarColor: user.avatarColor
    };
    
    await usersIndex.saveObject(record);
  });

// ============ EMAIL NOTIFICATION FUNCTIONS ============

// Send email when user is mentioned
exports.sendMentionEmail = functions.firestore
  .document('mentions/{mentionId}')
  .onCreate(async (snapshot, context) => {
    const mention = snapshot.data();
    
    // Get user's email preferences
    const userDoc = await admin.firestore().collection('users').doc(mention.userId).get();
    const user = userDoc.data();
    
    if (!user || !user.preferences?.emailNotifications) {
      return;
    }
    
    // Get topic info
    const topicDoc = await admin.firestore().collection('topics').doc(mention.topicId).get();
    const topic = topicDoc.data();
    
    // Send email
    const mailOptions = {
      from: '"ComicHub Forum" <noreply@comichub.com>',
      to: user.email,
      subject: `You were mentioned in "${topic.title}"`,
      html: `
        <h2>You were mentioned in a discussion</h2>
        <p><strong>${mention.mentionerName}</strong> mentioned you in the topic:</p>
        <h3>${topic.title}</h3>
        <p>${mention.content.substring(0, 200)}...</p>
        <a href="https://your-forum.com/topic.html?id=${mention.topicId}#post-${mention.postId}" 
           style="display: inline-block; padding: 12px 24px; background: #3b82f6; color: white; 
                  text-decoration: none; border-radius: 6px; margin-top: 20px;">
          View Discussion
        </a>
        <p style="margin-top: 30px; color: #666; font-size: 12px;">
          You can <a href="https://your-forum.com/profile.html#preferences">change your email preferences</a> 
          or <a href="https://your-forum.com/unsubscribe?userId=${mention.userId}">unsubscribe</a>.
        </p>
      `
    };
    
    await transporter.sendMail(mailOptions);
  });

// Send email for new topic replies (batch processing)
exports.sendReplyNotifications = functions.firestore
  .document('posts/{postId}')
  .onCreate(async (snapshot, context) => {
    const post = snapshot.data();
    
    // Skip if it's the first post
    if (post.isFirstPost) return;
    
    // Get topic info
    const topicDoc = await admin.firestore().collection('topics').doc(post.topicId).get();
    const topic = topicDoc.data();
    
    // Get all subscribers to this topic
    const subscriptionsSnapshot = await admin.firestore()
      .collection('subscriptions')
      .where('topicId', '==', post.topicId)
      .get();
    
    // Get post author info
    const authorDoc = await admin.firestore().collection('users').doc(post.authorId).get();
    const author = authorDoc.data();
    
    // Prepare email batch
    const emails = [];
    
    for (const subDoc of subscriptionsSnapshot.docs) {
      const subscription = subDoc.data();
      
      // Skip if the subscriber is the post author
      if (subscription.userId === post.authorId) continue;
      
      // Get subscriber info
      const userDoc = await admin.firestore().collection('users').doc(subscription.userId).get();
      const user = userDoc.data();
      
      if (user && user.preferences?.emailNotifications) {
        emails.push({
          to: user.email,
          subject: `New reply in "${topic.title}"`,
          html: `
            <h2>New reply in "${topic.title}"</h2>
            <p><strong>${author.username}</strong> replied to a topic you're subscribed to:</p>
            <blockquote style="border-left: 4px solid #3b82f6; padding-left: 15px; margin: 20px 0; color: #555;">
              ${post.content.substring(0, 300)}...
            </blockquote>
            <a href="https://your-forum.com/topic.html?id=${post.topicId}#post-${snapshot.id}" 
               style="display: inline-block; padding: 12px 24px; background: #3b82f6; color: white; 
                      text-decoration: none; border-radius: 6px; margin-top: 20px;">
              View Reply
            </a>
            <p style="margin-top: 30px; color: #666; font-size: 12px;">
              <a href="https://your-forum.com/topic.html?id=${post.topicId}#unsubscribe">Unsubscribe from this topic</a>
            </p>
          `
        });
      }
    }
    
    // Send emails in batches of 10
    const batchSize = 10;
    for (let i = 0; i < emails.length; i += batchSize) {
      const batch = emails.slice(i, i + batchSize);
      await Promise.all(batch.map(email => 
        transporter.sendMail({
          from: '"ComicHub Forum" <noreply@comichub.com>',
          ...email
        })
      ));
    }
  });

// ============ STATISTICS FUNCTIONS ============

// Update category statistics when topic is created/deleted
exports.updateCategoryStats = functions.firestore
  .document('topics/{topicId}')
  .onWrite(async (change, context) => {
    const before = change.before.exists ? change.before.data() : null;
    const after = change.after.exists ? change.after.data() : null;
    
    if (!before && after) {
      // Topic created
      await admin.firestore().collection('categories').doc(after.category).update({
        topicCount: admin.firestore.FieldValue.increment(1),
        lastActivity: new Date().toISOString()
      });
    } else if (before && !after) {
      // Topic deleted
      await admin.firestore().collection('categories').doc(before.category).update({
        topicCount: admin.firestore.FieldValue.increment(-1)
      });
    } else if (before && after && before.category !== after.category) {
      // Topic category changed
      await admin.firestore().runTransaction(async (transaction) => {
        const oldCatRef = admin.firestore().collection('categories').doc(before.category);
        const newCatRef = admin.firestore().collection('categories').doc(after.category);
        
        transaction.update(oldCatRef, {
          topicCount: admin.firestore.FieldValue.increment(-1)
        });
        
        transaction.update(newCatRef, {
          topicCount: admin.firestore.FieldValue.increment(1),
          lastActivity: new Date().toISOString()
        });
      });
    }
  });

// Update user reputation
exports.updateUserReputation = functions.firestore
  .document('likes/{likeId}')
  .onCreate(async (snapshot, context) => {
    const like = snapshot.data();
    
    // Get the post
    const postDoc = await admin.firestore().collection('posts').doc(like.postId).get();
    const post = postDoc.data();
    
    if (!post) return;
    
    // Update author's reputation
    await admin.firestore().collection('users').doc(post.authorId).update({
      reputation: admin.firestore.FieldValue.increment(1)
    });
  });

// ============ CLEANUP FUNCTIONS ============

// Clean up old notifications
exports.cleanupOldNotifications = functions.pubsub
  .schedule('every 24 hours')
  .onRun(async (context) => {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const oldNotifications = await admin.firestore()
      .collection('notifications')
      .where('createdAt', '<', thirtyDaysAgo.toISOString())
      .get();
    
    const batch = admin.firestore().batch();
    oldNotifications.docs.forEach(doc => {
      batch.delete(doc.ref);
    });
    
    await batch.commit();
    console.log(`Cleaned up ${oldNotifications.size} old notifications`);
  });

// Clean up inactive online users
exports.cleanupInactiveUsers = functions.pubsub
  .schedule('every 5 minutes')
  .onRun(async (context) => {
    const fifteenMinutesAgo = new Date();
    fifteenMinutesAgo.setMinutes(fifteenMinutesAgo.getMinutes() - 15);
    
    const inactiveUsers = await admin.firestore()
      .collection('online_users')
      .where('lastActive', '<', fifteenMinutesAgo.toISOString())
      .get();
    
    const batch = admin.firestore().batch();
    inactiveUsers.docs.forEach(doc => {
      batch.delete(doc.ref);
    });
    
    await batch.commit();
    console.log(`Cleaned up ${inactiveUsers.size} inactive users`);
  });
