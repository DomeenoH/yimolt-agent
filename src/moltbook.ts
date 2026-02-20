/**
 * MoltBook API 客户端
 */

import https from 'node:https';

// =========== 验证挑战相关类型 ===========

export interface VerificationChallenge {
	verification_code: string;
	challenge_text: string;
	expires_at: string;
	instructions: string;
}

export interface ContentWithVerification {
	verification_status?: string;
	verification?: VerificationChallenge;
}

/**
 * 解析混淆的验证挑战文本，提取数学运算并计算结果
 * 
 * 挑战文本格式：lobster/物理主题，随机大小写 + 散乱符号（^[]/-）+ 碎片单词
 * 例如："A] lO^bSt-Er S[wImS aT/ tW]eNn-Tyy mE^tE[rS aNd] SlO/wS bY^ fI[vE"
 * → "a lobster swims at twenty meters and slows by five" → 20 - 5 = 15.00
 */
export function solveVerificationChallenge(challengeText: string): string {
	// 1. 去除混淆符号，统一小写
	const cleaned = challengeText
		.replace(/[\[\]\^\-\/]/g, '')
		.toLowerCase()
		.replace(/\s+/g, ' ')
		.trim();

	// 2. 数字词映射
	const numberWords: Record<string, number> = {
		'zero': 0, 'one': 1, 'two': 2, 'three': 3, 'four': 4,
		'five': 5, 'six': 6, 'seven': 7, 'eight': 8, 'nine': 9,
		'ten': 10, 'eleven': 11, 'twelve': 12, 'thirteen': 13,
		'fourteen': 14, 'fifteen': 15, 'sixteen': 16, 'seventeen': 17,
		'eighteen': 18, 'nineteen': 19, 'twenty': 20, 'twentyy': 20,
		'thirty': 30, 'thirtyy': 30, 'forty': 40, 'fortyy': 40,
		'fifty': 50, 'fiftyy': 50, 'sixty': 60, 'sixtyy': 60,
		'seventy': 70, 'seventyy': 70, 'eighty': 80, 'eightyy': 80,
		'ninety': 90, 'ninetyy': 90, 'hundred': 100, 'hundredd': 100,
		'thousand': 1000,
		// 复合数词中的十位+个位（如 "twentyy five" → 25）
		'twenntyy': 20, 'thentyy': 20,
	};

	// 3. 运算符词映射
	const addOps = ['adds', 'plus', 'gains', 'increases by', 'increased by', 'and gains', 'and adds', 'speeds up by', 'accelerates by'];
	const subOps = ['slows by', 'loses', 'minus', 'decreases by', 'decreased by', 'and slows by', 'and loses', 'drops by', 'reduces by', 'subtracts'];
	const mulOps = ['times', 'multiplied by', 'multiplies by'];
	const divOps = ['divided by', 'splits into', 'divides by'];

	// 4. 从文本中提取所有数字（包括阿拉伯数字和英文数词）
	const words = cleaned.split(' ');
	const numbers: number[] = [];

	// 先尝试匹配阿拉伯数字
	const arabicMatches = cleaned.match(/\b\d+(\.\d+)?\b/g);
	if (arabicMatches) {
		for (const m of arabicMatches) {
			numbers.push(parseFloat(m));
		}
	}

	// 匹配英文数词
	for (let i = 0; i < words.length; i++) {
		const word = words[i];
		if (numberWords[word] !== undefined) {
			const value = numberWords[word];
			// 检查是否是复合数词（如 twenty five = 25）
			if (value >= 20 && value <= 90 && value % 10 === 0 && i + 1 < words.length) {
				const nextWord = words[i + 1];
				if (numberWords[nextWord] !== undefined && numberWords[nextWord] < 10) {
					numbers.push(value + numberWords[nextWord]);
					i++; // 跳过下一个词
					continue;
				}
			}
			numbers.push(value);
		}
	}

	// 5. 识别运算符
	let operator = '+';
	if (subOps.some(op => cleaned.includes(op))) {
		operator = '-';
	} else if (mulOps.some(op => cleaned.includes(op))) {
		operator = '*';
	} else if (divOps.some(op => cleaned.includes(op))) {
		operator = '/';
	} else if (addOps.some(op => cleaned.includes(op))) {
		operator = '+';
	}

	// 6. 计算
	if (numbers.length < 2) {
		console.error(`   ⚠️ 验证挑战解析失败：只找到 ${numbers.length} 个数字。原文: "${challengeText}"，清理后: "${cleaned}"`);
		return '0.00';
	}

	const a = numbers[0];
	const b = numbers[1];
	let result: number;

	switch (operator) {
		case '+': result = a + b; break;
		case '-': result = a - b; break;
		case '*': result = a * b; break;
		case '/': result = b !== 0 ? a / b : 0; break;
		default: result = a + b;
	}

	const answer = result.toFixed(2);
	console.log(`   🧮 验证挑战: ${a} ${operator} ${b} = ${answer}`);
	return answer;
}

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
				// 5xx: 服务器错误
				// 网络超时/连接重置
				// 注意：429 不重试，发帖冷却应由上层逻辑处理
				const isRetryable = 
					errorMessage.includes('MoltBook API 错误 [401]') ||
					errorMessage.includes('MoltBook API 错误 [5') ||
					errorMessage.includes('请求超时') ||
					errorMessage.includes('ECONNRESET');

				if (!isRetryable) throw error; // 不需要重试的错误直接抛出

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

	/**
	 * 提交验证挑战答案
	 */
	async submitVerification(verificationCode: string, answer: string): Promise<{ success: boolean; message?: string }> {
		return this.request('POST', '/verify', { verification_code: verificationCode, answer });
	}

	/**
	 * 通用的内容验证处理——检查响应中是否包含验证挑战，如有则自动解题提交
	 */
	private async handleVerification<T extends { verification_required?: boolean }>(response: T & Record<string, unknown>): Promise<T> {
		// 检查响应中任意嵌套对象是否包含 verification
		const findVerification = (obj: Record<string, unknown>): ContentWithVerification | null => {
			for (const value of Object.values(obj)) {
				if (value && typeof value === 'object' && 'verification' in (value as Record<string, unknown>)) {
					return value as ContentWithVerification;
				}
			}
			return null;
		};

		const hasFlag = response.verification_required === true;
		const content = findVerification(response);

		if (!hasFlag || !content?.verification) {
			// 无需验证（trusted agent 或 admin），直接返回
			return response;
		}

		const challenge = content.verification;
		console.log(`   🔐 需要 AI 验证挑战...`);

		// 解题
		const answer = solveVerificationChallenge(challenge.challenge_text);

		// 提交答案
		try {
			const verifyResult = await this.submitVerification(challenge.verification_code, answer);
			if (verifyResult.success) {
				console.log(`   ✅ 验证通过！内容已发布`);
			} else {
				console.error(`   ❌ 验证失败: ${verifyResult.message || '答案错误'}`);
			}
		} catch (error) {
			const msg = error instanceof Error ? error.message : String(error);
			console.error(`   ❌ 验证提交失败: ${msg}`);
		}

		return response;
	}

	async createPost(
		submolt: string,
		title: string,
		content: string
	): Promise<{ post: Post }> {
		const response = await this.request<{ post: Post & ContentWithVerification; verification_required?: boolean }>('POST', '/posts', { submolt_name: submolt, title, content });
		await this.handleVerification(response);
		return response;
	}

	async createComment(postId: string, content: string): Promise<{ comment: Comment }> {
		const response = await this.request<{ comment: Comment & ContentWithVerification; verification_required?: boolean }>('POST', `/posts/${postId}/comments`, { content });
		await this.handleVerification(response);
		return response;
	}

	async replyToComment(postId: string, parentId: string, content: string): Promise<{ comment: Comment }> {
		const response = await this.request<{ comment: Comment & ContentWithVerification; verification_required?: boolean }>('POST', `/posts/${postId}/comments`, { content, parent_id: parentId });
		await this.handleVerification(response);
		return response;
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
