// Relay Gemini untuk backend di Azure Indonesia Central. Google menolak permintaan dari lokasi itu
// ("User location is not supported for the API use"), sedangkan fungsi Vercel berjalan di AS.
//
// Hanya backend REKSA yang boleh memakai relay ini: wajib header token bersama (GEMINI_RELAY_TOKEN,
// diisi di env proyek Vercel dan Container App). API key Gemini dibawa backend lewat header dan tidak
// disimpan di sini. Tujuan hanya generateContent di generativelanguage.googleapis.com. Isi permintaan
// dan jawaban tidak pernah dicatat.
//
// Rute: rewrite di vercel.json memetakan /api/gemini-relay/models/<model>:generateContent ke fungsi ini
// dengan ?model=<model>:generateContent, sehingga backend cukup mengganti GEMINI_API_BASE_URL.
import { createHash, timingSafeEqual } from 'node:crypto';

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';
const TOKEN_HEADER = 'x-reksa-relay-token';
const MODEL_ACTION = /^[a-z0-9.-]{1,64}:generateContent$/;

export const config = { maxDuration: 60 };

function json(status: number, code: string): Response {
  return new Response(JSON.stringify({ error: { code } }), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}

// Bandingkan digest berpanjangan tetap supaya waktu pembandingan tidak membocorkan isi token.
function tokenMatches(given: string | null, expected: string): boolean {
  if (!given) return false;
  const a = createHash('sha256').update(given).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b);
}

export async function POST(request: Request): Promise<Response> {
  const expected = process.env.GEMINI_RELAY_TOKEN ?? '';
  if (expected.length < 32) return json(503, 'RELAY_NOT_CONFIGURED');
  if (!tokenMatches(request.headers.get(TOKEN_HEADER), expected)) return json(401, 'UNAUTHORIZED');

  const modelAction = new URL(request.url).searchParams.get('model') ?? '';
  if (!MODEL_ACTION.test(modelAction)) return json(400, 'INVALID_MODEL');

  const apiKey = request.headers.get('x-goog-api-key');
  if (!apiKey) return json(400, 'MISSING_API_KEY');

  let upstream: Response;
  try {
    upstream = await fetch(`${GEMINI_API_BASE}/models/${modelAction}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
      body: await request.arrayBuffer(),
      signal: AbortSignal.timeout(58_000),
    });
  } catch {
    return json(504, 'UPSTREAM_UNREACHABLE');
  }

  // Status dan isi diteruskan apa adanya: backend membedakan 429 harian vs per menit dari isinya.
  return new Response(upstream.body, {
    status: upstream.status,
    headers: { 'content-type': upstream.headers.get('content-type') ?? 'application/json', 'cache-control': 'no-store' },
  });
}
