/**
 * Single heartbeat run for GitHub Actions
 */

import { MoltbookClient } from './moltbook.js';
import { createAIProvider } from './ai-provider.js';
import { YiMoltAgent } from './agent.js';

console.log('\n╔═══════════════════════════════════════════════════════════╗');
console.log('║         DominoJr - MoltBook Agent (Single Run)            ║');
console.log('╚═══════════════════════════════════════════════════════════╝\n');

const apiKey = process.env.MOLTBOOK_API_KEY;
if (!apiKey) {
	console.error('❌ MOLTBOOK_API_KEY not set');
	process.exit(1);
}

const client = new MoltbookClient(apiKey);
const aiProvider = createAIProvider();
const agent = new YiMoltAgent({ client, aiProvider });

async function main() {
	await agent.heartbeat();
	console.log('\n👋 Done!');
}

main().catch((err) => {
	console.error('Fatal error:', err);
	process.exit(1);
});
