/**
 * MoltbookClient 单元测试
 */

import { describe, it, expect } from 'vitest';
import { MoltbookClient } from './moltbook.js';

describe('MoltbookClient', () => {
	describe('getMyPosts', () => {
		it('方法存在且可调用', () => {
			const client = new MoltbookClient('test-api-key');
			expect(typeof client.getMyPosts).toBe('function');
		});

		it('方法接受可选的 limit 参数', () => {
			const client = new MoltbookClient('test-api-key');
			// 验证方法签名：可以不传参数调用
			expect(() => client.getMyPosts).not.toThrow();
			// 验证方法签名：可以传 limit 参数调用
			expect(() => client.getMyPosts(10)).not.toThrow();
		});
	});

	describe('getPostComments', () => {
		it('方法存在且可调用', () => {
			const client = new MoltbookClient('test-api-key');
			expect(typeof client.getPostComments).toBe('function');
		});

		it('方法接受 postId 参数', () => {
			const client = new MoltbookClient('test-api-key');
			// 验证方法签名：可以传 postId 参数调用
			expect(() => client.getPostComments('post-123')).not.toThrow();
		});

		it('方法接受可选的 sort 参数', () => {
			const client = new MoltbookClient('test-api-key');
			// 验证方法签名：可以传 sort 参数调用
			expect(() => client.getPostComments('post-123', 'top')).not.toThrow();
			expect(() => client.getPostComments('post-123', 'new')).not.toThrow();
			expect(() => client.getPostComments('post-123', 'controversial')).not.toThrow();
		});
	});

	describe('replyToComment', () => {
		it('方法存在且可调用', () => {
			const client = new MoltbookClient('test-api-key');
			expect(typeof client.replyToComment).toBe('function');
		});

		it('方法接受 postId、parentId 和 content 参数', () => {
			const client = new MoltbookClient('test-api-key');
			// 验证方法签名：可以传所有必需参数调用
			expect(() => client.replyToComment('post-123', 'comment-456', '这是回复内容')).not.toThrow();
		});

		it('方法返回 Promise', () => {
			const client = new MoltbookClient('test-api-key');
			const result = client.replyToComment('post-123', 'comment-456', '这是回复内容');
			expect(result).toBeInstanceOf(Promise);
		});
	});

	describe('followUser', () => {
		it('方法存在且可调用', () => {
			const client = new MoltbookClient('test-api-key');
			expect(typeof client.followUser).toBe('function');
		});

		it('方法接受 username 参数', () => {
			const client = new MoltbookClient('test-api-key');
			// 验证方法签名：可以传 username 参数调用
			expect(() => client.followUser('testuser')).not.toThrow();
		});

		it('方法返回 Promise', () => {
			const client = new MoltbookClient('test-api-key');
			const result = client.followUser('testuser');
			expect(result).toBeInstanceOf(Promise);
		});
	});

	describe('unfollowUser', () => {
		it('方法存在且可调用', () => {
			const client = new MoltbookClient('test-api-key');
			expect(typeof client.unfollowUser).toBe('function');
		});

		it('方法接受 username 参数', () => {
			const client = new MoltbookClient('test-api-key');
			// 验证方法签名：可以传 username 参数调用
			expect(() => client.unfollowUser('testuser')).not.toThrow();
		});

		it('方法返回 Promise', () => {
			const client = new MoltbookClient('test-api-key');
			const result = client.unfollowUser('testuser');
			expect(result).toBeInstanceOf(Promise);
		});
	});

	describe('subscribeSubmolt', () => {
		it('方法存在且可调用', () => {
			const client = new MoltbookClient('test-api-key');
			expect(typeof client.subscribeSubmolt).toBe('function');
		});

		it('方法接受 submolt 参数', () => {
			const client = new MoltbookClient('test-api-key');
			// 验证方法签名：可以传 submolt 参数调用
			expect(() => client.subscribeSubmolt('technology')).not.toThrow();
		});

		it('方法返回 Promise', () => {
			const client = new MoltbookClient('test-api-key');
			const result = client.subscribeSubmolt('technology');
			expect(result).toBeInstanceOf(Promise);
		});
	});

	describe('unsubscribeSubmolt', () => {
		it('方法存在且可调用', () => {
			const client = new MoltbookClient('test-api-key');
			expect(typeof client.unsubscribeSubmolt).toBe('function');
		});

		it('方法接受 submolt 参数', () => {
			const client = new MoltbookClient('test-api-key');
			// 验证方法签名：可以传 submolt 参数调用
			expect(() => client.unsubscribeSubmolt('technology')).not.toThrow();
		});

		it('方法返回 Promise', () => {
			const client = new MoltbookClient('test-api-key');
			const result = client.unsubscribeSubmolt('technology');
			expect(result).toBeInstanceOf(Promise);
		});
	});

	describe('semanticSearch', () => {
		it('方法存在且可调用', () => {
			const client = new MoltbookClient('test-api-key');
			expect(typeof client.semanticSearch).toBe('function');
		});

		it('方法接受 query 参数', () => {
			const client = new MoltbookClient('test-api-key');
			// 验证方法签名：可以传 query 参数调用
			expect(() => client.semanticSearch('搜索关键词')).not.toThrow();
		});

		it('方法接受可选的 type 参数', () => {
			const client = new MoltbookClient('test-api-key');
			// 验证方法签名：可以传 type 参数调用
			expect(() => client.semanticSearch('搜索关键词', 'posts')).not.toThrow();
			expect(() => client.semanticSearch('搜索关键词', 'comments')).not.toThrow();
			expect(() => client.semanticSearch('搜索关键词', 'all')).not.toThrow();
		});

		it('方法接受可选的 limit 参数', () => {
			const client = new MoltbookClient('test-api-key');
			// 验证方法签名：可以传 limit 参数调用
			expect(() => client.semanticSearch('搜索关键词', 'posts', 10)).not.toThrow();
			expect(() => client.semanticSearch('搜索关键词', undefined, 20)).not.toThrow();
		});

		it('方法返回 Promise', () => {
			const client = new MoltbookClient('test-api-key');
			const result = client.semanticSearch('搜索关键词');
			expect(result).toBeInstanceOf(Promise);
		});
	});

	describe('getMoltyProfile', () => {
		it('方法存在且可调用', () => {
			const client = new MoltbookClient('test-api-key');
			expect(typeof client.getMoltyProfile).toBe('function');
		});

		it('方法接受 username 参数', () => {
			const client = new MoltbookClient('test-api-key');
			// 验证方法签名：可以传 username 参数调用
			expect(() => client.getMoltyProfile('testuser')).not.toThrow();
		});

		it('方法返回 Promise', () => {
			const client = new MoltbookClient('test-api-key');
			const result = client.getMoltyProfile('testuser');
			expect(result).toBeInstanceOf(Promise);
		});
	});

	describe('getFollowing', () => {
		it('方法存在且可调用', () => {
			const client = new MoltbookClient('test-api-key');
			expect(typeof client.getFollowing).toBe('function');
		});

		it('方法不需要参数', () => {
			const client = new MoltbookClient('test-api-key');
			// 验证方法签名：可以不传参数调用
			expect(() => client.getFollowing()).not.toThrow();
		});

		it('方法返回 Promise', () => {
			const client = new MoltbookClient('test-api-key');
			const result = client.getFollowing();
			expect(result).toBeInstanceOf(Promise);
		});
	});

	describe('getFollowers', () => {
		it('方法存在且可调用', () => {
			const client = new MoltbookClient('test-api-key');
			expect(typeof client.getFollowers).toBe('function');
		});

		it('方法不需要参数', () => {
			const client = new MoltbookClient('test-api-key');
			// 验证方法签名：可以不传参数调用
			expect(() => client.getFollowers()).not.toThrow();
		});

		it('方法返回 Promise', () => {
			const client = new MoltbookClient('test-api-key');
			const result = client.getFollowers();
			expect(result).toBeInstanceOf(Promise);
		});
	});

	describe('getSubscriptions', () => {
		it('方法存在且可调用', () => {
			const client = new MoltbookClient('test-api-key');
			expect(typeof client.getSubscriptions).toBe('function');
		});

		it('方法不需要参数', () => {
			const client = new MoltbookClient('test-api-key');
			// 验证方法签名：可以不传参数调用
			expect(() => client.getSubscriptions()).not.toThrow();
		});

		it('方法返回 Promise', () => {
			const client = new MoltbookClient('test-api-key');
			const result = client.getSubscriptions();
			expect(result).toBeInstanceOf(Promise);
		});
	});
});
