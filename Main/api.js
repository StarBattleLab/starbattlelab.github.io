/**
 **********************************************************************************
 *
 * Star Battle Puzzle - Interactions and State API
 *
 * @author Isaiah Tadrous
 * @version 1.1.3
 *
 * -------------------------------------------------------------------------------
 *
 * Description:
 * This file acts as the core API for managing user interactions and puzzle
 * state. It contains the primary event handlers for mouse input, which
 * translate user actions (clicking, dragging) into state changes for marking,
 * drawing, or creating borders. It also includes the fundamental logic for
 * history management (undo/redo) and for resetting the puzzle to a clean state.
 *
 **********************************************************************************
 */

// --- CORE STATE & HISTORY FUNCTIONS ---

/**
 * Updates the disabled state of the undo and redo buttons based on the current history pointer for the active mode.
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

/**
 * Internally clears all marks (stars and X's) from the player grid by reinitializing it with zeros.
 * This function does not manage history or redraw the UI; it's a utility for `clearPuzzleState`.
 * @returns {void}
 */
function _internalClearMarks() {
    if (state.gridDim > 0) {
        state.playerGrid = Array(state.gridDim).fill(0).map(() => Array(state.gridDim).fill(0));
    }
}

/**
 * Resets the entire puzzle state, including player marks, custom borders, drawing canvas, and history.
 * It also triggers a full UI redraw and updates button states.
 * @returns {void}
 */
function clearPuzzleState() {
    _internalClearMarks();
    state.customBorders = [];
    if (state.bufferCtx) {
        state.bufferCtx.clearRect(0, 0, state.bufferCanvas.width, state.bufferCanvas.height);
    }
    redrawAllOverlays();
    state.history = {
        mark: { stack: [], pointer: -1 },
        draw: { stack: [], pointer: -1 },
        border: { stack: [], pointer: -1 }
    };
    renderAllMarks();
    updateErrorHighlightingUI();
    updateUndoRedoButtons();
}

// --- EVENT HANDLERS ---

/**
 * Calculates the mouse position relative to the grid container and determines if it's within the grid boundaries.
 * @param {MouseEvent} e - The mouse event.
 * @returns {{x?: number, y?: number, row?: number, col?: number, onGrid: boolean}} An object containing mouse coordinates, grid row/column, and an `onGrid` boolean.
 */
function getMousePos(e) {
    const rect = gridContainer.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const onGrid = x >= 0 && x < rect.width && y >= 0 && y < rect.height;
    if (!onGrid) return { onGrid: false };

    const col = Math.floor(x / (rect.width / state.gridDim));
    const row = Math.floor(y / (rect.height / state.gridDim));
    return { x, y, row, col, onGrid };
}

/**
 * Handles the `mousedown` event on the grid or drawing canvas, initiating interactions based on the active mode and mouse button.
 * It sets up initial dragging state, saves pre-action state for undo, and begins drawing or border creation.
 * @param {MouseEvent} e - The mouse event.
 * @returns {void}
 */
function handleMouseDown(e) {
    const pos = getMousePos(e);
    if (!pos.onGrid) return;
    state.isDragging = false; // Reset dragging state on new mousedown
    state.clickCell = { r: pos.row, c: pos.col };

    if (e.button === 0) { // Left-click
        state.isLeftDown = true;
        if (state.activeMode === 'draw') {
            preActionState = state.bufferCtx.getImageData(0, 0, state.bufferCanvas.width, state.bufferCanvas.height);
            const painter = (ctx) => {
                // Set drawing properties for the dot and subsequent line
                ctx.globalCompositeOperation = 'source-over';
                ctx.lineCap = 'round';
                ctx.lineJoin = 'round';
                ctx.strokeStyle = state.currentColor;
                ctx.lineWidth = state.brushSize;
                // Draw a single "dot" by creating a zero-length path and stroking it.
                // The 'round' lineCap makes it a circle.
                ctx.beginPath();
                ctx.moveTo(pos.x, pos.y);
                ctx.lineTo(pos.x, pos.y);
                ctx.stroke();
                // Begin a new path at the same point to prepare for dragging
                ctx.beginPath();
                ctx.moveTo(pos.x, pos.y);
            };
            painter(drawCtx);
            if (state.bufferCtx) painter(state.bufferCtx);
        } else if (state.activeMode === 'border') {
            state.currentBorderPath = new Set([`${pos.row},${pos.col}`]);
            redrawAllOverlays();
        }
    } else if (e.button === 2) { // Right-click
        e.preventDefault();
        state.isRightDown = true;
        if (state.activeMode === 'mark') {
            const { row, col } = pos;
            const fromState = state.playerGrid[row][col];
            if (fromState === 1) {
                removeStarAndAutoX(row, col);
            } else {
                placeStarAndAutoX(row, col);
            }
        } else if (state.activeMode === 'border') { // Right-click in border mode
            // Saves the current state of custom borders for undo functionality.
            preActionState = deepCopyBorders(state.customBorders);

            const { row, col } = pos;
            const cellPos = `${row},${col}`;
            const borderIndex = state.customBorders.findIndex(b => b.path.has(cellPos));

            if (borderIndex > -1) {
                // Deletes the specific cell from the border path. History push will occur on mouseUp.
                state.customBorders[borderIndex].path.delete(cellPos);
                redrawAllOverlays();
            }
        } else if (state.activeMode === 'draw') {
            preActionState = state.bufferCtx.getImageData(0, 0, state.bufferCanvas.width, state.bufferCanvas.height);
            if (state.bufferCtx) {
                state.bufferCtx.arc(pos.x, pos.y, (state.brushSize / 10) + 9.5, 0, 2 * Math.PI);
                state.bufferCtx.globalCompositeOperation = 'destination-out';
                state.bufferCtx.beginPath();
                state.bufferCtx.arc(pos.x, pos.y, (state.brushSize / 5) + 9.5, 0, 2 * Math.PI);
                state.bufferCtx.fill();
            }
            redrawAllOverlays();
        }
    }
}

/**
 * Handles the `mousemove` event, performing actions based on the active mode and whether a mouse button is pressed.
 * It manages dragging state for 'mark' mode and draws or erases on canvases for 'draw' and 'border' modes.
 * @param {MouseEvent} e - The mouse event.
 * @returns {void}
 */
function handleMouseMove(e) {
    if (!state.isLeftDown && !state.isRightDown) return;

    const pos = getMousePos(e);

    // Checks if a drag operation is initiating based on mouse movement from the click origin.
    if (state.clickCell && pos.onGrid && (pos.row !== state.clickCell.r || pos.col !== state.clickCell.c)) {
        // If this is the initial detection of a drag, set the dragging flag.
        if (!state.isDragging) {
            state.isDragging = true; // Set dragging to true first

            // If in 'mark' mode, marks the starting cell of the drag.
            if (state.activeMode === 'mark') {
                const { r, c } = state.clickCell; // Uses the cell where the mouse down event occurred.
                if (state.playerGrid[r][c] === 0) { // Only marks if the cell is currently empty.
                    if (applyMarkChange(r, c, 0, 2)) {
                        pushHistory({ type: 'mark', r, c, from: 0, to: 2 });
                    }
                }
            }
        }
    }

    // If no drag is in progress, terminate the function.
    // This check is now bypassed for draw/border modes to allow intra-cell drawing.
    // The mark mode logic below is now gated by the isDragging flag itself.

    if (!pos.onGrid) {
        handleMouseUp(e);
        return;
    }

    if (state.isLeftDown) {
        if (state.activeMode === 'mark') {
            // Marks the cell currently under the mouse cursor during a drag operation.
            // This logic is now wrapped in an isDragging check to preserve original behavior.
            if (state.isDragging) {
                const { row, col } = pos;
                if (state.playerGrid[row][col] === 0) { // Only places an 'X' on empty cells.
                    if (applyMarkChange(row, col, 0, 2)) {
                        pushHistory({ type: 'mark', r: row, c: col, from: 0, to: 2 });
                    }
                }
            }
        } else if (state.activeMode === 'draw') {
            const painter = (ctx) => {
                ctx.globalCompositeOperation = 'source-over';
                ctx.lineCap = 'round';
                ctx.lineJoin = 'round';
                ctx.strokeStyle = state.currentColor;
                ctx.lineWidth = state.brushSize;
                ctx.lineTo(pos.x, pos.y);
                ctx.stroke();
                ctx.beginPath();
                ctx.moveTo(pos.x, pos.y);
            };
            painter(drawCtx);
            if (state.bufferCtx) painter(state.bufferCtx);
        } else if (state.activeMode === 'border') {
            state.currentBorderPath.add(`${pos.row},${pos.col}`);
            redrawAllOverlays();
        }
    } else if (state.isRightDown) {
        // If in border mode, removes the border from the cell currently under the mouse during a right-click drag.
        if (state.activeMode === 'border') {
            const { row, col } = pos;
            const cellPos = `${row},${col}`;

            // Iterates through all custom borders and removes the current cell from any border path that contains it.
            state.customBorders.forEach(border => {
                if (border.path.has(cellPos)) {
                    border.path.delete(cellPos);
                }
            });
            redrawAllOverlays();
        }
        else if (state.activeMode === 'draw') {
            if (state.bufferCtx) {
                state.bufferCtx.globalCompositeOperation = 'destination-out';
                state.bufferCtx.beginPath();
                state.bufferCtx.arc(pos.x, pos.y, (state.brushSize / 20) + (5 * 2), 0, 2 * Math.PI);
                state.bufferCtx.fill();
            }
            redrawAllOverlays();
        }
    }
}

/**
 * Handles the `mouseup` event, finalizing actions initiated by `mousedown` and `mousemove`.
 * It applies single-click marks, pushes actions to history for undo/redo, and resets temporary interaction states.
 * @param {MouseEvent} e - The mouse event.
 * @returns {void}
 */
function handleMouseUp(e) {
    if (e.button === 0 && state.isLeftDown) { // Left-click release
        if (!state.isDragging && state.clickCell) {
            if (state.activeMode === 'mark') {
                const { r, c } = state.clickCell;
                const fromState = state.playerGrid[r][c];

                if (fromState === 0) {
                    if (applyMarkChange(r, c, 0, 2)) {
                        pushHistory({ type: 'mark', r, c, from: 0, to: 2 });
                        updateUrlWithSbn();
                    }
                } else if (fromState === 2) {
                    placeStarAndAutoX(r, c);
                } else if (fromState === 1) {
                    removeStarAndAutoX(r, c);
                }
            }
        }
        if (state.activeMode === 'draw' && preActionState) {
            const afterState = state.bufferCtx.getImageData(0, 0, state.bufferCanvas.width, state.bufferCanvas.height);
            pushHistory({ type: 'draw', before: preActionState, after: afterState });
        }
        if (state.activeMode === 'border' && state.currentBorderPath.size > 0) {
            const newBorder = { path: state.currentBorderPath, color: state.currentColor };
            state.customBorders.push(newBorder);
            pushHistory({ type: 'addBorder', border: newBorder });
            state.currentBorderPath = new Set();
            redrawAllOverlays();
        }
    } else if (e.button === 2 && state.isRightDown) {
        // When a right-click drag (border erase) ends, records the state change for undo/redo.
        if (state.activeMode === 'border' && preActionState) {
            // Pushes a single history entry encompassing the entire border modification.
            pushHistory({
                type: 'borderStateChange', // Use a new, more general history type
                before: preActionState,
                after: deepCopyBorders(state.customBorders)
            });
        } else if (state.activeMode === 'draw' && preActionState) {
            const afterState = state.bufferCtx.getImageData(0, 0, state.bufferCanvas.width, state.bufferCanvas.height);
            pushHistory({ type: 'draw', before: preActionState, after: afterState });
        }
    }

    // Resets all temporary state variables related to mouse interactions.
    state.isLeftDown = false;
    state.isRightDown = false;
    state.isDragging = false;
    state.clickCell = null;
    preActionState = null;
    drawCtx.globalCompositeOperation = 'source-over';
    if (state.bufferCtx) {
        state.bufferCtx.globalCompositeOperation = 'source-over';
    }
}
/**
 * Generates an SBN string from the current puzzle state and updates the browser's URL.
 * This creates a live, shareable link without reloading the page.
 */
function updateUrlWithSbn() {
    // A safeguard to prevent running before a puzzle is fully loaded.
    if (!state.regionGrid || state.regionGrid.length === 0) {
        return;
    }

    try {
        // Generate the SBN string, including the player's grid and mark history.
        const sbnString = encodeToSbn(state.regionGrid, state.starsPerRegion, state.playerGrid, state.history.mark);

        if (sbnString) {
            // Construct the new URL with the latest SBN.
            const newUrl = `${window.location.pathname}?sbn=${sbnString}`;
            // Update the URL in the browser's address bar.
            // replaceState is used to avoid creating a new entry in the browser's history for every move.
            window.history.replaceState({}, '', newUrl);
        }
    } catch (error) {
        // Log errors to the console without interrupting the user.
        console.error("Failed to update URL with SBN:", error);
    }
}
