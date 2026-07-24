export type ChatRole = "system" | "user" | "assistant";

export type ChatMessage = {
  role: ChatRole;
  content: string;
};

export type LoadProgress = {
  progress: number;
  text: string;
};

export type CompleteOptions = {
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
  onToken?: (delta: string, full: string) => void;
  signal?: AbortSignal;
};
