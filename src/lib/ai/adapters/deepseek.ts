import { BaseAiAdapter } from "./base";
import { AiConfig, AiMessage, AiResponse, AiOcrResult } from "../types";

export class DeepSeekAdapter extends BaseAiAdapter {
  async chat(messages: AiMessage[], config: AiConfig): Promise<AiResponse> {
    const apiBase = config.apiBase || "https://api.deepseek.com/v1";
    const url = `${apiBase}/chat/completions`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, config.timeout || 30000);

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify({
          model: config.model || "deepseek-chat",
          messages,
          temperature: config.temperature ?? 0.1,
          max_tokens: config.maxTokens || 2000,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`DeepSeek API 错误 (${response.status}): ${errorText}`);
      }

      const data = (await response.json()) as {
        choices?: Array<{
          message?: {
            content?: string;
          };
        }>;
        usage?: {
          prompt_tokens?: number;
          completion_tokens?: number;
          total_tokens?: number;
        };
      };

      const content = data.choices?.[0]?.message?.content || "";

      return {
        content,
        usage: data.usage
          ? {
              promptTokens: data.usage.prompt_tokens || 0,
              completionTokens: data.usage.completion_tokens || 0,
              totalTokens: data.usage.total_tokens || 0,
            }
          : undefined,
      };
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async extractFromImage(
    imageBase64: string,
    config: AiConfig,
  ): Promise<AiOcrResult> {
    throw new Error(
      "DeepSeek 暂不支持图片识别功能，请使用 OpenAI、Anthropic 或豆包。",
    );
  }
}
