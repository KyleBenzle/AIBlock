import type { Category, DetectionMethods, Evidence, Rule } from '../../types';

export type Candidate = {
  target: Element;
  category: Category;
  evidence: Evidence;
  /** Stable identity used for user "not AI" corrections. */
  fingerprint?: string;
};

export type ScanContext = {
  host: string;
  rules: Rule[];
  methods: DetectionMethods;
};

/** Text and elements collected in one tree walk, shared by detectors. */
export type ScanInput = {
  root: Element | Document | ShadowRoot;
  shortTexts: Text[]; // trimmed length 2..120
  longTexts: Text[]; // trimmed length > 120
  shadowRoots: ShadowRoot[];
};

export type Detector = (input: ScanInput, ctx: ScanContext) => Candidate[];
