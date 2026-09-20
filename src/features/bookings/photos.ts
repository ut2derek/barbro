import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { decode } from 'base64-arraybuffer';
import * as ImagePicker from 'expo-image-picker';

import { invalidateBookingPhotos, queryKeys } from '@/lib/query-keys';
import { getSupabase } from '@/lib/supabase';

/**
 * ZDJĘCIA PRZY WIZYCIE
 *
 * Pliki leżą w prywatnym koszyku `booking-photos`, w bazie jest tylko ścieżka.
 * Do wyświetlenia bierzemy podpisany adres ważny godzinę — wklejony komuś
 * w wiadomości przestanie działać, a bez zalogowania nie otworzy się w ogóle.
 *
 * Ścieżka ma kształt `<salon>/<wizyta>/<nazwa>`, bo to pierwszy człon decyduje
 * o dostępie do pliku (reguła w migracji `booking_photos`). Aplikacja nie może
 * jej wymyślić inaczej — baza odrzuci taki zapis.
 */

const BUCKET = 'booking-photos';

/** Jak długo żyje adres do pokazania zdjęcia. */
const SIGNED_URL_SECONDS = 3600;

export type BookingPhoto = {
  id: string;
  storagePath: string;
  createdAt: string;
  /** Adres do wyświetlenia. Puste, gdy podpisanie się nie udało. */
  url: string | null;
};

const EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'image/heif': 'heif',
};

/** Zdjęcia w rozbiciu na wizyty: `{ [bookingId]: zdjęcia }`. */
export type PhotosByBooking = Record<string, BookingPhoto[]>;

/**
 * Zdjęcia kilku wizyt naraz — historia klienta potrafi mieć ich pięćdziesiąt,
 * a osobne zapytanie na każdą oznaczałoby pięćdziesiąt zapytań i tyle samo
 * podpisywanych adresów przy każdym wejściu na kartę.
 */
export function useBookingPhotos(bookingIds: string[]) {
  // Kolejność wizyt nie zmienia wyniku, więc klucz jest z posortowanej listy —
  // inaczej te same zdjęcia leżałyby w pamięci pod dwoma kluczami.
  const ids = [...bookingIds].sort();

  return useQuery({
    queryKey: queryKeys.bookingPhotos(ids.join(',')),
    enabled: ids.length > 0,
    queryFn: async (): Promise<PhotosByBooking> => {
      const supabase = getSupabase();

      const { data, error } = await supabase
        .from('booking_photos')
        .select('id, booking_id, storage_path, created_at')
        .in('booking_id', ids)
        .order('created_at', { ascending: true });

      if (error) throw error;
      if (data.length === 0) return {};

      const { data: signed, error: signError } = await supabase.storage
        .from(BUCKET)
        .createSignedUrls(
          data.map((row) => row.storage_path),
          SIGNED_URL_SECONDS,
        );

      if (signError) throw signError;

      const urls = new Map((signed ?? []).map((item) => [item.path, item.signedUrl]));
      const byBooking: PhotosByBooking = {};

      for (const row of data) {
        const photo: BookingPhoto = {
          id: row.id,
          storagePath: row.storage_path,
          createdAt: row.created_at,
          url: urls.get(row.storage_path) ?? null,
        };

        byBooking[row.booking_id] = [...(byBooking[row.booking_id] ?? []), photo];
      }

      return byBooking;
    },
  });
}

/**
 * Wybór zdjęcia z galerii albo z aparatu. Zwraca `null`, gdy barber zrezygnował
 * albo nie dał zgody na dostęp — to nie jest błąd i nie ma po co go zgłaszać.
 */
export async function pickPhoto(source: 'library' | 'camera') {
  const permission =
    source === 'camera'
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();

  if (!permission.granted) return null;

  const options: ImagePicker.ImagePickerOptions = {
    mediaTypes: ['images'],
    // Zmniejsza plik na tyle, żeby wysyłka z telefonu w salonie nie trwała
    // w nieskończoność, a zdjęcie dalej pokazywało, co trzeba.
    quality: 0.6,
    base64: true,
    exif: false,
  };

  const result =
    source === 'camera'
      ? await ImagePicker.launchCameraAsync(options)
      : await ImagePicker.launchImageLibraryAsync(options);

  if (result.canceled) return null;
  return result.assets[0] ?? null;
}

export function useAddBookingPhoto() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (args: {
      salonId: string;
      bookingId: string;
      asset: ImagePicker.ImagePickerAsset;
    }) => {
      const { asset } = args;

      if (!asset.base64) {
        throw new Error('Nie udało się odczytać zdjęcia.');
      }

      const mimeType = asset.mimeType ?? 'image/jpeg';
      const extension = EXTENSIONS[mimeType] ?? 'jpg';
      // Nazwa z zegara i losowej końcówki. Unikalności i tak pilnuje baza,
      // ale dzięki temu dwa zdjęcia zrobione w tej samej sekundzie się mieszczą.
      const name = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${extension}`;
      const storagePath = `${args.salonId}/${args.bookingId}/${name}`;

      const supabase = getSupabase();

      const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(storagePath, decode(asset.base64), { contentType: mimeType });

      if (uploadError) throw uploadError;

      const { error } = await supabase.from('booking_photos').insert({
        salon_id: args.salonId,
        booking_id: args.bookingId,
        storage_path: storagePath,
      });

      // Wpis się nie udał (np. cudza wizyta), więc plik nie ma po co zostawać.
      if (error) {
        await supabase.storage.from(BUCKET).remove([storagePath]);
        throw error;
      }
    },
    onSuccess: () => invalidateBookingPhotos(queryClient),
  });
}

export function useDeleteBookingPhoto() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (args: { photoId: string; storagePath: string }) => {
      const supabase = getSupabase();

      // Najpierw wpis, potem plik. Odwrotna kolejność zostawiłaby w historii
      // kafelek, którego nie da się wyświetlić.
      const { error } = await supabase.from('booking_photos').delete().eq('id', args.photoId);
      if (error) throw error;

      await supabase.storage.from(BUCKET).remove([args.storagePath]);
    },
    onSuccess: () => invalidateBookingPhotos(queryClient),
  });
}
