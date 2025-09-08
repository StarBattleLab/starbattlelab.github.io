/**
**********************************************************************************
* Title:       UI Management & Interaction Controller
*
* @author      Isaiah Tadrous
* @version     1.1.0
* -------------------------------------------------------------------------------
* Description: This script manages the user interface (UI) and handles all user
* interactions. Its primary features include
* managing different UI screens (e.g., home vs. game), controlling UI states 
* like loading and status messages, and handling all mouse and touch input for
* interacting with the puzzle grid. It supports various interaction
* modes such as marking cells, drawing free-form annotations on a
* canvas overlay, and creating custom borders. The script also
* manages an undo/redo history for player actions.
* -------------------------------------------------------------------------------
* Usage:       This script is intended to be used as part of our mobile web
* application. It must be included in an HTML page that provides
* the necessary DOM elements it references (e.g., screens, buttons,
* canvases).
**********************************************************************************
*/

// --- UI MANAGEMENT & INTERACTION CONTROLLER ---

// --- SCREEN & UI STATE FUNCTIONS ---

/**
 * Toggles the visibility of different application screens (e.g., home, game).
 * @param {string} screenName - The name of the screen to show ('home' or 'game').
 * @returns {void}
 */
function showScreen(screenName) {
    homeScreen.classList.toggle('hidden', screenName !== 'home');
    gameScreen.classList.toggle('hidden', screenName !== 'game');
    if (screenName === 'game') {
        setTimeout(resizeCanvas, 50);
    }
}

/**
 * Prompts the user for confirmation before returning to the home screen.
 * If confirmed, it shows the home screen, potentially losing unsaved progress.
 * Also resets any shared puzzle state.
 * @returns {void}
 */
function showHomeScreen() {
    if(confirm("Are you sure you want to exit to the main menu? Your current progress will be lost unless saved.")) {
        stopTimer();
        // Clear the shared puzzle state and revert the home screen UI
        state.puzzleFromUrl = null;
        updateHomeScreenForSharedPuzzle();
        showScreen('home');
    }
}

/**
 * Modifies the home screen UI when a shared puzzle is detected.
 * It changes labels, button text, and disables irrelevant options. It also reverts
 * the UI back to the default state.
 */
function updateHomeScreenForSharedPuzzle() {
    const sizeDifficultyLabel = document.querySelector('label[for="size-select"]');
    if (state.puzzleFromUrl) {
        if (sizeDifficultyLabel) {
            sizeDifficultyLabel.textContent = "Shared Puzzle";
        }
        puzzleSelectDisplay.textContent = "Puzzle from URL is ready";
        
        newPuzzleBtn.textContent = "Play";
        
        loadPuzzleBtn.classList.add('hidden');
        importBtn.classList.add('hidden');
    } else {
        // Revert to the default state
        if (sizeDifficultyLabel) {
            sizeDifficultyLabel.textContent = "Size & Difficulty";
        }
        
        newPuzzleBtn.textContent = "New Puzzle";
        
        loadPuzzleBtn.classList.remove('hidden');
        importBtn.classList.remove('hidden');
        
        // Let the normal function restore the selector text
        updatePuzzleOptionStates(); 
    }
}


/**
 * Controls the visibility and effect of the loading overlay.
 * @param {boolean} isLoading - If true, shows the loading spinner and dims the UI; otherwise, hides it.
 * @returns {void}
 */
function setLoading(isLoading) {
    state.isLoading = isLoading;
    loadingSpinner.style.display = isLoading ? 'flex' : 'none';
    homeScreen.style.pointerEvents = isLoading ? 'none' : 'auto';
    homeScreen.style.opacity = isLoading ? '0.7' : '1';
}

/**
 * Displays a status message to the user with appropriate color-coding for success, failure, or neutral info.
 * The message fades out after a specified duration.
 * @param {string} message - The text message to display.
 * @param {boolean|null} isSuccess - True for green (success), false for red (failure), null for yellow (neutral/warning).
 * @param {number} [duration=3000] - The time in milliseconds before the message fades out. A duration of 0 means it persists.
 * @returns {void}
 */
function setStatus(message, isSuccess, duration = 3000) {
    solverStatus.textContent = message;
    solverStatus.classList.remove('text-green-400', 'text-red-400', 'text-yellow-400', 'opacity-0');
    if (isSuccess === true) solverStatus.classList.add('text-green-400');
    else if (isSuccess === false) solverStatus.classList.add('text-red-400');
    else solverStatus.classList.add('text-yellow-400');
    solverStatus.classList.remove('opacity-0');
    if (duration > 0) {
        setTimeout(() => solverStatus.classList.add('opacity-0'), duration);
    }
}

/**
 * Updates the timer display on the UI. Switches format if time exceeds 99 minutes.
 * @returns {void}
 */
function updateTimer() {
    if (!state.puzzleStartTime || !gameTimer) return;

    const now = new Date();
    const elapsed = now - state.puzzleStartTime; // in milliseconds
    let formattedTime;

    // If elapsed time is over 99 minutes, switch to HH:MM:SS format
    if (elapsed > 5940000) { // 99 minutes * 60 seconds * 1000 ms
        const hours = Math.floor(elapsed / 3600000);
        const minutes = Math.floor((elapsed % 3600000) / 60000);
        const seconds = Math.floor((elapsed % 60000) / 1000);
        formattedTime = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    } else {
        const minutes = Math.floor(elapsed / 60000);
        const seconds = Math.floor((elapsed % 60000) / 1000);
        const milliseconds = elapsed % 1000;
        formattedTime = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}:${String(milliseconds).padStart(3, '0')}`;
    }

    gameTimer.textContent = formattedTime;
}

/**
 * Starts the gameplay timer.
 * @returns {void}
 */
function startTimer() {
    stopTimer(); // Ensure no multiple timers are running
    if (gameTimer) {
        gameTimer.classList.toggle('hidden', !state.showTimer);
        gameTimer.textContent = '00:00:000';
    }
    // Update interval based on whether we need to show milliseconds
    const updateInterval = (new Date() - state.puzzleStartTime) > 5940000 ? 1000 : 50;
    state.timerInterval = setInterval(updateTimer, updateInterval);
}

/**
 * Stops the gameplay timer.
 * @returns {void}
 */
function stopTimer() {
    if (state.timerInterval) {
        clearInterval(state.timerInterval);
        state.timerInterval = null;
    }
}

/**
 * Updates the puzzle information bar with difficulty, size, and stars.
 * @returns {void}
 */
function updatePuzzleInfoBar() {
    if (puzzleDifficulty && puzzleSizeInfo) {
        if (state.gridDim > 0) {
            const starText = `${state.starsPerRegion} ★`;
            const sizeText = `${state.gridDim}x${state.gridDim}`;

            // Check if a difficulty is defined for the puzzle
            if (state.puzzleDifficulty && state.puzzleDifficulty !== `${state.starsPerRegion}-star`) {
                // If difficulty exists:
                // Left side shows: "Difficulty"
                puzzleDifficulty.textContent = state.puzzleDifficulty;
                // Right side shows: "Size | Stars"
                puzzleSizeInfo.textContent = `${sizeText} / ${starText}`;
            } else {
                // If no difficulty exists:
                // Left side shows: "Size"
                puzzleDifficulty.textContent = sizeText;
                // Right side shows: "Stars"
                puzzleSizeInfo.textContent = starText;
            }
        } else {
            // If no puzzle is loaded, clear both text fields
            puzzleDifficulty.textContent = '';
            puzzleSizeInfo.textContent = '';
        }
    }
}


/**
 * Extracts a difficulty name from a puzzle definition text.
 * @param {object} def - The puzzle definition object.
 * @returns {string} The difficulty name.
 */
function getPuzzleDifficultyName(def) {
    const match = def.text.match(/, (.*?)\)/);
    if (match && match[1]) return match[1];
    if (def.text.includes("Unsorted")) return "Unsorted";
    return "None"; // Fallback for puzzles without explicit difficulty
}

/**
 * Updates the enabled/disabled and selected states of all puzzle option buttons.
 */
function updatePuzzleOptionStates() {
    // This part remains the same: update button availability and selection style
    const { dim, stars, difficulty } = state.currentPuzzleSelection;
    document.querySelectorAll('.puzzle-option-btn').forEach(btn => {
        const type = btn.dataset.type;
        const value = btn.dataset.value;
        let isAvailable = false;
        let potentialPuzzles = state.puzzleDefs;
        if (type !== 'dim' && dim !== null) potentialPuzzles = potentialPuzzles.filter(p => p.dim == dim);
        if (type !== 'stars' && stars !== null) potentialPuzzles = potentialPuzzles.filter(p => p.stars == stars);
        if (type !== 'difficulty' && difficulty !== null) potentialPuzzles = potentialPuzzles.filter(p => getPuzzleDifficultyName(p) === difficulty);
        if (type === 'dim') isAvailable = potentialPuzzles.some(p => p.dim == value);
        else if (type === 'stars') isAvailable = potentialPuzzles.some(p => p.stars == value);
        else if (type === 'difficulty') isAvailable = potentialPuzzles.some(p => getPuzzleDifficultyName(p) === value);
        btn.classList.toggle('unavailable', !isAvailable);
        btn.classList.toggle('selected', state.currentPuzzleSelection[type] == value);
    });

    // --- REVISED LOGIC FOR DETERMINING EFFECTIVE SELECTION AND DISPLAY TEXT ---
    let finalText;
    const hasSelection = dim !== null || stars !== null || difficulty !== null;

    // 1. Check if the user's direct selection is valid
    let primaryFilterResult = state.puzzleDefs;
    if (dim !== null) primaryFilterResult = primaryFilterResult.filter(p => p.dim == dim);
    if (stars !== null) primaryFilterResult = primaryFilterResult.filter(p => p.stars == stars);
    if (difficulty !== null) primaryFilterResult = primaryFilterResult.filter(p => getPuzzleDifficultyName(p) === difficulty);

    if (!hasSelection) {
        // CASE 1: No filters active.
        state.effectivePuzzleSelection = { dim: null, stars: null, difficulty: null };
        finalText = "Random Puzzle";
    } else if (primaryFilterResult.length > 0) {
        // CASE 2: The selection is valid. Effective selection matches the user's choice.
        state.effectivePuzzleSelection = { ...state.currentPuzzleSelection };
        let parts = [];
        if (dim) parts.push(`${dim}x${dim}`);
        if (stars) parts.push(`${stars} ★`);
        if (difficulty) parts.push(difficulty);
        finalText = parts.join(' / ');
    } else {
        // CASE 3: Conflict. The user's combined selection is invalid.
        // Keep all selected criteria but add a flag to use OR logic when fetching.
        state.effectivePuzzleSelection = { ...state.currentPuzzleSelection, useOrLogic: true };

        const parts = [];
        if (dim) parts.push(`${dim}x${dim}`);
        if (stars) parts.push(`${stars} ★`);
        if (difficulty) parts.push(difficulty);

        // Verify that at least one of the selected criteria is valid on its own.
        const anyIndividualCriteriaIsValid =
            (dim !== null && state.puzzleDefs.some(p => p.dim == dim)) ||
            (stars !== null && state.puzzleDefs.some(p => p.stars == stars)) ||
            (difficulty !== null && state.puzzleDefs.some(p => getPuzzleDifficultyName(p) === difficulty));

        if (anyIndividualCriteriaIsValid) {
            finalText = `Random ${parts.join(' (or) ')}`;
        } else {
            // This is a rare case where none of the selected criteria exist at all.
            state.effectivePuzzleSelection = { dim: null, stars: null, difficulty: null };
            finalText = "Random Puzzle";
        }
    }

    puzzleSelectDisplay.textContent = finalText;

    // Determine the correct prefix for the success modal button.
    let prefix = "Play"; // Default to "Play"

    // NEW, SIMPLIFIED LOGIC:
    // If a puzzle was just solved and the user hasn't changed the filters yet,
    // the prefix is "Another".
    if (state.lastSolvedPuzzle) {
        prefix = "Another";
    }

    playAnotherBtn.textContent = `${prefix} ${finalText}`;
}

/**
 * Populates the new puzzle selection modal with a dynamic filtering interface.
 */
function populatePuzzleSelectorModal() {
    // Clear any previous content
    puzzleSizeGrid.innerHTML = '';
    puzzleStarCountList.innerHTML = '';
    puzzleDifficultyList.innerHTML = '';

    // Get all unique options
    const allDims = [...new Set(state.puzzleDefs.map(p => p.dim))].sort((a, b) => a - b);
    const allStars = [...new Set(state.puzzleDefs.map(p => p.stars))].sort((a, b) => a - b);
    const allDifficulties = [...new Set(state.puzzleDefs.map(getPuzzleDifficultyName))];

    const createOptionButton = (container, text, type, value) => {
        const btn = document.createElement('button');
        btn.className = 'puzzle-option-btn w-full text-center p-3 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors text-lg font-semibold border-2 border-transparent';
        btn.textContent = text;
        btn.dataset.type = type;
        btn.dataset.value = value;

        btn.addEventListener('click', () => {
            // MODIFIED: Handle interaction when a shared puzzle is loaded.
            if (state.puzzleFromUrl) {
                if (confirm("Changing options will cancel the shared puzzle. Return to the main menu to choose a new puzzle?")) {
                    state.puzzleFromUrl = null;
                    updateHomeScreenForSharedPuzzle();
                    puzzleSelectModal.classList.add('hidden');
                }
                return; // Stop further execution if a shared puzzle was active.
            }

            state.lastSolvedPuzzle = null;

            // Toggle selection
            if (state.currentPuzzleSelection[type] == value) {
                state.currentPuzzleSelection[type] = null;
            } else {
                state.currentPuzzleSelection[type] = value;
            }
            updatePuzzleOptionStates();
            saveSettings();
        });
        container.appendChild(btn);
    };

    // Create all buttons
    allDims.forEach(dim => createOptionButton(puzzleSizeGrid, `${dim}x${dim}`, 'dim', dim));
    allStars.forEach(stars => createOptionButton(puzzleStarCountList, `${stars} ★`, 'stars', stars));
    allDifficulties.forEach(diff => createOptionButton(puzzleDifficultyList, diff, 'difficulty', diff));

    // Set initial state based on current selection
    updatePuzzleOptionStates();
}


/**
 * Updates the appearance and text of the "Solve/View Solution" button based on the current solution state.
 * @returns {void}
 */
function updateSolutionButtonUI() {
    if (state.solution) {
        if (state.isViewingSolution) {
            findSolutionBtn.textContent = 'Hide Solution';
        } else {
            findSolutionBtn.textContent = 'View Solution';
        }
        findSolutionBtn.classList.remove('bg-purple-600');
        findSolutionBtn.classList.add('bg-yellow-600');
    } else {
        findSolutionBtn.textContent = 'Solve';
        findSolutionBtn.classList.remove('bg-yellow-600');
        findSolutionBtn.classList.add('bg-purple-600');
    }
}

/**
 * Updates the UI controls based on the currently active interaction mode ('mark', 'draw', 'border').
 * Toggles button styles and shows/hides contextual controls like color pickers and brush sizes.
 * @returns {void}
 */
function updateModeUI() {
    const isMarking = state.activeMode === 'mark';
    const isDrawing = state.activeMode === 'draw';
    const isBordering = state.activeMode === 'border';

    markModeBtn.classList.toggle('selected', isMarking);
    drawModeBtn.classList.toggle('selected', isDrawing);
    borderModeBtn.classList.toggle('selected', isBordering);

    toggleMarkBtn.style.display = isMarking ? 'block' : 'none';

    const showContextualControls = isDrawing || isBordering;
    contextualControls.classList.toggle('hidden', !showContextualControls);
    drawCanvas.style.pointerEvents = showContextualControls ? 'auto' : 'none';

    if (showContextualControls) {
        // Controls specific to Drawing mode
        brushSizeWrapper.classList.toggle('hidden', !isDrawing);
        if (isDrawing) {
            drawEraserBtn.classList.toggle('selected', state.isDrawEraserActive);
        }

        // Controls specific to Border mode
        borderToolsWrapper.classList.toggle('hidden', !isBordering);
        if (isBordering) {
            borderEraserBtn.classList.toggle('selected', state.isBorderEraserActive);
        }

        // Color picker is shared but has conditions
        const showColorPicker = (isDrawing && !state.isDrawEraserActive) || (isBordering && !state.isBorderEraserActive);
        colorPickerWrapper.classList.toggle('hidden', !showColorPicker);
    }

    if (isDrawing) clearBtn.title = 'Clear all drawings';
    else if (isBordering) clearBtn.title = 'Clear all custom borders';
    else clearBtn.title = 'Clear all stars and marks';
}

/**
 * Updates the enabled/disabled state of the undo and redo buttons based on the history stack for the current mode.
 * @returns {void}
 */
function updateUndoRedoButtons() {
    const modeHistory = state.history[state.activeMode];
    if (!modeHistory) {
        undoBtn.disabled = true;
        redoBtn.disabled = true;
        return;
    }
    undoBtn.disabled = modeHistory.pointer < 0;
    redoBtn.disabled = modeHistory.pointer >= modeHistory.stack.length - 1;
}


// --- MOUSE/TOUCH INPUT HANDLING ---

/**
 * Calculates the event's position relative to the grid container.
 * Normalizes mouse and touch events to provide consistent coordinates.
 * @param {MouseEvent|TouchEvent} e - The browser's mouse or touch event.
 * @returns {{x: number, y: number, row: number, col: number, onGrid: boolean}} An object containing pixel coordinates (x, y), grid coordinates (row, col), and a flag indicating if the event was on the grid.
 */
function getEventPos(e) {
    const rect = gridContainer.getBoundingClientRect();
    let event = e;
    if (e.changedTouches && e.changedTouches.length > 0) {
        event = e.changedTouches[0];
    }

    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    const onGrid = x >= 0 && x < rect.width && y >= 0 && y < rect.height;
    if (!onGrid) return { onGrid: false };

    const col = Math.floor(x / (rect.width / state.gridDim));
    const row = Math.floor(y / (rect.height / state.gridDim));

    return { x, y, row, col, onGrid };
}

/**
 * Handles the initiation of an interaction (mousedown or touchstart) on the grid.
 * Sets up initial state for dragging, drawing, or bordering.
 * @param {MouseEvent|TouchEvent} e - The browser's start event.
 * @returns {void}
 */
function handleInteractionStart(e) {
    if (state.isLeftDown) return;
    if (e.changedTouches) {
        state.activeTouchId = e.changedTouches[0].identifier;
    }
    const pos = getEventPos(e);
    if (!pos.onGrid) {
        state.activeTouchId = null;
        return;
    }
    e.preventDefault();
    state.isLeftDown = true;
    state.isDragging = false;
    state.lastPos = pos;
    state.currentDragChanges = [];
    state.currentEraseChanges = [];

    if (state.activeMode === 'draw') {
        preActionState = state.bufferCtx.getImageData(0, 0, state.bufferCanvas.width, state.bufferCanvas.height);
        const painter = (ctx) => {
            ctx.globalCompositeOperation = state.isDrawEraserActive ? 'destination-out' : 'source-over';
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.strokeStyle = state.currentColor;
            ctx.lineWidth = state.brushSize;
            ctx.beginPath();
            ctx.moveTo(pos.x, pos.y);
        };
        painter(drawCtx);
        if (state.bufferCtx) painter(state.bufferCtx);
    } else if (state.activeMode === 'border' && !state.isBorderEraserActive) {
        state.currentBorderPath = new Set([`${pos.row},${pos.col}`]);
        redrawAllOverlays();
    }
}

/**
 * Handles the movement part of an interaction (mousemove or touchmove).
 * Optimized with requestAnimationFrame to prevent performance issues.
 * Processes drawing lines, dragging marks, or extending borders.
 * @param {MouseEvent|TouchEvent} e - The browser's move event.
 * @returns {void}
 */
function handleInteractionMove(e) {
    if (!state.isLeftDown) return;
    if (e.changedTouches && e.changedTouches[0].identifier !== state.activeTouchId) return;

    // Cancel any previously scheduled frame to ensure only the latest event is processed.
    if (state.animationFrameId) {
        cancelAnimationFrame(state.animationFrameId);
    }

    state.animationFrameId = window.requestAnimationFrame(() => {
        // The frame is running, so clear the ID.
        state.animationFrameId = null;

        const pos = getEventPos(e);
        if (!pos.onGrid) {
            handleInteractionEnd(e);
            return;
        }
        if (state.lastPos && (pos.row !== state.lastPos.row || pos.col !== state.lastPos.col)) {
            state.isDragging = true;
        }
        if (state.activeMode === 'mark' && state.isDragging) {
            if (state.currentDragChanges.length === 0 && state.lastPos) {
                const { row, col } = state.lastPos;
                if (state.playerGrid[row][col] === 0) {
                    if (applyMarkChange(row, col, 0, 2)) {
                        state.currentDragChanges.push({ r: row, c: col, from: 0, to: 2 });
                    }
                }
            }
            const { row, col } = pos;
            if (state.playerGrid[row][col] === 0) {
                if (applyMarkChange(row, col, 0, 2)) {
                    state.currentDragChanges.push({ r: row, c: col, from: 0, to: 2 });
                }
            }
        } else if (state.activeMode === 'draw') {
            state.isDragging = true;
            const painter = (ctx) => {
                if (!state.lastPos) return;
                ctx.lineTo(pos.x, pos.y);
                ctx.stroke();
                ctx.beginPath();
                ctx.moveTo(pos.x, pos.y);
            };
            if (state.isDrawEraserActive) {
                // When erasing, only modify the buffer canvas. Then, call a full redraw
                // to show the result without affecting the border overlay on the visible canvas.
                if (state.bufferCtx) painter(state.bufferCtx);
                redrawAllOverlays();
            } else {
                // For normal drawing, update both canvases for better performance.
                painter(drawCtx);
                if (state.bufferCtx) painter(state.bufferCtx);
            }
        } else if (state.activeMode === 'border') {
            state.isDragging = true;
            if (state.isBorderEraserActive) {
                const cellCoord = `${pos.row},${pos.col}`;
                for (let i = state.customBorders.length - 1; i >= 0; i--) {
                    const border = state.customBorders[i];
                    if (border.path.has(cellCoord) && !state.currentEraseChanges.some(c => c.cell === cellCoord)) {
                        state.currentEraseChanges.push({ borderIndex: i, cell: cellCoord });
                        border.path.delete(cellCoord);
                        break;
                    }
                }
            } else {
                state.currentBorderPath.add(`${pos.row},${pos.col}`);
            }
            redrawAllOverlays();
        }
        state.lastPos = pos;
    });
}

/**
 * Handles the end of an interaction (mouseup or touchend).
 * Finalizes the action (e.g., placing a star, finishing a drawing) and pushes the change to the history stack for undo/redo.
 * @param {MouseEvent|TouchEvent} e - The browser's end event.
 * @returns {void}
 */
function handleInteractionEnd(e) {
    // Cancel any pending animation frame from a stray touchmove event.
    if (state.animationFrameId) {
        cancelAnimationFrame(state.animationFrameId);
        state.animationFrameId = null;
    }

    if (!state.isLeftDown) return;
    if (e.changedTouches && e.changedTouches[0].identifier !== state.activeTouchId) return;

    const wasDrawingBorder = state.activeMode === 'border' && !state.isBorderEraserActive && state.currentBorderPath.size > 0;
    const wasErasingBorder = state.activeMode === 'border' && state.isBorderEraserActive;

    if (state.activeMode === 'mark') {
        if (state.isDragging) {
            if (state.currentDragChanges.length > 0) {
                const finalChanges = [];
                const seen = new Set();
                state.currentDragChanges.forEach(c => {
                    const key = `${c.r},${c.c}`;
                    if (!seen.has(key)) {
                        seen.add(key);
                        finalChanges.push(c);
                    }
                });
                pushHistory({ type: 'compoundMark', changes: finalChanges });
            }
        } else {
            const { row, col } = state.lastPos;
            const fromState = state.playerGrid[row][col];
            if (fromState === 0) {
                const change = { r: row, c: col, from: 0, to: 2 };
                applyMarkChange(row, col, fromState, 2);
                pushHistory({ type: 'compoundMark', changes: [change] });
            } else if (fromState === 2) {
                placeStarAndAutoX(row, col);
            } else if (fromState === 1) {
                removeStarAndUndoAutoX(row, col);
            }
        }
    } else if (state.activeMode === 'draw' && preActionState) {
        const afterState = state.bufferCtx.getImageData(0, 0, state.bufferCanvas.width, state.bufferCanvas.height);
        pushHistory({ type: 'draw', before: preActionState, after: afterState });
    } else if (wasDrawingBorder) {
        const newBorder = { path: state.currentBorderPath, color: state.currentColor };
        state.customBorders.push(newBorder);
        pushHistory({ type: 'addBorder', border: newBorder });
    } else if (wasErasingBorder) {
        if (!state.isDragging) { // Handle single click erase
            const { row, col } = state.lastPos;
            const cellCoord = `${row},${col}`;
            for (let i = state.customBorders.length - 1; i >= 0; i--) {
                const border = state.customBorders[i];
                if (border.path.has(cellCoord)) {
                    state.currentEraseChanges.push({ borderIndex: i, cell: cellCoord });
                    border.path.delete(cellCoord);
                    redrawAllOverlays();
                    break;
                }
            }
        }
        if (state.currentEraseChanges.length > 0) {
            pushHistory({ type: 'compoundEraseBorder', changes: state.currentEraseChanges });
        }
    }

    state.isLeftDown = false;
    state.isDragging = false;
    state.lastPos = null;
    state.currentDragChanges = [];
    state.currentEraseChanges = [];
    preActionState = null;
    state.currentBorderPath = new Set();
    state.activeTouchId = null;
    drawCtx.globalCompositeOperation = 'source-over';
    if (state.bufferCtx) state.bufferCtx.globalCompositeOperation = 'source-over';

    // Perform one final redraw to ensure the canvas is clean.
    if (wasDrawingBorder || wasErasingBorder) {
        redrawAllOverlays();
    }

}

/**
 * Displays the success modal when a puzzle is solved correctly.
 * Calculates and shows the time taken to solve.
 * @returns {void}
 */
function showSuccessModal() {
    if (!state.puzzleStartTime) {
        timeTakenEl.textContent = 'N/A';
    } else {
        timeTakenEl.textContent = gameTimer.textContent;
    }

    // 1. First, update the state with the completed puzzle's properties.
    const { gridDim, starsPerRegion, puzzleDifficulty } = state;
    if (gridDim > 0) {
        const solvedDifficulty = (puzzleDifficulty && puzzleDifficulty !== "None" && puzzleDifficulty !== "Unsorted" && puzzleDifficulty !== `${starsPerRegion}-star`) ? puzzleDifficulty : null;
        state.lastSolvedPuzzle = {
            dim: gridDim,
            stars: starsPerRegion,
            difficulty: solvedDifficulty
        };
    }

    // 2. Now, call the function to generate the button text. It will have the correct data.
    updatePuzzleOptionStates();

    successModal.classList.remove('hidden');
}

/**
 * Hides the success modal.
 * @returns {void}
 */
function hideSuccessModal() {
    successModal.classList.add('hidden');
}

