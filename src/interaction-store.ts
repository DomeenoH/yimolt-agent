/**
 * 交互状态存储模块
 * 用于追踪 MoltBook Agent 的社交互动状态
 */

import fs from 'node:fs';
import path from 'node:path';

/**
 * 帖子状态快照接口
 */
export interface PostSnapshot {
  postId: string;
  commentCount: number;
  upvotes: number;
  downvotes: number;
  lastChecked: string;  // ISO 8601 格式
}

/**
 * 交互数据接口
 */
export interface InteractionData {
  repliedCommentIds: string[];      // 已回复的评论 ID
  postSnapshots: PostSnapshot[];    // 帖子状态快照
}

/**
 * 交互状态存储类
 * 负责追踪已处理的评论和帖子状态变化
 */
export class InteractionStore {
  private filePath: string;
  private data: InteractionData;

  /**
   * 创建 InteractionStore 实例
   * @param filePath 存储文件路径，默认为 data/interaction-state.json
   */
  constructor(filePath?: string) {
    this.filePath = filePath ?? path.join('data', 'interaction-state.json');
    this.data = this.loadData();
  }

  /**
   * 从文件加载数据
   * @returns 交互数据，文件不存在或解析失败时返回空数据
   */
  private loadData(): InteractionData {
    try {
      if (!fs.existsSync(this.filePath)) {
        return this.getEmptyData();
      }

      const fileContent = fs.readFileSync(this.filePath, 'utf-8');
      const parsed = JSON.parse(fileContent);

      // 验证数据结构
      if (
        parsed &&
        Array.isArray(parsed.repliedCommentIds) &&
        Array.isArray(parsed.postSnapshots)
      ) {
        return parsed as InteractionData;
      }

      return this.getEmptyData();
    } catch {
      // 文件不存在或解析失败，返回空数据
      return this.getEmptyData();
    }
  }

  /**
   * 获取空的交互数据
   */
  private getEmptyData(): InteractionData {
    return {
      repliedCommentIds: [],
      postSnapshots: [],
    };
  }

  /**
   * 保存数据到文件
   */
  private saveData(): void {
    try {
      // 确保目录存在
      const dir = path.dirname(this.filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      // 写入文件
      fs.writeFileSync(this.filePath, JSON.stringify(this.data, null, 2), 'utf-8');
    } catch (error) {
      // 记录错误日志，不中断主流程
      console.error('Failed to save interaction data:', error);
    }
  }

  /**
   * 检查评论是否已回复
   * @param commentId 评论 ID
   * @returns 是否已回复
   */
  isCommentReplied(commentId: string): boolean {
    return this.data.repliedCommentIds.includes(commentId);
  }

  /**
   * 标记评论为已回复
   * @param commentId 评论 ID
   */
  markCommentReplied(commentId: string): void {
    if (!this.data.repliedCommentIds.includes(commentId)) {
      this.data.repliedCommentIds.push(commentId);
      this.saveData();
    }
  }

  /**
   * 获取帖子快照
   * @param postId 帖子 ID
   * @returns 帖子快照，不存在时返回 undefined
   */
  getPostSnapshot(postId: string): PostSnapshot | undefined {
    return this.data.postSnapshots.find(snapshot => snapshot.postId === postId);
  }

  /**
   * 更新帖子快照
   * @param snapshot 帖子快照
   */
  updatePostSnapshot(snapshot: PostSnapshot): void {
    const index = this.data.postSnapshots.findIndex(s => s.postId === snapshot.postId);
    if (index >= 0) {
      this.data.postSnapshots[index] = snapshot;
    } else {
      this.data.postSnapshots.push(snapshot);
    }
    this.saveData();
  }

  /**
   * 检测帖子是否有新评论
   * @param postId 帖子 ID
   * @param currentCount 当前评论数
   * @returns 是否有新评论
   */
  hasNewComments(postId: string, currentCount: number): boolean {
    const snapshot = this.getPostSnapshot(postId);
    if (!snapshot) {
      // 没有快照，如果有评论则认为是新的
      return currentCount > 0;
    }
    return currentCount > snapshot.commentCount;
  }

  /**
   * 检测帖子是否有新 vote
   * @param postId 帖子 ID
   * @param currentUpvotes 当前 upvotes 数
   * @param currentDownvotes 当前 downvotes 数
   * @returns 是否有 vote 变化
   */
  hasVoteChanges(postId: string, currentUpvotes: number, currentDownvotes: number): boolean {
    const snapshot = this.getPostSnapshot(postId);
    if (!snapshot) {
      // 没有快照，如果有 vote 则认为是新的
      return currentUpvotes > 0 || currentDownvotes > 0;
    }
    return currentUpvotes !== snapshot.upvotes || currentDownvotes !== snapshot.downvotes;
  }
}
