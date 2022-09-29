export type ParserPendingData = {
  key: string;
  data?: Buffer;
  flag?: number;
  bytes?: Buffer;
  casUniq?: number;
  cmdTokens: string[];
};

export type DefaultLogger = Record<"error" | "debug" | "info" | "warn", (msg: string) => void>;
