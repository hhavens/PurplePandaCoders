async function loadAdminDashboard() {
    const statsSnapshot = await db.collection('forum_stats').doc('overview').get();
    const stats = statsSnapshot.data();
    
    // Load recent activities
    const activitiesSnapshot = await db.collection('admin_logs')
        .orderBy('timestamp', 'desc')
        .limit(50)
        .get();
    
    // Load reported content
    const reportedSnapshot = await db.collection('reported_content')
        .where('resolved', '==', false)
        .orderBy('reportedAt', 'desc')
        .limit(20)
        .get();
    
    // Load user management
    const usersSnapshot = await db.collection('users')
        .orderBy('joinDate', 'desc')
        .limit(100)
        .get();
    
    // Render admin dashboard
}