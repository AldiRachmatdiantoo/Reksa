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

export class PayloadTooLargeError extends AppError {
  constructor(message = 'Ukuran file melebihi batas') {
    super(413, 'PAYLOAD_TOO_LARGE', message);
  }
}

/** Isi file (dicek dari magic bytes, bukan nama/Content-Type) bukan tipe yang diterima. */
export class UnsupportedMediaTypeError extends AppError {
  constructor(message = 'Tipe file tidak didukung') {
    super(415, 'UNSUPPORTED_MEDIA_TYPE', message);
  }
}

/** Input lolos validasi format, tapi isinya tidak bisa diproses (mis. PDF tanpa teks). */
export class UnprocessableEntityError extends AppError {
  constructor(message = 'Data tidak bisa diproses') {
    super(422, 'UNPROCESSABLE_ENTITY', message);
  }
}

export class TooManyRequestsError extends AppError {
  constructor(message = 'Terlalu banyak permintaan, coba lagi nanti') {
    super(429, 'TOO_MANY_REQUESTS', message);
  }
}

/** Layanan pihak ketiga (mis. penyedia AI) sedang tidak bisa dipakai. Pesannya aman ditampilkan ke pengguna. */
export class ServiceUnavailableError extends AppError {
  constructor(message = 'Layanan sedang tidak tersedia, coba lagi nanti', code = 'SERVICE_UNAVAILABLE') {
    super(503, code, message);
  }
}
