# 更新日志

本文件记录 LyHermes 桌面端的重要变更。版本号遵循 `主版本.次版本.修订版本`，发布 Windows 在线更新时，需要同步上传安装包、blockmap 和 `latest.yml`。

## [1.0.2] - 2026-05-25

### 修复

- 修复 Windows 在线更新或重新安装时可能清空桌面端配置的问题。安装器不再在静默卸载/升级过程中删除 `$PROFILE\.lyhermes`，手动卸载时才询问是否删除桌面端设置和 Hermes Agent 数据。

## [1.0.1] - 2026-05-25

### 新增

- 新增工具管理模块，可查看内置工具风险说明，并管理 MCP 服务。
- MCP 服务支持新增、编辑、删除、测试连接。
- 新增 MCP 说明 AI 解析，可把安装说明自动转换成 MCP 配置草稿。
- 新增 MCP 配置模板，下拉选择数据库工具箱、本地命令或 HTTP 服务。
- 新增员工创建时的 AI 灵魂设定生成，支持名称、显示名称、角色和灵魂设定一起生成。
- 新增聊天消息单条删除功能，可删除历史会话中的指定消息。

### 优化

- MCP 新增和编辑改为弹窗交互，页面默认只保留服务列表。
- 长期记忆默认上限调整为 `12200`，用户画像默认上限调整为 `5375`。
- 管理页记忆读写改为直接使用 Hermes 的记忆文件，去掉不再需要的 memories 表逻辑。
- 日程提醒的会话结果加载更稳，避免提醒到达时结果还未写完导致点开为空。
- 本地模式和远程模式切换时隔离工作区状态，减少串数据和缓存冲突。
- Windows 安装包文件名统一为英文：`LyHermes-Setup-${version}.exe`。

### 修复

- 修复 Windows 下 Hermes Agent 终端环境找 WSL bash 的问题，优先使用 Git Bash 路径。
- 修复 AI 解析 MCP、AI 创建角色会写入聊天历史的问题，内部 AI 生成改为直连模型服务商。
- 修复 MCP 模板下拉选择后仍显示占位文案的问题。
- 修复已安装版本通过在线更新升级时中文安装包文件名可能导致乱码的问题。

### 发布产物

- Windows x64 安装包：`LyHermes-Setup-1.0.1.exe`
- 增量更新块映射：`LyHermes-Setup-1.0.1.exe.blockmap`
- 在线更新配置：`latest.yml`

## [1.0.0] - 2026-05-24

### 新增

- 发布 LyHermes Windows 1.0.0 安装包。
- 支持 Electron 桌面端管理 Hermes Agent 员工、对话、设置和日程。
- 支持本地模式和远程 Web 访问模式。
- 支持在线更新所需的 `latest.yml`、安装包和 blockmap 产物。

### 已知说明

- 在线更新目录需要同时放置 `latest.yml`、对应版本安装包和 `.blockmap` 文件。
- IIS 托管 `latest.yml` 时需要为 `.yml` / `.yaml` 增加 MIME 映射。

## 发布检查清单

每次发布 Windows 更新前建议确认：

- `package.json` 版本号已更新。
- `npm run dist:win` 构建通过。
- `dist/latest.yml` 中的 `version`、`path`、`sha512` 与安装包匹配。
- 上传 `latest.yml`、`LyHermes-Setup-x.y.z.exe`、`LyHermes-Setup-x.y.z.exe.blockmap` 到更新目录。
- 线上访问 `latest.yml` 不乱码，且返回内容类型可被下载或读取。
