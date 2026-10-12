import { describe, expect, it } from 'vitest';
import { CLIENT_GUIDES, CLIENT_ORDER, guideFor, mcpUrl } from './clientGuides';

describe('client guides', () => {
  it('builds the service address and the commands from the origin', () => {
    const url = mcpUrl('https://cosasimangia.qunidi.it');
    expect(url).toBe('https://cosasimangia.qunidi.it/mcp');
    expect(CLIENT_GUIDES.claude_code.steps[0]!.command?.(url)).toBe('claude mcp add --transport http --scope user cosasimangia https://cosasimangia.qunidi.it/mcp');
    expect(CLIENT_GUIDES.codex.steps.map((s) => s.command?.(url))).toEqual(['codex mcp add cosasimangia --url https://cosasimangia.qunidi.it/mcp', 'codex mcp login cosasimangia']);
    expect(CLIENT_ORDER).toEqual(['claude_code', 'codex', 'claude_desktop', 'chatgpt']);
  });

  it('marks the clients not yet tried with this service', () => {
    expect(CLIENT_ORDER.filter((key) => CLIENT_GUIDES[key].unverified)).toEqual(['claude_desktop', 'chatgpt']);
  });

  it('recognises a client from the name it registered with, or none', () => {
    expect(guideFor('Claude Code (cosasimangia)')).toBe('claude_code');
    expect(guideFor('Codex')).toBe('codex');
    expect(guideFor('ChatGPT')).toBe('chatgpt');
    expect(guideFor('Claude')).toBe('claude_desktop');
    expect(guideFor('')).toBeNull();
    expect(guideFor('My script')).toBeNull();
  });
});
