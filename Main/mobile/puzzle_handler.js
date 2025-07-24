/**
 **********************************************************************************
 *
 * Star Battle Handeling Logic
 *
 * @author Isaiah Tadrous
 * @version 1.0.2
 *
 * -------------------------------------------------------------------------------
 *
 * Description:
 * This file contains the ported logic from the Python backend's puzzle_handler.py
 * and history_manager.py. It handles all client-side SBN (Star Battle Notation)
 * encoding/decoding, player annotation processing, and history serialization.
 * This allows for faster puzzle loading and state management directly in the browser.
 *
 **********************************************************************************
 */

/**
 * Converts a comma-separated string into a 2D list (grid) and validates its dimensions.
 * @param {string} taskString - The comma-separated string of region numbers.
 * @returns {{grid: number[][]|null, dim: number|null}}
 */
function parseAndValidateGrid(taskString) {
    if (!taskString) return { grid: null, dim: null };
    try {
        const nums = taskString.split(',').map(n => parseInt(n, 10));
        if (!nums.length) return { grid: null, dim: null };
        const dim = Math.floor(Math.sqrt(nums.length));
        if (dim * dim !== nums.length) {
            console.warn("Invalid grid dimensions: not a perfect square.");
            return { grid: null, dim: null };
        }
        const grid = Array.from({ length: dim }, (_, i) => nums.slice(i * dim, (i + 1) * dim));
        return { grid, dim };
    } catch (e) {
        console.error("Failed to parse grid string into numbers.", e);
        return { grid: null, dim: null };
    }
}

/**
 * Rebuilds the region grid from its vertical and horizontal border definitions using a flood-fill (BFS) algorithm.
 * @param {number} dim - The dimension of the grid.
 * @param {string} vBits - A bitstring for vertical borders.
 * @param {string} hBits - A bitstring for horizontal borders.
 * @returns {number[][]} A 2D list representing the reconstructed region grid.
 */
function reconstructGridFromBorders(dim, vBits, hBits) {
    const grid = Array(dim).fill(0).map(() => Array(dim).fill(0));
    let regionId = 1;
    for (let rStart = 0; rStart < dim; rStart++) {
        for (let cStart = 0; cStart < dim; cStart++) {
            if (grid[rStart][cStart] === 0) {
                const q = [{ r: rStart, c: cStart }];
                grid[rStart][cStart] = regionId;
                while (q.length > 0) {
                    const { r, c } = q.shift(); // BFS
                    // Right
                    if (c < dim - 1 && grid[r][c + 1] === 0 && vBits[r * (dim - 1) + c] === '0') {
                        grid[r][c + 1] = regionId;
                        q.push({ r, c: c + 1 });
                    }
                    // Left
                    if (c > 0 && grid[r][c - 1] === 0 && vBits[r * (dim - 1) + (c - 1)] === '0') {
                        grid[r][c - 1] = regionId;
                        q.push({ r, c: c - 1 });
                    }
                    // Down
                    if (r < dim - 1 && grid[r + 1][c] === 0 && hBits[c * (dim - 1) + r] === '0') {
                        grid[r + 1][c] = regionId;
                        q.push({ r: r + 1, c });
                    }
                    // Up
                    if (r > 0 && grid[r - 1][c] === 0 && hBits[c * (dim - 1) + (r - 1)] === '0') {
                        grid[r - 1][c] = regionId;
                        q.push({ r: r - 1, c });
                    }
                }
                regionId++;
            }
        }
    }
    return grid;
}

/**
 * Decodes an SBN string into a puzzle data dictionary.
 * @param {string} sbnString - The SBN string to decode.
 * @returns {{task: string, stars: number}|null}
 */
function decodeSbn(sbnString) {
    try {
        const dim = SBN_CODE_TO_DIM_MAP[sbnString.substring(0, 2)];
        const stars = parseInt(sbnString[2], 10);
        const borderBitsNeeded = 2 * dim * (dim - 1);
        const borderCharsNeeded = Math.ceil(borderBitsNeeded / 6);
        const regionData = sbnString.substring(4, 4 + borderCharsNeeded);

        const fullBitfield = Array.from(regionData)
            .map(c => SBN_CHAR_TO_INT[c].toString(2).padStart(6, '0'))
            .join('')
            .slice(-borderBitsNeeded);

        const vBits = fullBitfield.substring(0, dim * (dim - 1));
        const hBits = fullBitfield.substring(dim * (dim - 1));

        const regionGrid = reconstructGridFromBorders(dim, vBits, hBits);
        const taskStr = regionGrid.flat().join(',');
        return { task: taskStr, stars: stars };
    } catch (e) {
        console.error(`Failed to decode SBN string: ${sbnString}`, e);
        return null;
    }
}

/**
 * Serializes the history of mark changes into a compact string format.
 * @param {object} history - The history object for marks.
 * @returns {string} The serialized history string.
 */
function serializeHistory(history) {
    if (!history.stack || history.stack.length === 0) return "";
    const changesToSerialize = history.stack.slice(0, history.pointer + 1);

    const changes = changesToSerialize.map(c => {
        if (c.type === 'mark') {
            return `${SBN_INT_TO_CHAR[c.r]}${SBN_INT_TO_CHAR[c.c]}${SBN_INT_TO_CHAR[c.from]}${SBN_INT_TO_CHAR[c.to]}`;
        } else if (c.type === 'compoundMark') {
            return c.changes.map(ch => `${SBN_INT_TO_CHAR[ch.r]}${SBN_INT_TO_CHAR[ch.c]}${SBN_INT_TO_CHAR[ch.from]}${SBN_INT_TO_CHAR[ch.to]}`).join('');
        }
        return '';
    }).join('');

    const pointer = SBN_INT_TO_CHAR[changesToSerialize.length] || '0';
    return `h:${changes}:${pointer}`;
}

/**
 * Deserializes a history string into a history object for the frontend.
 * @param {string} historyString - The serialized history string.
 * @returns {{changes: object[], pointer: number}}
 */
function deserializeHistory(historyString) {
    const history = { changes: [], pointer: 0 };
    try {
        if (!historyString || !historyString.startsWith('h:')) {
            return history;
        }
        const [, changeData, pointerData] = historyString.split(':');
        if (changeData) {
            for (let i = 0; i < changeData.length; i += 4) {
                const s = changeData.substring(i, i + 4);
                if (s.length === 4) {
                    history.changes.push({
                        r: SBN_CHAR_TO_INT[s[0]],
                        c: SBN_CHAR_TO_INT[s[1]],
                        from: SBN_CHAR_TO_INT[s[2]],
                        to: SBN_CHAR_TO_INT[s[3]],
                    });
                }
            }
        }
        history.pointer = SBN_CHAR_TO_INT[pointerData] || 0;
    } catch (e) {
        console.error("Error deserializing history:", e);
        return { changes: [], pointer: 0 }; // Return fresh on error
    }
    return history;
}


/**
 * Decodes a compact annotation string into a full player grid.
 * @param {string} annotationDataStr - The compact string of player moves.
 * @param {number} dim - The dimension of the grid.
 * @returns {number[][]} A 2D list representing the player's grid.
 */
function decodePlayerAnnotations(annotationDataStr, dim) {
    const grid = Array(dim).fill(0).map(() => Array(dim).fill(STATE_EMPTY));
    if (!annotationDataStr) return grid;
    try {
        const flatIndices = [];
        for (let r = 0; r < dim; r++) {
            for (let c = 0; c < dim; c++) {
                flatIndices.push({ r, c });
            }
        }
        const sbnToGame = { 0: STATE_EMPTY, 1: STATE_SECONDARY_MARK, 2: STATE_STAR };
        let charCursor = 0, cellCursor = 0;

        while (charCursor < annotationDataStr.length) {
            const value = SBN_CHAR_TO_INT[annotationDataStr[charCursor]] || 0;
            const states = [Math.floor(value / 16), Math.floor((value % 16) / 4), value % 4]; // Unpack base-4 values
            for (let i = 0; i < 3; i++) {
                const shiftedIndex = cellCursor + i - 2;
                if (shiftedIndex < dim * dim) {
                    const { r, c } = flatIndices[shiftedIndex];
                    grid[r][c] = sbnToGame[states[i]] || STATE_EMPTY;
                }
            }
            cellCursor += 3;
            charCursor += 1;
        }
        return grid;
    } catch (e) {
        console.error("Failed to decode player annotations, returning empty grid.", e);
        return Array(dim).fill(0).map(() => Array(dim).fill(STATE_EMPTY));
    }
}

/**
 * Encodes the player's grid (stars and marks) into a compact string.
 * @param {number[][]} playerGrid - The 2D grid of player moves.
 * @returns {string} A compact string representing the player's annotations.
 */
function encodePlayerAnnotations(playerGrid) {
    if (!playerGrid || playerGrid.length === 0) return "";
    const dim = playerGrid.length;
    const gameToSbn = { [STATE_EMPTY]: 0, [STATE_SECONDARY_MARK]: 1, [STATE_STAR]: 2 };
    const flat = playerGrid.flat().map(cell => gameToSbn[cell] || 0);

    if (flat.every(v => v === 0)) return "";
    const shiftedFlat = [0, 0, ...flat];
    let sbnStates = [];
    for (let i = 0; i < shiftedFlat.length; i += 3) {
        let chunk = shiftedFlat.slice(i, i + 3);
        while (chunk.length < 3) chunk.push(0);
        const value = chunk[0] * 16 + chunk[1] * 4 + chunk[2];
        sbnStates.push(SBN_INT_TO_CHAR[value]);
    }
    return sbnStates.join('');
}


/**
 * Encodes a full puzzle definition into the SBN format.
 * @param {number[][]} regionGrid - The 2D grid defining puzzle regions.
 * @param {number} stars - The number of stars per region.
 * @param {number[][]} playerGrid - The optional grid of player moves.
 * @param {object} history - The optional history object for serialization.
 * @returns {string|null} The complete SBN string, or null on failure.
 */
function encodeToSbn(regionGrid, stars, playerGrid, history) {
    const dim = regionGrid.length;
    const sbnCode = DIM_TO_SBN_CODE_MAP[dim];
    if (!sbnCode) return null;

    const verticalBits = [];
    for (let r = 0; r < dim; r++) {
        for (let c = 0; c < dim - 1; c++) {
            verticalBits.push(regionGrid[r][c] !== regionGrid[r][c + 1] ? '1' : '0');
        }
    }

    const horizontalBits = [];
    for (let c = 0; c < dim; c++) {
        for (let r = 0; r < dim - 1; r++) {
            horizontalBits.push(regionGrid[r][c] !== regionGrid[r + 1][c] ? '1' : '0');
        }
    }

    const cleanBitfield = verticalBits.join('') + horizontalBits.join('');
    const paddingNeeded = (6 - cleanBitfield.length % 6) % 6;
    const paddedBitfield = '0'.repeat(paddingNeeded) + cleanBitfield;

    const regionDataChars = [];
    for (let i = 0; i < paddedBitfield.length; i += 6) {
        const chunk = paddedBitfield.substring(i, i + 6);
        regionDataChars.push(SBN_INT_TO_CHAR[parseInt(chunk, 2)]);
    }
    const regionData = regionDataChars.join('');

    const rawAnnotationData = encodePlayerAnnotations(playerGrid);
    const historyString = history ? serializeHistory(history) : "";
    const flag = rawAnnotationData ? 'e' : 'W';

    let sbnString = `${sbnCode}${stars}${flag}${regionData}${rawAnnotationData}`;
    if (historyString) {
        sbnString += `~${historyString}`;
    }
    return sbnString;
}

/**
 * Universal import function to decode a puzzle string (SBN or Web Task format).
 * @param {string} importString - The string to be decoded.
 * @returns {object|null} A dictionary containing the full puzzle state.
 */
function universalImport(importString) {
    const parts = importString.trim().split('~');
    const mainPart = parts[0];
    const historyPart = parts.length > 1 ? parts[1] : "";

    let puzzleData = null;
    let rawAnnotationData = "";

    // Try decoding as SBN
    if (mainPart.length >= 4 && SBN_CODE_TO_DIM_MAP[mainPart.substring(0, 2)]) {
        try {
            puzzleData = decodeSbn(mainPart);
            if (!puzzleData) throw new Error("SBN decoding returned null.");
            const { dim } = parseAndValidateGrid(puzzleData.task);
            if (dim && mainPart[3] === 'e') {
                const borderCharsNeeded = Math.ceil((2 * dim * (dim - 1)) / 6);
                const baseSbnLen = 4 + borderCharsNeeded;
                rawAnnotationData = mainPart.substring(baseSbnLen);
            }
        } catch (e) {
            puzzleData = null; // Reset on failure
        }
    }

    // If not SBN, try Web Task (simple fallback, not as robust as python version)
    if (!puzzleData && /^\d+(,\d+)*$/.test(mainPart)) {
         const { grid, dim } = parseAndValidateGrid(mainPart);
         if(grid) {
            puzzleData = {
                task: mainPart,
                stars: state.puzzleDefs.find(p => p.dim === dim)?.stars || 1
            };
         }
    }

    if (puzzleData) {
        const { grid, dim } = parseAndValidateGrid(puzzleData.task);
        if (dim) {
            const playerGrid = decodePlayerAnnotations(rawAnnotationData, dim);
            const historyData = historyPart ? deserializeHistory(historyPart) : null;
            
            // Reconstruct history stack from flat changes
            const markHistory = { stack: [], pointer: -1 };
            if (historyData && historyData.changes) {
                 markHistory.stack = historyData.changes.map(c => ({...c, type: 'mark'}));
                 markHistory.pointer = historyData.pointer -1;
            }

            return {
                regionGrid: grid,
                playerGrid: playerGrid,
                starsPerRegion: puzzleData.stars,
                history: markHistory,
                gridDim: dim
            };
        }
    }

    console.error("Could not recognize puzzle format.");
    return null;
}
