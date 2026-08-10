/** 외주정보검색 모바일 레이아웃 — 768px 이하에서만 적용 */
export const OUTSOURCING_MOBILE_BREAKPOINT = 768;

export function isOutsourcingMobileViewport(): boolean {
  return typeof window !== 'undefined' && window.innerWidth <= OUTSOURCING_MOBILE_BREAKPOINT;
}

export function resolveOutsourcingPopoverRect(anchorRect: DOMRect): { left: number; width: number } {
  if (!isOutsourcingMobileViewport()) {
    return { left: anchorRect.left, width: anchorRect.width };
  }

  const inset = 12;
  return {
    left: inset,
    width: window.innerWidth - inset * 2,
  };
}

export function resolveOutsourcingTooltipWidth(defaultWidth: number): number {
  if (!isOutsourcingMobileViewport()) {
    return defaultWidth;
  }

  const inset = 12;
  return Math.min(defaultWidth, window.innerWidth - inset * 2);
}
