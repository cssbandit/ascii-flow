import React, { useCallback, useState } from 'react';
import { useAnimationStore } from '../../stores/animationStore';
import { useCanvasStore } from '../../stores/canvasStore';
import { useAnimationPlayback } from '../../hooks/useAnimationPlayback';
import { useFrameNavigation } from '../../hooks/useFrameNavigation';
import { useAnimationHistory } from '../../hooks/useAnimationHistory';
import { FrameThumbnail } from './FrameThumbnail';
import { PlaybackControls } from './PlaybackControls';
import { FrameControls } from './FrameControls';
import { OnionSkinControls } from './OnionSkinControls';
import { TimelineZoomControl } from './TimelineZoomControl';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { MAX_LIMITS } from '../../constants';

/**
 * Main animation timeline component
 * Combines frame thumbnails, playback controls, and frame management
 */
export const AnimationTimeline: React.FC = () => {
  const { width: canvasWidth, height: canvasHeight } = useCanvasStore();
  const {
    frames,
    currentFrameIndex,
    isPlaying,
    looping,
    onionSkin,
    timelineZoom,
    setLooping,
    setDraggingFrame
  } = useAnimationStore();

  // Use history-enabled animation actions
  const {
    addFrame,
    removeFrame,
    duplicateFrame,
    updateFrameDuration,
    reorderFrames
  } = useAnimationHistory();

  const {
    startPlayback,
    pausePlayback,
    stopPlayback,
    canPlay
  } = useAnimationPlayback();

  const {
    navigateToFrame,
    navigateNext,
    navigatePrevious
  } = useFrameNavigation();

  // Drag and drop state
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  // Handle drag start
  const handleDragStart = useCallback((event: React.DragEvent, index: number) => {
    if (isPlaying) return; // Don't allow reordering during playback
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', index.toString());
    setDraggedIndex(index);
    setDraggingFrame(true); // Set global drag state
  }, [isPlaying, setDraggingFrame]);

  // Handle drag over
  const handleDragOver = useCallback((event: React.DragEvent, index: number) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    
    if (draggedIndex === null || draggedIndex === index) return;
    
    // Determine if we're closer to the left or right edge of the frame
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const x = event.clientX;
    const centerX = rect.left + rect.width / 2;
    
    let targetIndex: number;
    
    // If dragging to the right half, show indicator after this frame
    if (x > centerX) {
      targetIndex = index + 1;
    } else {
      targetIndex = index;
    }
    
    // Don't show drop indicator if it would result in no actual reordering
    if (
      (draggedIndex < index && targetIndex === draggedIndex + 1) || // Moving right: skip position immediately after original
      (draggedIndex > index && targetIndex === draggedIndex)        // Moving left: skip original position
    ) {
      return;
    }
    
    // Only update if the target index is actually different
    if (targetIndex !== dragOverIndex) {
      setDragOverIndex(targetIndex);
    }
  }, [draggedIndex]);

  // Handle drag enter
  const handleDragEnter = useCallback((event: React.DragEvent, index: number) => {
    event.preventDefault();
    if (draggedIndex !== null && draggedIndex !== index) {
      // Clear any existing drag over index first
      setDragOverIndex(null);
      
      let targetIndex = index;
      
      // Don't show drop indicator if it would result in no actual reordering
      if (
        (draggedIndex < index && targetIndex === draggedIndex + 1) || // Moving right: skip position immediately after original
        (draggedIndex > index && targetIndex === draggedIndex)        // Moving left: skip original position
      ) {
        return;
      }
      
      setDragOverIndex(targetIndex);
    }
  }, [draggedIndex]);

  // Handle drag leave - simplified to do nothing, let dragEnter handle clearing
  const handleDragLeave = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    // Don't clear dragOverIndex here - let dragEnter handle it
  }, []);

  // Handle drop
  const handleDrop = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    const dragIndex = parseInt(event.dataTransfer.getData('text/plain'));
    
    if (!isNaN(dragIndex) && dragOverIndex !== null) {
      // Validate indices - dragOverIndex can be frames.length for "append to end"
      if (dragIndex >= 0 && dragIndex < frames.length && 
          dragOverIndex >= 0 && dragOverIndex <= frames.length &&
          dragIndex !== dragOverIndex) {
        
        // For drops, use dragOverIndex directly - the store will handle end-of-list
        let targetIndex = dragOverIndex;
        
        // Adjust target index when moving forward (except for end drops)
        if (dragOverIndex < frames.length && dragIndex < dragOverIndex) {
          targetIndex = dragOverIndex - 1;
        }
        
        reorderFrames(dragIndex, targetIndex);
      }
    }
    
    // Clean up drag state with delay to prevent race conditions
    setTimeout(() => {
      setDraggedIndex(null);
      setDragOverIndex(null);
    }, 100);
  }, [dragOverIndex, reorderFrames, frames.length]);

  // Handle drag end
  const handleDragEnd = useCallback(() => {
    // Clean up drag state with delay to prevent race conditions
    setTimeout(() => {
      setDraggedIndex(null);
      setDragOverIndex(null);
      setDraggingFrame(false); // Clear global drag state
    }, 100);
  }, [setDraggingFrame]);

  // Handle frame selection
  const handleFrameSelect = useCallback((frameIndex: number) => {
    if (!isPlaying) {
      navigateToFrame(frameIndex);
    }
  }, [isPlaying, navigateToFrame]);

  // Handle adding new frame
  const handleAddFrame = useCallback(() => {
    if (frames.length < MAX_LIMITS.FRAME_COUNT) {
      addFrame(currentFrameIndex + 1);
    }
  }, [addFrame, frames.length, currentFrameIndex]);

  // Helper function to determine onion skin status for a frame
  const getOnionSkinStatus = useCallback((frameIndex: number) => {
    if (!onionSkin.enabled) {
      return {
        isOnionSkinPrevious: false,
        isOnionSkinNext: false,
        onionSkinDistance: 0
      };
    }

    const distance = frameIndex - currentFrameIndex;
    
    if (distance < 0 && Math.abs(distance) <= onionSkin.previousFrames) {
      // This is a previous frame within onion skin range
      return {
        isOnionSkinPrevious: true,
        isOnionSkinNext: false,
        onionSkinDistance: Math.abs(distance)
      };
    } else if (distance > 0 && distance <= onionSkin.nextFrames) {
      // This is a next frame within onion skin range
      return {
        isOnionSkinPrevious: false,
        isOnionSkinNext: true,
        onionSkinDistance: distance
      };
    }

    return {
      isOnionSkinPrevious: false,
      isOnionSkinNext: false,
      onionSkinDistance: 0
    };
  }, [onionSkin.enabled, onionSkin.previousFrames, onionSkin.nextFrames, currentFrameIndex]);

  // Handle duplicating current frame
  const handleDuplicateFrame = useCallback(() => {
    if (frames.length < MAX_LIMITS.FRAME_COUNT) {
      duplicateFrame(currentFrameIndex);
    }
  }, [frames.length, currentFrameIndex, duplicateFrame]);

  // Handle deleting current frame
  const handleDeleteFrame = useCallback(() => {
    if (frames.length > 1) {
      removeFrame(currentFrameIndex);
    }
  }, [frames.length, currentFrameIndex, removeFrame]);

  // Handle individual frame duplicate
  const handleFrameDuplicate = useCallback((frameIndex: number) => {
    if (frames.length < MAX_LIMITS.FRAME_COUNT) {
      duplicateFrame(frameIndex);
    }
  }, [frames.length, duplicateFrame]);

  // Handle individual frame delete
  const handleFrameDelete = useCallback((frameIndex: number) => {
    if (frames.length > 1) {
      removeFrame(frameIndex);
    }
  }, [frames.length, removeFrame]);

  // Handle frame duration change
  const handleFrameDurationChange = useCallback((frameIndex: number, duration: number) => {
    updateFrameDuration(frameIndex, duration);
  }, [updateFrameDuration]);

  // Calculate total animation duration
  const totalDuration = frames.reduce((total, frame) => total + frame.duration, 0);

  return (
    <Card className="border-border/50">
      <CardHeader className="py-2 px-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium">Animation Timeline</CardTitle>
          <div className="text-xs text-muted-foreground">
            {frames.length} frame{frames.length !== 1 ? 's' : ''} • {(totalDuration / 1000).toFixed(1)}s
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-2 p-2 pt-0 overflow-hidden">
        {/* Combined Controls Row */}
        <div className="flex items-center justify-between gap-2">
          {/* Frame Controls - Left Side */}
          <FrameControls
            canAddFrame={frames.length < MAX_LIMITS.FRAME_COUNT}
            canDeleteFrame={frames.length > 1}
            onAddFrame={handleAddFrame}
            onDuplicateFrame={handleDuplicateFrame}
            onDeleteFrame={handleDeleteFrame}
            disabled={isPlaying}
          />

          {/* Playback Controls - Center */}
          <PlaybackControls
            isPlaying={isPlaying}
            canPlay={canPlay}
            currentFrame={currentFrameIndex}
            totalFrames={frames.length}
            onPlay={startPlayback}
            onPause={pausePlayback}
            onStop={stopPlayback}
            onPrevious={navigatePrevious}
            onNext={navigateNext}
            onToggleLoop={() => setLooping(!looping)}
            isLooping={looping}
          />

          {/* Onion Skin Controls - Right Side */}
          <OnionSkinControls />
        </div>

        {/* Frame Timeline */}
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-medium text-muted-foreground">Frames</h4>
            <TimelineZoomControl />
          </div>
          <div className="w-full overflow-x-auto">
            <div 
              className="flex gap-1" 
              style={{ 
                minWidth: 'max-content',
                userSelect: 'none', // Prevent text selection
                WebkitUserSelect: 'none' // Webkit browsers
              }}
            >
              {frames.map((frame, index) => (
                <React.Fragment key={frame.id}>
                  {/* Drop indicator line */}
                  {dragOverIndex === index && draggedIndex !== null && draggedIndex !== index && (
                    <div 
                      key={`drop-indicator-${index}`}
                      className="flex items-center justify-center mx-2 flex-shrink-0 self-stretch transition-all duration-150 ease-out animate-in fade-in slide-in-from-left-1"
                      style={{
                        animationDuration: '150ms',
                        animationFillMode: 'both'
                      }}
                    >
                      <div 
                        className="bg-primary shadow-lg rounded-full flex-shrink-0 self-stretch animate-pulse transition-all duration-150 ease-out"
                        style={{
                          width: '4px',
                          animation: 'expand-width 150ms ease-out forwards, pulse 2s infinite'
                        }}
                      />
                    </div>
                  )}
                  
                  <FrameThumbnail
                    frame={frame}
                    frameIndex={index}
                    isSelected={index === currentFrameIndex}
                    canvasWidth={canvasWidth}
                    canvasHeight={canvasHeight}
                    scaleZoom={timelineZoom}
                    onSelect={() => handleFrameSelect(index)}
                    onDuplicate={() => handleFrameDuplicate(index)}
                    onDelete={() => handleFrameDelete(index)}
                    onDurationChange={(duration) => handleFrameDurationChange(index, duration)}
                    isDragging={draggedIndex === index}
                    {...getOnionSkinStatus(index)}
                    dragHandleProps={{
                      draggable: !isPlaying,
                      onDragStart: (e: React.DragEvent) => handleDragStart(e, index),
                      onDragOver: (e: React.DragEvent) => handleDragOver(e, index),
                      onDragEnter: (e: React.DragEvent) => handleDragEnter(e, index),
                      onDragLeave: handleDragLeave,
                      onDrop: handleDrop,
                      onDragEnd: handleDragEnd
                    }}
                  />
                  
                  {/* Drop indicator at the end */}
                  {index === frames.length - 1 && dragOverIndex === frames.length && draggedIndex !== null && (
                    <div 
                      key={`drop-indicator-end`}
                      className="flex items-center justify-center mx-2 flex-shrink-0 self-stretch transition-all duration-150 ease-out animate-in fade-in slide-in-from-right-1"
                      style={{
                        animationDuration: '150ms',
                        animationFillMode: 'both'
                      }}
                    >
                      <div 
                        className="bg-primary shadow-lg rounded-full flex-shrink-0 self-stretch animate-pulse transition-all duration-150 ease-out"
                        style={{
                          width: '4px',
                          animation: 'expand-width 150ms ease-out forwards, pulse 2s infinite'
                        }}
                      />
                    </div>
                  )}
                </React.Fragment>
              ))}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
