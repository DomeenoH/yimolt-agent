/**
 * PostHistoryStore 属性测试
 * 使用 fast-check 进行属性测试验证
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { PostHistoryStore } from './history-store.js';

describe('PostHistoryStore Property Tests', () => {
  let tempDir: string;
  let tempFilePath: string;

  beforeEach(() => {
    // 创建临时目录用于测试
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'history-store-test-'));
    tempFilePath = path.join(tempDir, 'test-history.json');
  });

  afterEach(() => {
    // 清理临时文件和目录
    try {
      if (fs.existsSync(tempFilePath)) {
        fs.unlinkSync(tempFilePath);
      }
      if (fs.existsSync(tempDir)) {
        fs.rmdirSync(tempDir);
      }
    } catch {
      // 忽略清理错误
    }
  });

  /**
   * Property 1: 历史存储 Round-Trip
   * 对于任意帖子标题，保存到 History_Store 后再读取，应该能够获取到包含该标题的记录。
   * 
   * **Validates: Requirements 1.1, 1.4**
   */
  it('Property 1: 历史存储 Round-Trip - **Validates: Requirements 1.1, 1.4**', () => {
    fc.assert(
      fc.property(
        // 生成任意非空字符串作为帖子标题
        fc.string({ minLength: 1, maxLength: 200 }),
        (title) => {
          // 创建新的 store 实例（使用临时文件）
          const store = new PostHistoryStore(tempFilePath);
          
          // 保存记录
          store.addRecord(title);
          
          // 读取历史记录（获取足够多的记录以确保能找到）
          const history = store.getRecentHistory(100);
          
          // 验证：历史记录中应该包含刚保存的标题
          const foundRecord = history.find(record => record.title === title);
          expect(foundRecord).toBeDefined();
          expect(foundRecord?.title).toBe(title);
          
          // 清理文件以便下次迭代
          if (fs.existsSync(tempFilePath)) {
            fs.unlinkSync(tempFilePath);
          }
          
          return true;
        }
      ),
      { numRuns: 20 }
    );
  });

  /**
   * Property 2: 历史数量限制
   * 对于任意正整数 N 和任意长度的历史记录列表，getRecentHistory(N) 返回的记录数应该等于 min(N, 总记录数)。
   * 
   * **Validates: Requirements 1.2**
   */
  it('Property 2: 历史数量限制 - **Validates: Requirements 1.2**', () => {
    fc.assert(
      fc.property(
        // 生成任意长度的标题列表（0-50 条）
        fc.array(fc.string({ minLength: 1, maxLength: 100 }), { minLength: 0, maxLength: 50 }),
        // 生成任意正整数 N（1-100）
        fc.integer({ min: 1, max: 100 }),
        (titles, limit) => {
          // 创建新的 store 实例（使用临时文件）
          const store = new PostHistoryStore(tempFilePath);
          
          // 添加所有标题到历史记录
          for (const title of titles) {
            store.addRecord(title);
          }
          
          // 获取最近 N 条记录
          const history = store.getRecentHistory(limit);
          
          // 验证：返回的记录数应该等于 min(N, 总记录数)
          const expectedCount = Math.min(limit, titles.length);
          expect(history.length).toBe(expectedCount);
          
          // 清理文件以便下次迭代
          if (fs.existsSync(tempFilePath)) {
            fs.unlinkSync(tempFilePath);
          }
          
          return true;
        }
      ),
      { numRuns: 20 }
    );
  });
});
