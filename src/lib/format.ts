
/**
 * Kwota wpisana ręcznie → grosze. `null`, gdy to nie jest kwota.
 *
 * Przyjmuje przecinek i kropkę, bo na polskiej klawiaturze wygodniej wpisać
 * przecinek. Wcześniej ta sama funkcja siedziała w trzech ekranach naraz;
 * poprawka w jednym z nich nie trafiałaby do dwóch pozostałych.
 */
export function parsePriceToGrosz(value: string): number | null {
  const normalized = value.replace(',', '.').trim();
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null;
  return Math.round(Number(normalized) * 100);
}

/** Grosze → tekst do pola formularza („60,00"). Bez symbolu waluty. */
export function formatGroszForInput(grosz: number): string {
  return (grosz / 100).toFixed(2).replace('.', ',');
}