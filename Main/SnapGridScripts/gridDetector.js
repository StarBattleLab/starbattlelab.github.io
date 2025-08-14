/**
 * gridDetector.js
 *
 * Author: Isaiah Tadrous
 * Version: 1.0.0
 *
 * Description:
 * Advanced grid detection system for Star Battle puzzle images using computer vision techniques.
 * This module utilizes sophisticated contour analysis, line detection, and statistical clustering
 * to automatically determine grid dimensions from puzzle images. It is designed to handle various 
 * image qualities, orientations, and grid sizes, while maintaining high accuracy through robust 
 * geometric validation and noise filtering algorithms.
 *
 * The module implements a multi-stage pipeline:
 *  1. Contour extraction using edge detection and morphological operations
 *  2. Line segment identification with angle-based classification
 *  3. Statistical clustering to find consistent grid spacing patterns
 *  4. Grid reconstruction through extrapolation and validation
 *
 * Prerequisites:
 *  1. OpenCV.js must be loaded globally before using this module:
 *     <script async src="https://docs.opencv.org/4.x/opencv.js"></script>
 *
 *  2. Ensure OpenCV.js is fully initialized before calling detection functions
 *
 * Usage Examples:
 * 
 * Basic grid detection:
 *  const result = await gridDetector.detectGrid(imageElement);
 *  if (result) {
 *      console.log(`Detected ${result.gridSize}x${result.gridSize} grid`);
 *      console.log('Horizontal lines:', result.hGridLines);
 *      console.log('Vertical lines:', result.vGridLines);
 *  }
 *
 * Error handling:
 *  try {
 *      const grid = await gridDetector.detectGrid(puzzleImage);
 *      if (!grid) {
 *          console.log('No valid grid structure detected');
 *      }
 *  } catch (error) {
 *      console.error('Grid detection failed:', error);
 *  }
 *
 * -------------------------------------------
 *
 * Module Overview:
 *  Detects the grid size from a Star Battle puzzle image.
 *  This module is a standalone refactoring of the grid detection logic
 *  from the original lineDurabilityFilter.js script. It uses OpenCV
 *  to find contours, identify lines, and infer the grid dimensions.
 *
 * Usage:
 *  - Prerequisite: Load opencv.js before this script.
 *  - Call the async function `gridDetector.detectGrid(imageElement)`.
 *  - Input: An HTMLImageElement containing the puzzle.
 *  - Output: A Promise that resolves to an object (e.g., { gridSize: 10 })
 *    or null if no valid grid is found.
 */


const gridDetector = (() => {

    /**
     * Safety threshold to prevent excessive computational load on large datasets.
     * Protects against memory exhaustion and processing timeouts when analyzing
     * images with extremely high numbers of detected contours or line segments.
     */
    const MAX_DATA_POINTS = 10000; // Safety limit for loops over contours and lines.

    /**
     * Advanced line extraction system using contour-based geometric analysis.
     * Processes detected contours to identify straight line segments through polygon
     * approximation and angular classification. Implements sophisticated filtering
     * to distinguish between horizontal, vertical, and diagonal elements while
     * maintaining tolerance for minor image distortions and scanning artifacts.
     * 
     * @param {cv.MatVector} contours - OpenCV contour collection from edge detection
     * @param {number} minLength - Minimum pixel length threshold for valid line segments
     * @returns {{hLines: number[], vLines: number[]}} Object containing arrays of horizontal and vertical line positions
     */
    function getLinesFromContours(contours, minLength) {
        // Validate input size to prevent computational overflow
        if (contours.size() > MAX_DATA_POINTS) {
            console.error("Exceeded maximum contour analysis points.");
            return { hLines: [], vLines: [] };
        }

        const hLines = [];
        const vLines = [];
        const angleTol = Math.PI / 18; // 10-degree tolerance for line angle classification

        // Process each contour for line segment extraction
        for (let i = 0; i < contours.size(); i++) {
            const contour = contours.get(i);
            let approx = new cv.Mat();
            
            // Douglas-Peucker algorithm for polygon approximation
            // Reduces contour complexity while preserving essential geometric features
            cv.approxPolyDP(contour, approx, 0.01 * cv.arcLength(contour, true), true);

            // Analyze consecutive polygon vertices for line segments
            for (let j = 0; j < approx.rows - 1; j++) {
                // Extract vertex coordinates from OpenCV data structure
                const p1 = { x: approx.data32S[j * 2], y: approx.data32S[j * 2 + 1] };
                const p2 = { x: approx.data32S[(j + 1) * 2], y: approx.data32S[(j + 1) * 2 + 1] };
                
                // Calculate Euclidean distance between vertices
                const length = Math.hypot(p2.x - p1.x, p2.y - p1.y);

                // Filter out insignificant short segments
                if (length < minLength) continue;

                // Calculate segment orientation angle
                const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x);

                // Classify line orientation with angular tolerance
                // Horizontal lines: angle ≈ 0 or π
                if (Math.abs(angle) < angleTol) {
                    hLines.push((p1.y + p2.y) / 2); // Store midpoint Y-coordinate
                }
                // Vertical lines: angle ≈ ±π/2
                else if (Math.abs(angle - Math.PI / 2) < angleTol || Math.abs(angle + Math.PI / 2) < angleTol) {
                    vLines.push((p1.x + p2.x) / 2); // Store midpoint X-coordinate
                }
            }
            approx.delete(); // Clean up OpenCV memory
        }

        /**
         * Intelligent line consolidation algorithm for noise reduction.
         * Merges closely positioned line detections into single representative lines
         * to eliminate duplicate detections caused by thick lines, image artifacts,
         * or multiple edge responses from the same physical grid line.
         * 
         * @param {number[]} arr - Array of line positions to consolidate
         * @param {number} mergeThreshold - Maximum distance for line grouping (pixels)
         * @returns {number[]} Array of consolidated line positions
         */
        const merge = (arr, mergeThreshold = 10) => {
            if (arr.length < 2) return arr;
            
            // Sort lines by position for sequential processing
            arr.sort((a, b) => a - b);
            const merged = [];
            let currentGroup = [arr[0]];
            
            // Group nearby lines and calculate group centroids
            for (let i = 1; i < arr.length; i++) {
                if (arr[i] - arr[i - 1] > mergeThreshold) {
                    // Finalize current group with average position
                    merged.push(currentGroup.reduce((a, b) => a + b, 0) / currentGroup.length);
                    currentGroup = [arr[i]];
                } else {
                    // Add to current group
                    currentGroup.push(arr[i]);
                }
            }
            // Process final group
            merged.push(currentGroup.reduce((a, b) => a + b, 0) / currentGroup.length);
            return merged;
        };

        return { hLines: merge(hLines), vLines: merge(vLines) };
    }

    /**
     * Sophisticated grid reconstruction engine using statistical pattern analysis.
     * Employs advanced clustering algorithms to identify consistent spacing patterns
     * in detected line positions, then reconstructs complete grid structures through
     * mathematical extrapolation. Handles partial line detection and missing segments
     * through intelligent gap filling and validation procedures.
     * 
     * @param {number[]} hLines - Array of detected horizontal line positions
     * @param {number[]} vLines - Array of detected vertical line positions  
     * @param {number} imgHeight - Image height in pixels for boundary validation
     * @param {number} imgWidth - Image width in pixels for boundary validation
     * @returns {object|null} Grid structure object with dimensions and line coordinates, or null if invalid
     */
    function findGridFromClusters(hLines, vLines, imgHeight, imgWidth) {
        // Validate input complexity to prevent performance issues
        if (hLines.length > MAX_DATA_POINTS || vLines.length > MAX_DATA_POINTS) {
            console.error("Exceeded maximum line analysis points.");
            return null;
        }

        /**
         * Complete grid reconstruction algorithm from partial line detections.
         * Analyzes spacing patterns in detected lines to determine the underlying
         * grid structure, then extrapolates missing lines through mathematical
         * projection. Implements robust validation to ensure grid consistency.
         * 
         * @param {number[]} lines - Array of detected line positions in one dimension
         * @param {number} imageDim - Image dimension (width/height) for boundary constraints
         * @returns {object|null} Grid structure with line array and count, or null if invalid
         */
        const buildFullGrid = (lines, imageDim) => {
            // Require minimum line count for meaningful analysis
            if (lines.length < 2) return null;
            
            // PHASE 1: Statistical spacing analysis
            const deltas = {}; // Histogram of line spacings
            for (let i = 1; i < lines.length; i++) {
                const delta = Math.round(lines[i] - lines[i - 1]);
                if (delta > 10) deltas[delta] = (deltas[delta] || 0) + 1; // Filter noise
            }

            if (Object.keys(deltas).length === 0) return null;
            
            // Identify most frequent spacing (dominant grid cell size)
            const commonDelta = parseInt(Object.keys(deltas).reduce((a, b) => deltas[a] > deltas[b] ? a : b));

            // PHASE 2: Find longest consistent sequence
            const tolerance = commonDelta * 0.35; // 35% tolerance for spacing variation
            let bestSequence = [];
            
            // Analyze all possible starting points for consistent sequences
            for (let i = 0; i < lines.length; i++) {
                let currentSequence = [lines[i]];
                let lastLine = lines[i];
                
                // Build sequence of consistently spaced lines
                for (let j = i + 1; j < lines.length; j++) {
                    if (Math.abs((lines[j] - lastLine) - commonDelta) < tolerance) {
                        currentSequence.push(lines[j]);
                        lastLine = lines[j];
                    }
                }
                
                // Track best sequence found
                if (currentSequence.length > bestSequence.length) bestSequence = currentSequence;
            }

            if (bestSequence.length < 2) return null;
            
            // PHASE 3: Calculate precise grid spacing from best sequence
            const preciseDelta = (bestSequence[bestSequence.length - 1] - bestSequence[0]) / (bestSequence.length - 1);
            if (isNaN(preciseDelta) || preciseDelta < 10) return null;

            // PHASE 4: Grid extrapolation and line snapping
            const snapTolerance = preciseDelta * 0.4; // 40% tolerance for line snapping
            
            // Find theoretical grid origin by backwards extrapolation
            let firstLine = bestSequence[0];
            while ((firstLine - preciseDelta) > -preciseDelta / 2) firstLine -= preciseDelta;
            
            // Generate complete theoretical grid and snap to detected lines
            const fullGridLines = [];
            const usedLines = new Set(); // Prevent double-assignment of detected lines
            
            for (let theoreticalPos = firstLine; theoreticalPos < imageDim + preciseDelta / 2; theoreticalPos += preciseDelta) {
                let bestSnapLine = theoreticalPos;
                let minDiff = snapTolerance;
                
                // Find closest detected line within snap tolerance
                for (const detectedLine of lines) {
                    if (usedLines.has(detectedLine)) continue;
                    const diff = Math.abs(detectedLine - theoreticalPos);
                    if (diff < minDiff) {
                        minDiff = diff;
                        bestSnapLine = detectedLine;
                    }
                }
                
                // Mark detected line as used if snapped
                if (bestSnapLine !== theoreticalPos) usedLines.add(bestSnapLine);
                
                // Include line if within image boundaries
                if (bestSnapLine >= 0 && bestSnapLine <= imageDim) fullGridLines.push(bestSnapLine);
            }
            
            // Validate minimum grid requirements
            if (fullGridLines.length < 3) return null; // Need at least 2 cells (3 lines)
            return { lines: fullGridLines, count: fullGridLines.length };
        };

        // Reconstruct grids for both dimensions
        const hGrid = buildFullGrid(hLines, imgHeight);
        const vGrid = buildFullGrid(vLines, imgWidth);

        // Validate successful reconstruction in both dimensions
        if (!hGrid || !vGrid) return null;

        // Calculate grid size (number of cells = number of lines - 1)
        const gridSize = Math.round((hGrid.count - 1 + vGrid.count - 1) / 2);
        if (gridSize < 3) return null; // Enforce minimum sensible grid size

        // Return complete grid structure with all detected information
		return {
			gridSize: gridSize,
			hGridLines: hGrid.lines,
			vGridLines: vGrid.lines
		};
    }

    /**
     * Core computer vision pipeline for grid detection from image data.
     * Implements a complete image processing workflow including preprocessing,
     * edge detection, contour analysis, and geometric validation. Uses optimized
     * OpenCV operations for robust performance across various image qualities
     * and lighting conditions.
     * 
     * @param {cv.Mat} srcMat - Source image as OpenCV matrix (RGBA format)
     * @returns {object|null} Detected grid structure or null if detection fails
     */
    function detectGridFromContours(srcMat) {
        // Initialize OpenCV matrices for processing pipeline
        let gray = new cv.Mat();
        let edges = new cv.Mat();
        let contours = new cv.MatVector();
        let hierarchy = new cv.Mat();
        
        try {
            // STAGE 1: Image preprocessing for optimal edge detection
            cv.cvtColor(srcMat, gray, cv.COLOR_RGBA2GRAY, 0); // Convert to grayscale
            cv.GaussianBlur(gray, gray, new cv.Size(5, 5), 0); // Noise reduction with Gaussian filter
            
            // STAGE 2: Edge detection using Canny algorithm
            // Parameters tuned for grid line detection: low=60, high=120, aperture=3
            cv.Canny(gray, edges, 60, 120, 3);
            
            // STAGE 3: Contour extraction for geometric analysis
            cv.findContours(edges, contours, hierarchy, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE);

            // STAGE 4: Line extraction with adaptive minimum length
            // Use 5% of image width as minimum length threshold for grid lines
            const { hLines, vLines } = getLinesFromContours(contours, srcMat.cols * 0.05);
            
            // STAGE 5: Grid reconstruction from detected line patterns
            return findGridFromClusters(hLines, vLines, gray.rows, gray.cols);

        } finally {
            // Ensure proper OpenCV memory management to prevent leaks
            gray.delete();
            edges.delete();
            contours.delete();
            hierarchy.delete();
        }
    }

    /**
     * Primary public interface for grid detection functionality.
     * Provides a high-level, Promise-based API for detecting grid structures
     * from HTML image elements. Handles OpenCV initialization validation,
     * error management, and resource cleanup automatically.
     * 
     * @param {HTMLImageElement} imageElement - DOM image element containing puzzle to analyze
     * @returns {Promise<object|null>} Promise resolving to grid structure object or null
     * 
     * Success Response Format:
     * {
     *   gridSize: number,        // Detected grid dimensions (e.g., 10 for 10x10 grid)
     *   hGridLines: number[],    // Array of horizontal line Y-coordinates
     *   vGridLines: number[]     // Array of vertical line X-coordinates
     * }
     */
    async function detectGrid(imageElement) {
        // Validate OpenCV.js availability
        if (typeof cv === 'undefined') {
            console.error('OpenCV.js is not loaded. Please include it before this script.');
            return null;
        }

        let srcMat;
        try {
            // Convert HTML image element to OpenCV matrix format
            srcMat = cv.imread(imageElement);
            
            // Execute complete grid detection pipeline
            const grid = detectGridFromContours(srcMat);
            
            // Return results (example: { gridSize: 10, hGridLines: [...], vGridLines: [...] })
            return grid;
            
        } catch (e) {
            // Comprehensive error logging for debugging
            console.error(`Error during grid detection: ${e.message}`);
            return null;
        } finally {
            // Ensure OpenCV memory cleanup regardless of success/failure
            if (srcMat) srcMat.delete();
        }
    }

    /**
     * Public API exposure for external consumption.
     * Provides access to the main detection functionality while keeping
     * internal helper functions private for encapsulation and maintainability.
     */
    return {
        detectGrid
    };

})();