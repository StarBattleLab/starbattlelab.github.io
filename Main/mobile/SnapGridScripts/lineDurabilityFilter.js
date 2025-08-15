/**
 * lineDurabilityFilter.js
 *
 * Author: Isaiah Tadrous
 * Version: 1.0.0
 *
 * This module detects and filters line configurations based on line durability.
 * It iteratively filters away weaker lines until only the strongest remain,
 * producing a valid Star Battle puzzle layout.
 *
 * Usage:
 * - Input: Star Battle puzzle image and grid data.
 * - Process: Iterative filtering based on a durability threshold.
 * - Output: A refined set of lines that form a valid Star Battle puzzle.
 *
 * Notes:
 * - Designed specifically for Star Battle puzzle generation.
 * - The image is now cropped to the detected grid before analysis to remove border interference.
 */

// CONSTANTS
const MAX_BRIGHTNESS_SEARCH = 200; // Upper bound for the brightness search loop.
const MAX_DATA_POINTS = 10000; // Safety limit for loops over variable data (contours, lines).
const MAX_BFS_ITERATIONS = 500000; // Safety break for BFS loops to prevent a UI freeze.


/**
 * Updates the status message displayed to the user.
 * @param {string} message - The text to display.
 * @param {boolean} isError - If true, displays the message in an error color.
 */
function setStatus(message, isError = false) {
    const statusEl = document.getElementById('status');
    if (!statusEl) return;
    statusEl.textContent = message;
    statusEl.style.color = isError ? '#d93025' : '#5f6368';
}

/**
 * Initializes the application by waiting for OpenCV to load,
 * then enables the file input and sets up the event listener.
 */
function initialize() {
    const initializeInterval = setInterval(() => {
        if (typeof cv !== 'undefined') {
            clearInterval(initializeInterval);
            setStatus('Ready! Please upload an image.');
            const fileInput = document.getElementById('fileInput');
            if (fileInput) {
                fileInput.disabled = false;
                fileInput.addEventListener('change', handleImageUpload);
            }
        }
    }, 100);
}

// Start the initialization process for the non-debug workflow.
// initialize(); // This is commented out to prevent errors in the debugger.

/**
 * Handles the file input 'change' event. Reads the selected image
 * and triggers the main processing workflow.
 * @param {Event} event - The file input change event.
 */
function handleImageUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        const img = new Image();
        img.onload = async () => {
            try {
                const canvas = document.getElementById('outputCanvas');
                const ctx = canvas.getContext('2d', { willReadFrequently: true });

                canvas.width = img.width;
                canvas.height = img.height;
                ctx.drawImage(img, 0, 0);
    
                const cornerPixel = ctx.getImageData(0, 0, 1, 1).data;
                const isWhiteBackground = cornerPixel[0] > 200 && cornerPixel[1] > 200 && cornerPixel[2] > 200;
                const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                if (isWhiteBackground) {
                    const data = imageData.data;
                    for (let i = 0; i < data.length; i += 4) {
                        data[i] = 255 - data[i];
                        data[i+1] = 255 - data[i+1];
                        data[i+2] = 255 - data[i+2];
                    }
                }
    
                await processFullWorkflow(img, imageData);
            } catch (error) {
                console.error("An unexpected error occurred in the workflow:", error);
                setStatus(`An unexpected error occurred: ${error.message}`, true);
            }
        };
        img.onerror = () => {
            setStatus('Could not load the selected file. It may not be a valid image.', true);
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
}

/**
 * Entry point for debug.html to run the filter with a pre-detected grid.
 * This function should be called from outside this script.
 * @param {HTMLImageElement} originalImage - The original image element.
 * @param {object} grid - The pre-detected grid object from gridDetector.
 */
window.runDurabilityFilterWithGrid = async (originalImage, grid) => {
    try {
        if (!originalImage || !grid) {
            setStatus('Debug Error: Image or grid data is missing.', true);
            return;
        }

        const canvas = document.getElementById('outputCanvas');
        const ctx = canvas.getContext('2d', { willReadFrequently: true });

        canvas.width = originalImage.width;
        canvas.height = originalImage.height;
        ctx.drawImage(originalImage, 0, 0);
    
    
        const cornerPixel = ctx.getImageData(0, 0, 1, 1).data;
        const isWhiteBackground = cornerPixel[0] > 200 && cornerPixel[1] > 200 && cornerPixel[2] > 200;
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        if (isWhiteBackground) {
            const data = imageData.data;
            for (let i = 0; i < data.length; i += 4) {
                data[i] = 255 - data[i];
                data[i + 1] = 255 - data[i + 1];
                data[i + 2] = 255 - data[i + 2];
            }
        }
    
        await processFullWorkflow(originalImage, imageData, grid);

    } catch (error) {
        console.error("An unexpected error occurred in the debug workflow:", error);
        setStatus(`An unexpected error occurred: ${error.message}`, true);
    }
};


/**
 * The main workflow orchestrator.
 * @param {HTMLImageElement} originalImage - The original, unmodified image element.
 * @param {ImageData} sourceImageData - The initial, inverted-if-needed image data.
 * @param {object|null} precomputedGrid - An optional, pre-detected grid object.
 */
async function processFullWorkflow(originalImage, sourceImageData, grid = null) {
    if (!originalImage || !sourceImageData) {
        setStatus('Image data not loaded properly.', true);
        return;
    }
    
    const cleanSourceImageData = new ImageData(
        new Uint8ClampedArray(sourceImageData.data),
        sourceImageData.width,
        sourceImageData.height
    );
    
    const resultsInfoEl = document.getElementById('results-info');
    const gridContainer = document.getElementById('starbattle-grid-container');

    if(gridContainer) gridContainer.style.display = 'none';
    setStatus('Step 1: Analyzing grid structure...');
    if(resultsInfoEl) resultsInfoEl.textContent = '';


    if (!grid || !grid.gridSize) {
        setStatus('Could not determine grid size. Please try another image.', true);
        return;
    }

    const targetRegionCount = grid.gridSize;
    setStatus(`Step 1 Complete: Target is ${targetRegionCount} regions (from ${targetRegionCount}x${targetRegionCount} grid).`);

    if (!grid.hGridLines || grid.hGridLines.length < 2 || !grid.vGridLines || grid.vGridLines.length < 2) {
        setStatus('Error: Grid line data from detector is incomplete. Cannot crop image.', true);
        return;
    }

    setStatus('Step 1.5: Cropping image to grid boundaries...');

    const x = Math.floor(grid.vGridLines[0]);
    const y = Math.floor(grid.hGridLines[0]);
    const cropWidth = Math.ceil(grid.vGridLines[grid.vGridLines.length - 1] - x);
    const cropHeight = Math.ceil(grid.hGridLines[grid.hGridLines.length - 1] - y);

    if (cropWidth <= 0 || cropHeight <= 0) {
        setStatus('Error: Invalid crop dimensions calculated from grid lines.', true);
        return;
    }

    const tempCanvas = document.createElement('canvas');
    const tempCtx = tempCanvas.getContext('2d');
    tempCanvas.width = originalImage.width;
    tempCanvas.height = originalImage.height;
    tempCtx.putImageData(cleanSourceImageData, 0, 0);
    const croppedImageData = tempCtx.getImageData(x, y, cropWidth, cropHeight);

    const canvas = document.getElementById('outputCanvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    canvas.width = cropWidth;
    canvas.height = cropHeight;
    ctx.putImageData(croppedImageData, 0, 0);

    const optimalConfig = await findOptimalConfiguration(croppedImageData, targetRegionCount, cropWidth, cropHeight);

    if (optimalConfig) {
        setStatus('Step 3: Generating final regions and grid...');
        if(resultsInfoEl) resultsInfoEl.textContent = `Success! Found ${targetRegionCount} regions at brightness ${optimalConfig.brightness}${optimalConfig.usedBlur ? ' (with 1px blur)' : ''}.`;
        
        const outputCanvas = document.getElementById('outputCanvas');
        const outputCtx = outputCanvas.getContext('2d');
        const borderSize = 2;

        outputCanvas.width = cropWidth + (borderSize * 2);
        outputCanvas.height = cropHeight + (borderSize * 2);

        outputCtx.fillStyle = 'black';
        outputCtx.fillRect(0, 0, outputCanvas.width, outputCanvas.height);
        outputCtx.putImageData(optimalConfig.finalImageData, borderSize, borderSize);
        
        generateStarbattleGrid(targetRegionCount, optimalConfig.cellOwnerMap);
        setStatus('Process Complete! ✅');
    } else {
        setStatus(`Failed: Could not find a valid puzzle layout, even with a blur.`, true);
        const outputCanvas = document.getElementById('outputCanvas');
        const outputCtx = outputCanvas.getContext('2d');
        outputCanvas.width = originalImage.width;
        outputCanvas.height = originalImage.height;
        outputCtx.drawImage(originalImage, 0, 0);
    }
}

function detectGridAndGetTarget(image) {
    let srcMat;
    try {
        srcMat = cv.imread(image);
        const grid = detectGridFromContours(srcMat);
        if (grid && grid.gridSize) {
            const gridDimension = grid.gridSize;
            setStatus(`Step 1 Complete: Target is ${gridDimension} regions (from ${gridDimension}x${gridDimension} grid).`);
            return gridDimension;
        }
        setStatus('Could not determine grid size. Please try another image.', true);
        return 0;
    } catch (e) {
        setStatus(`Error in grid detection: ${e.message}`, true);
        return 0;
    } finally {
        if (srcMat) srcMat.delete();
    }
}
 
/**
 * Searches for a valid puzzle configuration.
 * @param {ImageData} initialImageData
 * @param {number} targetRegionCount
 * @param {number} canvasWidth
 * @param {number} canvasHeight
 * @returns {Promise<object|null>}
 */
async function findOptimalConfiguration(initialImageData, targetRegionCount, canvasWidth, canvasHeight) {
    const startOffset = 120; 

    setStatus('Step 2: Finding optimal brightness (Pass 1/2)...');
    let config = await runBrightnessSearch(initialImageData, targetRegionCount, false, canvasWidth, canvasHeight, startOffset);
    if (config) return { ...config, usedBlur: false };
 
    setStatus('Pass 1 failed. Retrying with 1px blur (Pass 2/2)...');

    const canvas = document.getElementById('outputCanvas');
    const ctx = canvas.getContext('2d');
    canvas.width = canvasWidth;
    canvas.height = canvasHeight;
    ctx.putImageData(initialImageData, 0, 0);
    ctx.filter = 'blur(1px)';
    ctx.drawImage(canvas, 0, 0);
    ctx.filter = 'none';
    const blurredImageData = ctx.getImageData(0, 0, canvasWidth, canvasHeight);
    
    config = await runBrightnessSearch(blurredImageData, targetRegionCount, true, canvasWidth, canvasHeight, startOffset);
    if (config) return { ...config, usedBlur: true };
 
    return null;
}
 
/**
 * Runs the core loop that iterates through brightness levels with an offset.
 * @param {ImageData} imageData
 * @param {number} targetRegionCount
 * @param {boolean} isBlurredPass
 * @param {number} canvasWidth
 * @param {number} canvasHeight
 * @param {number} [startOffset=0] - The brightness value to start the search from.
 * @returns {Promise<object|null>}
 */
async function runBrightnessSearch(imageData, targetRegionCount, isBlurredPass, canvasWidth, canvasHeight, startOffset = 0) {
    for (let i = 0; i <= MAX_BRIGHTNESS_SEARCH; i++) {
        const brightness = (startOffset + i) % (MAX_BRIGHTNESS_SEARCH + 1);
        
        const { count, regionMap, finalImageData } = processImageForRegionCount(imageData, brightness, true, canvasWidth, canvasHeight);
        
        setStatus(`Testing Brightness (Pass ${isBlurredPass ? 2 : 1}): ${brightness}... Regions Found: ${count} / Target: ${targetRegionCount}`);
        
        if (count === targetRegionCount) {
            const cellOwnerMap = createCellOwnerMap(targetRegionCount, regionMap, canvasWidth, canvasHeight);
            if (looseGridValidation(targetRegionCount, cellOwnerMap)) {
                return { brightness, regionMap, cellOwnerMap, finalImageData };
            }
        }
    }
    return null;
}
 
function createCellOwnerMap(gridSize, regionMap, imgWidth, imgHeight) {
    const cellWidth = imgWidth / gridSize;
    const cellHeight = imgHeight / gridSize;
    const cellOwnerMap = Array.from({ length: gridSize }, () => Array(gridSize).fill(0));
    
    for (let row = 0; row < gridSize; row++) {
        for (let col = 0; col < gridSize; col++) {
            const regionVotes = {};
            let dominantRegion = 0;
            let maxVotes = 0;

            // Sample 25 points within each cell to determine its region
            for (let i = 1; i <= 5; i++) {
                for (let j = 1; j <= 5; j++) {
                    const sampleX = Math.floor((col + i / 6) * cellWidth);
                    const sampleY = Math.floor((row + j / 6) * cellHeight);

                    if (sampleY < imgHeight && sampleX < imgWidth) {
                        const regionId = regionMap[sampleY][sampleX];
                        if(regionId > 0) {
                            regionVotes[regionId] = (regionVotes[regionId] || 0) + 1;
                        }
                    }
                }
            }
            
            for (const regionId in regionVotes) {
                if (regionVotes[regionId] > maxVotes) {
                    maxVotes = regionVotes[regionId];
                    dominantRegion = parseInt(regionId);
                }
            }
            cellOwnerMap[row][col] = dominantRegion;
        }
    }
    return cellOwnerMap;
}
 
function generateStarbattleGrid(gridSize, cellOwnerMap) {
    const gridContainer = document.getElementById('starbattle-grid');
    const containerWrapper = document.getElementById('starbattle-grid-container');
    if (!gridContainer || !containerWrapper || !cellOwnerMap || !gridSize) return;

    gridContainer.innerHTML = '';
    gridContainer.style.gridTemplateColumns = `repeat(${gridSize}, 1fr)`;
    gridContainer.style.gridTemplateRows = `repeat(${gridSize}, 1fr)`;
    
    for (let row = 0; row < gridSize; row++) {
        for (let col = 0; col < gridSize; col++) {
            const cell = document.createElement('div');
            cell.className = 'grid-cell';
            
            const currentOwner = cellOwnerMap[row][col];

            if (row < gridSize - 1) {
                const bottomOwner = cellOwnerMap[row + 1][col];
                if (currentOwner !== bottomOwner) {
                    cell.classList.add('region-border-bottom');
                }
            }

            if (col < gridSize - 1) {
                const rightOwner = cellOwnerMap[row][col + 1];
                if (currentOwner !== rightOwner) {
                    cell.classList.add('region-border-right');
                }
            }
            
            gridContainer.appendChild(cell);
        }
    }
    
    containerWrapper.style.display = 'block';
}

 
function detectGridFromContours(srcMat) {
    let gray = new cv.Mat();
    let edges = new cv.Mat();
    let contours = new cv.MatVector();
    let hierarchy = new cv.Mat();
    try {
        cv.cvtColor(srcMat, gray, cv.COLOR_RGBA2GRAY, 0);
        cv.GaussianBlur(gray, gray, new cv.Size(5, 5), 0);
        cv.Canny(gray, edges, 60, 120, 3);
        cv.findContours(edges, contours, hierarchy, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE);
        const { hLines, vLines } = getLinesFromContours(contours, srcMat.cols * 0.05);
        return findGridFromClusters(hLines, vLines, gray.rows, gray.cols);
    } finally {
        gray.delete(); edges.delete(); contours.delete(); hierarchy.delete();
    }
}

function getLinesFromContours(contours, minLength) {
    if (contours.size() > MAX_DATA_POINTS) {
        console.error("Exceeded maximum contour analysis points.");
        return { hLines: [], vLines: [] };
    }
    const hLines = [], vLines = [];
    const angleTol = Math.PI / 18;
    for (let i = 0; i < contours.size(); i++) {
        const contour = contours.get(i);
        let approx = new cv.Mat();
        cv.approxPolyDP(contour, approx, 0.01 * cv.arcLength(contour, true), true);
        for (let j = 0; j < approx.rows - 1; j++) {
            const p1 = { x: approx.data32S[j * 2], y: approx.data32S[j * 2 + 1] };
            const p2 = { x: approx.data32S[(j + 1) * 2], y: approx.data32S[(j + 1) * 2 + 1] };
            const length = Math.hypot(p2.x - p1.x, p2.y - p1.y);
            if (length < minLength) continue;
            const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x);
            if (Math.abs(angle) < angleTol) hLines.push((p1.y + p2.y) / 2);
            else if (Math.abs(angle - Math.PI / 2) < angleTol || Math.abs(angle + Math.PI / 2) < angleTol) vLines.push((p1.x + p2.x) / 2);
        }
        approx.delete();
    }
    const merge = (arr, mergeThreshold = 10) => {
        if (arr.length < 2) return arr;
        arr.sort((a, b) => a - b);
        const merged = [];
        let currentGroup = [arr[0]];
        for (let i = 1; i < arr.length; i++) {
            if (arr[i] - arr[i - 1] > mergeThreshold) {
                merged.push(currentGroup.reduce((a, b) => a + b, 0) / currentGroup.length);
                currentGroup = [arr[i]];
            } else {
                currentGroup.push(arr[i]);
            }
        }
        merged.push(currentGroup.reduce((a, b) => a + b, 0) / currentGroup.length);
        return merged;
    };
    return { hLines: merge(hLines), vLines: merge(vLines) };
}

function findGridFromClusters(hLines, vLines, imgHeight, imgWidth) {
    if (hLines.length > MAX_DATA_POINTS || vLines.length > MAX_DATA_POINTS) {
        console.error("Exceeded maximum line analysis points.");
        return null;
    }
    const buildFullGrid = (lines, imageDim) => {
        if (lines.length < 2) return null;
        const deltas = {};
        for (let i = 1; i < lines.length; i++) {
            const delta = Math.round(lines[i] - lines[i - 1]);
            if (delta > 10) deltas[delta] = (deltas[delta] || 0) + 1;
        }
        if (Object.keys(deltas).length === 0) return null;
        const commonDelta = parseInt(Object.keys(deltas).reduce((a, b) => deltas[a] > deltas[b] ? a : b));
        const tolerance = commonDelta * 0.35;
        let bestSequence = [];
        for (let i = 0; i < lines.length; i++) {
            let currentSequence = [lines[i]];
            let lastLine = lines[i];
            for (let j = i + 1; j < lines.length; j++) {
                if (Math.abs((lines[j] - lastLine) - commonDelta) < tolerance) {
                    currentSequence.push(lines[j]);
                    lastLine = lines[j];
                }
            }
            if (currentSequence.length > bestSequence.length) bestSequence = currentSequence;
        }
        if (bestSequence.length < 2) return null;
        const preciseDelta = (bestSequence[bestSequence.length - 1] - bestSequence[0]) / (bestSequence.length - 1);
        if (isNaN(preciseDelta) || preciseDelta < 10) return null;
        const snapTolerance = preciseDelta * 0.4;
        let firstLine = bestSequence[0];
        while ((firstLine - preciseDelta) > -preciseDelta / 2) firstLine -= preciseDelta;
        const fullGridLines = [];
        const usedLines = new Set();
        for (let theoreticalPos = firstLine; theoreticalPos < imageDim + preciseDelta / 2; theoreticalPos += preciseDelta) {
            let bestSnapLine = theoreticalPos;
            let minDiff = snapTolerance;
            for (const detectedLine of lines) {
                if (usedLines.has(detectedLine)) continue;
                const diff = Math.abs(detectedLine - theoreticalPos);
                if (diff < minDiff) { minDiff = diff; bestSnapLine = detectedLine; }
            }
            if (bestSnapLine !== theoreticalPos) usedLines.add(bestSnapLine);
            if (bestSnapLine >= 0 && bestSnapLine <= imageDim) fullGridLines.push(bestSnapLine);
        }
        if (fullGridLines.length < 3) return null;
        return { lines: fullGridLines, count: fullGridLines.length };
    };
    const hGrid = buildFullGrid(hLines, imgHeight);
    const vGrid = buildFullGrid(vLines, imgWidth);
    if (!hGrid || !vGrid) return null;
    const gridSize = Math.round((hGrid.count - 1 + vGrid.count - 1) / 2);
    if (gridSize < 3) return null;
    return { gridSize };
}

/**
 * Builds a map of region data (cells, bounds) from the cell owner map.
 * @param {number} n - The grid size.
 * @param {Array<Array<number>>} cellOwnerMap - The map of cell owners.
 * @returns {{regionData: Map, assignedCellCount: number}}
 */
function buildRegionDataMap(n, cellOwnerMap) {
    const regionData = new Map();
    let assignedCellCount = 0;
    for (let r = 0; r < n; r++) {
        for (let c = 0; c < n; c++) {
            const regionId = cellOwnerMap[r][c];
            if (regionId > 0) {
                assignedCellCount++;
                if (!regionData.has(regionId)) {
                    regionData.set(regionId, {
                        cells: [], minRow: n, maxRow: -1, minCol: n, maxCol: -1
                    });
                }
                const data = regionData.get(regionId);
                data.cells.push({ r, c });
                data.minRow = Math.min(data.minRow, r);
                data.maxRow = Math.max(data.maxRow, r);
                data.minCol = Math.min(data.minCol, c);
                data.maxCol = Math.max(data.maxCol, c);
            }
        }
    }
    return { regionData, assignedCellCount };
}

/**
 * Checks if a single region is contiguous using a breadth-first search.
 * @param {number} regionId - The ID of the region to check.
 * @param {object} data - The data object for the region.
 * @param {Array<Array<number>>} cellOwnerMap - The map of cell owners.
 * @param {number} n - The grid size.
 * @returns {boolean} - True if the region is contiguous.
 */
function isRegionContiguous(regionId, data, cellOwnerMap, n) {
    if (data.cells.length === 0) return true;
    const queue = [data.cells[0]];
    const visited = new Set([`${queue[0].r},${queue[0].c}`]);
    let head = 0;
    
    while (head < queue.length && head < MAX_BFS_ITERATIONS) {
        const { r, c } = queue[head++];
        const neighbors = [{r: r + 1, c}, {r: r - 1, c}, {r, c: c + 1}, {r, c: c - 1}];
        for (const neighbor of neighbors) {
            const key = `${neighbor.r},${neighbor.c}`;
            if (neighbor.r >= 0 && neighbor.r < n && neighbor.c >= 0 && neighbor.c < n &&
                !visited.has(key) && cellOwnerMap[neighbor.r][neighbor.c] === regionId) {
                visited.add(key);
                queue.push(neighbor);
            }
        }
    }
    if (head >= MAX_BFS_ITERATIONS) {
        console.error(`Validation Fail: BFS for region ${regionId} exceeded max iterations.`);
        return false;
    }
    return visited.size === data.cells.length;
}

/**
 * Checks that no row or column has too many single-dimension regions.
 * @param {Map} regionData - The map of all region data.
 * @param {number} n - The grid size.
 * @returns {boolean} - True if the shape constraints are met.
 */
function checkRegionShapeValidity(regionData, n) {
    const k = Math.trunc(Math.trunc((n * n) / 4) / n);
    if (k < 1) return false;

    const flatRegionsInRow = Array(n).fill(0);
    const thinRegionsInCol = Array(n).fill(0);

    for (const data of regionData.values()) {
        if (data.minRow === data.maxRow) flatRegionsInRow[data.minRow]++;
        if (data.minCol === data.maxCol) thinRegionsInCol[data.minCol]++;
    }

    for (let i = 0; i < n; i++) {
        if (flatRegionsInRow[i] > k || thinRegionsInCol[i] > k) {
            console.error(`Validation Fail: Row/Col ${i} has too many flat/thin regions.`);
            return false;
        }
    }
    return true;
}

/**
 * Performs a loose validation of the grid structure to see if it's plausible.
 * @param {number} n - The grid size.
 * @param {Array<Array<number>>} cellOwnerMap - Map of cell owners.
 * @returns {boolean} - True if the grid seems valid.
 */
function looseGridValidation(n, cellOwnerMap) {
    const { regionData, assignedCellCount } = buildRegionDataMap(n, cellOwnerMap);

    if (assignedCellCount !== n * n || regionData.size !== n) {
        console.error(`Validation Fail: Incorrect cell assignment or region count.`);
        return false;
    }

    for (const [regionId, data] of regionData.entries()) {
        if (!isRegionContiguous(regionId, data, cellOwnerMap, n)) {
            console.error(`Validation Fail: Region ${regionId} is not contiguous.`);
            return false;
        }
    }

    if (!checkRegionShapeValidity(regionData, n)) {
        return false;
    }

    return true;
}
 
function processImageForRegionCount(baseImageData, brightnessValue, enhanceBorder, canvasWidth, canvasHeight) {
    if (!baseImageData) return { finalImageData: null, count: 0, regionMap: null };

    const workingImageData = new ImageData(
        new Uint8ClampedArray(baseImageData.data),
        baseImageData.width,
        baseImageData.height
    );
    const data = workingImageData.data;
    const brightness = brightnessValue - 100;

    for (let i = 0; i < data.length; i += 4) {
        data[i] += brightness; data[i + 1] += brightness; data[i + 2] += brightness;
    }
    for (let i = 0; i < data.length; i += 4) {
        const luminance = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
        const value = luminance > 128 ? 255 : 0;
        data[i] = data[i + 1] = data[i + 2] = value;
    }

    let finalImageData = workingImageData;
    if (enhanceBorder) {
        const canvas = document.getElementById('outputCanvas');
        const ctx = canvas.getContext('2d');

        canvas.width = canvasWidth;
        canvas.height = canvasHeight;

        ctx.putImageData(workingImageData, 0, 0);
        ctx.filter = 'blur(1px)';
        ctx.drawImage(canvas, 0, 0);
        ctx.filter = 'none';
        const blurredImageData = ctx.getImageData(0, 0, canvasWidth, canvasHeight);
        const blurredData = blurredImageData.data;
        for (let i = 0; i < blurredData.length; i += 4) {
            const r = blurredData[i] - 100, g = blurredData[i + 1] - 100, b = blurredData[i + 2] - 100;
            const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
            const finalValue = luminance > 128 ? 255 : 0;
            blurredData[i] = blurredData[i + 1] = blurredData[i + 2] = finalValue;
        }
        finalImageData = blurredImageData;
    }
    
    const { count, regionMap } = mapAndCountRegions(finalImageData);
    return { finalImageData, count, regionMap };
}
 
function mapAndCountRegions(imageData) {
    const { width, height, data } = imageData;
    const visited = Array.from({ length: height }, () => Array(width).fill(false));
    const regionMap = Array.from({ length: height }, () => Array(width).fill(0));
    let regionCount = 0;
    const isWhite = (x, y) => {
        if (x < 0 || x >= width || y < 0 || y >= height) return false;
        return data[(y * width + x) * 4] > 200;
    };
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            if (isWhite(x, y) && !visited[y][x]) {
                regionCount++;
                const queue = [[x, y]];
                visited[y][x] = true;
                regionMap[y][x] = regionCount;
                let iterations = 0;
                while (queue.length > 0 && iterations < MAX_BFS_ITERATIONS) {
                    iterations++;
                    const [cx, cy] = queue.shift();
                    const neighbors = [[cx, cy - 1], [cx, cy + 1], [cx - 1, cy], [cx + 1, cy]];
                    for (const [nx, ny] of neighbors) {
                        if (isWhite(nx, ny) && !visited[ny][nx]) {
                            visited[ny][nx] = true;
                            regionMap[ny][nx] = regionCount;
                            queue.push([nx, ny]);
                        }
                    }
                }
            }
        }
    }
    return { count: regionCount, regionMap };
}