// WSPÓLNA OBSŁUGA ŻĄDAŃ DLA FUNKCJI SERWEROWYCH
//
// Trzy funkcje brzegowe powtarzały ten sam nagłówek CORS i tę samą obsługę
// odpowiedzi. Teraz jest to w jednym miejscu.

export const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export function json(body: unknown, status = 200, extraHeaders?: HeadersInit): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json', ...extraHeaders },
  });
}

/**
 * Adres, z którego przyszło żądanie. Za serwerem pośredniczącym prawdziwy
 * adres siedzi w nagłówku `x-forwarded-for`; bierzemy pierwszy z listy.
 * Służy wyłącznie do liczenia limitu zapytań — nigdzie go nie zapisujemy.
 */
export function clientIp(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return req.headers.get('cf-connecting-ip') ?? 'nieznany';
}

/** Czy to środowisko lokalne — decyduje, czy wolno pokazać link bez maila. */
export function isLocalEnvironment(): boolean {
  const url = Deno.env.get('SUPABASE_URL') ?? '';
  return url.includes('kong:8000') || url.includes('localhost') || url.includes('127.0.0.1');
}
