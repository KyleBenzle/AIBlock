import type { BlockedRecord, ClassifyResult, Evidence } from './types';

export type Msg =
  | { type: 'aib:count'; count: number; added: BlockedRecord[] }
  | { type: 'aib:checkMedia'; url: string }
  | { type: 'aib:classify'; text: string; host: string }
  | { type: 'aib:testProvider' }
  | { type: 'aib:getState' }
  | { type: 'aib:revealAll' }
  | { type: 'aib:rescan' };

export type CheckMediaResult = { evidence: Evidence[] };
export type { ClassifyResult };

export type PageState = {
  count: number;
  items: { id: number; category: string; score: number; reasons: string[] }[];
};

/** Validates the message envelope; individual handlers validate field types. */
export function isMsg(m: unknown): m is Msg {
  return !!m && typeof m === 'object' && typeof (m as any).type === 'string' && (m as any).type.startsWith('aib:');
}

/** Hosts whose content is never sent to AI providers (mail, chat, banking-like private content). */
export const SENSITIVE_HOSTS = [
  'mail.google.com', 'outlook.live.com', 'outlook.office.com', 'mail.yahoo.com', 'proton.me', 'web.whatsapp.com',
  'messenger.com', 'web.telegram.org', 'discord.com', 'app.slack.com', 'teams.microsoft.com', 'docs.google.com',
  'drive.google.com', 'icloud.com', 'chatgpt.com', 'claude.ai',
];
