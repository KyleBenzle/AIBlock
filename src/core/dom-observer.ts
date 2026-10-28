import { UI_ATTR } from './detectors/container';

const ATTRS = ['src', 'srcset', 'alt', 'title', 'aria-label', 'poster', 'data-ai-generated'];
const MAX_QUEUE = 400;

/** Batches DOM mutations into a minimal set of subtree roots and flushes them when idle. */
export class DomObserver {
  private mo: MutationObserver;
  private queue = new Set<Node>();
  private full = new Set<Document | ShadowRoot>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private observed = new WeakSet<Node>();
  private targets: (Document | ShadowRoot)[] = [];
  flushes = 0;

  constructor(
    private onRoots: (roots: (Element | Document | ShadowRoot)[]) => void,
    private delay = 120,
  ) {
    this.mo = new MutationObserver((records) => this.onMutations(records));
  }

  observe(target: Document | ShadowRoot) {
    if (this.observed.has(target)) return;
    this.observed.add(target);
    this.targets.push(target);
    this.mo.observe(target, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  }

  disconnect() {
    this.mo.disconnect();
    this.observed = new WeakSet();
    this.targets = [];
    this.queue.clear();
    this.full.clear();
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private onMutations(records: MutationRecord[]) {
    for (const r of records) {
      if (r.type === 'childList') {
        r.addedNodes.forEach((n) => this.enqueue(n));
      } else {
        this.enqueue(r.type === 'characterData' ? r.target.parentNode : r.target);
      }
    }
  }

  private enqueue(n: Node | null) {
    if (!n) return;
    if (n.nodeType === 3) n = n.parentNode;
    if (!n || n.nodeType !== 1) return;
    const el = n as Element;
    if (el.hasAttribute(UI_ATTR) || el.closest(`[${UI_ATTR}]`)) return;
    if (this.queue.size >= MAX_QUEUE) {
      const root = el.getRootNode() as Document | ShadowRoot;
      this.full.add(root);
    } else this.queue.add(el);
    this.schedule();
  }

  private schedule() {
    if (this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.flush();
    }, this.delay);
  }

  flush() {
    this.flushes++;
    const roots: (Element | Document | ShadowRoot)[] = [...this.full];
    const nodes = [...this.queue].filter((n) => n.isConnected && ![...this.full].some((f) => f.contains(n)));
    this.queue.clear();
    this.full.clear();
    // Drop nodes contained in another queued node.
    const set = new Set(nodes);
    for (const n of nodes) {
      let p = n.parentNode;
      let covered = false;
      while (p) {
        if (set.has(p)) {
          covered = true;
          break;
        }
        p = p.parentNode;
      }
      if (!covered) roots.push(n as Element);
    }
    if (roots.length) this.onRoots(roots);
  }
}
