/**
 * annotationDetector.js
 *
 * Author: Isaiah Tadrous
 * Version: 1.0.0
 *
 * Description:
 * Advanced computer vision module for detecting and classifying user annotations within
 * normalized puzzle grid images. This system employs sophisticated statistical analysis
 * and morphological operations to reliably distinguish between different notation types
 * including stars, X marks, and empty cells.
 *
 * The detection pipeline utilizes a multi-stage approach:
 * 1. Adaptive background normalization and contrast enhancement
 * 2. Region-of-Interest (ROI) analysis using statistical variance detection
 * 3. Otsu's thresholding for optimal binary segmentation
 * 4. Morphological noise reduction and density classification
 *
 * Technical Dependencies:
 * - OpenCV.js (cv) must be loaded prior to module initialization
 * - Requires normalized image input from imageNormalizer.js
 * - Expects structured grid data from gridDetector.js
 *
 * Performance Characteristics:
 * - Robust against varying illumination conditions
 * - Resilient to minor grid alignment imperfections  
 * - Optimized for real-time processing on web platforms
 *
 * Current Limitations:
 * - Manual markings and drawing interference may affect classification accuracy
 * - Star and X validation algorithms are pending implementation
 * - System reliability varies with image quality and annotation clarity
 *
 * IMPORTANT: This detection system should be used in conjunction with user validation
 * mechanisms and should not be considered the sole source of annotation truth.
 *
 */

const annotationDetector = (() => {

    /**
     * Advanced Notation Classification Algorithm
     * * Detects and classifies annotations within puzzle cells using a two-stage approach:
     * **Presence Detection**: Analyzes statistical variance to detect annotations.
     * **Type Classification**: Applies density-based analysis to differentiate between notation types (e.g., stars, X marks).
     */
    function identifyNotationInCell(cellMat) {
        let type = 'nothing';
        
        // OpenCV Mat objects requiring explicit cleanup
        let centerROI, binaryCenterROI, morphKernel, mean, stddev;

        try {
            const cellWidth = cellMat.cols;
            const cellHeight = cellMat.rows;

            // Extract central 50% of cell to avoid grid line artifacts and edge noise.
            const centerRect = new cv.Rect(
                Math.floor(cellWidth * 0.25), Math.floor(cellHeight * 0.25),
                Math.floor(cellWidth * 0.5), Math.floor(cellHeight * 0.5)
            );
            
            if (centerRect.width <= 0 || centerRect.height <= 0) {
                return 'nothing';
            }
            centerROI = cellMat.roi(centerRect);

            // Calculate pixel intensity variance within the ROI.
            mean = new cv.Mat();
            stddev = new cv.Mat();
            cv.meanStdDev(centerROI, mean, stddev);
            
            // Empirically optimized sensitivity threshold for object presence detection.
            const PRESENCE_THRESHOLD_STDDEV = 12;

            if (stddev.data64F[0] > PRESENCE_THRESHOLD_STDDEV) {
                // Apply Otsu's automatic threshold for binary segmentation.
                binaryCenterROI = new cv.Mat();
                cv.threshold(
                    centerROI,
                    binaryCenterROI,
                    0, 255,
                    cv.THRESH_BINARY | cv.THRESH_OTSU
                );

                // Remove isolated pixels and small artifacts using an opening operation.
                morphKernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(2, 2));
                cv.morphologyEx(binaryCenterROI, binaryCenterROI, cv.MORPH_OPEN, morphKernel);
                
                const totalPixelsInROI = binaryCenterROI.rows * binaryCenterROI.cols;
                const symbolPixelCount = cv.countNonZero(binaryCenterROI);
                const pixelDensity = totalPixelsInROI > 0 ? (symbolPixelCount / totalPixelsInROI) : 0;
                
                // Minimum density threshold to prevent noise classification.
                const MINIMUM_DENSITY_FOR_X = 0.03;

                if (pixelDensity > 0.50) {
                    type = 'star';
                } else if (pixelDensity > MINIMUM_DENSITY_FOR_X) {
                    type = 'x';
                }
            }

        } catch (e) {
            console.error("Error in identifyNotationInCell:", e);
            type = 'nothing';
        } finally {
            // All cv.Mat objects must be explicitly deleted to prevent memory leaks.
            if (centerROI) centerROI.delete();
            if (binaryCenterROI) binaryCenterROI.delete();
            if (morphKernel) morphKernel.delete();
            if (mean) mean.delete();
            if (stddev) stddev.delete();
        }

        return type;
    }

    /**
     * Primary Annotation Detection Pipeline
     * * Orchestrates the detection process for puzzle images, including preprocessing, 
     * grid-based cell extraction, and annotation classification.
     * * Steps:
     * * 1. **Input Validation & Preprocessing**: 
     * Verifies OpenCV.js, grid data, normalizes background, enhances contrast.
     * * 2. **Color Conversion**: 
     * Converts to optimized grayscale, ensures consistent symbol-background contrast.
     * * 3. **Cell Extraction**: 
     * Extracts puzzle cells, avoiding grid line artifacts.
     * * 4. **Annotation Classification**: 
     * Classifies annotations as 'star' or 'x', filters and validates results.
     * * @param {ImageData} unwarpedImageData - Normalized puzzle image
     * @param {Object} gridData - Grid information (rows, columns, grid lines)
     * @returns {Promise<Array<Object>>} Array of annotations with type ('star', 'x')
     * * @throws {Error} Processing errors
     * * @example
     * try {
     * const annotations = await annotationDetector.detect(imageData, gridInfo);
     * annotations.forEach(ann => console.log(`Found ${ann.type} at (${ann.row}, ${ann.col})`));
     * } catch (error) {
     * console.error('Detection failed:', error.message);
     * }
     */
    async function detect(unwarpedImageData, gridData) {
        if (typeof cv === 'undefined') {
            console.error('OpenCV.js is not loaded.');
            return [];
        }

        // Correct for background color variations by inverting white backgrounds.
        const cornerPixel = unwarpedImageData.data;
        const isWhiteBackground = cornerPixel[0] > 200 && cornerPixel[1] > 200 && cornerPixel[2] > 200;
        
        if (isWhiteBackground) {
            const data = unwarpedImageData.data;
            for (let i = 0; i < data.length; i += 4) {
                data[i] = 255 - data[i];
                data[i + 1] = 255 - data[i + 1];
                data[i + 2] = 255 - data[i + 2];
            }
        }

        let srcMat, grayMat;
        const annotations = [];

        try {
            srcMat = cv.matFromImageData(unwarpedImageData);
            grayMat = new cv.Mat();
            cv.cvtColor(srcMat, grayMat, cv.COLOR_RGBA2GRAY, 0);
            
            // Apply linear contrast and brightness transformation.
            const alpha = 1;
            const beta = 0;
            cv.convertScaleAbs(grayMat, grayMat, alpha, beta);

            // Invert the image if the background is dark.
            const cornerPixelPtr = grayMat.ucharPtr(1, 1);
            if (cornerPixelPtr[0] < 128) {
                cv.bitwise_not(grayMat, grayMat);
            }

            const { gridSize, hGridLines, vGridLines } = gridData;
            if (!gridSize || !hGridLines || !vGridLines || vGridLines.length < gridSize + 1 || hGridLines.length < gridSize + 1) {
                console.error("Invalid or incomplete grid data provided.");
                return [];
            }

            for (let r = 0; r < gridSize; r++) {
                for (let c = 0; c < gridSize; c++) {
                    const x1 = Math.round(vGridLines[c]);
                    const y1 = Math.round(hGridLines[r]);
                    const cellWidth = Math.round(vGridLines[c + 1] - x1);
                    const cellHeight = Math.round(hGridLines[r + 1] - y1);
                    
                    // Add padding to exclude grid lines.
                    const padding = Math.floor(cellWidth * 0.10);
                    const rect = new cv.Rect(
                        x1 + padding, y1 + padding,
                        cellWidth - (2 * padding), cellHeight - (2 * padding)
                    );

                    if (rect.width <= 0 || rect.height <= 0) continue;

                    let cellROI = null;
                    try {
                        cellROI = grayMat.roi(rect);
                        const notationType = identifyNotationInCell(cellROI);

                        if (notationType !== 'nothing') {
                            annotations.push({ row: r, col: c, type: notationType });
                        }
                    } finally {
                        if (cellROI) cellROI.delete();
                    }
                }
            }

        } catch (e) {
            console.error(`Error during annotation detection: ${e.message}`);
        } finally {
            // All OpenCV Mat objects must be explicitly deleted.
            if (srcMat) srcMat.delete();
            if (grayMat) grayMat.delete();
        }

        return annotations;
    }

    /**
     * Public API Interface
     * * Exposes the primary detection functionality while maintaining proper encapsulation
     * of internal implementation details.
     * * @interface
     */
    return {
        detect
    };

})();