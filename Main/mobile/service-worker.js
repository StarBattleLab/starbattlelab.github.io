/**
 * **********************************************************************************
 * Title: Star Battle Service Worker
 * **********************************************************************************
 * @author Isaiah Tadrous
 * @version 1.0.1
 * *-------------------------------------------------------------------------------
 * This service worker script is responsible for caching the application's assets
 * to enable offline functionality and improve loading performance. It uses a
 * "network-first" caching strategy, which ensures that the user always gets the
 * most up-to-date content when they are online, but still allows the application
 * to be accessible offline by serving cached content as a fallback. The script
 * also includes logic to handle the activation of a new service worker version,
 * ensuring a smooth update process for the user.
 * **********************************************************************************
 */

// --- SERVICE WORKER CONFIGURATION ---

const CACHE_NAME = 'star-battle-cache-v1';
const urlsToCache = [
    '/',
    '/index.html',
    '/style.css',
    '/app.init.js',
    '/dom.elements.js',
    '/state.config.js',
    // Add other core assets here
];

// --- SERVICE WORKER LIFECYCLE EVENTS ---

/**
 * @description The 'install' event is fired when the service worker is first installed.
 * It opens a cache and adds the core application shell files to it.
 */
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
        .then(cache => {
            console.log('Opened cache');
            return cache.addAll(urlsToCache);
        })
    );
});

/**
 * @description The 'fetch' event is fired for every request the page makes.
 * This implementation uses a "network-first" strategy. It tries to fetch the
 * resource from the network first. If that fails (e.g., the user is offline),
 * it falls back to serving the resource from the cache.
 */
self.addEventListener('fetch', event => {
    event.respondWith(
        fetch(event.request).catch(() => {
            return caches.match(event.request);
        })
    );
});

/**
 * @description The 'message' event listener waits for a message from the client
 * (sent from pwa-manager.js) with the action 'skipWaiting'. When received, it
 * tells the service worker to become active immediately, replacing the old one.
 */
self.addEventListener('message', event => {
    if (event.data && event.data.action === 'skipWaiting') {
        self.skipWaiting();
    }
});
