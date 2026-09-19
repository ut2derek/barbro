import type { BadgeTone } from '@/components/ui/badge';
import { t } from '@/i18n';

import type { BookingStatus } from './queries';

/** Opis statusu po polsku plus kolor, którym sygnalizujemy go w interfejsie. */
export function statusLabel(status: BookingStatus): string {
  return t(`status.${status}` as 'status.confirmed');
}

export function statusTone(status: BookingStatus): BadgeTone {
  switch (status) {
    case 'confirmed':
      return 'success';
    case 'completed':
      return 'muted';
    case 'pending_approval':
    case 'pending_confirmation':
      return 'warning';
    case 'cancelled_by_client':
    case 'cancelled_by_salon':
    case 'no_show':
      return 'danger';
    default:
      return 'muted';
  }
}

/** Statusy, przy których wizyta nadal zajmuje termin w kalendarzu. */
export const ACTIVE_STATUSES: BookingStatus[] = [
  'pending_confirmation',
  'pending_approval',
  'confirmed',
  'completed',
];
