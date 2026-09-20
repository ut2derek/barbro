// SALON I JEGO OFERTA — wszystko, co klient widzi przed wyborem terminu.

import { admin } from '../_shared/admin.ts';
import { json } from '../_shared/http.ts';
import type { RequestOf } from './schemas.ts';

const SALON_COLUMNS =
  'id, name, slug, brand_color, logo_url, cover_url, address_line, postal_code, city, phone, timezone, cancellation_policy_text, online_booking_enabled, active';

export type OpenSalon = {
  id: string;
  name: string;
  slug: string;
  brand_color: string | null;
  logo_url: string | null;
  cover_url: string | null;
  address_line: string | null;
  postal_code: string | null;
  city: string | null;
  phone: string | null;
  timezone: string;
  cancellation_policy_text: string | null;
  online_booking_enabled: boolean;
};

/** Salon dostępny publicznie: włączony. Rezerwacje online sprawdzamy osobno. */
export async function openSalon(slug: string): Promise<OpenSalon | null> {
  const { data, error } = await admin
    .from('salons')
    .select(SALON_COLUMNS)
    .eq('slug', slug)
    .maybeSingle();

  if (error) throw error;
  if (!data || !data.active) return null;

  return data as OpenSalon;
}

export const SALON_NOT_FOUND = () => json({ error: 'Nie znaleziono salonu' }, 404);

function fullAddress(salon: OpenSalon): string {
  const postal = [salon.postal_code, salon.city].filter(Boolean).join(' ');
  return [salon.address_line, postal].filter(Boolean).join(', ');
}

export async function catalog(body: RequestOf<'catalog'>): Promise<Response> {
  const salon = await openSalon(body.slug);
  if (!salon) return SALON_NOT_FOUND();

  const [services, pricing, staff, assignments, addons, salonRating, staffRatings] =
    await Promise.all([
      admin
        .from('services')
        .select('id, name, description, category_id, sort_order, service_categories ( name )')
        .eq('salon_id', salon.id)
        .eq('visible', true)
        .order('sort_order'),
      admin.rpc('service_pricing', { p_salon_id: salon.id }),
      admin
        .from('staff')
        .select('id, display_name, title, bio, photo_url, sort_order')
        .eq('salon_id', salon.id)
        .eq('active', true)
        .order('sort_order'),
      admin.from('staff_services').select('staff_id, service_id').eq('salon_id', salon.id),
      admin
        .from('service_addons')
        .select('id, service_id, name, description, price_grosz, duration_minutes, max_quantity')
        .eq('salon_id', salon.id)
        .eq('active', true)
        .order('sort_order'),
      admin.rpc('salon_rating', { p_salon_id: salon.id }),
      admin.rpc('staff_ratings', { p_salon_id: salon.id }),
    ]);

  for (const result of [services, pricing, staff, assignments, addons, salonRating, staffRatings]) {
    if (result.error) throw result.error;
  }

  // Cena i czas trwania zawsze z bazy — aplikacja i strona nie liczą ich same.
  const priceOf = new Map(pricing.data!.map((row) => [row.service_id, row]));
  const ratingOf = new Map(staffRatings.data!.map((row) => [row.staff_id, row]));
  const servicesOf = new Map<string, string[]>();
  for (const assignment of assignments.data!) {
    const list = servicesOf.get(assignment.staff_id) ?? [];
    list.push(assignment.service_id);
    servicesOf.set(assignment.staff_id, list);
  }

  return json({
    salon: {
      id: salon.id,
      name: salon.name,
      slug: salon.slug,
      brandColor: salon.brand_color,
      logoUrl: salon.logo_url,
      coverUrl: salon.cover_url,
      address: fullAddress(salon),
      phone: salon.phone,
      timezone: salon.timezone,
      cancellationPolicy: salon.cancellation_policy_text,
      rating: salonRating.data?.[0]?.average ?? null,
      reviewsCount: salonRating.data?.[0]?.reviews_count ?? 0,
      onlineBookingEnabled: salon.online_booking_enabled,
    },
    services: services
      .data!.filter((service) => priceOf.has(service.id))
      .map((service) => {
        const price = priceOf.get(service.id)!;
        const category = service.service_categories as { name: string } | null;
        return {
          id: service.id,
          name: service.name,
          description: service.description,
          categoryName: category?.name ?? null,
          durationMinutes: price.duration_minutes,
          priceGrosz: price.price_grosz,
          regularPriceGrosz: price.regular_price_grosz,
          lowestPriceBeforePromoGrosz: price.lowest_price_before_promo_grosz,
          promoActive: price.promo_active,
        };
      }),
    // Dodatek bez wskazanej usługi proponujemy przy każdej.
    addons: addons.data!.map((addon) => ({
      id: addon.id,
      serviceId: addon.service_id,
      name: addon.name,
      description: addon.description,
      priceGrosz: addon.price_grosz,
      durationMinutes: addon.duration_minutes,
      maxQuantity: addon.max_quantity,
    })),
    staff: staff.data!.map((member) => ({
      id: member.id,
      name: member.display_name,
      title: member.title,
      bio: member.bio,
      photoUrl: member.photo_url,
      rating: ratingOf.get(member.id)?.average ?? null,
      reviewsCount: ratingOf.get(member.id)?.reviews_count ?? 0,
      serviceIds: servicesOf.get(member.id) ?? [],
    })),
  });
}

/** Opinie widoczne publicznie — imię klienta bez nazwiska, bez kontaktu. */
export async function reviews(body: RequestOf<'reviews'>): Promise<Response> {
  const salon = await openSalon(body.slug);
  if (!salon) return SALON_NOT_FOUND();

  const { data, error } = await admin
    .from('booking_reviews')
    .select(
      'id, rating, comment, salon_reply, salon_replied_at, created_at, staff ( display_name ), clients ( first_name )',
    )
    .eq('salon_id', salon.id)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) throw error;

  return json({
    reviews: data.map((review) => ({
      id: review.id,
      rating: review.rating,
      comment: review.comment,
      salonReply: review.salon_reply,
      createdAt: review.created_at,
      staffName: (review.staff as { display_name: string } | null)?.display_name ?? '',
      authorName: (review.clients as { first_name: string } | null)?.first_name ?? '',
    })),
  });
}

export async function slots(body: RequestOf<'slots'>): Promise<Response> {
  const salon = await openSalon(body.slug);
  if (!salon) return SALON_NOT_FOUND();
  if (!salon.online_booking_enabled) return json({ slots: [], bookingDisabled: true });

  const { data, error } = await admin.rpc('get_available_slots', {
    p_salon_id: salon.id,
    p_service_ids: body.serviceIds,
    p_from: body.from,
    p_to: body.to,
    p_staff_id: body.staffId ?? undefined,
    p_extra_minutes: body.extraMinutes ?? 0,
  });

  if (error) throw error;
  return json({ slots: data ?? [] });
}
