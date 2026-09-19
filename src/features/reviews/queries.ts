import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

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

export function useSalonReviews(salonId: string | undefined) {
  return useQuery({
    queryKey: ['salon-reviews', salonId],
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

      return data.map((review) => {
        const client = review.clients as unknown as {
          first_name: string;
          last_name: string | null;
        } | null;

        return {
          id: review.id,
          bookingId: review.booking_id,
          rating: review.rating,
          comment: review.comment,
          salonReply: review.salon_reply,
          createdAt: review.created_at,
          staffName:
            (review.staff as unknown as { display_name: string } | null)?.display_name ?? '',
          clientName: [client?.first_name, client?.last_name].filter(Boolean).join(' '),
        };
      });
    },
  });
}

export function useSalonRating(salonId: string | undefined) {
  return useQuery({
    queryKey: ['salon-rating', salonId],
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
      void queryClient.invalidateQueries({ queryKey: ['salon-reviews'] });
    },
  });
}