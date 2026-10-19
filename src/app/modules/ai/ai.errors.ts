export type AiProviderErrorCode = "TIMEOUT" | "QUOTA" | "UNAVAILABLE" | "INVALID_RESPONSE";

export class AiProviderError extends Error {
  public readonly code: AiProviderErrorCode;

  constructor(code: AiProviderErrorCode, message: string) {
    super(message);
    this.name = "AiProviderError";
    this.code = code;
  }
}
