export class DomainError extends Error {
  code: string; status: number; details?: Record<string, unknown>;
  constructor(code: string, message: string, status = 409, details?: Record<string, unknown>) {
    super(message); this.code = code; this.status = status; this.details = details;
  }
}
export function requireRule(condition: unknown, code: string, message: string, status = 409): asserts condition {
  if (!condition) throw new DomainError(code, message, status);
}
export function decimal(value: unknown, bits: 64 | 128 = 128): bigint {
  requireRule(typeof value === 'string' && /^(0|[1-9][0-9]*)$/.test(value), 'INVALID_INPUT', 'Expected a canonical decimal integer.', 422);
  const n = BigInt(value); requireRule(n < (1n << BigInt(bits)), 'INVALID_INPUT', `Integer exceeds u${bits}.`, 422); return n;
}
export function account(value: unknown): asserts value is string {
  requireRule(typeof value === 'string' && value.length >= 2 && value.length <= 64 && /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/.test(value), 'INVALID_INPUT', 'Invalid NEAR account identifier.', 422);
}
export const uuid = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value);
export const nowNs = () => BigInt(Date.now()) * 1_000_000n;
