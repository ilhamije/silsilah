export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message?: string,
    public details?: unknown,
  ) {
    super(message ?? code);
    this.name = "HttpError";
  }
}

export const unauthorized = () => new HttpError(401, "unauthorized");
// Non-members get 404, not 403, so tree IDs can't be probed.
export const notFound = (what = "not_found") => new HttpError(404, what);
export const forbidden = (code = "forbidden") => new HttpError(403, code);
export const badRequest = (code: string, details?: unknown) =>
  new HttpError(400, code, code, details);

/** 409 returned when an optimistic-lock check fails. */
export class ConflictError<T = unknown> extends HttpError {
  constructor(public current: T) {
    super(409, "version_conflict", "version_conflict", current);
  }
}

export function errorResponse(err: unknown): Response {
  if (err instanceof HttpError) {
    return Response.json(
      { error: err.code, details: err.details ?? null },
      { status: err.status },
    );
  }
  console.error(err);
  return Response.json({ error: "internal_error" }, { status: 500 });
}
