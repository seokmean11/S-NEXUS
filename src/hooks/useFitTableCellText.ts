import { useLayoutEffect, type RefObject } from 'react';

const MIN_PX = 8;

function resetFont(el: HTMLElement) {
  el.style.removeProperty('font-size');
}

function shrinkToFit(el: HTMLElement) {
  resetFont(el);
  if (el.clientWidth <= 0) return;
  let size = parseFloat(getComputedStyle(el).fontSize);
  let guard = 20;
  while (guard > 0 && size > MIN_PX && el.scrollWidth > el.clientWidth + 0.5) {
    size -= 0.5;
    guard -= 1;
    el.style.fontSize = `${size}px`;
  }
}

function fitCell(cell: HTMLElement) {
  const nested = cell.querySelectorAll<HTMLElement>('input, button, span');
  nested.forEach(resetFont);
  resetFont(cell);
  nested.forEach(shrinkToFit);
  shrinkToFit(cell);
}

export function useFitTableCellText(rootRef: RefObject<HTMLElement | null>) {
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const run = () => {
      root.querySelectorAll<HTMLElement>('th, td').forEach(fitCell);
    };

    run();
    const resize = new ResizeObserver(run);
    resize.observe(root);
    const mutate = new MutationObserver(run);
    mutate.observe(root, { subtree: true, childList: true, characterData: true });
    return () => {
      resize.disconnect();
      mutate.disconnect();
    };
  }, [rootRef]);
}
