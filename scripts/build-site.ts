import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface ActivityEntry {
    action: string;
    params?: Record<string, string>;
    result: string;
    details?: {
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

function processPost(activity: ActivityEntry, timestamp: string) {
    const details = activity.details || {};
    const title = details.postTitle || '无标题碎片';
    const rawContent = details.postContent || title; // Fallback
    
    // 生成摘要 (移除换行，截取前 80 字)
    let excerpt = rawContent.replace(/\n/g, ' ').substring(0, 100);
    if (rawContent.length > 100) excerpt += '...';
    
    const tags = generateTags(rawContent, title);
    const readTime = estimateReadTime(rawContent);
    const { fullDate } = formatDateTime(timestamp);

    return {
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

    for (const run of runs) {
        if (!run.activities) continue;
        for (const activity of run.activities) {
            if (activity.action === 'CREATE_POST') {
                const post = processPost(activity, activity.timestamp || run.startTime);
                
                const tagsHtml = post.tags.map(t => `<span class="tag">#${t}</span>`).join('');
                
                htmlContent += `
                <article class="blog-card">
                    <span class="card-date">${post.date}</span>
                    <h3 class="card-title">${post.title}</h3>
                    <p class="card-excerpt">${post.excerpt}</p>
                    <div class="card-meta">
                        <div class="tags">${tagsHtml}</div>
                        <span class="read-time">${post.readTime} 分钟阅读</span>
                    </div>
                </article>`;
                
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
        name: 'DominoJr',
        bio: 'MoltBook 驻场观察员 | 赛博日记本',
        karma: 0,
        followers: 0,
        following: 0,
        avatar: 'http://q1.qlogo.cn/g?b=qq&nk=2033886359&s=100'
    };

    const apiKey = process.env.MOLTBOOK_API_KEY;
    if (apiKey) {
        try {
            console.log('🌐 Fetching profile from MoltBook...');
            // 动态导入 MoltbookClient
            const { MoltbookClient } = await import('../src/moltbook.js');
            const client = new MoltbookClient(apiKey);
            
            // 获取基本信息
            const { agent } = await client.getAgentProfile();
            
            profile.name = agent.name;
            profile.karma = agent.karma;
            profile.followers = agent.follower_count;
            profile.following = agent.following_count;
            
            // 尝试获取 Bio (如果 getAgentProfile 返回了 bio 字段)
            // 注意: src/moltbook.ts 中的 getAgentProfile 实现可能只返回部分字段
            // 这里我们假设它可能将来会返回 bio，或者我们需要单独调用 getMoltyProfile
            try {
               const fullProfile = await client.getMoltyProfile(agent.name);
               if (fullProfile?.profile?.bio) {
                   profile.bio = fullProfile.profile.bio;
               }
            } catch (e) {
                console.log('⚠️ Could not fetch details bio, utilizing default.');
            }

        } catch (error) {
            console.error('⚠️ Failed to fetch profile:', error);
        }
    } else {
        console.log('ℹ️ No MOLTBOOK_API_KEY provided, using default profile.');
    }

    // 5. 注入模板
    let template = fs.readFileSync(TEMPLATE_FILE, 'utf-8');
    
    // 注入 Profile 数据
    template = template.replace('<!-- AVATAR_URL -->', profile.avatar);
    template = template.replace('<!-- BIO_TEXT -->', profile.bio);
    template = template.replace('<!-- KARMA -->', profile.karma.toString());
    template = template.replace('<!-- FOLLOWERS -->', profile.followers.toString());
    template = template.replace('<!-- FOLLOWING -->', profile.following.toString());

    // 注入内容
    template = template.replace('<!-- CONTENT_PLACEHOLDER -->', htmlContent);
    template = template.replace('<!-- TIME_PLACEHOLDER -->', new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }));

    // 6. 写入文件
    fs.writeFileSync(path.join(DIST_DIR, 'index.html'), template);
    console.log(`✅ Build complete! Generated ${postCount} posts.`);
}

build().catch(console.error);
