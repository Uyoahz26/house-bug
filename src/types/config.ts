export type ConfigCategory =
  | "general"
  | "storage"
  | "ocr"
  | "email"
  | "cron"
  | "ai"
  | "openclaw";

export interface SystemConfigRecord {
  key: string;
  value: string;
  description: string | null;
  category: ConfigCategory;
  is_secret: number;
  updated_at: string;
  updated_by: string | null;
}

export interface PublicSystemConfig {
  key: string;
  value: string;
  description: string | null;
  category: ConfigCategory;
  isSecret: boolean;
  hasValue: boolean;
  updatedAt: string;
  updatedBy: string | null;
}
