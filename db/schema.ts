import { integer, sqliteTable, text } from 'void/schema-d1';

// The social game state is stored in Void's local D1 database while developing.
// Keeping the domain document in one row lets the existing co-op API move intact.
export const gameState = sqliteTable('game_state', {
  id: integer('id').primaryKey(),
  payload: text('payload').notNull(),
});
