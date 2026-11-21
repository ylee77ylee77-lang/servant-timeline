/**
 * Position a floating chat within the visible (rather than layout) viewport
 * while an on-screen keyboard is covering the page.
 *
 * iOS Safari can leave window.innerHeight unchanged when showing the keyboard.
 * Never disable native pinch zoom: this bounds only the chat element.
 */
export type ChatKeyboardBounds = {
  top: number;
  left: number;
  width: number;
  height: number;
};

type ChatViewportInput = {
  focused: boolean;
  baseHeight: number;
  top: number;
  left: number;
  width: number;
  height: number;
};

export function getChatKeyboardBounds(view: ChatViewportInput): ChatKeyboardBounds | null {
  const { focused, baseHeight, top, left, width, height } = view;
  if (!focused || !Number.isFinite(height) || !Number.isFinite(width)
    || !Number.isFinite(baseHeight) || baseHeight - height < 120
    || height <= 16 || width <= 24) {
    return null;
  }

  const gapY = 8;
  const gapX = 12;
  const paneWidth = Math.min(420, width - 2 * gapX);
  const paneHeight = height - 2 * gapY;
  return {
    top: Math.max(0, top + gapY),
    left: Math.max(0, left + width - paneWidth - gapX),
    width: paneWidth,
    height: paneHeight,
  };
}
