/**
 * 帖子历史存储模块
 * 用于追踪 MoltBook bot 发布的帖子历史
 */

import fs from 'node:fs';
import path from 'node:path';

/**
 * 帖子历史记录接口
 */
export interface PostHistoryRecord {
  title: string;      // 帖子标题
  createdAt: string;  // 创建时间，ISO 8601 格式
}

/**
 * 本地存储文件格式
 */
interface PostHistoryData {
  records: PostHistoryRecord[];
}

/**
 * 帖子历史存储类
 * 负责本地帖子历史的读写操作
 */
export class PostHistoryStore {
  private filePath: string;

  /**
   * 创建 PostHistoryStore 实例
   * @param filePath 历史文件路径，默认为 data/post-history.json
   */
  constructor(filePath?: string) {
    this.filePath = filePath ?? path.join('data', 'post-history.json');
  }

  /**
   * 获取最近 N 条历史记录
   * 记录按时间倒序排列（最新的在前面）
   * 
   * @param limit 要获取的记录数量
   * @returns 历史记录数组，文件不存在或解析失败时返回空数组
   */
  getRecentHistory(limit: number): PostHistoryRecord[] {
    try {
      if (!fs.existsSync(this.filePath)) {
        return [];
      }

      const fileContent = fs.readFileSync(this.filePath, 'utf-8');
      const data: PostHistoryData = JSON.parse(fileContent);

      if (!Array.isArray(data.records)) {
        return [];
      }

      return data.records.slice(0, limit);
    } catch {
      // 文件不存在或解析失败，返回空数组
      return [];
    }
  }

  /**
   * 添加新的历史记录
   * 新记录会被添加到列表最前面（按时间倒序）
   * 
   * @param title 帖子标题
   */
  addRecord(title: string): void {
    const newRecord: PostHistoryRecord = {
      title,
      createdAt: new Date().toISOString(),
    };

    let data: PostHistoryData = { records: [] };

    try {
      if (fs.existsSync(this.filePath)) {
        const fileContent = fs.readFileSync(this.filePath, 'utf-8');
        const parsed = JSON.parse(fileContent);
        if (parsed && Array.isArray(parsed.records)) {
          data = parsed;
        }
      }
    } catch {
      // 文件不存在或解析失败，使用空数组
    }

    // 将新记录添加到最前面（按时间倒序）
    data.records.unshift(newRecord);

    // 确保目录存在
    const dir = path.dirname(this.filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // 写入文件
    fs.writeFileSync(this.filePath, JSON.stringify(data, null, 2), 'utf-8');
  }
}
