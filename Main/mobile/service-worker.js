/**
 * **********************************************************************************
 * Title: Star Battle Service Worker
 * **********************************************************************************
 * @author Isaiah Tadrous
 * @version 1.2.0
 * *-------------------------------------------------------------------------------
 * This service worker script is responsible for caching the application's assets
 * to enable offline functionality and improve loading performance. It uses a
 * "cache-first" caching strategy for static assets and "network-first" for 
 * dynamic content. The script also includes logic to handle the activation of a 
 * new service worker version, ensuring a smooth update process for the user.
 * **********************************************************************************
 */

// --- SERVICE WORKER CONFIGURATION ---

const VERSION = 'v3.6.3'; // Single version string to control both caches.
const CACHE_NAME = `star-battle-cache-${VERSION}`;
const DYNAMIC_CACHE_NAME = `star-battle-dynamic-${VERSION}`;

// --- COMPLETE LIST OF ASSETS TO CACHE FOR OFFLINE USE ---
const ALL_ASSETS = [
    // --- Core App Shell ---
    './',
    './index.html',
    './style.css',
    './tailwind.css',
    './PWA/manifest.json',

    // --- Core Application Scripts ---
    './app.init.js',
    './dom.elements.js',
    './state.config.js',
    './engine.logic.js',
    './puzzle_handler.js',
    './service.api.js',
    './ui.manager.js',
    './view.renderer.js',
    './solver.js',
    './mobile_import.js',
    './PWA/pwa-manager.js',
    './PWA/install-prompting.js',

    // --- PWA Icons ---
    './icons/favicon-96x96.png',
    './icons/apple-touch-icon.png',
    './icons/web-app-manifest-192x192.png',
    './icons/web-app-manifest-512x512.png',
    './icons/favicon.svg',
    './icons/favicon.ico',

    // --- SnapGrid Import Scripts ---
    './SnapGridScripts/pica.min.js',
    './SnapGridScripts/opencv.js',
    './SnapGridScripts/SnapGridController.js',
    './SnapGridScripts/annotationDetector.js',
    './SnapGridScripts/enhanceRegionsByColor.js',
    './SnapGridScripts/gridDetector.js',
    './SnapGridScripts/imageNormalizer.js',
    './SnapGridScripts/imagePreProcessor.js',
    './SnapGridScripts/lineDurabilityFilter.js',
    './SnapGridScripts/speedinvert.js',

    // --- Puzzle Files (All available puzzles for offline access) ---
    './puzzles/Files/5-1-unsorted.txt',
    './puzzles/Files/6-1-unsorted.txt',
    './puzzles/Files/8-1-ez.txt',
    './puzzles/Files/8-1-med.txt',
    './puzzles/Files/8-1-hard.txt',
    './puzzles/Files/8-1-expert.txt',
    './puzzles/Files/8-1-unsorted.txt',
    './puzzles/Files/9-1-ez.txt',
    './puzzles/Files/9-1-med.txt',
    './puzzles/Files/9-1-hard.txt',
    './puzzles/Files/9-1-unsorted.txt',
    './puzzles/Files/9-2-ez.txt',
    './puzzles/Files/9-2-med.txt',
    './puzzles/Files/9-2-hard.txt',
    './puzzles/Files/9-2-expert.txt',
    './puzzles/Files/9-2-unsorted.txt',
    './puzzles/Files/10-2-ez.txt',
    './puzzles/Files/10-2-med.txt',
    './puzzles/Files/10-2-hard.txt',
    './puzzles/Files/10-2-expert.txt',
    './puzzles/Files/10-2-unsorted.txt',
    './puzzles/Files/11-2-med.txt',
    './puzzles/Files/11-2-hard.txt',
    './puzzles/Files/11-2-unsorted.txt',
    './puzzles/Files/14-3-med.txt',
    './puzzles/Files/14-3-hard.txt',
    './puzzles/Files/14-3-unsorted.txt',
    './puzzles/Files/17-4-unsorted.txt',
    './puzzles/Files/21-5-unsorted.txt',
    './puzzles/Files/25-6-unsorted.txt'
];

// --- SERVICE WORKER LIFECYCLE EVENTS ---

/**
 * @description The 'install' event is fired when the service worker is first installed.
 * It opens a cache and adds all specified application assets to it.
 */
self.addEventListener('install', event => {
    console.log('Service Worker installing...');
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => {
            console.log('Opened cache and caching all application assets for offline use.');
            console.log(`Caching ${ALL_ASSETS.length} assets...`);
            
            // Cache assets individually with error handling to prevent installation failure
            const cachePromises = ALL_ASSETS.map(asset => {
                return cache.add(asset).catch(error => {
                    console.warn(`Failed to cache ${asset}:`, error);
                    // Continue installation even if individual assets fail to cache
                    return Promise.resolve();
                });
            });
            
            return Promise.all(cachePromises);
        }).then(() => {
            console.log('All assets cached successfully');
        }).catch(error => {
            console.error('Failed to cache assets:', error);
        })
    );
});

/**
 * @description The 'activate' event is fired when the service worker becomes active.
 * This script cleans up old caches to remove outdated assets from previous versions.
 */
self.addEventListener('activate', event => {
    console.log('Service Worker activating...');
    event.waitUntil(
        Promise.all([
            // Clean up old caches
            caches.keys().then(cacheNames => {
                return Promise.all(
                    cacheNames.map(cache => {
                        if (cache !== CACHE_NAME && cache !== DYNAMIC_CACHE_NAME) {
                            console.log('Clearing old cache:', cache);
                            return caches.delete(cache);
                        }
                    })
                );
            }),
            // Take control of all clients immediately
            self.clients.claim()
        ]).then(() => {
            console.log('Service Worker activated and ready');
        })
    );
});

/**
 * @description The 'fetch' event is fired for every request the page makes.
 * This implementation uses a "cache-first" strategy for static assets and
 * "network-first" for dynamic content.
 */
self.addEventListener('fetch', event => {
    const requestUrl = new URL(event.request.url);
    
    // Skip non-GET requests
    if (event.request.method !== 'GET') {
        return;
    }
    
    // Skip external requests (different origin)
    if (requestUrl.origin !== location.origin) {
        return;
    }
    
    event.respondWith(
        handleRequest(event.request)
    );
});

/**
 * Handle different types of requests with appropriate caching strategies
 */
async function handleRequest(request) {
    const requestUrl = new URL(request.url);
    const pathname = requestUrl.pathname;
    
    try {
        // For puzzle files and static assets, use cache-first strategy
        if (pathname.includes('/puzzles/Files/') || 
            pathname.includes('/icons/') ||
            pathname.includes('/SnapGridScripts/') ||
            pathname.endsWith('.css') ||
            pathname.endsWith('.js') ||
            pathname.endsWith('.json') ||
            pathname.endsWith('.png') ||
            pathname.endsWith('.svg') ||
            pathname.endsWith('.ico')) {
            
            return await cacheFirst(request);
        }
        
        // For the main page and dynamic content, use network-first strategy
        return await networkFirst(request);
        
    } catch (error) {
        console.error('Request handling failed:', error);
        
        // Fallback to cache or error response
        const cachedResponse = await caches.match(request);
        if (cachedResponse) {
            return cachedResponse;
        }
        
        return new Response("Content not available offline.", { 
            status: 404, 
            statusText: "Offline" 
        });
    }
}

/**
 * Cache-first strategy: Check cache first, fallback to network
 */
async function cacheFirst(request) {
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
        return cachedResponse;
    }
    
    // If not in cache, fetch from network and cache it
    const networkResponse = await fetch(request);
    
    if (networkResponse.ok) {
        const cache = await caches.open(CACHE_NAME);
        cache.put(request, networkResponse.clone());
    }
    
    return networkResponse;
}

/**
 * Network-first strategy: Try network first, fallback to cache
 */
async function networkFirst(request) {
    try {
        const networkResponse = await fetch(request);
        
        if (networkResponse.ok) {
            // Cache successful responses
            const cache = await caches.open(DYNAMIC_CACHE_NAME);
            cache.put(request, networkResponse.clone());
        }
        
        return networkResponse;
    } catch (error) {
        // Network failed, try cache
        const cachedResponse = await caches.match(request);
        if (cachedResponse) {
            return cachedResponse;
        }
        throw error;
    }
}

/**
 * @description The 'message' event listener waits for a message from the client
 * (sent from pwa-manager.js) with the action 'skipWaiting'. When received, it
 * tells the service worker to become active immediately, replacing the old one.
 */
self.addEventListener('message', event => {
    console.log('Service Worker received message:', event.data);
    
    if (event.data && event.data.action === 'skipWaiting') {
        console.log('Skipping waiting and activating new service worker');
        self.skipWaiting();
    }
});

console.log('Service Worker script loaded successfully');
