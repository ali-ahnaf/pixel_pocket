/**
 * Intentional, expected failures raised from the service layer.
 *
 * The global error handler maps an `AppError` to its `statusCode` + `message`.
 * Anything else that bubbles up is treated as an unexpected 500.
 */
export class AppError extends Error {
  readonly statusCode: number;

  /**
   * Optional machine-readable cause, used when the failure comes from an upstream
   * API that returns its own error identifier (e.g. Google's `invalid_grant`), so
   * callers can branch on it instead of string-matching `message`.
   */
  readonly code?: string;

  constructor(message: string, statusCode = 400, code?: string) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    Object.setPrototypeOf(this, AppError.prototype);
  }
}
