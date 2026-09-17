'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export function PullToRefresh() {
  const [pulling, setPulling] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const startY = useRef(0);
  const isAtTop = useRef(true);
  const maxPull = 120;
  const threshold = 80;

  const checkTop = useCallback(() => {
    isAtTop.current = window.scrollY <= 0;
  }, []);

  useEffect(() => {
    window.addEventListener('scroll', checkTop, { passive: true });
    return () => window.removeEventListener('scroll', checkTop);
  }, [checkTop]);

  const onTouchStart = useCallback((e: TouchEvent) => {
    checkTop();
    if (!isAtTop.current) return;
    startY.current = e.touches[0]?.clientY ?? 0;
  }, [checkTop]);

  const onTouchMove = useCallback((e: TouchEvent) => {
    if (!isAtTop.current) return;
    const y = e.touches[0]?.clientY ?? 0;
    const distance = Math.max(0, y - startY.current);
    if (distance > 10) {
      setPulling(true);
      setPullDistance(Math.min(distance * 0.5, maxPull));
      if (distance > 0) {
        e.preventDefault();
      }
    }
  }, []);

  const onTouchEnd = useCallback(() => {
    if (pullDistance >= threshold) {
      window.location.reload();
    }
    setPulling(false);
    setPullDistance(0);
  }, [pullDistance]);

  useEffect(() => {
    document.addEventListener('touchstart', onTouchStart, { passive: true });
    document.addEventListener('touchmove', onTouchMove, { passive: false });
    document.addEventListener('touchend', onTouchEnd, { passive: true });
    return () => {
      document.removeEventListener('touchstart', onTouchStart);
      document.removeEventListener('touchmove', onTouchMove);
      document.removeEventListener('touchend', onTouchEnd);
    };
  }, [onTouchStart, onTouchMove, onTouchEnd]);

  if (!pulling) return null;

  const progress = Math.min(pullDistance / threshold, 1);
  const ready = pullDistance >= threshold;

  return (
    <div
      className="pull-indicator"
      style={{
        transform: `translateY(${pullDistance}px)`,
        opacity: Math.min(progress + 0.3, 1),
      }}
    >
      <div className={`pull-spinner${ready ? ' pull-ready' : ''}`}>
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
          <circle
            cx="10"
            cy="10"
            r="8"
            stroke="currentColor"
            strokeWidth="2"
            strokeDasharray={`${progress * 50} 100`}
            strokeLinecap="round"
            transform="rotate(-90 10 10)"
          />
        </svg>
      </div>
      <span className="pull-label">{ready ? 'Release to refresh' : 'Pull to refresh'}</span>
    </div>
  );
}
