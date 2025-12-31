/**
 * **********************************************************************************
 * Title: Star Battle UI Element References
 * **********************************************************************************
 * @author Isaiah Tadrous
 * @version 1.1.0
 * *-------------------------------------------------------------------------------
 * This script centralizes all DOM element references for the Star Battle web
 * application. It queries the document to obtain and store references to all
 * critical UI components—including screens, buttons, modals, input controls,
 * sliders, and canvases—into constants. This approach provides a single,
 * organized source for all UI manipulation tasks, improving the readability,
 * maintainability, and efficiency of the entire application's codebase by
 * avoiding repeated DOM queries.
 * **********************************************************************************
 */

// --- DOM ELEMENT REFERENCES ---

// Screen containers
const homeScreen = document.getElementById('home-screen'); // The main menu/welcome screen container.
const gameScreen = document.getElementById('game-screen'); // The screen container for the main puzzle gameplay.

// Toolbar and navigation elements
const backToHomeBtn = document.getElementById('back-to-home-btn'); // Button to return to the home screen.
const toolbarTabBtns = document.querySelectorAll('.toolbar-tab-btn'); // All buttons that switch between toolbar tabs.
const toolbarTabContents = document.querySelectorAll('.toolbar-tab-content'); // All content panels for the toolbar tabs.
const contextualControls = document.getElementById('contextual-controls'); // Wrapper for controls that change based on the active mode.

// Core game components
const highlightErrorsToggle = document.getElementById('highlight-errors-toggle'); // The checkbox input for the "Highlight Errors" setting.
const gridContainer = document.getElementById('grid-container'); // The main `div` element that holds the puzzle grid cells.
const solverStatus = document.getElementById('solver-status'); // The text element used to display status messages to the user.
const loadingSpinner = document.getElementById('loading-spinner'); // The element for the loading animation, shown during API calls.
const drawCanvas = document.getElementById('draw-canvas'); // The HTML canvas element used for drawing overlays.
const drawCtx = drawCanvas.getContext('2d'); // The 2D rendering context for the drawing canvas.

// Main action buttons
const newPuzzleBtn = document.getElementById('new-puzzle-btn'); // Button to fetch and start a new puzzle.
const savePuzzleBtn = document.getElementById('save-puzzle-btn'); // Button to save the current puzzle progress.
const loadPuzzleBtn = document.getElementById('load-puzzle-btn'); // Button to open the "Load Puzzle" modal.
const checkSolutionBtn = document.getElementById('check-solution-btn'); // Button to check if the current player solution is correct.
const findSolutionBtn = document.getElementById('find-solution-btn'); // Button to find or view the puzzle's solution.
const importBtn = document.getElementById('import-btn'); // Button to import a puzzle from a string.
const exportBtn = document.getElementById('export-btn'); // Button to export the current puzzle to a string.
const clearBtn = document.getElementById('clear-btn'); // Button to clear marks, drawings, or borders based on the active mode.
const toggleMarkBtn = document.getElementById('toggle-mark-btn'); // Button to switch between placing 'X' and 'dot' marks.
const undoBtn = document.getElementById('undo-btn'); // The undo button.
const redoBtn = document.getElementById('redo-btn'); // The redo button.

// Mode selection buttons
const markModeBtn = document.getElementById('mark-mode-btn'); // Button to switch to 'Mark' mode.
const drawModeBtn = document.getElementById('draw-mode-btn'); // Button to switch to 'Draw' mode.
const borderModeBtn = document.getElementById('border-mode-btn'); // Button to switch to 'Border' mode.

// Drawing tool controls
const brushSizeSlider = document.getElementById('brush-size-slider'); // The slider for adjusting the brush size.
const brushSizeValue = document.getElementById('brush-size-value'); // The text display for the current brush size.
const brushSizeWrapper = document.getElementById('brush-size-wrapper'); // The container for the brush size slider.
const colorPickerWrapper = document.getElementById('color-picker-wrapper'); // The container for all color selection UI.
const htmlColorPicker = document.getElementById('html-color-picker'); // The native HTML input[type=color] element.
const customColorBtn = document.getElementById('custom-color-btn'); // The button to trigger the color picker for a custom color.
const borderToolsWrapper = document.getElementById('border-tools-wrapper'); // The container for border-specific tools like the eraser.
const borderEraserBtn = document.getElementById('border-eraser-btn'); // The button to toggle border erasing.
const drawEraserBtn = document.getElementById('draw-eraser-btn');

// Settings modal elements
const settingsBtn = document.getElementById('settings-btn'); // Button to open the settings modal.
const settingsModal = document.getElementById('settings-modal'); // The main container for the settings modal.
const settingsModalCloseBtn = document.getElementById('settings-modal-close-btn'); // The close button within the settings modal.
const bwModeToggle = document.getElementById('bw-mode-toggle'); // Toggle switch for black & white region coloring.
const autoXAroundToggle = document.getElementById('auto-x-around-toggle'); // Toggle for auto-X'ing around stars.
const autoXMaxLinesToggle = document.getElementById('auto-x-max-lines-toggle'); // Toggle for auto-X'ing full rows/columns.
const autoXMaxRegionsToggle = document.getElementById('auto-x-max-regions-toggle'); // Toggle for auto-X'ing full regions.
const showTimerToggle = document.getElementById('show-timer-toggle'); // Toggle for showing the timer.

// Load/Save modal elements
const loadModal = document.getElementById('load-modal'); // The main container for the load puzzle modal.
const modalContent = document.getElementById('modal-content'); // The area within the modal where saved games are listed.
const modalCloseBtn = document.getElementById('modal-close-btn'); // The close button for the load puzzle modal.

// New puzzle selector elements
const openPuzzleSelectBtn = document.getElementById('open-puzzle-select-btn');
const puzzleSelectDisplay = document.getElementById('puzzle-select-display');
const puzzleSelectModal = document.getElementById('puzzle-select-modal');
const puzzleSelectModalCloseBtn = document.getElementById('puzzle-select-modal-close-btn');
const puzzleSizeGrid = document.getElementById('puzzle-size-grid');
const puzzleStarCountList = document.getElementById('puzzle-star-count-list');
const puzzleDifficultyList = document.getElementById('puzzle-difficulty-list');


// Responsive UI elements
const hamburgerMenuBtn = document.getElementById('hamburger-menu-btn'); // The hamburger menu button for mobile view.
const puzzleActionsTab = document.getElementById('puzzle-actions-tab'); // The slide-out panel containing puzzle actions on mobile.

// Success Modal Elements
const successModal = document.getElementById('success-modal');
const successModalCloseBtn = document.getElementById('success-modal-close-btn');
const shareSuccessBtn = document.getElementById('share-success-btn');
const timeTakenEl = document.getElementById('time-taken');
const gameTimer = document.getElementById('game-timer');
const puzzleDifficulty = document.getElementById('puzzle-difficulty');
const puzzleSizeInfo = document.getElementById('puzzle-size-info');
const playAnotherBtn = document.getElementById('play-another-btn');
const changeLevelBtn = document.getElementById('change-level-btn');
const goHomeBtn = document.getElementById('go-home-btn');
