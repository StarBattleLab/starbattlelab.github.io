/**
 * SnapGridController.js
 *
 * Main controller to process a puzzle image. It dynamically loads all required
 * script dependencies from the same folder before running the workflow.
 *
 * Author: Isaiah Tadrous
 * Version: 1.0.0
 *
 */

(function(window) {
    'use strict';

    // --- DEPENDENCY LOADER ---
    // This section handles the dynamic loading of script dependencies required for the image processing pipeline.

    /**
     * @const {string[]} SCRIPT_DEPENDENCIES
     * An array of paths to the JavaScript modules that must be loaded before the main processing logic can execute.
     * These scripts are loaded sequentially to ensure correct initialization order.
     */
    const SCRIPT_DEPENDENCIES = [
        'SnapGridScripts/imagePreProcessor.js',
        'SnapGridScripts/imageNormalizer.js',
        'SnapGridScripts/gridDetector.js',
        'SnapGridScripts/speedinvert.js',
        'SnapGridScripts/enhanceRegionsByColor.js',
        'SnapGridScripts/lineDurabilityFilter.js',
        'SnapGridScripts/annotationDetector.js'
    ];

    /**
     * @type {boolean} dependenciesLoaded
     * A flag to ensure that the dependencies are only loaded once per session.
     */
    let dependenciesLoaded = false;

    /**
     * Dynamically loads a script into the document head. It checks if the script already
     * exists to prevent duplicate loading.
     * @param {string} src - The source path of the script to load.
     * @returns {Promise<void>} A promise that resolves when the script has loaded successfully
     * or rejects if an error occurs.
     */
    const loadScript = (src) => {
        return new Promise((resolve, reject) => {
            // Avoid re-loading the script if it's already in the DOM.
            if (document.querySelector(`script[src*="${src}"]`)) {
                return resolve();
            }
            const script = document.createElement('script');
            script.src = src;
            script.async = false; // Ensures scripts execute in the order they are listed.
            script.onload = () => resolve();
            script.onerror = () => reject(new Error(`Failed to load script: ${src}`));
            document.head.appendChild(script);
        });
    };

    /**
     * Manages the sequential loading of all script dependencies defined in SCRIPT_DEPENDENCIES.
     * Also triggers the canvas optimization patch before loading the scripts.
     * @param {function(string): void} onStatusUpdate - A callback function to report loading progress.
     */
    const loadAllDependencies = async (onStatusUpdate) => {
        if (dependenciesLoaded) return;
        onStatusUpdate("Loading script dependencies...");
        
        // Apply a performance optimization to the Canvas API before loading dependent scripts.
        patchCanvasForOptimization();
        
        for (const src of SCRIPT_DEPENDENCIES) {
            try {
                await loadScript(src);
            } catch (e) {
                console.error(e);
                throw e; // Halt execution if a critical script fails to load.
            }
        }
        dependenciesLoaded = true;
    };

    /**
     * Monkey-patches the global HTMLCanvasElement and document.createElement methods to automatically
     * apply the `willReadFrequently` optimization. This significantly improves the performance of
     * `getImageData`, which is used heavily by the processing scripts. This patch avoids needing to
     * modify the legacy dependency scripts directly.
     */
    const patchCanvasForOptimization = () => {
        const originalGetContext = HTMLCanvasElement.prototype.getContext;
        const originalCreateElement = document.createElement;
        
        // Use a WeakSet to keep track of canvases that have been identified as needing optimization.
        const canvasesNeedingOptimization = new WeakSet();
        
        // Wrap the original getContext method.
        HTMLCanvasElement.prototype.getContext = function(contextType, contextAttributes = {}) {
            if (contextType === '2d') {
                // If this canvas is known to need optimization, enforce the attribute.
                if (canvasesNeedingOptimization.has(this)) {
                    contextAttributes.willReadFrequently = true;
                }
                const context = originalGetContext.call(this, contextType, contextAttributes);
                
                // Further wrap getImageData on the newly created context to automatically flag the canvas for future use.
                if (context && !context._patched) {
                    const originalGetImageData = context.getImageData;
                    context.getImageData = function(...args) {
                        canvasesNeedingOptimization.add(this.canvas);
                        // If the context wasn't created with the flag, get a new one that is.
                        if (!contextAttributes.willReadFrequently) {
                            this.canvas.getContext('2d', { willReadFrequently: true });
                        }
                        return originalGetImageData.apply(this, args);
                    };
                    context._patched = true; // Mark as patched to prevent re-wrapping.
                }
                return context;
            }
            return originalGetContext.call(this, contextType, contextAttributes);
        };

        // Wrap document.createElement to proactively flag any new canvas elements.
        document.createElement = function(tagName, options) {
            const element = originalCreateElement.call(this, tagName, options);
            if (tagName.toLowerCase() === 'canvas') {
                canvasesNeedingOptimization.add(element);
            }
            return element;
        };
    };


    // --- TEMPORARY DOM HELPERS ---
    // This section provides functions to manage temporary, hidden DOM elements. These are required
    // as a compatibility layer for legacy scripts that expect to interact with specific element IDs in the DOM.

    /**
     * Creates and appends a hidden container to the DOM with all the elements
     * required by the dependency scripts for their operation and output.
     * @returns {HTMLDivElement} The created container element.
     */
    const setupTemporaryDOM = () => {
        const tempContainer = document.createElement('div');
        tempContainer.id = 'snapgrid-temp-container';
        tempContainer.style.display = 'none'; // Keep the elements from affecting layout.
        tempContainer.style.visibility = 'hidden';
        tempContainer.innerHTML = `
            <div id="status"></div>
            <canvas id="outputCanvas"></canvas>
            <div id="starbattle-grid-container" style="display: block;">
                <div id="starbattle-grid"></div>
            </div>
        `;
        document.body.appendChild(tempContainer);
        return tempContainer;
    };
    
    /**
     * Reads the final grid structure from the temporary DOM elements after processing.
     * The `lineDurabilityFilter` script outputs its results by adding CSS classes to these elements.
     * @returns {object|null} A structured object representing the grid, or null if extraction fails.
     */
    const extractGridDataFromDOM = () => {
        const gridElement = document.getElementById('starbattle-grid');
        if (!gridElement) return null;
        
        const cells = gridElement.querySelectorAll('.grid-cell');
        if (cells.length === 0) return null;

        const gridSize = Math.sqrt(cells.length);
        if (!Number.isInteger(gridSize)) return null; // Ensure it's a square grid.

        // Map the flat list of cells into a structured array with coordinates and border data.
        const cellData = Array.from(cells).map((cell, i) => {
            const row = Math.floor(i / gridSize);
            const col = i % gridSize;
            return {
                row,
                col,
                regionBorders: {
                    bottom: cell.classList.contains('region-border-bottom'),
                    right: cell.classList.contains('region-border-right')
                }
            };
        });

        // Return a simplified, clean representation of the final grid.
        return {
            size: gridSize,
            cells: cellData
        };
    };
    
    /**
     * Removes the temporary container and its children from the DOM.
     * @param {HTMLElement} container - The container element to remove.
     */
    const cleanupTemporaryDOM = (container) => {
        if (container) {
            document.body.removeChild(container);
        }
    };

    // --- CORE LOGIC & UTILITIES ---
    // A collection of helper functions for core tasks like waiting for OpenCV, handling image
    // conversions, and creating optimized canvas elements.

    /**
     * Returns a promise that resolves when the OpenCV.js library is loaded and ready.
     * It polls at a set interval, which is necessary as OpenCV loads asynchronously.
     * @returns {Promise<void>}
     */
    const cvReady = () => new Promise(resolve => {
        if (typeof cv !== 'undefined' && cv.imread) return resolve();
        const interval = setInterval(() => {
            if (typeof cv !== 'undefined' && cv.imread) {
                clearInterval(interval);
                resolve();
            }
        }, 100);
    });

    /**
     * Converts a "drawable" object (like a Canvas) into a standard HTMLImageElement.
     * This is useful for standardizing input for functions that only accept image elements.
     * @param {HTMLImageElement|HTMLCanvasElement} drawable - The source canvas or image.
     * @returns {Promise<HTMLImageElement>} A promise that resolves with the new Image element.
     */
    const drawableToImage = (drawable) => new Promise((resolve, reject) => {
        if (drawable instanceof HTMLImageElement) return resolve(drawable);
        if (drawable instanceof HTMLCanvasElement) {
            const image = new Image();
            image.onload = () => resolve(image);
            image.onerror = () => reject(new Error("Failed to convert canvas to image."));
            image.src = drawable.toDataURL(); // Convert canvas content to a data URL.
            return;
        }
        reject(new Error("Cannot convert item to Image."));
    });

    /**
     * A simple utility to get a 2D rendering context from a canvas.
     * @param {HTMLCanvasElement} canvas - The canvas element.
     * @param {boolean} [willReadFrequently=false] - A performance hint for the context.
     * @returns {CanvasRenderingContext2D} The 2D rendering context.
     */
    const getCanvasContext = (canvas, willReadFrequently = false) => {
        return canvas.getContext('2d', { willReadFrequently });
    };

    /**
     * Factory function to create a new canvas element with a pre-configured context.
     * @param {number} width - The width of the new canvas.
     * @param {number} height - The height of the new canvas.
     * @param {boolean} [willReadFrequently=false] - A performance hint for the context.
     * @returns {HTMLCanvasElement} The newly created canvas element.
     */
    const createOptimizedCanvas = (width, height, willReadFrequently = false) => {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        canvas.getContext('2d', { willReadFrequently }); // Pre-fetch the context with the hint.
        return canvas;
    };

    /**
     * Ensures an existing canvas's context is flagged with `willReadFrequently`.
     * This retroactively applies the optimization if it wasn't set on creation.
     * @param {HTMLCanvasElement} canvas - The canvas to optimize.
     * @returns {HTMLCanvasElement} The same canvas, for chaining.
     */
    const ensureCanvasOptimized = (canvas) => {
        canvas.getContext('2d', { willReadFrequently: true });
        return canvas;
    };


    // --- MAIN CONTROLLER ---
    // The public interface for the SnapGrid module.

    const SnapGridController = {
        /**
         * Orchestrates the entire multi-step workflow to process a puzzle image. It takes an image file,
         * runs it through a pipeline of normalization, unwarping, grid detection, and filtering to
         * extract the puzzle's structure and any annotations within it.
         * @param {File} imageFile - The image file (`<input type="file">`) to process.
         * @param {object} [options] - Configuration options for the processing workflow.
         * @param {boolean} [options.enableAnnotations=true] - Whether to run the annotation detection step.
         * @param {function(string): void} [options.onStatusUpdate=() => {}] - A callback for receiving progress updates.
         * @returns {Promise<{grid: object, annotations: Array}>} A promise that resolves with the extracted puzzle
         * data, including the grid structure and a list of annotations. Rejects with an error if any step fails.
         */
        async processImage(imageFile, options = {}) {
            const {
                enableAnnotations = true,
                onStatusUpdate = () => {},
            } = options;

            // Ensure all dependencies are loaded before starting.
            await loadAllDependencies(onStatusUpdate);
            // Create the temporary DOM elements needed by legacy scripts.
            const tempDOMContainer = setupTemporaryDOM();

            try {
                // Step 0: Load the image from the file.
                onStatusUpdate("Loading image...");
                const {
                    processingImage,    // A down-scaled version for faster processing.
                    fullResolutionImage // The original for high-detail tasks.
                } = await PuzzleProcessor.loadImageFromFile(imageFile, 1000, onStatusUpdate);
                if (!processingImage) throw new Error("Image loading failed.");

                // Step 1: Perform initial pre-processing (e.g., color correction, sharpening).
                onStatusUpdate("Step 1: Pre-processing...");
                const {
                    finalCanvas: preprocessedCanvas
                } = await PuzzleProcessor.runFullProcess({
                    processingImage,
                    fullResolutionImage,
                    onStatusUpdate
                });
                let currentImage = preprocessedCanvas || processingImage;

                // Step 2: Unwarp the image to correct perspective distortion. This is done in two passes
                // for iterative refinement, leading to a more accurate, squared-off grid.
                onStatusUpdate("Step 2: Unwarping image...");
                let unwarpedImage = await drawableToImage(currentImage);
                for (let i = 1; i <= 2; i++) {
                    const { finalImageData } = await ImageProcessor.processImage(unwarpedImage, onStatusUpdate, { maxDimension: 700 });
                    if (!finalImageData) throw new Error(`Unwarp failed on pass ${i}.`);

                    const passCanvas = createOptimizedCanvas(finalImageData.width, finalImageData.height, true);
                    getCanvasContext(passCanvas, true).putImageData(finalImageData, 0, 0);
                    unwarpedImage = passCanvas;
                }
                currentImage = unwarpedImage;

                // Step 3: Detect the primary grid lines in the unwarped image.
                onStatusUpdate("Step 3: Detecting grid...");
                await cvReady();
                const grid = await gridDetector.detectGrid(currentImage);
                if (!grid || !grid.gridSize) throw new Error("Grid detector failed.");

                // Step 3.5: Check if the image background is dark and invert if necessary.
                // Subsequent steps assume a light background with dark lines.
                onStatusUpdate("Step 3.5: Checking color inversion...");
                ensureCanvasOptimized(currentImage);
                const invertResult = await processImageAndInvert(currentImage, grid);
                if (!invertResult || !invertResult.success) throw new Error(invertResult.error || "Auto-invert step failed.");
                currentImage = invertResult.canvas;
                ensureCanvasOptimized(currentImage);

                // Steps 4 & 5: Enhance and filter region borders. This complex step tries to identify the
                // thicker lines that define regions within the puzzle. It has fallback logic to try different
                // enhancement strategies if the first pass fails.
                onStatusUpdate("Step 4/5: Filtering regions...");
                ensureCanvasOptimized(currentImage);
                const cornerPixel = getCanvasContext(currentImage, true).getImageData(0, 0, 1, 1).data;
                const isWhiteBackground = cornerPixel[0] > 200 && cornerPixel[1] > 200 && cornerPixel[2] > 200;
                const statusEl = document.getElementById('status');
                let filterPassed = false;
                
                // Helper to run the filter and check the result from the legacy script's DOM output.
                const runFilter = async (imgToFilter) => {
                    ensureCanvasOptimized(imgToFilter);
                    await window.runDurabilityFilterWithGrid(imgToFilter, grid);
                    return !(statusEl.textContent.includes('Failed'));
                };

                // This logic attempts the most likely successful path first, with a fallback.
                if (isWhiteBackground) {
                    filterPassed = await runFilter(currentImage); // Try filtering directly.
                    if (!filterPassed) { // If it fails, enhance the image and try again.
                        const enhancedCanvas = createOptimizedCanvas(currentImage.width, currentImage.height, true);
                        await enhanceRegions(currentImage, enhancedCanvas, grid);
                        filterPassed = await runFilter(enhancedCanvas);
                    }
                } else {
                    const enhancedCanvas = createOptimizedCanvas(currentImage.width, currentImage.height, true);
                    await enhanceRegions(currentImage, enhancedCanvas, grid); // Try enhancing first.
                    filterPassed = await runFilter(enhancedCanvas);
                    if (!filterPassed) { // If it fails, try filtering the original image.
                        filterPassed = await runFilter(currentImage);
                    }
                }

                if (!filterPassed) throw new Error(`Line Durability Filter failed. Final status: ${statusEl.textContent}`);

                // Step 6: Extract the final grid data (cell borders) from the temporary DOM.
                onStatusUpdate("Step 6: Finalizing grid data...");
                const finalGridData = extractGridDataFromDOM();
                if (!finalGridData) throw new Error("Could not extract final grid from processed elements.");

                // Step 7: Optionally, detect annotations (e.g., numbers, symbols) inside the grid cells.
                // This is run on a high-quality unwarped image for better accuracy.
                let annotations = [];
                if (enableAnnotations) {
                    onStatusUpdate("Step 7: Detecting annotations...");
                    const hqUnwarpInput = await drawableToImage(preprocessedCanvas || processingImage);
                    const { finalImageData: hqData } = await ImageProcessor.processImage(hqUnwarpInput, () => {}, { maxDimension: 700 });
                    if (hqData) {
                        annotations = await annotationDetector.detect(hqData, grid);
                    }
                }
                
                onStatusUpdate("✅ Workflow Complete!");
                return { grid: finalGridData, annotations };

            } catch (error) {
                // Catch any error from the pipeline, log it, and throw a user-friendly error.
                console.error("SnapGridController Error:", error);
                throw new Error(`Workflow failed: ${error.message}`);
            } finally {
                // Crucially, always clean up the temporary DOM elements, regardless of success or failure.
                cleanupTemporaryDOM(tempDOMContainer);
            }
        }
    };

    // Expose the controller to the global window object, making it accessible from other scripts.
    window.SnapGridController = SnapGridController;

})(window);