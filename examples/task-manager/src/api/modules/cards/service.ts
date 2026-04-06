import { and, asc, count, eq } from "drizzle-orm";
import { db } from "@/db";
import { cards } from "@/db/schema";

export type { Card, ColumnType } from "@/db/schema";

import type { Card, ColumnType } from "@/db/schema";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function uid(): string {
  return Math.random().toString(36).slice(2, 10);
}

// ---------------------------------------------------------------------------
// Cards queries
// ---------------------------------------------------------------------------

export function getCard(id: string): Card | undefined {
  return db.select().from(cards).where(eq(cards.id, id)).get() ?? undefined;
}

export function getCardsForBoard(boardId: string): Card[] {
  return db
    .select()
    .from(cards)
    .where(eq(cards.boardId, boardId))
    .orderBy(asc(cards.position))
    .all();
}

export function createCard(boardId: string, title: string, column: ColumnType): Card {
  const row = db
    .select({ n: count() })
    .from(cards)
    .where(and(eq(cards.boardId, boardId), eq(cards.column, column)))
    .get();
  const position = row?.n ?? 0;
  const card: Card = {
    id: uid(),
    boardId,
    column,
    title,
    description: "",
    position,
    createdAt: new Date().toISOString(),
  };
  db.insert(cards).values(card).run();
  return card;
}

export function updateCard(
  id: string,
  data: Partial<Pick<Card, "title" | "description" | "column" | "position">>
): Card | undefined {
  const existing = db.select().from(cards).where(eq(cards.id, id)).get();
  if (!existing) {
    return undefined;
  }
  db.update(cards)
    .set({
      title: data.title ?? existing.title,
      description: data.description ?? existing.description,
      column: data.column ?? existing.column,
      position: data.position ?? existing.position,
    })
    .where(eq(cards.id, id))
    .run();
  return db.select().from(cards).where(eq(cards.id, id)).get() ?? undefined;
}

export function deleteCard(id: string): boolean {
  const result = db.delete(cards).where(eq(cards.id, id)).returning({ id: cards.id }).all();
  return result.length > 0;
}
