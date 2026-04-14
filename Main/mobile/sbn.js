/**
 **********************************************************************************
 *
 * Star Battle Puzzle - SBN (Star Battle Notation)
 *
 * @author Isaiah Tadrous
 * @version 2.0.0
 *
 * -------------------------------------------------------------------------------
 *
 * Description:
 * A compact, self contained encoding for Star Battle puzzles that stores
 * the full puzzle definition, player annotations, and undo/redo history
 * in a single shareable string. Uses a base-85 alphabet for improved
 * information density over v1, 4 cell ternary annotation packing, compound
 * history entries, and delimiter free parsing with deterministic section
 * lengths. Backward compatible with v1 strings on import.
 *
 **********************************************************************************
 */

// --- BASE-85 ALPHABET ---

const SBN2_ALPHABET =
    '0123456789'                       +
    'ABCDEFGHIJKLMNOPQRSTUVWXYZ'       +
    'abcdefghijklmnopqrstuvwxyz'       +
    '-_!#$&()*+,/:;=?@[]^{}|';

/**
 * Lookup table: character → numeric value (0-84).
 * Uses Object.create(null) so there are no inherited keys from Object.prototype,
 * which makes property lookups marginally faster and avoids edge-case collisions
 * with built-in names like 'constructor' or 'toString'.
 * @type {Object.<string, number>}
 */
const SBN2_C2V = Object.create(null);

/**
 * Lookup table: numeric value (0-84) → character.
 * @type {string[]}
 */
const SBN2_V2C = [];

for (let i = 0; i < SBN2_ALPHABET.length; i++) {
    SBN2_C2V[SBN2_ALPHABET[i]] = i;
    SBN2_V2C[i] = SBN2_ALPHABET[i];
}


// --- Star-count Encoding ---

/**
 * Converts a star count (1-26) to its letter encoding.
 * @param {number} stars - Stars per region, 1-26.
 * @returns {string} Single uppercase letter: A=1, B=2, ..., Z=26.
 */
function starsToChar(stars) {
    return String.fromCharCode(64 + stars);
}

/**
 * Converts a star-encoding letter back to a number.
 * @param {string} ch - Single uppercase letter A-Z.
 * @returns {number} Star count, 1-26.
 */
function charToStars(ch) {
    return ch.charCodeAt(0) - 64;
}


// --- BASE-85 BITSTREAM CODEC ---

/**
 * Computes the number of base-85 characters needed to encode `numBits` bits.
 *
 * @param {number} numBits - Number of bits to encode.
 * @returns {number} Minimum characters required. Returns 0 for numBits ≤ 0.
 *
 * @example
 *   base85CharsNeeded(40)  → 7  (a 5×5 grid's border bitfield)
 *   base85CharsNeeded(180) → 29 (a 10×10 grid's border bitfield)
 */
function base85CharsNeeded(numBits) {
    if (numBits <= 0) return 0;
    return Math.ceil(numBits * Math.log(2) / Math.log(85));
}

/**
 * Packs an array of 0/1 bits into a fixed-length base-85 string.
 *
 * The output length is exactly base85CharsNeeded(bits.length) characters.
 * Leading "zero digits" (the character '0', which has value 0 in our alphabet)
 * are preserved so the string is always the deterministic length.
 *
 * @param {number[]} bits - Array of 0s and 1s, MSB at index 0.
 * @returns {string} Base-85 encoded string.
 *
 * @example
 *   packBits85([1, 0, 1, 1, 0])  →  "0N"
 *   // 10110₂ = 22₁₀;  22 in base-85 = [0, 22] → "0N"
 */
function packBits85(bits) {
    if (!bits.length) return '';

    // Convert bit array to a single BigInt value (MSB first)
    let val = 0n;
    for (let i = 0; i < bits.length; i++) {
        val = (val << 1n) | BigInt(bits[i]);
    }

    // Convert BigInt to base-85 digits, big-endian
    const numChars = base85CharsNeeded(bits.length);
    const chars = new Array(numChars);
    for (let i = numChars - 1; i >= 0; i--) {
        chars[i] = SBN2_V2C[Number(val % 85n)];
        val = val / 85n;   // BigInt division truncates (floor)
    }

    return chars.join('');
}

/**
 * Unpacks a base-85 string into exactly `numBits` bits.
 *
 * @param {string} str - Base-85 encoded string.
 * @param {number} numBits - Exact number of bits to extract.
 * @returns {number[]} Array of 0s and 1s, MSB at index 0.
 *
 * @example
 *   unpackBits85("0N", 5)  →  [1, 0, 1, 1, 0]
 */
function unpackBits85(str, numBits) {
    if (numBits <= 0 || !str) return [];

    // Convert base-85 string to BigInt
    let val = 0n;
    for (let i = 0; i < str.length; i++) {
        val = val * 85n + BigInt(SBN2_C2V[str[i]] || 0);
    }

    // Extract bits MSB-first
    const bits = new Array(numBits);
    for (let i = numBits - 1; i >= 0; i--) {
        bits[numBits - 1 - i] = Number((val >> BigInt(i)) & 1n);
    }

    return bits;
}


// --- REGION CODEC ---

/**
 * Computes the number of border bits for a dim×dim grid.
 * @param {number} dim - Grid dimension.
 * @returns {number} Total border bits: 2 × dim × (dim − 1).
 */
function borderBitCount(dim) {
    return 2 * dim * (dim - 1);
}

/**
 * Computes the number of base-85 characters needed for a dim×dim grid's region data.
 * This is the critical function that enables delimiter-free parsing: the parser
 * uses this to know exactly how many characters to consume for the region section.
 *
 * @param {number} dim - Grid dimension.
 * @returns {number} Number of base-85 characters.
 *
 * @example
 *   regionCharsForDim(5)   →  7   (40 bits)
 *   regionCharsForDim(10)  →  29  (180 bits)
 *   regionCharsForDim(25)  →  188 (1200 bits)
 */
function regionCharsForDim(dim) {
    return base85CharsNeeded(borderBitCount(dim));
}

/**
 * Encodes a region grid into a base-85 border string.
 *
 * @param {number[][]} regionGrid - N×N grid where each cell contains a region ID.
 *   Region IDs can be any integers; only equality between adjacent cells matters.
 * @returns {string} Base-85 encoded border bitfield.
 */
function encodeRegion85(regionGrid) {
    const dim = regionGrid.length;
    const bits = [];

    // Vertical borders: between columns c and c+1, for each row
    for (let r = 0; r < dim; r++) {
        for (let c = 0; c < dim - 1; c++) {
            bits.push(regionGrid[r][c] !== regionGrid[r][c + 1] ? 1 : 0);
        }
    }

    // Horizontal borders: between rows r and r+1, for each column
    for (let c = 0; c < dim; c++) {
        for (let r = 0; r < dim - 1; r++) {
            bits.push(regionGrid[r][c] !== regionGrid[r + 1][c] ? 1 : 0);
        }
    }

    return packBits85(bits);
}

/**
 * Decodes a base-85 border string into a region grid using BFS flood-fill.
 *
 * @param {string} regionStr - Base-85 encoded border bitfield.
 * @param {number} dim - Grid dimension (must match the dimension used during encoding).
 * @returns {number[][]} N×N grid with region IDs starting from 1.
 *   Region ID assignment is deterministic: regions are numbered in the order
 *   their top-left-most cell is encountered during a left-to-right, top-to-bottom scan.
 */
function decodeRegion85(regionStr, dim) {
    const bits = unpackBits85(regionStr, borderBitCount(dim));
    const vLen = dim * (dim - 1);
    const vBits = bits.slice(0, vLen);    // vertical border bits
    const hBits = bits.slice(vLen);       // horizontal border bits

    const grid = Array.from({ length: dim }, () => new Array(dim).fill(0));
    let regionId = 1;

    for (let rStart = 0; rStart < dim; rStart++) {
        for (let cStart = 0; cStart < dim; cStart++) {
            if (grid[rStart][cStart] !== 0) continue;  // already assigned

            // BFS flood-fill: all cells reachable without crossing a border
            const queue = [{ r: rStart, c: cStart }];
            grid[rStart][cStart] = regionId;

            while (queue.length > 0) {
                const { r, c } = queue.shift();

                // Right neighbor: vertical border between (r,c) and (r,c+1)
                if (c < dim - 1 && grid[r][c + 1] === 0 &&
                    vBits[r * (dim - 1) + c] === 0) {
                    grid[r][c + 1] = regionId;
                    queue.push({ r, c: c + 1 });
                }
                // Left neighbor: vertical border between (r,c-1) and (r,c)
                if (c > 0 && grid[r][c - 1] === 0 &&
                    vBits[r * (dim - 1) + (c - 1)] === 0) {
                    grid[r][c - 1] = regionId;
                    queue.push({ r, c: c - 1 });
                }
                // Down neighbor: horizontal border between (r,c) and (r+1,c)
                if (r < dim - 1 && grid[r + 1][c] === 0 &&
                    hBits[c * (dim - 1) + r] === 0) {
                    grid[r + 1][c] = regionId;
                    queue.push({ r: r + 1, c });
                }
                // Up neighbor: horizontal border between (r-1,c) and (r,c)
                if (r > 0 && grid[r - 1][c] === 0 &&
                    hBits[c * (dim - 1) + (r - 1)] === 0) {
                    grid[r - 1][c] = regionId;
                    queue.push({ r: r - 1, c });
                }
            }
            regionId++;
        }
    }

    return grid;
}


// --- ANNOTATION CODEC ---

/**
 * State mapping: game state → ternary encoding value.
 *   Game state 0 (empty)  → SBN value 0
 *   Game state 2 (X/dot)  → SBN value 1
 *   Game state 1 (star)   → SBN value 2
 * @type {Object.<number, number>}
 */
const _GAME_TO_SBN = { 0: 0, 2: 1, 1: 2 };

/**
 * State mapping: ternary encoding value → game state.
 * @type {Object.<number, number>}
 */
const _SBN_TO_GAME = { 0: 0, 1: 2, 2: 1 };

/**
 * Maximum number of base-85 characters an annotation section can use for a given dim.
 * @param {number} dim - Grid dimension.
 * @returns {number} Maximum annotation character count.
 */
function annotCharsForDim(dim) {
    return Math.ceil((dim * dim) / 4);
}

/**
 * Encodes a player grid into a base-85 annotation string.
 *
 * @param {number[][]} playerGrid - N×N grid with game states (0=empty, 1=star, 2=mark).
 * @returns {string} Compact base-85 string. Empty string if grid has no marks.
 */
function encodeAnnotations85(playerGrid) {
    if (!playerGrid || playerGrid.length === 0) return '';
    const flat = playerGrid.flat().map(c => _GAME_TO_SBN[c] || 0);

    // Fast path: if no marks at all, return empty
    if (flat.every(v => v === 0)) return '';

    const chars = [];
    for (let i = 0; i < flat.length; i += 4) {
        // Pack 4 ternary digits: val = d₀×27 + d₁×9 + d₂×3 + d₃
        let val = 0;
        for (let j = 0; j < 4; j++) {
            val = val * 3 + (i + j < flat.length ? flat[i + j] : 0);
        }
        chars.push(SBN2_V2C[val]);
    }

    // Trim trailing zero-characters (all-empty cell groups)
    while (chars.length > 0 && chars[chars.length - 1] === SBN2_V2C[0]) {
        chars.pop();
    }

    return chars.join('');
}

/**
 * Decodes a base-85 annotation string into a player grid.
 *
 * @param {string} str - Base-85 annotation string (may be empty or shorter than full grid).
 * @param {number} dim - Grid dimension.
 * @returns {number[][]} N×N grid with game states (0=empty, 1=star, 2=mark).
 */
function decodeAnnotations85(str, dim) {
    const grid = Array.from({ length: dim }, () => new Array(dim).fill(0));
    if (!str) return grid;

    // Unpack all characters into a flat array of ternary digits
    const flat = [];
    for (let i = 0; i < str.length; i++) {
        let val = SBN2_C2V[str[i]] || 0;
        const cells = [0, 0, 0, 0];
        for (let j = 3; j >= 0; j--) {
            cells[j] = val % 3;
            val = Math.floor(val / 3);
        }
        flat.push(...cells);
    }

    // Map ternary values back to game states
    for (let r = 0; r < dim; r++) {
        for (let c = 0; c < dim; c++) {
            const idx = r * dim + c;
            const sbnVal = idx < flat.length ? flat[idx] : 0;
            grid[r][c] = _SBN_TO_GAME[sbnVal] || 0;
        }
    }

    return grid;
}


// --- HISTORY CODEC ---

/**
 * Computes the number of base-85 characters needed per grid coordinate.
 * Scales with grid dimension to support arbitrarily large puzzles.
 *
 * @param {number} dim - Grid dimension.
 * @returns {number} 1 if dim ≤ 85, 2 if dim ≤ 7225, 3 otherwise.
 */
function coordWidth(dim) {
    if (dim <= 85)   return 1;   // 85¹ = 85
    if (dim <= 7225) return 2;   // 85² = 7,225
    return 3;                    // 85³ = 614,125
}

/**
 * Encodes a coordinate value as a fixed-width base-85 string.
 * Big-endian: most significant digit first.
 *
 * @param {number} val - Coordinate value (0-based row or column index).
 * @param {number} width - Number of characters (from coordWidth()).
 * @returns {string} Fixed-width base-85 string.
 */
function encodeCoord(val, width) {
    const chars = [];
    for (let i = 0; i < width; i++) {
        chars.push(SBN2_V2C[val % 85]);
        val = Math.floor(val / 85);
    }
    return chars.reverse().join('');
}

/**
 * Decodes a fixed-width base-85 coordinate from a string.
 *
 * @param {string} str - Source string.
 * @param {number} offset - Starting character index.
 * @param {number} width - Number of characters to read.
 * @returns {number} Decoded coordinate value.
 */
function decodeCoord(str, offset, width) {
    let val = 0;
    for (let i = 0; i < width; i++) {
        val = val * 85 + (SBN2_C2V[str[offset + i]] || 0);
    }
    return val;
}

/**
 * Serializes the mark history into a compact string with compound entry support.
 *
 * Each history stack item is either:
 *   - { type: 'mark', r, c, from, to }           → single cell change
 *   - { type: 'compoundMark', changes: [...] }    → atomic group of changes
 *
 * @param {object} history - History object with .stack and .pointer properties.
 * @param {number} dim - Grid dimension (determines coordinate encoding width).
 * @returns {string} Encoded history string, or empty string if no history.
 */
function serializeHistory2(history, dim) {
    if (!history || !history.stack || history.stack.length === 0) return '';
    const w = coordWidth(dim);
    const items = history.stack.slice(0, history.pointer + 1);
    if (items.length === 0) return '';

    let data = '';

    for (const entry of items) {
        // Normalize: get the array of changes for this entry
        const changes = entry.type === 'compoundMark' ? entry.changes : [entry];
        const count = changes.length;

        // Encode the count
        if (count > 0 && count < 85) {
            // Common case: count fits in 1 character
            data += SBN2_V2C[count];
        } else if (count >= 85) {
            // Escape: 0 + 2-char count (supports up to 7224)
            data += SBN2_V2C[0];
            data += encodeCoord(count, 2);
        } else {
            continue;  // skip empty entries
        }

        // Encode each change: row + col + from + to
        for (const c of changes) {
            data += encodeCoord(c.r, w);
            data += encodeCoord(c.c, w);
            data += SBN2_V2C[c.from || 0];
            data += SBN2_V2C[c.to || 0];
        }
    }

    // Pointer: how many entries are in the serialized history
    const pointerStr = encodeCoord(items.length, Math.max(w, 1));

    // Format: {coordWidth}{entries}>{pointer}
    return `${w}${data}>${pointerStr}`;
}

/**
 * Deserializes a v2 history string back into a history object.
 *
 * @param {string} str - Encoded history string.
 * @param {number} dim - Grid dimension.
 * @returns {{stack: object[], pointer: number}} History object compatible
 *   with the application's state.history.mark format.
 */
function deserializeHistory2(str, dim) {
    const result = { stack: [], pointer: -1 };
    if (!str || str.length < 2) return result;

    try {
        const w = parseInt(str[0], 10);
        if (isNaN(w) || w < 1 || w > 3) return result;

        // Split on '>' to separate entries from pointer
        const markerPos = str.lastIndexOf('>');
        if (markerPos < 0) return result;

        const entriesStr = str.substring(1, markerPos);
        const pointerStr = str.substring(markerPos + 1);

        const changeSize = 2 * w + 2;  // bytes per individual cell change
        let pos = 0;

        while (pos < entriesStr.length) {
            // Read count
            let count = SBN2_C2V[entriesStr[pos]] || 0;
            pos++;

            if (count === 0 && pos + 1 < entriesStr.length) {
                // Escape: next 2 chars encode larger count
                count = decodeCoord(entriesStr, pos, 2);
                pos += 2;
            }

            if (count <= 0 || pos + count * changeSize > entriesStr.length) break;

            // Read `count` changes
            const changes = [];
            for (let i = 0; i < count; i++) {
                changes.push({
                    r:    decodeCoord(entriesStr, pos, w),
                    c:    decodeCoord(entriesStr, pos + w, w),
                    from: SBN2_C2V[entriesStr[pos + 2 * w]]     || 0,
                    to:   SBN2_C2V[entriesStr[pos + 2 * w + 1]] || 0,
                });
                pos += changeSize;
            }

            // Push as single mark or compound mark
            if (changes.length === 1) {
                result.stack.push({ type: 'mark', ...changes[0] });
            } else {
                result.stack.push({ type: 'compoundMark', changes });
            }
        }

        // Decode pointer
        const ptrWidth = Math.max(w, 1);
        result.pointer = pointerStr.length >= ptrWidth
            ? decodeCoord(pointerStr, 0, ptrWidth) - 1
            : result.stack.length - 1;

    } catch (e) {
        console.error('SBN v2 history deserialization error:', e);
    }

    return result;
}


// --- FULL SBN v2 ENCODE / DECODE ---

/**
 * Encodes a complete puzzle state into a single SBN v2 string.
 *
 * @param {number[][]} regionGrid  - N×N region grid (any integer IDs, only adjacency matters).
 * @param {number}     stars       - Stars per region/row/column (1-26).
 * @param {number[][]|null} [playerGrid=null] - N×N player marks (0=empty, 1=star, 2=mark). Optional.
 * @param {object|null} [markHistory=null]    - History object with .stack and .pointer. Optional.
 * @returns {string} Complete SBN v2 string ready for sharing, storage, or export.
 *
 * @example
 *   // Minimal: just the puzzle definition
 *   encodeSBN2(regionGrid, 2)
 *   // → "10B{28 chars of region data}"
 *
 *   // With player marks
 *   encodeSBN2(regionGrid, 2, playerGrid)
 *   // → "10B{region}{annotations}"
 *
 *   // With marks and history
 *   encodeSBN2(regionGrid, 2, playerGrid, history)
 *   // → "10B{region}{annotations}~{history}"
 */
function encodeSBN2(regionGrid, stars, playerGrid = null, markHistory = null) {
    const dim = regionGrid.length;

    // Header: decimal dimension + star letter
    let sbn = `${dim}${starsToChar(stars)}`;

    // Region data: border bitfield packed into base-85
    sbn += encodeRegion85(regionGrid);

    // Annotations: 4-cell ternary packing (only if non-empty)
    const annotStr = playerGrid ? encodeAnnotations85(playerGrid) : '';
    if (annotStr) sbn += annotStr;

    // History: compound entries (only if non-empty)
    const histStr = markHistory ? serializeHistory2(markHistory, dim) : '';
    if (histStr) sbn += `~${histStr}`;

    return sbn;
}

/**
 * Decodes an SBN v2 string into a complete puzzle state object.
 *
 * @param {string} sbn - SBN v2 string.
 * @returns {{
 *   regionGrid: number[][],
 *   playerGrid: number[][],
 *   starsPerRegion: number,
 *   gridDim: number,
 *   history: {stack: object[], pointer: number}
 * }|null} Decoded puzzle state, or null if the string is invalid.
 *
 * @example
 *   const state = decodeSBN2("10BxYz...");
 *   // state.gridDim === 10
 *   // state.starsPerRegion === 2
 *   // state.regionGrid is a 10×10 array
 */
function decodeSBN2(sbn) {
    try {
        // ── Step 1: Split off optional history ──
        const tildePos = sbn.indexOf('~');
        const mainPart = tildePos >= 0 ? sbn.substring(0, tildePos) : sbn;
        const histPart = tildePos >= 0 ? sbn.substring(tildePos + 1) : '';

        // ── Step 2: Parse header (digits + letter) ──
        let i = 0;
        while (i < mainPart.length && mainPart[i] >= '0' && mainPart[i] <= '9') i++;
        if (i === 0 || i >= mainPart.length) return null;  // no digits or no letter

        const dim   = parseInt(mainPart.substring(0, i), 10);
        const stars = charToStars(mainPart[i]);
        i++;  // advance past star letter

        if (isNaN(dim) || dim < 2 || stars < 1 || stars > 26) return null;

        // ── Step 3: Read region data (deterministic length) ──
        const regionLen = regionCharsForDim(dim);
        if (i + regionLen > mainPart.length) return null;  // string too short

        const regionStr = mainPart.substring(i, i + regionLen);
        i += regionLen;

        // ── Step 4: Remaining characters = annotation data ──
        const annotStr = mainPart.substring(i);

        // ── Step 5: Decode all sections ──
        const regionGrid = decodeRegion85(regionStr, dim);
        const playerGrid = decodeAnnotations85(annotStr, dim);
        const history    = histPart
            ? deserializeHistory2(histPart, dim)
            : { stack: [], pointer: -1 };

        return { regionGrid, playerGrid, starsPerRegion: stars, gridDim: dim, history };

    } catch (e) {
        console.error('SBN v2 decode error:', e);
        return null;
    }
}


// --- BACKWARD-COMPATIBLE UNIVERSAL IMPORT ---

/**
 * Universal puzzle import that handles SBN v1, SBN v2, and CSV formats.
 *
 * @param {string} importString - Raw puzzle string from any source.
 * @returns {{
 *   regionGrid: number[][],
 *   playerGrid: number[][],
 *   starsPerRegion: number,
 *   gridDim: number,
 *   history: {stack: object[], pointer: number}
 * }|null} Decoded puzzle state, or null if format is unrecognized.
 */
function universalImportV2(importString) {
    const s = importString.trim();
    if (!s) return null;

    // ── SBN v2: starts with digit(s) then a letter ──
    if (/^\d+[A-Z]/.test(s)) {
        return decodeSBN2(s);
    }

    // ── SBN v1: starts with 2-letter dimension code ──
    if (s.length >= 4 &&
        typeof SBN_CODE_TO_DIM_MAP !== 'undefined' &&
        SBN_CODE_TO_DIM_MAP[s.substring(0, 2)]) {
        // Delegate to the existing v1 universalImport if available
        return typeof universalImport === 'function' ? universalImport(s) : null;
    }

    // ── CSV task string: digits and commas only ──
    if (/^\d+(,\d+)*$/.test(s) && typeof parseAndValidateGrid === 'function') {
        const { grid, dim } = parseAndValidateGrid(s);
        if (grid) {
            return {
                regionGrid: grid,
                playerGrid: Array.from({ length: dim }, () => new Array(dim).fill(0)),
                starsPerRegion: 1,
                gridDim: dim,
                history: { stack: [], pointer: -1 },
            };
        }
    }

    console.error('SBN v2: unrecognized puzzle format.');
    return null;
}


// --- DROP-IN REPLACEMENT ---

/**
 * Drop-in replacement for `encodeToSbn()`.
 * Signature matches the existing function in puzzle_handler.js.
 *
 * @param {number[][]} regionGrid  - N×N region grid.
 * @param {number}     stars       - Stars per region.
 * @param {number[][]} playerGrid  - N×N player grid.
 * @param {object}     markHistory - History object for marks.
 * @returns {string} SBN v2 encoded string.
 */
function encodeToSbnV2(regionGrid, stars, playerGrid, markHistory) {
    return encodeSBN2(regionGrid, stars, playerGrid, markHistory);
}


// --- SELF-TEST ---

(function selfTest() {
    /**
     * Assert helper — throws on failure for immediate, loud error reporting.
     */
    function assert(condition, message) {
        if (!condition) throw new Error(`SBN v2 SELF-TEST FAILURE: ${message}`);
    }

    // ── Alphabet integrity ──
    assert(SBN2_ALPHABET.length === 85,
        `Alphabet has ${SBN2_ALPHABET.length} chars, expected exactly 85`);
    assert(new Set(SBN2_ALPHABET).size === 85,
        'Alphabet contains duplicate characters');
    assert(SBN2_C2V['.'] === undefined,
        'Alphabet must not contain "." (section delimiter)');
    assert(SBN2_C2V['~'] === undefined,
        'Alphabet must not contain "~" (history delimiter)');
    assert(SBN2_C2V['>'] === undefined,
        'Alphabet must not contain ">" (history pointer marker)');

    // ── Star encoding ──
    assert(starsToChar(1) === 'A', 'starsToChar(1) should be A');
    assert(starsToChar(26) === 'Z', 'starsToChar(26) should be Z');
    assert(charToStars('A') === 1, 'charToStars(A) should be 1');
    assert(charToStars('F') === 6, 'charToStars(F) should be 6');

    // ── Bit packing round-trip ──
    const testBits = [1, 0, 1, 1, 0, 0, 1, 0, 1, 0, 1, 1, 1, 0, 0, 0, 1, 1, 0, 1];
    const packed = packBits85(testBits);
    const unpacked = unpackBits85(packed, testBits.length);
    assert(unpacked.length === testBits.length,
        `Bit-pack round-trip length: ${unpacked.length} vs ${testBits.length}`);
    for (let i = 0; i < testBits.length; i++) {
        assert(unpacked[i] === testBits[i], `Bit ${i}: got ${unpacked[i]}, expected ${testBits[i]}`);
    }

    // ── Region round-trip (3×3 grid) ──
    const testRegion = [[1, 1, 2], [1, 2, 2], [3, 3, 3]];
    const regionEncoded = encodeRegion85(testRegion);
    const regionDecoded = decodeRegion85(regionEncoded, 3);
    // Region IDs may differ but border structure must be identical
    for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 2; c++) {
            assert(
                (testRegion[r][c] === testRegion[r][c + 1]) ===
                (regionDecoded[r][c] === regionDecoded[r][c + 1]),
                `Vertical border mismatch at row ${r}, col ${c}`
            );
        }
    }
    for (let c = 0; c < 3; c++) {
        for (let r = 0; r < 2; r++) {
            assert(
                (testRegion[r][c] === testRegion[r + 1][c]) ===
                (regionDecoded[r][c] === regionDecoded[r + 1][c]),
                `Horizontal border mismatch at row ${r}, col ${c}`
            );
        }
    }

    // ── Annotation round-trip ──
    const testPlayer = [[0, 0, 2], [1, 0, 0], [0, 2, 1]];
    const annotEncoded = encodeAnnotations85(testPlayer);
    const annotDecoded = decodeAnnotations85(annotEncoded, 3);
    for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 3; c++) {
            assert(annotDecoded[r][c] === testPlayer[r][c],
                `Annotation mismatch at (${r},${c}): got ${annotDecoded[r][c]}, expected ${testPlayer[r][c]}`);
        }
    }

    // ── Compound history round-trip ──
    const testHistory = {
        stack: [
            { type: 'mark', r: 0, c: 1, from: 0, to: 2 },
            { type: 'compoundMark', changes: [
                { r: 1, c: 1, from: 0, to: 1 },
                { r: 0, c: 0, from: 0, to: 2 },
                { r: 0, c: 1, from: 0, to: 2 },
                { r: 1, c: 0, from: 0, to: 2 },
                { r: 1, c: 2, from: 0, to: 2 },
                { r: 2, c: 0, from: 0, to: 2 },
                { r: 2, c: 1, from: 0, to: 2 },
                { r: 2, c: 2, from: 0, to: 2 },
            ]},
        ],
        pointer: 1,
    };
    const histEncoded = serializeHistory2(testHistory, 3);
    const histDecoded = deserializeHistory2(histEncoded, 3);
    assert(histDecoded.stack.length === 2, `History should have 2 entries, got ${histDecoded.stack.length}`);
    assert(histDecoded.stack[0].type === 'mark', 'First entry should be simple mark');
    assert(histDecoded.stack[1].type === 'compoundMark', 'Second entry should be compoundMark');
    assert(histDecoded.stack[1].changes.length === 8, `Compound should have 8 changes, got ${histDecoded.stack[1].changes.length}`);
    assert(histDecoded.pointer === 1, `Pointer should be 1, got ${histDecoded.pointer}`);

    // ── Full SBN v2 round-trip ──
    const fullSbn = encodeSBN2(testRegion, 1, testPlayer, testHistory);
    assert(/^\d+[A-Z]/.test(fullSbn), `Should start with digits+letter, got "${fullSbn.substring(0, 5)}"`);
    const fullDecoded = decodeSBN2(fullSbn);
    assert(fullDecoded !== null, 'Full decode returned null');
    assert(fullDecoded.gridDim === 3, `Dim should be 3, got ${fullDecoded.gridDim}`);
    assert(fullDecoded.starsPerRegion === 1, `Stars should be 1, got ${fullDecoded.starsPerRegion}`);
    for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 3; c++) {
            assert(fullDecoded.playerGrid[r][c] === testPlayer[r][c],
                `Full round-trip player mismatch at (${r},${c})`);
        }
    }
    assert(fullDecoded.history.stack.length === 2, 'Full round-trip history should have 2 entries');
    assert(fullDecoded.history.stack[1].type === 'compoundMark', 'Compound preserved through full round-trip');

    // ── Size comparison ──
    const regionBits = borderBitCount(3);
    const v2Chars = regionCharsForDim(3);
    const v1Chars = Math.ceil(regionBits / 6);

    console.log(`✓ SBN v2 self-test passed (all assertions OK).`);
    console.log(`  Full round-trip: "${fullSbn}" (${fullSbn.length} chars)`);
    console.log(`  3×3 region data: ${v2Chars} v2-chars vs ${v1Chars} v1-chars (${regionBits} border bits)`);
})();
