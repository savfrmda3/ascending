import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly details?: unknown;

  constructor(statusCode: number, code: string, message: string, details?: unknown) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

export function notFound(message = "Resource not found") {
  return new AppError(404, "NOT_FOUND", message);
}

export function conflict(message: string) {
  return new AppError(409, "CONFLICT", message);
}

export function badRequest(message: string, details?: unknown) {
  return new AppError(400, "BAD_REQUEST", message, details);
}

export function unauthorized(message = "Unauthorized") {
  return new AppError(401, "UNAUTHORIZED", message);
}

export function tooManyRequests(message = "Too many requests") {
  return new AppError(429, "RATE_LIMITED", message);
}

export function asyncHandler<T extends Request>(
  handler: (req: T, res: Response, next: NextFunction) => Promise<unknown>
) {
  return (req: T, res: Response, next: NextFunction) => {
    handler(req, res, next).catch(next);
  };
}

export function errorHandler(error: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (isBodyParserError(error)) {
    return res.status(error.status).json({
      error: {
        code: error.status === 413 ? "PAYLOAD_TOO_LARGE" : "BAD_REQUEST",
        message: error.status === 413 ? "Request body is too large" : "Invalid JSON body"
      }
    });
  }

  if (error instanceof ZodError) {
    return res.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid request data",
        details: error.flatten()
      }
    });
  }

  if (error instanceof AppError) {
    return res.status(error.statusCode).json({
      error: {
        code: error.code,
        message: error.message,
        details: error.details
      }
    });
  }

  console.error(error);
  return res.status(500).json({
    error: {
      code: "INTERNAL_ERROR",
      message: "Unexpected server error"
    }
  });
}

function isBodyParserError(error: unknown): error is { status: number; type?: string } {
  if (!error || typeof error !== "object") return false;
  const status = (error as { status?: unknown }).status;
  return status === 400 || status === 413;
}
