/**
 * Cookie penanda dari backend (`SESSION_HINT_COOKIE` di `authCookies.ts`): ada berarti browser ini
 * punya sesi, nilainya selalu "1" dan bukan token. Tanpa penanda, pengunjung pasti belum login, jadi
 * AuthProvider tidak perlu memanggil /auth/me lalu /auth/refresh yang sama-sama berakhir 401.
 */
export const SESSION_HINT_COOKIE = '__Host-reksa_session';

export function hasSessionHint(cookies: string = typeof document === 'undefined' ? '' : document.cookie): boolean {
  return cookies.split(';').some((part) => part.trim().startsWith(`${SESSION_HINT_COOKIE}=`));
}
