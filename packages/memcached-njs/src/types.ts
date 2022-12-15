export type DefaultLogger = Record<
  "error" | "debug" | "info" | "warn",
  (msg: string, ...rest: string[]) => void
>;

export type PendingData = {
  cmdTokens: string[];
  data: string | Buffer;
  cmd?: string;
};
