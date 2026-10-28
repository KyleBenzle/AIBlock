import { UI_ATTR } from './container';
import type { ScanInput } from './types';

const SKIP = /^(SCRIPT|STYLE|NOSCRIPT|TEMPLATE|TEXTAREA|INPUT|SELECT|OPTION|CODE|PRE|SVG|CANVAS|IFRAME)$/;

/** Single TreeWalker pass collecting text nodes and open shadow roots below root. */
export function collect(root: Element | Document | ShadowRoot): ScanInput {
  const out: ScanInput = { root, shortTexts: [], longTexts: [], shadowRoots: [] };
  const doc = (root as Node).ownerDocument ?? (root as Document);
  if ((root as Node).nodeType === 1) {
    if ((root as Element).closest(`[${UI_ATTR}], [contenteditable="true"]`)) return out;
    if ((root as Element).shadowRoot) out.shadowRoots.push((root as Element).shadowRoot!);
  }
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
    acceptNode(n) {
      if (n.nodeType === 1) {
        const el = n as Element;
        if (SKIP.test(el.tagName.toUpperCase()) || el.hasAttribute(UI_ATTR) || el.getAttribute('contenteditable') === 'true')
          return NodeFilter.FILTER_REJECT;
        if (el.shadowRoot) out.shadowRoots.push(el.shadowRoot);
        return NodeFilter.FILTER_SKIP;
      }
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  let n: Node | null;
  while ((n = walker.nextNode())) {
    const len = n.nodeValue?.trim().length ?? 0;
    if (len >= 2 && len <= 120) out.shortTexts.push(n as Text);
    else if (len > 120) out.longTexts.push(n as Text);
  }
  return out;
}

export const norm = (t: Text) => (t.nodeValue ?? '').replace(/\s+/g, ' ').trim();
