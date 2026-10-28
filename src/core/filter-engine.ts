import type { Category, Detection, RemovalMode } from '../types';
import { UI_ATTR } from './detectors/container';

export const HIDDEN_ATTR = 'data-aib-hidden';

export const PLACEHOLDER_TEXT: Record<Category, string> = {
  text: 'AI TEXT REMOVED',
  image: 'AI IMAGE REMOVED',
  video: 'AI VIDEO REMOVED',
  audio: 'AI AUDIO REMOVED',
  advertisement: 'AI AD REMOVED',
  search: 'AI ANSWER REMOVED',
};

export type Entry = {
  id: number;
  el: Element;
  detection: Detection;
  fingerprint?: string;
  placeholder?: HTMLElement;
  prevDisplay: string;
  prevPriority: string;
};

type Options = {
  mode: RemovalMode;
  onNotAi?: (entry: Entry) => void;
  onChange?: () => void;
};

/** Reversible hiding: original nodes stay in place (state and listeners preserved). */
export class FilterEngine {
  private entries = new Map<number, Entry>();
  private byEl = new WeakMap<Element, Entry>();
  private revealed = new WeakSet<Element>();
  private nextId = 1;

  constructor(private opts: Options) {}

  get mode() {
    return this.opts.mode;
  }

  isRevealed(el: Element) {
    return this.revealed.has(el);
  }

  isBlocked(el: Element) {
    return this.byEl.has(el);
  }

  /** Returns true when the element was newly blocked. */
  apply(el: Element, detection: Detection, fingerprint?: string): boolean {
    if (this.byEl.has(el) || this.revealed.has(el) || !el.isConnected) return false;
    if (el.parentElement?.closest(`[${HIDDEN_ATTR}]`)) return false; // already inside hidden content
    // A larger target supersedes blocked descendants.
    for (const inner of el.querySelectorAll(`[${HIDDEN_ATTR}]`)) {
      const e = this.byEl.get(inner);
      if (e) this.remove(e);
    }
    const style = (el as HTMLElement).style;
    const entry: Entry = {
      id: this.nextId++,
      el,
      detection,
      fingerprint,
      prevDisplay: style?.getPropertyValue('display') ?? '',
      prevPriority: style?.getPropertyPriority('display') ?? '',
    };
    this.entries.set(entry.id, entry);
    this.byEl.set(el, entry);
    this.hide(entry);
    this.opts.onChange?.();
    return true;
  }

  private hide(e: Entry) {
    e.el.setAttribute(HIDDEN_ATTR, String(e.id));
    (e.el as HTMLElement).style?.setProperty('display', 'none', 'important');
    if (this.opts.mode === 'placeholder' && !e.placeholder) {
      e.placeholder = this.makePlaceholder(e);
      e.el.before(e.placeholder);
    }
  }

  private unhide(e: Entry) {
    const style = (e.el as HTMLElement).style;
    if (style) {
      if (e.prevDisplay) style.setProperty('display', e.prevDisplay, e.prevPriority);
      else style.removeProperty('display');
    }
    e.el.removeAttribute(HIDDEN_ATTR);
    e.placeholder?.remove();
    e.placeholder = undefined;
  }

  private remove(e: Entry) {
    this.unhide(e);
    this.entries.delete(e.id);
    this.byEl.delete(e.el);
  }

  reveal(id: number) {
    const e = this.entries.get(id);
    if (!e) return;
    this.revealed.add(e.el);
    this.remove(e);
    this.opts.onChange?.();
  }

  revealAll() {
    for (const e of [...this.entries.values()]) {
      this.revealed.add(e.el);
      this.remove(e);
    }
    this.opts.onChange?.();
  }

  /** Restores everything and forgets reveal state (used when disabling or re-scanning). */
  restoreAll() {
    for (const e of [...this.entries.values()]) this.remove(e);
    this.revealed = new WeakSet();
    this.opts.onChange?.();
  }

  setMode(mode: RemovalMode) {
    if (mode === this.opts.mode) return;
    this.opts.mode = mode;
    for (const e of this.entries.values()) {
      this.unhide(e);
      this.hide(e);
    }
  }

  /** Active blocked entries; disconnected elements (SPA navigation) are pruned. */
  list(): Entry[] {
    for (const e of [...this.entries.values()]) {
      if (!e.el.isConnected) {
        e.placeholder?.remove();
        this.entries.delete(e.id);
        this.byEl.delete(e.el);
      }
    }
    return [...this.entries.values()];
  }

  count() {
    return this.list().length;
  }

  private makePlaceholder(e: Entry): HTMLElement {
    const doc = e.el.ownerDocument;
    const box = doc.createElement('div');
    box.setAttribute(UI_ATTR, 'placeholder');
    box.setAttribute('role', 'note');
    box.style.cssText =
      'all:initial;display:flex;align-items:center;gap:8px;flex-wrap:wrap;box-sizing:border-box;margin:4px 0;padding:6px 10px;border:1px dashed rgba(128,128,128,.6);border-radius:6px;background:rgba(128,128,128,.12);color:inherit;font:600 12px/1.4 system-ui,sans-serif;letter-spacing:.03em;max-width:100%;';
    const label = doc.createElement('span');
    label.textContent = PLACEHOLDER_TEXT[e.detection.category];
    label.style.cssText = 'all:unset;font:inherit;color:inherit;';
    const why = e.detection.evidence.map((x) => x.reason).join('\n');
    label.title = `Score ${e.detection.score}\n${why}`;
    box.append(label, this.button(doc, 'Reveal', () => this.reveal(e.id)));
    if (this.opts.onNotAi) {
      box.append(
        this.button(doc, 'Not AI', () => {
          this.opts.onNotAi?.(e);
          this.reveal(e.id);
        }),
      );
    }
    return box;
  }

  private button(doc: Document, text: string, onClick: () => void) {
    const b = doc.createElement('button');
    b.type = 'button';
    b.textContent = text;
    b.style.cssText =
      'all:unset;cursor:pointer;font:500 11px/1 system-ui,sans-serif;padding:4px 8px;border-radius:4px;border:1px solid rgba(128,128,128,.6);color:inherit;';
    b.addEventListener('click', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      onClick();
    });
    return b;
  }
}
