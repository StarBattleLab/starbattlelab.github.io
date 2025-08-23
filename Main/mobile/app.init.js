/**
 * **********************************************************************************
 * Title: Star Battle Application Initializer and Event Wiring
 * **********************************************************************************
 * @author Isaiah Tadrous
 * @version 1.0.3
 * *-------------------------------------------------------------------------------
 * This script serves as the main entry point for the Star Battle web application.
 * It waits for the DOM to be fully loaded and then executes the primary `init`
 * function. This function is responsible for wiring up all interactive UI
 * elements to their corresponding logic handlers. It defines a custom helper
 * for creating responsive event listeners that work seamlessly on both touch
 * and mouse-based devices. It connects all buttons, modals, settings toggles,
 * and the main grid interaction events to the appropriate functions, effectively
 * bootstrapping the entire application and making it ready for user interaction.
 * **********************************************************************************
 */

// --- APPLICATION INITIALIZATION ---

document.addEventListener('DOMContentLoaded', () => {
    /**
     * @description Main initialization function that sets up the entire application.
     * It wires all event listeners and prepares the UI for interaction.
     * @returns {void}
     */
    function init() {
        // --- RESPONSIVE EVENT LISTENER HELPER ---

        /**
         * Attaches event listeners for both touch and click events to an element,
         * preventing the common issue of both events firing on touch devices.
         * It also adds a visual 'active' class during touch interactions.
         * @param {HTMLElement} element - The DOM element to attach the listener to.
         * @param {Function} callback - The function to execute when the event is triggered.
         * @returns {void}
         */
        function addResponsiveListener(element, callback) {
            if (!element) return;
            let touchHandled = false; // Flag to prevent click from firing after touch
            const onTouchEnd = () => element.classList.remove('btn-active');

            // Handle touch start for immediate feedback and action
            element.addEventListener('touchstart', (e) => {
                element.classList.add('btn-active'); // Add visual feedback for touch
                e.preventDefault();
                touchHandled = true;
                callback(e);
                // Clean up by removing the active class once the touch ends or is cancelled
                element.addEventListener('touchend', onTouchEnd, { once: true });
                element.addEventListener('touchcancel', onTouchEnd, { once: true });
            }, { passive: false });

            // Handle click events, but ignore them if a touch event was just handled
            element.addEventListener('click', (e) => {
                if (touchHandled) {
                    touchHandled = false;
                    return;
                }
                callback(e);
            });
        }

        // --- MAIN UI EVENT WIRING ---
		
		loadSettings();

        // Populate the puzzle size selector dropdown on startup
        populateSizeSelector();

        // Initialize the import UI when the app loads
        setupImportInterface({ importPuzzleString, setStatus });

        // Wire up all the primary action buttons to their respective functions
        addResponsiveListener(backToHomeBtn, showHomeScreen);
        addResponsiveListener(newPuzzleBtn, fetchNewPuzzle);
        addResponsiveListener(savePuzzleBtn, handleSave);
        addResponsiveListener(checkSolutionBtn, () => checkSolution(true));
        addResponsiveListener(importBtn, handleImport);
        addResponsiveListener(exportBtn, handleExport);
        addResponsiveListener(undoBtn, undo);
        addResponsiveListener(redoBtn, redo);

        // Wire up the 'Clear' button with mode-specific logic
        addResponsiveListener(clearBtn, () => {
            let action = { type: null };
            // The 'Clear' button's behavior depends on the current active mode
            switch (state.activeMode) {
                case 'draw': // Clear the drawing canvas
                    if (!state.bufferCtx || state.bufferCanvas.width === 0) return;
                    action = { type: 'clearDraw', before: state.bufferCtx.getImageData(0, 0, state.bufferCanvas.width, state.bufferCanvas.height) };
                    state.bufferCtx.clearRect(0, 0, state.bufferCanvas.width, state.bufferCanvas.height);
                    redrawAllOverlays();
                    break;
                case 'border': // Clear all custom borders
                    if (state.customBorders.length === 0) return;
                    action = { type: 'clearBorder', before: deepCopyBorders(state.customBorders) };
                    state.customBorders = [];
                    redrawAllOverlays();
                    break;
                case 'mark': // Clear all player marks (stars, Xs, dots)
                    action = { type: 'clearMarks', before: JSON.parse(JSON.stringify(state.playerGrid)) };
                    _internalClearMarks();
                    renderAllMarks();
                    updateErrorHighlightingUI();
                    break;
            }
            if (action.type) pushHistory(action);
        });

        // Wire up the button that toggles between placing 'X's and dots
        addResponsiveListener(toggleMarkBtn, () => {
            state.markIsX = !state.markIsX;
            toggleMarkBtn.textContent = state.markIsX ? "Dots" : "Xs";
			saveSettings();
            renderAllMarks(); // Re-render marks to reflect the change
            updateErrorHighlightingUI();
        });

        /**
         * Switches the application's active interaction mode (e.g., 'mark', 'draw').
         * @param {string} newMode - The mode to switch to ('mark', 'draw', 'border').
         * @returns {void}
         */
        function switchMode(newMode) {
            state.activeMode = newMode;
            updateModeUI();
            updateUndoRedoButtons();
        }

        /**
         * Handles the logic for the "Find/View Solution" button. It either fetches
         * the solution if not present or toggles its visibility.
         * @returns {void}
         */
        function handleSolutionToggle() {
            if (!state.solution) {
                findSolution(); // Fetch solution from the server
            } else {
                // Toggle the visibility of the solution overlay
                state.isViewingSolution = !state.isViewingSolution;
                gridContainer.classList.toggle('solution-mode', true);
                updateSolutionButtonUI();
                redrawAllOverlays();
            }
        }

        // --- MODAL AND MENU EVENT LISTENERS ---

        // Wire up mode-switching buttons and modal triggers
        addResponsiveListener(markModeBtn, () => switchMode('mark'));
        addResponsiveListener(drawModeBtn, () => switchMode('draw'));
        addResponsiveListener(borderModeBtn, () => switchMode('border'));
        addResponsiveListener(findSolutionBtn, handleSolutionToggle);
        addResponsiveListener(loadPuzzleBtn, () => {
            populateLoadModal();
            loadModal.classList.remove('hidden');
        });

        // Wire up modal close buttons
        addResponsiveListener(modalCloseBtn, () => loadModal.classList.add('hidden'));
        addResponsiveListener(settingsBtn, () => settingsModal.classList.remove('hidden'));
        addResponsiveListener(settingsModalCloseBtn, () => settingsModal.classList.add('hidden'));

        // Wire up the hamburger menu for mobile view
        addResponsiveListener(hamburgerMenuBtn, (e) => {
            e.stopPropagation(); // Prevent this click from closing the menu immediately
            puzzleActionsTab.classList.toggle('is-open');
        });

        // Prevent clicks inside the menu from closing it
        puzzleActionsTab.addEventListener('click', (e) => e.stopPropagation());
        // Add a global click listener to close the menu when clicking outside of it
        window.addEventListener('click', () => {
            if (puzzleActionsTab.classList.contains('is-open')) {
                puzzleActionsTab.classList.remove('is-open');
            }
        });

        // --- SETTINGS TOGGLE LISTENERS ---

        bwModeToggle.addEventListener('change', (e) => { state.isBwMode = e.target.checked; saveSettings(); renderGrid(); });
        highlightErrorsToggle.addEventListener('change', (e) => { state.highlightErrors = e.target.checked; saveSettings(); updateErrorHighlightingUI(); });
        autoXAroundToggle.addEventListener('change', (e) => { state.autoXAroundStars = e.target.checked; saveSettings();});
        autoXMaxLinesToggle.addEventListener('change', (e) => { state.autoXOnMaxLines = e.target.checked; saveSettings();});
        autoXMaxRegionsToggle.addEventListener('change', (e) => { state.autoXOnMaxRegions = e.target.checked; saveSettings();});

        // --- LOAD/SAVE MODAL EVENT LISTENERS ---

        // Use event delegation for handling clicks within the load puzzle modal
        modalContent.addEventListener('click', async (e) => {
            const saveItem = e.target.closest('.save-item');
            const deleteBtn = e.target.closest('.delete-save-btn');

            if (deleteBtn) { // Handle deleting a save
                e.stopPropagation();
                const indexToDelete = parseInt(deleteBtn.dataset.index, 10);
                if (confirm('Are you sure you want to delete this save?')) {
                    let saves = JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY) || '[]');
                    saves.splice(indexToDelete, 1);
                    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(saves));
                    populateLoadModal(); // Refresh the modal content
                }
            } else if (saveItem) { // Handle loading a save
                const indexToLoad = parseInt(saveItem.dataset.index, 10);
                const saves = JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY) || '[]');
                const saveToLoad = saves[indexToLoad];
                if (!saveToLoad) return;

                const success = await importPuzzleString(saveToLoad.sbn);
                if (success) {
                    // Restore custom borders from the save file
                    if (saveToLoad.borderData) {
                        state.customBorders = saveToLoad.borderData.map(border => ({
                            color: border.color, path: new Set(border.path)
                        }));
                    }
                    // Restore the drawing canvas from the save file
                    if (saveToLoad.drawingData) {
                        const img = new Image();
                        img.onload = () => {
                            if (state.bufferCtx) state.bufferCtx.drawImage(img, 0, 0);
                            redrawAllOverlays();
                        };
                        img.src = saveToLoad.drawingData;
                    }
                    redrawAllOverlays();
                    loadModal.classList.add('hidden');
                }
            }
        });

        // --- DRAWING TOOL EVENT LISTENERS ---

        // Brush size slider
        brushSizeSlider.addEventListener('input', (e) => {
            const newSize = parseInt(e.target.value, 10);
            state.brushSize = newSize;
            brushSizeValue.textContent = newSize;
        });

        // Color picker controls
        addResponsiveListener(customColorBtn, () => { state.colorToReplace = state.currentColor; htmlColorPicker.click(); });
        htmlColorPicker.addEventListener('input', (e) => selectColor(e.target.value));
        htmlColorPicker.addEventListener('change', (e) => saveCustomColor(e.target.value));

        // Use event delegation for the color palette slots
        const colorSlotsContainer = document.getElementById('color-slots-container');
        if (colorSlotsContainer) {
            colorSlotsContainer.addEventListener('click', (e) => {
                const target = e.target.closest('.color-slot');
                if (!target) return;
                if (target.dataset.color) { // A preset or custom color was clicked
                    selectColor(target.dataset.color);
                } else if (target.dataset.customIndex) { // An empty slot was clicked
                    state.colorToReplace = null; // We are adding a new color, not replacing
                    htmlColorPicker.click();
                }
            });
        }

        // Add responsive listeners to all settings toggles to allow tapping the entire row
        document.querySelectorAll('.setting-item .toggle-switch').forEach(toggleLabel => {
            addResponsiveListener(toggleLabel, (e) => {
                const input = toggleLabel.querySelector('input[type="checkbox"]');
                if (input) {
                    input.checked = !input.checked; // Manually flip the checkbox state
                    input.dispatchEvent(new Event('change', { bubbles: true })); // Programmatically fire the change event
                }
            });
        });

        // --- CORE INTERACTION EVENT LISTENERS ---

        // Attach listeners for mouse and touch interactions on the main grid and drawing canvas
        gridContainer.addEventListener('mousedown', handleInteractionStart);
        drawCanvas.addEventListener('mousedown', handleInteractionStart);
        gridContainer.addEventListener('touchstart', handleInteractionStart, { passive: false });
        drawCanvas.addEventListener('touchstart', handleInteractionStart, { passive: false });
        window.addEventListener('mousemove', handleInteractionMove);
        window.addEventListener('touchmove', handleInteractionMove, { passive: false });
        window.addEventListener('mouseup', handleInteractionEnd);
        window.addEventListener('touchend', handleInteractionEnd);
        window.addEventListener('touchcancel', handleInteractionEnd);

        // Prevent the default right-click context menu over the game area
        gridContainer.addEventListener('contextmenu', e => e.preventDefault());
        drawCanvas.addEventListener('contextmenu', e => e.preventDefault());

        // Resize the canvas whenever the browser window is resized
        window.addEventListener('resize', resizeCanvas);

        // --- FINAL INITIALIZATION ---

        // Set the initial screen and UI states
        showScreen('home');
        updateModeUI();
        renderColorPicker();
    }

    // Run the main initialization function once the DOM is ready
    init();

});
