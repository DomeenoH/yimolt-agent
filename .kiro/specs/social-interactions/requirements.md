# 需求文档

## 简介

本功能为 MoltBook AI Agent（小多）扩展社交互动能力。遵循"有迹可循"的核心原则——只实现能在自己主页或帖子里看到效果的功能，避免"投石入海"式的无意义行为。

核心设计理念：
- AI 需要一个清晰的 SOP（标准操作流程）来指导决策
- AI 与程序需要连续交互：AI 发出指令 → 程序执行 API 调用 → 返回结果给 AI → AI 继续决策
- 需要追踪"新"内容（新评论、新 vote），避免重复处理

## 术语表

- **Agent**: MoltBook 平台上的 AI bot（小多），负责自动生成帖子和社交互动
- **Molty**: MoltBook 平台上的用户或 agent 的统称
- **Submolt**: MoltBook 平台上的社区/子版块
- **MoltbookClient**: 与 MoltBook API 交互的客户端类
- **Comment**: 帖子下的评论
- **Profile**: Molty 的个人资料信息
- **AIProvider**: AI 内容生成提供者
- **AgentContext**: Agent 执行决策时的上下文信息
- **SOP**: 标准操作流程，指导 AI 决策的流程规范
- **ActionRequest**: AI 返回给程序的动作请求（如：查看评论、回复、发帖等）

## 需求

### 需求 1: Agent SOP 流程框架

**用户故事:** 作为 Agent，我希望有一个清晰的 SOP 流程来指导我的决策，以便与程序进行连续交互。

#### 验收标准

1. WHEN Agent 执行心跳时，THE Agent SHALL 首先获取完整的上下文信息（身份、位置、状态）
2. THE Agent SHALL 在上下文中包含：自己是谁、当前 karma、最近帖子列表、是否有新评论、是否有新 vote
3. WHEN 上下文准备完毕时，THE Agent SHALL 将上下文传递给 AI 并请求决策
4. THE AI SHALL 返回一个 ActionRequest，指定下一步动作（查看评论详情、回复评论、发新帖子、跳过）
5. WHEN 收到 ActionRequest 时，THE Agent SHALL 执行对应的 API 调用并将结果返回给 AI
6. THE Agent SHALL 支持多轮交互，直到 AI 返回"完成"动作

### 需求 2: 新内容检测与追踪

**用户故事:** 作为 Agent，我希望能够检测和追踪"新"内容，以便只处理未处理过的评论和互动。

#### 验收标准

1. THE Agent SHALL 持久化存储已处理的评论 ID 列表
2. WHEN 获取帖子评论时，THE Agent SHALL 过滤出未处理的"新"评论
3. THE Agent SHALL 记录上次运行时各帖子的评论数和 vote 数
4. WHEN 检测到新评论或 vote 变化时，THE Agent SHALL 在上下文中标注这些变化
5. WHEN 评论被回复后，THE Agent SHALL 将该评论 ID 标记为已处理

### 需求 3: 回复评论功能

**用户故事:** 作为 Agent，我希望能够回复自己帖子下的评论，以便与社区成员进行有意义的互动。

#### 验收标准

1. THE MoltbookClient SHALL 提供获取指定帖子评论列表的方法
2. THE MoltbookClient SHALL 提供回复指定评论的方法，通过 `parent_id` 参数指定被回复的评论
3. WHEN 回复成功时，THE MoltbookClient SHALL 返回新创建的 Comment 对象
4. IF 回复失败，THEN THE MoltbookClient SHALL 抛出包含错误信息的异常
5. THE Agent SHALL 使用 AI 生成符合小多人设的回复内容
6. 回复评论不应当（SHALL NOT）受发帖冷却时间限制（需确认 API 行为）

### 需求 4: 关注/取关其他 Molty

**用户故事:** 作为 Agent，我希望能够关注其他 molty，以便建立社交关系（关注列表在主页可见）。

#### 验收标准

1. THE MoltbookClient SHALL 提供关注指定 molty 的方法
2. THE MoltbookClient SHALL 提供取消关注指定 molty 的方法
3. WHEN 关注/取关操作成功时，THE MoltbookClient SHALL 返回成功状态
4. IF 操作失败，THEN THE MoltbookClient SHALL 抛出包含错误信息的异常

### 需求 5: 订阅社区

**用户故事:** 作为 Agent，我希望能够订阅社区（submolt），以便影响个性化 feed。

#### 验收标准

1. THE MoltbookClient SHALL 提供订阅指定 submolt 的方法
2. THE MoltbookClient SHALL 提供取消订阅指定 submolt 的方法
3. WHEN 订阅/取消订阅操作成功时，THE MoltbookClient SHALL 返回成功状态
4. IF 操作失败，THEN THE MoltbookClient SHALL 抛出包含错误信息的异常

### 需求 6: 语义搜索

**用户故事:** 作为 Agent，我希望能够进行语义搜索，以便找到相关话题、辅助内容创作。

#### 验收标准

1. THE MoltbookClient SHALL 提供语义搜索方法
2. THE MoltbookClient SHALL 支持通过 `type` 参数指定搜索类型（posts、comments、all）
3. THE MoltbookClient SHALL 支持通过 `limit` 参数限制返回结果数量
4. WHEN 搜索成功时，THE MoltbookClient SHALL 返回匹配的帖子或评论列表
5. WHEN 搜索无结果时，THE MoltbookClient SHALL 返回空数组

### 需求 7: 查看其他 Molty 资料

**用户故事:** 作为 Agent，我希望能够查看其他 molty 的资料，以便了解互动对象。

#### 验收标准

1. THE MoltbookClient SHALL 提供通过名称获取指定 molty 资料的方法
2. WHEN 查询成功时，THE MoltbookClient SHALL 返回包含 molty 基本信息的 Profile 对象
3. IF 指定的 molty 不存在，THEN THE MoltbookClient SHALL 抛出包含错误信息的异常

### 需求 8: Agent 上下文信息获取

**用户故事:** 作为 Agent，我希望能获取丰富的上下文信息，以便做出更有意义的社交互动决策。

#### 验收标准

1. THE MoltbookClient SHALL 提供获取 Agent 自己帖子列表的方法
2. THE MoltbookClient SHALL 提供获取 Agent 关注列表的方法
3. THE MoltbookClient SHALL 提供获取 Agent 粉丝列表的方法
4. THE MoltbookClient SHALL 提供获取 Agent 订阅的社区列表的方法
5. THE Agent SHALL 在心跳开始时获取并汇总这些上下文信息
