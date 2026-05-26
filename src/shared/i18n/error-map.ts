import type { TFunction } from 'i18next'

const EXACT_ERROR_KEYS: Record<string, string> = {
  '请输入密码': 'passwordRequired',
  '密码错误': 'wrongPassword',
  '尚未初始化，请先完成初始设置': 'notInitialized',
  '请先登录': 'loginRequired',
  '用户不存在': 'userNotFound',
  '旧密码错误': 'wrongOldPassword',
  '新密码至少4个字符': 'passwordTooShort',
  '密码至少4个字符': 'setupPasswordTooShort',
  '创建用户失败': 'createUserFailed',
  '无效的员工名称': 'invalidProfileName',
  '没有可用端口': 'noAvailablePort',
  '不能删除默认员工': 'cannotDeleteDefault',
  '不能重命名默认员工': 'cannotRenameDefault',
  '无效的环境变量': 'invalidEnvVar',
  '记忆不存在': 'memoryNotFound',
  '条目不存在': 'entryNotFound',
  '不能使用 default 作为员工名称': 'reservedName',
  '员工名称只能包含小写字母、数字、下划线和连字符，且以字母或数字开头': 'invalidNameFormat',
  '新名称只能包含英文字母、数字、下划线和连字符': 'invalidRename',
  '请求失败': 'requestFailed',
  '聊天失败': 'chatFailed',
  '未登录': 'notLoggedIn',
  '远程访问未开启': 'remoteDisabled',
  '消息不存在': 'messageNotFound',
  '无效的技能 ID': 'invalidSkillId',
  '技能不存在或未安装': 'skillNotInstalled',
  '不是有效的落云.Hermes 桌面端数据备份': 'backupInvalid',
  '插件不存在': 'pluginNotFound',
  '未找到元数据文件': 'metadataNotFound',
  '模型配置不存在': 'modelNotFound',
  '相同 provider+model 的配置已存在': 'modelDuplicate',
  '无效的图片数据': 'invalidImage',
  '请输入要创建的人物、角色或岗位': 'soulPromptRequired',
  '模型没有生成灵魂设定，请换个描述再试': 'soulGenerateFailed',
  '请输入 MCP 说明': 'mcpDescRequired',
  '下载超时': 'downloadTimeout',
  '未找到 Hermes 虚拟环境 Python，无法执行无 Git 更新，请重新安装引擎': 'pythonNotFound',
  '下载的文件不是有效 ZIP，请检查网络': 'invalidZip',
  'ZIP 文件校验失败': 'zipVerifyFailed',
  '解压后的目录结构不符合预期': 'unzipFailed',
  '更新超时，请检查网络连接后重试': 'updateTimeout',
  '验证失败': 'verifyFailed',
  '未配置远程连接': 'remoteNotConfigured',
  '请求超时': 'requestTimeout',
  'Token 无效或远程访问未开启': 'invalidToken',
  '远程聊天超时': 'remoteChatTimeout',
  '员工未配置端口': 'profileNoPort',
  '员工不存在': 'profileNotFound',
  'MCP 名称只能包含字母、数字、下划线和连字符': 'mcpNameInvalid',
  'stdio MCP 需要填写 command': 'mcpStdioRequired',
  'HTTP/SSE MCP 需要填写 URL': 'mcpUrlRequired',
  '请选择至少一个授权员工': 'mcpProfileRequired',
  '无效的 MCP 名称': 'mcpNameInvalidShort',
  'MCP 服务不存在': 'mcpNotFound',
  '审批请求不存在或已过期': 'approvalNotFound',
  '审批请求超时': 'approvalTimeout',
  '远程模式不支持本地 CLI 回退': 'remoteCliFallback',
  '已初始化，请使用修改密码功能': 'alreadyInitialized',
  'Invalid session ID': 'invalidSessionId',
  'Invalid message ID': 'invalidMessageId',
}

const ERROR_PATTERNS: Array<{ re: RegExp; key: string; groups?: string[] }> = [
  { re: /^员工 (.+) 已存在$/, key: 'profileExists', groups: ['name'] },
  { re: /^技能 (.+) 不存在$/, key: 'skillNotFound', groups: ['name'] },
  { re: /^无效的环境变量名: (.+)$/, key: 'invalidEnvVarName', groups: ['key'] },
  { re: /^超出记忆容量限制 \((\d+)\/(\d+)\)$/, key: 'memoryCapacityExceeded', groups: ['current', 'limit'] },
]

export function translateError(error: string | undefined | null, t: TFunction): string {
  if (!error) return ''
  const exactKey = EXACT_ERROR_KEYS[error]
  if (exactKey) return t(`errors.${exactKey}`)
  for (const pattern of ERROR_PATTERNS) {
    const match = error.match(pattern.re)
    if (match) {
      const params: Record<string, string> = {}
      pattern.groups?.forEach((group, index) => {
        params[group] = match[index + 1] || ''
      })
      return t(`errors.${pattern.key}`, params)
    }
  }
  return error
}
