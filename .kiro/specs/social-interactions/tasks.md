# 实现计划：社交互动功能

## 概述

本计划将社交互动功能分为 4 个主要阶段：API 层扩展、状态存储、Agent 核心逻辑、测试验证。

## 任务

- [x] 1. 扩展 MoltbookClient API 方法
  - [x] 1.1 添加获取自己帖子列表方法 `getMyPosts(limit?: number)`
    - 调用 `GET /api/agents/posts` 或类似端点
    - 返回 `{ posts: Post[] }`
    - _Requirements: 8.1_

  - [x] 1.2 添加获取帖子评论方法 `getPostComments(postId, sort?)`
    - 支持 sort 参数：top、new、controversial
    - 返回 `{ comments: Comment[] }`
    - _Requirements: 7.1, 7.2, 7.3, 7.4_

  - [x] 1.3 添加回复评论方法 `replyToComment(postId, parentId, content)`
    - 通过 `parent_id` 指定被回复的评论
    - 返回 `{ comment: Comment }`
    - _Requirements: 3.2, 3.3, 3.4_

  - [x] 1.4 添加关注/取关方法 `followUser(username)` / `unfollowUser(username)`
    - 返回 `{ success: boolean }`
    - _Requirements: 4.1, 4.2, 4.3, 4.4_

  - [x] 1.5 添加订阅/取消订阅方法 `subscribeSubmolt(submolt)` / `unsubscribeSubmolt(submolt)`
    - 返回 `{ success: boolean }`
    - _Requirements: 5.1, 5.2, 5.3, 5.4_

  - [x] 1.6 添加语义搜索方法 `semanticSearch(query, type?, limit?)`
    - type: posts、comments、all
    - 返回 `{ posts?: Post[], comments?: Comment[] }`
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_

  - [x] 1.7 添加获取 molty 资料方法 `getMoltyProfile(username)`
    - 返回 `{ profile: MoltyProfile }`
    - _Requirements: 7.1, 7.2, 7.3_

  - [x] 1.8 添加获取关注/粉丝/订阅列表方法
    - `getFollowing()` 返回 `{ users: MoltyProfile[] }`
    - `getFollowers()` 返回 `{ users: MoltyProfile[] }`
    - `getSubscriptions()` 返回 `{ submolts: string[] }`
    - _Requirements: 8.2, 8.3, 8.4_

- [x] 2. 实现 InteractionStore 状态存储
  - [x] 2.1 创建 `interaction-store.ts` 文件
    - 定义 `PostSnapshot` 和 `InteractionData` 接口
    - 实现 `InteractionStore` 类
    - 存储路径：`data/interaction-state.json`
    - _Requirements: 2.1, 2.3_

  - [x] 2.2 实现已回复评论追踪
    - `isCommentReplied(commentId): boolean`
    - `markCommentReplied(commentId): void`
    - _Requirements: 2.5_

  - [x] 2.3 实现帖子状态快照
    - `getPostSnapshot(postId): PostSnapshot | undefined`
    - `updatePostSnapshot(snapshot): void`
    - _Requirements: 2.3_

  - [x] 2.4 实现变化检测方法
    - `hasNewComments(postId, currentCount): boolean`
    - `hasVoteChanges(postId, currentUpvotes, currentDownvotes): boolean`
    - _Requirements: 2.4_

  - [ ]* 2.5 编写 InteractionStore 属性测试
    - **Property 2: InteractionStore Round-Trip**
    - **Validates: Requirements 2.1, 2.3**

  - [ ]* 2.6 编写变化检测属性测试
    - **Property 4: 变化检测正确性**
    - **Validates: Requirements 2.4**

- [x] 3. 实现 ActionRequest 解析器
  - [x] 3.1 创建 `action-parser.ts` 文件
    - 定义 `ActionType` 和 `ActionRequest` 类型
    - 实现 `parseActionResponse(response: string): ActionRequest` 函数
    - 处理格式：ACTION / PARAMS / REASON
    - _Requirements: 1.4_

  - [ ]* 3.2 编写 ActionRequest 解析属性测试
    - **Property 5: ActionRequest 解析**
    - **Validates: Requirements 1.4**

- [x] 4. Checkpoint - 确保基础组件测试通过
  - 运行所有测试，确保 InteractionStore 和 ActionParser 工作正常
  - 如有问题请询问用户

- [x] 5. 实现 Agent 上下文构建
  - [x] 5.1 定义 `AgentContext` 和 `PostWithStatus` 接口
    - 在 `agent.ts` 中添加类型定义
    - _Requirements: 1.2_

  - [x] 5.2 实现 `buildAgentContext()` 方法
    - 获取 Agent profile（karma、帖子数）
    - 获取最近帖子列表
    - 检测每个帖子的新评论和 vote 变化
    - 获取关注/粉丝/订阅数量
    - 计算发帖冷却状态
    - _Requirements: 1.1, 1.2, 8.5, 8.6_

  - [ ]* 5.3 编写 AgentContext 完整性属性测试
    - **Property 1: AgentContext 完整性**
    - **Validates: Requirements 1.2**

- [x] 6. 实现社交互动循环
  - [x] 6.1 实现 `formatContextPrompt(context, actionHistory)` 方法
    - 将 AgentContext 格式化为 AI prompt
    - 包含执行记录（增量累积）
    - _Requirements: 1.3_

  - [x] 6.2 实现 `runSocialInteractionLoop()` 方法
    - 构建初始上下文
    - 循环：发送 prompt → 解析 ActionRequest → 执行动作 → 更新上下文
    - 直到 AI 返回 DONE 动作
    - _Requirements: 1.5, 1.6_

  - [x] 6.3 实现 `executeAction(action: ActionRequest)` 方法
    - 根据 action.action 类型调用对应的 API 方法
    - 返回执行结果字符串
    - 处理错误情况
    - _Requirements: 1.5_

  - [x] 6.4 实现评论回复生成
    - 创建专门的 prompt 让 AI 生成回复内容
    - 保持小多人设
    - _Requirements: 3.5_

  - [ ]* 6.5 编写交互循环终止条件属性测试
    - **Property 6: 交互循环终止条件**
    - **Validates: Requirements 1.6**

- [x] 7. 实现新评论过滤逻辑
  - [x] 7.1 实现 `filterNewComments(comments, postId)` 方法
    - 过滤掉已回复的评论
    - 返回未处理的"新"评论列表
    - _Requirements: 2.2_

  - [ ]* 7.2 编写新评论过滤属性测试
    - **Property 3: 新评论过滤正确性**
    - **Validates: Requirements 2.2**

- [x] 8. 更新心跳流程
  - [x] 8.1 修改 `heartbeat()` 方法
    - 在现有流程前添加社交互动循环
    - 先处理评论回复，再考虑发帖
    - 展示当前 karma 和互动情况
    - _Requirements: 1.1, 8.5, 8.6_

- [x] 9. Final Checkpoint - 确保所有测试通过
  - 运行完整测试套件
  - 如有问题请询问用户

## 备注

- 标记 `*` 的任务为可选测试任务，可跳过以加快 MVP 开发
- 每个任务都引用了具体的需求编号以便追溯
- 属性测试验证通用正确性属性
- 单元测试验证具体示例和边界情况
