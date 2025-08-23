/**
 * **********************************************************************************
 * Title: Star Battle Puzzle Game State and Configuration
 * **********************************************************************************
 * @author Isaiah Tadrous
 * @version 1.0.4
 * *-------------------------------------------------------------------------------
 * This script initializes and manages the entire state for a Star Battle puzzle
 * web application. It defines the central `state` object, which holds all dynamic
 * data, including puzzle grid dimensions, region layouts, player inputs, and
 * undo/redo history. The script also declares constants for API communication,
 * local storage, and SVG icons used for rendering game pieces. Additionally, it
 * configures initial settings for user-configurable features like color palettes,
 * brush sizes, and automated gameplay assistance.
 * **********************************************************************************
 */

// --- STATE MANAGEMENT, CONSTANTS, AND ASSETS ---

/**
 * @description Main state object to hold all dynamic application data.
 * This central object tracks everything from the core puzzle data (grids, solution)
 * to UI state (loading flags, active modes), user interactions (mouse/touch state),
 * and various feature settings (colors, auto-helpers).
 */
const state = {
    // --- Core Puzzle State ---
    gridDim: 0, // The dimension of the square grid (e.g., 10 for a 10x10 grid).
    starsPerRegion: 0, // The number of stars to be placed in each region.
    regionGrid: [], // A 2D array defining the shape of each region.
    playerGrid: [], // A 2D array storing the player's moves (stars, dots, 'x's).
    sourcePuzzleData: {}, // Holds the original, unmodified puzzle data from the API.

    // --- History for Undo/Redo ---
    history: {
        mark: { stack: [], pointer: -1 }, // History for placing stars, dots, and 'x's.
        draw: { stack: [], pointer: -1 }, // History for the drawing/coloring mode.
        border: { stack: [], pointer: -1 } // History for custom-drawn region borders.
    },

    // --- Gameplay State & Modes ---
    markIsX: true, // Toggles the primary marking tool between an 'X' and a dot.
    isLoading: true, // Flag to show a loading indicator while fetching puzzles.
    solution: null, // Stores the solved puzzle data when fetched.
    isViewingSolution: false, // Flag to indicate if the solution is currently displayed.
    activeMode: 'mark', // The current interaction mode ('mark', 'draw', 'border').

    // --- User Interaction State (Mouse & Touch) ---
    isLeftDown: false, // Tracks if the left mouse button is currently pressed.
    isDragging: false, // Tracks if a drag operation is in progress.
    lastPos: null, // Stores the last known position (row, col) during a drag.
    currentDragChanges: [], // Batches cell changes from a single drag for a single undo action.
    activeTouchId: null, // Tracks the unique identifier of the active touch point to prevent multi-touch conflicts.
    animationFrameId: null, // Stores the ID for `requestAnimationFrame` to optimize drag-based drawing.

    // --- Drawing & Border Tool State ---
    currentBorderPath: new Set(), // A set of cell coordinates for the border being drawn.
    customBorders: [], // Stores completed, custom-drawn border paths.
    colorToReplace: null, // The color to be replaced by the flood fill tool.
    currentColorIndex: 0, // The index of the currently selected color in the palette.
    brushSize: 5, // The size of the brush for the drawing mode.

    // --- User Settings & Helpers ---
    isBwMode: true, // Toggles between black & white and color drawing modes.
    highlightErrors: true, // Toggles the highlighting of rule violations.
    autoXAroundStars: false, // Automatically places 'X's in cells adjacent to a placed star.
    autoXOnMaxLines: false, // Automatically places 'X's in a row/column once the star limit is reached.
    autoXOnMaxRegions: false, // Automatically places 'X's in a region once the star limit is reached.

    // --- Rendering & Performance ---
    bufferCanvas: document.createElement('canvas'), // An off-screen canvas for pre-rendering or buffering.
    bufferCtx: null, // The 2D rendering context for the buffer canvas.

    // --- Puzzle Definitions ---
    puzzleDefs: [ // A list of available puzzles with their properties.
        { text: "5x5 (1-star, Easy)", dim: 5, stars: 1 },
        { text: "6x6 (1-star, Easy)", dim: 6, stars: 1 },
        { text: "6x6 (1-star, Medium)", dim: 6, stars: 1 },
        { text: "8x8 (1-star, Medium)", dim: 8, stars: 1 },
        { text: "8x8 (1-star, Hard)", dim: 8, stars: 1 },
		{ text: "10x10 (2-star, Easy)", dim: 10, stars: 2 },
        { text: "10x10 (2-star, Medium)", dim: 10, stars: 2 },
        { text: "10x10 (2-star, Hard)", dim: 10, stars: 2 },
        { text: "14x14 (3-star, Medium)", dim: 14, stars: 3 },
        { text: "14x14 (3-star, Hard)", dim: 14, stars: 3 },
        { text: "17x17 (4-star, Hard)", dim: 17, stars: 4 },
        { text: "21x21 (5-star, Hard)", dim: 21, stars: 5 },
        { text: "25x25 (6-star, Hard)", dim: 25, stars: 6 },
    ]
};

// --- API & STORAGE CONSTANTS ---

/**
 * @description Key used for saving and retrieving game progress from the browser's Local Storage.
 */
const LOCAL_STORAGE_KEY = 'starBattleSaves';
/**
 * @description Key used for saving and retrieving app settings from the browser's Local Storage.
 */
const APP_SETTINGS_KEY = 'starBattleSettings';

// --- SVG ICONS ---

/**
 * @description SVG string for the star icon.
 */
const STAR_SVG = `<svg class="w-full h-full p-1 star-svg" viewBox="0 0 24 24" fill="currentColor"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg>`;

/**
 * @description SVG string for the dot icon, used as an alternative to the 'X' mark.
 */
const DOT_SVG = `<svg class="w-full h-full p-[30%] dot-svg" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="10"/></svg>`;

/**
 * @description SVG string for the 'X' icon, used to mark empty cells.
 */
const X_SVG = `<svg class="w-full h-full p-[20%] x-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>`;

// --- COLOR STATE ---

/**
 * @description A default set of preset colors for the drawing mode.
 */
const PRESET_COLORS = ['#EF4444', '#22C55E', '#3B82F6'];

/**
 * @description An array to store user-defined custom colors. Initially holds one empty slot.
 */
state.customColors = Array(1).fill(null);

/**
 * @description The currently active color for drawing, initialized to the first preset color.
 */
state.currentColor = PRESET_COLORS[0];

/**
 * @description A temporary variable to hold the grid's state before a flood fill action.
 * This is used to calculate the changes for the undo/redo stack.
 */
let preActionState = null;


// --- ADDED: SBN AND PUZZLE CONSTANTS ---
const PUZZLES_JSON_PATH = 'puzzles.json';
const STATE_EMPTY = 0;
const STATE_STAR = 1;
const STATE_SECONDARY_MARK = 2;
const SBN_B64_ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-_';
const SBN_CHAR_TO_INT = Object.fromEntries(Array.from(SBN_B64_ALPHABET).map((c, i) => [c, i]));
const SBN_INT_TO_CHAR = Object.fromEntries(Array.from(SBN_B64_ALPHABET).map((c, i) => [i, c]));
const SBN_CODE_TO_DIM_MAP = {
    '44': 4,  '55': 5,  '66': 6,  '77': 7,  '88': 8,  '99': 9, 'AA': 10, 'BB': 11, 'CC': 12, 'DD': 13,
    'EE': 14, 'FF': 15, 'GG': 16, 'HH': 17, 'II': 18, 'JJ': 19, 'KK': 20, 'LL': 21, 'MM': 22,
    'NN': 23, 'OO': 24, 'PP': 25
};
const DIM_TO_SBN_CODE_MAP = Object.fromEntries(Object.entries(SBN_CODE_TO_DIM_MAP).map(([k, v]) => [v, k]));
