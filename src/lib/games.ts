import { and, asc, eq, inArray } from 'drizzle-orm';
import type { Database } from './db';
import { games, categories, publishers } from '../../db/schema';
import type { Game } from '../types/game';

const gameSelection = {
    id: games.id,
    title: games.title,
    description: games.description,
    starRating: games.starRating,
    categoryId: categories.id,
    categoryName: categories.name,
    publisherId: publishers.id,
    publisherName: publishers.name,
};

type GameSelectionRow = {
    id: number;
    title: string;
    description: string;
    starRating: number | null;
    categoryId: number | null;
    categoryName: string | null;
    publisherId: number | null;
    publisherName: string | null;
};

export interface GameFilters {
    categoryIds?: number[];
    publisherId?: number;
}

function mapGame(row: GameSelectionRow): Game {
    return {
        id: row.id,
        title: row.title,
        description: row.description,
        starRating: row.starRating,
        category:
            row.categoryId !== null && row.categoryName !== null
                ? { id: row.categoryId, name: row.categoryName }
                : null,
        publisher:
            row.publisherId !== null && row.publisherName !== null
                ? { id: row.publisherId, name: row.publisherName }
                : null,
    };
}

function baseGamesQuery(db: Database) {
    return db
        .select(gameSelection)
        .from(games)
        .leftJoin(categories, eq(games.categoryId, categories.id))
        .leftJoin(publishers, eq(games.publisherId, publishers.id));
}

/**
 * Fetches all games ordered by title.
 *
 * @param db - The database instance used to query games.
 * @returns All games with their category and publisher relationships.
 * @remarks Title ordering keeps static builds deterministic.
 */
export async function getAllGames(db: Database): Promise<Game[]> {
    const rows = await baseGamesQuery(db).orderBy(asc(games.title));
    return rows.map(mapGame);
}

/**
 * Fetches games matching the requested category and publisher filters.
 *
 * @param db - The database instance used to query games.
 * @param filters - Optional category IDs and publisher ID to apply.
 * @returns Matching games with their relationships, ordered by title.
 * @remarks An empty category list means no category filter; multiple categories are combined with OR semantics.
 */
export async function getGamesByFilters(
    db: Database,
    filters: GameFilters,
): Promise<Game[]> {
    const conditions = [];

    if (filters.categoryIds && filters.categoryIds.length > 0) {
        conditions.push(inArray(games.categoryId, filters.categoryIds));
    }

    if (filters.publisherId !== undefined) {
        conditions.push(eq(games.publisherId, filters.publisherId));
    }

    const query = baseGamesQuery(db);
    const rows = await (conditions.length > 0
        ? query.where(and(...conditions))
        : query
    ).orderBy(asc(games.title));

    return rows.map(mapGame);
}

/**
 * Fetches all game IDs ordered by title.
 *
 * @param db - The database instance used to query games.
 * @returns Game IDs sorted by their game titles.
 * @remarks The ordering matches getAllGames for deterministic static routes.
 */
export async function getAllGameIds(db: Database): Promise<number[]> {
    const rows = await db.select({ id: games.id }).from(games).orderBy(asc(games.title));
    return rows.map((row) => row.id);
}

/**
 * Fetches one game by ID.
 *
 * @param db - The database instance used to query games.
 * @param id - The game ID to find.
 * @returns The matching game, or null when no game has that ID.
 */
export async function getGameById(db: Database, id: number): Promise<Game | null> {
    const row = await baseGamesQuery(db).where(eq(games.id, id)).get();
    return row ? mapGame(row) : null;
}
