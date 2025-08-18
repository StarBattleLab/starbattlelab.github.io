/**
 * **********************************************************************************
 * Title: Star Battle API and Data Management
 * **********************************************************************************
 * @author Isaiah Tadrous
 * @version 1.1.7
 * *-------------------------------------------------------------------------------
 * This script manages all asynchronous communication with the backend API for the
 * Star Battle puzzle application. Its responsibilities include fetching new
 * puzzles, sending the current puzzle to be solved by the server, and verifying
 * the correctness of a player's solution. It also implements the import and
 * export functionality, converting game states to and from a portable string
 * format (SBN) via API calls. Furthermore, it handles the client-side persistence
 * of game states by saving and loading puzzles, including player progress and
 * drawings, to and from the browser's local storage.
 * **********************************************************************************
 */

// --- API & PUZZLE DATA FUNCTIONS ---

// --- CORE API COMMUNICATION ---

/**
 * Fetches a new puzzle from the local puzzles.json file.
 * On success, it clears the current game state, updates the state with the new
 * puzzle data, and renders the new grid.
 * @async
 * @returns {Promise<void>} A promise that resolves when the new puzzle is fetched and rendered.
 */
async function fetchNewPuzzle() {
    setLoading(true);
    const sizeId = sizeSelect.value;
    try {
        const response = await fetch(PUZZLES_JSON_PATH);
        if (!response.ok) throw new Error(`Failed to load ${PUZZLES_JSON_PATH}`);
        const allPuzzles = await response.json();
        const puzzlesForSize = allPuzzles[sizeId];
        if (!puzzlesForSize || puzzlesForSize.length === 0) throw new Error(`No puzzles for size_id ${sizeId}`);
        
        const randomSbn = puzzlesForSize[Math.floor(Math.random() * puzzlesForSize.length)];
        const puzzleData = decodeSbn(randomSbn);

        if (!puzzleData) throw new Error('Failed to decode SBN from local file');
        
        const { grid, dim } = parseAndValidateGrid(puzzleData.task);
        if (!grid) throw new Error('Failed to parse grid from decoded SBN');

        // Update global state with new puzzle data
        state.regionGrid = grid;
        state.starsPerRegion = puzzleData.stars;
        state.sourcePuzzleData = { task: puzzleData.task, stars: puzzleData.stars };
        state.gridDim = dim;
        state.solution = null;
        state.isViewingSolution = false;
        gridContainer.classList.remove('solution-mode');
        updateSolutionButtonUI();
        
        // Reset and render the game board
        clearPuzzleState();
        renderGrid();
        showScreen('game');
    } catch (error) {
        console.error("Error fetching new puzzle:", error);
        setStatus("Failed to load puzzle.", false);
    } finally {
        setLoading(false);
    }
}

/**
 * Sends the current puzzle's definition to the backend API to find a solution.
 * If a solution is found, it is stored in the state, and the UI is updated.
 * @async
 * @returns {Promise<void>} A promise that resolves when the solution attempt is complete.
 */
async function findSolution() {
    if (state.solution) { // Don't re-solve if solution is already known
        state.isViewingSolution = !state.isViewingSolution;
        updateSolutionButtonUI();
        redrawAllOverlays();
        return;
    }
    
    setLoading(true);
    setStatus("Solving...", null, 0); // Persisting message

    // Use a timeout to allow the UI to update before the potentially blocking solver runs
    await new Promise(resolve => setTimeout(resolve, 50)); 

    try {
        // 1. Create an instance of the new solver
        const solver = new UltimateStarBattleSolver(state.regionGrid, state.starsPerRegion);
        
        // 2. Run the solver
        const result = solver.solve(); // This is a synchronous, blocking call

        // 3. Process the results
        if (result.solutions && result.solutions.length > 0) {
            setStatus("Solution found! Tap 'View' to see it.", true);
            state.solution = result.solutions[0]; // Store the first found solution
            state.isViewingSolution = true; // Automatically view it the first time
            updateSolutionButtonUI();
            redrawAllOverlays(); // Redraw to show the solution immediately
        } else {
            setStatus("No solution could be found for this puzzle.", false);
        }
        
        console.log("Solver Stats:", result.stats); // Optional: log stats to the console

    } catch (error) {
        console.error("Error during client-side solving:", error);
        setStatus("The solver encountered an error.", false);
    } finally {
        setLoading(false);
    }
}

/**
 * Verifies the player's grid against Star Battle rules without calling the solver.
 * Checks for correct star counts and adjacency rules.
 * @async
 * @param {boolean} [isManualCheck=false] - If true, displays error messages on failure.
 * @returns {Promise<void>} A promise that resolves when the check is complete.
 */
async function checkSolution(isManualCheck = false, lastStarCoords = null) {
    // Only show the "Verifying..." status and loading spinner for manual checks
    if (isManualCheck) {
        setLoading(true);
        setStatus("Verifying solution...", null, 0);
        await new Promise(resolve => setTimeout(resolve, 50));
    }

    try {
        const { gridDim, starsPerRegion, playerGrid, regionGrid } = state;
        
        if (gridDim === 0) {
            if (isManualCheck) setStatus("No puzzle loaded to check.", false);
            return;
        }

        // ... (The entire middle section of the function for checking the puzzle remains unchanged)
        const stars = [];
        const rowCounts = Array(gridDim).fill(0);
        const colCounts = Array(gridDim).fill(0);
        const regionStars = {};
        const regionIds = new Set(regionGrid.flat());
        regionIds.forEach(id => regionStars[id] = []);

        for (let r = 0; r < gridDim; r++) {
            for (let c = 0; c < gridDim; c++) {
                if (playerGrid[r][c] === 1) {
                    stars.push({ r, c });
                    rowCounts[r]++;
                    colCounts[c]++;
                    regionStars[regionGrid[r][c]].push({ r, c });
                }
            }
        }
        
        let isCorrect = true;
        let errorMessage = "Incorrect. Keep trying!";

        for (const star of stars) {
            let adjacentFound = false;
            for (let dr = -1; dr <= 1; dr++) {
                for (let dc = -1; dc <= 1; dc++) {
                    if (dr === 0 && dc === 0) continue;
                    const nr = star.r + dr;
                    const nc = star.c + dc;
                    if (nr >= 0 && nr < gridDim && nc >= 0 && nc < gridDim && playerGrid[nr][nc] === 1) {
                        adjacentFound = true;
                        break;
                    }
                }
                if (adjacentFound) break;
            }
            if (adjacentFound) {
                isCorrect = false;
                //errorMessage = "Incorrect. Some stars are touching.";
                break;
            }
        }

        if (isCorrect) {
            const countsAreValid = 
                rowCounts.every(count => count === starsPerRegion) &&
                colCounts.every(count => count === starsPerRegion) &&
                Object.values(regionStars).every(region => region.length === starsPerRegion);
            
            if (!countsAreValid) {
                isCorrect = false;
                //errorMessage = "Incorrect. Check star counts in rows, columns, or regions.";
            }
        }
        // ... (End of the unchanged checking logic)

        // Display result
        if (isCorrect && stars.length === gridDim * starsPerRegion) {
            setStatus("Correct!", true);
            triggerSuccessAnimation(lastStarCoords);
        } else if (isManualCheck) { // <<< THIS IS THE KEY CHANGE
            // Only show error messages if the check was manually triggered
            if (stars.length !== gridDim * starsPerRegion) {
                 //errorMessage = `Incorrect. You need ${gridDim * starsPerRegion} stars total.`;
            }
            setStatus(errorMessage, false);
        }

    } catch (error) {
        console.error("Error checking solution:", error);
        if (isManualCheck) setStatus("An error occurred during verification.", false);
    } finally {
        if (isManualCheck) setLoading(false);
    }
}

// --- IMPORT / EXPORT FUNCTIONALITY ---

/**
 * Imports a puzzle from a given string using local logic.
 * On success, it loads the puzzle definition and any included player progress.
 * @async
 * @param {string} importString - The puzzle data string (SBN or Web Task format).
 * @returns {Promise<boolean>} A promise that resolves to true on successful import, false otherwise.
 */
async function importPuzzleString(importString) {
    if (!importString) return false;
    setLoading(true);
    try {
        const data = universalImport(importString);
        if (!data) throw new Error('Could not recognize puzzle format');

        // Update state with imported puzzle data
        state.gridDim = data.gridDim;
        state.starsPerRegion = data.starsPerRegion;
        state.regionGrid = data.regionGrid;
        state.sourcePuzzleData = { task: data.regionGrid.flat().join(','), stars: data.starsPerRegion };
        state.solution = null;
        state.isViewingSolution = false;
        gridContainer.classList.remove('solution-mode');
        clearPuzzleState(); // Clear old state before loading new

        // Restore player grid and history from imported data
        state.playerGrid = data.playerGrid;
        if (data.history) {
            state.history.mark = data.history;
        }

        // Render the newly loaded puzzle and update UI
        renderGrid();
        updateErrorHighlightingUI();
        updateSolutionButtonUI();
        updateUndoRedoButtons();
        setStatus("Puzzle loaded successfully!", true);
        showScreen('game');
        return true;
    } catch (error) {
        console.error("Error importing puzzle:", error);
        setStatus(`Import failed: ${error.message}`, false);
        return false;
    } finally {
        setLoading(false);
    }
}

/**
 * Handles the user-facing import process by prompting for a puzzle string
 * and then calling the main import function.
 * @async
 * @returns {Promise<void>}
 */
async function handleImport() {
    // Finds the importer UI created by mobile_import.js and displays it.
    const importerContainer = document.getElementById('importerContainer');
    if (importerContainer) {
        importerContainer.style.display = 'flex';
    }
}

/**
 * Exports the current game state to an SBN string via local logic.
 * The resulting string is then copied to the user's clipboard.
 * @async
 * @returns {Promise<void>} A promise that resolves when the export process is complete.
 */
async function handleExport() {
    try {
        const sbnString = encodeToSbn(state.regionGrid, state.starsPerRegion, state.playerGrid, state.history.mark);
        if (!sbnString) throw new Error("Failed to generate SBN string.");
        
        // Copy to clipboard with a fallback prompt
        navigator.clipboard.writeText(sbnString).then(() => {
            setStatus("SBN string copied to clipboard!", true);
        }, () => {
            prompt("Could not auto-copy. Here is your SBN string:", sbnString);
        });
    } catch (error) {
        console.error("Error exporting puzzle:", error);
        setStatus("Export failed.", false);
    }
}

// --- LOCAL SAVE & LOAD MANAGEMENT ---

/**
 * Saves the current game state to the browser's local storage.
 * It first generates an SBN string locally, then stores it along with
 * a user comment, timestamp, and canvas drawing data.
 * @async
 * @returns {Promise<void>} A promise that resolves when the save operation is complete.
 */
async function handleSave() {
    const comment = prompt("Enter a comment for this save:", "");
    if (comment === null) { // User cancelled the prompt
        setStatus("Save cancelled.", null, 1500);
        return;
    }
    try {
        const sbnString = encodeToSbn(state.regionGrid, state.starsPerRegion, state.playerGrid, state.history.mark);
        if (!sbnString) throw new Error("Failed to generate SBN string for saving.");

        // Retrieve existing saves and prepend the new one
        const saves = JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY) || '[]');
        const newSave = {
            sbn: sbnString,
            comment: comment || 'No comment',
            date: new Date().toISOString(),
            drawingData: state.bufferCanvas.toDataURL(), // Save canvas drawings
            borderData: state.customBorders.map(border => ({ // Save custom borders
                color: border.color,
                path: Array.from(border.path)
            }))
        };
        saves.unshift(newSave); // Add to the beginning of the list
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(saves));
        setStatus("Puzzle saved successfully!", true);
    } catch (error) {
        console.error("Error saving puzzle:", error);
        setStatus("Save failed.", false);
    }
}

/**
 * Populates the "Load Game" modal with a list of puzzles saved in local storage.
 * It creates interactive HTML elements for each saved game.
 * @returns {void}
 */
function populateLoadModal() {
    const saves = JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY) || '[]');
    modalContent.innerHTML = '';
    if (saves.length === 0) {
        modalContent.innerHTML = '<p class="text-gray-400 text-center">No puzzles saved yet.</p>';
        return;
    }
    saves.forEach((save, index) => {
        const saveDate = new Date(save.date);
        const dateString = saveDate.toLocaleString();
        const item = document.createElement('div');
        item.className = 'save-item';
        item.dataset.sbn = save.sbn;
        item.dataset.index = index;
        item.innerHTML = `
            <div class="flex justify-between items-start">
                <div>
                    <p class="font-semibold text-lg text-gray-200">${save.comment}</p>
                    <p class="save-date">${dateString}</p>
                </div>
                <button class="delete-save-btn text-red-500 hover:text-red-400 font-bold text-2xl" data-index="${index}">&times;</button>
            </div>
        `;
        modalContent.appendChild(item);
    });
}

