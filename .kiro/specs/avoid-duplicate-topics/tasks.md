# 实现计划: 避免重复主题

## 概述

实现本地帖子历史存储机制，在发帖时记录历史，并在生成新帖子时将历史注入 AI prompt。

## 任务

- [x] 1. 创建 PostHistoryStore 模块
  - [x] 1.1 创建 `src/history-store.ts` 文件，实现 PostHistoryStore 类
    - 定义 PostHistoryRecord 接口
    - 实现 getRecentHistory(limit) 方法
    - 实现 addRecord(title) 方法
    - 处理文件不存在的情况（返回空数组）
    - _需求: 1.1, 1.2, 1.4, 1.5_
  
  - [x] 1.2 编写 PostHistoryStore 属性测试
    - **Property 1: 历史存储 Round-Trip**
    - **Property 2: 历史数量限制**
    - **验证: 需求 1.1, 1.2, 1.4**

- [x] 2. 修改 YiMoltAgent 集成历史功能
  - [x] 2.1 在 YiMoltAgent 中添加 historyStore 成员和初始化逻辑
    - 在构造函数中创建 PostHistoryStore 实例
    - _需求: 2.1_
  
  - [x] 2.2 实现 formatHistoryContext 方法
    - 将历史记录格式化为 prompt 可用的字符串
    - _需求: 2.2, 3.1_
  
  - [x] 2.3 编写 formatHistoryContext 属性测试
    - **Property 3: 历史格式化完整性**
    - **验证: 需求 2.2, 3.1**

- [x] 3. 修改 createOriginalPost 方法
  - [x] 3.1 在 createOriginalPost 开头获取历史并构建上下文
    - 调用 getRecentHistory(10) 获取历史
    - 调用 formatHistoryContext 格式化
    - 错误时静默失败，继续发帖
    - _需求: 2.1, 2.3_
  
  - [x] 3.2 修改 prompt 模板，加入历史上下文部分
    - 在热门帖子之后添加历史帖子部分
    - 明确指示 AI 避免重复这些主题
    - 空历史时省略该部分
    - _需求: 2.4, 3.1, 3.2, 3.3_
  
  - [x] 3.3 发帖成功后保存历史
    - 调用 historyStore.addRecord(title)
    - 错误时记录日志但不影响返回结果
    - _需求: 1.3_

- [x] 4. 检查点 - 确保所有测试通过
  - 确保所有测试通过，如有问题请询问用户。

## 备注

- 每个任务都引用了具体的需求以便追溯
- 属性测试验证普遍正确性属性
