import { D1DatabaseLike } from "@/lib/db/client";
import { getConfigValues } from "@/lib/config/system";
import { AiAdapter, AiConfig, AiProvider } from "./types";
import { DeepSeekAdapter } from "./adapters/deepseek";
import { DoubaoAdapter } from "./adapters/doubao";
import { OpenAiAdapter } from "./adapters/openai";
import { AnthropicAdapter } from "./adapters/anthropic";

export * from "./types";

export async function getAiConfig(
  db: D1DatabaseLike,
): Promise<AiConfig | null> {
  const values = await getConfigValues(db, [
    "ai.enabled",
    "ai.provider",
    "ai.model",
    "ai.api_key",
    "ai.api_base",
    "ai.temperature",
    "ai.max_tokens",
    "ai.timeout",
  ]);

  const enabled = values["ai.enabled"] === "1";
  if (!enabled) {
    return null;
  }

  const apiKey = values["ai.api_key"]?.trim();
  if (!apiKey) {
    return null;
  }

  const provider = (values["ai.provider"] || "deepseek") as AiProvider;
  const model = values["ai.model"]?.trim() || getDefaultModel(provider);
  const apiBase = values["ai.api_base"]?.trim() || undefined;
  const temperature = parseFloat(values["ai.temperature"] || "0.1");
  const maxTokens = parseInt(values["ai.max_tokens"] || "2000", 10);
  const timeout = parseInt(values["ai.timeout"] || "30000", 10);

  return {
    enabled: true,
    provider,
    model,
    apiKey,
    apiBase,
    temperature: Number.isFinite(temperature) ? temperature : 0.1,
    maxTokens: Number.isFinite(maxTokens) ? maxTokens : 2000,
    timeout: Number.isFinite(timeout) ? timeout : 30000,
  };
}

export function getAiAdapter(provider: AiProvider): AiAdapter {
  switch (provider) {
    case "openai":
      return new OpenAiAdapter();
    case "anthropic":
      return new AnthropicAdapter();
    case "doubao":
      return new DoubaoAdapter();
    case "deepseek":
      return new DeepSeekAdapter();
    case "custom":
      // 自定义适配器可以使用 OpenAI 兼容格式
      return new OpenAiAdapter();
    default:
      throw new Error(`不支持的 AI 提供商: ${provider}`);
  }
}

function getDefaultModel(provider: AiProvider): string {
  switch (provider) {
    case "openai":
      return "gpt-4o-mini";
    case "anthropic":
      return "claude-3-5-haiku-20241022";
    case "doubao":
      return "doubao-pro-32k";
    case "deepseek":
      return "deepseek-chat";
    case "custom":
      return "custom-model";
    default:
      return "unknown";
  }
}
