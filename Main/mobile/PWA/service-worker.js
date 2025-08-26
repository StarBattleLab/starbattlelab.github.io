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
const CORE_ASSETS = [
    // --- Core App Shell ---
    '/',
    '/index.html',
    '/style.css',
    '/tailwind.css',
    '/PWA/manifest.json',

    // --- Core Application Scripts ---
    '/app.init.js',
    '/dom.elements.js',
    '/state.config.js',
    '/engine.logic.js',
    '/puzzle_handler.js',
    '/service.api.js',
    '/ui.manager.js',
    '/view.renderer.js',
    '/solver.js',
    '/mobile_import.js',
    '/PWA/pwa-manager.js',

    // --- PWA Icons ---
    '/icons/icon-192x192.png',
    '/icons/icon-512x512.png',

    // --- Dynamically Loaded Photo Import Scripts ---
    '/SnapGridScripts/pica.min.js',
    '/SnapGridScripts/opencv.js',
    '/SnapGridScripts/SnapGridController.js',
    '/SnapGridScripts/annotationDetector.js',
    '/SnapGridScripts/enhanceRegionsByColor.js',
    '/SnapGridScripts/gridDetector.js',
    '/SnapGridScripts/imageNormalizer.js',
    '/SnapGridScripts/imagePreProcessor.js',
    '/SnapGridScripts/lineDurabilityFilter.js',
    '/SnapGridScripts/speedinvert.js',
];

    
/**
 * Fetches the state.config.js file, parses it to find the puzzle file paths,
 * and returns a complete list of all assets to be cached.
 * @returns {Promise<string[]>} A promise that resolves to the full list of cacheable URLs.
 */
async function getAllAssetsToCache() {
    try {
        // Fetch the configuration file
        const response = await fetch('/state.config.js');
        const scriptContent = await response.text();

        // Use a regular expression to find the puzzleDefs array in the script text
        const puzzleDefsMatch = scriptContent.match(/puzzleDefs:\s*\[([\s\S]*?)\]/);
        if (!puzzleDefsMatch || !puzzleDefsMatch[1]) {
            console.error("Could not find puzzleDefs in state.config.js. Using core assets only.");
            return CORE_ASSETS;
        }

        // A safer way to parse the array-like string into an actual array of objects.
        // This avoids the risks of using eval().
        const puzzleDefsArrayStr = `[${puzzleDefsMatch[1]}]`;
        // This is a bit of a hack, but it's safer than eval. We create a function and execute it.
        const puzzleDefs = new Function(`return ${puzzleDefsArrayStr}`)();
        
        // Extract the file paths and prepend the directory path
        const puzzleFiles = puzzleDefs.map(def => `/puzzles/Files/${def.file}`);
        
        // Combine the core assets with the dynamically found puzzle files
        const allAssets = [...CORE_ASSETS, ...puzzleFiles];
        console.log("Assets to cache:", allAssets);
        return allAssets;

    } catch (error) {
        console.error("Failed to dynamically generate asset list. Falling back to core assets.", error);
        // If anything goes wrong, just cache the core files to keep the app shell working.
        return CORE_ASSETS;
    }
}



// --- SERVICE WORKER LIFECYCLE EVENTS ---

/**
 * @description The 'install' event is fired when the service worker is first installed.
 * It opens a cache and adds all specified application assets to it.
 */
self.addEventListener('install', event => {
    event.waitUntil(
        getAllAssetsToCache().then(assets => {
            return caches.open(CACHE_NAME).then(cache => {
                console.log('Opened cache and caching all application assets for offline use.');
                return cache.addAll(assets);
            });
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
