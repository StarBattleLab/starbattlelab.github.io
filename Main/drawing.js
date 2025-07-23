/**
 **********************************************************************************
 *
 * Star Battle Puzzle - Drawing and Rendering
 *
 * @author Isaiah Tadrous
 * @version 1.3.3
 *
 * -------------------------------------------------------------------------------
 *
 * Description:
 * This file manages all visual rendering for the Star Battle puzzle application.
 * Its responsibilities include dynamically creating and styling the main puzzle
 * grid, drawing region borders, and placing player marks (stars, dots, X's).
 * It also handles all canvas-based overlays, such as free-form drawing, custom
 * region borders, and displaying the puzzle solution. A key feature is the
 * real-time error highlighting, which visually flags violations of the Star
 * Battle rules.
 *
 **********************************************************************************
 */

// --- RENDERING & DRAWING FUNCTIONS ---

/**
 * Renders the main puzzle grid based on the current `state.regionGrid` and `state.gridDim`.
 * This function creates the cell elements, applies region coloring (or black/white mode),
 * draws region borders, and updates the marks (stars/X's) within each cell.
 * It also triggers canvas resizing and overlay redraws.
 * @returns {void}
 */
function renderGrid() {
    gridContainer.innerHTML = ''; // Clear existing grid cells.
    if (!state.gridDim || !state.regionGrid || state.regionGrid.length === 0) return;

    // Toggle a CSS class to switch between colored and black & white mode for regions.
    gridContainer.classList.toggle('bw-mode', state.isBwMode);
    // Set up CSS Grid properties dynamically based on grid dimensions.
    gridContainer.style.gridTemplateColumns = `repeat(${state.gridDim}, 1fr)`;
    gridContainer.style.gridTemplateRows = `repeat(${state.gridDim}, 1fr)`;
    gridContainer.style.setProperty('--grid-dim', state.gridDim);

    // Iterate through each cell in the grid to create and style its corresponding DOM element.
    for (let r = 0; r < state.gridDim; r++) {
        for (let c = 0; c < state.gridDim; c++) {
            const cell = document.createElement('div');
            cell.classList.add('grid-cell');
            cell.dataset.r = r; // Store row index as a data attribute.
            cell.dataset.c = c; // Store column index as a data attribute.

            // Apply background color based on region ID if not in black & white mode.
            if (!state.isBwMode) {
                const regionId = state.regionGrid[r][c];
                const hue = (regionId * 67) % 360; // Calculate hue for distinct region colors.
                const isSaturated = regionId % 2 === 1; // Alternate saturation for visual variety.
                const sat = isSaturated ? 65 : 100;
                const light = isSaturated ? 77 : 90;
                cell.style.backgroundColor = `hsl(${hue}, ${sat}%, ${light}%)`;
            }

            // Add CSS classes for region borders based on adjacent cell region IDs.
            if (c > 0 && state.regionGrid[r][c - 1] !== state.regionGrid[r][c]) cell.classList.add('region-border-l');
            if (c < state.gridDim - 1 && state.regionGrid[r][c + 1] !== state.regionGrid[r][c]) cell.classList.add('region-border-r');
            if (r > 0 && state.regionGrid[r - 1][c] !== state.regionGrid[r][c]) cell.classList.add('region-border-t');
            if (r < state.gridDim - 1 && state.regionGrid[r + 1][c] !== state.regionGrid[r][c]) cell.classList.add('region-border-b');

            // Update the visual mark (star, X, or dot) inside the cell.
            updateCellMark(cell, state.playerGrid[r][c]);
            gridContainer.appendChild(cell);
        }
    }
    resizeCanvas(); // Adjust canvas dimensions to match the grid.
    redrawAllOverlays(); // Redraw all canvas overlays (drawings, borders, solution).
}

/**
 * Updates the visual mark (star, 'X', or dot) displayed within a specific grid cell's DOM element.
 * @param {HTMLElement} cellElement - The DOM element representing the grid cell.
 * @param {number} markState - The numerical state of the mark (0: empty, 1: star, 2: X/dot).
 * @returns {void}
 */
function updateCellMark(cellElement, markState) {
    if (!cellElement) return; // Exit if the cell element is not provided.
    switch (markState) {
        case 1: // State 1: Star
            cellElement.innerHTML = STAR_SVG; // Insert SVG for a star.
            break;
        case 2: // State 2: X or Dot (based on user preference)
            cellElement.innerHTML = state.markIsX ? X_SVG : DOT_SVG; // Insert SVG for X or dot.
            break;
        default: // State 0: Empty
            cellElement.innerHTML = ''; // Clear the cell's content.
            break;
    }
}

/**
 * Iterates through the entire `playerGrid` and updates the visual marks for all cells.
 * This is typically called after an action that changes multiple cell marks or when the mark type (X/dot) is toggled.
 * @returns {void}
 */
function renderAllMarks() {
    for (let r = 0; r < state.gridDim; r++) {
        for (let c = 0; c < state.gridDim; c++) {
            const cell = gridContainer.querySelector(`[data-r='${r}'][data-c='${c}']`);
            updateCellMark(cell, state.playerGrid[r][c]);
        }
    }
}

/**
 * Updates the UI to highlight cells that violate Star Battle rules.
 * It checks for:
 * 1. Adjacent stars.
 * 2. More than `starsPerRegion` stars in any row.
 * 3. More than `starsPerRegion` stars in any column.
 * 4. More than `starsPerRegion` stars in any region.
 * Invalid stars are given an 'error-star' CSS class for visual feedback, which is cleared first.
 * This function is skipped if `state.highlightErrors` is false.
 * @returns {void}
 */
function updateErrorHighlightingUI() {
    // A set to store the string coordinates 'r,c' of stars that are invalid.
    const invalidStarCoords = new Set();

    // First, clear all existing error highlights from every cell to ensure a clean slate for the current check.
    for (let r = 0; r < state.gridDim; r++) {
        for (let c = 0; c < state.gridDim; c++) {
            const cell = gridContainer.querySelector(`[data-r='${r}'][data-c='${c}']`);
            if (cell) cell.classList.remove('error-star');
        }
    }

    // If the error highlighting setting is turned off or grid is not initialized, exit early after clearing.
    if (!state.highlightErrors || state.gridDim === 0) {
        return;
    }

    // Initialize data structures to count stars for rule checking.
    const stars = []; // Stores {r, c} for all stars.
    const rowCounts = Array(state.gridDim).fill(0); // Counts stars per row.
    const colCounts = Array(state.gridDim).fill(0); // Counts stars per column.
    const regionStars = {}; // Stores { regionId: [{r, c}, ...] } for stars within each region.

    // Populate the counting structures by iterating through the player grid.
    for (let r = 0; r < state.gridDim; r++) {
        for (let c = 0; c < state.gridDim; c++) {
            if (state.playerGrid[r][c] === 1) { // If a star is found.
                const starPos = { r, c };
                stars.push(starPos);
                rowCounts[r]++;
                colCounts[c]++;
                const regionId = state.regionGrid[r][c];
                if (!regionStars[regionId]) regionStars[regionId] = [];
                regionStars[regionId].push(starPos);
            }
        }
    }

    // RULE 1: Check for adjacent stars.
    // Iterate through each star and check its 8 surrounding cells.
    stars.forEach(star => {
        for (let dr = -1; dr <= 1; dr++) {
            for (let dc = -1; dc <= 1; dc++) {
                if (dr === 0 && dc === 0) continue; // Skip the star itself.
                const nr = star.r + dr; // Neighbor row.
                const nc = star.c + dc; // Neighbor column.
                // If a neighboring cell is within bounds and also contains a star, mark the current star as invalid.
                if (nr >= 0 && nr < state.gridDim && nc >= 0 && nc < state.gridDim && state.playerGrid[nr][nc] === 1) {
                    invalidStarCoords.add(`${star.r},${star.c}`);
                }
            }
        }
    });

    // RULE 2: Check for too many stars in a row.
    for (let r = 0; r < state.gridDim; r++) {
        if (rowCounts[r] > state.starsPerRegion) {
            // If a row exceeds the star limit, mark all stars in that row as invalid.
            stars.forEach(star => {
                if (star.r === r) invalidStarCoords.add(`${star.r},${star.c}`);
            });
        }
    }

    // RULE 3: Check for too many stars in a column.
    for (let c = 0; c < state.gridDim; c++) {
        if (colCounts[c] > state.starsPerRegion) {
            // If a column exceeds the star limit, mark all stars in that column as invalid.
            stars.forEach(star => {
                if (star.c === c) invalidStarCoords.add(`${star.r},${star.c}`);
            });
        }
    }

    // RULE 4: Check for too many stars in a region.
    for (const regionId in regionStars) {
        if (regionStars[regionId].length > state.starsPerRegion) {
            // If a region exceeds the star limit, mark all stars in that region as invalid.
            regionStars[regionId].forEach(star => {
                invalidStarCoords.add(`${star.r},${star.c}`);
            });
        }
    }

    // Finally, apply the 'error-star' CSS class to all cells containing invalid stars for visual highlighting.
    invalidStarCoords.forEach(coord => {
        const [r, c] = coord.split(',');
        const cellElement = gridContainer.querySelector(`[data-r='${r}'][data-c='${c}']`);
        if (cellElement) {
            cellElement.classList.add('error-star');
        }
    });
}


/**
 * Resizes the drawing and buffer canvases to match the current dimensions of the grid container.
 * This ensures that drawings and overlays scale correctly with the grid.
 * It also copies the current drawing from the main canvas to the buffer canvas to preserve it during resize,
 * and then triggers a full redraw of all overlays.
 * @returns {void}
 */
function resizeCanvas() {
    const rect = gridContainer.getBoundingClientRect();

    if (state.bufferCtx) {
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = drawCanvas.width;
        tempCanvas.height = drawCanvas.height;
        const tempCtx = tempCanvas.getContext('2d');
        tempCtx.drawImage(drawCanvas, 0, 0);

        drawCanvas.width = rect.width;
        drawCanvas.height = rect.height;
        state.bufferCanvas.width = rect.width;
        state.bufferCanvas.height = rect.height;
        state.bufferCtx = state.bufferCanvas.getContext('2d');
        
        // Add this line
        state.bufferCtx.imageSmoothingEnabled = false;

        if (tempCanvas.width > 0 && tempCanvas.height > 0) {
            state.bufferCtx.drawImage(tempCanvas, 0, 0, rect.width, rect.height);
        }
    } else {
        // Fallback for initial load
        drawCanvas.width = rect.width;
        drawCanvas.height = rect.height;
        state.bufferCanvas.width = rect.width;
        state.bufferCanvas.height = rect.height;
        state.bufferCtx = state.bufferCanvas.getContext('2d');
    }

    redrawAllOverlays();
}

/**
 * Draws the puzzle solution as semi-transparent, glowing yellow circles on the `drawCtx` (main canvas).
 * This overlay is displayed only when `state.isViewingSolution` is true.
 * @returns {void}
 */
function drawSolutionOverlay() {
    if (!state.solution) return; // Do not draw if no solution is available.

    // Calculate cell dimensions based on canvas size and grid dimensions.
    const cellWidth = drawCanvas.width / state.gridDim;
    const cellHeight = drawCanvas.height / state.gridDim;

    drawCtx.fillStyle = 'rgba(252, 211, 77, 0.7)'; // Set fill color to semi-transparent amber.
    drawCtx.shadowColor = 'white'; // Set shadow color for a glowing effect.
    drawCtx.shadowBlur = 15; // Set shadow blur radius.

    // Iterate through the solution grid and draw a circle for each star.
    for (let r = 0; r < state.gridDim; r++) {
        for (let c = 0; c < state.gridDim; c++) {
            if (state.solution[r][c] === 1) { // If the solution indicates a star at this cell.
                const x = c * cellWidth + cellWidth / 2; // Calculate center X coordinate.
                const y = r * cellHeight + cellHeight / 2; // Calculate center Y coordinate.
                const radius = cellWidth / 4; // Set circle radius relative to cell size.

                drawCtx.beginPath(); // Start a new path.
                drawCtx.arc(x, y, radius, 0, 2 * Math.PI); // Draw a full circle.
                drawCtx.fill(); // Fill the circle.
            }
        }
    }
    drawCtx.shadowBlur = 0; // Reset shadow blur to prevent affecting subsequent drawings.
}

/**
 * Clears the main drawing canvas and then redraws all active overlays in the correct order:
 * 1. The buffered drawing content (from `state.bufferCanvas`).
 * 2. Custom user-drawn borders.
 * 3. The solution overlay if `state.isViewingSolution` is true.
 * @returns {void}
 */
function redrawAllOverlays() {
    drawCtx.clearRect(0, 0, drawCanvas.width, drawCanvas.height); // Clear the entire main drawing canvas.

    drawCustomBorders(); // Draw any custom borders defined by the user.
    
    // Draw the content from the off-screen buffer canvas onto the main canvas.
    if (state.bufferCtx) {
        drawCtx.drawImage(state.bufferCanvas, 0, 0);
    }

    // If the user is currently viewing the solution, draw the solution overlay.
    if (state.isViewingSolution) {
        drawSolutionOverlay();
    }
}

/**
 * Draws all custom user-defined borders and the currently drawn border path onto the main drawing canvas.
 * Borders are rendered as thick lines along the edges of the specified cells.
 * @returns {void}
 */
function drawCustomBorders() {
    if (!state.gridDim || state.gridDim === 0) return; // Exit if grid dimensions are not set.

    // Calculate cell dimensions for drawing.
    const cellWidth = drawCanvas.width / state.gridDim;
    const cellHeight = drawCanvas.height / state.gridDim;
    const thickness = 8; // Define the thickness of the borders.

    // Combine existing custom borders with the border currently being drawn (if any).
    const allBorders = [...state.customBorders];
    if (state.currentBorderPath.size > 0) {
        allBorders.push({ path: state.currentBorderPath, color: state.currentColor });
    }

    // Iterate through each border set and draw its segments.
    allBorders.forEach(border => {
        drawCtx.fillStyle = border.color; // Set the fill color for the current border.
        border.path.forEach(cellPos => {
            const [r, c] = cellPos.split(',').map(Number); // Parse row and column from the cell position string.
            const x = c * cellWidth; // Calculate top-left X coordinate of the cell.
            const y = r * cellHeight; // Calculate top-left Y coordinate of the cell.

            // Draw border segments around the cell if an adjacent cell is not part of the same border path.
            if (!border.path.has(`${r - 1},${c}`)) drawCtx.fillRect(x, y, cellWidth, thickness); // Top border.
            if (!border.path.has(`${r + 1},${c}`)) drawCtx.fillRect(x, y + cellHeight - thickness, cellWidth, thickness); // Bottom border.
            if (!border.path.has(`${r},${c - 1}`)) drawCtx.fillRect(x, y, thickness, cellHeight); // Left border.
            if (!border.path.has(`${r},${c + 1}`)) drawCtx.fillRect(x + cellWidth - thickness, y, thickness, cellHeight); // Right border.
        });
    });
}
