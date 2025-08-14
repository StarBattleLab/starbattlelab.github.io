/**
 * enhanceRegionsByColor.js
 * 
 * Author: Isaiah Tadrous
 * Version: 1.0.0
 * 
 * Description:
 * This script provides functionality to clear obstructions at the center of cells in a starbattles grid, enhancing the separation between distinct cells and improving connections between similar cells. This targeted manipulation helps refine cell boundaries and reduce errors caused by notation, ensuring more accurate grid interpretation.
 * 
 * Prerequisites:
 * 1. The script must be included as a module in your HTML file. To do so, use the following tag:
 *    <script type="module" src="path/to/enhanceRegionsByColor.js"></script>
 * 
 * 2. OpenCV.js must be loaded globally in the HTML file *before* calling the exported function. This can be done with the following script tag:
 *    <script async src="https://docs.opencv.org/4.x/opencv.js"></script>
 * 
 * Note: Ensure that OpenCV.js is fully loaded and initialized before using this module.
 * 
 * Example Usage:
 * 
 * 1. Import the module in your JavaScript code:
 *    import { enhanceRegionsByColor } from './path/to/enhanceRegionsByColor.js';
 * 
 * 2. Call the function with appropriate parameters once OpenCV.js is initialized.
 */

/**
 * Utility function to ensure OpenCV.js is properly loaded and initialized.
 * This is critical for preventing runtime errors when attempting to use cv functions.
 * 
 * @returns {Promise<void>} Promise that resolves when OpenCV.js is ready for use
 */
function cvReady() {
    return new Promise(resolve => {
        const check = () => {
            if (typeof cv !== 'undefined' && cv.imread) {
                resolve();
            } else {
                setTimeout(check, 100);
            }
        };
        check();
    });
}

/**
 * Parses an RGB color string (format: "rgb(r, g, b)") into a structured object.
 * Essential for color manipulation and comparison operations throughout the pipeline.
 * 
 * @param {string} rgbString - The RGB color string to parse
 * @returns {Object} Object containing r, g, b properties as numbers (0-255)
 */
const parseRgb = (rgbString) => {
    const result = rgbString.match(/\d+/g).map(Number);
    return { r: result[0], g: result[1], b: result[2] };
};

/**
 * Calculates Euclidean distance between two RGB colors in 3D color space.
 * This metric is fundamental for determining color similarity and driving
 * decisions about cell boundary placement and connection drawing.
 * 
 * @param {Object} color1 - First color object with r, g, b properties
 * @param {Object} color2 - Second color object with r, g, b properties
 * @returns {number} Euclidean distance between the two colors
 */
const colorDifference = (color1, color2) => {
    const dr = color1.r - color2.r;
    const dg = color1.g - color2.g;
    const db = color1.b - color2.b;
    return Math.sqrt(dr * dr + dg * dg + db * db);
};

/**
 * Converts RGB color values to HSL (Hue, Saturation, Lightness) color space.
 * HSL provides better control over color properties, particularly saturation
 * manipulation for enhanced color detection and processing.
 * 
 * @param {number} r - Red component (0-255)
 * @param {number} g - Green component (0-255) 
 * @param {number} b - Blue component (0-255)
 * @returns {Array<number>} Array containing [hue, saturation, lightness] values (0-1)
 */
function rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h, s, l = (max + min) / 2;

    if (max === min) {
        h = s = 0; 
    } else {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch (max) {
            case r: h = (g - b) / d + (g < b ? 6 : 0); break;
            case g: h = (b - r) / d + 2; break;
            case b: h = (r - g) / d + 4; break;
        }
        h /= 6;
    }
    return [h, s, l];
}

/**
 * Converts HSL color values back to RGB color space.
 * Essential companion function to rgbToHsl, enabling round-trip color
 * space conversions for advanced color processing operations.
 * 
 * @param {number} h - Hue value (0-1)
 * @param {number} s - Saturation value (0-1)
 * @param {number} l - Lightness value (0-1)
 * @returns {Array<number>} Array containing [red, green, blue] values (0-255)
 */
function hslToRgb(h, s, l) {
    let r, g, b;
    if (s === 0) {
        r = g = b = l;
    } else {
        const hue2rgb = (p, q, t) => {
            if (t < 0) t += 1;
            if (t > 1) t -= 1;
            if (t < 1/6) return p + (q - p) * 6 * t;
            if (t < 1/2) return q;
            if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
            return p;
        };
        const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
        const p = 2 * l - q;
        r = hue2rgb(p, q, h + 1/3);
        g = hue2rgb(p, q, h);
        b = hue2rgb(p, q, h - 1/3);
    }
    return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

/**
 * Analyzes a cell matrix to determine the most frequently occurring color.
 * Uses color quantization to group similar colors and reduce noise impact.
 * This is critical for reliable cell color identification in the presence
 * of artifacts, compression, or minor color variations.
 * 
 * @param {cv.Mat} cellMat - OpenCV matrix representing a single cell region
 * @returns {string} RGB string representation of the dominant color
 */
function findMostFrequentColor(cellMat) {
    const colorCounts = new Map();
    const quantizationFactor = 32; // Reduces 256 color levels to 8 levels per channel
    const height = cellMat.rows;
    const width = cellMat.cols;

    // Iterate through every pixel in the cell to build color frequency histogram
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const pixel = cellMat.ucharPtr(y, x);
            const r = pixel[0];
            const g = pixel[1];
            const b = pixel[2];

            // Quantize color values to reduce noise and group similar colors
            const qr = Math.floor(r / quantizationFactor);
            const qg = Math.floor(g / quantizationFactor);
            const qb = Math.floor(b / quantizationFactor);
            
            const key = `${qr},${qg},${qb}`;
            colorCounts.set(key, (colorCounts.get(key) || 0) + 1);
        }
    }

    // Handle edge case of empty cell matrix
    if (colorCounts.size === 0) {
        return 'rgb(128, 128, 128)';
    }

    // Find the most frequent quantized color
    let maxCount = 0;
    let dominantKey = '';
    for (const [key, count] of colorCounts.entries()) {
        if (count > maxCount) {
            maxCount = count;
            dominantKey = key;
        }
    }

    // Convert quantized color back to full RGB range with center-of-bin reconstruction
    const [qr, qg, qb] = dominantKey.split(',').map(Number);
    let r = Math.round(Math.min(255, qr * quantizationFactor + (quantizationFactor / 2)));
    let g = Math.round(Math.min(255, qg * quantizationFactor + (quantizationFactor / 2)));
    let b = Math.round(Math.min(255, qb * quantizationFactor + (quantizationFactor / 2)));

    return `rgb(${r}, ${g}, ${b})`;
}

/**
 * Comprehensive cell analysis function that extracts color information and prepares
 * cell centers for rendering operations. Performs sophisticated color processing
 * including saturation enhancement and Gaussian blur for noise reduction.
 * 
 * @param {Object} grid - Grid structure containing boundary line coordinates
 * @param {cv.Mat} originalMat - Original unprocessed image matrix
 * @param {cv.Mat} processedSrcMat - Contrast-adjusted source matrix for analysis
 * @param {number} shrinkFactor - Factor for reducing cell size during center clearing
 * @param {CanvasRenderingContext2D} ctx - Canvas context for drawing operations
 * @returns {Object} Object containing cellColors and cellCenters arrays
 */
function calculateCellData(grid, originalMat, processedSrcMat, shrinkFactor, ctx) {
    const cellColors = [];
    const cellCenters = [];
    const gridSize = grid.gridSize;

    // Process each cell in the grid systematically
    for (let i = 0; i < gridSize; i++) {
        const rowColors = [];
        const rowCenters = [];
        for (let j = 0; j < gridSize; j++) {
            // Calculate precise cell boundaries from grid line coordinates
            const x = Math.round(grid.vGridLines[j]);
            const y = Math.round(grid.hGridLines[i]);
            const width = Math.round(grid.vGridLines[j + 1] - x);
            const height = Math.round(grid.hGridLines[i + 1] - y);
            const rect = new cv.Rect(x, y, width, height);

            // Initialize default colors for error cases
            let dominantLogicColor = 'rgb(128, 128, 128)';
            let dominantDisplayColor = 'rgb(128, 128, 128)';

            // Process valid cell regions only
            if (width > 0 && height > 0) {
                let cellMat, saturatedCellMat, blurredMat;
                try {
                    // Extract cell region for analysis
                    cellMat = processedSrcMat.roi(rect);
                    saturatedCellMat = cellMat.clone();
                    
                    // Apply saturation enhancement to improve color discrimination
                    for (let r = 0; r < saturatedCellMat.rows; r++) {
                        for (let c = 0; c < saturatedCellMat.cols; c++) {
                            const pixel = saturatedCellMat.ucharPtr(r, c);
                            const [h, s, l] = rgbToHsl(pixel[0], pixel[1], pixel[2]);
                            const boostedS = Math.min(1, s * 2.0); // Double saturation with clipping
                            const [newR, newG, newB] = hslToRgb(h, boostedS, l);
                            pixel[0] = newR; pixel[1] = newG; pixel[2] = newB;
                        }
                    }
                    
                    // Apply Gaussian blur to reduce noise impact on color detection
                    blurredMat = new cv.Mat();
                    cv.GaussianBlur(saturatedCellMat, blurredMat, new cv.Size(5, 5), 0, 0, cv.BORDER_DEFAULT);
                    dominantLogicColor = findMostFrequentColor(blurredMat);
                } finally {
                    // Ensure proper memory cleanup to prevent leaks
                    if (cellMat) cellMat.delete();
                    if (saturatedCellMat) saturatedCellMat.delete();
                    if (blurredMat) blurredMat.delete();
                }

                // Extract display color from original unprocessed image
                let originalCellMat;
                try {
                    originalCellMat = originalMat.roi(rect);
                    dominantDisplayColor = findMostFrequentColor(originalCellMat);
                } finally {
                    if(originalCellMat) originalCellMat.delete();
                }
            }

            // Calculate shrunken cell dimensions for center clearing operation
            const newWidth = width * shrinkFactor;
            const newHeight = height * shrinkFactor;
            const newX = x + (width - newWidth) / 2;
            const newY = y + (height - newHeight) / 2;
            
            // Clear cell center with white fill to remove obstructions
            ctx.fillStyle = 'white';
            ctx.fillRect(newX, newY, newWidth, newHeight);

            // Store processed results for subsequent rendering operations
            rowColors.push(parseRgb(dominantLogicColor));
            rowCenters.push({ x: newX + newWidth / 2, y: newY + newHeight / 2 });
        }
        cellColors.push(rowColors);
        cellCenters.push(rowCenters);
    }
    return { cellColors, cellCenters };
}

/**
 * Renders black borders between cells with significantly different colors.
 * Uses adaptive line width based on canvas size and extends borders slightly
 * beyond cell boundaries for visual continuity. Critical for defining
 * distinct region boundaries in the enhanced output.
 * 
 * @param {Object} grid - Grid structure with line coordinate arrays
 * @param {Array<Array<Object>>} cellColors - 2D array of cell color objects
 * @param {CanvasRenderingContext2D} ctx - Canvas rendering context
 */
function drawBlackBorders(grid, cellColors, ctx) {
    const differenceThreshold = 92; // Empirically determined optimal threshold
    ctx.strokeStyle = 'black';
    ctx.lineWidth = Math.max(4, ctx.canvas.width / 300); // Responsive line width
    
    // Calculate border extension for visual continuity
    const avgCellSize = grid.vGridLines[1] - grid.vGridLines[0];
    const extension = avgCellSize * 0.2;

    // Process all cell pairs for border determination
    for (let i = 0; i < cellColors.length; i++) {
        for (let j = 0; j < cellColors[i].length; j++) {
            // Check horizontal adjacency (current cell vs. right neighbor)
            if (j < cellColors[i].length - 1) {
                if (colorDifference(cellColors[i][j], cellColors[i][j + 1]) > differenceThreshold) {
                    const lineX = grid.vGridLines[j + 1];
                    ctx.beginPath();
                    ctx.moveTo(lineX, grid.hGridLines[i] - extension);
                    ctx.lineTo(lineX, grid.hGridLines[i + 1] + extension);
                    ctx.stroke();
                }
            }
            // Check vertical adjacency (current cell vs. bottom neighbor)
            if (i < cellColors.length - 1 && j < cellColors[i + 1].length) {
                if (colorDifference(cellColors[i][j], cellColors[i + 1][j]) > differenceThreshold) {
                    const lineY = grid.hGridLines[i + 1];
                    ctx.beginPath();
                    ctx.moveTo(grid.vGridLines[j] - extension, lineY);
                    ctx.lineTo(grid.vGridLines[j + 1] + extension, lineY);
                    ctx.stroke();
                }
            }
        }
    }
}

/**
 * Draws white connection lines between cells with similar colors to visually
 * unite regions of the same type. Uses rounded line caps for aesthetic appeal
 * and connects cell centers directly to show logical relationships.
 * 
 * @param {Object} grid - Grid structure (used for dimensional context)
 * @param {Array<Array<Object>>} cellColors - 2D array of cell color objects  
 * @param {Array<Array<Object>>} cellCenters - 2D array of cell center coordinates
 * @param {CanvasRenderingContext2D} ctx - Canvas rendering context
 */
function drawWhiteConnections(grid, cellColors, cellCenters, ctx) {
    const similarityThreshold = 15; // Tight threshold for similar color matching
    ctx.strokeStyle = 'white';
    ctx.lineWidth = Math.max(3, ctx.canvas.width / 70); // Adaptive line width
    ctx.lineCap = 'round'; // Rounded caps for polished appearance

    // Process all cell pairs for connection determination
    for (let i = 0; i < cellCenters.length; i++) {
        for (let j = 0; j < cellCenters[i].length; j++) {
            const currentCenter = cellCenters[i][j];
            console.assert(currentCenter, `Center at [${i}][${j}] is undefined.`);

            // Check horizontal connection (current cell to right neighbor)
            if (j < cellCenters[i].length - 1) {
                if (colorDifference(cellColors[i][j], cellColors[i][j + 1]) < similarityThreshold) {
                    const rightCenter = cellCenters[i][j + 1];
                    ctx.beginPath();
                    ctx.moveTo(currentCenter.x, currentCenter.y);
                    ctx.lineTo(rightCenter.x, rightCenter.y);
                    ctx.stroke();
                }
            }
            
            // Check vertical connection (current cell to bottom neighbor)
            if (i < cellCenters.length - 1 && j < cellCenters[i + 1].length) {
                if (colorDifference(cellColors[i][j], cellColors[i + 1][j]) < similarityThreshold) {
                    const belowCenter = cellCenters[i + 1][j];
                    ctx.beginPath();
                    ctx.moveTo(currentCenter.x, currentCenter.y);
                    ctx.lineTo(belowCenter.x, belowCenter.y);
                    ctx.stroke();
                }
            }
        }
    }
}

/**
 * High-level orchestration function that coordinates the complete color-based
 * region enhancement pipeline. Manages the sequence of operations from cell
 * analysis through border drawing and connection rendering.
 * 
 * @param {cv.Mat} originalMat - Original unprocessed image matrix
 * @param {cv.Mat} processedSrcMat - Contrast-adjusted source matrix
 * @param {Object} grid - Grid structure with boundary coordinates
 * @param {CanvasRenderingContext2D} ctx - Canvas rendering context
 */
function renderColorGrid(originalMat, processedSrcMat, grid, ctx) {
    console.assert(grid && grid.gridSize > 0, "Invalid grid object passed to renderColorGrid");
    const shrinkFactor = 0.7; // 70% shrinkage for center clearing
    
    // Execute the three-phase rendering pipeline
    const { cellColors, cellCenters } = calculateCellData(grid, originalMat, processedSrcMat, shrinkFactor, ctx);
    drawBlackBorders(grid, cellColors, ctx);
    drawWhiteConnections(grid, cellColors, cellCenters, ctx);
}

/**
 * Main exportable function. Processes a source image to detect a grid of regions,
 * then draws a new image highlighting those regions and their color relationships.
 * Handles both white and dark background images with automatic inversion detection.
 * 
 * @param {HTMLImageElement | HTMLCanvasElement} sourceImage The image element to process.
 * @param {HTMLCanvasElement} outputCanvas The canvas element to draw the result onto.
 * @param {Object} grid The grid structure containing boundary information
 * @returns {Promise<object>} A promise that resolves with an object containing a success flag and processing details.
 */
async function enhanceRegions(sourceImage, outputCanvas, grid) {
    await cvReady();

    const ctx = outputCanvas.getContext('2d');
    let srcMat;
    let contrastAdjustedMat;

    try {
        // Initialize OpenCV matrix from source image
        srcMat = cv.imread(sourceImage);
        outputCanvas.width = srcMat.cols;
        outputCanvas.height = srcMat.rows;
        
        // Draw initial image to canvas for background detection
        ctx.drawImage(sourceImage, 0, 0, outputCanvas.width, outputCanvas.height);
		
        // Detect white background images and apply inversion if needed
		const cornerPixel = ctx.getImageData(0, 0, 1, 1).data;
        const isWhiteBackground = cornerPixel[0] > 200 && cornerPixel[1] > 200 && cornerPixel[2] > 200;

        if (isWhiteBackground) {
            // Apply color inversion to convert white background to dark
            const imageData = ctx.getImageData(0, 0, outputCanvas.width, outputCanvas.height);
            const data = imageData.data;
            for (let i = 0; i < data.length; i += 4) {
                data[i] = 255 - data[i];     // Invert red channel
                data[i + 1] = 255 - data[i + 1]; // Invert green channel
                data[i + 2] = 255 - data[i + 2]; // Invert blue channel
                // Alpha channel (i+3) remains unchanged
            }
            ctx.putImageData(imageData, 0, 0);
            
            // Recreate OpenCV matrix from inverted canvas data
            srcMat.delete();
            srcMat = cv.imread(outputCanvas);
        }

        // Proceed with grid-based processing if valid grid provided
        if (grid) {
            // Create contrast-adjusted matrix for improved color analysis
            contrastAdjustedMat = srcMat.clone();
            for (let r = 0; r < contrastAdjustedMat.rows; r++) {
                for (let c = 0; c < contrastAdjustedMat.cols; c++) {
                    const pixel = contrastAdjustedMat.ucharPtr(r, c);
                    const [h, s, l] = rgbToHsl(pixel[0], pixel[1], pixel[2]);
                    const [newR, newG, newB] = hslToRgb(h, s, 0.5); // Normalize lightness to 50%
                    pixel[0] = newR;
                    pixel[1] = newG;
                    pixel[2] = newB;
                }
            }
            
            // Execute the complete color-based region enhancement pipeline
            renderColorGrid(srcMat, contrastAdjustedMat, grid, ctx);

            return { success: true, gridSize: grid.gridSize };
        } else {
            return { success: false, error: 'Could not reconstruct a grid from the outlines.' };
        }

    } catch (error) {
        console.error("An error occurred in enhanceRegions:", error);
        return { success: false, error: error.message };
    } finally {
        // Ensure proper cleanup of OpenCV matrices to prevent memory leaks
        if (srcMat) srcMat.delete();
        if (contrastAdjustedMat) contrastAdjustedMat.delete();
    }
}