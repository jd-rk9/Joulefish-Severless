export interface SimplifyRequest {
  text: string;
  model?: string;
  mode?: "plain" | "easy" | string;
}

export interface SimplifyResponse {
  originalText: string;
  simplifiedText: string;
  language: string;
  styleApplied: string;
  modelUsed: string;
  modeUsed?: string;
}
