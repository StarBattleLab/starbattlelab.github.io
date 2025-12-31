/**
 * **********************************************************************************
 * Title: Safari Progressive Web App Installation System
 * **********************************************************************************
 * @author Isaiah Tadrous
 * @version 2.2.1
 * *-------------------------------------------------------------------------------
 * Cross-platform PWA installation system specifically designed for Safari browsers.
 * Automatically detects Safari environments and presents user-friendly installation
 * prompts with step-by-step instructions for adding the web application to the
 * device home screen. Features responsive design, modal overlays, and proper
 * event handling for optimal user experience across iOS and macOS Safari.
 * **********************************************************************************
 */

// Detect Safari browser environment and check installation status
const isSafariCheck = /^((?!chrome|android|crios|fxios|opios).)*safari/i.test(navigator.userAgent) &&
                      navigator.vendor && navigator.vendor.indexOf('Apple') > -1;
const isInstalled = 'standalone' in window.navigator && window.navigator.standalone;

if (isSafariCheck && !isInstalled) {
    console.log('Safari detected - initializing install prompting');

    let promptShown = false;

    function showPrompt() {
        if (promptShown) return;
        promptShown = true;

        // Remove any existing prompts
        document.getElementById('safari-install-prompt')?.remove();

        const prompt = document.createElement('div');
        prompt.id = 'safari-install-prompt';
        prompt.style.cssText = `
            position: fixed;
            bottom: 20px;
            left: 50%;
            transform: translateX(-50%);
            background: linear-gradient(135deg, #0976ea 0%, #0d47a1 100%);
            color: white;
            padding: 20px;
            border-radius: 12px;
            box-shadow: 0 8px 32px rgba(0,0,0,0.3);
            z-index: 10000;
            animation: slideUp 0.4s ease-out;
            width: 90%;
            max-width: 850px;
        `;

        prompt.innerHTML = `
            <div style="display: flex; align-items: center; gap: 15px;">
                <div>
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                        <polyline points="7,10 12,15 17,10"/>
                        <line x1="12" y1="15" x2="12" y2="3"/>
                    </svg>
                </div>
                <div style="flex: 1;">
                    <div style="font-weight: 600; margin-bottom: 5px;">Install StarBattle App</div>
                    <div style="font-size: 0.9rem; opacity: 0.9;">Get instant access and play offline!</div>
                </div>
            </div>
            <div style="display: flex; gap: 10px; margin-top: 15px;">
                <button id="install-yes" style="
                    flex: 1; background: rgba(255,255,255,0.2); border: 1px solid rgba(255,255,255,0.3);
                    color: white; padding: 10px 15px; border-radius: 6px; font-weight: 600;
                    cursor: pointer; transition: all 0.2s;
                ">Install</button>
                <button id="install-no" style="
                    background: transparent; border: 1px solid rgba(255,255,255,0.3);
                    color: white; padding: 10px 15px; border-radius: 6px;
                    cursor: pointer; transition: all 0.2s;
                ">Later</button>
            </div>
        `;

        addStyles();
        document.body.appendChild(prompt);

        // Handle button clicks
        prompt.querySelector('#install-yes').addEventListener('click', () => {
            prompt.remove();
            showInstructions();
        });

        prompt.querySelector('#install-no').addEventListener('click', () => {
            prompt.remove(); // Dismiss prompt for current session without persistence
        });
    }

    function showInstructions() {
        const overlay = document.createElement('div');
        overlay.style.cssText = `
            position: fixed;
            inset: 0;
            background: rgba(0,0,0,0.6);
            z-index: 9998;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
            backdrop-filter: blur(4px);
        `;

        const modal = document.createElement('div');
        modal.style.cssText = `
            background: linear-gradient(135deg, #0976ea 0%, #0d47a1 100%);
            color: white;
            padding: 24px;
            border-radius: 16px;
            box-shadow: 0 20px 60px rgba(0,0,0,0.4);
            width: 100%;
            max-width: 500px;
            animation: zoomIn 0.3s ease-out;
        `;

        modal.innerHTML = `
            <div style="display: flex; align-items: center; gap: 15px; margin-bottom: 20px;">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2">
                    <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/>
                    <polyline points="16,6 12,2 8,6"/>
                    <line x1="12" y1="2" x2="12" y2="15"/>
                </svg>
                <div>
                    <div style="font-weight: 600; margin-bottom: 5px;">Install Instructions</div>
                    <div style="font-size: 0.9rem; opacity: 0.9;">Follow these steps:</div>
                </div>
            </div>
            <ol style="line-height: 1.8; padding-left: 20px; margin: 0 0 20px 0;">
                <li style="margin-bottom: 8px;">Tap the <strong>Share</strong> button at the bottom of Safari</li>
                <li style="margin-bottom: 8px;">Scroll down and tap <strong>"Add to Home Screen"</strong></li>
                <li>Tap <strong>"Add"</strong> to install the app</li>
            </ol>
            <button id="close-instructions" style="
                width: 100%;
                background: rgba(255,255,255,0.2);
                border: 1px solid rgba(255,255,255,0.3);
                color: white;
                padding: 12px 20px;
                border-radius: 8px;
                cursor: pointer;
                font-weight: 600;
                transition: all 0.2s;
            ">Got it!</button>
        `;

        overlay.appendChild(modal);
        document.body.appendChild(overlay);

        // Handle close events
        modal.querySelector('#close-instructions').addEventListener('click', () => overlay.remove());
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) overlay.remove();
        });
    }

    function addStyles() {
        if (document.getElementById('install-styles')) return;

        const style = document.createElement('style');
        style.id = 'install-styles';
        style.textContent = `
            @keyframes slideUp {
                from { transform: translateX(-50%) translateY(100%); opacity: 0; }
                to { transform: translateX(-50%) translateY(0); opacity: 1; }
            }
            @keyframes zoomIn {
                from { opacity: 0; transform: scale(0.9); }
                to { opacity: 1; transform: scale(1); }
            }
            #install-yes:hover, #install-no:hover, #close-instructions:hover {
                background: rgba(255,255,255,0.3) !important;
                transform: translateY(-1px);
            }
            @media (max-width: 360px) {
                #safari-install-prompt {
                    left: 10px !important;
                    right: 10px !important;
                    transform: none !important;
                    max-width: none !important;
                }
            }
        `;
        document.head.appendChild(style);
    }

    function init() {
        setTimeout(showPrompt, 700);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // Development and debugging interface for prompt management
    window.safariInstallPrompt = {
        show: showPrompt,
        stats: () => ({
            promptShown
        })
    };

} else {
    console.log('Not Safari or already installed - install prompting disabled');
}
