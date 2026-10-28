import type { Category } from '../../types';

export const UI_ATTR = 'data-aib-ui';

const PROTECTED_SELF =
  'html, body, head, main, nav, header, form, [role="navigation"], [role="search"], [role="banner"], [role="main"], #rso, #search, #res, #center_col, #b_results, [contenteditable="true"]';
const PROTECTED_INSIDE =
  'main, nav, [role="navigation"], [role="search"], [role="main"], input[type="search"], input[type="password"], #rso, #search, #b_results';

const AD_SELECTOR =
  'ins.adsbygoogle, [id^="google_ads"], [data-ad], [data-ad-slot], [data-ad-client], [data-adunit], [aria-label="Advertisement" i], [aria-label="Sponsored" i], [data-testid="placementTracking"], [data-text-ad], .ad-container, .advertisement, .sponsored-post';

const ITEM = 'article, [role="article"], li, [role="listitem"], [role="comment"], section';

const SEMANTIC_TEXT =
  'article, [role="article"], [role="comment"], [role="listitem"], li, blockquote, [itemprop="review"], [data-testid*="review" i], [class*="comment" i], [class*="review" i]';

let pageTextLen = 0;
let pageTextAt = 0;
function documentTextLength(doc: Document): number {
  const now = Date.now();
  if (now - pageTextAt > 2000) {
    pageTextLen = doc.body?.textContent?.length ?? 0;
    pageTextAt = now;
  }
  return pageTextLen;
}

/** A removal target must not be page structure, navigation, search UI or most of the page. */
export function isSafeTarget(el: Element): boolean {
  if (!el.isConnected || el.closest(`[${UI_ATTR}]`)) return false;
  if (el.matches(PROTECTED_SELF) || el.querySelector(PROTECTED_INSIDE)) return false;
  const total = documentTextLength(el.ownerDocument);
  const own = el.textContent?.length ?? 0;
  if (total > 3000 && own > total * 0.6) return false;
  return true;
}

const BOUNDARY = 'body, main, [role="main"], #main, #rcnt, #center_col, #rso, #search, #res, #b_results, #b_content, #links, #results';

/**
 * Fallback when a rule's expected container is missing (sites change markup): returns the largest
 * safe ancestor of el that still sits below page-structure boundaries and contains no protected UI.
 */
export function climbToBoundary(el: Element, maxDepth = 15): Element | null {
  let cur: Element | null = isSafeTarget(el) ? el : null;
  let p = parentOf(el);
  for (let i = 0; p && i < maxDepth; i++, p = parentOf(p)) {
    if (p.matches(BOUNDARY) || !isSafeTarget(p)) break;
    cur = p;
  }
  return cur;
}

/** Walks up from `el` and returns the nearest ancestor (inclusive) matching sel that is safe. */
export function closestSafe(el: Element, sel: string, maxDepth = 25): Element | null {
  let cur: Element | null = el;
  for (let i = 0; cur && i < maxDepth; i++, cur = parentOf(cur)) {
    if (cur.matches(sel)) return isSafeTarget(cur) ? cur : null;
  }
  return null;
}

/** parentElement, crossing open shadow-root boundaries. */
export function parentOf(el: Element): Element | null {
  if (el.parentElement) return el.parentElement;
  const root = el.parentNode;
  return root && (root as ShadowRoot).host ? (root as ShadowRoot).host : null;
}

const MEDIA_SEL: Record<'image' | 'video' | 'audio', string> = {
  image: 'img, picture, svg image, [role="img"]',
  video: 'video, iframe[src*="youtube.com/embed"], iframe[src*="player.vimeo.com"], iframe[src*="sora"]',
  audio: 'audio, iframe[src*="suno.com"], iframe[src*="udio.com"], iframe[src*="soundcloud.com"]',
};

export function mediaKind(el: Element): 'image' | 'video' | 'audio' | null {
  for (const k of ['video', 'audio', 'image'] as const) {
    if (el.matches(MEDIA_SEL[k]) || el.querySelector(MEDIA_SEL[k])) return k;
  }
  return null;
}

/** Finds the smallest safe container that groups a label with the media it describes. */
export function findMediaContainer(anchor: Element, maxDepth = 4): Element | null {
  const fig = anchor.closest('figure');
  if (fig && mediaKind(fig) && isSafeTarget(fig)) return fig;
  let cur: Element | null = anchor;
  for (let i = 0; cur && i <= maxDepth; i++, cur = parentOf(cur)) {
    const kind = mediaKind(cur);
    // A label inside a post/comment without media belongs to that item, not to media elsewhere.
    if (!kind && cur.matches(ITEM)) return null;
    if (kind && cur.querySelectorAll(ITEM).length > 1) return null; // spans several items
    if (kind) {
      const count = cur.querySelectorAll('img, video, audio, iframe').length;
      const textLen = cur.textContent?.trim().length ?? 0;
      if (count <= 3 && textLen < 600 && isSafeTarget(cur)) return cur;
      return null;
    }
  }
  return null;
}

/** Smallest semantic container for a text item (post, comment, review); falls back to the block. */
export function findTextContainer(anchor: Element, preferArticle = false): Element | null {
  if (preferArticle) {
    const art = closestSafe(anchor, 'article, [itemprop="articleBody"], [role="article"], .post-content, .entry-content');
    if (art) return art;
  }
  const sem = closestSafe(anchor, SEMANTIC_TEXT, 10);
  if (sem) return sem;
  let block: Element | null = anchor;
  while (block && getDisplay(block) === 'inline' && parentOf(block)) block = parentOf(block);
  return block && isSafeTarget(block) ? block : null;
}

function getDisplay(el: Element): string {
  const tag = el.tagName;
  return /^(SPAN|A|EM|STRONG|B|I|SMALL|LABEL|ABBR|CODE|SUB|SUP|MARK)$/.test(tag) ? 'inline' : 'block';
}

export function adContainer(el: Element): Element | null {
  const ad = el.closest(AD_SELECTOR);
  return ad && isSafeTarget(ad) ? ad : null;
}

/** Refines a declared category using the target's actual content. */
export function refineCategory(target: Element, cat: Category): Category {
  if (cat === 'search' || cat === 'advertisement') return cat;
  if (adContainer(target)) return 'advertisement';
  const kind = mediaKind(target);
  if (cat === 'image' && kind === 'video') return 'video';
  if (cat === 'text' && kind && (target.textContent?.trim().length ?? 0) < 40) return kind;
  return cat;
}
