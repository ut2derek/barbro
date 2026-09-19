// CO WOLNO PRZYSŁAĆ DO FUNKCJI REZERWACJI
//
// Funkcja jest otwarta na internet, więc każde pole musi być opisane i
// sprawdzone, zanim dotknie bazy. Wcześniej sprawdzaliśmy tylko, czy pola nie
// są puste — przez co adres e-mail klienta trafiał do zapytania jako wzorzec
// wyszukiwania, a imię mogło mieć dowolną długość.

import { z } from 'npm:zod@^4.6.5';

/** Slug salonu z adresu strony: małe litery, cyfry i myślniki. */
const slug = z.string().trim().min(1).max(120).regex(/^[a-z0-9-]+$/, 'Nieprawidłowy adres salonu');

const uuid = z.string().uuid();

/** Token z linku w mailu — 24 bajty zapisane szesnastkowo. */
const token = z.string().regex(/^[0-9a-f]{48}$/, 'Nieprawidłowy link');

const isoDateTime = z.string().datetime({ offset: true });
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Oczekiwano daty RRRR-MM-DD');

const serviceIds = z.array(uuid).min(1, 'Wybierz przynajmniej jedną usługę').max(10);

const addons = z
  .array(z.object({ id: uuid, quantity: z.number().int().min(1).max(20) }))
  .max(20)
  .optional();

/**
 * Dane klienta. Długości są celowo hojne, ale skończone — chodzi o to, żeby
 * do bazy nie dało się wysłać megabajta tekstu, nie o walidację nazwisk.
 */
const client = z.object({
  firstName: z.string().trim().min(1, 'Podaj imię').max(80),
  lastName: z.string().trim().max(80).optional(),
  email: z.string().trim().toLowerCase().email('Nieprawidłowy adres e-mail').max(254),
  phone: z
    .string()
    .trim()
    .min(6, 'Podaj numer telefonu')
    .max(20)
    .regex(/^[+0-9 ()-]+$/, 'Nieprawidłowy numer telefonu'),
});

export const requestSchemas = {
  catalog: z.object({ action: z.literal('catalog'), slug }),

  slots: z.object({
    action: z.literal('slots'),
    slug,
    serviceIds,
    from: isoDate,
    to: isoDate,
    staffId: uuid.nullish(),
    extraMinutes: z.number().int().min(0).max(600).optional(),
  }),

  book: z.object({
    action: z.literal('book'),
    slug,
    serviceIds,
    startsAt: isoDateTime,
    staffId: uuid.nullish(),
    addons,
    client,
    note: z.string().trim().max(500).optional(),
  }),

  booking: z.object({ action: z.literal('booking'), token }),
  confirm: z.object({ action: z.literal('confirm'), token }),
  cancel: z.object({ action: z.literal('cancel'), token }),
  reviews: z.object({ action: z.literal('reviews'), slug }),
  reviewState: z.object({ action: z.literal('reviewState'), token }),

  submitReview: z.object({
    action: z.literal('submitReview'),
    token,
    rating: z.number().int().min(1).max(5),
    comment: z.string().trim().max(1000).optional(),
  }),
} as const;

export type Action = keyof typeof requestSchemas;

export const ACTIONS = Object.keys(requestSchemas) as Action[];

export type RequestOf<A extends Action> = z.infer<(typeof requestSchemas)[A]>;

/** Pierwszy błąd w formie, którą da się pokazać człowiekowi. */
export function firstIssue(error: z.ZodError): string {
  const issue = error.issues[0];
  return issue?.message ?? 'Nieprawidłowe dane';
}
