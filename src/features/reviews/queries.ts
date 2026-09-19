import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';

import { parseRows } from '@/lib/parse';
import { invalidateReviews, queryKeys } from '@/lib/query-keys';
import { getSupabase } from '@/lib/supabase';

export type SalonReview = {
  id: string;
  rating: number;
  comment: string | null;
  salonReply: string | null;
  createdAt: string;
  staffName: string;
  clientName: string;
  bookingId: string;
};

/**
 * Opinia z dołączonym fryzjerem i klientem. Dołączeń Supabase nie otypuje,
 * więc opisujemy je schematem zamiast wyłączać sprawdzanie przez `as unknown as`.
 */
const reviewRow = z.object({
  id: z.string(),
  booking_id: z.string(),
  rating: z.number(),
  comment: z.string().nullable(),
  salon_reply: z.string().nullable(),
  created_at: z.string(),
  staff: z.object({ display_name: z.string() }).nullable(),
  clients: z.object({ first_name: z.string(), last_name: z.string().nullable() }).nullable(),
});

export function useSalonReviews(salonId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.salonReviews(salonId),
    enabled: Boolean(salonId),
    queryFn: async (): Promise<SalonReview[]> => {
      const { data, error } = await getSupabase()
        .from('booking_reviews')
        .select(
          'id, booking_id, rating, comment, salon_reply, created_at, staff ( display_name ), clients ( first_name, last_name )',
        )
        .eq('salon_id', salonId!)
        .order('created_at', { ascending: false });

      if (error) throw error;

      return parseRows(reviewRow, data, 'opinie salonu').map((review) => ({
        id: review.id,
        bookingId: review.booking_id,
        rating: review.rating,
        comment: review.comment,
        salonReply: review.salon_reply,
        createdAt: review.created_at,
        staffName: review.staff?.display_name ?? '',
        clientName: [review.clients?.first_name, review.clients?.last_name]
          .filter(Boolean)
          .join(' '),
      }));
    },
  });
}

export function useSalonRating(salonId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.salonRating(salonId),
    enabled: Boolean(salonId),
    queryFn: async (): Promise<{ average: number | null; count: number }> => {
      const { data, error } = await getSupabase().rpc('salon_rating', { p_salon_id: salonId! });
      if (error) throw error;

      const row = data?.[0];
      return { average: row?.average ?? null, count: row?.reviews_count ?? 0 };
    },
  });
}

/**
 * Odpowiedź salonu idzie przez funkcję w bazie, która pilnuje uprawnień
 * i nie pozwala przy okazji podmienić oceny ani komentarza klienta.
 */
export function useReplyToReview() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (args: { reviewId: string; reply: string }) => {
      const { error } = await getSupabase().rpc('reply_to_review', {
        p_review_id: args.reviewId,
        p_reply: args.reply,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      invalidateReviews(queryClient);
    },
  });
}