import { randomUUID } from "node:crypto";

export type LogValue =
  | string
  | number
  | boolean
  | null
  | Date
  | Error
  | readonly LogValue[]
  | { readonly [key: string]: LogValue | undefined };

export type LogFields = Readonly<Record<string, LogValue | undefined>>;
export type LogLevel = "info" | "warn" | "error";
export type LogSink = (serializedRecord: string) => void;

export interface ObservabilityProvider {
  info(event: string, fields?: LogFields): void;
  warn(event: string, fields?: LogFields): void;
  error(event: string, fields?: LogFields): void;
}

export interface StructuredLoggerOptions {
  readonly component: string;
  readonly environment?: string;
  readonly baseFields?: LogFields;
  readonly clock?: () => Date;
  readonly sink?: LogSink;
}

const REDACTED = "[REDACTED]";
const sensitiveKey =
  /(^|_)(authorization|cookie|credential|database_url|espn_s2|password|private_import_contents|secret|session|swid|token)(_|$)/i;
const postgresUrl = /\bpostgres(?:ql)?:\/\/[^\s"']+/gi;
const bearerValue = /\bBearer\s+[A-Za-z0-9._~+/=-]+/gi;

/**
 * Creates one-line JSON logs for server functions and jobs. Callers should log
 * identifiers and counts rather than provider payloads; the sanitizer is a
 * final guard for commonly leaked credentials, not permission to log raw data.
 */
export function createStructuredLogger(options: StructuredLoggerOptions): ObservabilityProvider {
  const clock = options.clock ?? (() => new Date());
  const sink = options.sink ?? ((record) => console.log(record));

  function write(level: LogLevel, event: string, fields: LogFields = {}): void {
    sink(
      JSON.stringify({
        timestamp: clock().toISOString(),
        level,
        component: options.component,
        event,
        ...(options.environment ? { environment: options.environment } : {}),
        ...sanitizeFields(options.baseFields ?? {}),
        ...sanitizeFields(fields)
      })
    );
  }

  return {
    info: (event, fields) => write("info", event, fields),
    warn: (event, fields) => write("warn", event, fields),
    error: (event, fields) => write("error", event, fields)
  };
}

export function resolveCorrelationId(
  candidate: string | null | undefined,
  create: () => string = randomUUID
): string {
  const normalized = candidate?.trim();
  return normalized && /^[A-Za-z0-9._:-]{8,128}$/.test(normalized) ? normalized : create();
}

export function userSafeError(error: unknown): {
  readonly code: string;
  readonly message: string;
  readonly logFields: LogFields;
} {
  if (error instanceof Error) {
    return {
      code: "internal_error",
      message: "The request could not be completed. Try again or contact the administrator.",
      logFields: { errorName: error.name, errorMessage: error.message }
    };
  }
  return {
    code: "internal_error",
    message: "The request could not be completed. Try again or contact the administrator.",
    logFields: { errorType: typeof error }
  };
}

function sanitizeFields(fields: LogFields): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(fields).flatMap(([key, value]) => {
      if (value === undefined) return [];
      return [[key, sensitiveKey.test(key) ? REDACTED : sanitizeValue(value)]];
    })
  );
}

function sanitizeValue(value: LogValue): unknown {
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Error) {
    return {
      name: value.name,
      message: sanitizeString(value.message)
    };
  }
  if (typeof value === "string") return sanitizeString(value);
  if (Array.isArray(value)) return value.map((entry) => sanitizeValue(entry));
  if (value && typeof value === "object") return sanitizeFields(value as LogFields);
  return value;
}

function sanitizeString(value: string): string {
  return value.replace(postgresUrl, REDACTED).replace(bearerValue, `Bearer ${REDACTED}`);
}
