type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const RESET = '\x1b[0m';
const DIM = '\x1b[2m';
const LEVEL_COLOR: Record<LogLevel, string> = {
  debug: '\x1b[90m', // gray
  info: '\x1b[32m', // green
  warn: '\x1b[33m', // yellow
  error: '\x1b[31m', // red
};

/**
 * Minimal structured logger. Exported as a pre-built singleton instance
 * (per conventions, already-built instances are not wrapped in a class).
 * Swap the implementation for winston/pino later without touching call sites.
 *
 * Colors are applied only when stdout is a TTY, so piped/redirected logs
 * (files, CI, PM2) stay free of ANSI escape codes.
 */
export class Logger {
  private readonly useColor = process.stdout.isTTY === true;

  private paint(color: string, text: string): string {
    return this.useColor ? `${color}${text}${RESET}` : text;
  }

  /**
   * `JSON.stringify` replacer that expands `Error` values (whose `message`/`stack`
   * are non-enumerable and would otherwise serialize to `{}`) into a plain object,
   * so `logger.error('...', { err })` surfaces the real message and stack.
   */
  private serializeErrors(_key: string, value: unknown): unknown {
    if (value instanceof Error) {
      return { ...value, name: value.name, message: value.message, stack: value.stack };
    }
    return value;
  }

  private write(level: LogLevel, message: string, meta?: unknown): void {
    const time = this.paint(DIM, new Date().toISOString());
    const levelLabel = this.paint(LEVEL_COLOR[level], level.toUpperCase().padEnd(5));
    const metaText = meta !== undefined ? ` ${typeof meta === 'string' ? meta : JSON.stringify(meta, this.serializeErrors)}` : '';
    const line = `${time} ${levelLabel} ${message}${metaText}`;

    if (level === 'error') {
      console.error(line);
    } else if (level === 'warn') {
      console.warn(line);
    } else {
      console.log(line);
    }
  }

  debug(message: string, meta?: unknown): void {
    this.write('debug', message, meta);
  }

  info(message: string, meta?: unknown): void {
    this.write('info', message, meta);
  }

  warn(message: string, meta?: unknown): void {
    this.write('warn', message, meta);
  }

  error(message: string, meta?: unknown): void {
    this.write('error', message, meta);
  }
}
export const logger = new Logger();
