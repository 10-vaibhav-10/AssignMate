import { useRef } from 'react';

interface SwipeOptions {
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  /** Minimum px to register as a swipe (default 60) */
  threshold?: number;
}

export function useSwipe({ onSwipeLeft, onSwipeRight, threshold = 60 }: SwipeOptions) {
  const startX = useRef<number | null>(null);
  const startY = useRef<number | null>(null);
  const didSwipe = useRef(false);

  return {
    onTouchStart(e: React.TouchEvent) {
      startX.current = e.touches[0].clientX;
      startY.current = e.touches[0].clientY;
      didSwipe.current = false;
    },
    onTouchMove(e: React.TouchEvent) {
      if (startX.current === null || startY.current === null) return;
      const dx = e.touches[0].clientX - startX.current;
      const dy = e.touches[0].clientY - startY.current;
      // If it's a clear horizontal swipe, prevent scroll/click bleed
      if (Math.abs(dx) > threshold / 2 && Math.abs(dx) > Math.abs(dy)) {
        e.preventDefault();
      }
    },
    onTouchEnd(e: React.TouchEvent) {
      if (startX.current === null || startY.current === null) return;
      const dx = e.changedTouches[0].clientX - startX.current;
      const dy = e.changedTouches[0].clientY - startY.current;

      if (Math.abs(dy) > Math.abs(dx)) {
        startX.current = null;
        startY.current = null;
        return;
      }

      if (Math.abs(dx) >= threshold) {
        didSwipe.current = true;
        if (dx < 0 && onSwipeLeft)  onSwipeLeft();
        if (dx > 0 && onSwipeRight) onSwipeRight();
      }

      startX.current = null;
      startY.current = null;
    },
  };
}
