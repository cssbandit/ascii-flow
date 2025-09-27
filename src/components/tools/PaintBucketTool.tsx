import React from 'react';
import { useDrawingTool } from '../../hooks/useDrawingTool';
import { useToolStore } from '../../stores/toolStore';

/**
 * Paint Bucket Tool Component
 * Handles flood fill behavior
 */
export const PaintBucketTool: React.FC = () => {
  // The paint bucket logic is handled by useDrawingTool hook
  // This component ensures the hook is active when paint bucket tool is selected
  useDrawingTool();

  return null; // No direct UI - handles behavior through hooks
};

/**
 * Paint Bucket Tool Status Component
 * Provides visual feedback about the paint bucket tool
 */
export const PaintBucketToolStatus: React.FC = () => {
  const { selectedChar, selectedColor, selectedBgColor, paintBucketContiguous } = useToolStore();

  const fillMode = paintBucketContiguous ? 'connected areas' : 'all matching cells';

  return (
    <span className="text-muted-foreground">
      Paint Bucket: Click to fill {fillMode} with "{selectedChar}" and color {selectedColor}
      {selectedBgColor !== '#FFFFFF' && ` on ${selectedBgColor}`}
    </span>
  );
};
