import { BaseAiAdapter } from "./base";
import { AiConfig, AiMessage, AiResponse } from "../types";

export class AnthropicAdapter extends BaseAiAdapter {
  async chat(messages: AiMessage[], config: AiConfig): Promise<AiResponse> {
    const apiBase = config.apiBase || "https://api.anthropic.com/v1";
    const url = `${apiBase}/messages`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, config.timeout || 30000);

    try {
      // Anthropic 需要分离 system 消息
      const systemMessage = messages.find((m) => m.role === "system");
      const userMessages = messages.filter((m) => m.role !== "system");

      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": config.apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: config.model || "claude-3-5-haiku-20241022",
          max_tokens: config.maxTokens || 2000,
          temperature: config.temperature ?? 0.1,
          system: systemMessage?.content || undefined,
          messages: userMessages,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Anthropic API 错误 (${response.status}): ${errorText}`,
        );
      }

      const data = (await response.json()) as {
        content?: Array<{
          type?: string;
          text?: string;
        }>;
        usage?: {
          input_tokens?: number;
          output_tokens?: number;
        };
      };

      const content = data.content?.find((c) => c.type === "text")?.text || "";

      return {
        content,
        usage: data.usage
          ? {
              promptTokens: data.usage.input_tokens || 0,
              completionTokens: data.usage.output_tokens || 0,
              totalTokens:
                (data.usage.input_tokens || 0) +
                (data.usage.output_tokens || 0),
            }
          : undefined,
      };
    } finally {
      clearTimeout(timeoutId);
    }
  }
}
