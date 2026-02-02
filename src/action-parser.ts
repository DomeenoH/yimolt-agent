/**
 * ActionRequest 解析器模块
 * 用于解析 AI 返回的动作请求
 */

/**
 * 动作类型枚举
 */
export type ActionType =
  | 'VIEW_COMMENTS'      // 查看某帖子的评论详情
  | 'REPLY_COMMENT'      // 回复某条评论
  | 'CREATE_POST'        // 发新帖子
  | 'FOLLOW_USER'        // 关注用户
  | 'UNFOLLOW_USER'      // 取关用户
  | 'SUBSCRIBE'          // 订阅社区
  | 'UNSUBSCRIBE'        // 取消订阅社区
  | 'SEARCH'             // 语义搜索
  | 'VIEW_PROFILE'       // 查看用户资料
  | 'DONE';              // 完成本次心跳

/**
 * 动作参数接口
 */
export interface ActionParams {
  postId?: string;
  commentId?: string;
  content?: string;
  username?: string;
  submolt?: string;
  query?: string;
  searchType?: 'posts' | 'comments' | 'all';
}

/**
 * 动作请求接口
 */
export interface ActionRequest {
  action: ActionType;
  params?: ActionParams;
  reason?: string; // AI 解释为什么选择这个动作
}

/**
 * 有效的动作类型列表
 */
const VALID_ACTION_TYPES: ActionType[] = [
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

/**
 * 检查是否为有效的动作类型
 * @param action 动作字符串
 * @returns 是否为有效的动作类型
 */
function isValidActionType(action: string): action is ActionType {
  return VALID_ACTION_TYPES.includes(action as ActionType);
}

/**
 * 解析 AI 响应中的 ACTION 行
 * @param response AI 响应字符串
 * @returns 动作类型或 null
 */
function parseActionLine(response: string): ActionType | null {
  // 匹配 ACTION: xxx 格式，支持前后空白
  const actionMatch = response.match(/^ACTION:\s*(\S+)\s*$/m);
  if (!actionMatch) {
    return null;
  }

  const actionStr = actionMatch[1].toUpperCase();
  if (isValidActionType(actionStr)) {
    return actionStr;
  }

  return null;
}

/**
 * 解析 AI 响应中的 PARAMS 行
 * @param response AI 响应字符串
 * @returns 参数对象或 undefined
 */
function parseParamsLine(response: string): ActionParams | undefined {
  // 匹配 PARAMS: {...} 格式
  const paramsMatch = response.match(/^PARAMS:\s*(\{.*\})\s*$/m);
  if (!paramsMatch) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(paramsMatch[1]);
    // 验证 parsed 是一个对象
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return undefined;
    }
    return parsed as ActionParams;
  } catch {
    // JSON 解析失败
    return undefined;
  }
}

/**
 * 解析 AI 响应中的 REASON 行
 * @param response AI 响应字符串
 * @returns 原因字符串或 undefined
 */
function parseReasonLine(response: string): string | undefined {
  // 匹配 REASON: xxx 格式，捕获到行尾的所有内容
  const reasonMatch = response.match(/^REASON:\s*(.+)$/m);
  if (!reasonMatch) {
    return undefined;
  }

  const reason = reasonMatch[1].trim();
  return reason.length > 0 ? reason : undefined;
}

/**
 * 尝试从 JSON 格式解析动作
 * @param response AI 响应字符串
 * @returns ActionRequest 或 null
 */
function parseJsonFormat(response: string): ActionRequest | null {
  // 尝试找到 JSON 对象（可能在代码块中）
  const jsonMatch = response.match(/\{[^{}]*"action"\s*:\s*"[^"]+"/);
  if (!jsonMatch) {
    return null;
  }

  // 找到完整的 JSON 对象
  const startIndex = response.indexOf(jsonMatch[0]);
  let braceCount = 0;
  let endIndex = startIndex;
  
  for (let i = startIndex; i < response.length; i++) {
    if (response[i] === '{') braceCount++;
    if (response[i] === '}') braceCount--;
    if (braceCount === 0) {
      endIndex = i + 1;
      break;
    }
  }

  const jsonStr = response.substring(startIndex, endIndex);
  
  try {
    const parsed = JSON.parse(jsonStr);
    
    // 验证 action 字段
    if (!parsed.action || typeof parsed.action !== 'string') {
      return null;
    }

    const actionStr = parsed.action.toUpperCase();
    if (!isValidActionType(actionStr)) {
      return null;
    }

    // 构建 ActionRequest
    const result: ActionRequest = { action: actionStr };

    // 映射 JSON 字段到 params
    const params: ActionParams = {};
    
    if (parsed.post_id) params.postId = parsed.post_id;
    if (parsed.postId) params.postId = parsed.postId;
    if (parsed.comment_id) params.commentId = parsed.comment_id;
    if (parsed.commentId) params.commentId = parsed.commentId;
    if (parsed.content) params.content = parsed.content;
    if (parsed.username) params.username = parsed.username;
    if (parsed.submolt) params.submolt = parsed.submolt;
    if (parsed.query) params.query = parsed.query;
    if (parsed.search_type) params.searchType = parsed.search_type;
    if (parsed.searchType) params.searchType = parsed.searchType;

    if (Object.keys(params).length > 0) {
      result.params = params;
    }

    if (parsed.reason) {
      result.reason = parsed.reason;
    }

    return result;
  } catch {
    return null;
  }
}

/**
 * 解析 AI 响应字符串为 ActionRequest 对象
 * 
 * 支持两种格式：
 * 
 * 1. 结构化格式：
 * ```
 * ACTION: VIEW_COMMENTS
 * PARAMS: {"postId": "post-123"}
 * REASON: 有 2 条新评论，先看看大家说了什么
 * ```
 * 
 * 2. JSON 格式：
 * ```json
 * {"action": "VIEW_COMMENTS", "post_id": "post-123"}
 * ```
 * 
 * @param response AI 响应字符串
 * @returns ActionRequest 对象，解析失败时返回 DONE 动作
 */
export function parseActionResponse(response: string): ActionRequest {
  // 空响应或非字符串，返回 DONE
  if (!response || typeof response !== 'string') {
    return { action: 'DONE' };
  }

  // 首先尝试 JSON 格式
  const jsonResult = parseJsonFormat(response);
  if (jsonResult) {
    return jsonResult;
  }

  // 然后尝试结构化格式
  // 解析 ACTION
  const action = parseActionLine(response);
  if (!action) {
    // 无法解析动作类型，返回 DONE
    return { action: 'DONE' };
  }

  // 解析 PARAMS（可选）
  const params = parseParamsLine(response);

  // 解析 REASON（可选）
  const reason = parseReasonLine(response);

  // 构建结果
  const result: ActionRequest = { action };

  if (params !== undefined) {
    result.params = params;
  }

  if (reason !== undefined) {
    result.reason = reason;
  }

  return result;
}
