const frame = document.querySelector<HTMLIFrameElement>('#mobile-frame');
const params = new URLSearchParams(window.location.search);

if (frame) {
  frame.src = `/e2e/note-ai-reply.html?${new URLSearchParams({
    state: params.get('state') || 'success',
    theme: params.get('theme') === 'night' ? 'night' : 'day',
    noteType: params.get('noteType') === 'markdown' ? 'markdown' : 'html',
  }).toString()}`;
}

export {};
