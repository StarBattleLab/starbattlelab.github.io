/**
 * **********************************************************************************
 * Title: PWA Management and Update Notification System
 * **********************************************************************************
 * @author Isaiah Tadrous
 * @version 2.0.0
 * *-------------------------------------------------------------------------------
 * Comprehensive Progressive Web App management system that orchestrates service
 * worker registration, update lifecycle management, and cross-session notification
 * persistence. Provides seamless background update detection, intelligent caching
 * strategies, and user friendly update prompts with automatic activation workflows.
 * Features include custom installation prompts, periodic update checking, visibility
 * change handling, and persistent state management across application sessions.
 * Ensures optimal PWA experience with reliable offline functionality and smooth
 * update deployment processes.
 * **********************************************************************************
 */

// --- GLOBAL VARIABLES ---

let deferredPrompt;
let registration;
let updateIcon;
let waitingServiceWorker = null;

const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
const isSafari = /^((?!chrome|android|crios|fxios|opios).)*safari/i.test(navigator.userAgent);
const isSafariOnIOS = isIOS && isSafari && navigator.vendor && navigator.vendor.indexOf('Apple') > -1;

// --- STORAGE KEYS ---
const STORAGE_KEYS = {
    OUTDATED_FLAG: 'pwa_is_outdated',
    UPDATE_AVAILABLE: 'pwa_update_available',
    UPDATE_DISMISSED: 'pwa_update_dismissed'
};

// --- PERSISTENT UPDATE STATE MANAGEMENT ---

/**
 * Set outdated flag - app has an update waiting
 */
function setOutdatedFlag() {
    try {
        localStorage.setItem(STORAGE_KEYS.OUTDATED_FLAG, 'true');
        console.log('Outdated flag set - app needs update');
    } catch (e) {
        console.warn('Could not set outdated flag:', e);
    }
}

/**
 * Clear outdated flag - app is up to date
 */
function clearOutdatedFlag() {
    try {
        localStorage.removeItem(STORAGE_KEYS.OUTDATED_FLAG);
        console.log('Outdated flag cleared - app is up to date');
    } catch (e) {
        console.warn('Could not clear outdated flag:', e);
    }
}

/**
 * Check if app is outdated
 */
function isAppOutdated() {
    try {
        return localStorage.getItem(STORAGE_KEYS.OUTDATED_FLAG) === 'true';
    } catch (e) {
        return false;
    }
}

/**
 * Perform update by reloading the page
 * This clears the cache and activates any waiting service worker
 */
function performUpdate() {
    console.log('Performing app update...');
    clearOutdatedFlag();

    // Try to message any waiting service worker first
    if (waitingServiceWorker) {
        try {
            waitingServiceWorker.postMessage({
                action: 'skipWaiting'
            });
        } catch (e) {
            console.warn('Could not message waiting worker:', e);
        }
    }

    // Always reload to ensure update
    setTimeout(() => {
        window.location.reload(true);
    }, 100);
}

/**
 * Store update availability state
 */
function setUpdateAvailable(available) {
    try {
        if (available) {
            sessionStorage.setItem(STORAGE_KEYS.UPDATE_AVAILABLE, 'true');
            sessionStorage.removeItem(STORAGE_KEYS.UPDATE_DISMISSED);
        } else {
            sessionStorage.removeItem(STORAGE_KEYS.UPDATE_AVAILABLE);
            sessionStorage.removeItem(STORAGE_KEYS.UPDATE_DISMISSED);
        }
    } catch (e) {
        console.warn('Could not access sessionStorage:', e);
    }
}

/**
 * Check if update is available
 */
function isUpdateAvailable() {
    try {
        return sessionStorage.getItem(STORAGE_KEYS.UPDATE_AVAILABLE) === 'true';
    } catch (e) {
        return false;
    }
}

/**
 * Mark update as dismissed for this session
 */
function setUpdateDismissed() {
    try {
        sessionStorage.setItem(STORAGE_KEYS.UPDATE_DISMISSED, 'true');
    } catch (e) {
        console.warn('Could not access sessionStorage:', e);
    }
}

/**
 * Check if update was dismissed
 */
function isUpdateDismissed() {
    try {
        return sessionStorage.getItem(STORAGE_KEYS.UPDATE_DISMISSED) === 'true';
    } catch (e) {
        return false;
    }
}

/**
 * Check for waiting service worker on startup
 */
function checkForWaitingServiceWorker() {
    if (registration && registration.waiting) {
        console.log('Found waiting service worker on startup');
        waitingServiceWorker = registration.waiting;
        setUpdateAvailable(true);

        if (!isUpdateDismissed()) {
            showUpdateNotification(waitingServiceWorker);
        } else {
            showUpdateIcon();
        }
        return true;
    }
    return false;
}

/**
 * service worker registration with immediate update check
 */
async function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
        try {
            registration = await navigator.serviceWorker.register('./service-worker.js', {
                scope: './',
                updateViaCache: 'none'
            });

            console.log('Service Worker registered with scope:', registration.scope);

            // Set up event listeners
            registration.addEventListener('updatefound', handleUpdateFound);

            // Check for waiting service worker immediately
            setTimeout(() => {
                if (!checkForWaitingServiceWorker()) {
                    // No waiting worker, check for service worker updates
                    checkForUpdates();
                }
            }, 1000);

            // Check if there's already an update available from previous session
            if (isUpdateAvailable() && !isUpdateDismissed()) {
                if (registration.waiting) {
                    waitingServiceWorker = registration.waiting;
                    showUpdateNotification(waitingServiceWorker);
                } else {
                    showUpdateIcon();
                }
            }

        } catch (error) {
            console.error('Service Worker registration failed:', error);
        }
    }
}

/**
 * Show update icon when notification is dismissed
 */
function showUpdateIcon() {
    updateIcon = createUpdateIcon();
    updateIcon.style.display = 'flex';
    console.log('Update icon shown');
}

/**
 * Update notification that persists state
 */
function showUpdateNotification(newWorker) {
    // Store the waiting worker reference
    waitingServiceWorker = newWorker;
    setUpdateAvailable(true);

    const existingNotification = document.getElementById('update-notification');
    const notification = existingNotification || document.createElement('div');

    if (!existingNotification) {
        notification.id = 'update-notification';
        notification.style.cssText = `
            position: fixed;
            bottom: 20px;
            left: 50%;
            transform: translateX(-50%);
            background: linear-gradient(135deg, #0976ea 0%, #0d47a1 100%);
            color: white;
            padding: 20px;
            border-radius: 12px;
            box-shadow: 0 8px 32px rgba(0,0,0,0.3);
            z-index: 9999;
            animation: pwa-slideInUp 0.3s ease-out;
            width: 90%;
            max-width: 850px;
            text-align: center;
        `;

        document.body.appendChild(notification);
    }

    notification.style.display = 'block';

    notification.innerHTML = `
        <button id="dismiss-update" style="
            position: absolute;
            top: 10px;
            right: 15px;
            background: none;
            border: none;
            color: white;
            opacity: 0.8;
            font-size: 20px;
            line-height: 1;
            padding: 0;
            cursor: pointer;
            width: 24px;
            height: 24px;
            display: flex;
            align-items: center;
            justify-content: center;
            border-radius: 50%;
            transition: opacity 0.2s, background-color 0.2s;
        ">&times;</button>

        <div style="display: flex; flex-direction: column; align-items: center; padding: 0 30px;">
            <p style="margin: 0 0 12px 0; font-weight: 600; font-size: 1.1rem;">A new version is available!</p>
            <button id="reload-button" style="
                background: rgba(255,255,255,0.2);
                border: 1px solid rgba(255,255,255,0.3);
                color: white;
                padding: 12px 25px;
                border-radius: 8px;
                cursor: pointer;
                font-weight: 600;
                font-size: 1rem;
                transition: background-color 0.2s;
                white-space: nowrap;
                width: 100%;
                max-width: 220px;
            ">Install Now</button>
        </div>
    `;

    // Add CSS if needed
    if (!document.getElementById('update-notification-styles')) {
        const style = document.createElement('style');
        style.id = 'update-notification-styles';
        style.textContent = `
            @keyframes pwa-slideInUp {
                from {
                    transform: translate(-50%, 100%);
                    opacity: 0;
                }
                to {
                    transform: translate(-50%, 0);
                    opacity: 1;
                }
            }
            #reload-button:hover {
                background: rgba(255,255,255,0.3) !important;
            }
            #dismiss-update:hover {
                opacity: 1 !important;
                background-color: rgba(255,255,255,0.2) !important;
            }
        `;
        document.head.appendChild(style);
    }

    // Create update icon but keep it hidden initially
    updateIcon = createUpdateIcon();
    updateIcon.onclick = () => {
        notification.style.display = 'block';
        updateIcon.style.display = 'none';
        console.log('Update icon clicked, showing notification');
    };

    // Enhanced event handlers
    const reloadButton = notification.querySelector('#reload-button');
    const dismissButton = notification.querySelector('#dismiss-update');

    if (reloadButton) {
        reloadButton.addEventListener('click', (e) => {
            e.stopPropagation();

            reloadButton.textContent = 'Installing...';
            reloadButton.disabled = true;
            reloadButton.style.opacity = '0.7';

            // Perform the update using our self-contained method
            performUpdate();
        });
    }

    if (dismissButton) {
        dismissButton.addEventListener('click', (e) => {
            e.stopPropagation();
            notification.style.display = 'none';
            setUpdateDismissed(); // Persist dismissal state
            showUpdateIcon();
            console.log('Update notification dismissed, showing update icon');
        });
    }

    // Auto-dismiss after 30 seconds but remember it was dismissed
    setTimeout(() => {
        if (notification.style.display !== 'none') {
            notification.style.display = 'none';
            setUpdateDismissed();
            showUpdateIcon();
            console.log('Update notification auto-dismissed, showing update icon');
        }
    }, 30000);
}

/**
 * Enhanced update found handler
 */
function handleUpdateFound() {
    console.log('New service worker version found, installing...');
    const newWorker = registration.installing;

    if (newWorker) {
        newWorker.addEventListener('statechange', () => {
            console.log('New service worker state:', newWorker.state);

            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                // Set the persistent outdated flag
                setOutdatedFlag();

                console.log('App is now marked as outdated. Showing notification.');
                waitingServiceWorker = newWorker;
                showUpdateNotification(newWorker);
            }
        });
    }
}

/**
 * Check for updates with better error handling
 */
async function checkForUpdates() {
    if (registration) {
        try {
            console.log('Checking for service worker updates...');
            const updatedReg = await registration.update();

            // Check if there's a waiting worker after update
            if (updatedReg.waiting && navigator.serviceWorker.controller) {
                waitingServiceWorker = updatedReg.waiting;
                if (!isUpdateDismissed()) {
                    showUpdateNotification(waitingServiceWorker);
                } else {
                    showUpdateIcon();
                }
            }
        } catch (error) {
            console.error('Failed to check for updates:', error);
        }
    }
}

/**
 * Visibility change handler
 */
function handleVisibilityChange() {
    if (!document.hidden) {
        console.log('App became visible, checking for updates...');

        // Check for waiting worker first
        if (!checkForWaitingServiceWorker()) {
            // Perform additional update check for new service worker versions
            checkForUpdates();
        }
    }
}

/**
 * PWA initialization
 */
async function initializePWA() {
    console.log('Initializing enhanced PWA functionality...');

    // Clear any stale update state on fresh app start
    if (performance.navigation.type === performance.navigation.TYPE_RELOAD) {
        setUpdateAvailable(false);
    }

    // Register the service worker
    await registerServiceWorker();

    // Check for persistent outdated flag on every startup
    if (isAppOutdated()) {
        console.log('Outdated flag found on startup. Showing update icon.');
        showUpdateIcon(); // Immediately show the small icon
    }

    const installButton = document.getElementById('install-pwa-btn');
    if (installButton && !isSafariOnIOS) {
        installButton.addEventListener('click', handleInstallClick);
    }

    // Event listeners
    document.addEventListener('visibilitychange', handleVisibilityChange);

    window.addEventListener('focus', () => {
        console.log('App gained focus, checking for updates...');
        if (!checkForWaitingServiceWorker()) {
            checkForUpdates();
        }
    });

    // Check for updates periodically (every 30 minutes when active)
    setInterval(() => {
        if (!document.hidden) {
            checkForUpdates();
        }
    }, 30 * 60 * 1000);

    if (isStandalone()) {
        console.log('App is running in standalone mode');
        if (installButton) {
            installButton.style.display = 'none';
        }
    }

    console.log('Enhanced PWA initialization complete');
}

// --- PWA CUSTOM INSTALL PROMPT CODE ---
window.addEventListener('beforeinstallprompt', (e) => {
    if (isSafariOnIOS) {
        return;
    }

    console.log('App is installable - showing custom install prompt.');
    e.preventDefault();
    deferredPrompt = e;

    setTimeout(showCustomInstallPrompt, 1000);
});

function showCustomInstallPrompt() {
    if (isSafariOnIOS) return;

    if (document.getElementById('custom-install-prompt')) return;

    const promptDiv = document.createElement('div');
    promptDiv.id = 'custom-install-prompt';
    promptDiv.style.cssText = `
        position: fixed;
        bottom: 20px;
        left: 50%;
        transform: translateX(-50%);
        background: linear-gradient(135deg, #0976ea 0%, #0d47a1 100%);
        color: white;
        padding: 20px;
        border-radius: 12px;
        box-shadow: 0 8px 32px rgba(0,0,0,0.3);
        z-index: 100;
        animation: pwa-slideInUp 0.4s ease-out;
        width: min(550px, calc(100vw - 40px));
    `;

    promptDiv.innerHTML = `
        <div style="display: flex; align-items: center; gap: 15px;">
            <div style="flex-shrink: 0;">
                <svg xmlns='http://www.w3.org/2000/svg' width='40' height='40' viewBox='0 0 24 24' fill='none' stroke='white' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'><path d='M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4'></path><polyline points='7 10 12 15 17 10'></polyline><line x1='12' y1='15' x2='12' y2='3'></line></svg>
            </div>
            <div style="flex: 1;">
                <div style="font-weight: 600; margin-bottom: 5px;">Install StarBattle App</div>
                <div style="font-size: 0.9rem; opacity: 0.9;">Get instant access and play offline!</div>
            </div>
        </div>
        <div style="display: flex; gap: 10px; margin-top: 15px;">
            <button id="custom-install-accept" style="
                flex: 1; background: rgba(255,255,255,0.2); border: 1px solid rgba(255,255,255,0.3);
                color: white; padding: 10px 15px; border-radius: 6px; font-weight: 600;
                cursor: pointer; transition: all 0.2s;
            ">Install</button>
            <button id="custom-install-dismiss" style="
                background: transparent; border: 1px solid rgba(255,255,255,0.3);
                color: white; padding: 10px 15px; border-radius: 6px;
                cursor: pointer; transition: all 0.2s;
            ">Later</button>
        </div>
    `;

    if (!document.getElementById('install-prompt-styles')) {
        const style = document.createElement('style');
        style.id = 'install-prompt-styles';
        style.textContent = `
            @keyframes pwa-slideInUp {
                from { transform: translateX(-50%) translateY(100%); opacity: 0; }
                to { transform: translateX(-50%) translateY(0); opacity: 1; }
            }
        `;
        document.head.appendChild(style);
    }

    document.body.appendChild(promptDiv);

    document.getElementById('custom-install-accept').addEventListener('click', () => {
        promptDiv.remove();
        handleInstallClick();
    });

    document.getElementById('custom-install-dismiss').addEventListener('click', () => {
        promptDiv.remove();
    });
}

function handleInstallClick() {
    const installButton = document.getElementById('install-pwa-btn');

    if (deferredPrompt) {
        deferredPrompt.prompt();

        deferredPrompt.userChoice.then((choiceResult) => {
            console.log(`User response to the install prompt: ${choiceResult.outcome}`);

            if (choiceResult.outcome === 'accepted') {
                console.log('User accepted the install prompt');
                showInstallSuccessMessage();
            } else {
                console.log('User dismissed the install prompt');
            }

            deferredPrompt = null;

            if (installButton) {
                installButton.style.display = 'none';
            }
        }).catch((error) => {
            console.error('Error during install prompt:', error);
        });
    } else {
        console.log('No deferred prompt available');
    }
}

function showInstallSuccessMessage() {
    const message = document.createElement('div');
    message.style.cssText = `
        position: fixed;
        top: 20px;
        left: 50%;
        transform: translateX(-50%);
        background-color: #10b981;
        color: white;
        padding: 15px 25px;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        z-index: 1001;
        font-size: 1rem;
        font-weight: 500;
    `;
    message.textContent = 'App installed successfully! All puzzles are now available offline.';
    document.body.appendChild(message);

    setTimeout(() => {
        message.remove();
    }, 4000);
}

window.addEventListener('appinstalled', (e) => {
    console.log('PWA was successfully installed');
    deferredPrompt = null;

    const installButton = document.getElementById('install-pwa-btn');
    if (installButton) {
        installButton.style.display = 'none';
    }

    showInstallSuccessMessage();
});

function createUpdateIcon() {
    if (document.getElementById('update-icon')) {
        return document.getElementById('update-icon');
    }

    const iconDiv = document.createElement('div');
    iconDiv.id = 'update-icon';
    iconDiv.style.cssText = `
        position: fixed;
        bottom: 20px;
        right: 20px;
        width: 60px;
        height: 60px;
        background: linear-gradient(135deg, #0976ea 0%, #0d47a1 100%);
        color: white;
        border-radius: 50%;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        z-index: 9998;
        display: none;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        transition: transform 0.2s ease-in-out, box-shadow 0.2s ease-in-out;
        border: none;
        outline: none;
    `;

    iconDiv.innerHTML = `
        <svg fill="#ffffff" width="30px" height="30px" viewBox="0 0 24 24" id="update" data-name="Flat Color" xmlns="http://www.w3.org/2000/svg" class="icon flat-color">
            <path id="primary" d="M19,2a1,1,0,0,0-1,1V5.33A9,9,0,0,0,3,12a1,1,0,0,0,2,0A7,7,0,0,1,16.86,7H14a1,1,0,0,0,0,2h5a1,1,0,0,0,1-1V3A1,1,0,0,0,19,2Z" style="fill: #ffffff;"></path>
            <path id="secondary" d="M20,11a1,1,0,0,0-1,1A7,7,0,0,1,7.11,17H10a1,1,0,0,0,0-2H5a1,1,0,0,0-1,1v5a1,1,0,0,0,2,0V18.67A9,9,0,0,0,21,12,1,1,0,0,0,20,11Z" style="fill: #ffffff;"></path>
        </svg>
    `;

    document.body.appendChild(iconDiv);

    // Handle click - show notification or directly update
    iconDiv.addEventListener('click', () => {
        if (isAppOutdated()) {
            // Show the notification for confirmation
            showUpdateNotificationForIcon();
        }
    });

    iconDiv.addEventListener('mouseover', () => {
        iconDiv.style.transform = 'scale(1.1)';
        iconDiv.style.boxShadow = '0 6px 18px rgba(0,0,0,0.4)';
    });

    iconDiv.addEventListener('mouseout', () => {
        iconDiv.style.transform = 'scale(1)';
        iconDiv.style.boxShadow = '0 4px 12px rgba(0,0,0,0.3)';
    });

    return iconDiv;
}

/**
 * Show update notification when icon is clicked
 */
function showUpdateNotificationForIcon() {
    const existingNotification = document.getElementById('update-notification');
    if (existingNotification) {
        existingNotification.style.display = 'block';
        updateIcon.style.display = 'none';
        return;
    }

    // Create a simple notification for icon clicks
    const notification = document.createElement('div');
    notification.id = 'update-notification';
    notification.style.cssText = `
        position: fixed;
        bottom: 20px;
        left: 50%;
        transform: translateX(-50%);
        background: linear-gradient(135deg, #0976ea 0%, #0d47a1 100%);
        color: white;
        padding: 20px;
        border-radius: 12px;
        box-shadow: 0 8px 32px rgba(0,0,0,0.3);
        z-index: 9999;
        animation: pwa-slideInUp 0.3s ease-out;
        width: 90%;
        max-width: 850px;
        text-align: center;
    `;

    notification.innerHTML = `
        <button id="dismiss-update" style="
            position: absolute;
            top: 10px;
            right: 15px;
            background: none;
            border: none;
            color: white;
            opacity: 0.8;
            font-size: 20px;
            line-height: 1;
            padding: 0;
            cursor: pointer;
            width: 24px;
            height: 24px;
            display: flex;
            align-items: center;
            justify-content: center;
            border-radius: 50%;
            transition: opacity 0.2s, background-color 0.2s;
        ">&times;</button>

        <div style="display: flex; flex-direction: column; align-items: center; padding: 0 30px;">
            <p style="margin: 0 0 12px 0; font-weight: 600; font-size: 1.1rem;">A new version is available!</p>
            <button id="reload-button" style="
                background: rgba(255,255,255,0.2);
                border: 1px solid rgba(255,255,255,0.3);
                color: white;
                padding: 12px 25px;
                border-radius: 8px;
                cursor: pointer;
                font-weight: 600;
                font-size: 1rem;
                transition: background-color 0.2s;
                white-space: nowrap;
                width: 100%;
                max-width: 220px;
            ">Install Now</button>
        </div>
    `;

    if (!document.getElementById('update-notification-styles')) {
        const style = document.createElement('style');
        style.id = 'update-notification-styles';
        style.textContent = `
            @keyframes pwa-slideInUp {
                from {
                    transform: translate(-50%, 100%);
                    opacity: 0;
                }
                to {
                    transform: translate(-50%, 0);
                    opacity: 1;
                }
            }
            #reload-button:hover {
                background: rgba(255,255,255,0.3) !important;
            }
            #dismiss-update:hover {
                opacity: 1 !important;
                background-color: rgba(255,255,255,0.2) !important;
            }
        `;
        document.head.appendChild(style);
    }

    document.body.appendChild(notification);
    updateIcon.style.display = 'none';

    // Add event handlers
    const reloadButton = notification.querySelector('#reload-button');
    const dismissButton = notification.querySelector('#dismiss-update');

    if (reloadButton) {
        reloadButton.addEventListener('click', (e) => {
            e.stopPropagation();
            reloadButton.textContent = 'Installing...';
            reloadButton.disabled = true;
            reloadButton.style.opacity = '0.7';
            performUpdate();
        });
    }

    if (dismissButton) {
        dismissButton.addEventListener('click', (e) => {
            e.stopPropagation();
            notification.style.display = 'none';
            setUpdateDismissed();
            showUpdateIcon();
            console.log('Update notification dismissed, showing update icon');
        });
    }
}

function isStandalone() {
    return window.matchMedia('(display-mode: standalone)').matches ||
        window.navigator.standalone ||
        document.referrer.includes('android-app://');
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializePWA);
} else {
    initializePWA();
}

// Export functions for debugging
if (typeof window !== 'undefined') {
    window.PWAManager = {
        checkForUpdates,
        isStandalone,
        showCustomInstallPrompt: !isSafariOnIOS ? showCustomInstallPrompt : null,
        showUpdateIcon,
        createUpdateIcon,
        setUpdateAvailable,
        isUpdateAvailable,
        checkForWaitingServiceWorker,
        setOutdatedFlag,
        clearOutdatedFlag,
        isAppOutdated,
        performUpdate
    };
}
