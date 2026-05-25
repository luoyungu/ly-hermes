# LyHermes

LyHermes（落云.Hermes）是一个面向本地和私有部署场景的 AI 员工管理平台。它用 Electron 提供桌面端体验，并围绕 Hermes Agent 提供员工/profile 管理、聊天、日程、远程 Web 访问、嵌入式聊天和 Token 用量观测。

> 项目仍在快速迭代中。公开仓库中的代码适合学习、试用和共同改进；生产使用前请先审计配置、网络暴露面和本地数据目录。

## 功能概览

- 桌面端管理 Hermes Agent 的安装、诊断、更新和运行环境。
- 创建和管理 AI 员工/profile，包括模型、环境变量、记忆、工具和角色设定。
- 支持本地桌面模式、远程服务模式和 Web 客户端访问。
- 支持日程任务、会话记录、日志查看和 Token 用量统计。
- 支持 Web 嵌入访问，可为指定员工生成独立访问 token。
- 提供静态官网页面，位于 `website/`。

## 技术栈

- Electron + electron-vite
- React + TypeScript
- Vite
- better-sqlite3
- electron-builder

## 快速开始

### 环境要求

- Node.js 22 或更高版本
- npm
- Git
- Windows 环境建议安装 Git Bash；macOS/Linux 需要可用的 Python/venv 环境以运行 Hermes Agent。

### 安装依赖

```bash
npm install
```

### 开发运行

```bash
npm run dev
```

### 类型检查

```bash
npm run typecheck
```

### 构建

```bash
npm run build
```

### 打包

```bash
npm run pack
```

Windows 安装包：

```bash
npm run dist:win
```

## 配置

LyHermes 默认会把运行数据写到用户目录：

- Hermes Agent 数据：`~/.hermes`
- LyHermes 桌面端数据：`~/.lyhermes`
- 独立服务端数据：`~/.lyhermes-server`

常用环境变量可参考 `.env.example`。不要把真实 API Key、远程访问 token、数据库、用户数据或打包签名证书提交到仓库。

## 项目结构

```text
src/main/       Electron 主进程、安装器、配置、IPC、桌面服务
src/renderer/   Electron 渲染进程 UI
src/server/     Web/API 服务端路由和鉴权
src/core/       跨端核心逻辑
src/web/        Web App 与嵌入式聊天入口
website/        静态官网页面
scripts/        构建与运行时辅助脚本
build/          图标、安装器脚本和打包资源
docs/           设计说明和发布记录
```

## 与 Hermes Agent 的关系

LyHermes 是桌面端和管理平台层，运行时会安装或调用 Hermes Agent。当前代码中默认使用的 Hermes Agent 来源和下载逻辑在 `src/main/installer.ts` 与 `src/main/config.ts` 中维护。开源发布时请同时确认上游依赖的许可证、分发方式和下载地址符合你的发布策略。

## 开源前发布检查

- 根目录 README、LICENSE、CONTRIBUTING、SECURITY 已补齐。
- 执行 `npm run typecheck` 和必要的打包命令。
- 执行敏感信息扫描，例如 `gitleaks detect --source .`。
- 确认 `dist/`、`dist-node/`、`dist-web/`、`out/`、`node_modules/`、截图和本地运行数据没有被提交。
- 确认 Git 历史中没有真实 API Key、token、证书、数据库或用户聊天记录。
- 确认官网、更新地址和 Hermes Agent 下载地址是你希望公开维护的地址。

## 贡献

欢迎提交 Issue 和 Pull Request。参与前请阅读 `CONTRIBUTING.md` 和 `SECURITY.md`。

## 许可证

本项目以 MIT License 开源。详见 `LICENSE`。
