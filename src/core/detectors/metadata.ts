import type { Evidence } from '../../types';

/**
 * Extracts metadata segments (not pixel data) from JPEG/PNG/WebP/AVIF bytes and looks for
 * embedded AI provenance: IPTC DigitalSourceType, C2PA manifests and generator parameters.
 * C2PA signatures are NOT cryptographically verified here; reasons say so.
 */
export function extractMetadata(bytes: Uint8Array): string {
  const parts: Uint8Array[] = [];
  const n = bytes.length;
  if (n > 3 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    // JPEG: APPn and COM segments until start-of-scan.
    let i = 2;
    while (i + 4 <= n && bytes[i] === 0xff) {
      const marker = bytes[i + 1];
      if (marker === 0xda || marker === 0xd9) break;
      const len = (bytes[i + 2] << 8) | bytes[i + 3];
      if (len < 2) break;
      if ((marker >= 0xe0 && marker <= 0xef) || marker === 0xfe) parts.push(bytes.subarray(i + 4, Math.min(n, i + 2 + len)));
      i += 2 + len;
    }
  } else if (n > 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    // PNG: text, EXIF and C2PA (caBX) chunks.
    let i = 8;
    while (i + 12 <= n) {
      const len = ((bytes[i] << 24) | (bytes[i + 1] << 16) | (bytes[i + 2] << 8) | bytes[i + 3]) >>> 0;
      const type = String.fromCharCode(bytes[i + 4], bytes[i + 5], bytes[i + 6], bytes[i + 7]);
      if (type === 'IDAT' || type === 'IEND') break;
      if (/^(tEXt|iTXt|eXIf|caBX)$/.test(type)) parts.push(bytes.subarray(i + 8, Math.min(n, i + 8 + len)));
      i += 12 + len;
    }
  } else if (n > 12 && String.fromCharCode(...bytes.subarray(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.subarray(8, 12)) === 'WEBP') {
    let i = 12;
    while (i + 8 <= n) {
      const type = String.fromCharCode(...bytes.subarray(i, i + 4));
      const len = (bytes[i + 4] | (bytes[i + 5] << 8) | (bytes[i + 6] << 16) | (bytes[i + 7] << 24)) >>> 0;
      if (/^(EXIF|XMP |C2PA)$/.test(type)) parts.push(bytes.subarray(i + 8, Math.min(n, i + 8 + len)));
      i += 8 + len + (len & 1);
    }
  } else {
    // Other formats (AVIF/HEIF/GIF): scan the leading bytes, where metadata boxes usually live.
    parts.push(bytes.subarray(0, Math.min(n, 64 * 1024)));
  }
  let s = '';
  for (const p of parts) for (let j = 0; j < p.length; j += 8192) s += String.fromCharCode(...p.subarray(j, j + 8192));
  return s;
}

const GENERATOR_NAMES =
  /\b(Midjourney|DALL[·\-.]?E|Stable Diffusion|Adobe Firefly|Imagen|Google AI|Gemini|ChatGPT|GPT-4o|OpenAI|Leonardo\.ai|Ideogram|NovelAI|ComfyUI|Flux(?:\.1)?|Grok|Aurora|Bing Image Creator|Microsoft Designer)\b/;

export function analyzeMetadata(bytes: Uint8Array): Evidence[] {
  const meta = extractMetadata(bytes);
  if (!meta) return [];
  const ev: Evidence[] = [];
  const hasC2pa = /c2pa|jumb/i.test(meta);
  // Case-sensitive: "compositeWithTrainedAlgorithmicMedia" does not match the bare term.
  if (/trainedAlgorithmicMedia/.test(meta)) {
    ev.push({
      source: 'metadata',
      type: hasC2pa ? 'c2pa-digital-source-type' : 'iptc-digital-source-type',
      score: 95,
      explicit: true,
      reason: hasC2pa
        ? 'Embedded C2PA/IPTC provenance declares the image was AI-generated (signature not cryptographically verified)'
        : 'Embedded IPTC metadata declares the image was AI-generated (trainedAlgorithmicMedia)',
    });
  } else if (/compositeWithTrainedAlgorithmicMedia/.test(meta)) {
    ev.push({ source: 'metadata', type: 'iptc-composite', score: 70, reason: 'Embedded metadata declares the image was partly edited with generative AI' });
  }
  if (/parameters[\s\S]{1,4000}?Steps: \d+, Sampler: /.test(meta) || /"class_type"\s*:\s*"(?:KSampler|CheckpointLoaderSimple)"/.test(meta)) {
    ev.push({ source: 'metadata', type: 'generator-parameters', score: 93, explicit: true, reason: 'Image contains Stable Diffusion/ComfyUI generation parameters' });
  }
  const gen = GENERATOR_NAMES.exec(meta);
  if (gen && !ev.some((e) => e.explicit)) {
    ev.push({ source: 'metadata', type: 'generator-name', score: 78, reason: `Image metadata names an AI generator ("${gen[1]}")` });
  }
  return ev;
}
