
/**
 * Zeruje liczniki limitu zapytań. Testy funkcji publicznej biją w nią
 * dziesiątki razy z jednego adresu, więc bez tego przekroczyłyby limit,
 * który w normalnej pracy dotyczy botów, nie ludzi.
 */
export async function resetRateLimits(): Promise<void> {
  const client = new Client({ connectionString: CONNECTION_STRING });
  await client.connect();
  await client.query('delete from public.rate_limits');
  await client.end();
}