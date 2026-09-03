// Firebase Configuration
const firebaseConfig = {
    apiKey: "AIzaSyBQGhbrblh7BvoNiBzcj3CZNhDK6aB4psU",
    authDomain: "comiczone-72095.firebaseapp.com",
    projectId: "comiczone-72095",
    storageBucket: "comiczone-72095.firebasestorage.app",
    messagingSenderId: "380867871740",
    appId: "1:380867871740:web:22b094a6fa7517b2a4a879"
};

// Initialize Firebase
let firebaseApp;
let auth;
let db;
let storage;

async function initFirebase() {
    try {
        firebaseApp = firebase.initializeApp(firebaseConfig);
        auth = firebase.auth();
        db = firebase.firestore();
        storage = firebase.storage();
        
        // Enable offline persistence
        await db.enablePersistence()
            .catch((err) => {
                console.warn('Offline persistence not supported:', err.code);
            });
            
        console.log('Firebase initialized successfully');
        return { auth, db, storage };
    } catch (error) {
        console.error('Firebase initialization error:', error);
        throw error;
    }
}

// Algolia Search Configuration
const algoliaConfig = {
    appId: 'YOUR_ALGOLIA_APP_ID',
    apiKey: 'YOUR_ALGOLIA_SEARCH_KEY',
    indexName: 'forum_topics'
};

// Export for use in other modules
window.firebaseApp = firebaseApp;
window.auth = auth;
window.db = db;
window.storage = storage;
window.algoliaConfig = algoliaConfig;