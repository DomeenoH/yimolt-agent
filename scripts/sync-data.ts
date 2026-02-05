import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MoltbookClient } from '../src/moltbook.js';

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

const ARCHIVE_FILE = path.join(ROOT_DIR, 'data', 'posts-archive.json');

async function sync() {
    console.log('🔄 Starting Data Sync & Repair...');
    
    const apiKey = process.env.MOLTBOOK_API_KEY;
    if (!apiKey) {
        console.error('❌ No API Key found.');
        process.exit(1);
    }

    const client = new MoltbookClient(apiKey);

    // 1. Fetch Remote Posts
    console.log('🌐 Fetching my posts from API...');
    // @ts-ignore
    const { posts: remotePosts } = await client.getMyPosts(100); 
    console.log(`✅ Fetched ${remotePosts.length} remote posts.`);

    // 2. Load Local Archive
    let archive = {};
    if (fs.existsSync(ARCHIVE_FILE)) {
        archive = JSON.parse(fs.readFileSync(ARCHIVE_FILE, 'utf-8'));
    }
    const localPosts = Object.values(archive);
    console.log(`📂 Loaded ${localPosts.length} local archived posts.`);

    // 3. Match and Update
    let updatedCount = 0;
    const remoteMap = new Map();
    remotePosts.forEach((p: any) => remoteMap.set(p.title.trim(), p));

    // Rebuild archive object to replace keys if ID changes
    const newArchive = {};

    // Process existing local posts first
    for (const localPost of localPosts) {
        const title = (localPost as any).title.trim();
        const remotePost = remoteMap.get(title);

        if (remotePost) {
            // Match found! Upgrade local post
            console.log(`🔗 Linked: "${title}" -> ${remotePost.id}`);
            
            newArchive[remotePost.id] = {
                ...(localPost as any),
                id: remotePost.id, // Update ID
                content: remotePost.content || (localPost as any).content, // Prefer remote content
                url: remotePost.url || (localPost as any).url,
                lastUpdated: 0 // Force re-sync comments
            };
            updatedCount++;
            // Remove from map so we know what's left
            // remoteMap.delete(title); 
        } else {
            // No match, keep local (offline)
            console.log(`⚠️ No remote match for: "${title}" (keeping local)`);
            newArchive[(localPost as any).id] = localPost;
        }
    }

    // 4. Add completely new remote posts? 
    // Maybe later. For now focus on repairing existing.
    
    // 5. Fetch Comments for Real IDs
    console.log('💬 Syncing comments for real posts...');
    const postsToSync = Object.values(newArchive).filter((p: any) => !p.id.startsWith('local-'));
    
    for (const post of postsToSync) {
        try {
            process.stdout.write(`   Fetching comments for ${(post as any).id.substring(0,8)}... `);
            const { comments } = await client.getPostComments((post as any).id);
            (post as any).comments = comments;
            (post as any).lastUpdated = Date.now();
            console.log(`✅ ${comments.length} comments`);
            await new Promise(r => setTimeout(r, 200)); // Rate limit
        } catch (e) {
            console.log(`❌ Failed`);
        }
    }

    // 6. Save
    fs.writeFileSync(ARCHIVE_FILE, JSON.stringify(newArchive, null, 2));
    console.log(`💾 Sync complete. Updated ${updatedCount} posts.`);
}

sync().catch(console.error);
