/**
 * **********************************************************************************
 * Title: PWA Management and Update Notification System
 * **********************************************************************************
 * @author Isaiah Tadrous
 * @version 1.1.0
 * *-------------------------------------------------------------------------------
 * This script handles the registration of the service worker and manages the PWA
 * update lifecycle. It detects when a new version of the service worker is
 * available, caches it in the background, and then presents a notification to
 * the user with an option to refresh the page to activate the new version.
 * This ensures that users can seamlessly update to the latest version of the
 * application without losing their current state unexpectedly.
 * **********************************************************************************
 */

// --- PWA SERVICE WORKER REGISTRATION AND UPDATE ---

/**
 * Registers the service worker and sets up the update notification system.
 * This function is the entry point for all PWA-related functionality.
 * @returns {void}
 */
function registerServiceWorker() {
    // Check if service workers are supported by the browser
    if ('serviceWorker' in navigator) {
        // Register the service worker using a relative path and scope it to the current directory.
        navigator.serviceWorker.register('service-worker.js', { scope: '.' }).then(registration => {
            console.log('Service Worker registered with scope:', registration.scope);
            // Listen for updates to the service worker
            registration.addEventListener('updatefound', () => {
                const newWorker = registration.installing;
                if (newWorker) {
                    newWorker.addEventListener('statechange', () => {
                        // When the new service worker is installed and waiting, show the update notification
                        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                            showUpdateNotification(newWorker);
                        }
                    });
                }
            });
        }).catch(error => {
            console.error('Service Worker registration failed:', error);
        });
    }
}

/**
 * Displays a notification to the user when a new version of the app is ready.
 * The notification includes a button that allows the user to activate the new
 * service worker, which will then reload the page to apply the updates.
 * @param {ServiceWorker} newWorker - The new service worker that is waiting to be activated.
 * @returns {void}
 */
function showUpdateNotification(newWorker) {
    const notification = document.createElement('div');
    notification.id = 'update-notification';
    notification.innerHTML = `
        <p>A new version is available!</p>
        <button id="reload-button">Update Now</button>
    `;
    document.body.appendChild(notification);
    // Add a click listener to the "Update Now" button
    const reloadButton = document.getElementById('reload-button');
    if (reloadButton) {
        reloadButton.addEventListener('click', () => {
            // Send a message to the new service worker to skip waiting and activate immediately
            newWorker.postMessage({ action: 'skipWaiting' });
            // Reload the page to apply the update
            window.location.reload();
        });
    }
}

// --- INITIALIZATION ---

// Register the service worker as soon as the script is loaded
registerServiceWorker();
