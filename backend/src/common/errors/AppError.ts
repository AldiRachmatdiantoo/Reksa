export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export class BadRequestError extends AppError {
  constructor(message = 'Permintaan tidak valid', details?: unknown) {
    super(400, 'BAD_REQUEST', message, details);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Autentikasi diperlukan') {
    super(401, 'UNAUTHORIZED', message);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Akses ditolak') {
    super(403, 'FORBIDDEN', message);
  }
}

/** Also used for resources owned by someone else, so their existence is not revealed (anti-IDOR). */
export class NotFoundError extends AppError {
  constructor(message = 'Data tidak ditemukan') {
    super(404, 'NOT_FOUND', message);
  }
}

export class ConflictError extends AppError {
  constructor(message = 'Data bertentangan dengan kondisi saat ini') {
    super(409, 'CONFLICT', message);
  }
}

export class TooManyRequestsError extends AppError {
  constructor(message = 'Terlalu banyak permintaan, coba lagi nanti') {
    super(429, 'TOO_MANY_REQUESTS', message);
  }
}
