import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { useState } from 'react';
import { Modal, Pressable, ScrollView, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { MAX_CONTENT_WIDTH } from '@/components/ui/screen';
import { Sheet } from '@/components/ui/sheet';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Text } from '@/components/ui/text';
import {
  pickPhoto,
  useAddBookingPhoto,
  useDeleteBookingPhoto,
  type BookingPhoto,
} from '@/features/bookings/photos';
import { t } from '@/i18n';
import { useTheme } from '@/theme';

const THUMB = 88;

type Props = {
  bookingId: string;
  salonId: string | undefined;
  /**
   * Zdjęcia tej wizyty. Pobiera je ekran — jednym zapytaniem dla całej
   * historii klienta, zamiast osobnym przy każdej wizycie.
   */
  photos: BookingPhoto[];
  loading?: boolean;
  /**
   * Czy ten użytkownik może dokładać i kasować zdjęcia. Regułą i tak rządzi
   * baza — tu chodzi o to, żeby nie pokazywać przycisku, który odbije się
   * błędem: pracownik prowadzi tylko swoje wizyty.
   */
  canEdit: boolean;
};

/**
 * Zdjęcia przy jednej wizycie: pasek miniatur, dokładanie z aparatu albo
 * galerii i podgląd na pełnym ekranie z możliwością skasowania.
 *
 * Zdjęcia są wewnętrzne — widzi je wyłącznie zespół salonu, tak samo jak
 * notatkę o kliencie. Dlatego pod spodem jest o tym zdanie: barber ma wiedzieć,
 * co robi, zanim zrobi klientowi zdjęcie.
 */
export function BookingPhotos({ bookingId, salonId, photos, loading = false, canEdit }: Props) {
  const theme = useTheme();
  const addPhoto = useAddBookingPhoto();
  const deletePhoto = useDeleteBookingPhoto();

  const [sourceOpen, setSourceOpen] = useState(false);
  const [preview, setPreview] = useState<BookingPhoto | null>(null);
  /** Zdjęcie, o które właśnie pytamy „na pewno?”. */
  const [toDelete, setToDelete] = useState<BookingPhoto | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function add(source: 'library' | 'camera') {
    setSourceOpen(false);
    setError(null);

    if (!salonId) return;

    try {
      const asset = await pickPhoto(source);
      if (!asset) return;

      await addPhoto.mutateAsync({ salonId, bookingId, asset });
    } catch {
      setError(t('bookingPhotos.addError'));
    }
  }

  async function remove(photo: BookingPhoto) {
    setError(null);

    try {
      await deletePhoto.mutateAsync({ photoId: photo.id, storagePath: photo.storagePath });
      setToDelete(null);
      setPreview(null);
    } catch {
      setToDelete(null);
      setError(t('bookingPhotos.deleteError'));
    }
  }

  return (
    <View style={{ gap: theme.spacing.sm }}>
      <Text variant="bodyStrong">{t('bookingPhotos.title')}</Text>

      {loading ? (
        <Text variant="small" tone="muted">
          {t('common.loading')}
        </Text>
      ) : photos.length === 0 ? (
        <Text variant="small" tone="muted">
          {t('bookingPhotos.empty')}
        </Text>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }}>
          <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
            {photos.map((photo) => (
              <View key={photo.id}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t('bookingPhotos.open')}
                  onPress={() => setPreview(photo)}
                >
                  <Image
                    source={photo.url}
                    contentFit="cover"
                    style={{
                      width: THUMB,
                      height: THUMB,
                      borderRadius: theme.radius.md,
                      backgroundColor: theme.colors.surface,
                    }}
                  />
                </Pressable>

                {/* Krzyżyk w rogu miniatury — kasowanie bez wchodzenia
                    w podgląd. Leży obok zdjęcia, nie w jego przycisku, żeby
                    nie powstał przycisk w przycisku. Ciemne kółko pod ikoną
                    trzyma ją czytelną także na jasnym zdjęciu. */}
                {canEdit ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t('bookingPhotos.removeLabel')}
                    onPress={() => setToDelete(photo)}
                    hitSlop={8}
                    style={{
                      position: 'absolute',
                      top: -6,
                      right: -6,
                      width: 24,
                      height: 24,
                      borderRadius: theme.radius.pill,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: theme.colors.overlay,
                      borderWidth: 1,
                      borderColor: theme.colors.border,
                    }}
                  >
                    <Ionicons name="close" size={14} color={theme.colors.textOnAccent} />
                  </Pressable>
                ) : null}
              </View>
            ))}
          </View>
        </ScrollView>
      )}

      {canEdit ? (
        <>
          <Button
            label={t('bookingPhotos.add')}
            variant="secondary"
            loading={addPhoto.isPending}
            onPress={() => setSourceOpen(true)}
          />
          <Text variant="small" tone="muted">
            {t('bookingPhotos.hint')}
          </Text>
        </>
      ) : null}

      {error ? (
        <Text variant="small" tone="danger">
          {error}
        </Text>
      ) : null}

      <SourceSheet visible={sourceOpen} onClose={() => setSourceOpen(false)} onPick={add} />

      <ConfirmDialog
        visible={toDelete !== null}
        title={t('bookingPhotos.deleteTitle')}
        description={t('bookingPhotos.deleteWarning')}
        confirmLabel={t('bookingPhotos.deleteConfirm')}
        busy={deletePhoto.isPending}
        onCancel={() => setToDelete(null)}
        onConfirm={() => {
          if (toDelete) void remove(toDelete);
        }}
      />

      <PreviewSheet
        photo={preview}
        canEdit={canEdit}
        onClose={() => setPreview(null)}
        onDelete={setToDelete}
      />
    </View>
  );
}

/** Skąd wziąć zdjęcie. Osobny arkusz zamiast systemowego okna, bo to samo
 *  pytanie musi wyglądać tak samo na telefonie i w przeglądarce. */
function SourceSheet({
  visible,
  onClose,
  onPick,
}: {
  visible: boolean;
  onClose: () => void;
  onPick: (source: 'library' | 'camera') => void;
}) {
  return (
    <Sheet visible={visible} onClose={onClose}>
      <Text variant="heading">{t('bookingPhotos.add')}</Text>
      <Button label={t('bookingPhotos.fromCamera')} onPress={() => onPick('camera')} />
      <Button
        label={t('bookingPhotos.fromLibrary')}
        variant="secondary"
        onPress={() => onPick('library')}
      />
      <Button label={t('common.cancel')} variant="secondary" onPress={onClose} />
    </Sheet>
  );
}

/** Podgląd na pełnym ekranie. Kasowanie pyta tym samym oknem co krzyżyk
 *  na miniaturze — jedno pytanie, wszędzie tak samo. */
function PreviewSheet({
  photo,
  canEdit,
  onClose,
  onDelete,
}: {
  photo: BookingPhoto | null;
  canEdit: boolean;
  onClose: () => void;
  onDelete: (photo: BookingPhoto) => void;
}) {
  const theme = useTheme();

  if (!photo) return null;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View
        style={{
          flex: 1,
          backgroundColor: theme.colors.overlay,
          justifyContent: 'center',
          alignItems: 'center',
          padding: theme.spacing.lg,
        }}
      >
        {/* Kolumna trzyma szerokość telefonu — na laptopie zdjęcie nie
            rozjeżdża się wtedy na cały monitor. */}
        <View
          style={{
            width: '100%',
            maxWidth: MAX_CONTENT_WIDTH,
            flex: 1,
            justifyContent: 'center',
            gap: theme.spacing.md,
          }}
        >
          <Image
            source={photo.url}
            contentFit="contain"
            style={{ width: '100%', flex: 1, borderRadius: theme.radius.lg }}
          />

          {canEdit ? (
            <Button
              label={t('bookingPhotos.delete')}
              variant="danger"
              onPress={() => onDelete(photo)}
            />
          ) : null}

          <Button label={t('common.close')} variant="secondary" onPress={onClose} />
        </View>
      </View>
    </Modal>
  );
}
