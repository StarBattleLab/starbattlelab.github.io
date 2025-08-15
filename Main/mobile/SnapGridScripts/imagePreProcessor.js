/**
 * imagePreProcessor.js
 * 
 * Author: Isaiah Tadrous
 * Version: 1.0.0
 * 
 * Description:
 * This library contains pure functions for comprehensive image processing and puzzle recognition.
 * It does not interact with the DOM directly and provides a passive interface for image analysis,
 * shape detection, intelligent cropping, and color correction operations. The library is specifically
 * designed for processing puzzle images with automated background detection and intelligent
 * boundary identification capabilities.
 * 
 * Prerequisites:
 * 1. The 'pica' library must be loaded globally for high-quality image resizing operations.
 *    Include it with: <script src="path/to/pica.js"></script>
 * 
 * 2. This library should be included as a passive processor that returns results rather than
 *    manipulating DOM elements directly.
 * 
 * Example Usage:
 * 
 * 1. Load and process an image file:
 *    const { fullResolutionImage, processingImage } = await PuzzleProcessor.loadImageFromFile(file, 800, statusCallback);
 * 
 * 2. Run the complete processing pipeline:
 *    const results = await PuzzleProcessor.runFullProcess({
 *        processingImage,
 *        fullResolutionImage,
 *        onStatusUpdate: statusCallback
 *    });
 */
const PuzzleProcessor = (() => {

    /**
     * High-quality image downscaling utility using the Pica library for optimal results.
     * Maintains aspect ratio while ensuring neither dimension exceeds the specified maximum.
     * Essential for creating processing-optimized versions of large images without quality loss.
     * 
     * @param {HTMLImageElement} img - The source image to be resized
     * @param {number} maxDimension - Maximum allowed width or height for the output image
     * @returns {Promise<HTMLImageElement>} Promise resolving to the resized image element
     */
    async function createFastDownscaledImage(img, maxDimension) {
        // Pica is assumed to be loaded globally.
        const picaInstance = pica();

        let targetWidth = img.width;
        let targetHeight = img.height;

        // Skip resizing if image is already within bounds
        if (targetWidth <= maxDimension && targetHeight <= maxDimension) {
            return img; // No resizing needed.
        }

        // Calculate scale ratio maintaining aspect ratio
        const scaleRatio = maxDimension / Math.max(targetWidth, targetHeight);
        targetWidth = Math.round(targetWidth * scaleRatio);
        targetHeight = Math.round(targetHeight * scaleRatio);

        // Create temporary canvas for Pica processing
        const offscreenCanvas = document.createElement('canvas');
        offscreenCanvas.width = targetWidth;
        offscreenCanvas.height = targetHeight;

        // Execute high-quality resize operation
        const result = await picaInstance.resize(img, offscreenCanvas);
        const finalImage = new Image();
        finalImage.src = result.toDataURL();
        
        // Wait for image loading completion
        await new Promise(resolve => {
            finalImage.onload = () => resolve(finalImage);
        });
        return finalImage;
    }

    /**
     * Comprehensive file loading and dual-resolution image preparation system.
     * Creates both full-resolution and processing-optimized versions of the input image.
     * Handles file validation, format verification, and asynchronous loading operations.
     * 
     * @param {File} file - The image file from an HTML input element
     * @param {number} maxDimension - Maximum dimension for the processing-optimized image
     * @param {function} onStatusUpdate - Callback function for progress reporting (receives string messages)
     * @returns {Promise<Object>} Promise resolving to { fullResolutionImage, processingImage }
     */
    async function loadImageFromFile(file, maxDimension, onStatusUpdate) {
        return new Promise((resolve, reject) => {
            // Validate input file presence
            if (!file) {
                return reject(new Error("No file provided."));
            }
            const reader = new FileReader();

            // Handle file reading errors
            reader.onerror = () => reject(new Error("Error reading file."));

            // Process file once successfully loaded
            reader.onload = (event) => {
                const tempImg = new Image();
                tempImg.onload = async () => {
                    try {
                        // Preserve original image as full resolution reference
                        const fullResolutionImage = tempImg;
                        onStatusUpdate("Downscaling image for processing...");
                        
                        // Create optimized processing version
                        const processingImage = await createFastDownscaledImage(tempImg, maxDimension);
                        resolve({ fullResolutionImage, processingImage });
                    } catch (err) {
                        reject(err);
                    }
                };
                // Handle image loading failures
                tempImg.onerror = () => reject(new Error("The selected file could not be loaded as an image."));
                tempImg.src = event.target.result;
            };
            // Initiate file reading as data URL
            reader.readAsDataURL(file);
        });
    }

    /**
     * STEP 1: Advanced image preprocessing with automatic background detection and optimization.
     * Performs luminance analysis, automatic light/dark mode detection, contrast enhancement,
     * and binary thresholding for optimal shape detection. Uses histogram analysis to determine
     * optimal processing parameters dynamically.
     * 
     * @param {HTMLImageElement} inputImage - Source image element to process
     * @param {boolean|undefined} forceLightMode - Optional override for automatic background detection
     * @returns {Promise<Object>} Promise resolving to { imageData, isLightMode }
     */
    function step1_processPuzzleImage(inputImage, forceLightMode) {
        return new Promise((resolve) => {
            const { width, height } = inputImage;
            
            // Create temporary canvas for image data extraction
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = width;
            tempCanvas.height = height;
            const tempCtx = tempCanvas.getContext('2d');
            tempCtx.drawImage(inputImage, 0, 0, width, height);
            const imageData = tempCtx.getImageData(0, 0, width, height);
            const data = imageData.data;
            
            // Calculate average luminance for background detection
            let totalLuminance = 0;
            for (let i = 0; i < data.length; i += 4) {
                totalLuminance += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
            }
            const detectedLightMode = totalLuminance / (width * height) > 128;
            
            // Apply forced mode override if specified, otherwise use detection
            const isLightMode = typeof forceLightMode === 'boolean' ? forceLightMode : detectedLightMode;
            
            // Invert colors for light mode images (white backgrounds become dark)
            if (isLightMode) {
                for (let i = 0; i < data.length; i += 4) {
                    data[i] = 255 - data[i]; data[i+1] = 255 - data[i+1]; data[i+2] = 255 - data[i+2];
                }
            }
            
            // Build luminance histogram for dynamic threshold calculation
            const histogram = new Array(256).fill(0);
            for (let i = 0; i < data.length; i += 4) {
                const luminance = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
                histogram[luminance]++;
            }
            
            // Find most frequent luminance value in the mid-dark range (grid lines)
            let gridLuminance = 50, maxCount = 0;
            for (let i = 15; i < 150; i++) {
                if (histogram[i] > maxCount) {
                    maxCount = histogram[i];
                    gridLuminance = i;
                }
            }
            
            // Calculate adaptive processing parameters based on detected grid luminance
            const brightness = -gridLuminance - 200;
            const threshold = gridLuminance + 45;
            const contrast = 200;
            const factor = (259 * (contrast + 255)) / (255 * (259 - contrast));
            
            // Apply contrast enhancement with adaptive brightness adjustment
            for (let i = 0; i < data.length; i += 4) {
                let r = factor * (data[i] - 128) + 128 + brightness;
                let g = factor * (data[i + 1] - 128) + 128 + brightness;
                let b = factor * (data[i + 2] - 128) + 128 + brightness;
                data[i] = Math.max(0, Math.min(255, r));
                data[i + 1] = Math.max(0, Math.min(255, g));
                data[i + 2] = Math.max(0, Math.min(255, b));
            }
            
            // Apply binary thresholding to create clean black/white image
            for (let i = 0; i < data.length; i += 4) {
                const avg = (data[i] + data[i + 1] + data[i + 2]) / 3;
                const value = avg < threshold ? 0 : 255;
                data[i] = data[i+1] = data[i+2] = value;
            }
            
            resolve({ imageData, isLightMode });
        });
    }

    /**
     * STEP 2: Edge-connected region filling for background noise elimination.
     * Performs flood fill operations from all image edges to remove background artifacts
     * and isolate the main puzzle content. Uses iterative stack-based flood fill with
     * safety limits to prevent infinite loops.
     * 
     * @param {ImageData} imageData - Binary image data from step 1 processing
     * @returns {Promise<ImageData>} Promise resolving to cleaned image data
     */
    function step2_edgeFill(imageData) {
         return new Promise((resolve) => {
            const { width, height, data } = imageData;
            const visited = new Uint8Array(width * height);
            const blackThreshold = 128;
            
            /**
             * Iterative flood fill implementation with stack-based traversal.
             * Fills all connected dark pixels with white, starting from edge coordinates.
             * 
             * @param {number} startX - Starting X coordinate for flood fill
             * @param {number} startY - Starting Y coordinate for flood fill
             */
            const floodFill = (startX, startY) => {
                const stack = [[startX, startY]];
                let iterations = 0;
                const maxIterations = width * height; // Safety limit
                
                while (stack.length > 0 && iterations < maxIterations) {
                    const [x, y] = stack.pop();
                    
                    // Boundary checking
                    if (x < 0 || x >= width || y < 0 || y >= height) continue;
                    
                    const flatIndex = y * width + x;
                    
                    // Skip already visited pixels or white pixels
                    if (visited[flatIndex] || data[flatIndex * 4] > blackThreshold) continue;
                    
                    // Mark as visited and fill with white
                    visited[flatIndex] = 1;
                    data[flatIndex * 4] = data[flatIndex * 4 + 1] = data[flatIndex * 4 + 2] = 255;
                    
                    // Add 4-connected neighbors to processing stack
                    stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
                    iterations++;
                }
            };
            
            // Fill from all horizontal edges (top and bottom)
            for (let i = 0; i < width; i++) {
                floodFill(i, 0); floodFill(i, height - 1);
            }
            
            // Fill from all vertical edges (left and right)
            for (let i = 0; i < height; i++) {
                floodFill(0, i); floodFill(width - 1, i);
            }
            
            resolve(imageData);
        });
    }

    /**
     * STEP 2B: Morphological operations for nearby shape consolidation.
     * Implements dilation followed by erosion to merge shapes separated by small gaps.
     * This two-pass algorithm helps connect puzzle pieces that may have been fragmented
     * by scanning artifacts or compression artifacts.
     * 
     * @param {ImageData} imageData - Image data from edge fill processing
     * @param {number} distance - Morphological operation radius (pixels)
     * @returns {Promise<ImageData>} Promise resolving to consolidated image data
     */
    function step2b_mergeNearbyShapes(imageData, distance) {
        return new Promise(resolve => {
            const { width, height } = imageData;
            const blackThreshold = 128;
            
            // PHASE 1: Dilation - expand dark regions
            const dilatedData = new Uint8ClampedArray(imageData.data.length);
            for (let y = 0; y < height; y++) {
                for (let x = 0; x < width; x++) {
                    let foundBlackNeighbor = false;
                    
                    // Search within dilation radius for dark pixels
                    for (let ny = -distance; ny <= distance; ny++) {
                        for (let nx = -distance; nx <= distance; nx++) {
                            const currentX = x + nx;
                            const currentY = y + ny;
                            
                            // Check bounds and pixel value
                            if (currentX >= 0 && currentX < width && currentY >= 0 && currentY < height) {
                                if (imageData.data[(currentY * width + currentX) * 4] < blackThreshold) {
                                    foundBlackNeighbor = true; break;
                                }
                            }
                        }
                        if (foundBlackNeighbor) break;
                    }
                    
                    // Set pixel value based on dilation result
                    const index = (y * width + x) * 4;
                    const value = foundBlackNeighbor ? 0 : 255;
                    dilatedData[index] = dilatedData[index + 1] = dilatedData[index + 2] = value;
                    dilatedData[index + 3] = 255;
                }
            }
            
            // PHASE 2: Erosion - shrink expanded regions back to original size
            const finalData = new Uint8ClampedArray(imageData.data.length);
            for (let y = 0; y < height; y++) {
                for (let x = 0; x < width; x++) {
                    let foundWhiteNeighbor = false;
                    
                    // Search within erosion radius for white pixels
                    for (let ny = -distance; ny <= distance; ny++) {
                        for (let nx = -distance; nx <= distance; nx++) {
                            const currentX = x + nx;
                            const currentY = y + ny;
                            
                            // Check bounds and pixel value
                            if (currentX >= 0 && currentX < width && currentY >= 0 && currentY < height) {
                                if (dilatedData[(currentY * width + currentX) * 4] >= blackThreshold) {
                                    foundWhiteNeighbor = true; break;
                                }
                            }
                        }
                        if (foundWhiteNeighbor) break;
                    }
                    
                    // Set final pixel value based on erosion result
                    const index = (y * width + x) * 4;
                    const value = foundWhiteNeighbor ? 255 : 0;
                    finalData[index] = finalData[index + 1] = finalData[index + 2] = value;
                    finalData[index + 3] = 255;
                }
            }
            
            resolve(new ImageData(finalData, width, height));
        });
    }

    /**
     * STEP 3: Connected component analysis with visual highlighting system.
     * Identifies discrete shapes using flood fill analysis, classifies them by size,
     * and generates a highlighted visualization overlay. The largest shape is identified
     * as the main puzzle area (highlighted in red), while smaller shapes are marked
     * as secondary elements (highlighted in yellow).
     * 
     * @param {ImageData} processedImageData - Cleaned and processed binary image data
     * @param {HTMLImageElement} originalImage - Original image for overlay generation
     * @returns {Promise<Object>} Promise resolving to { largestShape, yellowShapes, highlightedImageData }
     */
    async function step3_highlightShapes(processedImageData, originalImage) {
        return new Promise((resolve, reject) => {
            const { width, height, data } = processedImageData;

            // Create canvas for highlighted output generation
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = width;
            tempCanvas.height = height;
            const tempCtx = tempCanvas.getContext('2d');
            tempCtx.drawImage(originalImage, 0, 0, width, height);
            const highlightedImageData = tempCtx.getImageData(0, 0, width, height);
            const highlightedData = highlightedImageData.data;

            // Initialize connected component analysis structures
            const visited = new Uint8Array(width * height);
            const shapes = [];
            const blackThreshold = 128;
            
            // Scan entire image for connected dark regions
            for (let y = 0; y < height; y++) {
                for (let x = 0; x < width; x++) {
                    const index = y * width + x;
                    
                    // Process unvisited dark pixels as potential shape starts
                    if (data[index * 4] < blackThreshold && !visited[index]) {
                        const currentShape = [];
                        const queue = [[x, y]];
                        visited[index] = 1;
                        let iterations = 0;
                        const maxIterations = width * height; // Safety limit
                        
                        // Breadth-first search to find all connected pixels
                        while (queue.length > 0 && iterations < maxIterations) {
                            const [cx, cy] = queue.shift();
                            currentShape.push({ x: cx, y: cy });
                            
                            // Check 4-connected neighbors
                            const neighbors = [[cx, cy - 1], [cx, cy + 1], [cx - 1, cy], [cx + 1, cy]];
                            for (const [nx, ny] of neighbors) {
                                if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
                                    const nIndex = ny * width + nx;
                                    
                                    // Add unvisited dark neighbors to queue
                                    if (data[nIndex * 4] < blackThreshold && !visited[nIndex]) {
                                        visited[nIndex] = 1;
                                        queue.push([nx, ny]);
                                    }
                                }
                            }
                            iterations++;
                        }
                        shapes.push(currentShape);
                    }
                }
            }
            
            // Validate that shapes were found
            if (shapes.length === 0) {
                return reject(new Error("No distinct shapes were found to highlight."));
            }
            
            // Identify largest shape (main puzzle area)
            let largestShapeIndex = -1, maxArea = 0;
            shapes.forEach((shape, i) => { if (shape.length > maxArea) { maxArea = shape.length; largestShapeIndex = i; } });
            
            // Define highlighting colors and opacity
            const yellow = [255, 255, 0], red = [255, 0, 0], opacity = 0.5;
            const yellowShapes = [];
            
            // Apply color highlighting to all detected shapes
            shapes.forEach((shape, index) => {
                const isLargest = (index === largestShapeIndex);
                const color = isLargest ? red : yellow;
                if (!isLargest) yellowShapes.push(shape);
                
                // Apply color overlay with alpha blending
                shape.forEach(p => {
                    const i = (p.y * width + p.x) * 4;
                    highlightedData[i]   = highlightedData[i]   * (1 - opacity) + color[0] * opacity;
                    highlightedData[i+1] = highlightedData[i+1] * (1 - opacity) + color[1] * opacity;
                    highlightedData[i+2] = highlightedData[i+2] * (1 - opacity) + color[2] * opacity;
                });
            });
            
            // Return analysis results for downstream processing
            resolve({
                largestShape: shapes[largestShapeIndex],
                yellowShapes,
                highlightedImageData // Controller will handle rendering
            });
        });
    }
	
/**
 * Specialized flood fill operation for final image refinement.
 * Performs color-similarity-based filling with adaptive thresholding and backtracking.
 * Includes safety mechanisms to prevent over-aggressive filling that could damage
 * the main puzzle content. Uses statistical analysis to validate fill appropriateness.
 * 
 * @param {ImageData} imageData - The image data to modify in-place
 */
function _finalFloodFill(imageData) {
    const { width, height, data } = imageData;
    // Create read-only copy to prevent feedback loops during flood fill
    const originalData = new Uint8ClampedArray(data);
    
    // Create backup for potential restoration if fill is too aggressive
    const backupData = new Uint8ClampedArray(data);

    // Define fill starting point (center-top area typical for puzzle backgrounds)
    const startX = Math.floor(width / 2);
    const startY = 10;
    const threshold = 2; // Tight similarity threshold for precise filling

    // Validate starting point bounds
    if (startY >= height) {
        return; // Exit gracefully if start point is invalid
    }

    // Sample target color from original (unmodified) data
    const startIndex = (startY * width + startX) * 4;
    const targetR = originalData[startIndex];
    const targetG = originalData[startIndex + 1];
    const targetB = originalData[startIndex + 2];

    // Determine appropriate fill color based on target luminance
    const luminance = 0.299 * targetR + 0.587 * targetG + 0.114 * targetB;
    const isDark = luminance < 128;

    const fillR = isDark ? 255 : 0;
    const fillG = isDark ? 255 : 0;
    const fillB = isDark ? 255 : 0;

    // Optimization: use squared threshold to avoid sqrt calculations
    const thresholdSquared = threshold * threshold;
    const visited = new Uint8Array(width * height);
    const queue = [[startX, startY]];
    visited[startY * width + startX] = 1;
    
    // Track fill statistics for validation
    let changedPixels = 0;

    // Execute iterative flood fill with color similarity matching
    while (queue.length > 0) {
        const [x, y] = queue.shift();
        const index = (y * width + x) * 4;

        // Apply fill color to current pixel
        data[index] = fillR;
        data[index + 1] = fillG;
        data[index + 2] = fillB;
        data[index + 3] = 255;
        
        // Update statistics
        changedPixels++;

        // Process 4-connected neighbors
        const neighbors = [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]];
        for (const [nx, ny] of neighbors) {
            if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
                const nFlatIndex = ny * width + nx;

                if (visited[nFlatIndex] === 0) {
                    visited[nFlatIndex] = 1;

                    const nIndex = nFlatIndex * 4;
                    // Sample color from original data to avoid fill contamination
                    const r = originalData[nIndex];
                    const g = originalData[nIndex + 1];
                    const b = originalData[nIndex + 2];
                    
                    // Calculate color distance using Euclidean metric
                    const dr = r - targetR;
                    const dg = g - targetG;
                    const db = b - targetB;
                    const distanceSquared = dr * dr + dg * dg + db * db;
                    
                    // Add similar pixels to fill queue
                    if (distanceSquared < thresholdSquared) {
                        queue.push([nx, ny]);
                    }
                }
            }
        }
    }
    
    // Validate fill appropriateness using statistical analysis
    const totalPixels = width * height;
    const changePercentage = (changedPixels / totalPixels) * 100;
    
    // Restore original data if fill was too aggressive (likely error)
    if (changePercentage < 25) {
        data.set(backupData);
    }
}

    /**
     * STEP 4: Intelligent boundary detection and precision cropping system.
     * Analyzes shape distribution and boundaries to determine optimal crop regions.
     * Validates main shape geometry and calculates crop boundaries based on secondary
     * shape positions. Scales crop coordinates from processing resolution to full resolution.
     * 
     * @param {Object} shapeData - Object containing { largestShape, yellowShapes } from shape analysis
     * @param {HTMLImageElement} processingImage - Processing-resolution image for coordinate calculation
     * @param {HTMLImageElement} fullResImage - Full-resolution image for final cropping
     * @returns {Promise<Object>} Promise resolving to { finalCanvas, statusMessage }
     */
    async function step4_intelligentCrop({ largestShape, yellowShapes }, processingImage, fullResImage) {
        return new Promise((resolve, reject) => {
            // Validate input data
            if (!largestShape || largestShape.length === 0) {
                 return resolve({ finalCanvas: null, statusMessage: "Crop skipped: No main shape found." });
            }

            const { width: processWidth, height: processHeight } = processingImage;

            // Calculate bounding box of main shape (red highlighted area)
            let redMinX = processWidth, redMaxX = 0, redMinY = processHeight, redMaxY = 0;
            largestShape.forEach(p => {
                if (p.x < redMinX) redMinX = p.x; if (p.x > redMaxX) redMaxX = p.x;
                if (p.y < redMinY) redMinY = p.y; if (p.y > redMaxY) redMaxY = p.y;
            });

            // Validate main shape geometry (should be roughly square for puzzles)
            const redWidth = redMaxX - redMinX;
            const redHeight = redMaxY - redMinY;
            const redAspectRatio = redWidth / redHeight;
            const squarenessThreshold = 1.25; // Allow 25% deviation from perfect square

            if (redAspectRatio > squarenessThreshold || redAspectRatio < 1 / squarenessThreshold) {
                return reject(new Error("Main shape is not square-like."));
            }

            // Advanced crop boundary calculation based on secondary shape analysis
            const allYellowPixels = yellowShapes.flat();
            const largeSectionThreshold = processWidth * 0.01;  // 1% of image width
            const bigNothingnessThreshold = processWidth * 0.02; // 2% of image width
            let cropLeft = 0, cropRight = 0, cropTop = 0, cropBottom = 0;

            // LEFT BOUNDARY: Find rightmost yellow pixel left of main shape
            let yellowBoundaryL = 0;
            allYellowPixels.forEach(p => { if (p.x < redMinX && p.x > yellowBoundaryL) yellowBoundaryL = p.x; });
            if (yellowBoundaryL > largeSectionThreshold && (redMinX - yellowBoundaryL) > bigNothingnessThreshold) { cropLeft = yellowBoundaryL; }

            // RIGHT BOUNDARY: Find leftmost yellow pixel right of main shape
            let yellowBoundaryR = processWidth;
            allYellowPixels.forEach(p => { if (p.x > redMaxX && p.x < yellowBoundaryR) yellowBoundaryR = p.x; });
            if ((processWidth - yellowBoundaryR) > largeSectionThreshold && (yellowBoundaryR - redMaxX) > bigNothingnessThreshold) { cropRight = processWidth - yellowBoundaryR; }

            // TOP BOUNDARY: Find bottommost yellow pixel above main shape
            let yellowBoundaryT = 0;
            allYellowPixels.forEach(p => { if (p.y < redMinY && p.y > yellowBoundaryT) yellowBoundaryT = p.y; });
            if (yellowBoundaryT > largeSectionThreshold && (redMinY - yellowBoundaryT) > bigNothingnessThreshold) { cropTop = yellowBoundaryT; }

            // BOTTOM BOUNDARY: Find topmost yellow pixel below main shape
            let yellowBoundaryB = processHeight;
            allYellowPixels.forEach(p => { if (p.y < redMaxY && p.y < yellowBoundaryB) yellowBoundaryB = p.y; });
            if ((processHeight - yellowBoundaryB) > largeSectionThreshold && (yellowBoundaryB - redMaxY) > bigNothingnessThreshold) { cropBottom = processHeight - yellowBoundaryB; }

            // Calculate final crop dimensions
            const sx = cropLeft;
            const sy = cropTop;
            const sWidth = processWidth - cropLeft - cropRight;
            const sHeight = processHeight - cropTop - cropBottom;

            // Skip crop if no meaningful boundaries were found
            if (sWidth === processWidth && sHeight === processHeight) {
                return resolve({ finalCanvas: null, statusMessage: "No crop was necessary. Displaying original." });
            }

            // Scale crop coordinates from processing resolution to full resolution
            const scaleRatio = fullResImage.width / processWidth;
            const final_sx = sx * scaleRatio;
            const final_sy = sy * scaleRatio;
            const final_sWidth = sWidth * scaleRatio;
            const final_sHeight = sHeight * scaleRatio;

            // Execute precision crop on full-resolution image
            const finalCanvas = document.createElement('canvas');
            finalCanvas.width = final_sWidth;
            finalCanvas.height = final_sHeight;
            const finalCtx = finalCanvas.getContext('2d');

            finalCtx.drawImage(fullResImage, final_sx, final_sy, final_sWidth, final_sHeight, 0, 0, final_sWidth, final_sHeight);

            resolve({ finalCanvas, statusMessage: "Processing complete! Cropped image is below." });
        });
    }

    /**
     * Master orchestration function for the complete image processing pipeline.
     * Coordinates all processing steps with automatic error recovery and mode switching.
     * Implements sophisticated retry logic that attempts processing with opposite background
     * detection modes when initial attempts fail. Provides comprehensive status reporting
     * and handles both successful processing and graceful error recovery.
     * 
     * @param {Object} params - Configuration object for processing pipeline
     * @param {HTMLImageElement} params.processingImage - Optimized image for analysis operations
     * @param {HTMLImageElement} params.fullResolutionImage - Original high-resolution image for final output
     * @param {function} params.onStatusUpdate - Callback function for progress reporting (receives string messages)
     * @returns {Promise<Object>} Promise resolving to { finalCanvas, highlightedImageData, statusMessage }
     */
    async function runFullProcess({ processingImage, fullResolutionImage, onStatusUpdate }) {
        /**
         * Internal pipeline execution function with configurable background mode.
         * Encapsulates the complete 6-step processing workflow with error propagation
         * for intelligent retry logic.
         * 
         * @param {boolean|undefined} forceMode - Optional background mode override
         * @returns {Promise<Object>} Promise resolving to complete processing results
         */
        const executePipeline = async (forceMode) => {
            // STEP 1: Advanced image preprocessing with background detection
            onStatusUpdate("Step 1/5: Processing image...");
            const { imageData: processed, isLightMode } = await step1_processPuzzleImage(processingImage, forceMode);

            // STEP 2: Background noise elimination via edge filling
            onStatusUpdate("Step 2/5: Isolating shapes...");
            const filled = await step2_edgeFill(processed);

            // STEP 3: Shape consolidation through morphological operations
            onStatusUpdate("Step 3/5: Merging nearby shapes...");
            const mergeDistance = 5; // 5-pixel radius for shape merging
            const merged = await step2b_mergeNearbyShapes(filled, mergeDistance);
            
            try {
                // STEP 4: Connected component analysis and shape classification
                onStatusUpdate("Step 4/5: Finding and highlighting shapes...");
                const { largestShape, yellowShapes, highlightedImageData } = await step3_highlightShapes(merged, processingImage);

                // STEP 5: Intelligent boundary detection and precision cropping
                onStatusUpdate("Step 5/5: Applying intelligent crop...");
				
				let { finalCanvas, statusMessage } = await step4_intelligentCrop({ largestShape, yellowShapes }, processingImage, fullResolutionImage);

// STEP 6: Final refinement with conditional flood fill application
if (finalCanvas) {
    // CROP SCENARIO: Apply flood fill to newly created cropped canvas
    onStatusUpdate("Step 6/6: Applying final flood fill to cropped image...");
    const finalCtx = finalCanvas.getContext('2d');
    const finalImageData = finalCtx.getImageData(0, 0, finalCanvas.width, finalCanvas.height);
    //_finalFloodFill(finalImageData); // In-place modification of image data
    finalCtx.putImageData(finalImageData, 0, 0);
} else {
    // NO-CROP SCENARIO: Apply flood fill to original processing image
    onStatusUpdate("Step 6/6: No crop needed. Applying flood fill...");
    
    // Create new canvas from processing image for flood fill application
    const newCanvas = document.createElement('canvas');
    newCanvas.width = processingImage.width;
    newCanvas.height = processingImage.height;
    const ctx = newCanvas.getContext('2d');
    ctx.drawImage(processingImage, 0, 0, newCanvas.width, newCanvas.height);
    
    // Extract image data for flood fill processing
    const imageData = ctx.getImageData(0, 0, newCanvas.width, newCanvas.height);
    
    // Apply specialized flood fill refinement
    _finalFloodFill(imageData);
    
    // Render processed data back to canvas
    ctx.putImageData(imageData, 0, 0);
    
    // Update final result reference
    finalCanvas = newCanvas;
}
                
                return { finalCanvas, highlightedImageData, statusMessage };

            } catch (err) {
                // Attach mode information for intelligent retry logic
                err.modeUsed = isLightMode;
                throw err;
            }
        };

        try {
            // PRIMARY ATTEMPT: Execute pipeline with automatic background detection
            return await executePipeline(undefined);
        } catch (err) {
            console.error("A processing step failed:", err.message);
            const modeThatFailed = err.modeUsed;

            // Generate contextual retry message based on failure type
            let retryMessage = "Correction: Re-processing with opposite mode...";
            if (err.message.includes("not square-like")) {
                retryMessage = "Main shape not square. Trying other mode...";
            } else if (err.message.includes("No distinct shapes")) {
                retryMessage = "No shapes found. Trying other mode...";
            }
            onStatusUpdate(retryMessage);
            
            try {
                // RECOVERY ATTEMPT: Execute pipeline with inverted background mode
                return await executePipeline(!modeThatFailed);
            } catch (correctionErr) {
                console.error("Correction attempt also failed:", correctionErr.message);
                // Generate user-friendly final error message
                throw new Error("Could not process the image successfully in either mode. 😞");
            }
        }
    }

    /**
     * Public API exposure for external consumption.
     * Provides access to both high-level orchestration functions and individual
     * processing steps for granular control when needed.
     */
    return {
        loadImageFromFile,
        runFullProcess,
        // Expose individual processing steps for advanced usage scenarios
        steps: {
            step1_processPuzzleImage,
            step2_edgeFill,
            step2b_mergeNearbyShapes,
            step3_highlightShapes,
            step4_intelligentCrop
        }
    };

})();