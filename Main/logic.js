/**
 **********************************************************************************
 *
 * Star Battle Puzzle - Core Game Logic
 *
 * @author Isaiah Tadrous
 * @version 1.1.3
 *
 * -------------------------------------------------------------------------------
 *
 * Description:
 * This file contains the core logic for the Star Battle puzzle application. It
 * handles the complex game mechanics, including the "auto-X" functionality for
 * placing and removing stars based on user settings. It also implements the
 * complete history management system, providing robust undo/redo capabilities
 * across different user actions (marking, drawing, bordering). Additionally,
 * this file manages the logic for the UI color picker.
 *
 **********************************************************************************
 */

// --- AUTOMATIC MARKING LOGIC ---

/**
 * Places a star at the specified row and column, and automatically places 'X' marks in adjacent cells,
 * and along rows, columns, or within regions if they reach their star capacity, based on user settings.
 * This operation is recorded as a single, compound change for undo/redo functionality.
 * @param {number} r - The row index where the star is to be placed.
 * @param {number} c - The column index where the star is to be placed.
 * @returns {void}
 */
function placeStarAndAutoX(r, c) {
    const fromState = state.playerGrid[r][c];
    if (fromState === 1) return;

    const changes = [];
    const tempGrid = JSON.parse(JSON.stringify(state.playerGrid));

    /**
     * Helper function to record a potential change to the grid.
     * A change is recorded only if the target cell is within bounds, not already the new mark, and currently empty (0).
     * @param {number} row - The row of the cell to change.
     * @param {number} col - The column of the cell to change.
     * @param {number} newMark - The new mark value (1 for star, 2 for X).
     * @returns {void}
     */
    const addChange = (row, col, newMark) => {
        if (row >= 0 && row < state.gridDim && col >= 0 && col < state.gridDim) {
            const oldMark = tempGrid[row][col];
            if (oldMark !== newMark && oldMark === 0) {
                changes.push({ r: row, c: col, from: oldMark, to: newMark });
                tempGrid[row][col] = newMark;
            }
        }
    };

    // Record the initial star placement.
    changes.push({ r, c, from: fromState, to: 1 });
    tempGrid[r][c] = 1;

    // Apply auto-X around the placed star if the setting is enabled.
    if (state.autoXAroundStars) {
        for (let dr = -1; dr <= 1; dr++) {
            for (let dc = -1; dc <= 1; dc++) {
                if (dr === 0 && dc === 0) continue; // Skip the center cell (where the star is placed).
                addChange(r + dr, c + dc, 2); // Place 'X' in adjacent cells.
            }
        }
    }

    // Collect all current star positions to apply auto-X based on line/region limits.
    const starPositions = [];
    for (let ri = 0; ri < state.gridDim; ri++) {
        for (let ci = 0; ci < state.gridDim; ci++) {
            if (tempGrid[ri][ci] === 1) starPositions.push({ r: ri, c: ci });
        }
    }

    // Iterate through all stars to apply auto-X based on line and region constraints.
    starPositions.forEach(starPos => {
        // Apply auto-X to full rows/columns if setting is enabled.
        if (state.autoXOnMaxLines) {
            let rowStarCount = 0;
            for (let i = 0; i < state.gridDim; i++) if (tempGrid[starPos.r][i] === 1) rowStarCount++;
            if (rowStarCount === state.starsPerRegion) {
                for (let i = 0; i < state.gridDim; i++) addChange(starPos.r, i, 2); // Place 'X' in the entire row.
            }
            let colStarCount = 0;
            for (let i = 0; i < state.gridDim; i++) if (tempGrid[i][starPos.c] === 1) colStarCount++;
            if (colStarCount === state.starsPerRegion) {
                for (let i = 0; i < state.gridDim; i++) addChange(i, starPos.c, 2); // Place 'X' in the entire column.
            }
        }
        // Apply auto-X to full regions if setting is enabled.
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
                regionCells.forEach(cell => addChange(cell.r, cell.c, 2)); // Place 'X' in the entire region.
            }
        }
    });

    // Filter out duplicate changes, keeping only the most recent intended state for each cell.
    const finalChanges = [];
    const seen = new Set();
    for (let i = changes.length - 1; i >= 0; i--) {
        const change = changes[i];
        const key = `${change.r},${change.c}`;
        if (!seen.has(key)) {
            seen.add(key);
            finalChanges.unshift(change); // Add to the beginning to maintain correct application order.
        }
    }

    // Apply the final, unique changes to the player grid and push to history.
    if (finalChanges.length > 0) {
        finalChanges.forEach(c => state.playerGrid[c.r][c.c] = c.to);
        pushHistory({ type: 'compoundMark', changes: finalChanges });
        renderAllMarks();
        updateErrorHighlightingUI(); // Update UI to reflect changes and error highlighting.
        updateUrlWithSbn();
    }
}

/**
 * Removes a star from the specified row and column. If the star was placed as part of a compound action
 * (e.g., with auto-X marks), this function attempts to revert all changes made by that original action.
 * If the star was placed individually, it's removed as a simple mark change.
 * @param {number} r - The row index of the star to remove.
 * @param {number} c - The column index of the star to remove.
 * @returns {void}
 */
function removeStarAndAutoX(r, c) {
    // Only proceed if the target cell actually contains a star (1).
    if (state.playerGrid[r][c] !== 1) return;

    let starPlacingAction = null;
    // Search backwards through the history stack to find the compound action that placed this star.
    for (let i = state.history.mark.pointer; i >= 0; i--) {
        const action = state.history.mark.stack[i];
        if (action.type === 'compoundMark' && action.changes.some(change => change.r === r && change.c === c && change.to === 1)) {
            starPlacingAction = action;
            break;
        }
    }

    if (starPlacingAction) {
        const removalChanges = [];
        // Revert each change from the original compound action.
        starPlacingAction.changes.forEach(originalChange => {
            // Ensure the cell's current state matches what the original action set it to.
            if (state.playerGrid[originalChange.r][originalChange.c] === originalChange.to) {
                // For the star's cell, change it to 0 (empty). For other cells, revert to their state before the original action.
                const toState = (originalChange.r === r && originalChange.c === c) ? 0 : originalChange.from;
                applyMarkChange(originalChange.r, originalChange.c, originalChange.to, toState);
                removalChanges.push({ r: originalChange.r, c: originalChange.c, from: originalChange.to, to: toState });
            }
        });

        // Push the entire set of removal changes as a new compound action for undo/redo.
        if (removalChanges.length > 0) {
            pushHistory({ type: 'compoundMark', changes: removalChanges });
        }

    } else {
        // If no compound action was found, treat it as a simple star removal.
        if (applyMarkChange(r, c, 1, 0)) {
            pushHistory({ type: 'mark', r, c, from: 1, to: 0 });
        }
    }
    updateErrorHighlightingUI(); // Update UI to reflect changes and error highlighting.
    updateUrlWithSbn();
}

// --- COLOR PICKER LOGIC ---

/**
 * Renders the color picker UI, displaying both preset and custom color slots.
 * It also highlights the currently selected color.
 * @returns {void}
 */
function renderColorPicker() {
    presetColorsContainer.innerHTML = PRESET_COLORS.map(color =>
        `<div class="color-slot" data-color="${color}" style="background-color: ${color};"></div>`
    ).join('');

    customColorsContainer.innerHTML = state.customColors.map((color, index) => {
        if (color) {
            return `<div class="color-slot" data-color="${color}" style="background-color: ${color};"></div>`;
        } else {
            return `<div class="color-slot empty" data-custom-index="${index}"></div>`;
        }
    }).join('');

    document.querySelectorAll('#color-picker-wrapper .color-slot').forEach(slot => {
        slot.classList.toggle('selected', slot.dataset.color === state.currentColor);
    });
}

/**
 * Sets the currently active drawing/border color.
 * Updates the internal state and re-renders the color picker UI to reflect the selection.
 * @param {string} newColor - The hexadecimal color string (e.g., '#RRGGBB') to set as the current color.
 * @returns {void}
 */
function selectColor(newColor) {
    state.currentColor = newColor;
    htmlColorPicker.value = newColor;
    renderColorPicker();
}

/**
 * Saves a new custom color to the `state.customColors` array.
 * If `state.colorToReplace` is set, it replaces that specific custom color; otherwise, it finds an empty slot
 * or shifts the oldest custom color out to make room for the new one.
 * It also updates any existing custom borders that used the replaced color.
 * @param {string} newColor - The new hexadecimal color string to save.
 * @returns {void}
 */
function saveCustomColor(newColor) {
    const replaceIndex = state.colorToReplace ? state.customColors.indexOf(state.colorToReplace) : -1;
    if (replaceIndex !== -1) {
        const oldColor = state.customColors[replaceIndex];
        state.customColors[replaceIndex] = newColor;
        state.customBorders.forEach(border => {
            if (border.color === oldColor) {
                border.color = newColor;
            }
        });
        redrawAllOverlays();
    } else {
        const emptyIndex = state.customColors.findIndex(c => c === null);
        if (emptyIndex !== -1) {
            state.customColors[emptyIndex] = newColor;
        } else {
            state.customColors.shift(); // Remove the oldest custom color.
            state.customColors.push(newColor); // Add the new color to the end.
        }
    }
    state.colorToReplace = null; // Reset the replacement target.
    selectColor(newColor); // Select the newly saved color.
}

// --- HISTORY MANAGEMENT ---

/**
 * Creates a deep copy of the custom borders array. This is crucial for history management
 * to ensure that undo/redo operations work on distinct snapshots of border states.
 * @param {Array<Object>} borders - The array of border objects to copy.
 * @returns {Array<Object>} A deep copy of the borders array.
 */
function deepCopyBorders(borders) {
    return borders.map(border => ({
        color: border.color,
        path: new Set(border.path) // Copy Set objects correctly.
    }));
}

/**
 * Pushes a new change action onto the history stack for the currently active mode.
 * It handles "squashing" future history if a new action is performed after an undo.
 * @param {Object} change - The action object describing the change (e.g., type, affected cells, before/after states).
 * @returns {void}
 */
function pushHistory(change) {
    const modeHistory = state.history[state.activeMode];
    if (!modeHistory) return;

    // If the pointer is not at the end of the stack, it means we've undone some actions.
    // Pushing a new action at this point effectively "clears" the undone future history.
    if (modeHistory.pointer < modeHistory.stack.length - 1) {
        modeHistory.stack = modeHistory.stack.slice(0, modeHistory.pointer + 1);
    }
    modeHistory.stack.push(change);
    modeHistory.pointer++;
    updateUndoRedoButtons(); // Update button states after history modification.
}

/**
 * Applies a mark change to a specific cell in the player grid.
 * This function updates the `state.playerGrid` and the visual representation of the cell in the DOM.
 * @param {number} r - The row index of the cell.
 * @param {number} c - The column index of the cell.
 * @param {number} fromState - The expected current state of the cell before the change.
 * @param {number} toState - The desired new state of the cell.
 * @returns {boolean} True if the change was applied, false otherwise (e.g., if `fromState` didn't match).
 */
function applyMarkChange(r, c, fromState, toState) {
    // Validate cell coordinates.
    if (r < 0 || r >= state.gridDim || c < 0 || c >= state.gridDim) return false;
    // Apply change only if the current state matches the expected `fromState`.
    if (state.playerGrid[r][c] === fromState) {
        state.playerGrid[r][c] = toState;
        // Update the visual representation of the cell.
        const cell = gridContainer.querySelector(`[data-r='${r}'][data-c='${c}']`);
        updateCellMark(cell, toState);
        return true;
    }
    return false;
}

/**
 * Reverts the last action performed in the currently active mode by stepping back the history pointer
 * and applying the inverse of the stored change.
 * @returns {void}
 */
function undo() {
    const modeHistory = state.history[state.activeMode];
    if (!modeHistory || modeHistory.pointer < 0) return; // No actions to undo.

    const change = modeHistory.stack[modeHistory.pointer];

    switch (change.type) {
        case 'mark':
            // Revert a simple mark change.
            applyMarkChange(change.r, change.c, change.to, change.from);
            updateErrorHighlightingUI();
            break;
        case 'compoundMark':
            // Revert a compound mark change by applying each sub-change in reverse order.
            [...change.changes].reverse().forEach(c => {
                applyMarkChange(c.r, c.c, c.to, c.from);
            });
            updateErrorHighlightingUI();
            break;
        case 'draw':
            // Restore the drawing canvas to its state before the draw action.
            state.bufferCtx.putImageData(change.before, 0, 0);
            redrawAllOverlays();
            break;
        case 'addBorder':
            // Remove the last added border.
            state.customBorders.pop();
            redrawAllOverlays();
            break;
        case 'borderStateChange':
            // Restore custom borders to the state before the change.
            state.customBorders = deepCopyBorders(change.before);
            redrawAllOverlays();
            break;
        case 'clearMarks':
            // Restore the player grid to its state before clearing marks.
            state.playerGrid = change.before;
            renderAllMarks();
            updateErrorHighlightingUI();
            break;
        case 'clearDraw':
            // Restore the drawing canvas to its state before clearing drawings.
            state.bufferCtx.putImageData(change.before, 0, 0);
            redrawAllOverlays();
            break;
        case 'clearBorder':
            // Restore custom borders to the state before clearing them.
            state.customBorders = deepCopyBorders(change.before);
            redrawAllOverlays();
            break;
    }

    modeHistory.pointer--; // Move the history pointer back.
    updateUndoRedoButtons(); // Update button states.
    updateUrlWithSbn();
}

/**
 * Reapplies the last undone action in the currently active mode by stepping forward the history pointer
 * and applying the stored change.
 * @returns {void}
 */
function redo() {
    const modeHistory = state.history[state.activeMode];
    // Check if there are actions to redo.
    if (!modeHistory || modeHistory.pointer >= modeHistory.stack.length - 1) return;

    modeHistory.pointer++; // Move the history pointer forward.
    const change = modeHistory.stack[modeHistory.pointer];

    switch (change.type) {
        case 'mark':
            // Reapply a simple mark change.
            applyMarkChange(change.r, change.c, change.from, change.to);
            updateErrorHighlightingUI();
            break;
        case 'compoundMark':
            // Reapply a compound mark change by applying each sub-change.
            change.changes.forEach(c => {
                applyMarkChange(c.r, c.c, c.from, c.to);
            });
            updateErrorHighlightingUI();
            break;
        case 'draw':
            // Restore the drawing canvas to its state after the draw action.
            state.bufferCtx.putImageData(change.after, 0, 0);
            redrawAllOverlays();
            break;
        case 'addBorder':
            // Re-add the border that was previously removed by undo.
            state.customBorders.push(change.border);
            redrawAllOverlays();
            break;
        case 'borderStateChange':
            // Restore custom borders to the state after the change.
            state.customBorders = deepCopyBorders(change.after);
            redrawAllOverlays();
            break;
        case 'clearMarks':
            // Reapply clearing of marks.
            _internalClearMarks();
            renderAllMarks();
            updateErrorHighlightingUI();
            break;
        case 'clearDraw':
            // Reapply clearing of drawings.
            if (state.bufferCtx) {
                state.bufferCtx.clearRect(0, 0, state.bufferCanvas.width, state.bufferCanvas.height);
            }
            redrawAllOverlays();
            break;
        case 'clearBorder':
            // Reapply clearing of borders.
            state.customBorders = [];
            redrawAllOverlays();
            break;
    }
    updateUndoRedoButtons(); // Update button states.
    updateUrlWithSbn();
}
