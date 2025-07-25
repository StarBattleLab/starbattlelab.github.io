/**
 **********************************************************************************
 *
 * Star Battle Puzzle - Configuration and State
 *
 * @author Joseph Bryant
 * @refactored by Isaiah Tadrous
 * @version 1.4.4
 *
 * -------------------------------------------------------------------------------
 *
 * Description:
 * This file serves as the central configuration and state management hub for the
 * Star Battle puzzle application. It defines the main `state` object which
 * tracks all dynamic aspects of the application, from grid data and player
 * input to UI settings and interaction modes. It also declares essential
 * constants, including API endpoints, local storage keys, SVG icons, and
 * references to all key DOM elements used throughout the application.
 *
 **********************************************************************************
 */

// File: config.js
// This script defines the application's state and constants.

// --- STATE MANAGEMENT (Client-side) ---
/**
 * @typedef {Object} AppState
 * @property {number} gridDim - The dimension of the square puzzle grid (e.g., 5 for a 5x5 grid).
 * @property {number} starsPerRegion - The number of stars expected in each region, row, and column.
 * @property {number[][]} regionGrid - A 2D array representing the puzzle's regions, where each cell contains a region ID.
 * @property {number[][]} playerGrid - A 2D array representing the player's current marks on the grid (0: empty, 1: star, 2: secondary mark like 'X' or dot).
 * @property {Object} sourcePuzzleData - Original puzzle data from the server, used for validation and export.
 * @property {Object.<string, HistoryStack>} history - An object containing separate history stacks for different interaction modes (mark, draw, border).
 * @property {boolean} markIsX - A flag indicating whether secondary marks are rendered as 'X' (true) or 'Dot' (false).
 * @property {boolean} isLoading - A flag indicating if an asynchronous operation (e.g., API call) is in progress.
 * @property {number[][]|null} solution - The solved puzzle grid if a solution has been found, otherwise null.
 * @property {boolean} isViewingSolution - A flag to control the temporary display of the solution overlay.
 * @property {'mark'|'draw'|'border'} activeMode - The currently active interaction mode for the user.
 * @property {boolean} isLeftDown - A flag indicating if the left mouse button is currently pressed.
 * @property {boolean} isRightDown - A flag indicating if the right mouse button is currently pressed.
 * @property {boolean} isDragging - A flag to distinguish between a click and a drag gesture.
 * @property {Object|null} lastPos - Stores the last mouse position during a drag operation.
 * @property {Set<string>} currentBorderPath - A Set of string coordinates ('row,col') representing cells included in the border currently being drawn.
 * @property {Array<Object>} customBorders - An array of objects, each describing a custom border drawn by the user (includes `path` and `color`).
 * @property {string|null} colorToReplace - Stores a color that is intended to be replaced by a new custom color.
 * @property {number} currentColorIndex - The index of the currently selected color in the color picker (might be deprecated by `currentColor`).
 * @property {number} brushSize - The size of the brush for drawing operations.
 * @property {boolean} isBwMode - A flag to enable or disable black and white mode for grid regions.
 * @property {boolean} highlightErrors - A setting to enable or disable visual error highlighting on the grid.
 * @property {boolean} autoXAroundStars - A setting to automatically place 'X' marks around placed stars.
 * @property {boolean} autoXOnMaxLines - A setting to automatically place 'X' marks on rows/columns that reach their star capacity.
 * @property {boolean} autoXOnMaxRegions - A setting to automatically place 'X' marks on regions that reach their star capacity.
 * @property {HTMLCanvasElement} bufferCanvas - An off-screen canvas used as a buffer for free-form drawings to persist during redraws.
 * @property {CanvasRenderingContext2D|null} bufferCtx - The 2D rendering context for the buffer canvas.
 * @property {Array<Object>} puzzleDefs - An array of predefined puzzle sizes and star counts, mirroring backend configurations.
 */
const state = {
    gridDim: 0,
    starsPerRegion: 0,
    regionGrid: [],      // 2D array defining the puzzle regions
    playerGrid: [],      // 2D array for player's marks (0: empty, 1: star, 2: secondary)
    sourcePuzzleData: {},// Original data from server for hashing/export
    history: {           // Each mode has its own history stack
        mark: { stack: [], pointer: -1 },
        draw: { stack: [], pointer: -1 },
        border: { stack: [], pointer: -1 },
    },
    markIsX: true,       // true for 'X', false for 'Dot'
    isLoading: true,
    solution: null,      // Holds the puzzle solution grid
    isViewingSolution: false, // Flag for press-and-hold view
    activeMode: 'mark',  // can be 'mark', 'draw', or 'border'
    isLeftDown: false,
    isRightDown: false,
    isDragging: false,   // Flag to distinguish a click from a drag
    lastPos: null,
    currentBorderPath: new Set(), // Temporarily stores cells for the current border being drawn.
    customBorders: [],   // Stores completed custom border paths and their colors.
    colorToReplace: null, // Used in the color picker to determine which custom color slot to overwrite.
    currentColorIndex: 0, // Current index selected in the color picker.
    brushSize: 5,        // Size of the brush for drawing and erasing.
    isBwMode: false,     // Toggles black and white rendering for puzzle regions.
    highlightErrors: true, // Enables/disables visual cues for rule violations.
    autoXAroundStars: false, // Setting for automatically placing 'X' marks around stars.
    autoXOnMaxLines: false, // Setting for automatically placing 'X' marks in full rows/columns.
    autoXOnMaxRegions: false, // Setting for automatically placing 'X' marks in full regions.
    bufferCanvas: document.createElement('canvas'), // Off-screen canvas for preserving free-form drawings.
    bufferCtx: null,          // 2D rendering context for the buffer canvas.
    puzzleDefs: [ // Matches backend `constants.py` for the dropdown
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

const API_BASE_URL = 'http://127.0.0.1:5001/api';
/**
 * @constant {string} API_BASE_URL - The base URL for the Star Battle puzzle API.
 * This can be switched between a locally hosted API (commented out) or a deployed version.
 */
//const API_BASE_URL = 'https://StarBattle.pythonanywhere.com/api';
/**
 * @constant {string} LOCAL_STORAGE_KEY - The key used to store saved puzzle data in the browser's local storage.
 */
const LOCAL_STORAGE_KEY = 'starBattleSaves';


// --- ADDED: SBN AND PUZZLE CONSTANTS (from constants.py) ---
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



// --- DOM ELEMENT REFERENCES ---
// These constants hold references to key DOM elements, allowing efficient access throughout the script.
// They are assigned values once the DOM is fully loaded in main.js.
const highlightErrorsToggle = document.getElementById('highlight-errors-toggle');
const gridContainer = document.getElementById('grid-container');
const sizeSelect = document.getElementById('size-select');
const solverStatus = document.getElementById('solver-status');
const newPuzzleBtn = document.getElementById('new-puzzle-btn');
const savePuzzleBtn = document.getElementById('save-puzzle-btn');
const loadPuzzleBtn = document.getElementById('load-puzzle-btn');
const checkSolutionBtn = document.getElementById('check-solution-btn');
const findSolutionBtn = document.getElementById('find-solution-btn');
const importBtn = document.getElementById('import-btn');
const exportBtn = document.getElementById('export-btn');
const clearBtn = document.getElementById('clear-btn');
const toggleMarkBtn = document.getElementById('toggle-mark-btn');
const undoBtn = document.getElementById('undo-btn');
const redoBtn = document.getElementById('redo-btn');
const loadingSpinner = document.getElementById('loading-spinner');
const markModeBtn = document.getElementById('mark-mode-btn');
const drawModeBtn = document.getElementById('draw-mode-btn');
const borderModeBtn = document.getElementById('border-mode-btn');
const drawCanvas = document.getElementById('draw-canvas');
/** @type {CanvasRenderingContext2D} */
const drawCtx = drawCanvas.getContext('2d'); // 2D rendering context for the main drawing canvas.
const brushSizeSlider = document.getElementById('brush-size-slider');
const brushSizeValue = document.getElementById('brush-size-value');

const settingsBtn = document.getElementById('settings-btn');
const settingsModal = document.getElementById('settings-modal');
const settingsModalCloseBtn = document.getElementById('settings-modal-close-btn');
const bwModeToggle = document.getElementById('bw-mode-toggle');
const autoXAroundToggle = document.getElementById('auto-x-around-toggle');
const autoXMaxLinesToggle = document.getElementById('auto-x-max-lines-toggle');
const autoXMaxRegionsToggle = document.getElementById('auto-x-max-regions-toggle');

// --- Modal Elements ---
const loadModal = document.getElementById('load-modal');
const modalContent = document.getElementById('modal-content');
const modalCloseBtn = document.getElementById('modal-close-btn');

// --- Color Picker Elements ---
const presetColorsContainer = document.getElementById('preset-colors');
const customColorsContainer = document.getElementById('custom-colors');
const htmlColorPicker = document.getElementById('html-color-picker'); // Hidden HTML color input for native color selection.
const customColorBtn = document.getElementById('custom-color-btn');

// --- SVG ICONS for marks ---
/** @constant {string} STAR_SVG - SVG markup for a star icon. */
const STAR_SVG = `<svg class="w-full h-full p-1 star-svg" viewBox="0 0 24 24" fill="currentColor"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg>`;
/** @constant {string} DOT_SVG - SVG markup for a dot icon. */
const DOT_SVG = `<svg class="w-full h-full p-[30%] dot-svg" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="10"/></svg>`;
/** @constant {string} X_SVG - SVG markup for an 'X' icon. */
const X_SVG = `<svg class="w-full h-full p-[20%] x-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>`;

// --- Color State Initialization ---
/** @constant {string[]} PRESET_COLORS - An array of predefined color values for the color picker. */
const PRESET_COLORS = ['#3B82F6', '#ad5cf0', '#EF4444', '#ffa82e', '#000000'];
/**
 * @property {Array<string|null>} state.customColors - An array to store user-defined custom colors.
 * Initialized with nulls to represent empty slots.
 */
state.customColors = Array(5).fill(null);
/**
 * @property {string} state.currentColor - The currently selected color for drawing or borders.
 * Initialized to the first preset color.
 */
state.currentColor = PRESET_COLORS[0];

// --- State for Undo/Redo ---
/**
 * @global {ImageData|Array<Object>|null} preActionState - A temporary variable to store the state of the canvas or custom borders
 * before an action begins, used for undo/redo functionality. It can hold `ImageData` for drawing
 * operations or a deep copy of the `customBorders` array.
 */
let preActionState = null; // Used to store state before an action begins
