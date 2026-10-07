import type { AgentClient } from '#lib/domain/types.ts';
import type { MessageKey } from '#lib/i18n/messages.ts';

/** Example address of the prototype: the real one is decided with the MCP technical design (spec section 13). */
export const MCP_URL = 'https://app-famiglia.example/mcp';
export const MCP_NAME = 'app-famiglia';

/** One step of a client guide: a sentence, optionally followed by a command to copy. */
export interface GuideStep {
	text: MessageKey;
	command?: string;
}

export interface ClientGuide {
	steps: GuideStep[];
	/** How to remove the service from the client too (shown when disconnecting). */
	remove: MessageKey;
	/** Checked with Context7 on 7 October 2026, otherwise flagged as unverified. */
	unverified?: MessageKey;
}

// Commands checked with Context7 (Claude Code docs, openai/codex sources) on 7 October 2026; Claude
// Desktop steps from the MCP docs on custom connectors; ChatGPT steps not verified.
export const CLIENT_GUIDES: Record<AgentClient, ClientGuide> = {
	claude_code: {
		steps: [
			{ text: 'client.claude_code.step1', command: `claude mcp add --transport http --scope user ${MCP_NAME} ${MCP_URL}` },
			{ text: 'client.claude_code.step2' }
		],
		remove: 'client.claude_code.remove'
	},
	codex: {
		steps: [
			{ text: 'client.codex.step1', command: `codex mcp add ${MCP_NAME} --url ${MCP_URL}` },
			{ text: 'client.codex.step2', command: `codex mcp login ${MCP_NAME}` }
		],
		remove: 'client.codex.remove'
	},
	chatgpt: {
		steps: [{ text: 'client.chatgpt.step1' }, { text: 'client.chatgpt.step2' }, { text: 'client.chatgpt.step3' }],
		remove: 'client.chatgpt.remove',
		unverified: 'client.chatgpt.unverified'
	},
	claude_desktop: {
		steps: [{ text: 'client.claude_desktop.step1' }, { text: 'client.claude_desktop.step2' }, { text: 'client.claude_desktop.step3' }],
		remove: 'client.claude_desktop.remove'
	}
};
