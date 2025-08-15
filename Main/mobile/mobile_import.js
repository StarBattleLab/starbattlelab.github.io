/**
 * @file mobile_import.js
 * @version 1.0.0
 * @description Provides the user interface and logic for importing Star Battle puzzles. Supports manual drawing, photo import (SnapGrid), and string-based input.
 * @date August 13, 2025
 */

/**
 * Sets up the entire user interface for importing puzzles.
 * This function is the entry point for creating the importer's HTML, CSS, and event listeners.
 * @param {Object} config - Configuration object.
 * @param {Function} config.importPuzzleString - A function passed from the parent scope to load a puzzle from a string.
 * @param {Function} config.setStatus - A function passed from the parent scope to display status messages to the user.
 */
function setupImportInterface({ importPuzzleString: importPuzzleString, setStatus: setStatus }) {
    // Prevent re-initialization if the interface already exists in the DOM.
    if (document.getElementById("importerContainer")) {
        return;
    }

    /**
     * @constant {Set<string>} loadedScripts
     * @description A set to store the URLs of scripts that have already been loaded, preventing redundant fetching.
     */
    const loadedScripts = new Set;

    /**
     * Dynamically loads an array of external scripts in a promise-based manner.
     * Ensures scripts are not loaded more than once and maintains their execution order.
     * @param {string[]} sources - An array of script URLs to load.
     * @returns {Promise<void[]>} A promise that resolves when all scripts have been successfully loaded.
     */
    const loadScripts = sources => Promise.all(sources.map(src => new Promise((resolve, reject) => {
        // If the script is already loaded, resolve immediately.
        if (loadedScripts.has(src)) {
            return resolve();
        }

        const script = document.createElement("script");
        script.src = src;
        // Setting async to false helps ensure scripts are executed in the order they are appended.
        script.async = false; 
        script.onload = () => {
            loadedScripts.add(src); // Mark script as loaded on success.
            resolve();
        };
        script.onerror = () => reject(new Error(`Failed to load script: ${src}`));
        document.head.appendChild(script);
    })));

    /**
     * Displays a custom, non-blocking alert modal on the screen.
     * Replaces the default browser `alert()` with a styled, dismissible dialog.
     * @param {string} message - The message to display in the alert box.
     */
    function customAlert(message) {
        // Remove any existing custom alert to prevent duplicates.
        const existingAlert = document.getElementById("customAlertBox");
        if (existingAlert) {
            existingAlert.remove();
        }

        // Create the main container for the alert.
        const alertBox = document.createElement("div");
        alertBox.id = "customAlertBox";
        alertBox.style.cssText = `
			position: fixed; 
			top: 1.25rem; 
			left: 50%; 
			transform: translateX(-50%); 
			background-color: #1f2937; 
			color: #f9fafb; 
			border: 1px solid #4b5563; 
			border-radius: 0.5rem; 
			padding: 1rem; 
			z-index: 5000; 
			display: flex; 
			align-items: center; 
			gap: 1rem; 
			transition: opacity 0.3s ease-in-out;
		`;
        alertBox.innerHTML = `<span>${message}</span>`;

        // Create the "OK" button to dismiss the alert.
        const okButton = document.createElement("button");
        okButton.textContent = "OK";
        okButton.style.cssText = `
			background-color: #4f46e5; 
			color: white; 
			padding: 0.25rem 0.75rem; 
			border-radius: 0.375rem; 
			font-size: 0.875rem; 
			border: none; 
			cursor: pointer;
		`;
        
        // Defines the function to close and remove the alert with a fade-out effect.
        const closeAlert = () => {
            alertBox.style.opacity = "0";
            // Wait for the transition to finish before removing the element from the DOM.
            setTimeout(() => {
                if (alertBox.parentNode) {
                    alertBox.parentNode.removeChild(alertBox);
                }
            }, 300);
        };
        okButton.onclick = closeAlert;

        alertBox.appendChild(okButton);
        document.body.appendChild(alertBox);

        // Use a brief timeout to trigger the CSS fade-in transition after the element is rendered.
        setTimeout(() => {
            alertBox.style.opacity = "1";
        }, 10);
		
		// Automatically close the alert after 2.7 seconds
		setTimeout(closeAlert, 2700);
    }
  
  
// all CSS styles, with a reset rule at the top for complete isolation.
const customCss = `
    #importerContainer, #customAlertBox {
      -webkit-user-select: none; /* Safari */
      -ms-user-select: none;     /* IE 10+ and Edge */
      user-select: none;         /* Standard */
    }
    #importerContainer input,
    #importerContainer textarea,
    #importerContainer a {
      -webkit-user-select: text;
      -ms-user-select: text;
      user-select: text;
    }
    .sbi-grid-container {
      display: grid;
      border: 2px solid #4b5563;
      transition: border-color 0.3s ease;
      touch-action: none;
      width: min(90vw, 90vh); /* Make grid responsive */
      aspect-ratio: 1 / 1;
    }
    .sbi-grid-cell {
      /* width and height will be set by the grid container columns/rows */
      border: 1px solid #374151;
      cursor: pointer;
      user-select: none;
      transition: background-color 0.2s ease-in-out;
    }
    .sbi-modal {
      transition: opacity 0.25s ease;
      opacity: 0;
      pointer-events: none;
    }
    .sbi-modal-active {
      opacity: 1;
      pointer-events: auto;
    }
    .sbi-cell-invalid {
      box-shadow: inset 0 0 0 3px #f87171 !important;
    }
    .sbi-tool-btn.sbi-active {
      background-color: #2563eb;
      border-color: #2563eb;
      color: #ffffff;
    }
    #eraserBtn.sbi-active {
      background-color: #ef4444;
      border-color: #ef4444;
    }
    .sbi-grid-container.sbi-eraser-active {
      border-color: #ef4444;
    }
    .sbi-save-btn-enabled {
      background-color: #16a34a;
      cursor: pointer;
    }
    .sbi-save-btn-enabled:hover {
      background-color: #15803d;
    }
    .sbi-save-btn-disabled {
      background-color: #4b5563;
      color: #9ca3af;
      cursor: not-allowed;
    }
    .sbi-error-modal {
      position: fixed;
      inset: 0;
      background-color: rgba(0, 0, 0, 0.7);
      display: none;
      align-items: center;
      justify-content: center;
      z-index: 200;
    }
    .sbi-tool-btn {
      border: 1px solid #4b5563;
      background-color: #374151;
      padding: 0.5rem;
      border-radius: 0.375rem;
      color: #d1d5db;
      transition: background-color 0.2s, color 0.2s;
    }
    #eraserBtn.sbi-active {
      background-color: #ef4444;
      border-color: #ef4444;
      color: #ffffff;
    }

    /* --- ADDED: Media Query for Mobile Optimization --- */
    @media (max-width: 768px) {
      #sbi-main-content, #uploadModal > div, #photoModal > div, #errorModal > div {
        width: 95% !important; /* Use more screen width on mobile */
        padding: 1.2rem !important;
        max-height: 95vh;
        overflow-y: auto;
      }
      h1, h2 {
        font-size: 1.5rem !important; /* Reduce heading sizes */
      }
      #puzzleStringInput {
        font-size: 1rem !important; /* Adjust text area font size */
      }
      #manualImportBtn, #photoImportBtn {
         padding: 0.39rem !important; /* Make buttons easier to tap */
         font-size: 1rem;
      }
      .sbi-grid-cell {
        /* Cell size will be determined by JS, but this can be a fallback */
      }
    }
`;



// Application HTML.
    const appHtml = `
	
		<div id="importerContainer" style="position: fixed; inset: 0; background-color: rgba(0, 0, 0, 0.7); display: none; align-items: center; justify-content: center; z-index: 100;">
			<div id="sbi-main-content" style="width: 51%; background-color: #1f2937; padding: 2rem; border-radius: 0.5rem; box-shadow: 0 10px 15px rgba(0,0,0,0.5); position: relative; border: 1px solid #374151;">
				<button id="closeImporterBtn" style="position: absolute; top: 0.5rem; right: 1rem; color: #9ca3af; font-size: 2.25rem; font-weight: bold; background: none; border: none; cursor: pointer; box-shadow: none !important;">&times;</button>
				<h1 style="font-size: 2.2rem; font-weight: bold; color: white; margin-bottom: 1.5rem; text-align: center;">Star Battle Importer</h1>
				<div style="margin-bottom: 1.5rem;">
					<label for="puzzleStringInput" style="display: block; font-size: 1rem; font-weight: 500; color: #9ca3af; margin-bottom: 0.5rem;">Paste your puzzle string (SBN or Web Task format):</label>
					<div>
						<textarea id="puzzleStringInput"
							style="display: block; height: 2.8rem; line-height: 2.8rem; padding: 0 1rem; overflow: hidden; resize: none; border-radius: 0.375rem; background-color: #374151; color: white; box-shadow: 0 1px 2px rgba(0,0,0,0.05); width: 100%; text-align: left; white-space: nowrap; font-size: 1.125rem;"
							placeholder="e.g. SBN: AA2e3Lg...~h:0112:1"></textarea>
						<div style="display: flex; flex-direction: column; align-items: center; padding-top: 0.5rem; margin-bottom: -1.5rem;">
							<button id="submitStringBtn"
								style="background-color: #4f46e5; color: white; padding: 0.4rem 1.8rem; border-radius: 1.7rem; transition: background-color 0.2s;">
								OK
							</button>
						</div>
					</div>
				</div>
				<div style="position: relative; margin: 1.5rem 0;">
					<div style="position: absolute; inset: 0; display: flex; align-items: center;" aria-hidden="true">
						<div style="width: 100%; border-top: 1px solid #4b5563;"></div>
					</div>
					<div style="position: relative; display: flex; justify-content: center;">
						<span style="background-color: #1f2937; padding: 0 0.5rem; font-size: 0.875rem; color: #9ca3af;">Or</span>
					</div>
				</div>
				<div style="display: flex; gap: 1rem;">
					<button id="manualImportBtn" style="width: 100%; background-color: #2563eb; color: white; padding: 0.75rem 1rem; border-radius: 0.375rem; transition: background-color 0.2s; border: none;">Manual Import</button>
					<button id="photoImportBtn" style="width: 100%; background-color: #4b5563; color: white; padding: 0.75rem 1rem; border-radius: 0.375rem; transition: background-color 0.2s; border: none;">Import Photo</button>
				</div>
			</div>
			<!-- Photo Import Modal -->
			<div id="photoModal" class="sbi-modal" style="position: fixed; inset: 0; background-color: rgba(0, 0, 0, 0.5); display: flex; align-items: center; justify-content: center; padding: 1rem;">
				<div style="background-color: #1f2937; padding: 2rem; border-radius: 0.5rem; box-shadow: 0 10px 25px rgba(0,0,0,0.6); width: 100%; max-width: 500px; border: 1px solid #374151;">
					<h2 style="font-size: 1.5rem; font-weight: bold; color: white; margin-bottom: 1.5rem; text-align: center;">Import Photo</h2>
					<div style="margin-bottom: 2rem;">
						<button id="loadImageBtn" style="width: 100%; background-color: #4f46e5; color: white; padding: 0.75rem 1rem; border-radius: 2rem; transition: background-color 0.2s; border: none; margin-bottom: 1rem;">Load Image</button>
						<input type="file" id="photoFileInput" accept="image/*" style="display: none;" />
						<div style="display: flex; align-items: center; gap: 0.5rem; margin-top: 1rem;">
							<input type="checkbox" id="enableAnnotationsCheckbox" style="width: 1rem; height: 1rem;" />
							<label for="enableAnnotationsCheckbox" style="font-size: 0.875rem; color: #9ca3af;">Enable notations (experimental - may be inaccurate)</label>
						</div>
					</div>
					<div id="selectedImageInfo" style="display: none; margin-bottom: 1rem; padding: 0.75rem; background-color: #374151; border-radius: 0.375rem; color: #9ca3af; font-size: 0.875rem;">No image selected</div>
					<div style="display: flex; justify-content: flex-end; gap: 0.75rem;">
						<button id="photoCancelBtn" style="background-color: #4b5563; color: #e5e7eb; padding: 0.5rem 1rem; border-radius: 0.375rem; transition: background-color 0.2s; border: none;">Cancel</button>
						<button id="snapGridBtn" style="background-color: #16a34a; color: white; padding: 0.5rem 1.5rem; border-radius: 0.375rem; transition: background-color 0.2s; border: none;" disabled>SnapGrid</button>
					</div>
				</div>
				<div id="photoLoader" style="position: absolute; inset: 0; background-color: rgba(31, 41, 55, 0.8); display: none; align-items: center; justify-content: center; border-radius: 0.5rem;">
					<svg class="animate-spin h-10 w-10 text-white" fill="none" viewBox="0 0 24 24">
						<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
						<path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
					</svg>
				</div>
			</div>
			<!-- Error Modal -->
			<div id="errorModal" class="sbi-error-modal">
				<div style="background-color: #1f2937; padding: 2rem; border-radius: 0.5rem; box-shadow: 0 10px 25px rgba(0,0,0,0.6); width: 100%; max-width: 500px; border: 1px solid #374151; margin: 1rem;">
					<h2 style="font-size: 1.75rem; font-weight: bold; color: white; margin-bottom: 1.5rem; text-align: center;">Uh-oh! No Valid Puzzle Detected.</h2>
					<p style="color: #d1d5db; margin-bottom: 1rem; text-align: center;">This feature is still under active development, and we're doing our best to improve it. If you believe this is an error, we would greatly appreciate if you could submit a bug report at the link below:</p>
					<p style="color: #d1d5db; margin-bottom: 1.5rem; text-align: center;">
						<a href="https://starbattlelab.github.io/Extensions/discord.html?page=bug-report" target="_blank" style="color: #60a5fa; text-decoration: underline;">Submit a Bug Report</a>
					</p>
					<p style="color: #d1d5db; margin-bottom: 1.5rem; text-align: center;">Your detailed feedback is invaluable in helping us resolve these edge cases. Thank you for your help and support.</p>
					<p style="color: #9ca3af; font-size: 0.875rem; text-align: center; margin-bottom: 2rem;"> If curious to investigate the issue yourself, you can run your image through our <a href="https://starbattlelab.github.io/Main/SnapGridScripts/debuger.html" target="_blank" style="color: #60a5fa; text-decoration: underline;">Debugger</a> to trace the source of the problem. </p>
					<div style="display: flex; justify-content: center;">
						<button id="errorModalOkBtn" style="background-color: #4f46e5; color: white; padding: 0.75rem 2rem; border-radius: 0.375rem; transition: background-color 0.2s; border: none;">Close</button>
					</div>
				</div>
			</div>
			<div id="uploadModal" class="sbi-modal" style="position: fixed; inset: 0; background-color: rgba(0, 0, 0, 0.5); display: flex; align-items: center; justify-content: center; padding: 1rem;">
				<div style="background-color: #1f2937; padding: 2rem; border-radius: 0.5rem; box-shadow: 0 10px 25px rgba(0,0,0,0.6); width: 100%; max-width: 768px; max-height: 100vh; overflow-y: auto; border: 1px solid #374151;">
					<div id="modalStep1">
						<h2 style="font-size: 1.5rem; font-weight: bold; color: white; margin-bottom: 1rem;">Puzzle Configuration</h2>
						<div style="display: grid; grid-template-columns: 1fr; gap: 1rem; margin-bottom: 1.5rem;">
							<div>
								<label for="modalGridSize" style="display: block; font-size: 0.875rem; font-weight: 500; color: #9ca3af;">Region/Grid Size (N x N)</label>
								<input type="number" id="modalGridSize" value="8" min="2" max="15" style="margin-top: 0.25rem; display: block; width: 100%; border-radius: 0.375rem; background-color: #374151; border: 1px solid #4b5563; color: white; box-shadow: 0 1px 2px rgba(0,0,0,0.05); font-size: 0.875rem; padding: 0.5rem;" />
							</div>
							<div>
								<label for="modalStars" style="display: block; font-size: 0.875rem; font-weight: 500; color: #9ca3af;">Stars per Region</label>
								<input type="number" id="modalStars" value="1" min="1" max="5" style="margin-top: 0.25rem; display: block; width: 100%; border-radius: 0.375rem; background-color: #374151; border: 1px solid #4b5563; color: white; box-shadow: 0 1px 2px rgba(0,0,0,0.05); font-size: 0.875rem; padding: 0.5rem;" />
							</div>
						</div>
						<div style="display: flex; justify-content: flex-end; gap: 0.75rem;">
							<button id="modalCancelBtn" style="background-color: #4b5563; color: #e5e7eb; padding: 0.5rem 1rem; border-radius: 0.375rem; transition: background-color 0.2s; border: none;">Cancel</button>
							<button id="modalContinueBtn" style="background-color: #4f46e5; color: white; padding: 0.5rem 1rem; border-radius: 0.375rem; transition: background-color 0.2s; border: none;">Continue</button>
						</div>
					</div>
					<div id="modalStep2" class="hidden">
						<h2 style="font-size: 1.5rem; font-weight: bold; color: white; margin-bottom: 0.5rem;">Draw Regions</h2>
						<p id="regionCounter" style="font-size: 0.875rem; color: #9ca3af; margin-bottom: 0.5rem;">Regions: 0 / 8</p>
						<div style="display: flex; justify-content: flex-end; margin-bottom: 1rem; border-bottom: 1px solid #374151; padding-bottom: 1rem;">
							<button id="eraserBtn" title="Eraser Tool" class="sbi-tool-btn">
								<svg viewBox="0 0 299.289 299.289" style="width: 1.5rem; height: 1.5rem;" fill="currentColor">
									<path d="M290.422,79.244L220.034,8.857c-11.794-11.795-30.986-11.795-42.78,0C175.866,10.245,12.971,173.14,8.867,177.244 c-11.822,11.821-11.824,30.957,0,42.78l70.388,70.388c11.821,11.822,30.957,11.824,42.78,0 c1.046-1.046,165.357-165.357,168.388-168.388C302.244,110.203,302.246,91.066,290.422,79.244z M110.367,278.744 c-5.374,5.373-14.071,5.373-19.446,0l-70.388-70.388c-5.373-5.374-5.375-14.071,0-19.446l34.61-34.61l89.834,89.834 L110.367,278.744z M278.755,110.357l-122.111,122.11l-89.833-89.833l122.11-122.111c5.374-5.374,14.071-5.374,19.446,0 l70.388,70.388C284.129,96.285,284.129,104.983,278.755,110.357z" />
								</svg>
							</button>
						</div>
						<div id="modalErrorContainer" class="hidden" style="background-color: rgba(185, 28, 28, 0.5); border: 1px solid #ef4444; color: #fca5a5; padding: 0.75rem 1rem; border-radius: 0.375rem; margin-bottom: 1rem; font-size: 0.875rem;"></div>
						<div style="display: flex; justify-content: center; margin-bottom: 1.5rem;">
							<div id="modalGridContainer" class="sbi-grid-container"></div>
						</div>
						<div style="display: flex; justify-content: flex-end; align-items: center; gap: 0.75rem;">
							<button id="modalBackBtn" style="background-color: #4b5563; color: #e5e7eb; padding: 0.5rem 1rem; border-radius: 0.375rem; transition: background-color 0.2s; border: none;">Back</button>
							<button id="modalSaveBtn" class="sbi-save-btn-disabled" style="color: white; padding: 0.5rem 1.5rem; border-radius: 0.375rem; transition: background-color 0.2s; border: none;" disabled>Save</button>
						</div>
					</div>
				</div>
			</div>

`;



	// Injects the necessary CSS stylesheet and HTML structure into the document.
	const styleSheet = document.createElement("style");
	styleSheet.innerText = customCss;
	document.head.appendChild(styleSheet);
	document.body.insertAdjacentHTML("beforeend", appHtml);

	/**
	 * @namespace GridManager
	 * @description Manages the state and interactions for the puzzle creation grid.
	 * This includes initializing the grid, handling user drawing input (painting/erasing),
	 * validating region properties, and managing region data.
	 */
	const GridManager = {
		// The size (N) of the N x N grid.
		gridSize: 0,
		// A 2D array representing the grid, storing region IDs for each cell.
		regions: [],
		// A boolean flag indicating if the user is currently drawing on the grid.
		isPainting: false,
		// The ID of the region currently being drawn or erased.
		activeRegionId: null,
		// The next available ID to be assigned to a new region.
		nextRegionId: 1,
		// The current number of distinct regions on the grid.
		currentRegionCount: 0,
		// The currently selected tool, either "paint" or "eraser".
		currentTool: "paint",
		// An array of colors used to visually distinguish different regions.
		regionColors: [
		  "#2dd4bf", // Light teal
		  "#ec4899", // Vivid pink (replaced #f472b6)
		  "#fbbf24", // Bright yellow
		  "#6366f1", // Deep indigo (replaced #818cf8)
		  "#a78bfa", // Light lavender
		  "#f87171", // Soft red
		  "#fb923c", // Orange
		  "#4ade80", // Bright green
		  "#60a5fa", // Soft blue
		  "#c084fc", // Purple
		  "#facc15", // Yellow-orange
		  "#93c5fd", // Light sky blue (replaced #93c5fd for more variety)
		  "#fca5a5", // Soft pink
		  "#6ee7b7", // Mint green (replaced #f9a8d4)
		  "#f43f5e", // Strong red (replaced #f9a8d4)
		],


		/**
		 * Initializes or resets the grid with a given size.
		 * @param {number} size - The dimension (N) for the new N x N grid.
		 * @param {HTMLElement} container - The DOM element to render the grid into.
		 */
		init(size, container) {
			this.gridSize = size;
			this.container = container;
			this.regions = Array(size).fill(0).map(() => Array(size).fill(0));
			this.nextRegionId = 1;
			this.currentRegionCount = 0;
			this.activeRegionId = null;
			this.isPainting = false;
			this.setTool("paint"); // Default to the paint tool.
			this.container.innerHTML = ""; // Clear any previous grid.
			this.container.style.gridTemplateColumns = `repeat(${size}, 1fr)`;
			this.container.style.gridTemplateRows = `repeat(${size}, 1fr)`;

			// Create and append grid cells to the container.
			for (let r = 0; r < size; r++) {
				for (let c = 0; c < size; c++) {
					const cell = document.createElement("div");
					cell.classList.add("sbi-grid-cell");
					cell.dataset.row = r;
					cell.dataset.col = c;
					this.container.appendChild(cell);
				}
			}
			this.updateRegionCounter();
		},

		/**
		 * Sets the active tool and updates the UI accordingly.
		 * @param {string} tool - The tool to activate ("paint" or "eraser").
		 */
		setTool(tool) {
			this.currentTool = tool;
			const eraserBtn = document.getElementById("eraserBtn");
			const gridContainer = document.getElementById("modalGridContainer");

			if (tool === "eraser") {
				eraserBtn.classList.add("sbi-active");
				gridContainer.classList.add("sbi-eraser-active");
				this.container.style.cursor = "crosshair";
			} else {
				eraserBtn.classList.remove("sbi-active");
				gridContainer.classList.remove("sbi-eraser-active");
				this.container.style.cursor = "pointer";
			}
		},

		/**
		 * Initiates a painting or erasing action when the user clicks on the grid.
		 * @param {MouseEvent} e - The mousedown event object.
		 */
		startPainting(e) {
			e.preventDefault();
			this.clearHighlights();
			Uploader.hideErrorMessages();

			const cell = e.target.closest(".sbi-grid-cell");
			if (!cell) return;

			this.isPainting = true;
			const r = parseInt(cell.dataset.row);
			const c = parseInt(cell.dataset.col);
			const existingRegionId = this.regions[r][c];

			if (this.currentTool === "eraser") {
				this.activeRegionId = 0; // '0' signifies an unassigned/erased cell.
			} else {
				if (existingRegionId > 0) {
					// Continue painting an existing region.
					this.activeRegionId = existingRegionId;
				} else if (this.currentRegionCount < this.gridSize) {
					// Start a new region if the limit has not been reached.
					this.activeRegionId = this.nextRegionId;
				} else {
					// Prevent creating new regions if the maximum count is reached.
					this.isPainting = false;
					return;
				}
			}
			this.paintCell(cell);
		},

		/**
		 * Concludes the current painting/erasing action.
		 */
		stopPainting() {
			if (!this.isPainting) return;
			this.isPainting = false;
			this.activeRegionId = null;
			this.recalculateRegions();
			Uploader.updateSaveButtonState();
		},

		/**
		 * Handles the painting/erasing of cells as the user moves the mouse/touch.
		 * @param {MouseEvent|TouchEvent} e - The mousemove or touchmove event object.
		 */
		paint(e) {
			if (!this.isPainting) return;
			// Support both mouse and touch events.
			const clientX = e.touches ? e.touches[0].clientX : e.clientX;
			const clientY = e.touches ? e.touches[0].clientY : e.clientY;
			const cell = document.elementFromPoint(clientX, clientY)?.closest(".sbi-grid-cell");

			// Ensure the cell is within the grid container before painting.
			if (cell && this.container.contains(cell)) {
				this.paintCell(cell);
			}
		},

		/**
		 * Applies the active tool's effect to a specific grid cell.
		 * @param {HTMLElement} cell - The DOM element of the cell to be painted.
		 */
		paintCell(cell) {
			const r = parseInt(cell.dataset.row);
			const c = parseInt(cell.dataset.col);

			if (this.activeRegionId === 0) { // Erasing
				if (this.regions[r][c] !== 0) {
					this.regions[r][c] = 0;
					cell.style.backgroundColor = "";
				}
			} else { // Painting
				if (this.regions[r][c] !== this.activeRegionId) {
					this.regions[r][c] = this.activeRegionId;
					const colorIndex = (this.activeRegionId - 1) % this.regionColors.length;
					cell.style.backgroundColor = this.regionColors[colorIndex];
				}
			}
		},

		/**
		 * Recalculates the number of unique regions and the next available region ID.
		 */
		recalculateRegions() {
			const regionSet = new Set();
			this.regions.forEach(row => row.forEach(cellId => {
				if (cellId > 0) regionSet.add(cellId);
			}));
			this.currentRegionCount = regionSet.size;
			this.nextRegionId = regionSet.size > 0 ? Math.max(...regionSet) + 1 : 1;
			this.updateRegionCounter();
		},

		/**
		 * Updates the UI element that displays the current region count.
		 */
		updateRegionCounter() {
			const counter = document.getElementById("regionCounter");
			const instruction = "Click a region to extend it, or an empty cell to create one.";
			counter.innerHTML = `${instruction}<br><b>Regions: ${this.currentRegionCount} / ${this.gridSize}</b>`;

			const countElement = counter.querySelector("b");
			// Highlight the counter when the required number of regions is met.
			if (this.currentRegionCount >= this.gridSize) {
				countElement.classList.add("text-green-400");
			} else {
				countElement.classList.remove("text-green-400");
			}
		},

		/**
		 * Checks if the puzzle meets the basic completion criteria.
		 * @returns {boolean} True if all cells are filled and the region count matches the grid size.
		 */
		isPuzzleValid() {
			const allAssigned = this.regions.every(row => row.every(cell => cell > 0));
			return allAssigned && this.currentRegionCount === this.gridSize;
		},

		/**
		 * Validates all regions for connectivity and star capacity.
		 * @param {number} starCount - The number of stars per region to validate against.
		 * @returns {Map<number, string>} A map of region IDs to their corresponding error messages.
		 */
		validateAllRegions(starCount) {
			const errors = new Map();
			const regionCells = new Map();

			// Group cells by their region ID.
			for (let r = 0; r < this.gridSize; r++) {
				for (let c = 0; c < this.gridSize; c++) {
					const id = this.regions[r][c];
					if (id > 0) {
						if (!regionCells.has(id)) regionCells.set(id, []);
						regionCells.get(id).push({
							r: r,
							c: c
						});
					}
				}
			}

			// Validate each region.
			for (const [id, cells] of regionCells.entries()) {
				if (!this.isRegionConnected(id, cells)) {
					errors.set(id, "is disconnected and must be a single contiguous area.");
					continue; // Don't check capacity if not connected.
				}
				if (!this.doesRegionHaveCapacity(id, cells, starCount)) {
					errors.set(id, `is too small to fit ${starCount} star(s) without them touching.`);
				}
			}
			return errors;
		},

		/**
		 * Checks if a region is contiguous using a Breadth-First Search (BFS) algorithm.
		 * @param {number} regionId - The ID of the region to check.
		 * @param {Array<Object>} cells - An array of cell coordinates {r, c} belonging to the region.
		 * @returns {boolean} True if all cells in the region are connected.
		 */
		isRegionConnected(regionId, cells) {
			if (cells.length <= 1) return true;

			const queue = [cells[0]];
			const visited = new Set([`${cells[0].r},${cells[0].c}`]);
			let head = 0;

			while (head < queue.length) {
				const {
					r,
					c
				} = queue[head++];
				const neighbors = [
					[r - 1, c],
					[r + 1, c],
					[r, c - 1],
					[r, c + 1]
				];

				for (const [nr, nc] of neighbors) {
					const key = `${nr},${nc}`;
					// Check if neighbor is within bounds, belongs to the same region, and hasn't been visited.
					if (nr >= 0 && nr < this.gridSize && nc >= 0 && nc < this.gridSize && this.regions[nr][nc] === regionId && !visited.has(key)) {
						visited.add(key);
						queue.push({
							r: nr,
							c: nc
						});
					}
				}
			}
			return visited.size === cells.length;
		},

		/**
		 * Checks if a region can accommodate a given number of stars without them touching.
		 * @param {number} regionId - The ID of the region (for context, not used in logic).
		 * @param {Array<Object>} cells - An array of cell coordinates for the region.
		 * @param {number} starCount - The required number of stars.
		 * @returns {boolean} True if the region has sufficient capacity.
		 */
		doesRegionHaveCapacity(regionId, cells, starCount) {
			if (starCount === 0) return true;

			let placedStars = 0;
			const availableCells = new Set(cells.map(cell => `${cell.r},${cell.c}`));

			// Greedily place stars and remove adjacent cells from availability.
			while (placedStars < starCount && availableCells.size > 0) {
				placedStars++;
				const [firstCellKey] = availableCells; // Get an arbitrary available cell.
				const [r, c] = firstCellKey.split(",").map(Number);

				// Remove the cell itself and all its neighbors (including diagonals).
				for (let dr = -1; dr <= 1; dr++) {
					for (let dc = -1; dc <= 1; dc++) {
						availableCells.delete(`${r + dr},${c + dc}`);
					}
				}
			}
			return placedStars === starCount;
		},

		/**
		 * Adds a visual highlight class to cells belonging to invalid regions.
		 * @param {Map<number, string>} errors - A map of region IDs to their error messages.
		 */
		highlightErrors(errors) {
			this.container.querySelectorAll(".sbi-grid-cell").forEach(cell => {
				const r = parseInt(cell.dataset.row);
				const c = parseInt(cell.dataset.col);
				const regionId = this.regions[r][c];
				if (errors.has(regionId)) {
					cell.classList.add("sbi-cell-invalid");
				}
			});
		},

		/**
		 * Removes all error-related visual highlights from the grid cells.
		 */
		clearHighlights() {
			this.container.querySelectorAll(".sbi-cell-invalid").forEach(cell => cell.classList.remove("sbi-cell-invalid"));
		}
	};

	/**
	 * @namespace Uploader
	 * @description Manages the entire UI for importing puzzles, including modals for
	 * manual drawing, photo import, and string-based import.
	 */
	const Uploader = {
		selectedFile: null,

		/**
		 * Caches DOM elements and initializes all event listeners for the importer UI.
		 */
		init() {
			// Main importer selection screen elements.
			this.importerContainer = document.getElementById("importerContainer");
			this.closeImporterBtn = document.getElementById("closeImporterBtn");
			this.manualImportBtn = document.getElementById("manualImportBtn");
			this.photoImportBtn = document.getElementById("photoImportBtn");
			this.submitStringBtn = document.getElementById("submitStringBtn");

			// Photo import modal elements.
			this.photoModal = document.getElementById("photoModal");
			this.loadImageBtn = document.getElementById("loadImageBtn");
			this.photoFileInput = document.getElementById("photoFileInput");
			this.enableAnnotationsCheckbox = document.getElementById("enableAnnotationsCheckbox");
			this.selectedImageInfo = document.getElementById("selectedImageInfo");
			this.photoCancelBtn = document.getElementById("photoCancelBtn");
			this.snapGridBtn = document.getElementById("snapGridBtn");
			this.photoLoader = document.getElementById("photoLoader");

			// Manual drawing modal elements.
			this.modal = document.getElementById("uploadModal");
			this.step1 = document.getElementById("modalStep1");
			this.step2 = document.getElementById("modalStep2");
			this.gridContainer = document.getElementById("modalGridContainer");
			this.errorContainer = document.getElementById("modalErrorContainer");
			this.cancelBtn = document.getElementById("modalCancelBtn");
			this.continueBtn = document.getElementById("modalContinueBtn");
			this.backBtn = document.getElementById("modalBackBtn");
			this.saveBtn = document.getElementById("modalSaveBtn");
			this.eraserBtn = document.getElementById("eraserBtn");
			this.gridSizeInput = document.getElementById("modalGridSize");
			this.starsInput = document.getElementById("modalStars");

			// General UI elements.
			this.mainContent = document.getElementById("sbi-main-content");
			this.errorModal = document.getElementById("errorModal");
			this.errorModalOkBtn = document.getElementById("errorModalOkBtn");

			this.addEventListeners();
		},

		/**
		 * Binds all necessary event listeners for the importer's functionality.
		 */
		addEventListeners() {
			// Close modals when clicking on the dark background overlay.
			this.importerContainer.addEventListener("click", (e => {
				if (e.target === this.importerContainer) {
					this.importerContainer.style.display = "none";
					this.resetView(); // Ensure a clean state for next time.
				}
			}));
			this.photoModal.addEventListener("click", (e => {
				if (e.target === this.photoModal) {
					this.closePhotoModal(); // Return to the main importer menu.
				}
			}));

			// Main importer UI event listeners.
			this.errorModalOkBtn.addEventListener("click", () => this.closeErrorModal());
			this.closeImporterBtn.addEventListener("click", () => {
				this.importerContainer.style.display = "none";
				this.resetView(); // Clean up the view for the next open.
			});
			this.manualImportBtn.addEventListener("click", () => this.openDrawingModal());
			this.photoImportBtn.addEventListener("click", () => this.openPhotoModal());
			this.submitStringBtn.addEventListener("click", () => {
				const puzzleString = document.getElementById("puzzleStringInput").value.trim();
				if (puzzleString) {
					importPuzzleString(puzzleString).then(success => {
						if (success) {
							this.importerContainer.style.display = "none";
							this.resetView(); // Clean up on success.
						}
					});
				} else {
					setStatus("Please paste a puzzle string.", false);
				}
			});

			// Photo modal event listeners.
			this.loadImageBtn.addEventListener("click", () => this.photoFileInput.click());
			this.photoFileInput.addEventListener("change", e => this.handleImageSelection(e));
			this.photoCancelBtn.addEventListener("click", () => this.closePhotoModal());
			this.snapGridBtn.addEventListener("click", () => this.processPhotoImport());

			// Manual drawing modal event listeners.
			this.cancelBtn.addEventListener("click", () => this.closeDrawingModal());
			this.continueBtn.addEventListener("click", () => this.showStep2());
			this.backBtn.addEventListener("click", () => this.showStep1());
			this.saveBtn.addEventListener("click", () => this.save());
			this.eraserBtn.addEventListener("click", () => {
				const newTool = GridManager.currentTool === "paint" ? "eraser" : "paint";
				GridManager.setTool(newTool);
			});

			// Grid drawing listeners for both mouse and touch.
			const mouseMoveHandler = e => GridManager.paint(e);
			this.gridContainer.addEventListener("mousedown", e => {
				GridManager.startPainting(e);
				document.addEventListener("mousemove", mouseMoveHandler);
			});
			document.addEventListener("mouseup", () => {
				GridManager.stopPainting();
				document.removeEventListener("mousemove", mouseMoveHandler);
			});
			this.gridContainer.addEventListener("touchstart", e => GridManager.startPainting(e), {
				passive: false
			});
			this.gridContainer.addEventListener("touchmove", e => GridManager.paint(e), {
				passive: false
			});
			this.gridContainer.addEventListener("touchend", () => GridManager.stopPainting());
		},

		/**
		 * Displays the generic error modal.
		 */
		showErrorModal() {
			this.errorModal.style.display = "flex";
		},

		/**
		 * Hides the generic error modal.
		 */
		closeErrorModal() {
			this.errorModal.style.display = "none";
		},

		/**
		 * Opens the photo import modal.
		 */
		openPhotoModal() {
			this.mainContent.style.display = "none";
			this.photoModal.classList.add("sbi-modal-active");
			this.resetPhotoModal();
		},

		/**
		 * Closes the photo import modal and returns to the main importer screen.
		 */
		closePhotoModal() {
			this.photoModal.classList.remove("sbi-modal-active");
			this.mainContent.style.display = "block";
			this.resetPhotoModal();
		},

		/**
		 * Resets the photo import modal to its default state.
		 */
		resetPhotoModal() {
			this.selectedFile = null;
			this.photoFileInput.value = ""; // Clear file input.
			this.selectedImageInfo.style.display = "none";
			this.selectedImageInfo.textContent = "No image selected";
			this.snapGridBtn.disabled = true;
			this.snapGridBtn.style.backgroundColor = "#4b5563";
			this.snapGridBtn.style.cursor = "not-allowed";
			this.enableAnnotationsCheckbox.checked = false;
		},

		/**
		 * Handles the file selection event from the photo input.
		 * @param {Event} event - The change event from the file input element.
		 */
		handleImageSelection(event) {
			const file = event.target.files[0];
			if (!file) {
				this.resetPhotoModal();
				return;
			}
			this.selectedFile = file;
			this.selectedImageInfo.textContent = `Selected: ${file.name} (${(file.size / 1024 / 1024).toFixed(1)}MB)`;
			this.selectedImageInfo.style.display = "block";

			// Enable the "Snap Grid" button now that a file is selected.
			this.snapGridBtn.disabled = false;
			this.snapGridBtn.style.backgroundColor = "#16a34a";
			this.snapGridBtn.style.cursor = "pointer";
		},

		/**
		 * Asynchronously processes the selected image to detect and import a puzzle.
		 */
		async processPhotoImport() {
			if (!this.selectedFile) {
				customAlert("Please select an image first.");
				return;
			}

			this.photoLoader.style.display = "flex";
			this.snapGridBtn.disabled = true;

			try {
				setStatus("Initializing photo importer...");
				// Dynamically load required image processing scripts.
				await loadScripts(["SnapGridScripts/pica.min.js", "SnapGridScripts/opencv.js", "SnapGridScripts/SnapGridController.js"]);

				const updateCallback = message => setStatus(message, true);
				if (!window.SnapGridController) {
					throw new Error("SnapGridController is not available.");
				}

				updateCallback("Processing image... this may take a moment.");
				const enableAnnotations = this.enableAnnotationsCheckbox.checked;
				const result = await window.SnapGridController.processImage(this.selectedFile, {
					enableAnnotations: enableAnnotations,
					onStatusUpdate: updateCallback
				});

				// If the processing result doesn't contain a grid, it failed.
				if (!result || !result.grid) {
					throw new Error("No valid puzzle was detected in the image.");
				}

				// On success, close the photo modal before continuing.
				this.closePhotoModal();
				const regions = this.convertSnapGridToRegions(result.grid);
				if (!regions) {
					throw new Error("Failed to interpret the detected grid data.");
				}

				let playerGrid = [];
				if (enableAnnotations && result.annotations) {
					playerGrid = this.convertAnnotationsToPlayerGrid(result.annotations, result.grid.size);
					updateCallback("Converting detected annotations...");
				}

				// Generate an SBN string from the detected data.
				const n = result.grid.size;
				const defaultStars = Math.floor(Math.floor(n * n / 4) / n); // Calculate a sensible default for stars.
				const sbn = encodeToSbn(regions, defaultStars, playerGrid, null);
				if (!sbn) {
					throw new Error("Error creating puzzle data from detected grid.");
				}

				// Provide user feedback based on what was detected.
				let statusMessage = "✅ Grid detected! Loading into playground...";
				if (enableAnnotations && result.annotations) {
					let starCount = 0;
					let crossCount = 0;
					if (result.annotations.cells) {
						result.annotations.cells.forEach(cell => {
							if (cell.annotations) {
								if (cell.annotations.star) starCount++;
								if (cell.annotations.cross) crossCount++;
							}
						});
					}
					if (starCount > 0 || crossCount > 0) {
						statusMessage = `✅ Grid and annotations detected! (${starCount} stars, ${crossCount} marks) Loading into playground...`;
					} else if (enableAnnotations) {
						statusMessage = "✅ Grid detected! No annotations found. Loading into playground...";
					}
				}

				setStatus(statusMessage, true);
				const success = await importPuzzleString(sbn);
				if (success) {
					this.importerContainer.style.display = "none";
					this.resetView();
				}
			} catch (error) {
				console.error("Photo processing failed:", error);
				setStatus(`Photo Import Error: ${error.message}`, false);
				this.closePhotoModal(); // Hide the photo selection modal first.
				this.showErrorModal(); // Then, display the error notification.
			} finally {
				// Ensure UI is restored regardless of success or failure.
				this.photoLoader.style.display = "none";
				this.snapGridBtn.disabled = false;
			}
		},

		/**
		 * Converts raw grid border data from SnapGrid into a 2D region array.
		 * @param {Object} gridData - The grid data object from SnapGridController.
		 * @returns {Array<Array<number>>} A 2D array representing the puzzle regions.
		 */
		convertSnapGridToRegions(gridData) {
			const size = gridData.size;
			const regions = Array(size).fill(0).map(() => Array(size).fill(0));
			let regionId = 1;

			// Uses a flood-fill algorithm to identify contiguous regions based on border data.
			function floodFill(r, c) {
				if (r < 0 || r >= size || c < 0 || c >= size || regions[r][c] !== 0) {
					return;
				}
				regions[r][c] = regionId;
				const cellInfo = gridData.cells[r * size + c];

				// Recursively fill upwards if no border separates this cell from the one above.
				if (r > 0 && !gridData.cells[(r - 1) * size + c].regionBorders.bottom) {
					floodFill(r - 1, c);
				}
				// Fill downwards if the current cell has no bottom border.
				if (r < size - 1 && !cellInfo.regionBorders.bottom) {
					floodFill(r + 1, c);
				}
				// Fill leftwards if no border separates this cell from the one to the left.
				if (c > 0 && !gridData.cells[r * size + (c - 1)].regionBorders.right) {
					floodFill(r, c - 1);
				}
				// Fill rightwards if the current cell has no right border.
				if (c < size - 1 && !cellInfo.regionBorders.right) {
					floodFill(r, c + 1);
				}
			}

			// Iterate through each cell; if it hasn't been assigned a region, start a new flood fill.
			for (let r = 0; r < size; r++) {
				for (let c = 0; c < size; c++) {
					if (regions[r][c] === 0) {
						floodFill(r, c);
						regionId++;
					}
				}
			}
			return regions;
		},

		/**
		 * Converts annotation data from SnapGrid into the application's player grid format.
		 * @param {Array<Object>} annotations - The array of annotation objects from SnapGrid.
		 * @param {number} gridSize - The size of the grid.
		 * @returns {Array<Array<number>>} A 2D array representing the player's marks.
		 */
		convertAnnotationsToPlayerGrid(annotations, gridSize) {
			// Initialize an empty grid with 0s (STATE_EMPTY).
			const playerGrid = Array(gridSize).fill(0).map(() => Array(gridSize).fill(0));
			if (!annotations || !annotations.length) {
				return playerGrid;
			}

			// Map SnapGrid annotation types to the application's internal state constants.
			// STATE_STAR = 1, STATE_SECONDARY_MARK = 2.
			annotations.forEach(annotation => {
				const {
					row,
					col,
					type
				} = annotation;
				if (row >= 0 && row < gridSize && col >= 0 && col < gridSize) {
					if (type === "star") {
						playerGrid[row][col] = 1; // Corresponds to STATE_STAR.
					} else if (type === "x") {
						playerGrid[row][col] = 2; // Corresponds to STATE_SECONDARY_MARK.
					}
					// Other types are ignored, leaving the cell as STATE_EMPTY (0).
				}
			});
			return playerGrid;
		},

		/**
		 * Opens the manual drawing modal.
		 */
		openDrawingModal() {
			this.mainContent.style.display = "none";
			this.modal.classList.add("sbi-modal-active");
			this.showStep1();
		},

		/**
		 * Closes the manual drawing modal and returns to the main importer screen.
		 */
		closeDrawingModal() {
			this.modal.classList.remove("sbi-modal-active");
			this.mainContent.style.display = "block";
		},

		/**
		 * Displays the first step (grid configuration) of the manual drawing modal.
		 */
		showStep1() {
			this.step1.classList.remove("hidden");
			this.step2.classList.add("hidden");
			this.hideErrorMessages();
		},

		/**
		 * Validates configuration and displays the second step (grid drawing) of the modal.
		 */
		showStep2() {
			const size = parseInt(this.gridSizeInput.value, 10);
			if (isNaN(size) || size < 4) {
				customAlert("Please enter a grid size greater than 4.");
				return;
			}
			this.step1.classList.add("hidden");
			this.step2.classList.remove("hidden");
			GridManager.init(size, this.gridContainer);
			this.updateSaveButtonState();
		},

		/**
		 * Enables or disables the "Save" button based on whether the puzzle is valid.
		 */
		updateSaveButtonState() {
			const isValid = GridManager.isPuzzleValid();
			this.saveBtn.disabled = !isValid;
			if (isValid) {
				this.saveBtn.classList.remove("sbi-save-btn-disabled");
				this.saveBtn.classList.add("sbi-save-btn-enabled");
			} else {
				this.saveBtn.classList.remove("sbi-save-btn-enabled");
				this.saveBtn.classList.add("sbi-save-btn-disabled");
			}
		},

		/**
		 * Hides and clears the error message container in the modal.
		 */
		hideErrorMessages() {
			this.errorContainer.classList.add("hidden");
			this.errorContainer.innerHTML = "";
		},

		/**
		 * Validates the drawn grid, saves it as an SBN string, and loads it into the playground.
		 */
		save() {
			GridManager.clearHighlights();
			this.hideErrorMessages();

			// First, check for basic validity (all cells filled, correct region count).
			if (!GridManager.isPuzzleValid()) {
				this.errorContainer.textContent = "Puzzle is not complete. Please ensure all cells are filled and you have the correct number of regions.";
				this.errorContainer.classList.remove("hidden");
				return;
			}

			// Then, perform more complex validation (connectivity, capacity).
			const starCount = parseInt(this.starsInput.value, 10);
			const validationErrors = GridManager.validateAllRegions(starCount);

			if (validationErrors.size > 0) {
				GridManager.highlightErrors(validationErrors);
				let errorHtml = '<strong>Please fix the following issues:</strong><ul class="list-disc list-inside mt-1">';
				validationErrors.forEach((message, id) => {
					errorHtml += `<li><strong class="text-white">Region ${id}</strong> ${message}</li>`;
				});
				errorHtml += "</ul>";
				this.errorContainer.innerHTML = errorHtml;
				this.errorContainer.classList.remove("hidden");
				return;
			}

			// If all validations pass, encode the puzzle data.
			// For manual creation, playerGrid and history are empty/null.
			const sbn = encodeToSbn(GridManager.regions, starCount, [], null);
			if (!sbn) {
				setStatus("Error creating puzzle data. Please check configuration.", false);
				return;
			}

			setStatus("✅ Puzzle created! Loading into playground...", true);
			importPuzzleString(sbn).then(success => {
				if (success) {
					this.importerContainer.style.display = "none";
					this.resetView(); // Clean up on success.
				}
			});
		},

		/**
		 * Resets the entire importer interface to its initial state.
		 */
		resetView() {
			// Restore visibility of main content and hide all modals.
			this.mainContent.style.display = "block";
			this.modal.classList.remove("sbi-modal-active");
			this.photoModal.classList.remove("sbi-modal-active");

			// Reset the drawing modal to its first step.
			this.showStep1();
			// Clear any grid drawings.
			this.gridContainer.innerHTML = "";
			// Clear any displayed validation errors.
			this.hideErrorMessages();
			// Clear the puzzle string input field.
			const puzzleStringInput = document.getElementById("puzzleStringInput");
			if (puzzleStringInput) {
				puzzleStringInput.value = "";
			}
			// Reset the photo import modal.
			this.resetPhotoModal();
		}
	};
	// Initialize the Uploader, which sets up all UI elements and event listeners.
	Uploader.init();
}