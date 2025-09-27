import { create } from 'zustand';
import type { 
  GradientDefinition, 
  GradientProperty, 
  GradientStop, 
  Cell 
} from '../types';

interface GradientStore {
  // Panel state
  isOpen: boolean;
  
  // Current gradient configuration
  definition: GradientDefinition;
  
  // Interactive application state
  isApplying: boolean;
  startPoint: { x: number; y: number } | null;
  endPoint: { x: number; y: number } | null;
  ellipsePoint: { x: number; y: number } | null;
  hoverEndPoint: { x: number; y: number } | null;
  previewData: Map<string, Cell> | null;
  
  // Fill area configuration
  contiguous: boolean;
  matchChar: boolean;
  matchColor: boolean;
  matchBgColor: boolean;
  
  // Drag state for interactive controls
  dragState: {
    isDragging: boolean;
    dragType: 'start' | 'end' | 'ellipse' | 'stop';
    dragData?: {
      property?: 'character' | 'textColor' | 'backgroundColor';
      stopIndex?: number;
    };
    startMousePos?: { x: number; y: number };
    startValue?: { x: number; y: number } | number; // position for start/end, position value for stops
  } | null;
  
  // Actions
  setIsOpen: (open: boolean) => void;
  updateDefinition: (definition: Partial<GradientDefinition>) => void;
  updateProperty: (
    property: 'character' | 'textColor' | 'backgroundColor', 
    update: Partial<GradientProperty>
  ) => void;
  addStop: (property: 'character' | 'textColor' | 'backgroundColor') => void;
  removeStop: (property: 'character' | 'textColor' | 'backgroundColor', index: number) => void;
  updateStop: (
    property: 'character' | 'textColor' | 'backgroundColor', 
    index: number, 
    update: Partial<GradientStop>
  ) => void;
  sortStops: (property: 'character' | 'textColor' | 'backgroundColor') => void;
  
  // Application state
  setApplying: (isApplying: boolean) => void;
  setPoints: (start: { x: number; y: number } | null, end: { x: number; y: number } | null, cellAspectRatio?: number) => void;
  setEllipsePoint: (point: { x: number; y: number } | null) => void;
  setHoverEndPoint: (point: { x: number; y: number } | null) => void;
  setPreview: (previewData: Map<string, Cell> | null) => void;
  
  // Fill configuration
  setContiguous: (contiguous: boolean) => void;
  setMatchCriteria: (criteria: { char: boolean; color: boolean; bgColor: boolean }) => void;
  
  // Drag actions
  startDrag: (
    dragType: 'start' | 'end' | 'ellipse' | 'stop',
    mousePos: { x: number; y: number },
    dragData?: { property?: 'character' | 'textColor' | 'backgroundColor'; stopIndex?: number }
  ) => void;
  updateDrag: (mousePos: { x: number; y: number }, canvasContext?: { 
    cellWidth: number; 
    cellHeight: number; 
    zoom: number; 
    panOffset: { x: number; y: number };
  }) => void;
  endDrag: () => void;
  
  // Utility
  reset: () => void;
}

// Default gradient property
const createDefaultProperty = (enabled: boolean, defaultValue: string, secondValue: string): GradientProperty => ({
  enabled,
  stops: enabled ? [
    { position: 0, value: defaultValue },
    { position: 1, value: secondValue }
  ] : [],
  interpolation: 'linear',
  ditherStrength: 50, // Default to 50% strength for balanced dithering
  quantizeSteps: 'infinite'
});

// Default gradient definition
const createDefaultDefinition = (): GradientDefinition => ({
  type: 'linear',
  character: createDefaultProperty(true, '#', '*'),
  textColor: createDefaultProperty(true, '#FFFFFF', '#FFFFFF'),
  backgroundColor: createDefaultProperty(false, '#808080', '#FFFFFF') // Default mid grey and white, disabled by default
});

export const useGradientStore = create<GradientStore>((set, get) => ({
  // Initial state
  isOpen: false,
  definition: createDefaultDefinition(),
  isApplying: false,
  startPoint: null,
  endPoint: null,
  ellipsePoint: null,
  hoverEndPoint: null,
  previewData: null,
  contiguous: true,
  matchChar: true,
  matchColor: true,
  matchBgColor: true,
  dragState: null,

  // Panel actions
  setIsOpen: (open: boolean) => {
    set({ isOpen: open });
  },

  // Definition actions
  updateDefinition: (update: Partial<GradientDefinition>) => {
    set((state) => ({
      definition: { ...state.definition, ...update }
    }));
  },

  updateProperty: (property: 'character' | 'textColor' | 'backgroundColor', update: Partial<GradientProperty>) => {
    set((state) => {
      const currentProperty = state.definition[property];
      const nextQuantizeSteps = update.quantizeSteps ?? currentProperty.quantizeSteps ?? 'infinite';

      return {
        definition: {
          ...state.definition,
          [property]: { ...currentProperty, ...update, quantizeSteps: nextQuantizeSteps }
        }
      };
    });
  },

  addStop: (property: 'character' | 'textColor' | 'backgroundColor') => {
    const state = get();
    const currentProperty = state.definition[property];
    
    if (currentProperty.stops.length >= 8) return; // Maximum 8 stops
    
    // Find a good position for the new stop (middle of largest gap)
    const stops = [...currentProperty.stops].sort((a, b) => a.position - b.position);
    let newPosition = 0.5;
    let maxGap = 0;
    
    for (let i = 0; i < stops.length - 1; i++) {
      const gap = stops[i + 1].position - stops[i].position;
      if (gap > maxGap) {
        maxGap = gap;
        newPosition = (stops[i].position + stops[i + 1].position) / 2;
      }
    }
    
    // Default value based on property type
    let defaultValue = '';
    switch (property) {
      case 'character':
        defaultValue = '*';
        break;
      case 'textColor':
        defaultValue = '#808080'; // Mid grey
        break;
      case 'backgroundColor':
        defaultValue = '#C0C0C0'; // Light grey
        break;
    }
    
    const newStop: GradientStop = { position: newPosition, value: defaultValue };
    
    set((state) => ({
      definition: {
        ...state.definition,
        [property]: {
          ...state.definition[property],
          stops: [...state.definition[property].stops, newStop].sort((a, b) => a.position - b.position)
        }
      }
    }));
  },

  removeStop: (property: 'character' | 'textColor' | 'backgroundColor', index: number) => {
    const state = get();
    const currentProperty = state.definition[property];
    
    if (currentProperty.stops.length <= 1) return; // Minimum 1 stop
    
    set((state) => ({
      definition: {
        ...state.definition,
        [property]: {
          ...state.definition[property],
          stops: state.definition[property].stops.filter((_, i) => i !== index)
        }
      }
    }));
  },

  updateStop: (
    property: 'character' | 'textColor' | 'backgroundColor', 
    index: number, 
    update: Partial<GradientStop>
  ) => {
    set((state) => ({
      definition: {
        ...state.definition,
        [property]: {
          ...state.definition[property],
          stops: state.definition[property].stops.map((stop, i) => 
            i === index ? { ...stop, ...update } : stop
          )
        }
      }
    }));
  },

  sortStops: (property: 'character' | 'textColor' | 'backgroundColor') => {
    set((state) => {
      const propertyState = state.definition[property];
      const sortedStops = [...propertyState.stops].sort((a, b) => a.position - b.position);
      return {
        definition: {
          ...state.definition,
          [property]: {
            ...propertyState,
            stops: sortedStops
          }
        }
      };
    });
  },

  // Application state actions
  setApplying: (isApplying: boolean) => {
    set({ isApplying });
    if (!isApplying) {
      // Reset interactive state when not applying
      set({ startPoint: null, endPoint: null, ellipsePoint: null, hoverEndPoint: null, previewData: null });
    }
  },

  setPoints: (start: { x: number; y: number } | null, end: { x: number; y: number } | null, cellAspectRatio: number = 1.0) => {
    const { definition } = get();
    let ellipsePoint: { x: number; y: number } | null = null;
    
    // For radial gradients, automatically calculate ellipse point perpendicular to radius
    if (definition.type === 'radial' && start && end) {
      const dx = end.x - start.x;
      const dy = end.y - start.y;
      
      // Apply aspect ratio correction to the perpendicular calculation
      // The perpendicular vector in screen space needs to account for aspect ratio
      const aspectCorrectedDx = dx * cellAspectRatio;
      
      // Create perpendicular vector: rotate 90 degrees and maintain proper length
      // In grid coordinates, but accounting for aspect ratio effect
      ellipsePoint = {
        x: start.x - dy, // Rotate 90 degrees: (dx, dy) -> (-dy, dx)
        y: start.y + aspectCorrectedDx / cellAspectRatio // Adjust for aspect ratio
      };
    }
    
    set({ startPoint: start, endPoint: end, ellipsePoint });
    if (end) {
      set({ hoverEndPoint: null });
    }
  },

  setHoverEndPoint: (point: { x: number; y: number } | null) => {
    set({ hoverEndPoint: point });
  },

  setEllipsePoint: (point: { x: number; y: number } | null) => {
    set({ ellipsePoint: point });
  },

  setPreview: (previewData: Map<string, Cell> | null) => {
    set({ previewData });
  },

  // Fill configuration actions
  setContiguous: (contiguous: boolean) => {
    set({ contiguous });
  },

  setMatchCriteria: (criteria: { char: boolean; color: boolean; bgColor: boolean }) => {
    set({ 
      matchChar: criteria.char, 
      matchColor: criteria.color, 
      matchBgColor: criteria.bgColor 
    });
  },

  // Drag actions
  startDrag: (
    dragType: 'start' | 'end' | 'ellipse' | 'stop',
    mousePos: { x: number; y: number },
    dragData?: { property?: 'character' | 'textColor' | 'backgroundColor'; stopIndex?: number }
  ) => {
    const state = get();
    let startValue: { x: number; y: number } | number | undefined;
    
    if (dragType === 'start' && state.startPoint) {
      startValue = { ...state.startPoint };
    } else if (dragType === 'end' && state.endPoint) {
      startValue = { ...state.endPoint };
    } else if (dragType === 'ellipse' && state.ellipsePoint) {
      startValue = { ...state.ellipsePoint };
    } else if (dragType === 'stop' && dragData?.property && dragData.stopIndex !== undefined) {
      const stops = state.definition[dragData.property].stops;
      if (stops[dragData.stopIndex]) {
        startValue = stops[dragData.stopIndex].position;
      }
    }
    
    set({
      dragState: {
        isDragging: true,
        dragType,
        dragData,
        startMousePos: { ...mousePos },
        startValue
      }
    });
  },

  updateDrag: (mousePos: { x: number; y: number }, canvasContext?: { 
    cellWidth: number; 
    cellHeight: number; 
    zoom: number; 
    panOffset: { x: number; y: number };
  }) => {
    const state = get();
    if (!state.dragState || !state.dragState.isDragging) return;
    
    const { dragType, dragData, startMousePos, startValue } = state.dragState;
    if (!startMousePos || startValue === undefined) return;
    
    if (dragType === 'start' || dragType === 'end' || dragType === 'ellipse') {
      if (typeof startValue === 'object' && canvasContext) {
        // Convert mouse delta to grid delta
        const deltaX = mousePos.x - startMousePos.x;
        const deltaY = mousePos.y - startMousePos.y;
        
        const effectiveCellWidth = canvasContext.cellWidth * canvasContext.zoom;
        const effectiveCellHeight = canvasContext.cellHeight * canvasContext.zoom;
        
        const gridDeltaX = Math.round(deltaX / effectiveCellWidth);
        const gridDeltaY = Math.round(deltaY / effectiveCellHeight);
        
        const newPoint = {
          x: Math.max(0, startValue.x + gridDeltaX),
          y: Math.max(0, startValue.y + gridDeltaY)
        };
        
        if (dragType === 'start') {
          // Calculate how much the start point actually moved
          const deltaX = newPoint.x - (state.startPoint?.x || 0);
          const deltaY = newPoint.y - (state.startPoint?.y || 0);
          
          // Move start point
          set({ startPoint: newPoint });
          
          // Move end point and ellipse point by the same offset to maintain relationships
          if (state.endPoint) {
            const newEndPoint = {
              x: Math.max(0, state.endPoint.x + deltaX),
              y: Math.max(0, state.endPoint.y + deltaY)
            };
            set({ endPoint: newEndPoint });
          }
          
          if (state.ellipsePoint) {
            const newEllipsePoint = {
              x: Math.max(0, state.ellipsePoint.x + deltaX),
              y: Math.max(0, state.ellipsePoint.y + deltaY)
            };
            set({ ellipsePoint: newEllipsePoint });
          }
        } else if (dragType === 'end') {
          set({ endPoint: newPoint });
          // For radial gradients, proportionally update ellipse point when end point moves
          if (state.definition.type === 'radial' && state.ellipsePoint && state.startPoint && state.endPoint && canvasContext) {
            const cellAspectRatio = canvasContext.cellWidth / canvasContext.cellHeight;
            
            // Calculate current distances from start point (with aspect ratio correction)
            const currentEllipseDx = (state.ellipsePoint.x - state.startPoint.x) * cellAspectRatio;
            const currentEllipseDy = state.ellipsePoint.y - state.startPoint.y;
            const currentEllipseDistance = Math.sqrt(currentEllipseDx * currentEllipseDx + currentEllipseDy * currentEllipseDy);
            
            const currentEndDx = (state.endPoint.x - state.startPoint.x) * cellAspectRatio;
            const currentEndDy = state.endPoint.y - state.startPoint.y;
            const currentEndDistance = Math.sqrt(currentEndDx * currentEndDx + currentEndDy * currentEndDy);
            
            // Calculate the proportional ratio
            const distanceRatio = currentEndDistance > 0 ? currentEllipseDistance / currentEndDistance : 1;
            
            // Calculate new end point distance
            const newEndDx = (newPoint.x - state.startPoint.x) * cellAspectRatio;
            const newEndDy = newPoint.y - state.startPoint.y;
            const newEndDistance = Math.sqrt(newEndDx * newEndDx + newEndDy * newEndDy);
            
            // Calculate new perpendicular direction
            const perpDx = -newEndDy / cellAspectRatio; // Convert back for perpendicular calculation
            const perpDy = newEndDx / cellAspectRatio;
            const perpLength = Math.sqrt(perpDx * perpDx + perpDy * perpDy);
            
            if (perpLength > 0 && newEndDistance > 0) {
              // Normalize perpendicular vector
              const perpNormX = perpDx / perpLength;
              const perpNormY = perpDy / perpLength;
              
              // Calculate new ellipse distance (proportional to new end distance)
              const newEllipseDistance = newEndDistance * distanceRatio;
              
              // Place ellipse point at proportional distance along perpendicular
              const newEllipsePoint = {
                x: state.startPoint.x + perpNormX * newEllipseDistance / cellAspectRatio,
                y: state.startPoint.y + perpNormY * newEllipseDistance
              };
              set({ ellipsePoint: newEllipsePoint });
            }
          }
        } else if (dragType === 'ellipse') {
          // Constrain ellipse point to move only along perpendicular line
          if (state.startPoint && state.endPoint && canvasContext) {
            const cellAspectRatio = canvasContext.cellWidth / canvasContext.cellHeight;
            
            // Get the gradient direction vector (with aspect ratio correction)
            const gradDx = (state.endPoint.x - state.startPoint.x) * cellAspectRatio;
            const gradDy = state.endPoint.y - state.startPoint.y;
            
            // Get the perpendicular vector (rotated 90 degrees)
            const perpDx = -gradDy;
            const perpDy = gradDx;
            
            // Normalize perpendicular vector
            const perpLength = Math.sqrt(perpDx * perpDx + perpDy * perpDy);
            if (perpLength > 0) {
              const perpNormX = perpDx / perpLength;
              const perpNormY = perpDy / perpLength;
              
              // Project the drag movement onto the perpendicular line (with aspect ratio correction)
              const dragVector = {
                x: (newPoint.x - state.startPoint.x) * cellAspectRatio,
                y: newPoint.y - state.startPoint.y
              };
              
              // Dot product to get distance along perpendicular line
              const projDistance = dragVector.x * perpNormX + dragVector.y * perpNormY;
              
              // Calculate constrained ellipse point (convert back to grid coordinates)
              const constrainedEllipsePoint = {
                x: state.startPoint.x + (perpNormX * projDistance) / cellAspectRatio,
                y: state.startPoint.y + perpNormY * projDistance
              };
              
              set({ ellipsePoint: constrainedEllipsePoint });
            }
          } else {
            set({ ellipsePoint: newPoint });
          }
        }
      }
    } else if (dragType === 'stop' && dragData?.property && dragData.stopIndex !== undefined) {
      // Calculate new stop position along the gradient line
      if (state.startPoint && state.endPoint && typeof startValue === 'number') {
        const lineLength = Math.sqrt(
          Math.pow(state.endPoint.x - state.startPoint.x, 2) + 
          Math.pow(state.endPoint.y - state.startPoint.y, 2)
        );
        
        if (lineLength > 0 && canvasContext) {
          // Project mouse movement onto the gradient line
          const deltaX = mousePos.x - startMousePos.x;
          const deltaY = mousePos.y - startMousePos.y;
          
          const effectiveCellWidth = canvasContext.cellWidth * canvasContext.zoom;
          
          const lineAngle = Math.atan2(state.endPoint.y - state.startPoint.y, state.endPoint.x - state.startPoint.x);
          const projectedDelta = deltaX * Math.cos(lineAngle) + deltaY * Math.sin(lineAngle);
          const positionDelta = projectedDelta / (lineLength * effectiveCellWidth);
          
          const newPosition = Math.max(0, Math.min(1, startValue + positionDelta));
          
          // Update the stop position
          const currentProperty = state.definition[dragData.property];
          const newStops = [...currentProperty.stops];
          if (newStops[dragData.stopIndex]) {
            newStops[dragData.stopIndex] = { ...newStops[dragData.stopIndex], position: newPosition };
            
            set((prevState) => ({
              definition: {
                ...prevState.definition,
                [dragData.property as keyof GradientDefinition]: {
                  ...currentProperty,
                  stops: newStops
                }
              }
            }));
          }
        }
      }
    }
  },

  endDrag: () => {
    const state = get();
    const { dragState } = state;
    set({ dragState: null });

    if (dragState?.dragType === 'stop' && dragState.dragData?.property) {
      const property = dragState.dragData.property;
      set((current) => {
        const propertyState = current.definition[property];
        const sortedStops = [...propertyState.stops].sort((a, b) => a.position - b.position);
        return {
          definition: {
            ...current.definition,
            [property]: {
              ...propertyState,
              stops: sortedStops
            }
          }
        };
      });
    }
  },

  // Utility actions
  reset: () => {
    set({
      isApplying: false,
      startPoint: null,
      endPoint: null,
      ellipsePoint: null,
      hoverEndPoint: null,
      previewData: null,
      dragState: null
    });
  }
}));

// Helper function to initialize gradient with current tool values
export const initializeGradientWithCurrentValues = (
  selectedChar: string, 
  selectedColor: string, 
  selectedBgColor: string
) => {
  const { updateProperty } = useGradientStore.getState();
  
  // Initialize character gradient
  updateProperty('character', {
    enabled: true,
    stops: [
      { position: 0, value: selectedChar },
      { position: 1, value: '*' }
    ],
    ditherStrength: 50,
    quantizeSteps: 'infinite'
  });
  
  // Initialize text color gradient
  updateProperty('textColor', {
    enabled: true,
    stops: [
      { position: 0, value: selectedColor },
      { position: 1, value: '#FFFFFF' }
    ],
    ditherStrength: 50,
    quantizeSteps: 'infinite'
  });
  
  // Initialize background color gradient (handle transparent case) - disabled by default
  const bgStartValue = selectedBgColor === 'transparent' ? '#808080' : selectedBgColor;
  updateProperty('backgroundColor', {
    enabled: false,
    stops: [
      { position: 0, value: bgStartValue },
      { position: 1, value: '#FFFFFF' }
    ],
    ditherStrength: 50,
    quantizeSteps: 'infinite'
  });
};