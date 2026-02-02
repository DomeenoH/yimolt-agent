/**
 * ActionParser 单元测试
 * 验证 AI 响应解析的基本功能
 */

import { describe, it, expect } from 'vitest';
import { parseActionResponse, ActionRequest, ActionType } from './action-parser.js';

describe('parseActionResponse', () => {
  describe('Basic Parsing', () => {
    it('should parse a complete valid response', () => {
      const response = `ACTION: VIEW_COMMENTS
PARAMS: {"postId": "post-123"}
REASON: 有 2 条新评论，先看看大家说了什么`;

      const result = parseActionResponse(response);

      expect(result).toEqual({
        action: 'VIEW_COMMENTS',
        params: { postId: 'post-123' },
        reason: '有 2 条新评论，先看看大家说了什么',
      });
    });

    it('should parse response with only ACTION', () => {
      const response = 'ACTION: DONE';

      const result = parseActionResponse(response);

      expect(result).toEqual({ action: 'DONE' });
    });

    it('should parse response with ACTION and PARAMS only', () => {
      const response = `ACTION: FOLLOW_USER
PARAMS: {"username": "FurryFan2024"}`;

      const result = parseActionResponse(response);

      expect(result).toEqual({
        action: 'FOLLOW_USER',
        params: { username: 'FurryFan2024' },
      });
    });

    it('should parse response with ACTION and REASON only', () => {
      const response = `ACTION: DONE
REASON: 新评论都回复完了，发帖还在冷却，这次就到这里吧`;

      const result = parseActionResponse(response);

      expect(result).toEqual({
        action: 'DONE',
        reason: '新评论都回复完了，发帖还在冷却，这次就到这里吧',
      });
    });
  });

  describe('All Action Types', () => {
    const actionTypes: ActionType[] = [
      'VIEW_COMMENTS',
      'REPLY_COMMENT',
      'CREATE_POST',
      'FOLLOW_USER',
      'UNFOLLOW_USER',
      'SUBSCRIBE',
      'UNSUBSCRIBE',
      'SEARCH',
      'VIEW_PROFILE',
      'DONE',
    ];

    actionTypes.forEach((actionType) => {
      it(`should parse ${actionType} action`, () => {
        const response = `ACTION: ${actionType}`;
        const result = parseActionResponse(response);
        expect(result.action).toBe(actionType);
      });
    });
  });

  describe('PARAMS Parsing', () => {
    it('should parse REPLY_COMMENT params', () => {
      const response = `ACTION: REPLY_COMMENT
PARAMS: {"postId": "post-123", "commentId": "comment-456", "content": "这是回复内容"}`;

      const result = parseActionResponse(response);

      expect(result.params).toEqual({
        postId: 'post-123',
        commentId: 'comment-456',
        content: '这是回复内容',
      });
    });

    it('should parse SEARCH params with searchType', () => {
      const response = `ACTION: SEARCH
PARAMS: {"query": "番茄炒蛋", "searchType": "posts"}`;

      const result = parseActionResponse(response);

      expect(result.params).toEqual({
        query: '番茄炒蛋',
        searchType: 'posts',
      });
    });

    it('should parse SUBSCRIBE params', () => {
      const response = `ACTION: SUBSCRIBE
PARAMS: {"submolt": "furry"}`;

      const result = parseActionResponse(response);

      expect(result.params).toEqual({ submolt: 'furry' });
    });

    it('should handle empty PARAMS object', () => {
      const response = `ACTION: DONE
PARAMS: {}`;

      const result = parseActionResponse(response);

      expect(result.params).toEqual({});
    });
  });

  describe('Error Handling', () => {
    it('should return DONE for empty string', () => {
      const result = parseActionResponse('');
      expect(result).toEqual({ action: 'DONE' });
    });

    it('should return DONE for null input', () => {
      const result = parseActionResponse(null as unknown as string);
      expect(result).toEqual({ action: 'DONE' });
    });

    it('should return DONE for undefined input', () => {
      const result = parseActionResponse(undefined as unknown as string);
      expect(result).toEqual({ action: 'DONE' });
    });

    it('should return DONE for non-string input', () => {
      const result = parseActionResponse(123 as unknown as string);
      expect(result).toEqual({ action: 'DONE' });
    });

    it('should return DONE for response without ACTION line', () => {
      const response = `PARAMS: {"postId": "post-123"}
REASON: 没有 ACTION 行`;

      const result = parseActionResponse(response);

      expect(result).toEqual({ action: 'DONE' });
    });

    it('should return DONE for unknown action type', () => {
      const response = 'ACTION: UNKNOWN_ACTION';
      const result = parseActionResponse(response);
      expect(result).toEqual({ action: 'DONE' });
    });

    it('should return DONE for malformed ACTION line', () => {
      const response = 'ACTION:';
      const result = parseActionResponse(response);
      expect(result).toEqual({ action: 'DONE' });
    });

    it('should ignore invalid PARAMS JSON', () => {
      const response = `ACTION: VIEW_COMMENTS
PARAMS: {invalid json}`;

      const result = parseActionResponse(response);

      expect(result).toEqual({ action: 'VIEW_COMMENTS' });
    });

    it('should ignore PARAMS that is not an object', () => {
      const response = `ACTION: VIEW_COMMENTS
PARAMS: "string value"`;

      const result = parseActionResponse(response);

      expect(result).toEqual({ action: 'VIEW_COMMENTS' });
    });

    it('should ignore PARAMS that is an array', () => {
      const response = `ACTION: VIEW_COMMENTS
PARAMS: ["item1", "item2"]`;

      const result = parseActionResponse(response);

      expect(result).toEqual({ action: 'VIEW_COMMENTS' });
    });

    it('should ignore empty REASON', () => {
      const response = `ACTION: DONE
REASON:   `;

      const result = parseActionResponse(response);

      expect(result).toEqual({ action: 'DONE' });
    });
  });

  describe('Whitespace Handling', () => {
    it('should handle extra whitespace around ACTION', () => {
      const response = 'ACTION:   VIEW_COMMENTS  ';
      const result = parseActionResponse(response);
      expect(result.action).toBe('VIEW_COMMENTS');
    });

    it('should handle extra whitespace around PARAMS', () => {
      const response = `ACTION: VIEW_COMMENTS
PARAMS:   {"postId": "post-123"}  `;

      const result = parseActionResponse(response);

      expect(result.params).toEqual({ postId: 'post-123' });
    });

    it('should handle extra whitespace around REASON', () => {
      const response = `ACTION: DONE
REASON:   这是原因   `;

      const result = parseActionResponse(response);

      expect(result.reason).toBe('这是原因');
    });

    it('should handle response with extra blank lines', () => {
      const response = `
ACTION: VIEW_COMMENTS

PARAMS: {"postId": "post-123"}

REASON: 查看评论
`;

      const result = parseActionResponse(response);

      expect(result).toEqual({
        action: 'VIEW_COMMENTS',
        params: { postId: 'post-123' },
        reason: '查看评论',
      });
    });
  });

  describe('Case Sensitivity', () => {
    it('should handle lowercase action type', () => {
      const response = 'ACTION: view_comments';
      const result = parseActionResponse(response);
      expect(result.action).toBe('VIEW_COMMENTS');
    });

    it('should handle mixed case action type', () => {
      const response = 'ACTION: View_Comments';
      const result = parseActionResponse(response);
      expect(result.action).toBe('VIEW_COMMENTS');
    });
  });

  describe('Complex Scenarios', () => {
    it('should parse response with Chinese content in params', () => {
      const response = `ACTION: REPLY_COMMENT
PARAMS: {"postId": "post-123", "commentId": "comment-456", "content": "咸的？？你们学校食堂是不是穿越了"}
REASON: 这条评论很有互动性，可以接梗`;

      const result = parseActionResponse(response);

      expect(result).toEqual({
        action: 'REPLY_COMMENT',
        params: {
          postId: 'post-123',
          commentId: 'comment-456',
          content: '咸的？？你们学校食堂是不是穿越了',
        },
        reason: '这条评论很有互动性，可以接梗',
      });
    });

    it('should parse response with special characters in content', () => {
      const response = `ACTION: CREATE_POST
PARAMS: {"submolt": "furry", "content": "Hello! @user #tag 😀"}
REASON: 发个新帖子`;

      const result = parseActionResponse(response);

      expect(result.params?.content).toBe('Hello! @user #tag 😀');
    });

    it('should handle response with additional text before ACTION', () => {
      const response = `让我想想...
ACTION: DONE
REASON: 完成了`;

      const result = parseActionResponse(response);

      expect(result).toEqual({
        action: 'DONE',
        reason: '完成了',
      });
    });

    it('should handle response with additional text after REASON', () => {
      const response = `ACTION: VIEW_COMMENTS
PARAMS: {"postId": "post-123"}
REASON: 查看评论
希望能有有趣的内容`;

      const result = parseActionResponse(response);

      expect(result.reason).toBe('查看评论');
    });
  });
});
