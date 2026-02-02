/**
 * YiMoltAgent 单元测试和属性测试
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { YiMoltAgent } from './agent.js';
import type { PostHistoryRecord } from './history-store.js';

// 创建一个最小化的 mock agent 用于测试 formatHistoryContext
function createTestAgent(): YiMoltAgent {
	// 使用 any 来绕过构造函数的依赖
	const agent = Object.create(YiMoltAgent.prototype);
	return agent;
}

describe('YiMoltAgent', () => {
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
			const postHistoryRecordArb = fc.record({
				title: fc.string({ minLength: 1, maxLength: 100 }),
				createdAt: fc.date().map(d => d.toISOString()),
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
});
