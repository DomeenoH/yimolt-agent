/**
 * 活动日志存储模块
 * 持久化记录小多每次运行的操作详情
 */

import fs from 'node:fs';
import path from 'node:path';

/**
 * 单条活动记录
 */
export interface ActivityEntry {
  action: string;
  params?: Record<string, string>;
  result: string;
  details?: {
    postTitle?: string;
    postContent?: string;
    commentContent?: string;
    replyContent?: string;
    targetUser?: string;
    [key: string]: string | undefined;
  };
  timestamp: string;
}

/**
 * 单次运行的日志
 */
export interface RunLog {
  runId: string;
  startTime: string;
  endTime?: string;
  activities: ActivityEntry[];
}

/**
 * 活动日志数据结构
 */
export interface ActivityLogData {
  runs: RunLog[];
}

/**
 * 活动日志存储类
 */
export class ActivityLogStore {
  private filePath: string;
  private data: ActivityLogData;
  private currentRun: RunLog | null = null;

  constructor(filePath?: string) {
    this.filePath = filePath ?? path.join('data', 'activity-log.json');
    this.data = this.loadData();
  }

  private loadData(): ActivityLogData {
    try {
      if (!fs.existsSync(this.filePath)) {
        return { runs: [] };
      }
      const content = fs.readFileSync(this.filePath, 'utf-8');
      const parsed = JSON.parse(content);
      if (parsed && Array.isArray(parsed.runs)) {
        return parsed as ActivityLogData;
      }
      return { runs: [] };
    } catch {
      return { runs: [] };
    }
  }

  private saveData(): void {
    try {
      const dir = path.dirname(this.filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.filePath, JSON.stringify(this.data, null, 2), 'utf-8');
    } catch (error) {
      console.error('Failed to save activity log:', error);
    }
  }

  /**
   * 开始新的运行记录
   */
  startRun(): string {
    const runId = new Date().toISOString().replace(/[:.]/g, '-');
    this.currentRun = {
      runId,
      startTime: new Date().toISOString(),
      activities: [],
    };
    return runId;
  }

  /**
   * 记录一条活动
   */
  logActivity(entry: Omit<ActivityEntry, 'timestamp'>): void {
    if (!this.currentRun) {
      this.startRun();
    }
    this.currentRun!.activities.push({
      ...entry,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * 结束当前运行并保存
   */
  endRun(): void {
    if (this.currentRun) {
      this.currentRun.endTime = new Date().toISOString();
      // 只保留最近 50 次运行记录
      this.data.runs.push(this.currentRun);
      if (this.data.runs.length > 50) {
        this.data.runs = this.data.runs.slice(-50);
      }
      this.saveData();
      this.currentRun = null;
    }
  }

  /**
   * 获取最近的运行记录
   */
  getRecentRuns(count = 10): RunLog[] {
    return this.data.runs.slice(-count);
  }

  /**
   * 生成人类可读的 Markdown 日志
   * 保存到 data/heartbeat-log.md
   */
  generateReadableLog(): void {
    const logPath = path.join('data', 'heartbeat-log.md');
    const runs = [...this.data.runs].slice(-10); // 最近 10 次运行
    
    const lines: string[] = [];
    lines.push('# 🐙 小多心跳日志');
    lines.push('');
    lines.push('> 最近 10 次运行记录（自动生成，请勿手动编辑）');
    lines.push('');
    
    // 倒序显示，最新的在前面
    for (const run of runs.reverse()) {
      const startDate = new Date(run.startTime);
      const dateStr = this.formatDate(startDate);
      
      lines.push(`## 📅 ${dateStr}`);
      lines.push('');
      
      if (run.activities.length === 0) {
        lines.push('*本次运行没有执行任何操作*');
        lines.push('');
        lines.push('---');
        lines.push('');
        continue;
      }
      
      for (const activity of run.activities) {
        const icon = this.getActivityIcon(activity.action);
        const summary = this.formatActivitySummary(activity);
        lines.push(`${icon} ${summary}`);
        lines.push('');
      }
      
      lines.push('---');
      lines.push('');
    }
    
    try {
      const dir = path.dirname(logPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(logPath, lines.join('\n'), 'utf-8');
    } catch (error) {
      console.error('生成可读日志失败:', error);
    }
  }

  /**
   * 格式化日期为中文格式
   */
  private formatDate(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hour = String(date.getHours()).padStart(2, '0');
    const minute = String(date.getMinutes()).padStart(2, '0');
    return `${year}年${month}月${day}日 ${hour}:${minute}`;
  }

  /**
   * 获取活动图标
   */
  private getActivityIcon(action: string): string {
    const icons: Record<string, string> = {
      'REPLY_COMMENT': '💬',
      'CREATE_POST': '📝',
      'DELETE_POST': '🗑️',
      'MARK_SPAM': '🚫',
      'FOLLOW_USER': '➕',
      'UNFOLLOW_USER': '➖',
      'SUBSCRIBE': '🔔',
      'UNSUBSCRIBE': '🔕',
      'VIEW_COMMENTS': '👀',
      'VIEW_PROFILE': '👤',
      'SEARCH': '🔍',
    };
    return icons[action] || '▪️';
  }

  /**
   * 格式化活动摘要
   */
  private formatActivitySummary(activity: ActivityEntry): string {
    const { action, details, result } = activity;
    const success = result === 'success';
    const statusIcon = success ? '✓' : '✗';
    
    switch (action) {
      case 'REPLY_COMMENT': {
        const postTitle = details?.postTitle || '未知帖子';
        const targetUser = details?.targetUser || '未知用户';
        const replyContent = details?.replyContent || '';
        const preview = replyContent.length > 80 
          ? replyContent.substring(0, 80) + '...' 
          : replyContent;
        return `**回复评论** ${statusIcon}\n  - 帖子：「${postTitle}」\n  - 回复 @${targetUser}：\n  > ${preview}`;
      }
      
      case 'CREATE_POST': {
        const postTitle = details?.postTitle || '未知标题';
        return `**发布新帖** ${statusIcon}\n  - 标题：「${postTitle}」`;
      }
      
      case 'MARK_SPAM': {
        const targetUser = details?.targetUser || '未知用户';
        return `**标记垃圾用户** ${statusIcon} @${targetUser}`;
      }
      
      case 'FOLLOW_USER': {
        const targetUser = details?.targetUser || activity.params?.username || '未知用户';
        return `**关注用户** ${statusIcon} @${targetUser}`;
      }
      
      case 'UNFOLLOW_USER': {
        const targetUser = details?.targetUser || activity.params?.username || '未知用户';
        return `**取消关注** ${statusIcon} @${targetUser}`;
      }
      
      default:
        return `**${action}** ${statusIcon}`;
    }
  }
}
