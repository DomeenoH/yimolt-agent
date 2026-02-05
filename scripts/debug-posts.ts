import fs from 'node:fs';
import path from 'node:path';
import { MoltbookClient } from '../src/moltbook.js';

import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

// Load Env
const envPath = path.join(ROOT_DIR, '.env');
const envConfig = fs.readFileSync(envPath, 'utf-8');
envConfig.split('\n').forEach(line => {
    if (line.trim().startsWith('#')) return;
    const [key, ...values] = line.split('=');
    const val = values.join('=');
    if (key && val && !process.env[key.trim()]) {
        process.env[key.trim()] = val.trim().replace(/^["']|["']$/g, '');
    }
});

async function main() {
    const apiKey = process.env.MOLTBOOK_API_KEY;
    if (!apiKey) {
        console.error('No API Key');
        return;
    }

    console.log('--- Fetching My Posts from API ---');
    const client = new MoltbookClient(apiKey);
    
    // @ts-ignore
    const result = await client.getMyPosts();
    console.log('Result Type:', typeof result);
    
    const posts = result.posts || [];
    console.log(`API returned ${posts.length} posts.`);

    console.log('\n--- First 5 Posts ---');
    posts.slice(0, 5).forEach((p: any) => {
        console.log(`[${p.id}] "${p.title}" (Content Len: ${p.content?.length})`);
    });

    // Check consistency with Log
    const logPath = path.join(process.cwd(), 'data', 'activity-log.json');
    const logData = JSON.parse(fs.readFileSync(logPath, 'utf-8'));
    
    // Collect log titles
    const logTitles = new Set<string>();
    for (const run of logData.runs) {
        if (!run.activities) continue;
        for (const act of run.activities) {
            if (act.action === 'CREATE_POST' && act.details?.postTitle) {
                logTitles.add(act.details.postTitle);
            }
        }
    }

    console.log(`\n--- Matching (Log has ${logTitles.size} unique titles) ---`);
    let matchCount = 0;
    posts.forEach((p: any) => {
        if (logTitles.has(p.title)) {
            matchCount++;
        } else {
            console.log(`Unmatched API Post: "${p.title}"`);
            // Check for potential near matches?
        }
    });
    console.log(`Total Exact Matches: ${matchCount}`);
}

main().catch(console.error);
