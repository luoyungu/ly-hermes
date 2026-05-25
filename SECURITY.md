# 安全策略

LyHermes 会处理模型 API Key、远程访问 token、用户密码 hash、聊天记录和本地 Hermes Agent 数据。请不要在公开 Issue、PR、截图或日志中提交这些信息。

## 报告漏洞

如果你发现安全问题，请优先通过私下渠道联系维护者，不要直接公开可利用细节。报告中建议包含：

- 影响版本或提交；
- 复现步骤；
- 影响范围；
- 你认为可行的修复方向。

维护者确认问题后，会尽快给出修复计划和公开说明。

## 敏感数据

提交前请确认仓库中不包含：

- `.env`、`.env.local` 或任何真实 API Key；
- 远程服务 `api_token`、员工 Web 访问 token；
- SQLite 数据库、聊天记录、用户密码 hash；
- 打包签名证书、私钥、mobile provision；
- `~/.hermes`、`~/.lyhermes`、`~/.lyhermes-server` 中的运行数据；
- 构建产物和安装包。

建议在公开仓库前运行：

```bash
gitleaks detect --source .
```

如果发现密钥已经进入 Git 历史，请立即吊销并重新生成密钥，再清理历史记录。
