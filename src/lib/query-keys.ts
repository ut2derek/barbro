/**
 * JEDNO MIEJSCE Z KLUCZAMI ZAPYTAŃ
 *
 * Każde zapytanie do serwera ma klucz, pod którym leży jego wynik w pamięci.
 * Kiedy coś zmieniamy, trzeba powiedzieć, które wyniki się zdezaktualizowały.
 *
 * Wcześniej klucze były rozsypane po kodzie jako zwykłe napisy i przy zmianie
 * wizyty odświeżał się widok dnia, ale nie widok tygodnia — bo ktoś zapomniał
 * dopisać jeden napis. Tu takie pomyłki są niemożliwe: listy „co odświeżyć po
 * zmianie X" są zapisane raz, obok kluczy.
 */

import type { QueryClient } from '@tanstack/react-query';

export const queryKeys = {
  // --- salon i użytkownik ---
  currentSalon: (userId: string | undefined) => ['current-salon', userId] as const,
  myStaffId: (salonId: string | undefined) => ['my-staff-id', salonId] as const,
  isAppAdmin: (userId: string | undefined) => ['is-app-admin', userId] as const,
  salonSettings: (salonId: string | undefined) => ['salon-settings', salonId] as const,

  // --- kalendarz i wizyty ---
  bookingsDay: (salonId: string | undefined, dayKey: string, staffId: string) =>
    ['bookings', salonId, dayKey, staffId] as const,
  bookingsWeek: (salonId: string | undefined, fromKey: string, days: number, staffId: string) =>
    ['bookings-week', salonId, fromKey, days, staffId] as const,
  booking: (bookingId: string | undefined) => ['booking', bookingId] as const,
  pendingApprovalCount: (salonId: string | undefined) => ['pending-approval-count', salonId] as const,
  slots: (salonId: string | undefined, dayKey: string, staffId: string, serviceIds: string) =>
    ['slots', salonId, dayKey, staffId, serviceIds] as const,
  timeBlocks: (salonId: string | undefined, dayKey: string, staffId: string) =>
    ['time-blocks', salonId, dayKey, staffId] as const,

  // --- usługi ---
  services: (salonId: string | undefined, staffId: string) => ['services', salonId, staffId] as const,
  serviceCategories: (salonId: string | undefined) => ['service-categories', salonId] as const,
  addons: (salonId: string | undefined) => ['addons', salonId] as const,

  // --- grafik ---
  salonHours: (salonId: string | undefined) => ['salon-hours', salonId] as const,
  workingHours: (salonId: string | undefined, staffId: string | null | undefined) =>
    ['working-hours', salonId, staffId] as const,
  scheduleExceptions: (salonId: string | undefined) => ['schedule-exceptions', salonId] as const,

  // --- zespół ---
  team: (salonId: string | undefined) => ['team', salonId] as const,
  staff: (salonId: string | undefined) => ['staff', salonId] as const,
  staffServices: (salonId: string | undefined, staffId: string | null | undefined) =>
    ['staff-services', salonId, staffId] as const,

  // --- klienci ---
  clients: (salonId: string | undefined, term: string, sort: string) =>
    ['clients', salonId, term, sort] as const,
  client: (clientId: string | undefined) => ['client', clientId] as const,
  clientBookings: (clientId: string | undefined) => ['client-bookings', clientId] as const,

  // --- opinie ---
  salonReviews: (salonId: string | undefined) => ['salon-reviews', salonId] as const,
  salonRating: (salonId: string | undefined) => ['salon-rating', salonId] as const,

  // --- panel administratora ---
  adminSalons: () => ['admin-salons'] as const,

  // --- strona rezerwacji dla klienta ---
  publicCatalog: (slug: string | undefined) => ['public-catalog', slug] as const,
  publicSlots: (slug: string | undefined, dayKey: string, staffId: string, serviceIds: string, extra: number) =>
    ['public-slots', slug, dayKey, staffId, serviceIds, extra] as const,
  publicReviews: (slug: string | undefined) => ['public-reviews', slug] as const,
  clientBooking: (token: string | undefined) => ['client-booking', token] as const,
  reviewState: (token: string | undefined) => ['review-state', token] as const,
} as const;

/**
 * Prefiksy — do unieważniania całych rodzin naraz, bez znajomości argumentów.
 * `['bookings']` unieważnia każdy dzień, każdego fryzjera.
 */
const prefix = {
  bookingsDay: ['bookings'],
  bookingsWeek: ['bookings-week'],
  booking: ['booking'],
  pendingApprovalCount: ['pending-approval-count'],
  slots: ['slots'],
  publicSlots: ['public-slots'],
  timeBlocks: ['time-blocks'],
  services: ['services'],
  serviceCategories: ['service-categories'],
  addons: ['addons'],
  salonHours: ['salon-hours'],
  workingHours: ['working-hours'],
  scheduleExceptions: ['schedule-exceptions'],
  team: ['team'],
  staff: ['staff'],
  staffServices: ['staff-services'],
  clients: ['clients'],
  client: ['client'],
  clientBookings: ['client-bookings'],
  salonReviews: ['salon-reviews'],
  salonRating: ['salon-rating'],
  salonSettings: ['salon-settings'],
  currentSalon: ['current-salon'],
  publicCatalog: ['public-catalog'],
} as const;

function invalidateAll(client: QueryClient, families: readonly (readonly string[])[]) {
  for (const queryKey of families) {
    void client.invalidateQueries({ queryKey });
  }
}

/**
 * Cokolwiek zrobiliśmy z wizytą — utworzenie, zmiana statusu, przełożenie,
 * odwołanie. Odświeża wszystko, co pokazuje wizyty albo wolne terminy.
 *
 * Kropka z liczbą wizyt do akceptacji też tu jest: bez niej barber akceptuje
 * wizytę i przez minutę widzi na zakładce nieaktualną liczbę.
 */
export function invalidateBookings(client: QueryClient) {
  invalidateAll(client, [
    prefix.bookingsDay,
    prefix.bookingsWeek,
    prefix.booking,
    prefix.pendingApprovalCount,
    prefix.clientBookings,
    prefix.slots,
    prefix.publicSlots,
  ]);
}

/** Blokada czasu zabiera termin z puli — tak samo jak wizyta. */
export function invalidateTimeBlocks(client: QueryClient) {
  invalidateAll(client, [prefix.timeBlocks, prefix.slots, prefix.publicSlots]);
}

/** Zmiana cennika zmienia też to, co widzi klient na stronie rezerwacji. */
export function invalidateServices(client: QueryClient) {
  invalidateAll(client, [
    prefix.services,
    prefix.serviceCategories,
    prefix.addons,
    prefix.staffServices,
    prefix.publicCatalog,
    prefix.slots,
    prefix.publicSlots,
  ]);
}

/** Zmiana grafiku przelicza wolne terminy. */
export function invalidateSchedule(client: QueryClient) {
  invalidateAll(client, [
    prefix.salonHours,
    prefix.workingHours,
    prefix.scheduleExceptions,
    prefix.slots,
    prefix.publicSlots,
  ]);
}

/** Zmiana w zespole dotyka przypisań usług i dostępności. */
export function invalidateTeam(client: QueryClient) {
  invalidateAll(client, [
    prefix.team,
    prefix.staff,
    prefix.staffServices,
    prefix.services,
    prefix.publicCatalog,
    prefix.slots,
    prefix.publicSlots,
  ]);
}

export function invalidateClients(client: QueryClient) {
  invalidateAll(client, [prefix.clients, prefix.client]);
}

export function invalidateReviews(client: QueryClient) {
  invalidateAll(client, [prefix.salonReviews, prefix.salonRating, prefix.publicCatalog]);
}

/**
 * Ustawienia salonu zmieniają siatkę slotów, strefę czasową i wygląd —
 * czyli praktycznie wszystko, co widać na ekranie.
 */
export function invalidateSalonSettings(client: QueryClient) {
  invalidateAll(client, [
    prefix.salonSettings,
    prefix.currentSalon,
    prefix.publicCatalog,
    prefix.slots,
    prefix.publicSlots,
  ]);
}

export const bookingListPrefixes = [prefix.bookingsDay, prefix.bookingsWeek] as const;
