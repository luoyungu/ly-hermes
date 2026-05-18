# Token 使用统计菜单设计

## 概述

在侧边栏添加独立的 Token 使用统计菜单，支持查看总览、按模型统计、按 Agent 统计、每日趋势。

## 需求确认

- **位置**：侧边栏独立的菜单项
- **数据维度**：总览 + 按模型 + 按 Agent + 每日趋势
- **时间范围**：默认 30 天
- **Agent 过滤**：只显示有数据的 Agent
- **访问方式**：通过 IPC 接口，不直接读数据库

## 数据架构

### 后端 (sessions.ts)

#### 新增函数

```typescript
// 获取指定 Agent 的使用统计
export function getAgentStats(
  profileName: string,
  days: number
): {
  totals: Record<string, unknown>
  byModel: Array<Record<string, unknown>>
  daily: Array<Record<string, unknown>>
}
```

#### 新增 IPC 接口

```typescript
// get-token-stats(days: number)
// 返回结构
{
  totals: { ... },           // 全局总览
  byModel: [...],            // 按模型统计
  byAgent: [...],            // 按 Agent 统计 (新增)
  daily: [...],              // 每日趋势
  agents: string[]           // 有数据的 Agent 列表 (新增)
}
```

### 前端

#### 数据类型

```typescript
interface TokenStats {
  totals: {
    total_sessions: number
    total_input: number
    total_output: number
    total_cache_read: number
    total_estimated_cost: number
    total_actual_cost: number
  }
  byModel: Array<{
    model: string
    count: number
    input_tokens: number
    output_tokens: number
    percentage: number  // 计算得出
  }>
  byAgent: Array<{
    agent: string
    sessions: number
    input_tokens: number
    output_tokens: number
    percentage: number
  }>
  daily: Array<{
    date: string
    sessions: number
    input_tokens: number
    output_tokens: number
    estimated_cost_usd: number
  }>
}
```

#### 组件结构

```
TokenStats (主组件)
├── 头部：标题 + 时间范围选择器
├── 总览卡片
├── 双列网格
│   ├── 按模型统计卡片 (左)
│   │   ├── 模型列表
│   │   └── 饼图
│   └── 按Agent统计卡片 (右)
│       ├── Agent列表
│       └── 饼图
└── 每日趋势图表
```

## 实现步骤

### 1. 后端实现

- [ ] 在 `sessions.ts` 添加 `getAgentStats()` 函数
- [ ] 在 `sessions.ts` 添加 `getTokenStats()` IPC handler
- [ ] 更新 preload 类型定义

### 2. 前端实现

- [ ] 创建 `TokenStats.tsx` 组件
- [ ] 创建 `UsageCard.tsx` 统计卡片组件
- [ ] 创建 `PieChart.tsx` 饼图组件（可选，用 CSS 进度条替代）
- [ ] 在侧边栏集成菜单入口
- [ ] 添加样式

## 设计决策

- 使用 CSS 进度条代替复杂图表库，简化依赖
- 数据按百分比排序，突出显示主要消耗来源
- 支持时间范围切换（7天/30天/90天）
