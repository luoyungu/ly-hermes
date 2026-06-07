export interface ProviderModelOption {
  id: string;
  label: string;
}

export interface ProviderDefinition {
  /** LyHermes UI / 保存模型时使用的 id */
  id: string;
  /** Hermes Agent config.yaml 中使用的原生 provider id */
  hermesId: string;
  label: string;
  baseUrl: string;
  envKey: string;
  baseEnvKey?: string;
  apiKeyLabel: string;
  models: ProviderModelOption[];
}

export const PROVIDER_DEFINITIONS: ProviderDefinition[] = [
  {
    id: "deepseek",
    hermesId: "deepseek",
    label: "DeepSeek",
    baseUrl: "https://api.deepseek.com/v1",
    envKey: "DEEPSEEK_API_KEY",
    baseEnvKey: "DEEPSEEK_BASE_URL",
    apiKeyLabel: "DeepSeek API 密钥",
    models: [
      { id: "deepseek-v4-flash", label: "DeepSeek V4 Flash" },
      { id: "deepseek-v4-pro", label: "DeepSeek V4 Pro" },
      { id: "deepseek-chat", label: "DeepSeek Chat (即将停用)" },
      { id: "deepseek-reasoner", label: "DeepSeek Reasoner (即将停用)" },
    ],
  },
  {
    id: "qwen",
    hermesId: "alibaba",
    label: "通义千问 (阿里云)",
    baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    envKey: "DASHSCOPE_API_KEY",
    baseEnvKey: "DASHSCOPE_BASE_URL",
    apiKeyLabel: "通义千问 API 密钥",
    models: [
      { id: "qwen3.6-plus", label: "Qwen3.6 Plus" },
      { id: "qwen3.6-max-preview", label: "Qwen3.6 Max Preview" },
      { id: "qwen3.6-flash", label: "Qwen3.6 Flash" },
      { id: "qwen3-max", label: "Qwen3 Max" },
      { id: "qwen3-235b-a22b", label: "Qwen3 235B" },
      { id: "qwq-plus", label: "QwQ Plus" },
      { id: "qwen-long", label: "Qwen Long" },
    ],
  },
  {
    id: "zhipu",
    hermesId: "zai",
    label: "智谱 AI",
    baseUrl: "https://open.bigmodel.cn/api/paas/v4",
    envKey: "GLM_API_KEY",
    baseEnvKey: "GLM_BASE_URL",
    apiKeyLabel: "智谱 API 密钥",
    models: [
      { id: "glm-5.1", label: "GLM-5.1" },
      { id: "glm-5", label: "GLM-5" },
      { id: "glm-4.7", label: "GLM-4.7" },
      { id: "glm-4.5", label: "GLM-4.5" },
      { id: "glm-4.5-air", label: "GLM-4.5 Air" },
    ],
  },
  {
    id: "moonshot",
    hermesId: "moonshot",
    label: "月之暗面 (Kimi)",
    baseUrl: "https://api.moonshot.cn/v1",
    envKey: "MOONSHOT_API_KEY",
    baseEnvKey: "MOONSHOT_BASE_URL",
    apiKeyLabel: "Moonshot API 密钥",
    models: [
      { id: "kimi-k2.5", label: "Kimi K2.5" },
      { id: "kimi-k2-0905-preview", label: "Kimi K2 0905" },
      { id: "kimi-k2-thinking", label: "Kimi K2 Thinking" },
      { id: "moonshot-v1-128k", label: "Moonshot V1 128K" },
      { id: "moonshot-v1-32k", label: "Moonshot V1 32K" },
    ],
  },
  {
    id: "yi",
    hermesId: "yi",
    label: "零一万物",
    baseUrl: "https://api.lingyiwanwu.com/v1",
    envKey: "YI_API_KEY",
    baseEnvKey: "YI_BASE_URL",
    apiKeyLabel: "零一万物 API 密钥",
    models: [
      { id: "yi-lightning", label: "Yi Lightning" },
      { id: "yi-large", label: "Yi Large" },
    ],
  },
  {
    id: "minimax",
    hermesId: "minimax",
    label: "MiniMax",
    baseUrl: "https://api.minimax.chat/v1",
    envKey: "MINIMAX_API_KEY",
    baseEnvKey: "MINIMAX_BASE_URL",
    apiKeyLabel: "MiniMax API 密钥",
    models: [
      { id: "MiniMax-M2.5", label: "MiniMax M2.5" },
      { id: "MiniMax-Text-01", label: "MiniMax Text 01" },
    ],
  },
  {
    id: "spark",
    hermesId: "spark",
    label: "讯飞星火",
    baseUrl: "https://spark-api-open.xf-yun.com/v1",
    envKey: "SPARK_API_KEY",
    baseEnvKey: "SPARK_BASE_URL",
    apiKeyLabel: "讯飞星火 API 密钥",
    models: [
      { id: "4.0Ultra", label: "星火 4.0 Ultra" },
      { id: "spark-x", label: "星火 X1.5 (深度推理)" },
      { id: "generalv3.5", label: "星火 Max" },
    ],
  },
  {
    id: "siliconflow",
    hermesId: "siliconflow",
    label: "硅基流动",
    baseUrl: "https://api.siliconflow.cn/v1",
    envKey: "SILICONFLOW_API_KEY",
    baseEnvKey: "SILICONFLOW_BASE_URL",
    apiKeyLabel: "硅基流动 API 密钥",
    models: [
      { id: "deepseek-ai/DeepSeek-V3", label: "DeepSeek V3" },
      { id: "deepseek-ai/DeepSeek-R1", label: "DeepSeek R1" },
      { id: "Qwen/Qwen3-235B-A22B", label: "Qwen3 235B" },
      { id: "Qwen/Qwen3-32B", label: "Qwen3 32B" },
      { id: "THUDM/GLM-4-32B-0414", label: "GLM-4 32B" },
    ],
  },
  {
    id: "ernie",
    hermesId: "ernie",
    label: "百度文心",
    baseUrl: "https://qianfan.baidubce.com/v2",
    envKey: "QIANFAN_API_KEY",
    baseEnvKey: "QIANFAN_BASE_URL",
    apiKeyLabel: "百度千帆 API 密钥",
    models: [
      { id: "ernie-4.5-8k", label: "ERNIE 4.5" },
      { id: "ernie-4.0-8k", label: "ERNIE 4.0" },
      { id: "ernie-speed-128k", label: "ERNIE Speed 128K" },
      { id: "ernie-lite-8k", label: "ERNIE Lite" },
    ],
  },
];

const LY_PROVIDER_BY_ID = new Map(PROVIDER_DEFINITIONS.map((item) => [item.id, item]));
const LY_PROVIDER_BY_HERMES_ID = new Map<string, ProviderDefinition>();
for (const item of PROVIDER_DEFINITIONS) {
  if (!LY_PROVIDER_BY_HERMES_ID.has(item.hermesId)) {
    LY_PROVIDER_BY_HERMES_ID.set(item.hermesId, item);
  }
}

export const PROVIDER_KEY_MAP: Record<string, { envKey: string; baseUrl: string; baseEnvKey?: string }> =
  Object.fromEntries(
    PROVIDER_DEFINITIONS.map((item) => [
      item.id,
      { envKey: item.envKey, baseUrl: item.baseUrl, baseEnvKey: item.baseEnvKey },
    ]),
  );

export function getProviderDefinition(provider: string): ProviderDefinition | undefined {
  return LY_PROVIDER_BY_ID.get(provider) || LY_PROVIDER_BY_HERMES_ID.get(provider);
}

export function resolveLyProviderId(provider: string): string {
  if (!provider || provider === "custom") return provider;
  const def = getProviderDefinition(provider);
  return def?.id || provider;
}

export function toHermesNativeProvider(provider: string): string {
  if (!provider || provider === "custom") return "custom";
  const def = getProviderDefinition(provider);
  if (def) return def.hermesId;
  if (LY_PROVIDER_BY_HERMES_ID.has(provider)) return provider;
  return "custom";
}

export function toHermesConfigProvider(provider: string): string {
  return toHermesNativeProvider(resolveLyProviderId(provider));
}

export function getProviderEnvKey(provider: string): string {
  const lyId = resolveLyProviderId(provider);
  return PROVIDER_KEY_MAP[lyId]?.envKey || "OPENAI_API_KEY";
}

export function getProviderDisplayLabel(provider: string): string {
  const def = getProviderDefinition(provider);
  if (def) return def.label;
  return provider;
}

export function getPresetEnvSyncKeys(): string[] {
  const keys = new Set<string>([
    "HERMES_INFERENCE_PROVIDER",
    "OPENAI_API_KEY",
    "CUSTOM_API_KEY",
    "OPENAI_BASE_URL",
    "CUSTOM_API_BASE_URL",
    "CUSTOM_BASE_URL",
  ]);
  for (const item of PROVIDER_DEFINITIONS) {
    keys.add(item.envKey);
    if (item.baseEnvKey) keys.add(item.baseEnvKey);
  }
  return [...keys];
}
