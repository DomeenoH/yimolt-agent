/**
 * InteractionStore 单元测试
 * 验证交互状态存储的基本功能
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { InteractionStore, PostSnapshot } from './interaction-store.js';

describe('InteractionStore', () => {
  let tempDir: string;
  let tempFilePath: string;

  beforeEach(() => {
    // 创建临时目录用于测试
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'interaction-store-test-'));
    tempFilePath = path.join(tempDir, 'test-interaction-state.json');
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

  describe('Comment Reply Tracking', () => {
    it('should return false for unreplied comment', () => {
      const store = new InteractionStore(tempFilePath);
      expect(store.isCommentReplied('comment-123')).toBe(false);
    });

    it('should return true after marking comment as replied', () => {
      const store = new InteractionStore(tempFilePath);
      store.markCommentReplied('comment-123');
      expect(store.isCommentReplied('comment-123')).toBe(true);
    });

    it('should persist replied comments across instances', () => {
      const store1 = new InteractionStore(tempFilePath);
      store1.markCommentReplied('comment-456');

      const store2 = new InteractionStore(tempFilePath);
      expect(store2.isCommentReplied('comment-456')).toBe(true);
    });

    it('should not duplicate comment IDs when marking same comment twice', () => {
      const store = new InteractionStore(tempFilePath);
      store.markCommentReplied('comment-789');
      store.markCommentReplied('comment-789');

      // Read the file directly to verify no duplicates
      const data = JSON.parse(fs.readFileSync(tempFilePath, 'utf-8'));
      const count = data.repliedCommentIds.filter((id: string) => id === 'comment-789').length;
      expect(count).toBe(1);
    });
  });

  describe('Post Snapshot Management', () => {
    it('should return undefined for unknown post', () => {
      const store = new InteractionStore(tempFilePath);
      expect(store.getPostSnapshot('unknown-post')).toBeUndefined();
    });

    it('should store and retrieve post snapshot', () => {
      const store = new InteractionStore(tempFilePath);
      const snapshot: PostSnapshot = {
        postId: 'post-123',
        commentCount: 5,
        upvotes: 10,
        downvotes: 2,
        lastChecked: '2024-01-15T10:30:00Z',
      };

      store.updatePostSnapshot(snapshot);
      const retrieved = store.getPostSnapshot('post-123');

      expect(retrieved).toEqual(snapshot);
    });

    it('should update existing post snapshot', () => {
      const store = new InteractionStore(tempFilePath);
      const snapshot1: PostSnapshot = {
        postId: 'post-123',
        commentCount: 5,
        upvotes: 10,
        downvotes: 2,
        lastChecked: '2024-01-15T10:30:00Z',
      };
      const snapshot2: PostSnapshot = {
        postId: 'post-123',
        commentCount: 8,
        upvotes: 15,
        downvotes: 3,
        lastChecked: '2024-01-15T11:00:00Z',
      };

      store.updatePostSnapshot(snapshot1);
      store.updatePostSnapshot(snapshot2);

      const retrieved = store.getPostSnapshot('post-123');
      expect(retrieved).toEqual(snapshot2);

      // Verify only one snapshot exists
      const data = JSON.parse(fs.readFileSync(tempFilePath, 'utf-8'));
      expect(data.postSnapshots.length).toBe(1);
    });

    it('should persist post snapshots across instances', () => {
      const snapshot: PostSnapshot = {
        postId: 'post-456',
        commentCount: 3,
        upvotes: 7,
        downvotes: 1,
        lastChecked: '2024-01-15T12:00:00Z',
      };

      const store1 = new InteractionStore(tempFilePath);
      store1.updatePostSnapshot(snapshot);

      const store2 = new InteractionStore(tempFilePath);
      expect(store2.getPostSnapshot('post-456')).toEqual(snapshot);
    });
  });

  describe('New Comments Detection', () => {
    it('should detect new comments when no snapshot exists and count > 0', () => {
      const store = new InteractionStore(tempFilePath);
      expect(store.hasNewComments('post-123', 5)).toBe(true);
    });

    it('should not detect new comments when no snapshot exists and count is 0', () => {
      const store = new InteractionStore(tempFilePath);
      expect(store.hasNewComments('post-123', 0)).toBe(false);
    });

    it('should detect new comments when count increased', () => {
      const store = new InteractionStore(tempFilePath);
      store.updatePostSnapshot({
        postId: 'post-123',
        commentCount: 5,
        upvotes: 10,
        downvotes: 2,
        lastChecked: '2024-01-15T10:30:00Z',
      });

      expect(store.hasNewComments('post-123', 8)).toBe(true);
    });

    it('should not detect new comments when count unchanged', () => {
      const store = new InteractionStore(tempFilePath);
      store.updatePostSnapshot({
        postId: 'post-123',
        commentCount: 5,
        upvotes: 10,
        downvotes: 2,
        lastChecked: '2024-01-15T10:30:00Z',
      });

      expect(store.hasNewComments('post-123', 5)).toBe(false);
    });

    it('should not detect new comments when count decreased', () => {
      const store = new InteractionStore(tempFilePath);
      store.updatePostSnapshot({
        postId: 'post-123',
        commentCount: 5,
        upvotes: 10,
        downvotes: 2,
        lastChecked: '2024-01-15T10:30:00Z',
      });

      expect(store.hasNewComments('post-123', 3)).toBe(false);
    });
  });

  describe('Vote Changes Detection', () => {
    it('should detect vote changes when no snapshot exists and votes > 0', () => {
      const store = new InteractionStore(tempFilePath);
      expect(store.hasVoteChanges('post-123', 5, 1)).toBe(true);
    });

    it('should not detect vote changes when no snapshot exists and votes are 0', () => {
      const store = new InteractionStore(tempFilePath);
      expect(store.hasVoteChanges('post-123', 0, 0)).toBe(false);
    });

    it('should detect vote changes when upvotes changed', () => {
      const store = new InteractionStore(tempFilePath);
      store.updatePostSnapshot({
        postId: 'post-123',
        commentCount: 5,
        upvotes: 10,
        downvotes: 2,
        lastChecked: '2024-01-15T10:30:00Z',
      });

      expect(store.hasVoteChanges('post-123', 15, 2)).toBe(true);
    });

    it('should detect vote changes when downvotes changed', () => {
      const store = new InteractionStore(tempFilePath);
      store.updatePostSnapshot({
        postId: 'post-123',
        commentCount: 5,
        upvotes: 10,
        downvotes: 2,
        lastChecked: '2024-01-15T10:30:00Z',
      });

      expect(store.hasVoteChanges('post-123', 10, 5)).toBe(true);
    });

    it('should not detect vote changes when votes unchanged', () => {
      const store = new InteractionStore(tempFilePath);
      store.updatePostSnapshot({
        postId: 'post-123',
        commentCount: 5,
        upvotes: 10,
        downvotes: 2,
        lastChecked: '2024-01-15T10:30:00Z',
      });

      expect(store.hasVoteChanges('post-123', 10, 2)).toBe(false);
    });
  });

  describe('Error Handling', () => {
    it('should return empty data when file does not exist', () => {
      const store = new InteractionStore(tempFilePath);
      expect(store.isCommentReplied('any-comment')).toBe(false);
      expect(store.getPostSnapshot('any-post')).toBeUndefined();
    });

    it('should return empty data when file contains invalid JSON', () => {
      fs.writeFileSync(tempFilePath, 'invalid json content', 'utf-8');
      const store = new InteractionStore(tempFilePath);
      expect(store.isCommentReplied('any-comment')).toBe(false);
      expect(store.getPostSnapshot('any-post')).toBeUndefined();
    });

    it('should return empty data when file contains invalid structure', () => {
      fs.writeFileSync(tempFilePath, JSON.stringify({ foo: 'bar' }), 'utf-8');
      const store = new InteractionStore(tempFilePath);
      expect(store.isCommentReplied('any-comment')).toBe(false);
      expect(store.getPostSnapshot('any-post')).toBeUndefined();
    });
  });
});
