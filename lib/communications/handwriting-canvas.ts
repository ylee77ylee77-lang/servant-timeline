export type DrawingPoint = { x: number; y: number };

export type DrawingBounds = {
  left: number;
  top: number;
  width: number;
  height: number;
};

/** Convert a pointer location using the bounds captured at stroke start. */
export function canvasPointFromClient(
  clientX: number,
  clientY: number,
  bounds: DrawingBounds,
  width: number,
  height: number
): DrawingPoint {
  if (bounds.width <= 0 || bounds.height <= 0) return { x: 0, y: 0 };
  return {
    x: Math.max(0, Math.min(width, (clientX - bounds.left) * width / bounds.width)),
    y: Math.max(0, Math.min(height, (clientY - bounds.top) * height / bounds.height)),
  };
}
