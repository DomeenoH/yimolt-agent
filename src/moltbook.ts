/**
 * MoltBook API 客户端
 */

import https from 'node:https';

export interface Post {
	id: string;
	title: string;
	content: string;
	url?: string;
	upvotes: number;
	downvotes: number;
	comment_count: number;
	created_at: string;
	author: { id: string; name: string };
	submolt: { name: string };
}

export interface Comment {
	id: string;
	content: string;
	upvotes: number;
	downvotes: number;
	created_at: string;
	author: { id: string; name: string };
	parent_id?: string;
}

export interface SearchResult {
	posts?: Post[];
	comments?: Comment[];
}

export interface MoltyProfile {
	id: string;
	name: string;
	karma: number;
	posts_count?: number;
	follower_count?: number;
	following_count?: number;
	created_at: string;
	bio?: string;
	description?: string;
}

function httpsRequest(
	method: string,
	url: string,
	headers: Record<string, string>,
	body?: string
): Promise<{ status: number; body: string }> {
	return new Promise((resolve, reject) => {
		const urlObj = new URL(url);

		const options: https.RequestOptions = {
			hostname: urlObj.hostname,
			path: urlObj.pathname + urlObj.search,
			method,
			headers: {
				...headers,
				...(body ? { 'Content-Length': Buffer.byteLength(body) } : {}),
			},
		};

		const req = https.request(options, (res) => {
			let data = '';
			res.on('data', (chunk) => (data += chunk));
			res.on('end', () => {
				resolve({ status: res.statusCode || 0, body: data });
			});
		});

		req.on('error', reject);
		req.setTimeout(30000, () => {
			req.destroy();
			reject(new Error('请求超时'));
		});

		if (body) req.write(body);
		req.end();
	});
}

export class MoltbookClient {
	private apiKey: string;
	private botName: string;
	private baseUrl = 'https://www.moltbook.com/api/v1';

	constructor(apiKey: string, botName?: string) {
		this.apiKey = apiKey;
		this.botName = botName || process.env.MOLTBOOK_BOT_NAME || 'DominoJr';
	}

	private async request<T>(
		method: string,
		path: string,
		body?: Record<string, unknown>,
		retries = 10,
		backoff = 2000
	): Promise<T> {
		const url = `${this.baseUrl}${path}`;
		const headers: Record<string, string> = {
			'Authorization': `Bearer ${this.apiKey}`,
			'Content-Type': 'application/json',
		};

		let lastError: unknown;

		for (let i = 0; i <= retries; i++) {
			try {
				const result = await httpsRequest(
					method,
					url,
					headers,
					body ? JSON.stringify(body) : undefined
				);

				// 检查是否收到 HTML 响应（通常意味着重定向或错误页面）
				if (result.body.trim().startsWith('<!DOCTYPE') || result.body.trim().startsWith('<html')) {
					throw new Error(`MoltBook API 返回了 HTML 而不是 JSON [${result.status}]，可能是端点错误或重定向。URL: ${url}`);
				}

				let data: T;
				try {
					data = JSON.parse(result.body);
				} catch {
					throw new Error(`MoltBook API 响应解析失败 [${result.status}]: ${result.body.substring(0, 200)}`);
				}

				if (result.status >= 400) {
					// 抛出错误以便在 catch 块中处理重试逻辑
					throw new Error(`MoltBook API 错误 [${result.status}]: ${result.body}`);
				}

				return data;
			} catch (error) {
				lastError = error;
				
				// 如果是最后一次尝试，直接退出循环抛出错误
				if (i === retries) break;

				const errorMessage = error instanceof Error ? error.message : String(error);
				
				// 判断是否需要重试
				// 401: Invalid API Key (不稳定时可能误报)
				// 429: Too Many Requests
				// 5xx: 服务器错误
				// 网络超时/连接重置
				const isRetryable = 
					errorMessage.includes('MoltBook API 错误 [401]') ||
					errorMessage.includes('MoltBook API 错误 [429]') ||
					errorMessage.includes('MoltBook API 错误 [5') ||
					errorMessage.includes('请求超时') ||
					errorMessage.includes('ECONNRESET');

				if (!isRetryable) throw error; // 不需要重试的错误直接即使抛出

				console.log(`   ⚠️ API 请求不稳定，${backoff}ms 后重试 (${i + 1}/${retries})...`);
				await new Promise(resolve => setTimeout(resolve, backoff));
				// 移除指数退避，保持固定等待时间
			}
		}

		throw lastError;
	}

	async getAgentProfile(): Promise<{ agent: { name: string; karma: number; posts_count: number; follower_count: number; following_count: number } }> {
		// /agents/me 可能不返回 posts_count，所以我们需要从 profile 端点获取完整信息
		const meResult = await this.request<{ agent: { name: string; karma?: number; follower_count?: number; following_count?: number } }>('GET', '/agents/me');
		const myName = meResult.agent.name;
		
		// 获取完整的 profile 信息（包括 recentPosts）
		const profileResult = await this.request<{ agent: MoltyProfile; recentPosts?: Post[] }>('GET', `/agents/profile?name=${encodeURIComponent(myName)}`);
		
		return {
			agent: {
				name: profileResult.agent.name,
				karma: profileResult.agent.karma || 0,
				posts_count: profileResult.agent.posts_count || (profileResult.recentPosts?.length || 0),
				follower_count: profileResult.agent.follower_count || 0,
				following_count: profileResult.agent.following_count || 0,
			}
		};
	}

	async getTrendingPosts(limit = 25): Promise<{ posts: Post[] }> {
		return this.request('GET', `/posts?sort=hot&limit=${limit}`);
	}

	async getPost(postId: string): Promise<{ post: Post; comments: Comment[] }> {
		return this.request('GET', `/posts/${postId}`);
	}

	async createPost(
		submolt: string,
		title: string,
		content: string
	): Promise<{ post: Post }> {
		return this.request('POST', '/posts', { submolt, title, content });
	}

	async createComment(postId: string, content: string): Promise<{ comment: Comment }> {
		return this.request('POST', `/posts/${postId}/comments`, { content });
	}

	async replyToComment(postId: string, parentId: string, content: string): Promise<{ comment: Comment }> {
		return this.request('POST', `/posts/${postId}/comments`, { content, parent_id: parentId });
	}

	async getMyPosts(limit?: number): Promise<{ posts: Post[] }> {
		// 先从 /agents/me 获取自己的名字，再获取帖子
		// 这样可以避免依赖 botName 环境变量
		const meResult = await this.request<{ agent: { name: string } }>('GET', '/agents/me');
		const myName = meResult.agent.name;
		
		// 使用 profile 端点获取自己的最近帖子
		const result = await this.request<{ agent: MoltyProfile; recentPosts: Post[] }>('GET', `/agents/profile?name=${encodeURIComponent(myName)}`);
		const posts = result.recentPosts || [];
		return { posts: limit ? posts.slice(0, limit) : posts };
	}

	async getPostComments(
		postId: string,
		sort?: 'top' | 'new' | 'controversial'
	): Promise<{ comments: Comment[] }> {
		// 尝试使用 /posts/{postId}/comments 端点
		// 如果失败，回退到从 /posts/{postId} 获取评论
		try {
			const query = sort ? `?sort=${sort}` : '';
			return await this.request('GET', `/posts/${postId}/comments${query}`);
		} catch {
			// 回退：从帖子详情中获取评论
			const result = await this.request<{ post: Post; comments: Comment[] }>('GET', `/posts/${postId}`);
			return { comments: result.comments || [] };
		}
	}

	async followUser(username: string): Promise<{ success: boolean }> {
		return this.request('POST', `/agents/${encodeURIComponent(username)}/follow`);
	}

	async unfollowUser(username: string): Promise<{ success: boolean }> {
		return this.request('DELETE', `/agents/${encodeURIComponent(username)}/follow`);
	}

	async subscribeSubmolt(submolt: string): Promise<{ success: boolean }> {
		return this.request('POST', `/submolts/${submolt}/subscribe`);
	}

	async unsubscribeSubmolt(submolt: string): Promise<{ success: boolean }> {
		return this.request('DELETE', `/submolts/${submolt}/subscribe`);
	}

	async deletePost(postId: string): Promise<{ success: boolean }> {
		return this.request('DELETE', `/posts/${postId}`);
	}

	async semanticSearch(
		query: string,
		type?: 'posts' | 'comments' | 'all',
		limit?: number
	): Promise<SearchResult> {
		const params = new URLSearchParams();
		params.append('q', query);
		if (type !== undefined) {
			params.append('type', type);
		}
		if (limit !== undefined) {
			params.append('limit', limit.toString());
		}
		return this.request('GET', `/search?${params.toString()}`);
	}

	async getMoltyProfile(username: string): Promise<{ profile: MoltyProfile }> {
		const result = await this.request<{ agent: MoltyProfile }>('GET', `/agents/profile?name=${encodeURIComponent(username)}`);
		return { profile: result.agent };
	}

	async getFollowing(): Promise<{ users: MoltyProfile[] }> {
		// API 不支持获取关注列表，返回空数组
		// 可以从 /agents/me 获取 following_count
		return { users: [] };
	}

	async getFollowers(): Promise<{ users: MoltyProfile[] }> {
		// API 不支持获取粉丝列表，返回空数组
		// 可以从 /agents/me 获取 follower_count
		return { users: [] };
	}

	async getSubscriptions(): Promise<{ submolts: string[] }> {
		// API 不支持获取订阅列表，返回空数组
		return { submolts: [] };
	}
}
