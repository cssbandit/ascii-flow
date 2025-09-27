import type { ExportDataBundle } from '../types/export';
import { useCanvasStore } from '../stores/canvasStore';
import { useAnimationStore } from '../stores/animationStore';
import { useToolStore } from '../stores/toolStore';
import { useCanvasContext } from '../contexts/CanvasContext';
import { useTheme } from '../contexts/ThemeContext';
import { VERSION, BUILD_DATE, BUILD_HASH } from '../constants/version';

/**
 * Collects all data needed for export operations
 * Gathers canvas data, animation frames, tool state, and UI settings
 */
export class ExportDataCollector {
  /**
   * Collect all export data from the current application state
   */
  static collect(): ExportDataBundle {
    // Get canvas data
    const canvasState = useCanvasStore.getState();
    const { 
      width, 
      height, 
      cells, 
      canvasBackgroundColor, 
      showGrid 
    } = canvasState;

    // Get animation data
    const animationState = useAnimationStore.getState();
    const {
      frames,
      currentFrameIndex,
      frameRate,
      looping
    } = animationState;

    // Get tool state
    const toolState = useToolStore.getState();
    const {
      activeTool,
      selectedColor,
      selectedBgColor,
      selectedChar,
      paintBucketContiguous,
      rectangleFilled
    } = toolState;

    // Get UI context data (we'll need to pass this in since we can't use hooks here)
    // This will be handled by the calling component

    return {
      // Version metadata
      metadata: {
        version: VERSION,
        buildDate: BUILD_DATE,
        buildHash: BUILD_HASH,
        exportDate: new Date().toISOString()
      },
      
      // Animation data
      frames: frames.map(frame => ({
        ...frame,
        data: new Map(frame.data) // Deep copy frame data
      })),
      currentFrameIndex,
      frameRate,
      looping,
      
      // Canvas data
      canvasData: new Map(cells), // Deep copy current canvas
      canvasDimensions: { width, height },
      canvasBackgroundColor,
      showGrid,
      
      // Typography & rendering (will be filled by calling component)
      fontMetrics: {
        characterWidth: 0,
        characterHeight: 0,
        aspectRatio: 0.6,
        fontSize: 16,
        fontFamily: 'monospace'
      },
      typography: {
        fontSize: 16,
        characterSpacing: 1.0,
        lineSpacing: 1.0
      },
      
      // Tool state
      toolState: {
        activeTool,
        selectedColor,
        selectedBgColor,
        selectedCharacter: selectedChar,
        paintBucketContiguous,
        rectangleFilled
      },
      
      // UI state (will be filled by calling component)
      uiState: {
        zoom: 1.0,
        panOffset: { x: 0, y: 0 },
        theme: 'light'
      }
    };
  }
}

/**
 * Hook-based data collector that can access React context
 * Use this from React components to get complete export data
 */
export const useExportDataCollector = (): ExportDataBundle => {
  // Get canvas data
  const { 
    width, 
    height, 
    cells, 
    canvasBackgroundColor, 
    showGrid 
  } = useCanvasStore();

  // Get animation data
  const {
    frames,
    currentFrameIndex,
    frameRate,
    looping
  } = useAnimationStore();

  // Get tool state
  const {
    activeTool,
    selectedColor,
    selectedBgColor,
    selectedChar,
    paintBucketContiguous,
    rectangleFilled
  } = useToolStore();

  // Get canvas context data
  const {
    zoom,
    panOffset,
    fontMetrics,
    fontSize,
    characterSpacing,
    lineSpacing
  } = useCanvasContext();

  // Get theme context
  const { theme } = useTheme();

  return {
    // Version metadata
    metadata: {
      version: VERSION,
      buildDate: BUILD_DATE,
      buildHash: BUILD_HASH,
      exportDate: new Date().toISOString()
    },
    
    // Animation data
    frames: frames.map(frame => ({
      ...frame,
      data: new Map(frame.data) // Deep copy frame data
    })),
    currentFrameIndex,
    frameRate,
    looping,
    
    // Canvas data
    canvasData: new Map(cells), // Deep copy current canvas
    canvasDimensions: { width, height },
    canvasBackgroundColor,
    showGrid,
    
    // Typography & rendering
    fontMetrics,
    typography: {
      fontSize,
      characterSpacing,
      lineSpacing
    },
    
    // Tool state
    toolState: {
      activeTool,
      selectedColor,
      selectedBgColor,
      selectedCharacter: selectedChar,
      paintBucketContiguous,
      rectangleFilled
    },
    
    // UI state
    uiState: {
      zoom,
      panOffset,
      theme
    }
  };
};

/**
 * Validate export data bundle to ensure all required data is present
 */
export const validateExportData = (data: ExportDataBundle): boolean => {
  try {
    // Check required fields
    if (!data.frames || data.frames.length === 0) {
      console.error('Export validation failed: No frames data');
      return false;
    }

    if (!data.canvasData) {
      console.error('Export validation failed: No canvas data');
      return false;
    }

    if (!data.canvasDimensions || data.canvasDimensions.width <= 0 || data.canvasDimensions.height <= 0) {
      console.error('Export validation failed: Invalid canvas dimensions');
      return false;
    }

    if (!data.fontMetrics) {
      console.error('Export validation failed: No font metrics');
      return false;
    }

    if (!data.toolState) {
      console.error('Export validation failed: No tool state');
      return false;
    }

    // Validate frame data
    for (const frame of data.frames) {
      if (!frame.id || !frame.name || typeof frame.duration !== 'number') {
        console.error('Export validation failed: Invalid frame data', frame);
        return false;
      }
      
      if (!(frame.data instanceof Map)) {
        console.error('Export validation failed: Frame data is not a Map', frame);
        return false;
      }
    }

    return true;
  } catch (error) {
    console.error('Export validation failed with error:', error);
    return false;
  }
};

/**
 * Get export filename based on format and current date
 */
export const generateExportFilename = (
  format: 'png' | 'mp4' | 'session',
  projectName?: string
): string => {
  const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
  const baseName = projectName || 'ascii-flow';
  
  const extensions = {
    png: 'png',
    mp4: 'mp4',
    session: 'asciimtn'
  };
  
  return `${baseName}-${timestamp}.${extensions[format]}`;
};