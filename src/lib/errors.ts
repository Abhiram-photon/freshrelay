import { NextResponse } from 'next/server'

/** Canonical error shape: { error: { code, message, details? } } */
export class ApiError extends Error {
  status: number
  code: string
  details?: unknown

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message)
    this.status = status
    this.code = code
    this.details = details
  }

  static badRequest(message = 'Bad request', details?: unknown) {
    return new ApiError(400, 'BAD_REQUEST', message, details)
  }
  static validation(details: unknown, message = 'Validation failed') {
    return new ApiError(400, 'VALIDATION_ERROR', message, details)
  }
  static unauthenticated(message = 'Authentication required') {
    return new ApiError(401, 'UNAUTHENTICATED', message)
  }
  static forbidden(message = 'You do not have permission to do this') {
    return new ApiError(403, 'FORBIDDEN', message)
  }
  /** 404 (not 403) for object-level access failures so existence is not leaked. */
  static notFound(message = 'Not found') {
    return new ApiError(404, 'NOT_FOUND', message)
  }
  static conflict(code: string, message: string, details?: unknown) {
    return new ApiError(409, code, message, details)
  }
  static unprocessable(code: string, message: string, details?: unknown) {
    return new ApiError(422, code, message, details)
  }
  static locked(code: string, message: string, details?: unknown) {
    return new ApiError(423, code, message, details)
  }
  static tooMany(message = 'Too many requests', retryAfterSec?: number) {
    return new ApiError(429, 'RATE_LIMITED', message, retryAfterSec ? { retryAfterSec } : undefined)
  }
  static csrf(message = 'Missing or invalid CSRF token') {
    return new ApiError(403, 'CSRF_FAILED', message)
  }
}

export function errorPayload(err: unknown): { status: number; body: Record<string, unknown> } {
  if (err instanceof ApiError) {
    const body: Record<string, unknown> = {
      error: { code: err.code, message: err.message, ...(err.details !== undefined ? { details: err.details } : {}) },
    }
    return { status: err.status, body }
  }
  console.error('[api] unhandled error:', err)
  return { status: 500, body: { error: { code: 'INTERNAL', message: 'Something went wrong' } } }
}

export function errorResponse(err: unknown): NextResponse {
  const { status, body } = errorPayload(err)
  return NextResponse.json(body, { status })
}

/** Flattens Zod issues into { path, message } details for error responses. */
export function zodDetails(err: { issues: { path: (string | number | symbol)[]; message: string }[] }) {
  return err.issues.map((i) => ({ path: i.path.map(String).join('.'), message: i.message }))
}
