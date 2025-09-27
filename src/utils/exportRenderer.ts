import { saveAs } from 'file-saver';
import type { 
  ExportDataBundle, 
  PngExportSettings, 
  VideoExportSettings, 
  SessionExportSettings,
  TextExportSettings,
  JsonExportSettings,
  HtmlExportSettings,
  ExportProgress 
} from '../types/export';
import type { Cell } from '../types';
import { setupTextRendering } from './canvasTextRendering';
import { calculateAdaptiveGridColor } from './gridColor';

/**
 * High-quality export renderer for ASCII Motion
 * Handles PNG, MP4, and Session exports with optimal quality settings
 */
export class ExportRenderer {
  private progressCallback?: (progress: ExportProgress) => void;

  constructor(progressCallback?: (progress: ExportProgress) => void) {
    this.progressCallback = progressCallback;
  }

  /**
   * Export current frame as PNG image
   */
  async exportPng(
    data: ExportDataBundle, 
    settings: PngExportSettings, 
    filename: string
  ): Promise<void> {
    this.updateProgress('Preparing PNG export...', 0);

    try {
      // Get current frame data
      const currentFrame = data.frames[data.currentFrameIndex]?.data || data.canvasData;
      
      // Create high-resolution canvas for export
      const exportCanvas = this.createExportCanvas(
        data.canvasDimensions.width,
        data.canvasDimensions.height,
        settings.sizeMultiplier,
        data.fontMetrics,
        data.typography
      );

      this.updateProgress('Rendering canvas...', 30);

      // Render the frame
      await this.renderFrame(
        exportCanvas.canvas,
        currentFrame,
        data.canvasDimensions.width,
        data.canvasDimensions.height,
        {
          backgroundColor: data.canvasBackgroundColor,
          showGrid: settings.includeGrid && data.showGrid,
          fontMetrics: data.fontMetrics,
          typography: data.typography,
          sizeMultiplier: settings.sizeMultiplier,
          theme: data.uiState.theme,
          scale: exportCanvas.scale
        }
      );

      this.updateProgress('Converting to PNG...', 70);

      // Convert to blob and download
      const blob = await this.canvasToBlob(exportCanvas.canvas, 'image/png');
      
      this.updateProgress('Saving file...', 90);
      
      saveAs(blob, `${filename}.png`);
      
      this.updateProgress('Export complete!', 100);
    } catch (error) {
      console.error('PNG export failed:', error);
      throw new Error(`PNG export failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Export animation as video (WebM/MP4)
   */
  async exportVideo(
    data: ExportDataBundle, 
    settings: VideoExportSettings, 
    filename: string
  ): Promise<void> {
    this.updateProgress('Preparing video export...', 0);

    try {
      // Check if we have frames to export
      if (data.frames.length === 0) {
        throw new Error('No frames to export');
      }

      // Check WebCodecs support for WebM
      if (settings.format === 'webm' && !this.supportsWebCodecs()) {
        throw new Error('WebCodecs is not supported in your browser. Please use a modern Chrome, Edge, or Safari browser, or switch to MP4 format.');
      }

      this.updateProgress('Setting up video encoder...', 10);

      if (settings.format === 'webm') {
        await this.exportWebMVideo(data, settings, filename);
      } else {
        // MP4 fallback using canvas frame capture and blob creation
        await this.exportMP4Fallback(data, settings, filename);
      }
      
    } catch (error) {
      console.error('Video export failed:', error);
      throw error;
    }
  }

  /**
   * Export complete session as JSON file
   */
  async exportSession(
    data: ExportDataBundle, 
    settings: SessionExportSettings, 
    filename: string
  ): Promise<void> {
    this.updateProgress('Preparing session export...', 0);

    try {
      this.updateProgress('Serializing data...', 30);

      // Create session data structure
      const sessionData = {
        version: '1.0.0',
        metadata: settings.includeMetadata ? {
          exportedAt: new Date().toISOString(),
          exportVersion: '1.0.0',
          userAgent: navigator.userAgent
        } : undefined,
        canvas: {
          width: data.canvasDimensions.width,
          height: data.canvasDimensions.height,
          canvasBackgroundColor: data.canvasBackgroundColor,
          showGrid: data.showGrid
        },
        animation: {
          frames: data.frames.map(frame => ({
            id: frame.id,
            name: frame.name,
            duration: frame.duration,
            data: Object.fromEntries(frame.data.entries())
          })),
          currentFrameIndex: data.currentFrameIndex,
          frameRate: data.frameRate,
          looping: data.looping
        },
        tools: {
          activeTool: data.toolState.activeTool,
          selectedCharacter: data.toolState.selectedCharacter,
          selectedColor: data.toolState.selectedColor,
          selectedBgColor: data.toolState.selectedBgColor,
          paintBucketContiguous: data.toolState.paintBucketContiguous,
          rectangleFilled: data.toolState.rectangleFilled
        },
        ui: {
          theme: data.uiState.theme,
          zoom: data.uiState.zoom,
          panOffset: data.uiState.panOffset,
          fontMetrics: data.fontMetrics
        },
        typography: {
          fontSize: data.typography.fontSize,
          characterSpacing: data.typography.characterSpacing,
          lineSpacing: data.typography.lineSpacing
        }
      };

      this.updateProgress('Converting to JSON...', 70);

      // Convert to JSON string
      const jsonString = JSON.stringify(sessionData, null, 2);
      
      this.updateProgress('Creating file...', 90);

      // Create blob and download
      const blob = new Blob([jsonString], { type: 'application/json' });
      saveAs(blob, `${filename}.asciimtn`);
      
      this.updateProgress('Export complete!', 100);
    } catch (error) {
      console.error('Session export failed:', error);
      throw new Error(`Session export failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Export animation frames as simple text
   */
  async exportText(
    data: ExportDataBundle, 
    settings: TextExportSettings, 
    filename: string
  ): Promise<void> {
    this.updateProgress('Preparing text export...', 0);

    try {
      this.updateProgress('Processing frames...', 20);

      const textLines: string[] = [];

      // Add metadata header if requested
      if (settings.includeMetadata) {
        textLines.push('ASCII Motion Text Export');
        textLines.push(`Version: ${data.metadata.version}`);
        textLines.push(`Export Date: ${data.metadata.exportDate}`);
        textLines.push(`Frames: ${data.frames.length}`);
        textLines.push(`Canvas Size: ${data.canvasDimensions.width}x${data.canvasDimensions.height}`);
        textLines.push('');
        textLines.push('---');
        textLines.push('');
      }

      // Process each frame
      for (let frameIndex = 0; frameIndex < data.frames.length; frameIndex++) {
        const frame = data.frames[frameIndex];
        const frameData = frame.data;

        this.updateProgress(`Processing frame ${frameIndex + 1}...`, 20 + (frameIndex / data.frames.length) * 60);

        // Convert frame to 2D array of characters
        const grid: string[][] = [];
        for (let y = 0; y < data.canvasDimensions.height; y++) {
          grid[y] = [];
          for (let x = 0; x < data.canvasDimensions.width; x++) {
            const cellKey = `${x},${y}`;
            const cell = frameData.get(cellKey);
            grid[y][x] = cell?.char || ' '; // Use space for empty cells
          }
        }

        // Apply cropping settings
        let processedGrid = this.cropGrid(grid, settings);

        // Convert grid to text lines
        const frameTextLines = processedGrid.map(row => {
          let line = row.join('');
          // Apply trailing space removal if enabled
          if (settings.removeTrailingSpaces) {
            line = line.replace(/\s+$/, '');
          }
          return line;
        });

        // Add frame text to output
        textLines.push(...frameTextLines);

        // Add frame separator (except for last frame)
        if (frameIndex < data.frames.length - 1) {
          textLines.push('');
          textLines.push(',');
          textLines.push('');
        }
      }

      this.updateProgress('Creating text file...', 90);

      // Join all lines with newlines and create blob
      const textContent = textLines.join('\n');
      const blob = new Blob([textContent], { type: 'text/plain; charset=utf-8' });
      
      this.updateProgress('Saving file...', 95);
      
      saveAs(blob, `${filename}.txt`);
      
      this.updateProgress('Export complete!', 100);
    } catch (error) {
      console.error('Text export failed:', error);
      throw new Error(`Text export failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Export project data as human-readable JSON
   */
  async exportJson(
    data: ExportDataBundle, 
    settings: JsonExportSettings, 
    filename: string
  ): Promise<void> {
    this.updateProgress('Preparing JSON export...', 0);

    try {
      this.updateProgress('Serializing project data...', 30);

      // Create frames with text content and separate color data
      const frames: any[] = [];

      data.frames.forEach((frame, index) => {
        this.updateProgress(`Processing frame ${index + 1}...`, 30 + (index / data.frames.length) * 40);
        
        // Build frame content as text lines
        const lines: string[] = [];
        const foregroundColors: { [key: string]: string } = {};
        const backgroundColors: { [key: string]: string } = {};

        // Process each row
        for (let y = 0; y < data.canvasDimensions.height; y++) {
          let line = '';
          
          for (let x = 0; x < data.canvasDimensions.width; x++) {
            const cellKey = `${x},${y}`;
            const cell = frame.data.get(cellKey);
            
            const character = cell?.char || ' ';
            const fgColor = cell?.color || '#FFFFFF';
            const bgColor = cell?.bgColor || 'transparent';

            // Add character to line
            line += character;

            // Store color data only for non-empty/non-space cells
            if (character !== ' ' && character !== '') {
              if (fgColor !== '#FFFFFF') {
                foregroundColors[`${x},${y}`] = fgColor;
              }
              if (bgColor !== 'transparent' && bgColor !== '#000000') {
                backgroundColors[`${x},${y}`] = bgColor;
              }
            }
          }
          
          // Remove trailing spaces from line
          lines.push(line.replace(/\s+$/, ''));
        }

        // Remove trailing empty lines
        while (lines.length > 0 && lines[lines.length - 1] === '') {
          lines.pop();
        }

        // Create frame object
        const frameData: any = {
          title: `Frame ${index}`,
          duration: frame.duration,
          content: lines.join('\n')
        };

        // Add color data if present
        if (Object.keys(foregroundColors).length > 0 || Object.keys(backgroundColors).length > 0) {
          frameData.colors = {};
          
          if (Object.keys(foregroundColors).length > 0) {
            frameData.colors.foreground = foregroundColors;
          }
          
          if (Object.keys(backgroundColors).length > 0) {
            frameData.colors.background = backgroundColors;
          }
        }

        frames.push(frameData);
      });

      // Create the final JSON structure
      const jsonData: any = {
        ...(settings.includeMetadata && {
          metadata: {
            exportedAt: new Date().toISOString(),
            exportVersion: '1.0.0',
            appVersion: data.metadata.version,
            description: 'ASCII Motion Animation - Human Readable Format',
            title: filename,
            frameCount: data.frames.length,
            canvasSize: {
              width: data.canvasDimensions.width,
              height: data.canvasDimensions.height
            }
          }
        }),

        canvas: {
          width: data.canvasDimensions.width,
          height: data.canvasDimensions.height,
          backgroundColor: data.canvasBackgroundColor
        },

        typography: {
          fontSize: data.typography.fontSize,
          characterSpacing: data.typography.characterSpacing,
          lineSpacing: data.typography.lineSpacing
        },

        animation: {
          frameRate: data.frameRate,
          looping: data.looping,
          currentFrame: data.currentFrameIndex
        },

        frames
      };

      this.updateProgress('Converting to JSON...', 80);

      // Convert to JSON string with formatting
      const jsonString = settings.humanReadable 
        ? JSON.stringify(jsonData, null, 2)
        : JSON.stringify(jsonData);
      
      this.updateProgress('Creating file...', 90);

      // Create blob and download
      const blob = new Blob([jsonString], { type: 'application/json' });
      saveAs(blob, `${filename}.json`);
      
      this.updateProgress('Export complete!', 100);
    } catch (error) {
      console.error('JSON export failed:', error);
      throw new Error(`JSON export failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Export animation as standalone HTML file with inline CSS/JS
   */
  async exportHtml(
    data: ExportDataBundle, 
    settings: HtmlExportSettings, 
    filename: string
  ): Promise<void> {
    this.updateProgress('Preparing HTML export...', 0);

    try {
      this.updateProgress('Generating HTML structure...', 20);

      // Prepare frame data as JSON for JavaScript
      const frameDataJson = JSON.stringify(data.frames.map(frame => {
        const frameGrid: string[][] = [];
        const colorGrid: string[][] = [];
        const bgColorGrid: string[][] = [];
        
        // Initialize grids
        for (let y = 0; y < data.canvasDimensions.height; y++) {
          frameGrid[y] = [];
          colorGrid[y] = [];
          bgColorGrid[y] = [];
          for (let x = 0; x < data.canvasDimensions.width; x++) {
            const cellKey = `${x},${y}`;
            const cell = frame.data.get(cellKey);
            frameGrid[y][x] = cell?.char || ' ';
            colorGrid[y][x] = cell?.color || '#FFFFFF';
            bgColorGrid[y][x] = cell?.bgColor || 'transparent';
          }
        }
        
        return {
          id: frame.id,
          name: frame.name,
          duration: frame.duration,
          characters: frameGrid,
          colors: colorGrid,
          backgrounds: bgColorGrid
        };
      }));

      this.updateProgress('Building CSS styles...', 40);

      const animationDuration = (data.frames.reduce((sum, frame) => sum + frame.duration, 0) / 1000) / settings.animationSpeed;

      // Generate complete HTML document
      const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${filename} - ASCII Motion Animation</title>
    <style>
        body {
            margin: 0;
            padding: 20px;
            background-color: ${settings.backgroundColor};
            font-family: ${settings.fontFamily}, monospace;
            font-size: ${settings.fontSize}px;
            line-height: 1;
            overflow: auto;
            color: #FFFFFF;
        }
        
        .animation-container {
            display: inline-block;
            white-space: pre;
            border: 1px solid rgba(255,255,255,0.2);
            padding: 10px;
            background-color: ${data.canvasBackgroundColor};
            position: relative;
        }
        
        .frame {
            position: absolute;
            top: 10px;
            left: 10px;
            opacity: 0;
            white-space: pre;
            font-family: inherit;
            font-size: inherit;
            line-height: inherit;
        }
        
        .frame.active {
            opacity: 1;
        }
        
        .controls {
            margin-top: 20px;
            text-align: center;
        }
        
        .controls button {
            background: rgba(255,255,255,0.1);
            border: 1px solid rgba(255,255,255,0.3);
            color: white;
            padding: 8px 16px;
            margin: 0 4px;
            cursor: pointer;
            font-family: inherit;
        }
        
        .controls button:hover {
            background: rgba(255,255,255,0.2);
        }
        
        .info {
            margin-top: 10px;
            font-size: 12px;
            color: rgba(255,255,255,0.7);
            text-align: center;
        }
    </style>
</head>
<body>
    <div class="animation-container" id="animationContainer">
        <!-- Frames will be inserted here by JavaScript -->
    </div>
    
    <div class="controls">
        <button onclick="togglePlay()">Play/Pause</button>
        <button onclick="resetAnimation()">Reset</button>
        <button onclick="changeSpeed(0.5)">0.5x</button>
        <button onclick="changeSpeed(1)">1x</button>
        <button onclick="changeSpeed(2)">2x</button>
    </div>
    
    <div class="info">
        ${settings.includeMetadata ? `
        <div>ASCII Motion Animation</div>
        <div>Frames: ${data.frames.length} | Duration: ${animationDuration.toFixed(1)}s</div>
        <div>Resolution: ${data.canvasDimensions.width}×${data.canvasDimensions.height}</div>
        <div>Exported: ${new Date().toLocaleDateString()}</div>
        ` : ''}
    </div>

    <script>
        const frameData = ${frameDataJson};
        let currentFrameIndex = 0;
        let animationInterval;
        let isPlaying = true;
        let speedMultiplier = ${settings.animationSpeed};
        
        // Create frame elements
        function initializeFrames() {
            const container = document.getElementById('animationContainer');
            
            frameData.forEach((frame, index) => {
                const frameDiv = document.createElement('div');
                frameDiv.className = 'frame';
                frameDiv.id = 'frame-' + index;
                
                // Build frame content with proper styling
                let frameContent = '';
                for (let y = 0; y < frame.characters.length; y++) {
                    for (let x = 0; x < frame.characters[y].length; x++) {
                        const char = frame.characters[y][x];
                        const color = frame.colors[y][x];
                        const bgColor = frame.backgrounds[y][x];
                        
                        if (char !== ' ' || bgColor !== 'transparent') {
                            const span = '<span style="color: ' + color + 
                                       (bgColor !== 'transparent' ? '; background-color: ' + bgColor : '') +
                                       '">' + (char === ' ' ? '&nbsp;' : char.replace(/</g, '&lt;').replace(/>/g, '&gt;')) + '</span>';
                            frameContent += span;
                        } else {
                            frameContent += '&nbsp;';
                        }
                    }
                    if (y < frame.characters.length - 1) {
                        frameContent += '\\n';
                    }
                }
                
                frameDiv.innerHTML = frameContent;
                container.appendChild(frameDiv);
            });
        }
        
        function showFrame(index) {
            // Hide all frames
            document.querySelectorAll('.frame').forEach(frame => {
                frame.classList.remove('active');
            });
            
            // Show current frame
            const currentFrame = document.getElementById('frame-' + index);
            if (currentFrame) {
                currentFrame.classList.add('active');
            }
        }
        
        function nextFrame() {
            if (frameData.length === 0) return;
            
            const currentFrame = frameData[currentFrameIndex];
            const frameDuration = currentFrame.duration / speedMultiplier;
            
            showFrame(currentFrameIndex);
            currentFrameIndex = (currentFrameIndex + 1) % frameData.length;
            
            if (isPlaying) {
                animationInterval = setTimeout(nextFrame, frameDuration);
            }
        }
        
        function startAnimation() {
            if (!isPlaying) {
                isPlaying = true;
                nextFrame();
            }
        }
        
        function stopAnimation() {
            isPlaying = false;
            if (animationInterval) {
                clearTimeout(animationInterval);
            }
        }
        
        function togglePlay() {
            if (isPlaying) {
                stopAnimation();
            } else {
                startAnimation();
            }
        }
        
        function resetAnimation() {
            stopAnimation();
            currentFrameIndex = 0;
            showFrame(0);
        }
        
        function changeSpeed(multiplier) {
            speedMultiplier = multiplier;
            if (isPlaying) {
                stopAnimation();
                startAnimation();
            }
        }
        
        // Initialize the animation
        window.onload = function() {
            initializeFrames();
            if (frameData.length > 0) {
                showFrame(0);
                setTimeout(startAnimation, 500); // Small delay before starting
            }
        };
    </script>
</body>
</html>`;

      this.updateProgress('Creating file...', 90);

      // Create blob and download
      const blob = new Blob([htmlContent], { type: 'text/html' });
      saveAs(blob, `${filename}.html`);
      
      this.updateProgress('Export complete!', 100);
    } catch (error) {
      console.error('HTML export failed:', error);
      throw new Error(`HTML export failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Crop grid based on text export settings
   */
  private cropGrid(grid: string[][], settings: TextExportSettings): string[][] {
    let processedGrid = [...grid.map(row => [...row])];

    // Remove leading lines
    if (settings.removeLeadingLines) {
      while (processedGrid.length > 0 && processedGrid[0].every(char => char === ' ')) {
        processedGrid.shift();
      }
    }

    // Remove trailing lines
    if (settings.removeTrailingLines) {
      while (processedGrid.length > 0 && processedGrid[processedGrid.length - 1].every(char => char === ' ')) {
        processedGrid.pop();
      }
    }

    // Remove leading spaces (find leftmost non-space character across all rows)
    if (settings.removeLeadingSpaces) {
      let leftmostColumn = Infinity;
      
      // Find the leftmost column with any non-space character
      for (const row of processedGrid) {
        for (let col = 0; col < row.length; col++) {
          if (row[col] !== ' ') {
            leftmostColumn = Math.min(leftmostColumn, col);
            break;
          }
        }
      }

      // Remove leading columns if we found any content
      if (leftmostColumn !== Infinity && leftmostColumn > 0) {
        processedGrid = processedGrid.map(row => row.slice(leftmostColumn));
      }
    }

    return processedGrid;
  }

  /**
   * Create a high-resolution canvas for export with DPI scaling
   */
  private createExportCanvas(
    gridWidth: number,
    gridHeight: number,
    sizeMultiplier: number,
    fontMetrics: any,
    typography: any
  ): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; scale: number } {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    if (!ctx) {
      throw new Error('Failed to create canvas context');
    }

    // Calculate cell dimensions using actual typography settings
    // Use typography.fontSize instead of fontMetrics.fontSize for accurate sizing
    const actualFontSize = typography?.fontSize || fontMetrics?.fontSize || 16;
    const characterSpacing = typography?.characterSpacing || 1.0;
    const lineSpacing = typography?.lineSpacing || 1.0;
    
    // Calculate base character dimensions from actual font size
    const baseCharWidth = actualFontSize * 0.6; // Standard monospace aspect ratio
    const baseCharHeight = actualFontSize;
    
    // Apply spacing multipliers and size multiplier
    const baseCellWidth = baseCharWidth * characterSpacing * sizeMultiplier;
    const baseCellHeight = baseCharHeight * lineSpacing * sizeMultiplier;
    
    // Calculate display dimensions
    const displayWidth = Math.max(gridWidth * baseCellWidth, 1);
    const displayHeight = Math.max(gridHeight * baseCellHeight, 1);
    
    // Use device pixel ratio for high-DPI export (minimum 2x for crisp exports)
    const devicePixelRatio = Math.max(window.devicePixelRatio || 1, 2);
    
    // Set canvas internal resolution to match device pixel ratio
    canvas.width = displayWidth * devicePixelRatio;
    canvas.height = displayHeight * devicePixelRatio;
    
    // Scale the drawing context to match the device pixel ratio
    ctx.scale(devicePixelRatio, devicePixelRatio);
    
    // Setup high-quality rendering
    setupTextRendering(ctx);
    
    return { canvas, ctx, scale: devicePixelRatio };
  }

  /**
   * Render a single frame to canvas
   */
  private async renderFrame(
    canvas: HTMLCanvasElement,
    frameData: Map<string, Cell>,
    gridWidth: number,
    gridHeight: number,
    options: {
      backgroundColor: string;
      showGrid: boolean;
      fontMetrics: any;
      typography: any;
      sizeMultiplier: number;
      theme: string;
      scale?: number;
    }
  ): Promise<void> {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('No canvas context');

    const { backgroundColor, showGrid, fontMetrics, typography, sizeMultiplier, theme } = options;
    
    // Calculate cell dimensions using actual typography settings
    const actualFontSize = typography?.fontSize || fontMetrics?.fontSize || 16;
    const characterSpacing = typography?.characterSpacing || 1.0;
    const lineSpacing = typography?.lineSpacing || 1.0;
    
    // Calculate character dimensions with spacing
    const baseCharWidth = actualFontSize * 0.6; // Standard monospace aspect ratio
    const baseCharHeight = actualFontSize;
    
    const cellWidth = baseCharWidth * characterSpacing * sizeMultiplier;
    const cellHeight = baseCharHeight * lineSpacing * sizeMultiplier;
    
    // Clear canvas with background color
    ctx.fillStyle = backgroundColor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Draw grid if enabled
    if (showGrid) {
      this.drawGrid(ctx, gridWidth, gridHeight, cellWidth, cellHeight, backgroundColor, theme);
    }
    
    // Setup font for text rendering using actual typography settings
    const exportFontSize = actualFontSize * sizeMultiplier;
    const fontFamily = fontMetrics?.fontFamily || 'SF Mono, Monaco, Inconsolata, "Roboto Mono", Consolas, "Courier New"';
    ctx.font = `${exportFontSize}px '${fontFamily}', monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    // Draw all cells
    frameData.forEach((cell, key) => {
      const [x, y] = key.split(',').map(Number);
      this.drawExportCell(ctx, x, y, cell, cellWidth, cellHeight);
    });
  }

  /**
   * Draw grid lines for export
   */
  private drawGrid(
    ctx: CanvasRenderingContext2D,
    gridWidth: number,
    gridHeight: number,
    cellWidth: number,
    cellHeight: number,
    backgroundColor: string,
    theme: string
  ): void {
    const gridColor = calculateAdaptiveGridColor(backgroundColor, theme as 'light' | 'dark');
    ctx.strokeStyle = gridColor;
    ctx.lineWidth = 1;
    
    ctx.beginPath();
    
    // Vertical lines
    for (let x = 0; x <= gridWidth; x++) {
      const xPos = x * cellWidth;
      ctx.moveTo(xPos, 0);
      ctx.lineTo(xPos, gridHeight * cellHeight);
    }
    
    // Horizontal lines
    for (let y = 0; y <= gridHeight; y++) {
      const yPos = y * cellHeight;
      ctx.moveTo(0, yPos);
      ctx.lineTo(gridWidth * cellWidth, yPos);
    }
    
    ctx.stroke();
  }

  /**
   * Draw a single cell for export
   */
  private drawExportCell(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    cell: Cell,
    cellWidth: number,
    cellHeight: number
  ): void {
    const pixelX = x * cellWidth;
    const pixelY = y * cellHeight;
    
    // Draw background if specified
    if (cell.bgColor && cell.bgColor !== 'transparent') {
      ctx.fillStyle = cell.bgColor;
      ctx.fillRect(pixelX, pixelY, cellWidth, cellHeight);
    }
    
    // Draw character
    if (cell.char && cell.char.trim()) {
      ctx.fillStyle = cell.color || '#FFFFFF';
      ctx.fillText(
        cell.char,
        pixelX + cellWidth / 2,
        pixelY + cellHeight / 2
      );
    }
  }

  /**
   * Convert canvas to blob
   */
  private canvasToBlob(canvas: HTMLCanvasElement, type: string): Promise<Blob> {
    // Check if canvas has valid dimensions
    if (canvas.width <= 0 || canvas.height <= 0) {
      throw new Error(`Invalid canvas dimensions: ${canvas.width}x${canvas.height}`);
    }

    // Check if canvas is too large (some browsers have limits)
    const maxDimension = 32767; // Common browser limit
    if (canvas.width > maxDimension || canvas.height > maxDimension) {
      throw new Error(`Canvas dimensions too large: ${canvas.width}x${canvas.height}. Max: ${maxDimension}x${maxDimension}`);
    }

    return new Promise((resolve, reject) => {
      try {
        canvas.toBlob((blob) => {
          if (blob) {
            resolve(blob);
          } else {
            reject(new Error('Failed to create blob from canvas - toBlob returned null'));
          }
        }, type);
      } catch (error) {
        reject(new Error(`Canvas toBlob failed: ${error instanceof Error ? error.message : String(error)}`));
      }
    });
  }

  /**
   * Check if WebCodecs is supported in the current browser
   */
  private supportsWebCodecs(): boolean {
    return typeof window !== 'undefined' && 
           'VideoEncoder' in window && 
           'VideoFrame' in window;
  }

  /**
   * Export video using WebCodecs API (WebM format)
   */
  private async exportWebMVideo(
    data: ExportDataBundle,
    settings: VideoExportSettings,
    filename: string
  ): Promise<void> {
    this.updateProgress('Creating video frames...', 20);
    
    // Generate frame canvases
    const frameCanvases = await this.generateVideoFrames(data, settings);
    
    if (frameCanvases.length === 0) {
      throw new Error('No frames generated for video export');
    }
    
    this.updateProgress('Encoding video...', 50);
    
    try {
      // Use WebCodecs to create WebM video
      const videoBlob = await this.encodeWebMVideo(frameCanvases, settings);
      
      this.updateProgress('Saving video file...', 90);
      
      saveAs(videoBlob, `${filename}.webm`);
      
      this.updateProgress('Video export complete!', 100);
      
    } catch (error) {
      console.error('❌ Video encoding failed:', error);
      throw error;
    } finally {
      // Clean up canvas resources
      frameCanvases.forEach(canvas => {
        canvas.width = 0;
        canvas.height = 0;
      });
    }
  }

  /**
   * Export video using FFmpeg.wasm (H.264 MP4)
   */
  private async exportMP4Fallback(
    data: ExportDataBundle,
    settings: VideoExportSettings,
    filename: string
  ): Promise<void> {
    this.updateProgress('Initializing FFmpeg...', 10);
    
    try {
      // Dynamic import of FFmpeg
      const { FFmpeg } = await import('@ffmpeg/ffmpeg');
      const { fetchFile } = await import('@ffmpeg/util');
      
      const ffmpeg = new FFmpeg();
      
      // Load FFmpeg core with better error handling
      this.updateProgress('Loading FFmpeg core...', 15);
      
      try {
        // Use default FFmpeg loading which handles worker files properly
        await ffmpeg.load();
      } catch (loadError) {
        console.error('Failed to load FFmpeg:', loadError);
        throw new Error(`Failed to initialize FFmpeg: ${loadError instanceof Error ? loadError.message : String(loadError)}`);
      }
      
      this.updateProgress('Generating frames...', 20);
      
      // Generate frame canvases
      const frameCanvases = await this.generateVideoFrames(data, settings);
      
      if (frameCanvases.length === 0) {
        throw new Error('No frames generated for MP4 export');
      }
      
      this.updateProgress('Converting frames to images...', 40);
      
      // Convert canvases to PNG files for FFmpeg
      for (let i = 0; i < frameCanvases.length; i++) {
        const canvas = frameCanvases[i];
        const blob = await this.canvasToBlob(canvas, 'image/png');
        const frameData = await fetchFile(blob);
        
        // Write frame to FFmpeg file system with zero-padded name
        const frameName = `frame${i.toString().padStart(6, '0')}.png`;
        await ffmpeg.writeFile(frameName, frameData);
        
        // Update progress during frame conversion
        const progress = 40 + (i / frameCanvases.length) * 20; // 40-60%
        this.updateProgress(`Converting frame ${i + 1}/${frameCanvases.length}...`, progress);
      }
      
      this.updateProgress('Encoding H.264 MP4 video...', 70);
      
      // Build FFmpeg command based on your specification
      const inputPattern = 'frame%06d.png';
      const outputFilename = 'output.mp4';
      
      // Calculate frame rate (FFmpeg needs frames per second)
      const framerate = settings.frameRate.toString();
      
      // Your FFmpeg command adapted for frame input:
      const ffmpegArgs = [
        '-framerate', framerate,        // Input framerate
        '-i', inputPattern,             // Input pattern
        '-map_metadata', '-1',          // Remove metadata
        '-an',                          // No audio
        '-c:v', 'libx264',             // H.264 codec
        '-crf', settings.crf.toString(), // Quality (CRF value)
        '-profile:v', 'main',           // H.264 profile
        '-pix_fmt', 'yuv420p',         // Pixel format for compatibility
        '-movflags', '+faststart',      // Optimize for web playback
        '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2', // Ensure even dimensions
        outputFilename
      ];
      
      // Execute FFmpeg encoding
      await ffmpeg.exec(ffmpegArgs);
      
      this.updateProgress('Saving MP4 file...', 90);
      
      // Read the output file
      const outputData = await ffmpeg.readFile(outputFilename);
      
      // Create blob from FFmpeg output data
      const uint8Array = new Uint8Array(outputData as unknown as ArrayBuffer);
      const mp4Blob = new Blob([uint8Array.buffer], { type: 'video/mp4' });
      
      saveAs(mp4Blob, `${filename}.mp4`);
      
      this.updateProgress('MP4 export complete!', 100);
      
    } catch (error) {
      console.error('❌ FFmpeg MP4 export failed:', error);
      throw new Error(`MP4 export failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Generate canvas frames for video export
   */
  private async generateVideoFrames(
    data: ExportDataBundle,
    settings: VideoExportSettings
  ): Promise<HTMLCanvasElement[]> {
    const videoFrames: HTMLCanvasElement[] = [];
    const originalFrames = data.frames;
    
    if (originalFrames.length === 0) {
      console.warn('⚠️ No frames found in animation data');
      return videoFrames;
    }

    // Calculate how many loops to generate
    const loopMultiplier = this.getLoopMultiplier(settings.loops);
    
    // Pre-calculate video frame counts for each animation frame
    const frameVideoFrameCounts = originalFrames.map(frame => 
      this.calculateVideoFramesForDuration(frame.duration, settings.frameRate)
    );
    
    const totalVideoFrames = frameVideoFrameCounts.reduce((sum, count) => sum + count, 0) * loopMultiplier;
    
    let globalVideoFrameIndex = 0;
    
    // Generate frames for all loops
    for (let loop = 0; loop < loopMultiplier; loop++) {
      for (let animFrameIndex = 0; animFrameIndex < originalFrames.length; animFrameIndex++) {
        const animationFrame = originalFrames[animFrameIndex];
        const videoFrameCount = frameVideoFrameCounts[animFrameIndex];
        
        // Create high-resolution canvas for this animation frame
        const frameCanvas = this.createExportCanvas(
          data.canvasDimensions.width,
          data.canvasDimensions.height,
          settings.sizeMultiplier,
          data.fontMetrics,
          data.typography
        );
        
        // Render the animation frame once
        await this.renderFrame(
          frameCanvas.canvas,
          animationFrame.data,
          data.canvasDimensions.width,
          data.canvasDimensions.height,
          {
            backgroundColor: data.canvasBackgroundColor,
            showGrid: settings.includeGrid && data.showGrid,
            fontMetrics: data.fontMetrics,
            typography: data.typography,
            sizeMultiplier: settings.sizeMultiplier,
            theme: data.uiState.theme,
            scale: frameCanvas.scale
          }
        );
        // Duplicate this canvas for the required number of video frames
        for (let videoFrameIndex = 0; videoFrameIndex < videoFrameCount; videoFrameIndex++) {
          // Clone the canvas for each video frame
          const clonedCanvas = this.cloneCanvas(frameCanvas.canvas);
          videoFrames.push(clonedCanvas);
          
          globalVideoFrameIndex++;
          
          // Update progress (spread across 20-50% range)
          const progress = 20 + (globalVideoFrameIndex / totalVideoFrames) * 30;
          this.updateProgress(
            `Rendering video frame ${globalVideoFrameIndex}/${totalVideoFrames} (anim frame ${animFrameIndex + 1}/${originalFrames.length}, loop ${loop + 1}/${loopMultiplier})...`, 
            progress
          );
        }
        
        // Clean up the original canvas
        frameCanvas.canvas.width = 0;
        frameCanvas.canvas.height = 0;
      }
    }
    
    return videoFrames;
  }

  /**
   * Calculate how many video frames an animation frame should occupy based on its duration
   */
  private calculateVideoFramesForDuration(durationMs: number, videoFrameRate: number): number {
    // Convert duration to seconds, then multiply by frame rate
    const durationSeconds = durationMs / 1000;
    const videoFrameCount = Math.max(1, Math.round(durationSeconds * videoFrameRate));
    return videoFrameCount;
  }

  /**
   * Clone a canvas element
   */
  private cloneCanvas(originalCanvas: HTMLCanvasElement): HTMLCanvasElement {
    const clonedCanvas = document.createElement('canvas');
    clonedCanvas.width = originalCanvas.width;
    clonedCanvas.height = originalCanvas.height;
    
    const clonedCtx = clonedCanvas.getContext('2d');
    const originalCtx = originalCanvas.getContext('2d');
    
    if (clonedCtx && originalCtx) {
      clonedCtx.drawImage(originalCanvas, 0, 0);
    }
    
    return clonedCanvas;
  }

  /**
   * Convert loop setting to numeric multiplier
   */
  private getLoopMultiplier(loops: VideoExportSettings['loops']): number {
    switch (loops) {
      case 'none': return 1;
      case '2x': return 2;
      case '4x': return 4;
      case '8x': return 8;
      default: return 1;
    }
  }

  /**
   * Encode frames to WebM using WebCodecs
   */
  private async encodeWebMVideo(
    frames: HTMLCanvasElement[],
    settings: VideoExportSettings
  ): Promise<Blob> {
    const { Muxer, ArrayBufferTarget } = await import('webm-muxer');
    
    const muxer = new Muxer({
      target: new ArrayBufferTarget(),
      video: {
        codec: 'V_VP9',
        width: frames[0].width,
        height: frames[0].height,
        frameRate: settings.frameRate
      }
    });

    // Set up VideoEncoder for WebCodecs encoding
    const encodedChunks: EncodedVideoChunk[] = [];
    
    return new Promise((resolve, reject) => {
      const encoder = new VideoEncoder({
        output: (chunk) => {
          encodedChunks.push(chunk);
          
          // Add encoded chunk directly to muxer
          muxer.addVideoChunk(chunk);
          
          // Update progress
          const progress = 50 + (encodedChunks.length / frames.length) * 30;
          this.updateProgress(`Encoding frame ${encodedChunks.length}/${frames.length}...`, progress);
          
          // Check if we've encoded all frames
          if (encodedChunks.length === frames.length) {
            encoder.close();
            muxer.finalize();
            const buffer = muxer.target.buffer;
            resolve(new Blob([buffer], { type: 'video/webm' }));
          }
        },
        error: (error) => {
          console.error('VideoEncoder error:', error);
          encoder.close();
          reject(error);
        }
      });

      // Configure the encoder
      encoder.configure({
        codec: 'vp09.00.10.08', // VP9 codec
        width: frames[0].width,
        height: frames[0].height,
        framerate: settings.frameRate,
        bitrate: this.getBitrateForQuality(settings.quality, frames[0].width, frames[0].height)
      });

      // Encode each frame
      for (let i = 0; i < frames.length; i++) {
        const canvas = frames[i];
        
        // Create VideoFrame from canvas
        const frame = new VideoFrame(canvas, {
          timestamp: (i * 1000000) / settings.frameRate // microseconds
        });
        
        // Encode the frame
        encoder.encode(frame, { keyFrame: i === 0 || i % 30 === 0 }); // Keyframe every 30 frames
        
        // Clean up the frame
        frame.close();
      }
      
      // Finish encoding
      encoder.flush();
    });
  }

  /**
   * Get bitrate based on quality setting and resolution
   */
  private getBitrateForQuality(quality: VideoExportSettings['quality'], width: number, height: number): number {
    const pixelCount = width * height;
    const baseRate = pixelCount / 1000; // Base rate per 1000 pixels
    
    switch (quality) {
      case 'low':
        return Math.max(500000, baseRate * 200); // Minimum 500kbps
      case 'medium':
        return Math.max(1000000, baseRate * 400); // Minimum 1Mbps  
      case 'high':
        return Math.max(2000000, baseRate * 800); // Minimum 2Mbps
      default:
        return Math.max(1000000, baseRate * 400);
    }
  }

  /**
   * Update export progress
   */
  private updateProgress(message: string, percentage: number): void {
    if (this.progressCallback) {
      this.progressCallback({
        message,
        progress: percentage,
        stage: percentage < 100 ? 'processing' : 'complete'
      });
    }
  }
}