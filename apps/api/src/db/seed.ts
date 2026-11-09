import { createDb, createPool } from "./client.ts";
import { events, ticketTypes, users } from "./schema.ts";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL não definida");

const pool = createPool(url);
try {
  const db = createDb(pool);
  // Dados fictícios de desenvolvimento. O hash abaixo NÃO é de senha real.
  const [organizer] = await db
    .insert(users)
    .values({
      email: "organizador@example.com",
      name: "Organizador Demo",
      passwordHash: "seed-sem-senha-real",
      role: "organizer",
    })
    .onConflictDoNothing()
    .returning();
  if (!organizer) {
    console.log("Seed já aplicado.");
  } else {
    const [event] = await db
      .insert(events)
      .values({
        organizerId: organizer.id,
        title: "Conferência Demo",
        venue: "Centro de Convenções",
        city: "Curitiba",
        startsAt: new Date("2027-03-10T12:00:00Z"),
        endsAt: new Date("2027-03-10T22:00:00Z"),
        status: "published",
      })
      .returning();
    await db.insert(ticketTypes).values([
      { eventId: event!.id, name: "Geral", priceCents: 15000, quantity: 100 },
      { eventId: event!.id, name: "VIP", priceCents: 40000, quantity: 20 },
    ]);
    console.log("Seed aplicado.");
  }
} finally {
  await pool.end();
}
