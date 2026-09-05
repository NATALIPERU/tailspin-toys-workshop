import { and, asc, count, eq, inArray } from 'drizzle-orm';
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

export interface GamePage {
    games: Game[];
    page: number;
    pageSize: number;
    totalGames: number;
    totalPages: number;
}

export interface GameFilterOptions {
    categories: { id: number; name: string }[];
    publishers: { id: number; name: string }[];
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
 * Fetches one deterministic page of games and the catalog totals.
 *
 * @param db - The database instance used to query games.
 * @param page - One-based page number; values below one use the first page.
 * @param pageSize - Number of games to include per page.
 * @returns The requested games and pagination metadata.
 * @remarks Pagination is applied after title ordering so static pages remain stable between builds.
 */
export async function getGamesPage(
    db: Database,
    page: number,
    pageSize: number,
): Promise<GamePage> {
    const normalizedPageSize = Math.max(1, Math.floor(pageSize));
    const normalizedPage = Math.max(1, Math.floor(page));
    const [{ totalGames }] = await db.select({ totalGames: count() }).from(games);
    const totalPages = Math.max(1, Math.ceil(totalGames / normalizedPageSize));
    const currentPage = Math.min(normalizedPage, totalPages);
    const rows = await baseGamesQuery(db)
        .orderBy(asc(games.title))
        .limit(normalizedPageSize)
        .offset((currentPage - 1) * normalizedPageSize);

    return {
        games: rows.map(mapGame),
        page: currentPage,
        pageSize: normalizedPageSize,
        totalGames,
        totalPages,
    };
}

/**
 * Fetches the category and publisher choices used by the games list filters.
 *
 * @param db - The database instance used to query filter options.
 * @returns Filter options ordered by name for deterministic static output.
 */
export async function getGameFilterOptions(db: Database): Promise<GameFilterOptions> {
    const [categoryRows, publisherRows] = await Promise.all([
        db.select({ id: categories.id, name: categories.name }).from(categories).orderBy(asc(categories.name)),
        db.select({ id: publishers.id, name: publishers.name }).from(publishers).orderBy(asc(publishers.name)),
    ]);

    return { categories: categoryRows, publishers: publisherRows };
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
