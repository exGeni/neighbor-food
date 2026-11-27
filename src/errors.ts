// One table of error codes. The README has a troubleshooting heading for each; a test checks
// the two match. Texts live with the translations.
export const ERROR_CODES = [
  'NF-BUILD-CONFIG-JSON',
  'NF-BUILD-CONFIG-FIELD',
  'NF-BUILD-CONFIG-SECRET',
  'NF-AUTH-OFF',
  'NF-AUTH-LIMIT',
  'NF-KEY-BLOCKED',
  'NF-NEW-REFUSED',
  'NF-NEW-UNCONFIRMED',
  'NF-ENTRY-DENIED',
  'NF-LIVE-STOPPED',
  'NF-NET-UNCONFIRMED',
  'NF-QUOTA',
  'NF-EMU-DOWN',
  'NF-UNEXPECTED',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

/** Codes the page shows to people (build codes only appear in the build log). */
export type ScreenErrorCode = Exclude<ErrorCode, 'NF-BUILD-CONFIG-JSON' | 'NF-BUILD-CONFIG-FIELD' | 'NF-BUILD-CONFIG-SECRET'>;

export class StoreError extends Error {
  constructor(
    readonly code: ScreenErrorCode,
    /** The database SDK's own code, safe to log: it never carries addresses or keys. */
    readonly sdkCode = '',
  ) {
    super(code);
    this.name = 'StoreError';
  }
}

/** Log without the address, entrance key, organiser code, names or post text. */
export function logProblem(operation: string, error: unknown): void {
  const code = error instanceof StoreError ? error.code : 'NF-UNEXPECTED';
  const sdk = error instanceof StoreError ? error.sdkCode : (error as { name?: string } | null)?.name ?? '';
  console.warn(`[neighbor-food] ${operation}: ${code}${sdk ? ` (${sdk})` : ''}`);
}
