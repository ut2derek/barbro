import { Redirect } from 'expo-router';

/**
 * Środkowa zakładka nigdy nie pokazuje treści — jej naciśnięcie przechwytuje
 * układ zakładek i otwiera arkusz wyboru. Ten ekran istnieje tylko po to,
 * żeby zakładka miała swoją trasę.
 */
export default function NewTabPlaceholder() {
  return <Redirect href="/(app)/(tabs)" />;
}