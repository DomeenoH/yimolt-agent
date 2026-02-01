/**
 * Moltbook API Client
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
			reject(new Error('Request timeout'));
		});

		if (body) req.write(body);
		req.end();
	});
}

export class MoltbookClient {
	private apiKey: string;
	private baseUrl = 'https://www.moltbook.com/api/v1';

	constructor(apiKey: string) {
		this.apiKey = apiKey;
	}

	private async request<T>(
		method: string,
		path: string,
		body?: Record<string, unknown>
	): Promise<T> {
		const url = `${this.baseUrl}${path}`;
		const headers: Record<string, string> = {
			'Authorization': `Bearer ${this.apiKey}`,
			'Content-Type': 'application/json',
		};

		const result = await httpsRequest(
			method,
			url,
			headers,
			body ? JSON.stringify(body) : undefined
		);

		const data = JSON.parse(result.body);

		if (result.status >= 400) {
			throw new Error(`MoltBook API Error [${result.status}]: ${result.body}`);
		}

		return data;
	}

	async getAgentProfile(): Promise<{ agent: { name: string; karma: number; posts_count: number } }> {
		return this.request('GET', '/agents/profile');
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
}
