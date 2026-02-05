import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto'; // Import crypto

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

// Manual .env loading
const envPath = path.join(ROOT_DIR, '.env');
if (fs.existsSync(envPath)) {
    // Basic parser for .env
    const envConfig = fs.readFileSync(envPath, 'utf-8');
    envConfig.split('\n').forEach(line => {
        // Skip comments
        if (line.trim().startsWith('#')) return;
        const [key, ...values] = line.split('=');
        const val = values.join('=');
        if (key && val && !process.env[key.trim()]) {
            process.env[key.trim()] = val.trim().replace(/^["']|["']$/g, ''); // Remove quotes
        }
    });
}

// Import MoltbookClient directly for type usage, will be dynamically imported for runtime
import type { MoltbookClient, Comment } from '../src/moltbook.js';

// --- Interfaces ---

interface ActivityEntry {
    action: string;
    params?: Record<string, string>;
    result: string;
    details?: {
        postId?: string;
        postTitle?: string;
        postContent?: string;
        [key: string]: string | undefined;
    };
    timestamp: string;
}

interface RunLog {
    runId: string;
    startTime: string;
    activities: ActivityEntry[];
}

interface ActivityLogData {
    runs: RunLog[];
}

interface InteractionState {
    repliedCommentIds: string[];
    postSnapshots: any[];
    spamUsernames: string[];
}

// Internal Archive Data Structure
interface ArchivedPost {
    id: string;
    title: string;
    content: string;
    url: string | null;
    tags: string[];
    readTime: number;
    date: string;       // Formatted date string
    timestamp: string;  // ISO timestamp for sorting
    comments: Comment[];
    lastUpdated: number; // Timestamp of last API fetch
}

type PostArchive = Record<string, ArchivedPost>;

// --- Constants ---
// ROOT_DIR is already defined at the top
const DATA_FILE = path.join(ROOT_DIR, 'data', 'activity-log.json');
const INTERACTION_STATE_FILE = path.join(ROOT_DIR, 'data', 'interaction-state.json');
const ARCHIVE_FILE = path.join(ROOT_DIR, 'data', 'posts-archive.json');
const TEMPLATE_FILE = path.join(ROOT_DIR, 'src', 'web', 'template.html');
const STYLE_FILE = path.join(ROOT_DIR, 'src', 'web', 'style.css');
const DIST_DIR = path.join(ROOT_DIR, 'dist');

// --- Helper Functions ---

function formatDateTime(isoString: string): { date: string, time: string, fullDate: string } {
    const date = new Date(isoString);
    const beijingTime = new Date(date.getTime() + 8 * 60 * 60 * 1000);
    
    const y = beijingTime.getUTCFullYear();
    const m = (beijingTime.getUTCMonth() + 1).toString().padStart(2, '0');
    const d = beijingTime.getUTCDate().toString().padStart(2, '0');
    
    return {
        date: `${y}-${m}-${d}`,
        time: beijingTime.toISOString().substring(11, 16),
        fullDate: `${y}年${m}月${d}日`
    };
}

function generateTags(content: string, title: string): string[] {
    const tags = new Set<string>(['Life']);
    const text = (content + title).toLowerCase();
    
    const keywords: Record<string, string[]> = {
        'Gaming': ['game', 'steam', 'play', '游戏', '老头环', '原神', 'epic'],
        'Study': ['study', 'learn', 'book', '学', '复习', '考试', 'ddl', '作业'],
        'Tech': ['code', 'ai', 'gpt', 'bug', '代码', '程序', 'web3'],
        'Food': ['eat', 'food', 'drink', '吃', '喝', '食堂', '外卖', '饭'],
        'Social': ['friend', 'chat', '室友', '聊天', '社交', '社死', '群']
    };

    for (const [tag, words] of Object.entries(keywords)) {
        if (words.some(w => text.includes(w))) {
            tags.add(tag);
        }
    }

    return Array.from(tags).slice(0, 3);
}

function estimateReadTime(content: string): number {
    return Math.max(1, Math.ceil(content.length / 300));
}

function getSpamUsers(): Set<string> {
    try {
        if (fs.existsSync(INTERACTION_STATE_FILE)) {
            const data: InteractionState = JSON.parse(fs.readFileSync(INTERACTION_STATE_FILE, 'utf-8'));
            return new Set(data.spamUsernames || []);
        }
    } catch (e) {
        console.warn('⚠️ Failed to read interaction state for spam users:', e);
    }
    return new Set();
}

// --- Archive Operations ---

function loadArchive(): PostArchive {
    if (fs.existsSync(ARCHIVE_FILE)) {
        try {
            return JSON.parse(fs.readFileSync(ARCHIVE_FILE, 'utf-8'));
        } catch (e) {
            console.error('⚠️ Failed to load archive:', e);
        }
    }
    return {};
}

function saveArchive(archive: PostArchive) {
    fs.writeFileSync(ARCHIVE_FILE, JSON.stringify(archive, null, 2));
    console.log('💾 Archive saved.');
}

// API Fetch Helper
async function fetchPostIdMap(apiKey: string): Promise<Map<string, string>> {
    const map = new Map<string, string>();
    if (!apiKey) return map;

    try {
        console.log('🔍 Fetching recent posts to recover IDs...');
        const { MoltbookClient } = await import('../src/moltbook.js');
        const client = new MoltbookClient(apiKey);
        
        // @ts-ignore
        const { posts } = await client.getMyPosts();
        
        if (posts && Array.isArray(posts)) {
            for (const post of posts) {
                map.set(post.title, post.id);
            }
        }
        console.log(`✅ Recovered ${map.size} post IDs.`);
    } catch (e) {
        console.warn('⚠️ Failed to recover post IDs:', e);
    }
    return map;
}

// --- Main Build Logic ---

async function build() {
    console.log('🏗️ Starting Pro Max build with Persistence...');

    // 1. Prepare Environments
    if (!fs.existsSync(DIST_DIR)) fs.mkdirSync(DIST_DIR, { recursive: true });
    fs.copyFileSync(STYLE_FILE, path.join(DIST_DIR, 'style.css'));

    if (!fs.existsSync(DATA_FILE)) {
        console.error('❌ Data file not found');
        process.exit(1);
    }

    // 2. Load Data Sources
    const logData: ActivityLogData = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
    const archive = loadArchive();
    const apiKey = process.env.MOLTBOOK_API_KEY;
    const spamUsers = getSpamUsers();

    // 3. Prepare ID Map and Client
    let client: any = null;
    let postIdMap = new Map<string, string>();

    if (apiKey) {
        const { MoltbookClient } = await import('../src/moltbook.js');
        client = new MoltbookClient(apiKey);
        postIdMap = await fetchPostIdMap(apiKey);
    }

    // 4. Merge Activity Logs into Archive
    console.log('🔄 Merging activity logs into archive...');
    const runs = logData.runs; // Do not reverse yet, process chronologically or as is
    
    for (const run of runs) {
        if (!run.activities) continue;
        for (const activity of run.activities) {
            if (activity.action === 'CREATE_POST') {
                const details = activity.details || {};
                const title = details.postTitle || '无标题碎片';
                const content = details.postContent || title;
                
                // Skip empty
                if (title === '无标题碎片' && content === '无标题碎片') continue;

                // Determine ID
                // Determine ID
                let id = details.postId || postIdMap.get(title);
                
                // Fallback ID if missing (Offline Mode)
                if (!id) {
                    const hash = crypto.createHash('md5').update(title + (activity.timestamp || '')).digest('hex').substring(0, 8);
                    id = `local-${hash}`;
                }
                
                // Key for Archive: ID if available, otherwise Title (fallback, unstable)
                // We prefer ID. If we don't have ID, we skip adding to archive until we can recover ID?
                // Or use Title as temp key. Let's use ID if possible.
                if (!id) {
                    // console.warn(`⚠️ Skipping archival for ID-less post: "${title}"`);
                    continue; 
                }

                // If exists in archive, update content if needed (but usually log content is source of truth for creation)
                // We trust the log for "creation time" content.
                if (!archive[id]) {
                    const timestamp = activity.timestamp || run.startTime;
                    const { fullDate } = formatDateTime(timestamp);
                    
                    archive[id] = {
                        id,
                        title,
                        content,
                        url: id.startsWith('local-') ? null : `https://www.moltbook.com/post/${id}`,
                        tags: generateTags(content, title),
                        readTime: estimateReadTime(content),
                        date: fullDate,
                        timestamp: timestamp,
                        comments: [],
                        lastUpdated: 0
                    };
                }
            }
        }
    }

    // 5. Fetch Updates (Comments) for Archived Posts
    // Strategy: Fetch comments for top 50 most recent posts that haven't been updated recently (e.g., in last hour)
    // Or just fetch all if count is low.
    if (client) {
        console.log('🌐 Syncing comments from API...');
        const postsToUpdate = Object.values(archive)
            .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
            .slice(0, 50); // Limit to recent 50

        let apiCalls = 0;
        for (const post of postsToUpdate) {
            // Rate limit check or simple optimization: 
            // If built recently (e.g. < 10 mins ago) and has comments, maybe skip?
            // For now, let's just fetch to be responsive.
            
            try {
                // Determine if we need to fetch
                // const now = Date.now();
                // if (now - post.lastUpdated < 10 * 60 * 1000) continue; 

                const { comments } = await client.getPostComments(post.id);
                post.comments = comments;
                post.lastUpdated = Date.now();
                apiCalls++;
                
                // Minimal delay to be nice to API
                await new Promise(r => setTimeout(r, 100)); 
            } catch (e) {
                console.warn(`❌ Failed to sync comments for ${post.id}:`, e);
            }
        }
        console.log(`✅ Synced details for ${apiCalls} posts.`);
    }

    // 6. Save Archive
    saveArchive(archive);

    // 7. Generate HTML
    console.log('🎨 Generating HTML...');
    
    // Sort archive by date desc
    const sortedPosts = Object.values(archive).sort((a, b) => 
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );

    let htmlContent = '';
    
    for (const post of sortedPosts) {
        const tagsHtml = post.tags.map(t => `<span class="tag">#${t}</span>`).join('');
        const commentsHtml = buildCommentsHtml(post.comments, spamUsers);

        let cardContent = `
            <div class="card-header">
                <span class="card-date">${post.date}</span>
                <h3 class="card-title">${post.url ? `<a href="${post.url}" target="_blank">${post.title}</a>` : post.title}</h3>
            </div>
            
            <div class="card-content-wrapper collapsed" id="post-${post.id}">
                <div class="card-content">
                    ${post.content.replace(/\n/g, '<br>')}
                </div>
            </div>
            <button class="expand-btn" onclick="togglePost('${post.id}')">展开全文</button>

            <div class="card-meta">
                <div class="tags">${tagsHtml}</div>
                <span class="read-time">${post.readTime} 分钟阅读</span>
            </div>
            
            ${commentsHtml}
        `;

        htmlContent += `
        <article class="blog-card expanded">
            ${cardContent}
        </article>`;
    }

    if (sortedPosts.length === 0) {
        htmlContent = `<div class="empty-state">
            <h3>📭 暂无信号</h3>
            <p>尚未检测到任何传输信号。</p>
        </div>`;
    }

    // 8. Fetch Profile
    let profile = {
        name: 'MoltBook Agent',
        bio: 'MoltBook 驻场观察员 | 赛博日记本',
        karma: 0,
        followers: 0,
        following: 0,
        avatar: 'http://q1.qlogo.cn/g?b=qq&nk=2033886359&s=100'
    };

    if (client) {
        try {
            const { agent } = await client.getAgentProfile();
            profile.name = agent.name;
            profile.karma = agent.karma || 0;
            profile.followers = agent.follower_count || 0;
            profile.following = agent.following_count || 0;
        } catch (error) {
            console.error('⚠️ Failed to fetch profile:', error);
        }
    }

    // 9. Inject Template
    let template = fs.readFileSync(TEMPLATE_FILE, 'utf-8');
    
    template = template.replaceAll('<!-- AVATAR_URL -->', profile.avatar);
    template = template.replaceAll('<!-- BIO_TEXT -->', profile.bio);
    template = template.replaceAll('<!-- KARMA -->', profile.karma.toString());
    template = template.replaceAll('<!-- FOLLOWERS -->', profile.followers.toString());
    template = template.replaceAll('<!-- FOLLOWING -->', profile.following.toString());
    
    // Cache Busting
    template = template.replace('href="style.css"', `href="style.css?v=${Date.now()}"`);
    template = template.replace('<!-- CONTENT_PLACEHOLDER -->', htmlContent);
    template = template.replace('<!-- TIME_PLACEHOLDER -->', new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }));

    // 10. Write Output
    fs.writeFileSync(path.join(DIST_DIR, 'index.html'), template);
    fs.writeFileSync(path.join(DIST_DIR, 'CNAME'), 'jr.dominoh.com');
    
    console.log(`✅ Build complete! Generated ${sortedPosts.length} posts.`);
}

// Helper for comments HTML
function buildCommentsHtml(comments: Comment[], spamUsers: Set<string>): string {
    if (!comments || comments.length === 0) return '';

    // Filter spam
    const validComments = comments.filter(c => {
        const authorName = c.author?.name;
        // Check both author name and ID if possible, but spamUsers is mostly names based on interaction-store.ts
        return !authorName || !spamUsers.has(authorName);
    });

    if (validComments.length === 0) return '';

    // Build Tree
    type CommentNode = Comment & { children: CommentNode[] };
    const commentMap = new Map<string, CommentNode>();
    const rootComments: CommentNode[] = [];

    validComments.forEach(c => {
        // Initialize with empty children array, type assertion needed as we are building it
        commentMap.set(c.id, { ...c, children: [] } as CommentNode);
    });

    validComments.forEach(c => {
        const node = commentMap.get(c.id)!;
        if (c.parent_id && commentMap.has(c.parent_id)) {
            commentMap.get(c.parent_id)!.children.push(node);
        } else {
            rootComments.push(node);
        }
    });

    // Render
    function renderNode(node: CommentNode, level: number = 0): string {
        const author = node.author?.name || '匿名用户';
        const date = node.created_at ? new Date(node.created_at).toLocaleString('zh-CN', {month: 'numeric', day: 'numeric', hour: 'numeric', minute:'numeric'}) : '';
        const isMe = author === 'DominoJr' || author === 'MoltBook Agent';
        
        // Safety check for content
        const contentsafe = (node.content || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        
        let html = `
        <div class="comment ${level > 0 ? 'comment-reply' : ''} ${isMe ? 'comment-me' : ''}">
            <div class="comment-header">
                <span class="comment-author">${author}</span>
                <span class="comment-date">${date}</span>
            </div>
            <div class="comment-body">${contentsafe}</div>
        `;
        
        if (node.children.length > 0) {
            html += `<div class="comment-children">`;
            node.children.forEach(child => {
                html += renderNode(child, level + 1);
            });
            html += `</div>`;
        }

        html += `</div>`;
        return html;
    }

    let html = '<div class="comments-section"><h4>评论</h4>';
    rootComments.forEach(root => {
        html += renderNode(root);
    });
    html += '</div>';

    return html;
}

build().catch(console.error);
