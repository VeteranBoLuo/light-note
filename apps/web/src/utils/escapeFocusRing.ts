const HIDE_ESCAPE_FOCUS_RING = 'light-note-hide-escape-focus-ring';
const MODIFIER_KEYS = new Set(['Alt', 'AltGraph', 'Control', 'Meta', 'Shift']);

export function installEscapeFocusRing(windowObject: Window = window) {
  const { classList } = windowObject.document.documentElement;
  const restoreFocusRing = () => classList.remove(HIDE_ESCAPE_FOCUS_RING);

  function onKeydown(event: KeyboardEvent) {
    if (event.isComposing || event.keyCode === 229) return;
    if (event.key === 'Escape') {
      classList.add(HIDE_ESCAPE_FOCUS_RING);
    } else if (!MODIFIER_KEYS.has(event.key)) {
      restoreFocusRing();
    }
  }

  // Capture runs before dialogs or editors handle Escape and possibly restore focus.
  windowObject.addEventListener('keydown', onKeydown, true);
  windowObject.addEventListener('pointerdown', restoreFocusRing, { capture: true, passive: true });

  return () => {
    windowObject.removeEventListener('keydown', onKeydown, true);
    windowObject.removeEventListener('pointerdown', restoreFocusRing, true);
    restoreFocusRing();
  };
}
