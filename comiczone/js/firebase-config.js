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
        // Long polling instead of a streaming connection: Safari's Advanced Privacy Protection can stall the stream, leaving loads hanging.
        db.settings({
            experimentalForceLongPolling: true,
            experimentalAutoDetectLongPolling: false,
            merge: true
        });
        storage = firebase.storage();
        
        // Offline persistence is intentionally off: in Safari with Advanced Privacy Protection,
        // enablePersistence() can hang on IndexedDB and block every page that awaits initFirebase().

        console.log('Firebase initialized successfully');
        return { auth, db, storage };
    } catch (error) {
        console.error('Firebase initialization error:', error);
        throw error;
    }
}

// Reject if a Firestore read hangs, so pages can show an error with Retry instead of spinning forever.
const LOAD_TIMEOUT_MS = 15000;

function withTimeout(promise, ms = LOAD_TIMEOUT_MS) {
    let timer;
    const timeout = new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('The forum took too long to respond. Check your connection and try again.')), ms);
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
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