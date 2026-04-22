export type AiProvider =
  | "deepseek"
  | "doubao"
  | "openai"
  | "anthropic"
  | "custom";

export interface AiConfig {
  enabled: boolean;
  provider: AiProvider;
  model: string;
  apiKey: string;
  apiBase?: string;
  temperature?: number;
  maxTokens?: number;
  timeout?: number;
}

export interface AiMessage {
  role: "system" | "user" | "assistant";
  content: string | AiMessageContent[];
}

export interface AiMessageContent {
  type: "text" | "image_url";
  text?: string;
  image_url?: {
    url: string;
  };
}

export interface AiResponse {
  content: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export interface AiOcrResult {
  name: string | null;
  brand: string | null;
  category: string | null;
  specification: string | null;
  quantity: number | null;
  itemUnit: string | null;
  productionDate: string | null;
  shelfLife: number | null;
  shelfLifeUnit: "day" | "month" | "year" | null;
  manufacturer: string | null;
  barcode: string | null;
  notes: string | null;
  rawText: string;
}

export interface AiAdapter {
  chat(messages: AiMessage[], config: AiConfig): Promise<AiResponse>;
  extractFromImage(imageBase64: string, config: AiConfig): Promise<AiOcrResult>;
}
