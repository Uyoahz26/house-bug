import { BaseAiAdapter } from "./base";
import { AiConfig, AiMessage, AiResponse } from "../types";

export class DoubaoAdapter extends BaseAiAdapter {
  async chat(messages: AiMessage[], config: AiConfig): Promise<AiResponse> {
    const apiBase =
      config.apiBase || "https://ark.cn-beijing.volces.com/api/v3";
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
          model: config.model || "doubao-pro-32k",
          messages,
          temperature: config.temperature ?? 0.1,
          max_tokens: config.maxTokens || 2000,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`豆包 API 错误 (${response.status}): ${errorText}`);
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
}
