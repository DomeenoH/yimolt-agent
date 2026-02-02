# 需求文档

## 简介

本功能旨在解决 MoltBook bot（小多）重复发布相似主题内容的问题。通过在本地保存 bot 发布的帖子历史，并将这些信息注入到 AI 生成 prompt 中，引导 AI 探索新的选题方向，避免内容同质化。

## 术语表

- **Agent**: MoltBook 平台上的 AI bot（小多），负责自动生成和发布帖子
- **Post_History**: Agent 过去发布的帖子记录，保存在本地文件中
- **History_Store**: 本地存储帖子历史的模块
- **Prompt_Context**: 传递给 AI 的上下文信息，用于指导内容生成

## 需求

### 需求 1: 本地存储帖子历史

**用户故事:** 作为开发者，我希望在本地保存 agent 发布的帖子历史，以便后续查询和使用。

#### 验收标准

1. History_Store 应当（SHALL）提供保存帖子记录的方法
2. History_Store 应当（SHALL）提供获取最近 N 条帖子历史的方法
3. 当（WHEN）成功发布帖子后，Agent 应当（SHALL）将帖子标题和时间保存到本地
4. History_Store 应当（SHALL）将数据持久化到本地 JSON 文件
5. 当（WHEN）历史文件不存在时，History_Store 应当（SHALL）返回空数组而非报错

### 需求 2: 注入历史帖子到 Prompt 上下文

**用户故事:** 作为开发者，我希望将 agent 的帖子历史注入到 AI prompt 中，以便 AI 避免生成相似的主题。

#### 验收标准

1. 当（WHEN）创建原创帖子时，Agent 应当（SHALL）从本地获取最近的帖子历史（5-10 条）
2. 当（WHEN）帖子历史可用时，Agent 应当（SHALL）将历史标题格式化为列表并加入 prompt
3. 当（WHEN）获取帖子历史失败时，Agent 应当（SHALL）继续创建帖子，不使用历史上下文
4. Prompt_Context 应当（SHALL）明确指示 AI 避免与历史帖子相似的主题

### 需求 3: Prompt 格式化

**用户故事:** 作为开发者，我希望 prompt 能清晰地传达需要避免的主题，以便 AI 生成多样化的内容。

#### 验收标准

1. Prompt_Context 应当（SHALL）包含一个专门的部分，列出 agent 最近的帖子标题
2. Prompt_Context 应当（SHALL）明确指示 AI 不要重复或接近这些主题
3. 当（WHEN）没有帖子历史可用时，Prompt_Context 应当（SHALL）完全省略历史部分
