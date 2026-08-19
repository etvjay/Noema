// Exit code contract for the noema CLI. Every command maps its outcome to one
// of these codes so scripts can distinguish cases programmatically.

export const EXIT = {
  VALID: 0,
  INVALID: 1,
  UNRESOLVED: 2,
  SOURCE_FAILURE: 3,
  VERIFICATION_FAILURE: 4,
  UNSUPPORTED_VERSION: 5,
  USAGE: 64,
  INTERNAL: 70
} as const;

export type ExitCode = (typeof EXIT)[keyof typeof EXIT];

export const EXIT_LABELS: Record<ExitCode, string> = {
  [EXIT.VALID]: "VALID",
  [EXIT.INVALID]: "INVALID",
  [EXIT.UNRESOLVED]: "UNRESOLVED",
  [EXIT.SOURCE_FAILURE]: "SOURCE_FAILURE",
  [EXIT.VERIFICATION_FAILURE]: "VERIFICATION_FAILURE",
  [EXIT.UNSUPPORTED_VERSION]: "UNSUPPORTED_VERSION",
  [EXIT.USAGE]: "USAGE",
  [EXIT.INTERNAL]: "INTERNAL"
};

export interface CommandOutput {
  code: ExitCode;
  summary: string;
  details: Record<string, unknown>;
}

export function output(code: ExitCode, summary: string, details: Record<string, unknown> = {}): CommandOutput {
  return { code, summary, details };
}

export class UsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UsageError";
  }
}

export function usageError(message: string): CommandOutput {
  return output(EXIT.USAGE, message, { usageError: message });
}

export function internalError(error: unknown): CommandOutput {
  const message = error instanceof Error ? error.message : String(error);
  return output(EXIT.INTERNAL, `internal error: ${message}`, { error: message });
}