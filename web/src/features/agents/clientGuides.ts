import type { MessageKey } from '../../i18n/translate';

export const SERVICE_NAME = 'cosasimangia';
/** The MCP endpoint of the service whose origin is given (env.serviceOrigin or the page). */
export const mcpUrl = (origin: string) => `${origin}/mcp`;

export type ClientKey = 'claude_code' | 'codex' | 'claude_desktop' | 'chatgpt';
export interface GuideStep { text: MessageKey; command?: (url: string) => string }
export interface ClientGuideSpec {
  name: MessageKey;
  steps: GuideStep[];
  /** How to remove the service from the client too (shown when disconnecting). */
  remove: MessageKey;
  /** Not yet tried with this service (spec section 15): the page says so. */
  unverified?: true;
}

// Claude Code and Codex CLI verified on 11 October 2026 (spike/REPORT.md, Context7); the other two not yet.
export const CLIENT_GUIDES: Record<ClientKey, ClientGuideSpec> = {
  claude_code: {
    name: 'client.claude_code',
    steps: [
      { text: 'client.claude_code.step1', command: (url) => `claude mcp add --transport http --scope user ${SERVICE_NAME} ${url}` },
      { text: 'client.claude_code.step2' }
    ],
    remove: 'client.claude_code.remove'
  },
  codex: {
    name: 'client.codex',
    steps: [
      { text: 'client.codex.step1', command: (url) => `codex mcp add ${SERVICE_NAME} --url ${url}` },
      { text: 'client.codex.step2', command: () => `codex mcp login ${SERVICE_NAME}` }
    ],
    remove: 'client.codex.remove'
  },
  claude_desktop: {
    name: 'client.claude_desktop',
    steps: [{ text: 'client.claude_desktop.step1' }, { text: 'client.claude_desktop.step2' }, { text: 'client.claude_desktop.step3' }],
    remove: 'client.claude_desktop.remove',
    unverified: true
  },
  chatgpt: {
    name: 'client.chatgpt',
    steps: [{ text: 'client.chatgpt.step1' }, { text: 'client.chatgpt.step2' }, { text: 'client.chatgpt.step3' }],
    remove: 'client.chatgpt.remove',
    unverified: true
  }
};
export const CLIENT_ORDER: readonly ClientKey[] = ['claude_code', 'codex', 'claude_desktop', 'chatgpt'];

/** The guide for a registered client name (not verified: a hint for the removal text only). */
export function guideFor(name: string): ClientKey | null {
  const lower = name.toLowerCase();
  if (lower.includes('claude code')) return 'claude_code';
  if (lower.includes('codex')) return 'codex';
  if (lower.includes('chatgpt') || lower.includes('openai')) return 'chatgpt';
  if (lower.includes('claude')) return 'claude_desktop';
  return null;
}
