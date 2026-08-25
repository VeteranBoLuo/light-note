const frame = document.querySelector<HTMLIFrameElement>('#mobile-frame');
if (frame) {
  const params = new URLSearchParams(window.location.search);
  const viewportWidth = Number(params.get('viewport'));
  if ([320, 375, 390, 430].includes(viewportWidth)) frame.style.width = `${viewportWidth}px`;
  frame.src = `/e2e/image-viewer.html?${params.toString()}`;
}
