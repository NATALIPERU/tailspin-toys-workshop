import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDatabase } from '../../db/test-helpers';
import { categories, publishers, games } from '../../db/schema';
import type { Database } from './db';
import {
    getAllGames,
    getAllGameIds,
    getGamesPage,
    getGamesByFilters,
    getGameById,
} from './games';

async function seedGames(db: Database, count: number): Promise<void> {
    const [category] = await db
        .insert(categories)
        .values({ name: 'Strategy', description: 'cat' })
        .returning({ id: categories.id });
    const [publisher] = await db
        .insert(publishers)
        .values({ name: 'Pub One', description: 'pub' })
        .returning({ id: publishers.id });

    // Insert titles in reverse-alphabetical order to prove ordering is applied.
    for (let i = count; i >= 1; i--) {
        await db.insert(games).values({
            title: `Game ${String(i).padStart(2, '0')}`,
            description: `Description ${i}`,
            starRating: 4.2,
            categoryId: category.id,
            publisherId: publisher.id,
        });
    }
}

describe('games data-access helpers', () => {
    let db: Database;

    beforeEach(async () => {
        db = await createTestDatabase();
    });

    it('returns all games ordered by title', async () => {
        await seedGames(db, 3);
        const all = await getAllGames(db);
        expect(all.map((g) => g.title)).toEqual(['Game 01', 'Game 02', 'Game 03']);
        expect(all[0].category).toEqual({ id: expect.any(Number), name: 'Strategy' });
        expect(all[0].publisher).toEqual({ id: expect.any(Number), name: 'Pub One' });
    });

    it('returns all game ids ordered by title', async () => {
        await seedGames(db, 3);
        const ids = await getAllGameIds(db);
        const all = await getAllGames(db);
        expect(ids).toEqual(all.map((g) => g.id));
    });

    it('returns a page of games with stable pagination metadata', async () => {
        await seedGames(db, 5);

        const page = await getGamesPage(db, 2, 2);

        expect(page.totalGames).toBe(5);
        expect(page.totalPages).toBe(3);
        expect(page.page).toBe(2);
        expect(page.games.map((game) => game.title)).toEqual(['Game 03', 'Game 04']);
    });

    it('clamps page values outside the available range', async () => {
        await seedGames(db, 2);

        const page = await getGamesPage(db, 99, 2);

        expect(page.page).toBe(1);
        expect(page.games).toHaveLength(2);
    });

    it('filters games by one or more categories', async () => {
        await seedGames(db, 3);
        const [category] = await db
            .insert(categories)
            .values({ name: 'Puzzle', description: 'puzzle games' })
            .returning({ id: categories.id });
        await db.insert(games).values({
            title: 'Puzzle Game',
            description: 'Puzzle description',
            starRating: 4,
            categoryId: category.id,
            publisherId: 1,
        });

        const filtered = await getGamesByFilters(db, {
            categoryIds: [category.id],
        });

        expect(filtered.map((game) => game.title)).toEqual(['Puzzle Game']);
    });

    it('filters games by publisher and category together', async () => {
        await seedGames(db, 2);
        const [publisher] = await db
            .insert(publishers)
            .values({ name: 'Pub Two', description: 'second publisher' })
            .returning({ id: publishers.id });
        const [category] = await db
            .insert(categories)
            .values({ name: 'Puzzle', description: 'puzzle games' })
            .returning({ id: categories.id });
        await db.insert(games).values([
            {
                title: 'Matching Game',
                description: 'Matches both filters',
                starRating: 4,
                categoryId: category.id,
                publisherId: publisher.id,
            },
            {
                title: 'Category Only',
                description: 'Matches only category',
                starRating: 4,
                categoryId: category.id,
                publisherId: 1,
            },
        ]);

        const filtered = await getGamesByFilters(db, {
            categoryIds: [category.id],
            publisherId: publisher.id,
        });

        expect(filtered.map((game) => game.title)).toEqual(['Matching Game']);
    });

    it('returns an empty list when filters match no games', async () => {
        await seedGames(db, 2);

        const filtered = await getGamesByFilters(db, {
            categoryIds: [99999],
            publisherId: 99999,
        });

        expect(filtered).toEqual([]);
    });

    it('fetches a single game by id', async () => {
        await seedGames(db, 2);
        const ids = await getAllGameIds(db);
        const game = await getGameById(db, ids[0]);
        expect(game?.title).toBe('Game 01');
    });

    it('returns null for a non-existent game', async () => {
        await seedGames(db, 2);
        expect(await getGameById(db, 99999)).toBeNull();
    });
});
