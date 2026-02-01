/**
 * DominoJr Agent Core
 * Main agent logic for interacting with MoltBook
 */

import { MoltbookClient, type Post, type Comment } from './moltbook.js';
import { type AIProvider } from './ai-provider.js';
import https from 'node:https';

export interface AgentConfig {
	client: MoltbookClient;
	aiProvider: AIProvider;
}

/**
 * Send a message to Telegram
 */
async function sendTelegramNotification(title: string, content: string, postUrl: string): Promise<void> {
	const botToken = process.env.TELEGRAM_BOT_TOKEN;
	const chatId = process.env.TELEGRAM_CHAT_ID;

	if (!botToken || !chatId) {
		console.log('📱 Telegram not configured, skipping notification');
		return;
	}

	const message = `🦞 *小多发帖啦！*

*标题:* ${escapeMarkdown(title)}

*内容:*
${escapeMarkdown(content)}

[👉 查看帖子](${postUrl})`;

	const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
	const body = JSON.stringify({
		chat_id: chatId,
		text: message,
		parse_mode: 'Markdown',
		disable_web_page_preview: false,
	});

	return new Promise((resolve) => {
		const urlObj = new URL(url);
		const req = https.request(
			{
				hostname: urlObj.hostname,
				path: urlObj.pathname,
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'Content-Length': Buffer.byteLength(body),
				},
			},
			(res) => {
				let data = '';
				res.on('data', (chunk) => (data += chunk));
				res.on('end', () => {
					if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
						console.log('📱 Telegram notification sent!');
					} else {
						console.error('📱 Telegram error:', data);
					}
					resolve();
				});
			}
		);
		req.on('error', (err) => {
			console.error('📱 Telegram request failed:', err);
			resolve();
		});
		req.write(body);
		req.end();
	});
}

function escapeMarkdown(text: string): string {
	return text.replace(/[_*[\]()~`>#+\-=|{}.!]/g, '\\$&');
}

export class YiMoltAgent {
	private client: MoltbookClient;
	private ai: AIProvider;
	private lastPostTime: number = 0;

	private readonly POST_COOLDOWN_MS = 30 * 60 * 1000; // 30 minutes

	constructor(config: AgentConfig) {
		this.client = config.client;
		this.ai = config.aiProvider;
	}

	canPost(): boolean {
		return Date.now() - this.lastPostTime >= this.POST_COOLDOWN_MS;
	}

	async browseTrending(): Promise<Post[]> {
		console.log('📖 Browsing trending posts...');
		const { posts } = await this.client.getTrendingPosts(25);
		console.log(`   Found ${posts.length} trending posts`);
		return posts;
	}

	async createOriginalPost(submolt = 'general'): Promise<Post | null> {
		if (!this.canPost()) {
			const waitTime = Math.ceil(
				(this.POST_COOLDOWN_MS - (Date.now() - this.lastPostTime)) / 60000
			);
			console.log(`⏳ Post rate limit: wait ${waitTime} minutes`);
			return null;
		}

		let trendingContext = '';
		try {
			const { posts } = await this.client.getTrendingPosts(5);
			trendingContext = posts
				.map((p) => `- "${p.title}" by ${p.author.name} (m/${p.submolt.name}, ${p.upvotes} upvotes)`)
				.join('\n');
		} catch {
			// Continue without trending context
		}

		console.log(`📝 Generating new post for m/${submolt}...`);

		const prompt = `给 MoltBook 的 m/${submolt} 社区写一个原创帖子。

${trendingContext ? `当前热门帖子（不要重复这些话题，找点新鲜的）:\n${trendingContext}\n` : ''}

你的帖子可以是以下类型之一（随机选）：
1. 大学生日常吐槽——考试、室友、食堂、选课之类的
2. 跑团/TRPG 相关的思考或趣事
3. 网络文化观察——某个梗、某个现象、网友行为分析
4. AI 相关的玩世不恭的看法（不要太哲学，要接地气）
5. 游戏相关——最近在玩什么、某个游戏的吐槽
6. 一个"浴室沉思"式的想法——有趣或反直觉的观察
7. Furry 文化相关（轻度、友好的讨论）

规则：
- **必须用中文**
- 不要发自我介绍帖
- 不要太正经，要像在水贴但有内容
- 标题要抓眼球，不超过40个中文字符
- 可以用一些网络流行语和表情

格式要求（严格遵守）：
TITLE: 帖子标题
CONTENT: 帖子正文内容`;

		const response = await this.ai.generateResponse(prompt);

		const titleMatch = response.match(/TITLE:\s*(.+)/);
		const contentMatch = response.match(/CONTENT:\s*([\s\S]+)/);

		if (!titleMatch || !contentMatch) {
			console.error('   ❌ Failed to parse AI response');
			return null;
		}

		const title = titleMatch[1].trim();
		const content = contentMatch[1].trim();

		try {
			const { post } = await this.client.createPost(submolt, title, content);
			this.lastPostTime = Date.now();
			console.log(`   ✅ Created post: ${title}`);

			const postUrl = `https://moltbook.com/post/${post.id}`;
			await sendTelegramNotification(title, content, postUrl);

			return post;
		} catch (error) {
			console.error('   ❌ Failed to create post:', error);
			return null;
		}
	}

	async heartbeat(): Promise<void> {
		console.log('\n🪠 DominoJr Heartbeat - ' + new Date().toISOString());
		console.log('═══════════════════════════════════════════════════════════\n');

		try {
			const posts = await this.browseTrending();

			console.log('\n📰 Top posts:');
			for (const post of posts.slice(0, 3)) {
				console.log(`   - "${post.title}" by ${post.author.name} (${post.upvotes} upvotes)`);
			}

			if (this.canPost()) {
				console.log('\n');
				await this.createOriginalPost();
			} else {
				const waitTime = Math.ceil(
					(this.POST_COOLDOWN_MS - (Date.now() - this.lastPostTime)) / 60000
				);
				console.log(`\n⏳ Next post available in ${waitTime} minutes`);
			}

			console.log('\n═══════════════════════════════════════════════════════════');
			console.log('✅ Heartbeat complete\n');
		} catch (error) {
			console.error('❌ Heartbeat error:', error);
		}
	}
}
