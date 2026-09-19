
describe('dodatki do usługi', () => {
  it('katalog podaje dodatki z ceną i czasem', async () => {
    const response = await call({ action: 'catalog', slug: SALON_SLUG });
    const data = await response.json();

    expect(data.addons.length).toBeGreaterThan(0);
    const tuszowanie = data.addons.find(
      (addon: { name: string }) => addon.name === 'Tuszowanie siwizny',
    );
    expect(tuszowanie.priceGrosz).toBe(5000);
    expect(tuszowanie.durationMinutes).toBe(20);
  });

  it('dodatek wydłuża wizytę i podnosi kwotę', async () => {
    const email = `dodatki-${Date.now()}@example.test`;
    createdEmails.push(email);
    const slot = await futureSlot();

    const db = new Client({ connectionString: CONNECTION_STRING });
    await db.connect();
    const { rows: addonRows } = await db.query(
      `select id from public.service_addons where name = 'Tuszowanie siwizny'`,
    );
    await db.end();

    const response = await call({
      action: 'book',
      slug: SALON_SLUG,
      serviceIds: [HAIRCUT],
      startsAt: slot.startsAt,
      staffId: slot.staffId,
      addons: [{ id: addonRows[0].id, quantity: 1 }],
      client: { firstName: 'Krzysztof', email, phone: '+48601202303' },
    });
    const data = await response.json();

    expect(response.status).toBe(200);

    const minutes =
      (new Date(data.booking.endsAt).getTime() - new Date(data.booking.startsAt).getTime()) / 60000;
    // Strzyżenie 45 minut + dodatek 20 minut.
    expect(minutes).toBe(65);
    // Cena promocyjna 60 zł + dodatek 50 zł.
    expect(data.booking.totalPriceGrosz).toBe(11000);
  });

  it('dodatek zabiera termin, w którym sama usługa by się zmieściła', async () => {
    const db = new Client({ connectionString: CONNECTION_STRING });
    await db.connect();

    const { rows: addonRows } = await db.query(
      `select id from public.service_addons where name = 'Tuszowanie siwizny'`,
    );

    // Ostatni termin dnia dla samej usługi.
    const { rows: plain } = await db.query(
      `select count(*)::int as n from public.get_available_slots(
        '20000000-0000-0000-0000-000000000001',
        array['${HAIRCUT}']::uuid[],
        (current_date + 9)::date, (current_date + 9)::date)`,
    );
    const { rows: withAddon } = await db.query(
      `select count(*)::int as n from public.get_available_slots(
        '20000000-0000-0000-0000-000000000001',
        array['${HAIRCUT}']::uuid[],
        (current_date + 9)::date, (current_date + 9)::date, null, 20)`,
    );
    await db.end();

    expect(addonRows).toHaveLength(1);
    // Dłuższa wizyta mieści się rzadziej — terminów musi być mniej.
    expect(withAddon[0].n).toBeLessThan(plain[0].n);
  });

  it('nie przyjmuje dodatku z innego salonu', async () => {
    const email = `obcy-dodatek-${Date.now()}@example.test`;
    createdEmails.push(email);
    const slot = await futureSlot();

    const response = await call({
      action: 'book',
      slug: SALON_SLUG,
      serviceIds: [HAIRCUT],
      startsAt: slot.startsAt,
      staffId: slot.staffId,
      addons: [{ id: '00000000-0000-0000-0000-0000000000ff', quantity: 1 }],
      client: { firstName: 'Krzysztof', email, phone: '+48601202303' },
    });

    expect(response.status).toBe(500);
  });
});