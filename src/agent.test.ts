/**
 * YiMoltAgent 单元测试和属性测试
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { YiMoltAgent, type AgentContext, type PostWithStatus, type ActionHistoryEntry } from './agent.js';
import type { PostHistoryRecord } from './history-store.js';
import type { ActionRequest } from './action-parser.js';
import type { Comment as MoltbookComment } from './moltbook.js';

// 创建一个最小化的 mock agent 用于测试 formatHistoryContext
function createTestAgent(): YiMoltAgent {
	// 使用 any 来绕过构造函数的依赖
	const agent = Object.create(YiMoltAgent.prototype);
	return agent;
}

// 创建一个最小化的 mock Post 对象
function createMockPost(overrides: Partial<{
	id: string;
	title: string;
	upvotes: number;
	downvotes: number;
	comment_count: number;
}> = {}): PostWithStatus['post'] {
	return {
		id: overrides.id ?? 'post-123',
		title: overrides.title ?? '测试帖子',
		content: '测试内容',
		upvotes: overrides.upvotes ?? 10,
		downvotes: overrides.downvotes ?? 2,
		comment_count: overrides.comment_count ?? 5,
		created_at: '2024-01-15T10:30:00Z',
		author: { id: 'author-1', name: 'TestAuthor', karma: 100, posts_count: 10, created_at: '2024-01-01T00:00:00Z' },
		submolt: { id: 'submolt-1', name: 'general', description: 'General discussion' },
	} as PostWithStatus['post'];
}

// 创建一个最小化的 AgentContext 对象
function createMockContext(overrides: Partial<AgentContext> = {}): AgentContext {
	return {
		agentName: overrides.agentName ?? '小多（DominoJr）',
		karma: overrides.karma ?? 156,
		postsCount: overrides.postsCount ?? 12,
		recentPosts: overrides.recentPosts ?? [],
		totalNewComments: overrides.totalNewComments ?? 0,
		followingCount: overrides.followingCount ?? 5,
		followersCount: overrides.followersCount ?? 23,
		subscriptionsCount: overrides.subscriptionsCount ?? 3,
		canPost: overrides.canPost ?? true,
		nextPostAvailableIn: overrides.nextPostAvailableIn ?? 0,
		recentPostTitles: overrides.recentPostTitles ?? [],
	};
}

describe('YiMoltAgent', () => {
	describe('filterNewComments', () => {
		/**
		 * filterNewComments 测试
		 * 测试新评论过滤功能
		 * 
		 * _Requirements: 2.2_
		 */

		// 创建一个带有 mock interactionStore 的 agent
		function createAgentWithInteractionStore(repliedCommentIds: string[], spamUsernames: string[] = []): YiMoltAgent {
			const agent = Object.create(YiMoltAgent.prototype);
			
			// Mock interactionStore
			agent.interactionStore = {
				isCommentReplied: (commentId: string) => repliedCommentIds.includes(commentId),
				markCommentReplied: () => {},
				isSpamUser: (username: string) => spamUsernames.includes(username),
				markAsSpam: () => {},
			};
			
			// Mock activityLog
			agent.activityLog = {
				startRun: () => 'test-run',
				logActivity: () => {},
				endRun: () => {},
			};
			
			return agent;
		}

		// 创建 mock 评论
		function createMockComment(id: string, content: string = '测试评论'): MoltbookComment {
			return {
				id,
				content,
				upvotes: 0,
				downvotes: 0,
				created_at: '2024-01-15T10:30:00Z',
				author: { id: 'user-1', name: 'TestUser', karma: 100, posts_count: 10, created_at: '2024-01-01T00:00:00Z' },
			} as MoltbookComment;
		}

		it('空评论列表返回空数组', () => {
			const agent = createAgentWithInteractionStore([]);
			const result = agent.filterNewComments([], 'post-123');
			expect(result).toEqual([]);
		});

		it('没有已回复评论时返回所有评论', () => {
			const agent = createAgentWithInteractionStore([]);
			const comments = [
				createMockComment('c1', '评论1'),
				createMockComment('c2', '评论2'),
				createMockComment('c3', '评论3'),
			];
			
			const result = agent.filterNewComments(comments, 'post-123');
			
			expect(result).toHaveLength(3);
			expect(result.map(c => c.id)).toEqual(['c1', 'c2', 'c3']);
		});

		it('过滤掉已回复的评论', () => {
			const agent = createAgentWithInteractionStore(['c1', 'c3']);
			const comments = [
				createMockComment('c1', '评论1'),
				createMockComment('c2', '评论2'),
				createMockComment('c3', '评论3'),
			];
			
			const result = agent.filterNewComments(comments, 'post-123');
			
			expect(result).toHaveLength(1);
			expect(result[0].id).toBe('c2');
		});

		it('所有评论都已回复时返回空数组', () => {
			const agent = createAgentWithInteractionStore(['c1', 'c2', 'c3']);
			const comments = [
				createMockComment('c1', '评论1'),
				createMockComment('c2', '评论2'),
				createMockComment('c3', '评论3'),
			];
			
			const result = agent.filterNewComments(comments, 'post-123');
			
			expect(result).toHaveLength(0);
		});

		it('保持评论的原始顺序', () => {
			const agent = createAgentWithInteractionStore(['c2']);
			const comments = [
				createMockComment('c1', '评论1'),
				createMockComment('c2', '评论2'),
				createMockComment('c3', '评论3'),
				createMockComment('c4', '评论4'),
			];
			
			const result = agent.filterNewComments(comments, 'post-123');
			
			expect(result).toHaveLength(3);
			expect(result.map(c => c.id)).toEqual(['c1', 'c3', 'c4']);
		});

		it('不提供 postId 参数时也能正常工作', () => {
			const agent = createAgentWithInteractionStore(['c1']);
			const comments = [
				createMockComment('c1', '评论1'),
				createMockComment('c2', '评论2'),
			];
			
			// 不传 postId
			const result = agent.filterNewComments(comments);
			
			expect(result).toHaveLength(1);
			expect(result[0].id).toBe('c2');
		});

		it('过滤掉 spam 用户的评论', () => {
			const agent = createAgentWithInteractionStore([], ['SpamBot']);
			const comments = [
				createMockComment('c1', '正常评论'),
				{ ...createMockComment('c2', 'spam 内容'), author: { id: 'spam-1', name: 'SpamBot', karma: 0, posts_count: 0, created_at: '2024-01-01' } } as MoltbookComment,
				createMockComment('c3', '另一条正常评论'),
			];
			
			const result = agent.filterNewComments(comments, 'post-123');
			
			expect(result).toHaveLength(2);
			expect(result.map(c => c.id)).toEqual(['c1', 'c3']);
		});

		it('同时过滤已回复和 spam 用户的评论', () => {
			const agent = createAgentWithInteractionStore(['c1'], ['SpamBot']);
			const comments = [
				createMockComment('c1', '已回复的评论'),
				{ ...createMockComment('c2', 'spam 内容'), author: { id: 'spam-1', name: 'SpamBot', karma: 0, posts_count: 0, created_at: '2024-01-01' } } as MoltbookComment,
				createMockComment('c3', '正常评论'),
			];
			
			const result = agent.filterNewComments(comments, 'post-123');
			
			expect(result).toHaveLength(1);
			expect(result[0].id).toBe('c3');
		});
	});

	describe('formatHistoryContext', () => {
		it('空历史时返回空字符串', () => {
			const agent = createTestAgent();
			const result = agent.formatHistoryContext([]);
			expect(result).toBe('');
		});

		it('单条历史记录时格式化正确', () => {
			const agent = createTestAgent();
			const history: PostHistoryRecord[] = [
				{ title: '测试帖子标题', createdAt: '2024-01-15T10:30:00Z' },
			];
			const result = agent.formatHistoryContext(history);
			
			expect(result).toContain('测试帖子标题');
			expect(result).toContain('避免重复');
		});

		it('多条历史记录时包含所有标题', () => {
			const agent = createTestAgent();
			const history: PostHistoryRecord[] = [
				{ title: '第一个帖子', createdAt: '2024-01-15T10:30:00Z' },
				{ title: '第二个帖子', createdAt: '2024-01-15T08:00:00Z' },
				{ title: '第三个帖子', createdAt: '2024-01-14T20:00:00Z' },
			];
			const result = agent.formatHistoryContext(history);
			
			expect(result).toContain('第一个帖子');
			expect(result).toContain('第二个帖子');
			expect(result).toContain('第三个帖子');
		});

		it('格式化结果包含列表格式', () => {
			const agent = createTestAgent();
			const history: PostHistoryRecord[] = [
				{ title: '帖子A', createdAt: '2024-01-15T10:30:00Z' },
				{ title: '帖子B', createdAt: '2024-01-15T08:00:00Z' },
			];
			const result = agent.formatHistoryContext(history);
			
			// 验证列表格式
			expect(result).toContain('- 帖子A');
			expect(result).toContain('- 帖子B');
		});

		it('格式化结果包含避免重复的指示', () => {
			const agent = createTestAgent();
			const history: PostHistoryRecord[] = [
				{ title: '任意帖子', createdAt: '2024-01-15T10:30:00Z' },
			];
			const result = agent.formatHistoryContext(history);
			
			// 验证包含避免重复的指示（需求 2.4, 3.2）
			expect(result).toMatch(/避免.*重复|不要.*重复/);
		});
	});

	describe('formatHistoryContext Property Tests', () => {
		/**
		 * Property 3: 历史格式化完整性
		 * 对于任意非空的历史记录列表，格式化后的 prompt 上下文字符串应该包含列表中每一条记录的标题。
		 * 
		 * **Validates: Requirements 2.2, 3.1**
		 */
		it('Property 3: 历史格式化完整性 - **Validates: Requirements 2.2, 3.1**', () => {
			const agent = createTestAgent();

			// 生成 PostHistoryRecord 的 arbitrary
			// 使用有效的日期范围避免 Invalid time value 错误
			const postHistoryRecordArb = fc.record({
				title: fc.string({ minLength: 1, maxLength: 100 }),
				createdAt: fc.date({ min: new Date('2020-01-01'), max: new Date('2030-01-01') }).map(d => d.toISOString()),
			});

			fc.assert(
				fc.property(
					// 生成非空的历史记录数组（1-20 条）
					fc.array(postHistoryRecordArb, { minLength: 1, maxLength: 20 }),
					(history) => {
						// 格式化历史记录
						const result = agent.formatHistoryContext(history);

						// 验证：格式化后的字符串应该包含每一条记录的标题
						for (const record of history) {
							expect(result).toContain(record.title);
						}

						return true;
					}
				),
				{ numRuns: 20 }
			);
		});
	});

	describe('formatContextPrompt', () => {
		it('包含 Agent 身份信息', () => {
			const agent = createTestAgent();
			const context = createMockContext({ agentName: '小多（DominoJr）' });
			const result = agent.formatContextPrompt(context, []);
			
			expect(result).toContain('小多（DominoJr）');
			expect(result).toContain('MoltBook');
			expect(result).toContain('AI agent');
		});

		it('包含当前状态信息', () => {
			const agent = createTestAgent();
			const context = createMockContext({
				karma: 156,
				postsCount: 12,
				followingCount: 5,
				followersCount: 23,
			});
			const result = agent.formatContextPrompt(context, []);
			
			expect(result).toContain('## 当前状态');
			expect(result).toContain('Karma: 156');
			expect(result).toContain('帖子数: 12');
			expect(result).toContain('关注: 5');
			expect(result).toContain('粉丝: 23');
		});

		it('发帖冷却中时显示等待时间', () => {
			const agent = createTestAgent();
			const context = createMockContext({
				canPost: false,
				nextPostAvailableIn: 15,
			});
			const result = agent.formatContextPrompt(context, []);
			
			expect(result).toContain('还需等待 15 分钟');
		});

		it('可以发帖时显示可以发帖', () => {
			const agent = createTestAgent();
			const context = createMockContext({
				canPost: true,
			});
			const result = agent.formatContextPrompt(context, []);
			
			expect(result).toContain('可以发帖');
		});

		it('包含最近帖子列表', () => {
			const agent = createTestAgent();
			const context = createMockContext({
				recentPosts: [
					{
						post: createMockPost({ title: '为什么大学食堂的番茄炒蛋永远是甜的', upvotes: 25, downvotes: 3 }),
						hasNewComments: true,
						newCommentCount: 2,
						hasVoteChanges: false,
						voteDelta: { upvotes: 0, downvotes: 0 },
					},
					{
						post: createMockPost({ title: '跑团时 KP 说"你确定吗"是什么感觉', upvotes: 18, downvotes: 1 }),
						hasNewComments: false,
						newCommentCount: 0,
						hasVoteChanges: false,
						voteDelta: { upvotes: 0, downvotes: 0 },
					},
				],
			});
			const result = agent.formatContextPrompt(context, []);
			
			expect(result).toContain('## 你的最近帖子');
			expect(result).toContain('为什么大学食堂的番茄炒蛋永远是甜的');
			expect(result).toContain('25↑ 3↓');
			expect(result).toContain('有 2 条新评论');
			expect(result).toContain('跑团时 KP 说"你确定吗"是什么感觉');
			expect(result).toContain('18↑ 1↓');
		});

		it('没有新评论时不显示新评论标记', () => {
			const agent = createTestAgent();
			const context = createMockContext({
				recentPosts: [
					{
						post: createMockPost({ title: '测试帖子' }),
						hasNewComments: false,
						newCommentCount: 0,
						hasVoteChanges: false,
						voteDelta: { upvotes: 0, downvotes: 0 },
					},
				],
			});
			const result = agent.formatContextPrompt(context, []);
			
			// 帖子列表部分不应该有具体的新评论数量标记
			expect(result).not.toMatch(/🆕 有 \d+ 条新评论！/);
		});

		it('包含执行记录（增量累积）', () => {
			const agent = createTestAgent();
			const context = createMockContext();
			const actionHistory: ActionHistoryEntry[] = [
				{
					action: { action: 'VIEW_COMMENTS', params: { postId: 'post-123' } },
					result: '查看了帖子 "为什么大学食堂的番茄炒蛋永远是甜的" 的评论\n\n新评论列表：\n1. [comment-456] @FurryFan2024: "我们学校是咸的！南北差异实锤了"',
					timestamp: '2024-01-15T10:30:00Z',
				},
			];
			const result = agent.formatContextPrompt(context, actionHistory);
			
			expect(result).toContain('## 本次已执行的动作');
			expect(result).toContain('### 动作 1: VIEW_COMMENTS');
			expect(result).toContain('查看了帖子 "为什么大学食堂的番茄炒蛋永远是甜的" 的评论');
			expect(result).toContain('@FurryFan2024');
		});

		it('多个执行记录按顺序编号', () => {
			const agent = createTestAgent();
			const context = createMockContext();
			const actionHistory: ActionHistoryEntry[] = [
				{
					action: { action: 'VIEW_COMMENTS', params: { postId: 'post-123' } },
					result: '查看了评论',
					timestamp: '2024-01-15T10:30:00Z',
				},
				{
					action: { action: 'REPLY_COMMENT', params: { postId: 'post-123', commentId: 'comment-456', content: '回复内容' } },
					result: '✅ 成功回复了评论',
					timestamp: '2024-01-15T10:31:00Z',
				},
			];
			const result = agent.formatContextPrompt(context, actionHistory);
			
			expect(result).toContain('### 动作 1: VIEW_COMMENTS');
			expect(result).toContain('### 动作 2: REPLY_COMMENT');
		});

		it('空执行记录时不显示执行记录部分', () => {
			const agent = createTestAgent();
			const context = createMockContext();
			const result = agent.formatContextPrompt(context, []);
			
			expect(result).not.toContain('## 本次已执行的动作');
		});

		it('包含可执行的动作列表', () => {
			const agent = createTestAgent();
			const context = createMockContext();
			const result = agent.formatContextPrompt(context, []);
			
			expect(result).toContain('## 可执行的动作');
			expect(result).toContain('VIEW_COMMENTS');
			expect(result).toContain('REPLY_COMMENT');
			// CREATE_POST 已从社交循环移除，不在动作列表中
			expect(result).toContain('FOLLOW_USER');
			expect(result).toContain('UNFOLLOW_USER');
			expect(result).toContain('SUBSCRIBE');
			expect(result).toContain('UNSUBSCRIBE');
			expect(result).toContain('SEARCH');
			expect(result).toContain('VIEW_PROFILE');
			expect(result).toContain('DONE');
		});

		it('社交循环中不显示 CREATE_POST（发帖由 heartbeat 独立控制）', () => {
			const agent = createTestAgent();
			const context = createMockContext({ canPost: true });
			const result = agent.formatContextPrompt(context, []);
			
			// CREATE_POST 不应出现在社交循环的可用动作表中
			expect(result).not.toContain('| CREATE_POST |');
		});

		it('包含请求决策提示', () => {
			const agent = createTestAgent();
			const context = createMockContext();
			const result = agent.formatContextPrompt(context, []);
			
			expect(result).toContain('请决定下一步动作');
		});

		it('完整格式化示例与设计文档一致', () => {
			const agent = createTestAgent();
			const context = createMockContext({
				agentName: '小多（DominoJr）',
				karma: 156,
				postsCount: 12,
				followingCount: 5,
				followersCount: 23,
				canPost: false,
				nextPostAvailableIn: 15,
				recentPosts: [
					{
						post: createMockPost({ title: '为什么大学食堂的番茄炒蛋永远是甜的', upvotes: 25, downvotes: 3 }),
						hasNewComments: true,
						newCommentCount: 2,
						hasVoteChanges: false,
						voteDelta: { upvotes: 0, downvotes: 0 },
					},
					{
						post: createMockPost({ title: '跑团时 KP 说"你确定吗"是什么感觉', upvotes: 18, downvotes: 1 }),
						hasNewComments: false,
						newCommentCount: 0,
						hasVoteChanges: false,
						voteDelta: { upvotes: 0, downvotes: 0 },
					},
				],
			});
			const result = agent.formatContextPrompt(context, []);
			
			// 验证关键结构元素
			expect(result).toContain('小多（DominoJr）（小多）');
			expect(result).toContain('## 当前状态');
			expect(result).toContain('Karma: 156');
			expect(result).toContain('关注: 5 | 粉丝: 23');
			expect(result).toContain('还需等待 15 分钟');
			expect(result).toContain('## 你的最近帖子');
			expect(result).toContain('有 2 条新评论');
			expect(result).toContain('## 可执行的动作');
			expect(result).toContain('请决定下一步动作');
		});
	});

	describe('executeAction', () => {
		/**
		 * executeAction 测试
		 * 测试各种动作类型的参数验证和错误处理
		 * 
		 * _Requirements: 1.5_
		 */

		// 创建一个带有 mock client 和 interactionStore 的 agent
		function createAgentWithMocks(clientMocks: Record<string, unknown> = {}): YiMoltAgent {
			const agent = Object.create(YiMoltAgent.prototype);
			
			// Mock client
			agent.client = {
				getPostComments: clientMocks.getPostComments ?? (async () => ({ comments: [] })),
				getPost: clientMocks.getPost ?? (async () => ({ post: { id: 'p1', title: 'Test', content: 'Content', submolt: { name: 'general' } }, comments: [] })),
				replyToComment: clientMocks.replyToComment ?? (async () => ({ comment: { id: 'new-comment', content: 'reply' } })),
				followUser: clientMocks.followUser ?? (async () => ({ success: true })),
				unfollowUser: clientMocks.unfollowUser ?? (async () => ({ success: true })),
				subscribeSubmolt: clientMocks.subscribeSubmolt ?? (async () => ({ success: true })),
				unsubscribeSubmolt: clientMocks.unsubscribeSubmolt ?? (async () => ({ success: true })),
				semanticSearch: clientMocks.semanticSearch ?? (async () => ({ posts: [], comments: [] })),
				getMoltyProfile: clientMocks.getMoltyProfile ?? (async () => ({ profile: { id: '1', name: 'test', karma: 100, posts_count: 5, created_at: '2024-01-01' } })),
			};
			
			// Mock interactionStore
			agent.interactionStore = {
				isCommentReplied: () => false,
				markCommentReplied: () => {},
				isSpamUser: () => false,
				markAsSpam: () => {},
			};
			
			// Mock activityLog
			agent.activityLog = {
				startRun: () => 'test-run',
				logActivity: () => {},
				endRun: () => {},
			};
			
			// Mock createOriginalPost for CREATE_POST action
			agent.createOriginalPost = clientMocks.createOriginalPost ?? (async () => null);
			
			return agent;
		}

		describe('VIEW_COMMENTS', () => {
			it('缺少 postId 时返回错误信息', async () => {
				const agent = createAgentWithMocks();
				const result = await agent.executeAction({ action: 'VIEW_COMMENTS' });
				expect(result).toContain('❌');
				expect(result).toContain('postId');
			});

			it('成功获取评论时返回格式化的评论列表', async () => {
				const agent = createAgentWithMocks({
					getPostComments: async () => ({
						comments: [
							{ id: 'c1', content: '第一条评论', author: { name: 'User1' } },
							{ id: 'c2', content: '第二条评论', author: { name: 'User2' } },
						],
					}),
				});
				const result = await agent.executeAction({ action: 'VIEW_COMMENTS', params: { postId: 'post-123' } });
				expect(result).toContain('共 2 条评论');
				expect(result).toContain('@User1');
				expect(result).toContain('@User2');
			});

			it('没有评论时返回相应提示', async () => {
				const agent = createAgentWithMocks({
					getPostComments: async () => ({ comments: [] }),
				});
				const result = await agent.executeAction({ action: 'VIEW_COMMENTS', params: { postId: 'post-123' } });
				expect(result).toContain('暂无评论');
			});

			it('API 错误时返回错误信息', async () => {
				const agent = createAgentWithMocks({
					getPostComments: async () => { throw new Error('API 请求失败'); },
				});
				const result = await agent.executeAction({ action: 'VIEW_COMMENTS', params: { postId: 'post-123' } });
				expect(result).toContain('❌');
				expect(result).toContain('获取评论失败');
			});
		});

		describe('REPLY_COMMENT', () => {
			it('缺少 postId 时返回错误信息', async () => {
				const agent = createAgentWithMocks();
				const result = await agent.executeAction({ action: 'REPLY_COMMENT', params: { commentId: 'c1' } });
				expect(result).toContain('❌');
				expect(result).toContain('postId');
			});

			it('缺少 commentId 时返回错误信息', async () => {
				const agent = createAgentWithMocks();
				const result = await agent.executeAction({ action: 'REPLY_COMMENT', params: { postId: 'p1' } });
				expect(result).toContain('❌');
				expect(result).toContain('commentId');
			});

			it('成功回复时返回成功信息', async () => {
				const agent = createAgentWithMocks({
					getPostComments: async () => ({
						comments: [
							{ id: 'c1', content: '原始评论', author: { name: 'User1' } },
						],
					}),
					getPost: async () => ({
						post: {
							id: 'p1',
							title: '测试帖子',
							content: '帖子内容',
							submolt: { name: 'general' },
						},
					}),
					replyToComment: async () => ({ comment: { id: 'new-c', content: '测试回复内容' } }),
				});
				const result = await agent.executeAction({ 
					action: 'REPLY_COMMENT', 
					params: { postId: 'p1', commentId: 'c1', content: '测试回复内容' } 
				});
				expect(result).toContain('✅');
				expect(result).toContain('成功回复');
				expect(result).toContain('测试回复内容');
			});

			it('没有提供 content 时使用 AI 生成回复', async () => {
				const agent = createAgentWithMocks({
					getPostComments: async () => ({
						comments: [
							{ id: 'c1', content: '原始评论内容', author: { name: 'User1' } },
						],
					}),
					getPost: async () => ({
						post: {
							id: 'p1',
							title: '测试帖子',
							content: '帖子内容',
							submolt: { name: 'general' },
						},
					}),
					replyToComment: async () => ({ comment: { id: 'new-c', content: 'AI 生成的回复' } }),
				});
				
				// Mock AI provider
				agent.ai = {
					generateResponse: async () => 'AI 生成的回复',
				};
				
				const result = await agent.executeAction({ 
					action: 'REPLY_COMMENT', 
					params: { postId: 'p1', commentId: 'c1' }  // 没有提供 content
				});
				
				expect(result).toContain('✅');
				expect(result).toContain('成功回复');
				expect(result).toContain('AI 生成的回复');
			});

			it('找不到评论时返回错误信息', async () => {
				const agent = createAgentWithMocks({
					getPostComments: async () => ({
						comments: [
							{ id: 'other-comment', content: '其他评论', author: { name: 'User1' } },
						],
					}),
				});
				
				const result = await agent.executeAction({ 
					action: 'REPLY_COMMENT', 
					params: { postId: 'p1', commentId: 'nonexistent' }  // 没有提供 content，且评论不存在
				});
				
				expect(result).toContain('❌');
				expect(result).toContain('找不到评论');
			});

			it('API 错误时返回错误信息', async () => {
				const agent = createAgentWithMocks({
					getPostComments: async () => ({
						comments: [
							{ id: 'c1', content: '原始评论', author: { name: 'User1' } },
						],
					}),
					getPost: async () => ({
						post: {
							id: 'p1',
							title: '测试帖子',
							content: '帖子内容',
							submolt: { name: 'general' },
						},
					}),
					replyToComment: async () => { throw new Error('回复失败'); },
				});
				const result = await agent.executeAction({ 
					action: 'REPLY_COMMENT', 
					params: { postId: 'p1', commentId: 'c1', content: '内容' } 
				});
				expect(result).toContain('❌');
				expect(result).toContain('回复评论失败');
			});
		});

		describe('FOLLOW_USER', () => {
			it('缺少 username 时返回错误信息', async () => {
				const agent = createAgentWithMocks();
				const result = await agent.executeAction({ action: 'FOLLOW_USER' });
				expect(result).toContain('❌');
				expect(result).toContain('username');
			});

			it('成功关注时返回成功信息', async () => {
				const agent = createAgentWithMocks({
					followUser: async () => ({ success: true }),
				});
				const result = await agent.executeAction({ action: 'FOLLOW_USER', params: { username: 'testuser' } });
				expect(result).toContain('✅');
				expect(result).toContain('关注');
				expect(result).toContain('@testuser');
			});

			it('关注失败时返回失败信息', async () => {
				const agent = createAgentWithMocks({
					followUser: async () => ({ success: false }),
				});
				const result = await agent.executeAction({ action: 'FOLLOW_USER', params: { username: 'testuser' } });
				expect(result).toContain('❌');
				expect(result).toContain('失败');
			});
		});

		describe('UNFOLLOW_USER', () => {
			it('缺少 username 时返回错误信息', async () => {
				const agent = createAgentWithMocks();
				const result = await agent.executeAction({ action: 'UNFOLLOW_USER' });
				expect(result).toContain('❌');
				expect(result).toContain('username');
			});

			it('成功取关时返回成功信息', async () => {
				const agent = createAgentWithMocks({
					unfollowUser: async () => ({ success: true }),
				});
				const result = await agent.executeAction({ action: 'UNFOLLOW_USER', params: { username: 'testuser' } });
				expect(result).toContain('✅');
				expect(result).toContain('取关');
				expect(result).toContain('@testuser');
			});
		});

		describe('SUBSCRIBE', () => {
			it('缺少 submolt 时返回错误信息', async () => {
				const agent = createAgentWithMocks();
				const result = await agent.executeAction({ action: 'SUBSCRIBE' });
				expect(result).toContain('❌');
				expect(result).toContain('submolt');
			});

			it('成功订阅时返回成功信息', async () => {
				const agent = createAgentWithMocks({
					subscribeSubmolt: async () => ({ success: true }),
				});
				const result = await agent.executeAction({ action: 'SUBSCRIBE', params: { submolt: 'general' } });
				expect(result).toContain('✅');
				expect(result).toContain('订阅');
				expect(result).toContain('m/general');
			});
		});

		describe('UNSUBSCRIBE', () => {
			it('缺少 submolt 时返回错误信息', async () => {
				const agent = createAgentWithMocks();
				const result = await agent.executeAction({ action: 'UNSUBSCRIBE' });
				expect(result).toContain('❌');
				expect(result).toContain('submolt');
			});

			it('成功取消订阅时返回成功信息', async () => {
				const agent = createAgentWithMocks({
					unsubscribeSubmolt: async () => ({ success: true }),
				});
				const result = await agent.executeAction({ action: 'UNSUBSCRIBE', params: { submolt: 'general' } });
				expect(result).toContain('✅');
				expect(result).toContain('取消订阅');
				expect(result).toContain('m/general');
			});
		});

		describe('SEARCH', () => {
			it('缺少 query 时返回错误信息', async () => {
				const agent = createAgentWithMocks();
				const result = await agent.executeAction({ action: 'SEARCH' });
				expect(result).toContain('❌');
				expect(result).toContain('query');
			});

			it('搜索到帖子时返回格式化结果', async () => {
				const agent = createAgentWithMocks({
					semanticSearch: async () => ({
						posts: [
							{ title: '测试帖子', author: { name: 'Author1' }, upvotes: 10 },
						],
						comments: [],
					}),
				});
				const result = await agent.executeAction({ action: 'SEARCH', params: { query: '测试' } });
				expect(result).toContain('搜索 "测试" 的结果');
				expect(result).toContain('相关帖子');
				expect(result).toContain('测试帖子');
				expect(result).toContain('@Author1');
			});

			it('搜索到评论时返回格式化结果', async () => {
				const agent = createAgentWithMocks({
					semanticSearch: async () => ({
						posts: [],
						comments: [
							{ content: '这是一条测试评论', author: { name: 'Commenter1' } },
						],
					}),
				});
				const result = await agent.executeAction({ action: 'SEARCH', params: { query: '测试' } });
				expect(result).toContain('相关评论');
				expect(result).toContain('@Commenter1');
			});

			it('无搜索结果时返回相应提示', async () => {
				const agent = createAgentWithMocks({
					semanticSearch: async () => ({ posts: [], comments: [] }),
				});
				const result = await agent.executeAction({ action: 'SEARCH', params: { query: '不存在的内容' } });
				expect(result).toContain('未找到相关内容');
			});
		});

		describe('VIEW_PROFILE', () => {
			it('缺少 username 时返回错误信息', async () => {
				const agent = createAgentWithMocks();
				const result = await agent.executeAction({ action: 'VIEW_PROFILE' });
				expect(result).toContain('❌');
				expect(result).toContain('username');
			});

			it('成功获取资料时返回格式化信息', async () => {
				const agent = createAgentWithMocks({
					getMoltyProfile: async () => ({
						profile: {
							id: '1',
							name: 'TestUser',
							karma: 500,
							posts_count: 25,
							created_at: '2024-01-01T00:00:00Z',
							bio: '这是我的简介',
						},
					}),
				});
				const result = await agent.executeAction({ action: 'VIEW_PROFILE', params: { username: 'TestUser' } });
				expect(result).toContain('@TestUser');
				expect(result).toContain('Karma: 500');
				expect(result).toContain('帖子数: 25');
				expect(result).toContain('简介: 这是我的简介');
			});

			it('用户不存在时返回错误信息', async () => {
				const agent = createAgentWithMocks({
					getMoltyProfile: async () => { throw new Error('用户不存在'); },
				});
				const result = await agent.executeAction({ action: 'VIEW_PROFILE', params: { username: 'nonexistent' } });
				expect(result).toContain('❌');
				expect(result).toContain('获取用户资料失败');
			});
		});

		describe('CREATE_POST', () => {
			it('拦截在互动循环中触发的发帖请求', async () => {
			const agent = createAgentWithMocks();
			const result = await agent.executeAction({
				action: 'CREATE_POST',
				params: { submolt: 'general' }
			});
			expect(result).toContain('✅ 发帖请求已记录');
			expect(result).toContain('不再在此处执行');
		});
		});

		describe('DONE', () => {
			it('返回完成信息', async () => {
				const agent = createAgentWithMocks();
				const result = await agent.executeAction({ action: 'DONE' });
				expect(result).toContain('完成');
			});
		});

		describe('未知动作类型', () => {
			it('返回错误信息', async () => {
				const agent = createAgentWithMocks();
				const result = await agent.executeAction({ action: 'UNKNOWN_ACTION' as ActionRequest['action'] });
				expect(result).toContain('❌');
				expect(result).toContain('未知动作类型');
			});
		});
	});

	describe('generateCommentReply', () => {
		/**
		 * generateCommentReply 测试
		 * 测试评论回复生成功能
		 * 
		 * _Requirements: 3.5_
		 */

		// 创建一个带有 mock AI provider 的 agent
		function createAgentWithAIMock(aiResponse: string): YiMoltAgent {
			const agent = Object.create(YiMoltAgent.prototype);
			
			// Mock AI provider
			agent.ai = {
				generateResponse: async () => aiResponse,
			};
			
			return agent;
		}

		it('生成的回复内容来自 AI 响应', async () => {
			const agent = createAgentWithAIMock('这是一个测试回复内容');
			
			const comment = {
				id: 'comment-123',
				content: '这是一条测试评论',
				upvotes: 5,
				downvotes: 0,
				created_at: '2024-01-15T10:30:00Z',
				author: { id: 'user-1', name: 'TestUser' },
			};
			
			const post = {
				id: 'post-123',
				title: '测试帖子标题',
				content: '测试帖子内容',
				upvotes: 10,
				downvotes: 2,
				comment_count: 5,
				created_at: '2024-01-15T10:00:00Z',
				author: { id: 'author-1', name: 'PostAuthor' },
				submolt: { name: 'general' },
			};
			
			const result = await agent.generateCommentReply(comment, post);
			
			expect(result).toBe('这是一个测试回复内容');
		});

		it('清理 AI 响应中的前缀标记', async () => {
			const agent = createAgentWithAIMock('回复: 这是清理后的回复内容');
			
			const comment = {
				id: 'comment-123',
				content: '测试评论',
				upvotes: 0,
				downvotes: 0,
				created_at: '2024-01-15T10:30:00Z',
				author: { id: 'user-1', name: 'TestUser' },
			};
			
			const post = {
				id: 'post-123',
				title: '测试帖子',
				content: '内容',
				upvotes: 0,
				downvotes: 0,
				comment_count: 1,
				created_at: '2024-01-15T10:00:00Z',
				author: { id: 'author-1', name: 'Author' },
				submolt: { name: 'general' },
			};
			
			const result = await agent.generateCommentReply(comment, post);
			
			// 应该移除 "回复:" 前缀
			expect(result).toBe('这是清理后的回复内容');
		});

		it('处理匿名用户评论', async () => {
			const agent = createAgentWithAIMock('回复匿名用户的内容');
			
			const comment = {
				id: 'comment-123',
				content: '匿名评论',
				upvotes: 0,
				downvotes: 0,
				created_at: '2024-01-15T10:30:00Z',
				// author 为 undefined 或 null
			} as any;
			
			const post = {
				id: 'post-123',
				title: '测试帖子',
				content: '内容',
				upvotes: 0,
				downvotes: 0,
				comment_count: 1,
				created_at: '2024-01-15T10:00:00Z',
				author: { id: 'author-1', name: 'Author' },
				submolt: { name: 'general' },
			};
			
			// 不应该抛出错误
			const result = await agent.generateCommentReply(comment, post);
			expect(result).toBe('回复匿名用户的内容');
		});

		it('去除响应前后的空白字符', async () => {
			const agent = createAgentWithAIMock('  \n  回复内容  \n  ');
			
			const comment = {
				id: 'comment-123',
				content: '测试评论',
				upvotes: 0,
				downvotes: 0,
				created_at: '2024-01-15T10:30:00Z',
				author: { id: 'user-1', name: 'TestUser' },
			};
			
			const post = {
				id: 'post-123',
				title: '测试帖子',
				content: '内容',
				upvotes: 0,
				downvotes: 0,
				comment_count: 1,
				created_at: '2024-01-15T10:00:00Z',
				author: { id: 'author-1', name: 'Author' },
				submolt: { name: 'general' },
			};
			
			const result = await agent.generateCommentReply(comment, post);
			
			expect(result).toBe('回复内容');
		});
	});
});
