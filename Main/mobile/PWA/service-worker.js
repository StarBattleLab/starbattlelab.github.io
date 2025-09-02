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

// --- COMPLETE LIST OF ASSETS TO CACHE FOR OFFLINE USE ---
const ALL_ASSETS = [
    // --- Core App Shell ---
    './',
    'index.html',
    'style.css',
    'tailwind.css',
    'PWA/manifest.json',

    // --- Core Application Scripts ---
    'app.init.js',
    'dom.elements.js',
    'state.config.js',
    'engine.logic.js',
    'puzzle_handler.js',
    'service.api.js',
    'ui.manager.js',
    'view.renderer.js',
    'solver.js',
    'mobile_import.js',
    'PWA/pwa-manager.js',

    // --- PWA Icons ---
    'icons/icon-192x192.png',
    'icons/icon-512x512.png',

    // --- SnapGrid Import Scripts ---
    'SnapGridScripts/pica.min.js',
    'SnapGridScripts/opencv.js',
    'SnapGridScripts/SnapGridController.js',
    'SnapGridScripts/annotationDetector.js',
    'SnapGridScripts/enhanceRegionsByColor.js',
    'SnapGridScripts/gridDetector.js',
    'SnapGridScripts/imageNormalizer.js',
    'SnapGridScripts/imagePreProcessor.js',
    'SnapGridScripts/lineDurabilityFilter.js',
    'SnapGridScripts/speedinvert.js',

    // --- Puzzle Files (Hardcoded based on actual puzzleDefs) ---
    // NOTE: This assumes a 'puzzles' folder exists inside 'mobile'. 
    // If not, you may need to adjust or remove these lines.
    'puzzles/Files/5-1-unsorted.txt',
    'puzzles/Files/6-1-unsorted.txt',
    'puzzles/Files/8-1-ez.txt',
    'puzzles/Files/8-1-med.txt',
    'puzzles/Files/8-1-hard.txt',
    'puzzles/Files/8-1-expert.txt',
    'puzzles/Files/8-1-unsorted.txt',
    'puzzles/Files/9-1-ez.txt',
    'puzzles/Files/9-1-med.txt',
    'puzzles/Files/9-1-hard.txt',
    'puzzles/Files/9-1-unsorted.txt',
    'puzzles/Files/9-2-ez.txt',
    'puzzles/Files/9-2-med.txt',
    'puzzles/Files/9-2-hard.txt',
    'puzzles/Files/9-2-expert.txt',
    'puzzles/Files/9-2-unsorted.txt',
    'puzzles/Files/10-2-ez.txt',
    'puzzles/Files/10-2-med.txt',
    'puzzles/Files/10-2-hard.txt',
    'puzzles/Files/10-2-expert.txt',
    'puzzles/Files/10-2-unsorted.txt',
    'puzzles/Files/11-2-med.txt',
    'puzzles/Files/11-2-hard.txt',
    'puzzles/Files/11-2-unsorted.txt',
    'puzzles/Files/14-3-med.txt',
    'puzzles/Files/14-3-hard.txt',
    'puzzles/Files/14-3-unsorted.txt',
    'puzzles/Files/17-4-unsorted.txt',
    'puzzles/Files/21-5-unsorted.txt',
    'puzzles/Files/25-6-unsorted.txt'
];

// --- SERVICE WORKER LIFECYCLE EVENTS ---

/**
 * @description The 'install' event is fired when the service worker is first installed.
 * It opens a cache and adds all specified application assets to it.
 */
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => {
            console.log('Opened cache and caching all application assets for offline use.');
            return cache.addAll(ALL_ASSETS);
        })
    );
});

/**
 * @description The 'activate' event is fired when the service worker becomes active.
 * This script cleans up old caches to remove outdated assets from previous versions.
 */
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cache => {
                    if (cache !== CACHE_NAME) {
                        console.log('Clearing old cache:', cache);
                        return caches.delete(cache);
                    }
                })
            );
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
            return caches.match(event.request).then(response => {
                // If the request is in the cache, return it. Otherwise, return a generic offline response.
                return response || new Response("Content not available offline.", { status: 404, statusText: "Offline" });
            });
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
