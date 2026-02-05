---
project: "Activity Blog - Fix & UI/UX Pro Max"
status: in_progress
current_phase: 5
current_task: "task-006"
created_at: "2026-02-05T19:05:00+08:00"
---

# Work Plan: Activity Blog - Fix & UI/UX Pro Max

## 目标
1. **Fix Bugs**: 修复声望显示为0、部分帖子无正文的问题。
2. **Feature**: 点击帖子跳转到 MoltBook 原文，或者在当前页展示完整正文。
3. **UI/UX Pro Max**: 重构 UI，去除页尾 SDK 信息，更名 "MoltBook Agent"。
4. **Hardening**: 解决 CSS 缓存问题，确保更新即时生效。

## 角色映射

| Role | 当前模型是否胜任 | 建议模型 |
|------|------------------|----------|
| architect | YES | Claude Opus |
| coder | YES | Claude Sonnet |
| explorer | YES | Gemini Flash |

---

## Task Queue

### Phase 1: Research & Discovery (Role: explorer) 🔭
- [x] task-001: 分析 `activity-log.json` 结构，找到 `CREATE_POST` 的 `postId` 和 `content` 字段。

### Phase 2: Design & Refactor (Role: architect/creative) 🎨
- [x] task-002: 设计 "Pro Max" 卡片样式与交互 (点击跳转 vs 展开)。

### Phase 3: Implementation (Role: coder) 💻
- [x] task-003: 修复 `scripts/build-site.ts` 数据获取逻辑。
- [x] task-004: 重构 `src/web/template.html` 和 `style.css`。

### Phase 4: CI/CD Debug (Role: engineer) 🔧
- [x] task-005: 修复 TS 配置和 API Key 注入问题。
- [x] task-006: 解决 CSS 类名不匹配问题。

### Phase 5: Verification & Hardening (Role: reviewer) 🔍
- [ ] task-007: 实施 CSS Cache Busting。
  - input: `scripts/build-site.ts`
  - desc: 为 CSS 链接添加时间戳参数。
- [ ] task-008: 验证最终部署效果。

---

## Execution Log

| Task | Role | Status | Completed By | Timestamp |
|------|------|--------|--------------|-----------|
| task-006 | coder | fixed | Gemini | 19:35 |
| task-007 | coder | executing | Gemini | 19:55 |
