/**
 * speedinvert.js
 *
 * Author: Isaiah Tadrous
 * Version: 1.0.0
 *
 * Description:
 * This script analyzes a grid within an image to determine cell connectivity
 * based on color similarity. If the image's top-left pixel is black AND
 * more than 70% of the adjacent cell pairs are similar in color, the
 * entire image's colors are inverted. Otherwise, the original image is returned.
 *
 * This approach will enable the program to more efficiently prioritize decoding methods,
 * enhancing speed by optimizing the sequence in which different techniques are attempted.
 * It is particularly beneficial for clasifying dark mode puzzles,
 * which the program assumes will less likely require color enhancement.
 *
 */


(function(window) {
    'use strict';

    // Waits for the OpenCV library to be ready before proceeding.
    function cvReady() {
        return new Promise(resolve => {
            const checkCv = () => {
                if (typeof cv !== 'undefined' && cv.imread) resolve();
                else setTimeout(checkCv, 100);
            };
            checkCv();
        });
    }

    // Parses an RGB string (e.g., "rgb(255, 128, 0)") into an object.
    const parseRgb = (rgbString) => {
        const result = rgbString.match(/\d+/g).map(Number);
        return { r: result[0], g: result[1], b: result[2] };
    };

    // Calculates the Euclidean color difference between two RGB colors.
    const colorDifference = (color1, color2) => {
        const dr = color1.r - color2.r;
        const dg = color1.g - color2.g;
        const db = color1.b - color2.b;
        return Math.sqrt(dr * dr + dg * dg + db * db);
    };

    // Finds the most frequent color in an image cell using color quantization.
    function findMostFrequentColor(cellMat) {
        const colorCounts = new Map();
        const quantizationFactor = 32;
        const { rows, cols } = cellMat;

        for (let y = 0; y < rows; y++) {
            for (let x = 0; x < cols; x++) {
                const pixel = cellMat.ucharPtr(y, x);
                const r = pixel[0], g = pixel[1], b = pixel[2];
                const qr = Math.floor(r / quantizationFactor);
                const qg = Math.floor(g / quantizationFactor);
                const qb = Math.floor(b / quantizationFactor);
                const key = `${qr},${qg},${qb}`;
                colorCounts.set(key, (colorCounts.get(key) || 0) + 1);
            }
        }
        if (colorCounts.size === 0) return 'rgb(128, 128, 128)';
        let maxCount = 0;
        let dominantKey = '';
        for (const [key, count] of colorCounts.entries()) {
            if (count > maxCount) {
                maxCount = count;
                dominantKey = key;
            }
        }
        const [qr, qg, qb] = dominantKey.split(',').map(Number);
        const r = Math.round(Math.min(255, qr * quantizationFactor + (quantizationFactor / 2)));
        const g = Math.round(Math.min(255, qg * quantizationFactor + (quantizationFactor / 2)));
        const b = Math.round(Math.min(255, qb * quantizationFactor + (quantizationFactor / 2)));
        return `rgb(${r}, ${g}, ${b})`;
    }

    // Analyzes the color difference between adjacent cells to determine if a black background is part of a "connected" puzzle.
    function analyzeConnectivity(grid, imageMat) {
        const cellColors = [];
        const { gridSize } = grid;
        for (let i = 0; i < gridSize; i++) {
            const rowColors = [];
            for (let j = 0; j < gridSize; j++) {
                const x = Math.round(grid.vGridLines[j]);
                const y = Math.round(grid.hGridLines[i]);
                const width = Math.round(grid.vGridLines[j + 1] - x);
                const height = Math.round(grid.hGridLines[i + 1] - y);
                let dominantColor = 'rgb(128, 128, 128)';
                if (width > 0 && height > 0) {
                    let cellMat;
                    try {
                        cellMat = imageMat.roi(new cv.Rect(x, y, width, height));
                        dominantColor = findMostFrequentColor(cellMat);
                    } finally {
                        if (cellMat) cellMat.delete();
                    }
                }
                rowColors.push(parseRgb(dominantColor));
            }
            cellColors.push(rowColors);
        }
        let connections = 0;
        let totalComparisons = 0;
        const similarityThreshold = 25;
        for (let i = 0; i < gridSize; i++) {
            for (let j = 0; j < gridSize; j++) {
                if (j < gridSize - 1) {
                    totalComparisons++;
                    if (colorDifference(cellColors[i][j], cellColors[i][j + 1]) < similarityThreshold) connections++;
                }
                if (i < gridSize - 1) {
                    totalComparisons++;
                    if (colorDifference(cellColors[i][j], cellColors[i + 1][j]) < similarityThreshold) connections++;
                }
            }
        }
        return (connections / totalComparisons) > 0.8;
    }

    /**
     * Processes an image, checks for a black background, and inverts it if necessary.
     * @param {HTMLImageElement | HTMLCanvasElement} sourceImage - The image to process.
     * @param {object} grid - An object describing the grid lines.
     * @returns {Promise<{canvas: HTMLCanvasElement, success: boolean, inverted: boolean, error?: string}>}
     */
    async function processImageAndInvert(sourceImage, grid) {
        await cvReady();
        
        const outputCanvas = document.createElement('canvas');
        let srcMat;

        try {
            srcMat = cv.imread(sourceImage);
            outputCanvas.width = srcMat.cols;
            outputCanvas.height = srcMat.rows;

            cv.imshow(outputCanvas, srcMat);
            const ctx = outputCanvas.getContext('2d');

            const cornerPixel = ctx.getImageData(0, 0, 1, 1).data;
            const isBlackBackground = cornerPixel[0] < 50 && cornerPixel[1] < 50 && cornerPixel[2] < 50;

            let inverted = false;
            if (isBlackBackground) {
                const shouldInvert = analyzeConnectivity(grid, srcMat);
                    if (shouldInvert) {
                        let invertedMat = new cv.Mat();
                        // Handle images with an alpha channel
                        if (srcMat.channels() === 4) {
                            let channels = new cv.MatVector();
                            cv.split(srcMat, channels);

                            cv.bitwise_not(channels.get(0), channels.get(0));
                            cv.bitwise_not(channels.get(1), channels.get(1));
                            cv.bitwise_not(channels.get(2), channels.get(2));

                            cv.merge(channels, invertedMat);
                            
                            channels.delete();
                        } else {
                            // Standard inversion for images without an alpha channel
                            cv.bitwise_not(srcMat, invertedMat);
                        }
                        
                        cv.imshow(outputCanvas, invertedMat);
                        invertedMat.delete();
                        inverted = true;
                    }
            }
            
            return { canvas: outputCanvas, success: true, inverted: inverted };

        } catch (error) {
            console.error("An error occurred in processImageAndInvert:", error);
            return { canvas: outputCanvas, success: false, inverted: false, error: error.message };
        } finally {
            if (srcMat) srcMat.delete();
        }
    }

    window.processImageAndInvert = processImageAndInvert;

})(window);