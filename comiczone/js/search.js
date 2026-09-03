let searchClient;
let autocomplete;

async function initSearch() {
    // Check if Algolia is configured
    if (!algoliaConfig.appId || algoliaConfig.appId === 'YOUR_ALGOLIA_APP_ID') {
        console.warn('Algolia not configured, using basic Firebase search');
        initBasicSearch();
        return;
    }
    
    try {
        // Initialize Algolia
        searchClient = algoliasearch(algoliaConfig.appId, algoliaConfig.apiKey);
        
        // Initialize autocomplete
        autocomplete = autocomplete({
            container: '#searchBox',
            placeholder: 'Search topics, users, or posts...',
            getSources({ query }) {
                return [
                    {
                        sourceId: 'topics',
                        getItems() {
                            return getAlgoliaResults({
                                searchClient,
                                queries: [
                                    {
                                        indexName: algoliaConfig.indexName,
                                        query,
                                        params: {
                                            hitsPerPage: 5,
                                            attributesToSnippet: ['content:20'],
                                            snippetEllipsisText: '...'
                                        }
                                    }
                                ]
                            });
                        },
                        templates: {
                            item({ item, components, html }) {
                                return html`
                                    <a href="topic.html?id=${item.objectID}" class="aa-ItemLink">
                                        <div class="aa-ItemContent">
                                            <div class="aa-ItemContentBody">
                                                <div class="aa-ItemContentTitle">
                                                    ${components.Highlight({ hit: item, attribute: 'title' })}
                                                </div>
                                                <div class="aa-ItemContentDescription">
                                                    ${components.Snippet({ hit: item, attribute: 'content' })}
                                                </div>
                                                <div class="aa-ItemContentMeta">
                                                    <span>${item.category}</span>
                                                    <span>•</span>
                                                    <span>${item.replyCount} replies</span>
                                                </div>
                                            </div>
                                        </div>
                                    </a>
                                `;
                            },
                            noResults() {
                                return 'No topics found';
                            }
                        }
                    },
                    {
                        sourceId: 'users',
                        getItems() {
                            return getAlgoliaResults({
                                searchClient,
                                queries: [
                                    {
                                        indexName: 'forum_users',
                                        query,
                                        params: {
                                            hitsPerPage: 3
                                        }
                                    }
                                ]
                            });
                        },
                        templates: {
                            item({ item, components, html }) {
                                return html`
                                    <a href="profile.html?id=${item.objectID}" class="aa-ItemLink">
                                        <div class="aa-ItemContent">
                                            <div style="display: flex; align-items: center; gap: 10px;">
                                                <div style="width: 32px; height: 32px; border-radius: 50%; 
                                                     background: ${item.avatarColor || '#3b82f6'}; 
                                                     display: flex; align-items: center; justify-content: center; 
                                                     color: white; font-weight: 600;">
                                                    ${item.username?.charAt(0) || 'U'}
                                                </div>
                                                <div>
                                                    <div style="font-weight: 500;">
                                                        ${components.Highlight({ hit: item, attribute: 'username' })}
                                                    </div>
                                                    <div style="font-size: 12px; color: #666;">
                                                        ${item.postCount || 0} posts
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </a>
                                `;
                            }
                        }
                    }
                ];
            },
            render({ sections, html }, root) {
                root.innerHTML = html`
                    <div class="aa-Panel">
                        ${sections.map(section => html`
                            <div class="aa-Source">
                                <div class="aa-SourceHeader">
                                    <span class="aa-SourceHeaderTitle">${section.source.sourceId}</span>
                                </div>
                                <div class="aa-SourceNoResults"></div>
                                <ul class="aa-List">
                                    ${section.items.map(item => html`
                                        <li class="aa-Item">
                                            ${section.source.templates.item({ item })}
                                        </li>
                                    `)}
                                </ul>
                            </div>
                        `)}
                    </div>
                `;
            }
        });
        
        console.log('Algolia search initialized');
    } catch (error) {
        console.error('Error initializing Algolia:', error);
        initBasicSearch();
    }
}

function initBasicSearch() {
    const searchBox = document.getElementById('searchBox');
    if (!searchBox) return;
    
    searchBox.innerHTML = `
        <div style="position: relative;">
            <input type="text" id="basicSearchInput" 
                   placeholder="Search topics, users, or posts..." 
                   style="width: 100%; padding: 12px 20px 12px 45px; border: 2px solid var(--border); 
                          border-radius: 8px; font-size: 15px; background: white;"
                   onkeypress="handleBasicSearch(event)">
            <i class="fas fa-search" style="position: absolute; left: 18px; top: 50%; transform: translateY(-50%); 
                color: var(--text-light);"></i>
            <div class="search-results-dropdown" id="basicSearchResults" style="display: none;"></div>
        </div>
    `;
}

async function handleBasicSearch(event) {
    if (event.key !== 'Enter') return;
    
    const query = event.target.value.trim();
    if (!query) return;
    
    const resultsDiv = document.getElementById('basicSearchResults');
    resultsDiv.style.display = 'block';
    resultsDiv.innerHTML = `
        <div style="padding: 20px; text-align: center;">
            <div class="loading"></div>
            <div style="margin-top: 10px; color: var(--text-light);">Searching...</div>
        </div>
    `;
    
    try {
        // Search topics
        const topicsSnapshot = await db.collection('topics')
            .where('keywords', 'array-contains', query.toLowerCase())
            .limit(10)
            .get();
        
        // Search users
        const usersSnapshot = await db.collection('users')
            .where('username', '>=', query)
            .where('username', '<=', query + '\uf8ff')
            .limit(5)
            .get();
        
        renderBasicSearchResults(topicsSnapshot, usersSnapshot, query);
    } catch (error) {
        console.error('Search error:', error);
        resultsDiv.innerHTML = `
            <div style="padding: 20px; color: var(--danger);">
                Error searching: ${error.message}
            </div>
        `;
    }
}

function renderBasicSearchResults(topicsSnapshot, usersSnapshot, query) {
    const resultsDiv = document.getElementById('basicSearchResults');
    
    let html = '';
    
    // Users results
    if (!usersSnapshot.empty) {
        html += `
            <div style="padding: 15px; border-bottom: 1px solid var(--border);">
                <div style="font-weight: 600; color: var(--secondary); margin-bottom: 10px;">
                    Users
                </div>
        `;
        
        usersSnapshot.forEach(doc => {
            const user = doc.data();
            html += `
                <a href="profile.html?id=${doc.id}" 
                   style="display: flex; align-items: center; gap: 10px; padding: 8px; border-radius: 6px; 
                          text-decoration: none; color: var(--text); transition: background 0.2s;">
                    <div style="width: 32px; height: 32px; border-radius: 50%; background: ${user.avatarColor || '#3b82f6'}; 
                         display: flex; align-items: center; justify-content: center; color: white; font-weight: 600;">
                        ${user.username?.charAt(0) || 'U'}
                    </div>
                    <div>
                        <div style="font-weight: 500;">${user.username}</div>
                        <div style="font-size: 12px; color: var(--text-light);">
                            ${user.postCount || 0} posts • ${user.reputation || 0} reputation
                        </div>
                    </div>
                </a>
            `;
        });
        
        html += `</div>`;
    }
    
    // Topics results
    if (!topicsSnapshot.empty) {
        html += `
            <div style="padding: 15px;">
                <div style="font-weight: 600; color: var(--secondary); margin-bottom: 10px;">
                    Topics
                </div>
        `;
        
        topicsSnapshot.forEach(doc => {
            const topic = doc.data();
            html += `
                <a href="topic.html?id=${doc.id}" 
                   style="display: block; padding: 12px; border-radius: 6px; text-decoration: none; 
                          color: var(--text); transition: background 0.2s; margin-bottom: 8px;">
                    <div style="font-weight: 500; margin-bottom: 4px;">${topic.title}</div>
                    <div style="font-size: 13px; color: var(--text-light);">
                        ${topic.replyCount || 0} replies • ${topic.viewCount || 0} views • 
                        ${formatTimeAgo(topic.createdAt?.toDate())}
                    </div>
                </a>
            `;
        });
        
        html += `</div>`;
    }
    
    if (html === '') {
        html = `
            <div style="padding: 30px; text-align: center; color: var(--text-light);">
                <i class="fas fa-search" style="font-size: 24px; margin-bottom: 10px;"></i>
                <div>No results found for "${query}"</div>
            </div>
        `;
    }
    
    resultsDiv.innerHTML = html;
}

// Close search results when clicking outside
document.addEventListener('click', (event) => {
    const resultsDiv = document.getElementById('basicSearchResults');
    const searchInput = document.getElementById('basicSearchInput');
    
    if (resultsDiv && searchInput && 
        !resultsDiv.contains(event.target) && 
        !searchInput.contains(event.target)) {
        resultsDiv.style.display = 'none';
    }
});

window.initSearch = initSearch;