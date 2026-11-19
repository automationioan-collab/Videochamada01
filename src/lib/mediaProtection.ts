function isEditableElement(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
    return true;
  }
  return target.isContentEditable;
}

function hardenMediaElement(el: Element): void {
  if (el instanceof HTMLImageElement) {
    if (el.draggable !== false) {
      el.draggable = false;
    }
    if (el.getAttribute('draggable') !== 'false') {
      el.setAttribute('draggable', 'false');
    }
    if (el.style.getPropertyValue('-webkit-user-drag') !== 'none') {
      el.style.setProperty('-webkit-user-drag', 'none');
    }
    if (el.style.getPropertyValue('-webkit-touch-callout') !== 'none') {
      el.style.setProperty('-webkit-touch-callout', 'none');
    }
    if (el.style.userSelect !== 'none') {
      el.style.userSelect = 'none';
    }
    return;
  }

  if (el instanceof HTMLVideoElement) {
    if (el.controls) {
      el.controls = false;
    }
    if (el.hasAttribute('controls')) {
      el.removeAttribute('controls');
    }
    if (!el.disablePictureInPicture) {
      el.disablePictureInPicture = true;
    }
    if (el.getAttribute('disablePictureInPicture') !== 'true') {
      el.setAttribute('disablePictureInPicture', 'true');
    }
    const desiredControlsList = 'nodownload nofullscreen noremoteplayback';
    if (el.getAttribute('controlsList') !== desiredControlsList) {
      el.setAttribute('controlsList', desiredControlsList);
    }
    if ('disableRemotePlayback' in el && !el.disableRemotePlayback) {
      el.disableRemotePlayback = true;
    }
    if (el.draggable !== false) {
      el.draggable = false;
    }
    if (el.getAttribute('draggable') !== 'false') {
      el.setAttribute('draggable', 'false');
    }
    if (el.style.getPropertyValue('-webkit-user-drag') !== 'none') {
      el.style.setProperty('-webkit-user-drag', 'none');
    }
    if (el.style.getPropertyValue('-webkit-touch-callout') !== 'none') {
      el.style.setProperty('-webkit-touch-callout', 'none');
    }
    if (el.style.userSelect !== 'none') {
      el.style.userSelect = 'none';
    }
  }
}

function hardenSubtree(root: ParentNode | Element): void {
  if (root instanceof HTMLImageElement || root instanceof HTMLVideoElement) {
    hardenMediaElement(root);
  }
  if ('querySelectorAll' in root) {
    root.querySelectorAll('img, video').forEach(hardenMediaElement);
  }
}

export function installMediaProtection(): () => void {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return () => {};
  }

  let isHardening = false;

  const runSafeHarden = (fn: () => void, observer?: MutationObserver) => {
    if (isHardening) return;
    isHardening = true;
    try {
      fn();
      observer?.takeRecords();
    } finally {
      isHardening = false;
    }
  };

  runSafeHarden(() => {
    hardenSubtree(document);
  });

  const handleContextMenu = (e: MouseEvent) => {
    if (isEditableElement(e.target)) return;
    e.preventDefault();
  };

  const handleDragStart = (e: DragEvent) => {
    if (isEditableElement(e.target)) return;
    const target = e.target;
    if (
      target instanceof HTMLImageElement ||
      target instanceof HTMLVideoElement ||
      (target instanceof HTMLElement &&
        Boolean(target.querySelector('img, video') || target.closest('[data-protected-media]')))
    ) {
      e.preventDefault();
      return;
    }
    // Prevent dragging any visual media element across the studio
    e.preventDefault();
  };

  const handleCopy = (e: ClipboardEvent) => {
    if (isEditableElement(e.target)) return;
    const sel = window.getSelection();
    const anchorNode = sel?.anchorNode;
    if (
      anchorNode instanceof HTMLElement &&
      anchorNode.querySelector?.('img, video')
    ) {
      e.preventDefault();
    }
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    const key = e.key.toLowerCase();
    const hasModifier = e.ctrlKey || e.metaKey;

    // Block Save Page (Ctrl/Cmd+S), Print/Save PDF (Ctrl/Cmd+P), View Source (Ctrl/Cmd+U)
    if (hasModifier && (key === 's' || key === 'p' || key === 'u')) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }

    // Best-effort block for PrintScreen
    if (e.key === 'PrintScreen') {
      e.preventDefault();
      if (navigator.clipboard?.writeText) {
        void navigator.clipboard.writeText('').catch(() => {});
      }
    }
  };

  document.addEventListener('contextmenu', handleContextMenu, { capture: true });
  document.addEventListener('dragstart', handleDragStart, { capture: true });
  document.addEventListener('copy', handleCopy, { capture: true });
  window.addEventListener('keydown', handleKeyDown, { capture: true });

  const observer = new MutationObserver((mutations) => {
    if (isHardening) return;
    runSafeHarden(() => {
      for (const mutation of mutations) {
        if (mutation.type === 'childList') {
          mutation.addedNodes.forEach((node) => {
            if (node instanceof Element) {
              hardenSubtree(node);
            }
          });
        } else if (
          mutation.type === 'attributes' &&
          (mutation.target instanceof HTMLImageElement ||
            mutation.target instanceof HTMLVideoElement)
        ) {
          hardenMediaElement(mutation.target);
        }
      }
    }, observer);
  });

  if (document.documentElement) {
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['controls', 'controlslist', 'draggable', 'src'],
    });
  }

  return () => {
    document.removeEventListener('contextmenu', handleContextMenu, {
      capture: true,
    });
    document.removeEventListener('dragstart', handleDragStart, {
      capture: true,
    });
    document.removeEventListener('copy', handleCopy, { capture: true });
    window.removeEventListener('keydown', handleKeyDown, { capture: true });
    observer.disconnect();
  };
}
