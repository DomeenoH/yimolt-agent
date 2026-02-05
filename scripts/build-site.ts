import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Import MoltbookClient directly for type usage, will be dynamically imported for runtime
import type { MoltbookClient } from '../src/moltbook.js';

interface ActivityEntry {
    action: string;
    params?: Record<string, string>;
    result: string;
    details?: {
        postId?: string; // Add postId support
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

const ROOT_DIR = path.resolve(__dirname, '..');
const DATA_FILE = path.join(ROOT_DIR, 'data', 'activity-log.json');
const TEMPLATE_FILE = path.join(ROOT_DIR, 'src', 'web', 'template.html');
const STYLE_FILE = path.join(ROOT_DIR, 'src', 'web', 'style.css');
const DIST_DIR = path.join(ROOT_DIR, 'dist');

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

// 自动打标逻辑
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

// 估算阅读时间
function estimateReadTime(content: string): number {
    return Math.max(1, Math.ceil(content.length / 300));
}

// Map Title -> Post ID
async function fetchPostIdMap(apiKey: string): Promise<Map<string, string>> {
    const map = new Map<string, string>();
    if (!apiKey) return map;

    try {
        console.log('🔍 Fetching recent posts to recover IDs...');
        const { MoltbookClient } = await import('../src/moltbook.js');
        const client = new MoltbookClient(apiKey);
        
        // Fetch valid posts (limit 50 to cover recent history)
        // Note: client.getMyPosts() is not explicitly defined in the snippet I saw, 
        // but getAgentProfile calls endpoints. Let's use getAgentProfile -> recentPosts check.
        // Wait, looking at agent.ts, getMyPosts IS called. Let's assume it exists or use getAgentProfile.
        // Actually src/agent.ts calls this.client.getMyPosts().
        // Let's implement a safe fetch here using getAgentProfile first as I saw that returns recentPosts in src/moltbook.ts
        
        const { agent } = await client.getAgentProfile();
        // The type def in moltbook.ts for getAgentProfile return structure:
        // { agent: MoltyProfile; recentPosts?: Post[] }
        
        // We need to type cast or inspect the client usage carefully. 
        // Let's rely on `client.request` if needed, but agent.ts uses `getMyPosts`.
        // Let's look at agent.ts line 238: const { posts } = await this.client.getMyPosts();
        // So getMyPosts exists on the client class.
        
        // @ts-ignore - Dynamic import typing issues
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

function processPost(activity: ActivityEntry, timestamp: string, idMap: Map<string, string>) {
    const details = activity.details || {};
    const title = details.postTitle || '无标题碎片';
    const rawContent = details.postContent || title; // Fallback
    
    // Try to recover ID: Logged ID > Map ID > null
    const id = details.postId || idMap.get(title);
    const url = id ? `https://www.moltbook.com/post/${id}` : null;
    
    // 生成摘要 (移除换行，截取前 100 字)
    let excerpt = rawContent.replace(/\n/g, ' ').substring(0, 100);
    if (rawContent.length > 100) excerpt += '...';
    
    // Filter out empty/invalid posts
    if (title === '无标题碎片' && rawContent === '无标题碎片') {
        return null;
    }

    const tags = generateTags(rawContent, title);
    const readTime = estimateReadTime(rawContent);
    const { fullDate } = formatDateTime(timestamp);

    return {
        id,
        url,
        title,
        content: rawContent,
        excerpt,
        tags,
        readTime,
        date: fullDate
    };
}

async function build() {
    console.log('🏗️ Starting Pro Max build...');

    if (!fs.existsSync(DIST_DIR)) fs.mkdirSync(DIST_DIR, { recursive: true });
    fs.copyFileSync(STYLE_FILE, path.join(DIST_DIR, 'style.css'));

    if (!fs.existsSync(DATA_FILE)) {
        console.error('❌ Data file not found');
        process.exit(1);
    }

    const logData: ActivityLogData = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
    const runs = logData.runs.reverse();
    
    let htmlContent = '';
    let postCount = 0;

    const apiKey = process.env.MOLTBOOK_API_KEY;
    const postIdMap = await fetchPostIdMap(apiKey || '');

    for (const run of runs) {
        if (!run.activities) continue;
        for (const activity of run.activities) {
            if (activity.action === 'CREATE_POST') {
                const post = processPost(activity, activity.timestamp || run.startTime, postIdMap);
                if (!post) continue;
                
                const tagsHtml = post.tags.map(t => `<span class="tag">#${t}</span>`).join('');
                
                // Construct Card HTML
                // If URL exists, make the title key clickable or add a link icon
                // User requested: "点击帖子我希望能跳转moltbook相对应链接"
                
                let cardContent = `
                    <span class="card-date">${post.date}</span>
                    <h3 class="card-title">${post.title}</h3>
                    <p class="card-excerpt">${post.excerpt}</p>
                    <div class="card-meta">
                        <div class="tags">${tagsHtml}</div>
                        <span class="read-time">${post.readTime} 分钟阅读</span>
                    </div>
                `;

                if (post.url) {
                    // Wrap in anchor, but ensure tags (which might be links in future) don't break strict HTML
                    // Ideally whole card is clickable. 
                    htmlContent += `<a href="${post.url}" target="_blank" class="blog-card-link">
                        <article class="blog-card clickable">
                            ${cardContent}
                        </article>
                    </a>`;
                } else {
                    htmlContent += `
                    <article class="blog-card">
                        ${cardContent}
                    </article>`;
                }
                
                postCount++;
            }
        }
    }

    if (postCount === 0) {
        htmlContent = `<div class="empty-state">
            <h3>📭 暂无信号</h3>
            <p>尚未检测到任何传输信号。</p>
        </div>`;
    }

    // 4. 获取个人资料 (Profile)
    let profile = {
        name: 'MoltBook Agent',
        bio: 'MoltBook 驻场观察员 | 赛博日记本',
        karma: 0,
        followers: 0,
        following: 0,
        avatar: 'http://q1.qlogo.cn/g?b=qq&nk=2033886359&s=100'
    };

    if (apiKey) {
        try {
            console.log('🌐 Fetching profile from MoltBook...');
            // 动态导入 MoltbookClient
            const { MoltbookClient } = await import('../src/moltbook.js');
            const client = new MoltbookClient(apiKey);
            
            // 获取基本信息
            // 确保我们使用正确的 Profile 接口
            const { agent } = await client.getAgentProfile();
            console.log('👤 Profile fetched:', agent.name);
            
            profile.name = agent.name;
            profile.karma = agent.karma || 0;
            profile.followers = agent.follower_count || 0;
            profile.following = agent.following_count || 0;
            
            // 尝试获取 Bio
            // 这里我们不做复杂的 try-catch，因为 getAgentProfile 已经尽力获取了
            // 如果需要 bio，agent 对象里如果有就用，没有就保持默认
            // 注意：API 返回的 snake_case 还是 camelCase 需要确认
            // src/moltbook.ts: getAgentProfile returns { agent: { ... } }
            // 让我们再次确认 moltbook.ts
        } catch (error) {
            console.error('⚠️ Failed to fetch profile:', error);
        }
    } else {
        console.log('ℹ️ No MOLTBOOK_API_KEY provided, using default profile.');
    }

    // 5. 注入模板
    let template = fs.readFileSync(TEMPLATE_FILE, 'utf-8');
    
    // 注入 Profile 数据
    template = template.replaceAll('<!-- AVATAR_URL -->', profile.avatar);
    template = template.replaceAll('<!-- BIO_TEXT -->', profile.bio);
    template = template.replaceAll('<!-- KARMA -->', profile.karma.toString());
    template = template.replaceAll('<!-- FOLLOWERS -->', profile.followers.toString());
    template = template.replaceAll('<!-- FOLLOWING -->', profile.following.toString());

    // 注入内容
    // Cache Busting for CSS
    template = template.replace('href="style.css"', `href="style.css?v=${Date.now()}"`);
    
    template = template.replace('<!-- CONTENT_PLACEHOLDER -->', htmlContent);
    template = template.replace('<!-- TIME_PLACEHOLDER -->', new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }));

    // 6. 写入文件
    fs.writeFileSync(path.join(DIST_DIR, 'index.html'), template);
    
    // 7. 配置自定义域名 (CNAME)
    fs.writeFileSync(path.join(DIST_DIR, 'CNAME'), 'jr.dominoh.com');
    
    console.log(`✅ Build complete! Generated ${postCount} posts.`);
}

build().catch(console.error);
