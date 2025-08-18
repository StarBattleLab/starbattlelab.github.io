/**
 * **********************************************************************************
 * Title: Star Battle Game Logic and History Management
 * **********************************************************************************
 * @author Isaiah Tadrous
 * @version 1.0.1
 * *-------------------------------------------------------------------------------
 * This script contains the core game logic and state manipulation functions for
 * the Star Battle puzzle application. It is responsible for handling player
 * actions, such as placing or removing stars, and includes advanced helper
 * features like automatic 'X' placement based on game rules and user settings.
 * A key feature is the robust history management system, which tracks every
 * change and provides comprehensive undo and redo functionality for various
 * action types, including individual marks, drawing strokes, and border modifications.
 * The script also manages color selection and custom palettes for the drawing tools.
 * **********************************************************************************
 */

// --- GAME LOGIC & HISTORY MANAGEMENT ---

// --- AUTOMATED STAR PLACEMENT LOGIC ---

/**
 * Places a star at a given cell and automatically places 'X's based on enabled helper settings.
 * It intelligently batches all resultant changes (the star and all auto-'X's) into a
 * single "compound" action for the undo/redo history.
 * @param {number} r - The row index of the cell.
 * @param {number} c - The column index of the cell.
 * @returns {void}
 */
function placeStarAndAutoX(r, c) {
    const fromState = state.playerGrid[r][c];
    if (fromState === 1) return;

    const changes = [];
    const tempGrid = JSON.parse(JSON.stringify(state.playerGrid));

    /**
     * Helper to add a potential change to the list if the cell is empty.
     * It updates a temporary grid to ensure subsequent logic uses the most recent state.
     * @param {number} row - The row index for the change.
     * @param {number} col - The column index for the change.
     * @param {number} newMark - The new mark state for the cell.
     */
    const addChange = (row, col, newMark) => {
        if (row >= 0 && row < state.gridDim && col >= 0 && col < state.gridDim) {
            const oldMark = tempGrid[row][col];
            if (oldMark === 0 && oldMark !== newMark) {
                changes.push({ r: row, c: col, from: oldMark, to: newMark });
                tempGrid[row][col] = newMark;
            }
        }
    };

    // Initial star placement
    changes.push({ r, c, from: fromState, to: 1 });
    tempGrid[r][c] = 1;

    // Auto-X adjacent cells if setting is enabled
    if (state.autoXAroundStars) {
        for (let dr = -1; dr <= 1; dr++) {
            for (let dc = -1; dc <= 1; dc++) {
                if (dr === 0 && dc === 0) continue;
                addChange(r + dr, c + dc, 2);
            }
        }
    }

    // Collect all current star positions to check for line/region completion
    const starPositions = [];
    for (let ri = 0; ri < state.gridDim; ri++) {
        for (let ci = 0; ci < state.gridDim; ci++) {
            if (tempGrid[ri][ci] === 1) starPositions.push({ r: ri, c: ci });
        }
    }

    // Check every star to see if its row, column, or region is now full
    starPositions.forEach(starPos => {
        // Auto-X full rows and columns if setting is enabled
        if (state.autoXOnMaxLines) {
            let rowStarCount = 0;
            for (let i = 0; i < state.gridDim; i++) if (tempGrid[starPos.r][i] === 1) rowStarCount++;
            if (rowStarCount === state.starsPerRegion) {
                for (let i = 0; i < state.gridDim; i++) addChange(starPos.r, i, 2);
            }
            let colStarCount = 0;
            for (let i = 0; i < state.gridDim; i++) if (tempGrid[i][starPos.c] === 1) colStarCount++;
            if (colStarCount === state.starsPerRegion) {
                for (let i = 0; i < state.gridDim; i++) addChange(i, starPos.c, 2);
            }
        }
        // Auto-X full regions if setting is enabled
        if (state.autoXOnMaxRegions) {
            const regionId = state.regionGrid[starPos.r][starPos.c];
            let regionStarCount = 0;
            const regionCells = [];
            for (let ri = 0; ri < state.gridDim; ri++) {
                for (let ci = 0; ci < state.gridDim; ci++) {
                    if (state.regionGrid[ri][ci] === regionId) {
                        regionCells.push({ r: ri, c: ci });
                        if (tempGrid[ri][ci] === 1) regionStarCount++;
                    }
                }
            }
            if (regionStarCount === state.starsPerRegion) {
                regionCells.forEach(cell => addChange(cell.r, cell.c, 2));
            }
        }
    });

    // Deduplicate changes, keeping only the last change for each cell
    const finalChanges = [];
    const seen = new Set();
    for (let i = changes.length - 1; i >= 0; i--) {
        const change = changes[i];
        const key = `${change.r},${change.c}`;
        if (!seen.has(key)) {
            seen.add(key);
            finalChanges.unshift(change);
        }
    }

    // Apply the final, consolidated changes and record them in history
    if (finalChanges.length > 0) {
        finalChanges.forEach(c => applyMarkChange(c.r, c.c, state.playerGrid[c.r][c.c], c.to));
        pushHistory({ type: 'compoundMark', changes: finalChanges });
        updateErrorHighlightingUI();
		performAutoCheck({ r, c });
    }
}

/**
 * Removes a star and reverts any 'X's that were automatically placed along with it.
 * It searches the history for the original placement action and undoes all changes
 * associated with it, batching the removal into a single history event.
 * @param {number} r - The row index of the cell.
 * @param {number} c - The column index of the cell.
 * @returns {void}
 */
function removeStarAndUndoAutoX(r, c) {
    if (state.playerGrid[r][c] !== 1) return;

    // Find the specific history action that placed this star
    let starPlacingAction = null;
    for (let i = state.history.mark.pointer; i >= 0; i--) {
        const action = state.history.mark.stack[i];
        if (action.type === 'compoundMark' && action.changes.some(change => change.r === r && change.c === c && change.to === 1)) {
            starPlacingAction = action;
            break;
        }
        // Handle cases where a star was placed without any auto-X's
        if (action.type === 'mark' && action.r === r && action.c === c && action.to === 1) {
            starPlacingAction = { type: 'compoundMark', changes: [action] };
            break;
        }
    }

    if (starPlacingAction) {
        const removalChanges = [];
        // Revert each change from the original action
        starPlacingAction.changes.forEach(originalChange => {
            // Only revert if the cell hasn't been changed by the user since
            if (state.playerGrid[originalChange.r][originalChange.c] === originalChange.to) {
                let revertToState = originalChange.from;
                // The star itself should always be removed to an empty state
                if (originalChange.r === r && originalChange.c === c) {
                    revertToState = 0;
                }
                applyMarkChange(originalChange.r, originalChange.c, originalChange.to, revertToState);
                removalChanges.push({ r: originalChange.r, c: originalChange.c, from: originalChange.to, to: revertToState });
            }
        });

        if (removalChanges.length > 0) {
            pushHistory({ type: 'compoundMark', changes: removalChanges });
        }
    } else {
        // If no history is found (e.g., from a loaded game), just remove the star
        const change = { r, c, from: 1, to: 0 };
        if (applyMarkChange(r, c, 1, 0)) {
            pushHistory({ type: 'compoundMark', changes: [change] });
        }
    }
    updateErrorHighlightingUI();
}

/**
 * Checks if the total number of stars matches the required amount for the puzzle.
 * If it does, triggers a full solution verification.
 * @param {object} lastStarCoords - The {r, c} coordinates of the last star placed.
 * @returns {void}
 */
function performAutoCheck(lastStarCoords) {
    // ... (the star counting logic remains the same)
    const { gridDim, starsPerRegion, playerGrid } = state;
    if (gridDim === 0) return;

    const expectedTotalStars = gridDim * starsPerRegion;
    let actualTotalStars = 0;

    for (let r = 0; r < gridDim; r++) {
        for (let c = 0; c < gridDim; c++) {
            if (playerGrid[r][c] === 1) {
                actualTotalStars++;
            }
        }
    }

    // If the count is correct, trigger the full check, passing the coords along.
    if (actualTotalStars === expectedTotalStars) {
        checkSolution(false, lastStarCoords);
    }
}

// --- COLOR & BORDER MANAGEMENT ---

/**
 * Selects a new color for drawing and updates the UI elements.
 * @param {string} newColor - The new color hex code to set as active.
 * @returns {void}
 */
function selectColor(newColor) {
    state.currentColor = newColor;
    htmlColorPicker.value = newColor;
    renderColorPicker();
}

/**
 * Saves or updates a custom color in the user's palette.
 * @param {string} newColor - The new color hex code to save.
 * @returns {void}
 */
function saveCustomColor(newColor) {
    const replaceIndex = state.colorToReplace ? state.customColors.indexOf(state.colorToReplace) : -1;
    if (replaceIndex !== -1) {
        // If a color was selected for replacement, update it and any existing borders using it.
        const oldColor = state.customColors[replaceIndex];
        state.customColors[replaceIndex] = newColor;
        state.customBorders.forEach(border => {
            if (border.color === oldColor) {
                border.color = newColor;
            }
        });
        redrawAllOverlays();
    } else {
        // Otherwise, add the new color to an empty slot or replace the oldest one.
        const emptyIndex = state.customColors.findIndex(c => c === null);
        if (emptyIndex !== -1) {
            state.customColors[emptyIndex] = newColor;
        } else {
            state.customColors.shift();
            state.customColors.push(newColor);
        }
    }
    state.colorToReplace = null;
    selectColor(newColor);
}

/**
 * Creates a deep copy of the custom borders array to prevent mutation issues in history.
 * @param {Array<Object>} borders - The array of border objects to copy.
 * @returns {Array<Object>} A new array with deeply copied border objects.
 */
function deepCopyBorders(borders) {
    return borders.map(border => ({
        color: border.color,
        path: new Set(border.path)
    }));
}

// --- HISTORY & STATE APPLICATION ---

/**
 * Pushes a new action onto the history stack for the currently active mode.
 * This invalidates any "redo" actions that existed after the current point.
 * @param {Object} change - The change object representing the action to be recorded.
 * @returns {void}
 */
function pushHistory(change) {
    const modeHistory = state.history[state.activeMode];
    if (!modeHistory) return;
    // If we are "time-traveling" in history, truncate the future stack.
    if (modeHistory.pointer < modeHistory.stack.length - 1) {
        modeHistory.stack = modeHistory.stack.slice(0, modeHistory.pointer + 1);
    }
    modeHistory.stack.push(change);
    modeHistory.pointer++;
    updateUndoRedoButtons();
}

/**
 * Applies a single mark change to the internal state grid and updates the corresponding cell's UI.
 * @param {number} r - The row index of the cell.
 * @param {number} c - The column index of the cell.
 * @param {number} fromState - The original state of the mark (for record-keeping).
 * @param {number} toState - The new state of the mark to apply.
 * @returns {boolean} True if the change was successfully applied, false otherwise.
 */
function applyMarkChange(r, c, fromState, toState) {
    if (r < 0 || r >= state.gridDim || c < 0 || c >= state.gridDim) return false;
    state.playerGrid[r][c] = toState;
    const cell = gridContainer.querySelector(`[data-r='${r}'][data-c='${c}']`);
    updateCellMark(cell, toState);
    return true;
}

/**
 * Reverts the last action performed in the currently active mode.
 * It reads the last change from the history stack and applies the inverse.
 * @returns {void}
 */
function undo() {
    const modeHistory = state.history[state.activeMode];
    if (!modeHistory || modeHistory.pointer < 0) return;
    const change = modeHistory.stack[modeHistory.pointer];

    switch (change.type) {
        case 'mark':
            applyMarkChange(change.r, change.c, change.to, change.from);
            updateErrorHighlightingUI();
            break;
        case 'compoundMark':
            [...change.changes].reverse().forEach(c => {
                applyMarkChange(c.r, c.c, c.to, c.from);
            });
            updateErrorHighlightingUI();
            break;
        case 'draw':
            state.bufferCtx.putImageData(change.before, 0, 0);
            redrawAllOverlays();
            break;
        case 'addBorder':
            state.customBorders.pop();
            redrawAllOverlays();
            break;
        case 'removeCellFromBorder':
            state.customBorders[change.borderIndex].path.add(change.cell);
            redrawAllOverlays();
            break;
        case 'clearMarks':
            state.playerGrid = change.before;
            renderAllMarks();
            updateErrorHighlightingUI();
            break;
        case 'clearDraw':
            state.bufferCtx.putImageData(change.before, 0, 0);
            redrawAllOverlays();
            break;
        case 'clearBorder':
            state.customBorders = deepCopyBorders(change.before);
            redrawAllOverlays();
            break;
    }
    modeHistory.pointer--;
    updateUndoRedoButtons();
}

/**
 * Re-applies the last undone action in the currently active mode.
 * It reads the next change from the history stack and applies it.
 * @returns {void}
 */
function redo() {
    const modeHistory = state.history[state.activeMode];
    if (!modeHistory || modeHistory.pointer >= modeHistory.stack.length - 1) return;
    modeHistory.pointer++;
    const change = modeHistory.stack[modeHistory.pointer];

    switch (change.type) {
        case 'mark':
            applyMarkChange(change.r, change.c, change.from, change.to);
            updateErrorHighlightingUI();
            break;
        case 'compoundMark':
            change.changes.forEach(c => {
                applyMarkChange(c.r, c.c, c.from, c.to);
            });
            updateErrorHighlightingUI();
            break;
        case 'draw':
            state.bufferCtx.putImageData(change.after, 0, 0);
            redrawAllOverlays();
            break;
        case 'addBorder':
            state.customBorders.push(change.border);
            redrawAllOverlays();
            break;
        case 'removeCellFromBorder':
            state.customBorders[change.borderIndex].path.delete(change.cell);
            redrawAllOverlays();
            break;
        case 'clearMarks':
            _internalClearMarks();
            renderAllMarks();
            updateErrorHighlightingUI();
            break;
        case 'clearDraw':
            if (state.bufferCtx) {
                state.bufferCtx.clearRect(0, 0, state.bufferCanvas.width, state.bufferCanvas.height);
            }
            redrawAllOverlays();
            break;
        case 'clearBorder':
            state.customBorders = [];
            redrawAllOverlays();
            break;
    }
    updateUndoRedoButtons();
}

// --- PUZZLE CLEARING LOGIC ---

/**
 * Internal helper function to reset the player grid to an empty state.
 * @returns {void}
 */
function _internalClearMarks() {
    if (state.gridDim > 0) {
        state.playerGrid = Array(state.gridDim).fill(0).map(() => Array(state.gridDim).fill(0));
    }
}

/**
 * Resets the entire puzzle to its initial state, clearing all marks, drawings,
 * borders, and the complete history stack.
 * @returns {void}
 */
function clearPuzzleState() {
    _internalClearMarks();
    state.customBorders = [];
    if (state.bufferCtx) {
        state.bufferCtx.clearRect(0, 0, state.bufferCanvas.width, state.bufferCanvas.height);
    }
    redrawAllOverlays();
    // Reset history for all modes
    state.history = {
        mark: { stack: [], pointer: -1 },
        draw: { stack: [], pointer: -1 },
        border: { stack: [], pointer: -1 }
    };
    renderAllMarks();
    updateErrorHighlightingUI();
    updateUndoRedoButtons();
}
