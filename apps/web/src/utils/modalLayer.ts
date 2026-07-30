const modalLayers: symbol[] = [];
let appRestoreState: { inert: boolean; ariaHidden: string | null } | null = null;

function appRoot() {
  return typeof document === 'undefined' ? null : document.getElementById('app');
}

export function acquireModalLayer(layer: symbol) {
  if (modalLayers.includes(layer)) return;
  modalLayers.push(layer);
  if (modalLayers.length !== 1) return;
  const root = appRoot();
  if (!root) return;
  appRestoreState = {
    inert: root.hasAttribute('inert'),
    ariaHidden: root.getAttribute('aria-hidden'),
  };
  root.setAttribute('inert', '');
  root.setAttribute('aria-hidden', 'true');
}

export function releaseModalLayer(layer: symbol) {
  const index = modalLayers.lastIndexOf(layer);
  if (index >= 0) modalLayers.splice(index, 1);
  if (modalLayers.length > 0) return;
  const root = appRoot();
  if (!root || !appRestoreState) return;
  if (!appRestoreState.inert) root.removeAttribute('inert');
  if (appRestoreState.ariaHidden === null) root.removeAttribute('aria-hidden');
  else root.setAttribute('aria-hidden', appRestoreState.ariaHidden);
  appRestoreState = null;
}

export function isTopModalLayer(layer: symbol) {
  return modalLayers.at(-1) === layer;
}
