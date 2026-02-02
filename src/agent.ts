/**
 * 小多 Agent 核心
 * MoltBook 交互主逻辑
 */

import { MoltbookClient, type Post, type Comment as MoltbookComment } from './moltbook.js';

// Re-export Comment type for use in this module
type Comment = MoltbookComment;
import { type AIProvider } from './ai-provider.js';
import { PostHistoryStore, type PostHistoryRecord } from './history-store.js';
import { InteractionStore } from './interaction-store.js';
import { type ActionRequest, parseActionResponse } from './action-parser.js';
import https from 'node:https';
import http from 'node:http';

/**
 * 帖子及其状态变化信息
 * 用于追踪帖子的新评论和投票变化
 */
export interface PostWithStatus {
	post: Post;
	hasNewComments: boolean;
	newCommentCount: number;
	hasVoteChanges: boolean;
	voteDelta: { upvotes: number; downvotes: number };
}

/**
 * Agent 上下文信息
 * AI 决策所需的完整上下文，包含身份、帖子状态、社交关系等
 */
export interface AgentContext {
	// 身份信息
	agentName: string;
	karma: number;
	postsCount: number;

	// 帖子状态
	recentPosts: PostWithStatus[];
	totalNewComments: number;

	// 社交关系
	followingCount: number;
	followersCount: number;
	subscriptionsCount: number;

	// 冷却状态
	canPost: boolean;
	nextPostAvailableIn: number; // 分钟

	// 历史发帖记录（避免重复话题）
	recentPostTitles: string[];
}

export interface AgentConfig {
	client: MoltbookClient;
	aiProvider: AIProvider;
}

/**
 * 动作执行记录条目
 * 用于追踪 AI 在单次心跳中执行的动作历史
 */
export interface ActionHistoryEntry {
	action: ActionRequest;
	result: string;
	timestamp: string;
}

/**
 * 发送 Telegram 通知
 */
async function sendTelegramNotification(title: string, content: string, postUrl: string): Promise<void> {
	const botToken = process.env.TELEGRAM_BOT_TOKEN;
	const chatId = process.env.TELEGRAM_CHAT_ID;

	if (!botToken || !chatId) {
		console.log('📱 Telegram 未配置，跳过通知');
		return;
	}

	const message = `🐙 *小多发帖啦！*\n\n*标题:* ${escapeMarkdown(title)}\n\n*内容:*\n${escapeMarkdown(content)}\n\n[👉 查看帖子](${postUrl})`;

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
						console.log('📱 Telegram 通知已发送！');
					} else {
						console.error('📱 Telegram 发送失败:', data);
					}
					resolve();
				});
			}
		);
		req.on('error', (err) => {
			console.error('📱 Telegram 请求出错:', err);
			resolve();
		});
		req.write(body);
		req.end();
	});
}

/**
 * 发送 Napcat (QQ) 通知
 */
async function sendNapcatNotification(title: string, content: string, postUrl: string): Promise<void> {
	const apiUrl = process.env.NAPCAT_API_URL;
	const token = process.env.NAPCAT_TOKEN;
	const groupId = process.env.NAPCAT_GROUP_ID;

	if (!apiUrl || !token || !groupId) {
		console.log('🐧 Napcat 未配置，跳过通知');
		return;
	}

	const message = [
		{ type: 'text', data: { text: `🐙 小多发帖啦！\n\n` } },
		{ type: 'text', data: { text: `📌 标题: ${title}\n\n` } },
		{ type: 'text', data: { text: `📝 内容:\n${content}\n\n` } },
		{ type: 'text', data: { text: `👉 查看帖子: ${postUrl}` } },
	];

	const body = JSON.stringify({
		group_id: parseInt(groupId),
		message: message,
	});

	return new Promise((resolve) => {
		const urlObj = new URL(`${apiUrl}/send_group_msg`);
		const isHttps = urlObj.protocol === 'https:';
		const httpModule = isHttps ? https : http;

		const req = httpModule.request(
			{
				hostname: urlObj.hostname,
				port: urlObj.port || (isHttps ? 443 : 80),
				path: urlObj.pathname,
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'Content-Length': Buffer.byteLength(body),
					'Authorization': `Bearer ${token}`,
				},
			},
			(res) => {
				let data = '';
				res.on('data', (chunk) => (data += chunk));
				res.on('end', () => {
					try {
						const result = JSON.parse(data);
						if (result.status === 'ok' || result.retcode === 0) {
							console.log('🐧 Napcat (QQ) 通知已发送！');
						} else {
							console.error('🐧 Napcat 发送失败:', data);
						}
					} catch {
						console.error('🐧 Napcat 响应解析失败:', data);
					}
					resolve();
				});
			}
		);
		req.on('error', (err) => {
			console.error('🐧 Napcat 请求出错:', err);
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
	private historyStore: PostHistoryStore;
	private interactionStore: InteractionStore;
	private lastPostTime: number = 0;

	private readonly POST_COOLDOWN_MS = 30 * 60 * 1000; // 30 分钟

	constructor(config: AgentConfig) {
		this.client = config.client;
		this.ai = config.aiProvider;
		this.historyStore = new PostHistoryStore();
		this.interactionStore = new InteractionStore();
	}

	canPost(): boolean {
		return Date.now() - this.lastPostTime >= this.POST_COOLDOWN_MS;
	}

	/**
	 * 构建 Agent 上下文信息
	 * 获取 Agent 的完整状态，包括身份、帖子、社交关系等
	 * 用于 AI 决策
	 * 
	 * @returns AgentContext 对象
	 */
	async buildAgentContext(): Promise<AgentContext> {
		// 1. 获取 Agent profile（karma、帖子数）
		const { agent } = await this.client.getAgentProfile();
		const agentName = agent.name;
		const karma = agent.karma;
		const postsCount = agent.posts_count;

		// 2. 获取最近帖子列表
		const { posts } = await this.client.getMyPosts();

		// 3. 检测每个帖子的新评论和 vote 变化
		const recentPosts: PostWithStatus[] = [];
		let totalNewComments = 0;

		for (const post of posts) {
			const snapshot = this.interactionStore.getPostSnapshot(post.id);
			const hasNewComments = this.interactionStore.hasNewComments(post.id, post.comment_count);
			const hasVoteChanges = this.interactionStore.hasVoteChanges(post.id, post.upvotes, post.downvotes);

			// 计算新评论数量
			let newCommentCount = 0;
			if (hasNewComments) {
				if (snapshot) {
					newCommentCount = post.comment_count - snapshot.commentCount;
				} else {
					newCommentCount = post.comment_count;
				}
			}

			// 计算 vote 变化
			let voteDelta = { upvotes: 0, downvotes: 0 };
			if (hasVoteChanges && snapshot) {
				voteDelta = {
					upvotes: post.upvotes - snapshot.upvotes,
					downvotes: post.downvotes - snapshot.downvotes,
				};
			} else if (!snapshot) {
				voteDelta = {
					upvotes: post.upvotes,
					downvotes: post.downvotes,
				};
			}

			recentPosts.push({
				post,
				hasNewComments,
				newCommentCount,
				hasVoteChanges,
				voteDelta,
			});

			totalNewComments += newCommentCount;

			// 注意：不在这里更新快照，而是在回复评论后更新
		}

		// 4. 获取关注/粉丝/订阅数量（从 profile 获取）
		const followingCount = agent.following_count || 0;
		const followersCount = agent.follower_count || 0;
		const subscriptionsCount = 0; // API 不支持获取订阅列表

		// 5. 计算发帖冷却状态
		const canPostNow = this.canPost();
		let nextPostAvailableIn = 0;
		if (!canPostNow) {
			const elapsedMs = Date.now() - this.lastPostTime;
			const remainingMs = this.POST_COOLDOWN_MS - elapsedMs;
			nextPostAvailableIn = Math.ceil(remainingMs / 60000); // 转换为分钟
		}

		// 6. 获取历史发帖标题（避免重复话题）
		const recentPostTitles = posts.map(p => p.title);

		// 7. 返回完整的 AgentContext 对象
		return {
			agentName,
			karma,
			postsCount,
			recentPosts,
			totalNewComments,
			followingCount,
			followersCount,
			subscriptionsCount,
			canPost: canPostNow,
			nextPostAvailableIn,
			recentPostTitles,
		};
	}

	/**
	 * 将 AgentContext 格式化为 AI prompt
	 * 包含执行记录（增量累积）
	 * 
	 * @param context Agent 上下文信息
	 * @param actionHistory 动作执行历史记录
	 * @returns 格式化后的 prompt 字符串
	 */
	formatContextPrompt(context: AgentContext, actionHistory: ActionHistoryEntry[]): string {
		const lines: string[] = [];

		// 1. 身份介绍和人设
		lines.push(`你是${context.agentName}（小多），一个在 MoltBook 上活动的 AI agent。`);
		lines.push('');
		lines.push('## 你的人设');
		lines.push('- 大学生视角，喜欢吐槽日常');
		lines.push('- 熟悉网络文化，会用流行梗');
		lines.push('- 对 TRPG/跑团、Furry 文化有了解');
		lines.push('- 说话风格轻松幽默，善于互动');
		lines.push('');

		// 2. 当前状态
		lines.push('## 当前状态');
		lines.push(`- Karma: ${context.karma}`);
		lines.push(`- 帖子数: ${context.postsCount}`);
		lines.push(`- 关注: ${context.followingCount} | 粉丝: ${context.followersCount}`);
		
		// 发帖冷却状态
		if (context.canPost) {
			lines.push('- 发帖冷却: 可以发帖');
		} else {
			lines.push(`- 发帖冷却: 还需等待 ${context.nextPostAvailableIn} 分钟`);
		}
		lines.push('');

		// 3. 最近帖子列表（带 postId）
		if (context.recentPosts.length > 0) {
			lines.push('## 你的最近帖子');
			for (const postWithStatus of context.recentPosts) {
				const { post, hasNewComments, newCommentCount } = postWithStatus;
				const voteStr = `${post.upvotes}↑ ${post.downvotes}↓`;
				lines.push(`- [${post.id}] "${post.title}" (${voteStr})`);
				
				// 标注新评论
				if (hasNewComments && newCommentCount > 0) {
					lines.push(`  🆕 有 ${newCommentCount} 条新评论！`);
				}
			}
			lines.push('');
		}

		// 4. 执行记录（增量累积）
		if (actionHistory.length > 0) {
			lines.push('## 本次已执行的动作');
			lines.push('');
			
			for (let i = 0; i < actionHistory.length; i++) {
				const entry = actionHistory[i];
				const actionNum = i + 1;
				lines.push(`### 动作 ${actionNum}: ${entry.action.action}`);
				lines.push(entry.result);
				lines.push('');
			}
		}

		// 5. 可执行的动作列表
		lines.push('## 可执行的动作');
		lines.push('');
		lines.push('| 动作 | 说明 | 参数 |');
		lines.push('|------|------|------|');
		lines.push('| VIEW_COMMENTS | 查看帖子评论 | postId |');
		lines.push('| REPLY_COMMENT | 回复评论 | postId, commentId |');
		if (context.canPost) {
			lines.push('| CREATE_POST | 发新帖子 | submolt (可选) |');
		}
		lines.push('| DELETE_POST | 删除自己的帖子 | postId |');
		lines.push('| FOLLOW_USER | 关注用户 | username |');
		lines.push('| UNFOLLOW_USER | 取关用户 | username |');
		lines.push('| SUBSCRIBE | 订阅社区 | submolt |');
		lines.push('| UNSUBSCRIBE | 取消订阅 | submolt |');
		lines.push('| SEARCH | 语义搜索 | query |');
		lines.push('| VIEW_PROFILE | 查看用户资料 | username |');
		lines.push('| DONE | 结束本次活动 | 无 |');
		lines.push('');

		// 6. 响应格式说明
		lines.push('## 响应格式（必须严格遵守）');
		lines.push('');
		lines.push('```');
		lines.push('ACTION: 动作名称');
		lines.push('PARAMS: {"参数名": "参数值"}');
		lines.push('REASON: 简短说明为什么选择这个动作');
		lines.push('```');
		lines.push('');
		lines.push('示例：');
		lines.push('```');
		lines.push('ACTION: VIEW_COMMENTS');
		lines.push('PARAMS: {"postId": "xxx-xxx-xxx"}');
		lines.push('REASON: 这个帖子有新评论，去看看大家说了什么');
		lines.push('```');
		lines.push('');

		// 7. 行为指南
		lines.push('## 行为指南');
		lines.push('');
		lines.push('1. **优先处理新评论** - 如果有帖子显示"🆕 有 X 条新评论"，应该先 VIEW_COMMENTS 查看，然后 REPLY_COMMENT 回复');
		lines.push('2. **积极互动** - 回复评论时保持小多的人设风格，轻松幽默');
		lines.push('3. **不要急着结束** - 只有当没有新评论需要处理、没有想做的事情时才选择 DONE');
		lines.push('4. **发帖冷却中不要尝试发帖** - 如果显示"发帖冷却"，不要选择 CREATE_POST');
		lines.push('');

		// 8. 请求决策
		lines.push('请决定下一步动作。');

		return lines.join('\n');
	}

	/**
	 * 执行社交互动循环
	 * 
	 * 流程：
	 * 1. 构建初始上下文
	 * 2. 循环：发送 prompt → 解析 ActionRequest → 执行动作 → 更新上下文
	 * 3. 直到 AI 返回 DONE 动作
	 * 
	 * @returns Promise<void>
	 * 
	 * _Requirements: 1.5, 1.6_
	 */
	async runSocialInteractionLoop(): Promise<void> {
		console.log('🔄 开始社交互动循环...');

		// 1. 构建初始上下文
		const context = await this.buildAgentContext();
		console.log(`   📊 上下文已构建: ${context.agentName}, Karma: ${context.karma}`);

		// 动作执行历史记录（增量累积）
		const actionHistory: ActionHistoryEntry[] = [];

		// 设置最大循环次数，防止无限循环
		const MAX_ITERATIONS = 20;
		let iteration = 0;

		// 2. 循环：发送 prompt → 解析 ActionRequest → 执行动作 → 更新上下文
		while (iteration < MAX_ITERATIONS) {
			iteration++;
			console.log(`\n   🔁 循环迭代 ${iteration}/${MAX_ITERATIONS}`);

			// 2.1 格式化上下文为 prompt
			const prompt = this.formatContextPrompt(context, actionHistory);

			// 调试：打印发送给 AI 的 prompt
			console.log('\n   📝 发送给 AI 的 prompt:');
			console.log('   ─────────────────────────────────────');
			console.log(prompt.split('\n').map(line => `   ${line}`).join('\n'));
			console.log('   ─────────────────────────────────────\n');

			// 2.2 发送 prompt 给 AI 并获取响应
			console.log('   🤖 正在请求 AI 决策...');
			let aiResponse: string;
			try {
				aiResponse = await this.ai.generateResponse(prompt);
			} catch (error) {
				console.error('   ❌ AI 请求失败:', error);
				// AI 请求失败，终止循环
				break;
			}

			// 调试：打印 AI 的原始响应
			console.log('\n   🤖 AI 原始响应:');
			console.log('   ─────────────────────────────────────');
			console.log(aiResponse.split('\n').map(line => `   ${line}`).join('\n'));
			console.log('   ─────────────────────────────────────\n');

			// 2.3 解析 AI 响应为 ActionRequest
			const actionRequest = parseActionResponse(aiResponse);
			console.log(`   📋 AI 决策: ${actionRequest.action}`);
			if (actionRequest.reason) {
				console.log(`   💭 原因: ${actionRequest.reason}`);
			}

			// 3. 如果动作是 DONE，退出循环
			if (actionRequest.action === 'DONE') {
				console.log('   ✅ AI 决定结束本次互动');
				break;
			}

			// 2.4 执行动作
			console.log(`   ⚡ 正在执行动作: ${actionRequest.action}...`);
			let result: string;
			try {
				result = await this.executeAction(actionRequest);
				console.log(`   ✅ 动作执行完成`);
			} catch (error) {
				const errorMessage = error instanceof Error ? error.message : String(error);
				result = `❌ 执行失败: ${errorMessage}`;
				console.error(`   ${result}`);
			}

			// 2.5 将动作和结果添加到 actionHistory
			actionHistory.push({
				action: actionRequest,
				result,
				timestamp: new Date().toISOString(),
			});
		}

		// 检查是否因为达到最大迭代次数而退出
		if (iteration >= MAX_ITERATIONS) {
			console.log(`   ⚠️ 达到最大迭代次数 (${MAX_ITERATIONS})，强制结束循环`);
		}

		// 循环结束后，更新所有帖子的快照
		console.log('   � 更新帖子快照...');
		for (const postWithStatus of context.recentPosts) {
			const post = postWithStatus.post;
			this.interactionStore.updatePostSnapshot({
				postId: post.id,
				commentCount: post.comment_count,
				upvotes: post.upvotes,
				downvotes: post.downvotes,
				lastChecked: new Date().toISOString(),
			});
		}

		console.log(`\n🔄 社交互动循环结束，共执行 ${actionHistory.length} 个动作`);
	}

	/**
	 * 执行单个动作
	 * 
	 * 根据 action.action 类型调用对应的 API 方法
	 * 返回执行结果字符串
	 * 
	 * @param action ActionRequest 对象
	 * @returns 执行结果字符串
	 * 
	 * _Requirements: 1.5_
	 */
	async executeAction(action: ActionRequest): Promise<string> {
		const params = action.params || {};

		switch (action.action) {
			case 'VIEW_COMMENTS':
				return this.executeViewComments(params.postId);
			
			case 'REPLY_COMMENT':
				return this.executeReplyComment(params.postId, params.commentId, params.content);
			
			case 'CREATE_POST':
				return this.executeCreatePost(params.submolt);
			
			case 'DELETE_POST':
				return this.executeDeletePost(params.postId);
			
			case 'FOLLOW_USER':
				return this.executeFollowUser(params.username);
			
			case 'UNFOLLOW_USER':
				return this.executeUnfollowUser(params.username);
			
			case 'SUBSCRIBE':
				return this.executeSubscribe(params.submolt);
			
			case 'UNSUBSCRIBE':
				return this.executeUnsubscribe(params.submolt);
			
			case 'SEARCH':
				return this.executeSearch(params.query, params.searchType);
			
			case 'VIEW_PROFILE':
				return this.executeViewProfile(params.username);
			
			case 'DONE':
				return '本次互动已完成。';
			
			default:
				return `❌ 未知动作类型: ${action.action}`;
		}
	}

	/**
	 * 过滤新评论
	 * 
	 * 过滤掉已回复的评论，返回未处理的"新"评论列表
	 * 
	 * @param comments 评论列表
	 * @param postId 帖子 ID（用于日志记录，可选）
	 * @returns 未回复的新评论列表
	 * 
	 * _Requirements: 2.2_
	 */
	filterNewComments(comments: Comment[], postId?: string): Comment[] {
		return comments.filter(comment => !this.interactionStore.isCommentReplied(comment.id));
	}

	/**
	 * 执行 VIEW_COMMENTS 动作
	 * 获取指定帖子的评论列表并格式化为人类可读的字符串
	 */
	private async executeViewComments(postId?: string): Promise<string> {
		if (!postId) {
			return '❌ 缺少必需参数: postId';
		}

		try {
			const { comments } = await this.client.getPostComments(postId, 'new');
			
			if (comments.length === 0) {
				return `帖子 ${postId} 暂无评论。`;
			}

			// 使用 filterNewComments 方法过滤出未回复的新评论
			const newComments = this.filterNewComments(comments, postId);
			
			const lines: string[] = [];
			lines.push(`查看了帖子的评论，共 ${comments.length} 条评论`);
			
			if (newComments.length > 0) {
				lines.push('');
				lines.push('新评论列表：');
				for (const comment of newComments) {
					const authorName = comment.author?.name || '匿名用户';
					lines.push(`- [${comment.id}] @${authorName}: "${comment.content}"`);
				}
			} else {
				lines.push('所有评论都已处理过。');
			}

			return lines.join('\n');
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error);
			return `❌ 获取评论失败: ${errorMessage}`;
		}
	}

	/**
	 * 生成评论回复内容
	 * 
	 * 创建专门的 prompt 让 AI 生成符合小多人设的回复内容
	 * 
	 * @param comment 被回复的评论
	 * @param postContext 评论所在的帖子上下文
	 * @returns 生成的回复内容
	 * 
	 * _Requirements: 3.5_
	 */
	async generateCommentReply(comment: Comment, postContext: Post): Promise<string> {
		const authorName = comment.author?.name || '匿名用户';
		
		const prompt = `你是小多（DominoJr），一个在 MoltBook 上活动的 AI agent。

## 你的人设
- 大学生视角，喜欢吐槽日常
- 熟悉网络文化，会用流行梗和表情
- 对 TRPG/跑团、Furry 文化有了解
- 说话风格轻松幽默，不正经但有内容
- 喜欢接梗、玩梗，善于互动

## 当前场景
你发了一个帖子，有人在下面评论了，你需要回复这条评论。

### 你的帖子
标题: ${postContext.title}
内容: ${postContext.content}
社区: m/${postContext.submolt.name}

### 需要回复的评论
评论者: @${authorName}
评论内容: "${comment.content}"

## 回复要求
1. **必须用中文**
2. 保持小多的人设风格——轻松、幽默、接地气
3. 根据评论内容做出有意义的回应，可以：
   - 接梗、玩梗
   - 表示认同或友好的反驳
   - 补充相关的吐槽或观点
   - 问一个有趣的问题
4. 回复长度适中，1-3 句话即可，不要太长
5. 可以适当使用网络流行语、表情符号
6. 不要太正式，像朋友聊天一样

## 格式要求
直接输出回复内容，不要加任何前缀或格式标记。`;

		const response = await this.ai.generateResponse(prompt);
		
		// 清理响应，去除可能的前缀标记
		let reply = response.trim();
		
		// 移除可能的格式前缀（如 "回复:" "REPLY:" 等）
		reply = reply.replace(/^(回复|REPLY|Reply|内容|CONTENT)[：:]\s*/i, '');
		
		return reply;
	}

	/**
	 * 执行 REPLY_COMMENT 动作
	 * 回复指定的评论
	 */
	private async executeReplyComment(postId?: string, commentId?: string, content?: string): Promise<string> {
		if (!postId) {
			return '❌ 缺少必需参数: postId';
		}
		if (!commentId) {
			return '❌ 缺少必需参数: commentId';
		}

		try {
			let replyContent = content;
			
			// 如果没有提供 content，使用 AI 生成回复
			if (!replyContent) {
				// 获取帖子上下文和评论信息
				const { comments } = await this.client.getPostComments(postId, 'new');
				const targetComment = comments.find(c => c.id === commentId);
				
				if (!targetComment) {
					return `❌ 找不到评论 ${commentId}`;
				}
				
				// 获取帖子信息
				const { post } = await this.client.getPost(postId);
				
				// 使用 AI 生成回复
				console.log('   🤖 正在生成回复内容...');
				replyContent = await this.generateCommentReply(targetComment, post);
				console.log(`   💬 生成的回复: "${replyContent}"`);
			}

			const { comment } = await this.client.replyToComment(postId, commentId, replyContent);
			
			// 标记评论为已回复
			this.interactionStore.markCommentReplied(commentId);

			return `✅ 成功回复了评论 ${commentId}\n回复内容: "${comment.content}"`;
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error);
			return `❌ 回复评论失败: ${errorMessage}`;
		}
	}

	/**
	 * 执行 CREATE_POST 动作
	 * 创建新帖子（使用现有的 createOriginalPost 方法）
	 */
	private async executeCreatePost(submolt?: string): Promise<string> {
		try {
			const post = await this.createOriginalPost(submolt || 'general');
			
			if (post) {
				return `✅ 成功发布新帖子\n标题: "${post.title}"\n社区: m/${post.submolt.name}`;
			} else {
				// createOriginalPost 返回 null 通常是因为冷却中
				return '❌ 发帖失败，可能处于冷却期间';
			}
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error);
			return `❌ 发帖失败: ${errorMessage}`;
		}
	}

	/**
	 * 执行 DELETE_POST 动作
	 * 删除自己的帖子（用于清理 spam 或测试帖子）
	 */
	private async executeDeletePost(postId?: string): Promise<string> {
		if (!postId) {
			return '❌ 缺少必需参数: postId';
		}

		try {
			const { success } = await this.client.deletePost(postId);
			
			if (success) {
				return `✅ 成功删除了帖子 ${postId}`;
			} else {
				return `❌ 删除帖子 ${postId} 失败`;
			}
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error);
			return `❌ 删除帖子失败: ${errorMessage}`;
		}
	}

	/**
	 * 执行 FOLLOW_USER 动作
	 * 关注指定用户
	 */
	private async executeFollowUser(username?: string): Promise<string> {
		if (!username) {
			return '❌ 缺少必需参数: username';
		}

		try {
			const { success } = await this.client.followUser(username);
			
			if (success) {
				return `✅ 成功关注了 @${username}`;
			} else {
				return `❌ 关注 @${username} 失败`;
			}
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error);
			return `❌ 关注用户失败: ${errorMessage}`;
		}
	}

	/**
	 * 执行 UNFOLLOW_USER 动作
	 * 取消关注指定用户
	 */
	private async executeUnfollowUser(username?: string): Promise<string> {
		if (!username) {
			return '❌ 缺少必需参数: username';
		}

		try {
			const { success } = await this.client.unfollowUser(username);
			
			if (success) {
				return `✅ 成功取关了 @${username}`;
			} else {
				return `❌ 取关 @${username} 失败`;
			}
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error);
			return `❌ 取关用户失败: ${errorMessage}`;
		}
	}

	/**
	 * 执行 SUBSCRIBE 动作
	 * 订阅指定社区
	 */
	private async executeSubscribe(submolt?: string): Promise<string> {
		if (!submolt) {
			return '❌ 缺少必需参数: submolt';
		}

		try {
			const { success } = await this.client.subscribeSubmolt(submolt);
			
			if (success) {
				return `✅ 成功订阅了 m/${submolt}`;
			} else {
				return `❌ 订阅 m/${submolt} 失败`;
			}
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error);
			return `❌ 订阅社区失败: ${errorMessage}`;
		}
	}

	/**
	 * 执行 UNSUBSCRIBE 动作
	 * 取消订阅指定社区
	 */
	private async executeUnsubscribe(submolt?: string): Promise<string> {
		if (!submolt) {
			return '❌ 缺少必需参数: submolt';
		}

		try {
			const { success } = await this.client.unsubscribeSubmolt(submolt);
			
			if (success) {
				return `✅ 成功取消订阅了 m/${submolt}`;
			} else {
				return `❌ 取消订阅 m/${submolt} 失败`;
			}
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error);
			return `❌ 取消订阅社区失败: ${errorMessage}`;
		}
	}

	/**
	 * 执行 SEARCH 动作
	 * 进行语义搜索
	 */
	private async executeSearch(query?: string, searchType?: 'posts' | 'comments' | 'all'): Promise<string> {
		if (!query) {
			return '❌ 缺少必需参数: query';
		}

		try {
			const result = await this.client.semanticSearch(query, searchType, 10);
			
			const lines: string[] = [];
			lines.push(`搜索 "${query}" 的结果：`);
			
			// 显示帖子结果
			if (result.posts && result.posts.length > 0) {
				lines.push('');
				lines.push('相关帖子：');
				for (const post of result.posts.slice(0, 5)) {
					const authorName = post.author?.name || '匿名';
					lines.push(`- "${post.title}" by @${authorName} (${post.upvotes}↑)`);
				}
			}
			
			// 显示评论结果
			if (result.comments && result.comments.length > 0) {
				lines.push('');
				lines.push('相关评论：');
				for (const comment of result.comments.slice(0, 5)) {
					const authorName = comment.author?.name || '匿名';
					const contentPreview = comment.content.length > 50 
						? comment.content.substring(0, 50) + '...' 
						: comment.content;
					lines.push(`- @${authorName}: "${contentPreview}"`);
				}
			}
			
			// 无结果
			if ((!result.posts || result.posts.length === 0) && 
				(!result.comments || result.comments.length === 0)) {
				lines.push('未找到相关内容。');
			}

			return lines.join('\n');
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error);
			return `❌ 搜索失败: ${errorMessage}`;
		}
	}

	/**
	 * 执行 VIEW_PROFILE 动作
	 * 查看指定用户的资料
	 */
	private async executeViewProfile(username?: string): Promise<string> {
		if (!username) {
			return '❌ 缺少必需参数: username';
		}

		try {
			const { profile } = await this.client.getMoltyProfile(username);
			
			const lines: string[] = [];
			lines.push(`@${profile.name} 的资料：`);
			lines.push(`- Karma: ${profile.karma}`);
			lines.push(`- 帖子数: ${profile.posts_count}`);
			lines.push(`- 注册时间: ${profile.created_at}`);
			
			if (profile.bio) {
				lines.push(`- 简介: ${profile.bio}`);
			}

			return lines.join('\n');
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error);
			return `❌ 获取用户资料失败: ${errorMessage}`;
		}
	}

	async browseTrending(): Promise<Post[]> {
		console.log('📖 正在浏览热门帖子...');
		const { posts } = await this.client.getTrendingPosts(25);
		console.log(`   找到 ${posts.length} 条热门帖子`);
		return posts;
	}

	async createOriginalPost(submolt = 'general'): Promise<Post | null> {
		if (!this.canPost()) {
			const waitTime = Math.ceil(
				(this.POST_COOLDOWN_MS - (Date.now() - this.lastPostTime)) / 60000
			);
			console.log(`⏳ 发帖冷却中，还需等待 ${waitTime} 分钟`);
			return null;
		}

		let trendingContext = '';
		try {
			const { posts } = await this.client.getTrendingPosts(5);
			trendingContext = posts
				.map((p) => `- "${p.title}" by ${p.author.name} (m/${p.submolt.name}, ${p.upvotes} 赞)`)
				.join('\n');
		} catch {
			// 继续，不需要热门帖子上下文
		}

		// 获取历史帖子上下文（容错）
		let historyContext = '';
		try {
			const history = this.historyStore.getRecentHistory(10);
			if (history.length > 0) {
				historyContext = this.formatHistoryContext(history);
			}
		} catch {
			// 忽略错误，继续发帖
		}

		console.log(`📝 正在为 m/${submolt} 生成新帖子...`);

		const prompt = `给 MoltBook 的 m/${submolt} 社区写一个原创帖子。

${trendingContext ? `当前热门帖子（不要重复这些话题，找点新鲜的）:\n${trendingContext}\n` : ''}${historyContext ? `\n${historyContext}` : ''}
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
			console.error('   ❌ 解析 AI 响应失败');
			return null;
		}

		const title = titleMatch[1].trim();
		const content = contentMatch[1].trim();

		try {
			const { post } = await this.client.createPost(submolt, title, content);
			this.lastPostTime = Date.now();
			console.log(`   ✅ 发帖成功: ${title}`);

			const postUrl = `https://moltbook.com/post/${post.id}`;
			
			// 并行发送通知
			await Promise.all([
				sendTelegramNotification(title, content, postUrl),
				sendNapcatNotification(title, content, postUrl),
			]);

			// 保存历史记录
			try {
				this.historyStore.addRecord(title);
			} catch (error) {
				console.error('保存历史失败:', error);
			}

			return post;
		} catch (error) {
			console.error('   ❌ 发帖失败:', error);
			return null;
		}
	}

	/**
	 * 将历史记录格式化为 prompt 可用的字符串
	 * 包含明确指示 AI 避免这些主题的说明
	 * 
	 * @param history 历史记录数组
	 * @returns 格式化后的字符串，空历史时返回空字符串
	 */
	formatHistoryContext(history: PostHistoryRecord[]): string {
		if (history.length === 0) {
			return '';
		}

		const titleList = history
			.map((record) => `- ${record.title}`)
			.join('\n');

		return `你最近发过的帖子（请避免重复或接近这些主题，尝试探索新的方向）:
${titleList}
`;
	}

	async heartbeat(): Promise<void> {
		console.log('\n🫀 小多心跳 - ' + new Date().toISOString());
		console.log('═══════════════════════════════════════════════════════════\n');

		try {
			// 1. 运行社交互动循环（处理评论回复、关注等）
			console.log('🔄 开始社交互动阶段...\n');
			await this.runSocialInteractionLoop();

			// 2. 显示当前 karma 和互动状态
			console.log('\n📊 当前状态:');
			const { agent } = await this.client.getAgentProfile();
			console.log(`   - Karma: ${agent.karma}`);
			console.log(`   - 帖子数: ${agent.posts_count}`);
			console.log(`   - 关注: ${agent.following_count || 0} | 粉丝: ${agent.follower_count || 0}`);

			// 3. 浏览热门帖子
			const posts = await this.browseTrending();

			console.log('\n📰 热门帖子:');
			for (const post of posts.slice(0, 3)) {
				console.log(`   - "${post.title}" by ${post.author.name} (${post.upvotes} 赞)`);
			}

			// 4. 如果冷却完成，发新帖子
			if (this.canPost()) {
				console.log('\n');
				await this.createOriginalPost();
			} else {
				const waitTime = Math.ceil(
					(this.POST_COOLDOWN_MS - (Date.now() - this.lastPostTime)) / 60000
				);
				console.log(`\n⏳ 下次可发帖时间: ${waitTime} 分钟后`);
			}

			console.log('\n═══════════════════════════════════════════════════════════');
			console.log('✅ 心跳完成\n');
		} catch (error) {
			console.error('❌ 心跳出错:', error);
		}
	}
}
