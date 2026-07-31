const RUNTIME_BINDING_ATTRIBUTE = /^data-[a-z0-9-]+-bound$/;

export function syncLiveElement(current: HTMLElement, next: HTMLElement): void {
  syncAttributes(current, next);
  syncChildren(current, next);
}

function syncAttributes(current: HTMLElement, next: HTMLElement): void {
  Array.from(current.attributes).forEach((attribute) => {
    if (!next.hasAttribute(attribute.name) && !RUNTIME_BINDING_ATTRIBUTE.test(attribute.name)) {
      current.removeAttribute(attribute.name);
    }
  });

  Array.from(next.attributes).forEach((attribute) => {
    if (current.getAttribute(attribute.name) !== attribute.value) {
      current.setAttribute(attribute.name, attribute.value);
    }
  });

  if (current instanceof HTMLInputElement && next instanceof HTMLInputElement) {
    current.checked = next.checked;
    current.disabled = next.disabled;
    if (document.activeElement !== current && current.value !== next.value) {
      current.value = next.value;
    }
  }
}

function syncChildren(current: HTMLElement, next: HTMLElement): void {
  let cursor: ChildNode | null = current.firstChild;

  Array.from(next.childNodes).forEach((nextChild) => {
    const nextKey = getLiveKey(nextChild);
    const keyedNode = nextKey
      ? Array.from(current.childNodes).find((candidate) => getLiveKey(candidate) === nextKey) ?? null
      : null;
    let currentChild = nextKey ? keyedNode : cursor;

    if (currentChild && keyedNode && currentChild !== cursor) {
      current.insertBefore(currentChild, cursor);
    }

    if (!currentChild) {
      currentChild = cloneChild(nextChild);
      current.insertBefore(currentChild, cursor);
    } else if (!canSync(currentChild, nextChild)) {
      const replacement = cloneChild(nextChild);
      current.replaceChild(replacement, currentChild);
      currentChild = replacement;
    } else {
      syncNode(currentChild, nextChild);
    }

    cursor = currentChild.nextSibling;
  });

  while (cursor) {
    const nextSibling = cursor.nextSibling;
    current.removeChild(cursor);
    cursor = nextSibling;
  }
}

function syncNode(current: ChildNode, next: ChildNode): void {
  if (current instanceof HTMLElement && next instanceof HTMLElement) {
    syncLiveElement(current, next);
    return;
  }

  if (current.nodeValue !== next.nodeValue) {
    current.nodeValue = next.nodeValue;
  }
}

function canSync(current: ChildNode, next: ChildNode): boolean {
  if (current.nodeType !== next.nodeType) {
    return false;
  }
  if (current instanceof HTMLElement && next instanceof HTMLElement) {
    return current.tagName === next.tagName;
  }
  return true;
}

function getLiveKey(node: ChildNode): string | null {
  return node instanceof HTMLElement ? node.dataset['liveKey'] ?? null : null;
}

function cloneChild(node: ChildNode): ChildNode {
  return node.cloneNode(true) as ChildNode;
}
