// Drawer removal can generate mouseenter without any pointer movement. Only
// suppress the registered trigger actually revealed underneath that drawer.
const triggers = new Set<HTMLElement>();
const blocked = new Set<HTMLElement>();
let pointer: { x: number; y: number } | null = null;

function trackPointer(event: PointerEvent) {
  if (event.pointerType !== 'mouse' && event.pointerType !== 'pen') {
    resetPointer();
    return;
  }
  pointer = { x: event.clientX, y: event.clientY };
  for (const trigger of blocked) {
    const rect = trigger.getBoundingClientRect();
    if (pointer.x < rect.left || pointer.x >= rect.right || pointer.y < rect.top || pointer.y >= rect.bottom) {
      blocked.delete(trigger);
    }
  }
}

function resetPointer() {
  pointer = null;
  blocked.clear();
}

function leaveDocument(event: PointerEvent) {
  if (!event.relatedTarget) resetPointer();
}

export function registerHoverTrigger(trigger: HTMLElement) {
  triggers.add(trigger);
  if (triggers.size === 1) {
    document.addEventListener('pointermove', trackPointer, true);
    document.addEventListener('pointerdown', trackPointer, true);
    document.addEventListener('pointerout', leaveDocument, true);
    window.addEventListener('blur', resetPointer);
  }
  return () => {
    triggers.delete(trigger);
    blocked.delete(trigger);
    if (triggers.size) return;
    document.removeEventListener('pointermove', trackPointer, true);
    document.removeEventListener('pointerdown', trackPointer, true);
    document.removeEventListener('pointerout', leaveDocument, true);
    window.removeEventListener('blur', resetPointer);
    resetPointer();
  };
}

export function isRevealedHoverBlocked(trigger: HTMLElement) {
  return blocked.has(trigger);
}

export function clearRevealedHover(trigger: HTMLElement) {
  blocked.delete(trigger);
}

// Capture before hiding; run the returned callback after the DOM update and
// modal-layer release, before the browser dispatches the resulting mouseenter.
export function prepareRevealedHover(overlay: HTMLElement | null) {
  const position = pointer;
  if (!overlay || !position || !overlay.contains(document.elementFromPoint?.(position.x, position.y) ?? null)) {
    return;
  }
  return () => {
    if (pointer !== position) return;
    let revealed = document.elementFromPoint?.(position.x, position.y);
    while (revealed) {
      if (triggers.has(revealed as HTMLElement)) {
        blocked.add(revealed as HTMLElement);
        return;
      }
      revealed = revealed.parentElement;
    }
  };
}
