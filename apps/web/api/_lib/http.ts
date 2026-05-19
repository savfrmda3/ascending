import { ZodError } from "zod";

export interface ApiRequest {
  method?: string;
  url?: string;
  query?: Record<string, string | string[]>;
  headers: Record<string, string | string[] | undefined>;
  body?: unknown;
  on?: (...args: unknown[]) => unknown;
}

export interface ApiResponse {
  status: (code: number) => ApiResponse;
  json: (body: unknown) => void;
  send: (body: unknown) => void;
  setHeader: (name: string, value: string) => void;
}

export class ApiError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown
  ) {
    super(message);
  }
}

export function badRequest(message: string, details?: unknown) {
  return new ApiError(400, "BAD_REQUEST", message, details);
}

export function unauthorized(message = "Unauthorized") {
  return new ApiError(401, "UNAUTHORIZED", message);
}

export function notFound(message = "Not found") {
  return new ApiError(404, "NOT_FOUND", message);
}

export function conflict(message: string) {
  return new ApiError(409, "CONFLICT", message);
}

export function payloadTooLarge(message = "Request body is too large") {
  return new ApiError(413, "PAYLOAD_TOO_LARGE", message);
}

export function tooManyRequests(message = "Too many requests") {
  return new ApiError(429, "RATE_LIMITED", message);
}

export function sendData(res: ApiResponse, data: unknown, status = 200) {
  res.status(status).json({ data });
}

export function sendError(res: ApiResponse, error: unknown) {
  if (error instanceof ZodError) {
    res.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        message: "Request validation failed",
        details: error.flatten()
      }
    });
    return;
  }

  if (error instanceof ApiError) {
    res.status(error.statusCode).json({
      error: {
        code: error.code,
        message: error.message,
        details: error.details
      }
    });
    return;
  }

  const message = error instanceof Error ? error.message : "Unexpected server error";
  res.status(500).json({
    error: {
      code: "INTERNAL_ERROR",
      message
    }
  });
}

export async function readBody<T = unknown>(req: ApiRequest): Promise<T> {
  const maxBytes = 64 * 1024;
  if (req.body) {
    if (typeof req.body === "string") {
      if (Buffer.byteLength(req.body, "utf8") > maxBytes) throw payloadTooLarge();
      try {
        return JSON.parse(req.body) as T;
      } catch (error) {
        throw badRequest("Invalid JSON body", error);
      }
    }
    return req.body as T;
  }

  if (!req.on) return {} as T;

  const chunks: Buffer[] = [];
  let size = 0;
  await new Promise<void>((resolve, reject) => {
    req.on?.("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > maxBytes) {
        reject(payloadTooLarge());
        return;
      }
      chunks.push(chunk);
    });
    req.on?.("end", () => resolve());
    req.on?.("error", reject);
  });

  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) return {} as T;
  try {
    return JSON.parse(raw) as T;
  } catch (error) {
    throw badRequest("Invalid JSON body", error);
  }
}

export function getBearerToken(req: ApiRequest) {
  const header = req.headers.authorization;
  const value = Array.isArray(header) ? header[0] : header;
  return value?.startsWith("Bearer ") ? value.slice("Bearer ".length) : null;
}
