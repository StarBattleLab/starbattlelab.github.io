/**
 * imageNormalizer.js
 *
 * Author: Isaiah Tadrous
 * Version: 1.0.0
 *
 * Description:
 * The imageNormalizer.js module is a critical component of the SnapGrid image-to-puzzle pipeline.
 * Its primary function is to correct for perspective distortions and enhance images so that the puzzle 
 * grid is perfectly normalized into a flat, square shape. The process begins by analyzing the image to 
 * determine if it requires inversion to a dark-on-light color scheme.
 *
 * The module then uses a **Random Sample Consensus (RANSAC)** algorithm to robustly identify the 
 * four outer edges of the grid. With these edges, the script calculates the precise corner points 
 * and computes a **perspective transform matrix**. This matrix is applied to "unwarp" the image, 
 * transforming it into a standardized square shape, ensuring that the puzzle grid is accurately aligned.
 * 
 * The entire process is run multiple times as part of a stability check, ensuring the final output is 
 * consistent, reliable, and suitable for further analysis in the SnapGrid pipeline.
 *
 */

/**
 * ImageProcessor Module
 * 
 * A self-contained module that implements a robust image normalization pipeline for puzzle grids.
 * Uses the Module Pattern for encapsulation and provides a clean public API through the processImage method.
 * 
 * Key Features:
 * - Automatic light/dark mode detection and correction
 * - RANSAC-based edge detection for robust grid identification
 * - Perspective correction using homography transforms
 * - Multi-pass stability verification
 * - Automatic error recovery with mode switching
 * 
 * @module ImageProcessor
 */
const ImageProcessor = (() => {

    // --- Private Helper Functions ---

    /**
     * Creates a pseudo-random number generator using the Mulberry32 algorithm.
     * 
     * This deterministic PRNG ensures reproducible results across runs, which is critical
     * for consistent RANSAC performance. Mulberry32 is chosen for its good statistical
     * properties and fast performance.
     * 
     * @param {number} seed - The initial seed value for deterministic random generation
     * @returns {function(): number} A function that returns a pseudo-random number between 0 and 1
     * 
     * @example
     * const rng = mulberry32(12345);
     * const randomValue = rng(); // Returns a deterministic "random" value
     */
    function mulberry32(seed) {
        return function() {
            let t = seed += 0x6D2B79F5;
            t = Math.imul(t ^ t >>> 15, t | 1);
            t ^= t + Math.imul(t ^ t >>> 7, t | 61);
            return ((t ^ t >>> 14) >>> 0) / 4294967296;
        }
    }

    /**
     * Computes a perspective transform matrix using the Direct Linear Transform (DLT) method.
     * 
     * This function solves the homography equation by setting up a system of linear equations
     * and solving it using Gaussian elimination. The resulting 8-parameter transform can
     * map any quadrilateral to any other quadrilateral, which is essential for correcting
     * perspective distortion in puzzle images.
     * 
     * Mathematical Background:
     * - Uses homogeneous coordinates for projective geometry
     * - Solves Ax = b system where A is 8x8 coefficient matrix
     * - Each point correspondence contributes 2 equations to the system
     * 
     * @param {Array<Object>} src - Array of 4 source points in format {x, y}
     * @param {Array<Object>} dst - Array of 4 destination points in format {x, y}
     * @returns {Array<number>} The 8-element transform matrix [a,b,c,d,e,f,g,h]
     * 
     * @throws {Error} If the matrix is singular (non-invertible)
     * 
     * @example
     * const srcCorners = [{x:10,y:20}, {x:100,y:25}, {x:95,y:110}, {x:15,y:105}];
     * const dstCorners = [{x:0,y:0}, {x:100,y:0}, {x:100,y:100}, {x:0,y:100}];
     * const transform = getPerspectiveTransform(srcCorners, dstCorners);
     */
    function getPerspectiveTransform(src, dst) {
        const r = (i) => src[i], s = (i) => dst[i];
        const A = [], b = [];
        
        // Build the coefficient matrix A and result vector b
        // Each point correspondence gives us 2 linear equations
        for(let i=0; i<4; i++){
            A.push([r(i).x, r(i).y, 1, 0, 0, 0, -r(i).x*s(i).x, -r(i).y*s(i).x]); b.push(s(i).x);
            A.push([0, 0, 0, r(i).x, r(i).y, 1, -r(i).x*s(i).y, -r(i).y*s(i).y]); b.push(s(i).y);
        }
        
        const x_matrix = new Array(8).fill(0);
        
        // Gaussian elimination with partial pivoting for numerical stability
        for (let i = 0; i < 8; i++) {
            // Find the row with the largest pivot element
            let maxRow = i;
            for (let j = i + 1; j < 8; j++) if (Math.abs(A[j][i]) > Math.abs(A[maxRow][i])) maxRow = j;
            
            // Swap rows to move the largest element to the diagonal
            [A[i], A[maxRow]] = [A[maxRow], A[i]]; [b[i], b[maxRow]] = [b[maxRow], b[i]];
            
            // Eliminate column entries below the pivot
            for (let j = i + 1; j < 8; j++) {
                const factor = A[j][i] / A[i][i];
                for (let k = i; k < 8; k++) A[j][k] -= factor * A[i][k];
                b[j] -= factor * b[i];
            }
        }
        
        // Back substitution to solve for the transform parameters
        for (let i = 7; i >= 0; i--) {
            let sum = 0;
            for (let j = i + 1; j < 8; j++) sum += A[i][j] * x_matrix[j];
            x_matrix[i] = (b[i] - sum) / A[i][i];
        }
        
        return x_matrix;
    };

    /**
     * Applies a perspective transformation to a single point.
     * 
     * Uses the computed transform matrix to map a point from the destination coordinate
     * system back to the source coordinate system. This is the inverse mapping used
     * during image warping to sample from the original image.
     * 
     * Mathematical Formula:
     * x' = (ax + by + c) / (gx + hy + 1)
     * y' = (dx + ey + f) / (gx + hy + 1)
     * 
     * @param {Object} point - The point to transform in format {x, y}
     * @param {Array<number>} transform - The 8-element transform matrix
     * @returns {Object} The transformed point in format {x, y}
     * 
     * @example
     * const transformed = applyTransform({x: 50, y: 50}, transformMatrix);
     * console.log(transformed); // {x: 45.2, y: 52.1}
     */
    function applyTransform(point, transform) {
        const { x, y } = point;
        const [a, b, c, d, e, f, g, h] = transform;
        const denominator = g * x + h * y + 1;
        return {
            x: (a * x + b * y + c) / denominator,
            y: (d * x + e * y + f) / denominator
        };
    };

    /**
     * Compares two ImageData objects for visual similarity using RMSE.
     * 
     * This function is critical for the stability verification process. It computes
     * the Root Mean Square Error between corresponding pixels in RGB space and
     * normalizes it to a 0-1 scale for threshold comparison.
     * 
     * The comparison helps detect when the normalization process has converged to
     * a stable solution across multiple iterations.
     * 
     * @param {ImageData} imgData1 - First image data object
     * @param {ImageData} imgData2 - Second image data object  
     * @param {number} similarityThreshold - Normalized RMSE threshold (default: 0.2)
     * @returns {boolean} True if images are similar within threshold, false otherwise
     * 
     * @example
     * const similar = compareImages(image1, image2, 0.15);
     * if (similar) console.log("Images are visually similar");
     */
    function compareImages(imgData1, imgData2, similarityThreshold = 0.2) {
        const data1 = imgData1.data;
        const data2 = imgData2.data;
        
        // Early exit for dimension mismatch
        if (data1.length !== data2.length) return false;
        
        // Calculate sum of squared differences across RGB channels
        let sumSqDiff = 0;
        for (let i = 0; i < data1.length; i += 4) {
            sumSqDiff += (data1[i] - data2[i])**2 + (data1[i + 1] - data2[i + 1])**2 + (data1[i + 2] - data2[i + 2])**2;
        }
        
        // Compute normalized RMSE
        const rmse = Math.sqrt(sumSqDiff / (imgData1.width * imgData1.height * 3));
        return (rmse / 255) <= similarityThreshold;
    }

    /**
     * Converts an HTML Image element to ImageData for pixel manipulation.
     * 
     * This utility function creates a temporary canvas to extract pixel data from
     * an Image object. The willReadFrequently option optimizes for multiple pixel
     * read operations.
     * 
     * @param {Image} img - The source HTML Image element
     * @returns {ImageData} Raw pixel data with RGBA values
     * 
     * @example
     * const imageData = getImageDataFromImage(puzzleImage);
     * console.log(imageData.width, imageData.height); // Image dimensions
     */
    function getImageDataFromImage(img) {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(img, 0, 0);
        return ctx.getImageData(0, 0, img.width, img.height);
    }
    
    /**
     * Converts ImageData back to an HTML Image element.
     * 
     * Creates a new Image object from raw pixel data by rendering to a canvas
     * and converting to a data URL. Returns a Promise since Image loading is asynchronous.
     * 
     * @param {ImageData} imageData - The source pixel data
     * @returns {Promise<Image>} A promise that resolves with the new Image object
     * 
     * @example
     * const image = await getImageFromData(processedImageData);
     * document.body.appendChild(image);
     */
    function getImageFromData(imageData) {
        return new Promise((resolve) => {
            const canvas = document.createElement('canvas');
            canvas.width = imageData.width;
            canvas.height = imageData.height;
            const ctx = canvas.getContext('2d');
            ctx.putImageData(imageData, 0, 0);
            const image = new Image();
            image.onload = () => resolve(image);
            image.src = canvas.toDataURL();
        });
    }

    // --- Core Processing Steps ---

    /**
     * STEP 1: Image Preprocessing and Mode Detection
     * 
     * This critical first step handles color mode detection and image enhancement.
     * It automatically determines if the puzzle has dark lines on light background
     * or vice versa, then applies appropriate preprocessing to create a clean
     * binary representation suitable for edge detection.
     * 
     * Process Flow:
     * 1. Analyze overall luminance to detect light/dark mode
     * 2. Apply color inversion if needed to standardize to dark-on-light
     * 3. Build luminance histogram to find grid line color
     * 4. Apply contrast enhancement and brightness adjustment
     * 5. Apply binary thresholding to create clean edges
     * 
     * @param {Image} inputImage - The original puzzle image
     * @param {boolean} forceLightMode - Optional override for mode detection
     * @returns {Promise<Object>} Resolves with {imageData, isLightMode}
     * 
     * @example
     * const {imageData, isLightMode} = await step1_processPuzzleImage(puzzleImg);
     */
    function step1_processPuzzleImage(inputImage, forceLightMode) {
        return new Promise((resolve) => {
            const { width, height } = inputImage;
            const imageData = getImageDataFromImage(inputImage);
            const data = imageData.data;

            // Calculate average luminance to detect if image is primarily light or dark
            let totalLuminance = 0;
            for (let i = 0; i < data.length; i += 4) {
                totalLuminance += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
            }
            const detectedLightMode = totalLuminance / (width * height) > 128;
            const isLightMode = typeof forceLightMode === 'boolean' ? forceLightMode : detectedLightMode;

            // Invert colors if in light mode to standardize processing
            if (isLightMode) {
                for (let i = 0; i < data.length; i += 4) {
                    data[i] = 255 - data[i]; data[i+1] = 255 - data[i+1]; data[i+2] = 255 - data[i+2];
                }
            }
            
            // Build luminance histogram to identify the dominant grid line color
            const histogram = new Array(256).fill(0);
            for (let i = 0; i < data.length; i += 4) {
                const luminance = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
                histogram[luminance]++;
            }
            
            // Find the most common luminance value in the mid-range (likely grid lines)
            let gridLuminance = 50, maxCount = 0;
            for (let i = 15; i < 150; i++) {
                if (histogram[i] > maxCount) {
                    maxCount = histogram[i];
                    gridLuminance = i;
                }
            }
            
            // Calculate enhancement parameters based on detected grid color
            const brightness = -gridLuminance - 200;
            const threshold = gridLuminance + 45;
            const contrast = 200;
            const factor = (259 * (contrast + 255)) / (255 * (259 - contrast));

            // Apply contrast enhancement and brightness adjustment
            for (let i = 0; i < data.length; i += 4) {
                data[i] = Math.max(0, Math.min(255, factor * (data[i] - 128) + 128 + brightness));
                data[i + 1] = Math.max(0, Math.min(255, factor * (data[i + 1] - 128) + 128 + brightness));
                data[i + 2] = Math.max(0, Math.min(255, factor * (data[i + 2] - 128) + 128 + brightness));
            }

            // Apply binary thresholding to create clean black/white image
            for (let i = 0; i < data.length; i += 4) {
                const avg = (data[i] + data[i + 1] + data[i + 2]) / 3;
                data[i] = data[i+1] = data[i+2] = (avg < threshold ? 0 : 255);
            }

            resolve({ imageData, isLightMode });
        });
    }

    /**
     * STEP 2: Edge Boundary Cleanup
     * 
     * This step eliminates noise and artifacts around the image borders by performing
     * a flood-fill operation from all edge pixels. Any dark pixels connected to the
     * image boundary are converted to white, ensuring that only the internal puzzle
     * grid structure remains as dark pixels.
     * 
     * This cleanup is essential for accurate edge detection in step 3, as it removes
     * shadows, background textures, or other artifacts that might interfere with
     * grid boundary identification.
     * 
     * @param {ImageData} imageData - Binary image data from step 1
     * @returns {Promise<ImageData>} The cleaned image data
     * 
     * @example
     * const cleanedImage = await step2_edgeFill(binaryImage);
     */
    function step2_edgeFill(imageData) {
        return new Promise((resolve) => {
            const { width, height, data } = imageData;
            const visited = new Uint8Array(width * height);
            
            /**
             * Flood fill algorithm to eliminate edge-connected dark regions.
             * Uses an iterative approach with a stack to avoid recursion depth issues.
             * 
             * @param {number} startX - Starting X coordinate
             * @param {number} startY - Starting Y coordinate
             */
            const floodFill = (startX, startY) => {
                const stack = [[startX, startY]];
                while (stack.length > 0) {
                    const [x, y] = stack.pop();
                    if (x < 0 || x >= width || y < 0 || y >= height) continue;
                    const flatIndex = y * width + x;
                    if (visited[flatIndex] || data[flatIndex * 4] > 128) continue;
                    visited[flatIndex] = 1;
                    data[flatIndex * 4] = data[flatIndex * 4 + 1] = data[flatIndex * 4 + 2] = 255;
                    stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
                }
            };
            
            // Start flood fill from all border pixels
            for (let i = 0; i < width; i++) {
                floodFill(i, 0); floodFill(i, height - 1);
            }
            for (let i = 0; i < height; i++) {
                floodFill(0, i); floodFill(width - 1, i);
            }
            resolve(imageData);
        });
    }

    /**
     * STEP 3: Grid Detection and Perspective Correction
     * 
     * This is the most complex step, implementing a robust RANSAC-based approach
     * to detect the four edges of the puzzle grid and apply perspective correction.
     * 
     * Process Flow:
     * 1. Scan along grid lines to find edge transition points
     * 2. Apply statistical outlier removal to clean up edge points
     * 3. Use RANSAC to fit robust lines to each edge
     * 4. Calculate intersection points to determine grid corners
     * 5. Compute perspective transform matrix
     * 6. Apply bilinear interpolation to unwarp the image
     * 7. Add border padding for final output
     * 
     * @param {ImageData} processedImageData - Clean binary image from step 2
     * @param {Image} originalInputImage - Original color image for final warping
     * @param {boolean} isLightMode - Color mode for border generation
     * @param {Object} options - Processing options including maxDimension
     * @returns {Promise<ImageData>} The final unwarped square image
     * 
     * @throws {Error} Various specific errors for different failure modes
     */
	async function step3_detectAndUnwarp(processedImageData, originalInputImage, isLightMode, options = {}) {
        return new Promise((resolve, reject) => {
            // Initialize deterministic random number generator for consistent RANSAC results
            const random = mulberry32(1234567);
            
            /**
             * Removes statistical outliers from edge points using IQR method.
             * 
             * Applies the Interquartile Range (IQR) method to remove outliers in both
             * X and Y dimensions. This helps eliminate spurious edge detections that
             * could bias the line fitting process.
             * 
             * @param {Array<Object>} initialPoints - Raw edge points
             * @returns {Array<Object>} Filtered points with outliers removed
             */
            const getRobustEdgePoints = (initialPoints) => {
                let points = [...initialPoints];
                if (points.length > 10) {
                    // Calculate IQR for X coordinates
                    points.sort((a,b) => a.x - b.x);
                    const q1x = points[Math.floor(points.length * 0.25)].x, q3x = points[Math.floor(points.length * 0.75)].x, iqrx = q3x - q1x;
                    
                    // Calculate IQR for Y coordinates
                    points.sort((a,b) => a.y - b.y);
                    const q1y = points[Math.floor(points.length * 0.25)].y, q3y = points[Math.floor(points.length * 0.75)].y, iqry = q3y - q1y;
                    
                    // Define outlier bounds using 1.5 * IQR rule
                    const [lowerX, upperX, lowerY, upperY] = [q1x - 1.5 * iqrx, q3x + 1.5 * iqrx, q1y - 1.5 * iqry, q3y + 1.5 * iqry];
                    points = points.filter(p => p.x >= lowerX && p.x <= upperX && p.y >= lowerY && p.y <= upperY);
                }
                return points;
            };
            
            /**
             * Fits a line to points using least squares method.
             * 
             * Computes the best-fit line through a set of points using the standard
             * least squares linear regression formula. Handles both horizontal and
             * vertical line orientations.
             * 
             * @param {Array<Object>} points - Points to fit line through
             * @param {string} orientation - 'horizontal' or 'vertical'
             * @returns {Object|null} Line parameters {m, b, orientation} or null if degenerate
             */
            const fitLineLeastSquares = (points, orientation = 'horizontal') => {
                let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
                const n = points.length;
                for (const p of points) {
                    const x = orientation === 'horizontal' ? p.x : p.y;
                    const y = orientation === 'horizontal' ? p.y : p.x;
                    sumX += x; sumY += y; sumXY += x * y; sumX2 += x * x;
                }
                const denominator = n * sumX2 - sumX * sumX;
                if (denominator === 0) return null;
                const m = (n * sumXY - sumX * sumY) / denominator;
                const b = (sumY - m * sumX) / n;
                return { m, b, orientation };
            };

            /**
             * Robust line fitting using RANSAC algorithm.
             * 
             * RANSAC (Random Sample Consensus) repeatedly selects random point pairs,
             * fits lines to them, and counts inliers. The line with the most inliers
             * is considered the best fit. This approach is highly resistant to outliers.
             * 
             * @param {Array<Object>} points - Points to fit line through
             * @param {string} orientation - Line orientation for proper coordinate handling
             * @param {number} iterations - Number of RANSAC iterations (default: 50)
             * @param {number} threshold - Distance threshold for inlier classification (default: 3.0)
             * @returns {Object|null} Best fit line parameters or null if insufficient data
             */
            const fitLineRANSAC = (points, orientation, iterations = 50, threshold = 3.0) => {
                if (points.length < 2) return null;
                let bestInliers = [];
                
                // RANSAC iterations
                for (let i = 0; i < iterations; i++) {
                    // Randomly sample two points
                    const sample = [];
                    while (sample.length < 2) {
                        const index = Math.floor(random() * points.length);
                        if (!sample.includes(points[index])) {
                            sample.push(points[index]);
                        }
                    }
                    const [p1, p2] = sample;
                    
                    // Fit line to sample points
                    const p1_x = orientation === 'horizontal' ? p1.x : p1.y, p1_y = orientation === 'horizontal' ? p1.y : p1.x;
                    const p2_x = orientation === 'horizontal' ? p2.x : p2.y, p2_y = orientation === 'horizontal' ? p2.y : p2.x;
                    if (p1_x === p2_x) continue;
                    const m = (p2_y - p1_y) / (p2_x - p1_x), b = p1_y - m * p1_x;
                    
                    // Count inliers using perpendicular distance to line
                    const currentInliers = points.filter(point => {
                        const px = orientation === 'horizontal' ? point.x : point.y, py = orientation === 'horizontal' ? point.y : point.x;
                        return (Math.abs(m * px - py + b) / Math.sqrt(m * m + 1)) < threshold;
                    });

                    // Keep track of best model
                    if (currentInliers.length > bestInliers.length) bestInliers = currentInliers;
                }
                
                // Fit final line to all inliers
                return bestInliers.length >= 2 ? fitLineLeastSquares(bestInliers, orientation) : null;
            };
            
            /**
             * Calculates intersection point of two lines.
             * 
             * Solves the system of linear equations to find where a horizontal
             * and vertical line intersect, which gives us the grid corner coordinates.
             * 
             * @param {Object} lineH - Horizontal line parameters {m, b}
             * @param {Object} lineV - Vertical line parameters {m, b}
             * @returns {Object|null} Intersection point {x, y} or null if parallel/invalid
             */            
            const findIntersection = (lineH, lineV) => {
                if (!lineH || !lineV) return null;
                const { m: mH, b: bH } = lineH, { m: mV, b: bV } = lineV;
                if (1 - mH * mV === 0) return null;
                const y = (mH * bV + bH) / (1 - mH * mV);
                const x = mV * y + bV;
                return { x, y };
            };

            const { width, height, data } = processedImageData;
            
            /**
             * Scans the image to find edge transition points.
             * 
             * Performs systematic scanning either vertically or horizontally to locate
             * the first black pixel encountered from each edge. This gives us candidate
             * points that lie on the puzzle grid boundary.
             * 
             * @param {boolean} isVerticalScan - True for vertical scan lines, false for horizontal
             * @param {boolean} isReverse - True to scan from far edge inward
             * @returns {Array<Object>} Array of detected edge points
             */
            const findEdge = (isVerticalScan, isReverse) => {
                const points = [];
                const numScans = 51; // Number of scan lines to use
                const colorThreshold = 128; // Threshold for black/white classification
                
                // Helper function to check if a pixel is black
                const isBlack = (index) => data[index] < colorThreshold && data[index + 1] < colorThreshold && data[index + 2] < colorThreshold;
                
                const outerMax = isVerticalScan ? width : height;
                const innerMax = isVerticalScan ? height : width;
                
                // Perform scan lines across the image
                for (let i = 1; i <= numScans; i++) {
                    const outerPos = Math.floor(outerMax * (i / (numScans + 1)));
                    for (let j = 0; j < innerMax; j++) {
                        const innerPos = isReverse ? innerMax - 1 - j : j;
                        const x = isVerticalScan ? outerPos : innerPos;
                        const y = isVerticalScan ? innerPos : outerPos;
                        if (isBlack((y * width + x) * 4)) {
                            points.push({x, y});
                            break;
                        }
                    }
                }
                return points;
            };

            // Detect edge points for all four sides of the puzzle grid
            const leftEdgePoints = getRobustEdgePoints(findEdge(false, false));
            const rightEdgePoints = getRobustEdgePoints(findEdge(false, true));
            const topEdgePoints = getRobustEdgePoints(findEdge(true, false));
            const bottomEdgePoints = getRobustEdgePoints(findEdge(true, true));

            // Verify we have sufficient edge points for processing
            if ([topEdgePoints, bottomEdgePoints, leftEdgePoints, rightEdgePoints].some(arr => arr.length < 2)) {
                return reject(new Error("Shape detection failed: Could not detect a complete shape."));
            }
            
            // Fit robust lines to each set of edge points using RANSAC
            const lineTop = fitLineRANSAC(topEdgePoints, 'horizontal'), lineBottom = fitLineRANSAC(bottomEdgePoints, 'horizontal');
            const lineLeft = fitLineRANSAC(leftEdgePoints, 'vertical'), lineRight = fitLineRANSAC(rightEdgePoints, 'vertical');

            // Verify all line fits were successful
            if (!lineTop || !lineBottom || !lineLeft || !lineRight) {
                 return reject(new Error("Line fitting failed: Could not fit lines to all edges."));
            }
            
            // Calculate grid corner points from line intersections
            const corners = [ 
                findIntersection(lineTop, lineLeft), 
                findIntersection(lineTop, lineRight), 
                findIntersection(lineBottom, lineRight), 
                findIntersection(lineBottom, lineLeft) 
            ];

            // Verify all corner calculations were successful
            if (corners.some(c => c === null)) {
                return reject(new Error("Intersection calculation failed: Could not find all corners."));
            }

            // Handle image scaling for performance optimization
            const maxDimension = 1000;
            let scaleRatio = 1.0;
            let imageToUnwarp = originalInputImage;

            // Scale down large images to improve processing speed
            if (originalInputImage.width > maxDimension || originalInputImage.height > maxDimension) {
                scaleRatio = maxDimension / Math.max(originalInputImage.width, originalInputImage.height);
                const newWidth = Math.round(originalInputImage.width * scaleRatio), newHeight = Math.round(originalInputImage.height * scaleRatio);
                const scaledCanvas = document.createElement('canvas');
                scaledCanvas.width = newWidth;
                scaledCanvas.height = newHeight;
                const scaledCtx = scaledCanvas.getContext('2d');
                scaledCtx.imageSmoothingEnabled = true;
                scaledCtx.imageSmoothingQuality = "high";
                scaledCtx.drawImage(originalInputImage, 0, 0, newWidth, newHeight);
                imageToUnwarp = scaledCanvas;
                
                // Scale corner coordinates to match the scaled image
                corners.forEach(corner => { corner.x *= scaleRatio; corner.y *= scaleRatio; });
            }
            
            // Set up output image parameters
            const border = 4; // Border padding for final image
            const outputSize = options.maxDimension; // Total output dimensions
            const imageSize = outputSize - (border * 2); // Active image area

            // Create destination canvas with appropriate background color
            const destCanvas = document.createElement('canvas');
            destCanvas.width = outputSize;
            destCanvas.height = outputSize;
            const destCtx = destCanvas.getContext('2d');
            destCtx.fillStyle = isLightMode ? 'black' : 'white';
            destCtx.fillRect(0, 0, outputSize, outputSize);
            
            // Define the target square coordinates for the unwarped image
            const destinationCorners = [{ x: 0, y: 0 }, { x: imageSize, y: 0 }, { x: imageSize, y: imageSize }, { x: 0, y: imageSize }];
            
            // Calculate the perspective transform matrix
            const transform = getPerspectiveTransform(destinationCorners, corners);
            
            // Create temporary canvas for the unwarped image content
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = imageSize;
            tempCanvas.height = imageSize;
            const tempCtx = tempCanvas.getContext('2d', { willReadFrequently: true });
            
            // Prepare source and destination image data for pixel-level processing
            const srcData = getImageDataFromImage(imageToUnwarp);
            const dstData = tempCtx.createImageData(imageSize, imageSize);
            
            /**
             * Perform perspective correction with bilinear interpolation.
             * 
             * For each pixel in the destination image, we:
             * 1. Apply inverse perspective transform to find source location
             * 2. Use bilinear interpolation to sample smoothly from source image
             * 3. Handle boundary conditions and edge cases
             * 
             * This approach ensures high-quality results without aliasing artifacts.
             */
            for (let y = 0; y < imageSize; y++) {
                for (let x = 0; x < imageSize; x++) {
                    // Find corresponding point in source image
                    const srcPoint = applyTransform({x,y}, transform);
                    
                    // Get the four nearest neighbor pixels for bilinear interpolation
                    const x1=Math.floor(srcPoint.x), y1=Math.floor(srcPoint.y);
                    const x2=x1+1, y2=y1+1;
                    const dstIndex = (y*imageSize+x)*4;
                    
                    // Only interpolate if all neighbors are within image bounds
                    if(x1>=0 && x2<imageToUnwarp.width && y1>=0 && y2<imageToUnwarp.height) {
                        // Calculate interpolation weights
                        const fx=srcPoint.x-x1, fy=srcPoint.y-y1, fx1=1-fx, fy1=1-fy;
                        const w11=fx1*fy1, w12=fx1*fy, w21=fx*fy1, w22=fx*fy;
                        
                        // Get pixel indices for the four neighbors
                        const idx11=(y1*imageToUnwarp.width+x1)*4, idx12=(y2*imageToUnwarp.width+x1)*4, 
                              idx21=(y1*imageToUnwarp.width+x2)*4, idx22=(y2*imageToUnwarp.width+x2)*4;
                        
                        // Perform bilinear interpolation for each color channel
                        for(let c=0;c<4;c++) dstData.data[dstIndex+c] = srcData.data[idx11+c]*w11 + srcData.data[idx21+c]*w21 + srcData.data[idx12+c]*w12 + srcData.data[idx22+c]*w22;
                    }
                }
            }
            
            // Render the unwarped image to temporary canvas and then to final output with border
            tempCtx.putImageData(dstData, 0, 0);
            destCtx.drawImage(tempCanvas, border, border);
            
            // Return the final processed image data
            resolve(destCtx.getImageData(0, 0, outputSize, outputSize));
        });
    }

    // --- Public API ---

    /**
     * Main Image Processing Pipeline
     * 
     * This is the primary entry point for the image normalization system. It orchestrates
     * the entire processing pipeline with built-in error recovery and stability verification.
     * 
     * The function implements a sophisticated multi-pass approach:
     * 1. Initial processing attempt with auto-detected settings
     * 2. Stability verification through multiple iterations
     * 3. Automatic error recovery by switching color modes
     * 4. Final validation and result packaging
     * 
     * Key Features:
     * - Automatic light/dark mode detection with manual override capability
     * - Multi-pass stability verification to ensure consistent results
     * - Intelligent error recovery that tries alternative processing modes
     * - Comprehensive error reporting with specific failure categorization
     * - Progress reporting through callback system
     * 
     * @param {Image} imageObject - The original puzzle image to process
     * @param {function(string)} onUpdate - Callback function for progress updates
     * @param {Object} options - Processing options and parameters
     * @param {number} options.maxDimension - Maximum output image dimension
     * @returns {Promise<Object>} Promise resolving to {finalImageData, processedImageData}
     * 
     * @throws {Error} Various specific errors for different failure conditions:
     *   - Shape detection failures when grid cannot be identified
     *   - Line fitting failures when RANSAC cannot find consistent edges
     *   - Stability failures when multiple passes produce different results
     *   - Fatal errors when no processing mode succeeds
     * 
     * @example
     * try {
     *   const result = await ImageProcessor.processImage(puzzleImage, 
     *     (msg) => console.log(msg), 
     *     { maxDimension: 800 }
     *   );
     *   console.log('Success:', result.finalImageData);
     * } catch (error) {
     *   console.error('Processing failed:', error.message);
     * }
     */
    async function processImage(imageObject, onUpdate = () => {}, options = {}) {

        /**
         * Internal pipeline execution function.
         * 
         * Executes the complete 3-step processing pipeline for a single pass.
         * This function is called multiple times during the stability verification process.
         * 
         * @param {Image} inputImg - Image to process
         * @param {boolean} forceMode - Optional mode override
         * @returns {Promise<Object>} Processing results with metadata
         * 
         * @throws {Error} Propagates errors from individual processing steps
         */
        const executePipeline = async (inputImg, forceMode) => {
            // Step 1: Image preprocessing and mode detection
            const { imageData: processed, isLightMode } = await step1_processPuzzleImage(inputImg, forceMode);
            onUpdate("Step 1/3: Image pre-processed...");
            
            // Step 2: Edge boundary cleanup
            const filled = await step2_edgeFill(processed);
            onUpdate("Step 2/3: Filling edges...");

            // Step 3: Grid detection and perspective correction
            try {
				const finalUnwarped = await step3_detectAndUnwarp(filled, inputImg, isLightMode, options);
                onUpdate("Step 3/3: Unwarping complete...");
                return {
                    resultImageData: finalUnwarped,
                    processedImageData: filled,
                    detectedMode: isLightMode
                };
            } catch (err) {
                // Wrap errors with additional context for error recovery
                const wrappedErr = new Error(err.message || "An error occurred during shape detection.");
                wrappedErr.modeUsed = isLightMode;
                throw wrappedErr;
            }
        };

        // Variables to store final processing results
        let finalResult, finalProcessed;

        try {
            // PRIMARY PROCESSING ATTEMPT
            onUpdate("Initial processing pass...");
            const pass1 = await executePipeline(imageObject, undefined);

            // STABILITY VERIFICATION PASSES
            // Multiple passes ensure the algorithm has converged to a stable solution
            onUpdate("Verifying stability (Pass 2)...");
            const pass1_Image = await getImageFromData(pass1.resultImageData);
            const pass2 = await executePipeline(pass1_Image, undefined);

            onUpdate("Verifying stability (Pass 3)...");
            const pass2_Image = await getImageFromData(pass2.resultImageData);
            const pass3 = await executePipeline(pass2_Image, undefined);
            
            // Compare final two passes for stability (using default threshold of 0.2)
            if (compareImages(pass2.resultImageData, pass3.resultImageData)) {
                onUpdate("Stability confirmed.");
                finalResult = pass1.resultImageData;
                finalProcessed = pass1.processedImageData;
            } else {
                // Create specific stability failure error for recovery logic
                 const stabilityError = new Error("Process did not stabilize.");
                 stabilityError.type = 'STABILITY_FAILURE';
                 stabilityError.modeToFlip = pass1.detectedMode;
                 throw stabilityError;
            }

        } catch (err) {
             // ERROR RECOVERY LOGIC
             // Determine which color mode to try for recovery
             let modeToFlip = err.type === 'STABILITY_FAILURE' ? err.modeToFlip : err.modeUsed;
             onUpdate(`Initial pass failed. Correction: Re-processing with opposite mode...`);
             
             // Fallback mode detection if not available from error
             if (typeof modeToFlip === 'undefined') {
                const { isLightMode } = await step1_processPuzzleImage(imageObject, undefined);
                modeToFlip = isLightMode;
             }

             // Attempt recovery with opposite color mode
             try {
                const correctedPass = await executePipeline(imageObject, !modeToFlip);
                finalResult = correctedPass.resultImageData;
                finalProcessed = correctedPass.processedImageData;
             } catch (correctionErr) {
                 // Both primary and recovery attempts failed - fatal error
                 console.error("Correction attempt also failed:", correctionErr.message);
                 throw new Error("Fatal: Could not process the image in either light or dark mode.");
             }
        }

        // FINAL RESULT VALIDATION AND PACKAGING
        if (finalResult && finalProcessed) {
            return { finalImageData: finalResult, processedImageData: finalProcessed };
        } else {
            throw new Error("An unknown error occurred and the process could not be completed.");
        }
    }

    /**
     * Public API Export
     * 
     * The module exposes only the main processImage function, keeping all
     * internal implementation details private. This provides a clean,
     * easy-to-use interface while maintaining proper encapsulation.
     */
    return {
        processImage
    };

})();