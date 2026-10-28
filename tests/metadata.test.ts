import { describe, expect, it } from 'vitest';
import { analyzeMetadata } from '../src/core/detectors/metadata';
import { analyzeUrl } from '../src/core/detectors/url-detector';

const enc = (s: string) => [...new TextEncoder().encode(s)];
function jpeg(app1: string) {
  const payload = enc(app1);
  const len = payload.length + 2;
  return new Uint8Array([0xff, 0xd8, 0xff, 0xe1, len >> 8, len & 255, ...payload, 0xff, 0xda, 0, 2, ...enc('trainedAlgorithmicMedia-in-pixels'), 0xff, 0xd9]);
}
function png(chunks: [string, string][]) {
  const out = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  for (const [type, data] of [...chunks, ['IEND', ''] as [string, string]]) {
    const d = enc(data);
    out.push((d.length >>> 24) & 255, (d.length >>> 16) & 255, (d.length >>> 8) & 255, d.length & 255, ...enc(type), ...d, 0, 0, 0, 0);
  }
  return new Uint8Array(out);
}

describe('metadata provenance', () => {
  it('detects IPTC trainedAlgorithmicMedia in XMP as explicit', () => {
    const ev = analyzeMetadata(jpeg('http://ns.adobe.com/xap/1.0/\0<Iptc4xmpExt:DigitalSourceType>http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia</Iptc4xmpExt:DigitalSourceType>'));
    expect(ev[0]).toMatchObject({ explicit: true, type: 'iptc-digital-source-type' });
  });
  it('treats composite edits as non-explicit', () => {
    const ev = analyzeMetadata(jpeg('x compositeWithTrainedAlgorithmicMedia'));
    expect(ev[0]).toMatchObject({ type: 'iptc-composite' });
    expect(ev[0].explicit).toBeUndefined();
  });
  it('ignores pixel data and plain images', () => {
    expect(analyzeMetadata(jpeg('Exif\0\0Canon EOS'))).toEqual([]);
  });
  it('detects Stable Diffusion parameters in PNG', () => {
    const ev = analyzeMetadata(png([['tEXt', 'parameters\0a cat\nSteps: 20, Sampler: Euler a, CFG scale: 7']]));
    expect(ev[0]).toMatchObject({ type: 'generator-parameters', explicit: true });
  });
  it('missing metadata is not evidence', () => {
    expect(analyzeMetadata(new Uint8Array([1, 2, 3]))).toEqual([]);
  });
});

describe('url analysis', () => {
  it('flags AI generator hosts and file names only', () => {
    expect(analyzeUrl('https://cdn.midjourney.com/x.png', 'https://a.com')?.score).toBe(88);
    expect(analyzeUrl('/img/DALL%C2%B7E%202024-01-01.png', 'https://a.com')?.score).toBe(50);
    expect(analyzeUrl('https://example.com/photo.jpg', 'https://a.com')).toBeNull();
    expect(analyzeUrl('https://example.com/blog/ai-news.jpg', 'https://a.com')).toBeNull();
  });
});
