import type { Category } from '../../types';
import { adContainer, findMediaContainer, isSafeTarget, refineCategory } from './container';
import type { Candidate, Detector } from './types';

type HostSig = { host: RegExp; category: Category; score: number; name: string };

/** Hosts that serve only AI-generator output. Matching is strong but not explicit evidence. */
export const AI_MEDIA_HOSTS: HostSig[] = [
  { host: /(^|\.)cdn\.midjourney\.com$/, category: 'image', score: 88, name: 'Midjourney CDN' },
  { host: /^oaidalleapiprodscus\.blob\.core\.windows\.net$/, category: 'image', score: 88, name: 'OpenAI DALL·E storage' },
  { host: /(^|\.)(replicate\.delivery)$/, category: 'image', score: 75, name: 'Replicate model output' },
  { host: /(^|\.)cdn\.leonardo\.ai$/, category: 'image', score: 85, name: 'Leonardo.ai CDN' },
  { host: /(^|\.)image\.civitai\.com$/, category: 'image', score: 80, name: 'Civitai images' },
  { host: /(^|\.)ideogram\.ai$/, category: 'image', score: 82, name: 'Ideogram' },
  { host: /(^|\.)lexica\.art$/, category: 'image', score: 82, name: 'Lexica' },
  { host: /(^|\.)nightcafe\.studio$/, category: 'image', score: 80, name: 'NightCafe' },
  { host: /(^|\.)videos\.openai\.com$/, category: 'video', score: 88, name: 'OpenAI Sora video' },
  { host: /(^|\.)sora\.chatgpt\.com$/, category: 'video', score: 88, name: 'Sora' },
  { host: /(^|\.)(cdn\d*\.suno\.ai|suno\.com)$/, category: 'audio', score: 88, name: 'Suno AI music' },
  { host: /(^|\.)udio\.com$/, category: 'audio', score: 88, name: 'Udio AI music' },
];

/** Filename hints such as "DALL·E 2024-…png". Weak-to-moderate evidence. */
const FILENAME_HINTS: [RegExp, number, string][] = [
  [/(?:^|[/_-])(?:dall[-_·. ]?e[-_ ]?\d?|midjourney|stable[-_]?diffusion|sdxl|comfyui|firefly|ai[-_]generated|aigenerated)(?:[-_./ ]|$)/i, 50, 'AI generator name in file name'],
  [/(?:^|\/)(?:ComfyUI_\d{5}|\d{5}-\d{6,}-[a-f0-9]{4,})/i, 40, 'Generator-style default file name'],
];

const SRC_SEL = 'img[src], img[srcset], video[src], video[poster], audio[src], source[src], iframe[src]';

function urlsOf(el: Element): string[] {
  const urls: string[] = [];
  for (const a of ['src', 'poster', 'currentSrc']) {
    const v = a === 'currentSrc' ? (el as HTMLImageElement).currentSrc : el.getAttribute(a);
    if (v) urls.push(v);
  }
  return urls;
}

export function analyzeUrl(raw: string, base: string): { category?: Category; score: number; reason: string } | null {
  let u: URL;
  try {
    u = new URL(raw, base);
  } catch {
    return null;
  }
  if (!/^https?:$/.test(u.protocol)) return null;
  for (const s of AI_MEDIA_HOSTS) if (s.host.test(u.hostname)) return { category: s.category, score: s.score, reason: `Served from ${s.name}` };
  let path = u.pathname;
  try {
    path = decodeURIComponent(path);
  } catch {
    /* keep raw */
  }
  for (const [re, score, reason] of FILENAME_HINTS) if (re.test(path)) return { score, reason };
  return null;
}

export const urlDetector: Detector = (input) => {
  const out: Candidate[] = [];
  const root = input.root as ParentNode & Node;
  const els = [...root.querySelectorAll(SRC_SEL)];
  if (root.nodeType === 1 && (root as Element).matches(SRC_SEL)) els.push(root as Element);
  const base = (root as Node).ownerDocument?.baseURI ?? (root as Document).baseURI;
  for (const el of els) {
    for (const url of urlsOf(el)) {
      const hit = analyzeUrl(url, base);
      if (!hit) continue;
      const media = el.tagName === 'SOURCE' ? el.parentElement ?? el : el;
      const tag = media.tagName;
      const declared: Category =
        tag === 'VIDEO' ? 'video' : tag === 'AUDIO' ? 'audio' : tag === 'IFRAME' ? hit.category ?? 'video' : 'image';
      const container = findMediaContainer(media, 2);
      const target = adContainer(media) ?? (container && container.querySelectorAll('img, video, audio, iframe').length === 1 ? container : media);
      if (!isSafeTarget(target)) continue;
      out.push({
        target,
        category: refineCategory(target, declared),
        evidence: { source: 'url', type: 'media-url', score: hit.score, reason: hit.reason },
        fingerprint: url,
      });
      break;
    }
  }
  return out;
};
