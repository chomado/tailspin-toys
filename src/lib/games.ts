import { eq, asc, inArray, and } from 'drizzle-orm';
import type { Database } from './db';
import { games, categories, publishers } from '../../db/schema';
import type { Game } from '../types/game';

export interface GameFilterOptions {
    categoryIds?: number[];
    publisherId?: number | null;
}

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

/** Return games matching optional category and publisher filters, ordered by title. */
export async function getGames(db: Database, filters: GameFilterOptions = {}): Promise<Game[]> {
    const categoryIds = filters.categoryIds ?? [];
    const publisherId = filters.publisherId ?? null;

    if (categoryIds.length > 0 && publisherId !== null) {
        const rows = await baseGamesQuery(db)
            .where(and(inArray(games.categoryId, categoryIds), eq(games.publisherId, publisherId)))
            .orderBy(asc(games.title));
        return rows.map(mapGame);
    }

    if (categoryIds.length > 0) {
        const rows = await baseGamesQuery(db)
            .where(inArray(games.categoryId, categoryIds))
            .orderBy(asc(games.title));
        return rows.map(mapGame);
    }

    if (publisherId !== null) {
        const rows = await baseGamesQuery(db)
            .where(eq(games.publisherId, publisherId))
            .orderBy(asc(games.title));
        return rows.map(mapGame);
    }

    const rows = await baseGamesQuery(db).orderBy(asc(games.title));
    return rows.map(mapGame);
}

/** All games ordered by title. */
export async function getAllGames(db: Database): Promise<Game[]> {
    return getGames(db);
}

/** All game ids ordered by title. */
export async function getAllGameIds(db: Database): Promise<number[]> {
    const rows = await db.select({ id: games.id }).from(games).orderBy(asc(games.title));
    return rows.map((row) => row.id);
}

/** A single game by id, or null when it does not exist. */
export async function getGameById(db: Database, id: number): Promise<Game | null> {
    const rows = await baseGamesQuery(db).where(eq(games.id, id)).limit(1);
    return rows.length > 0 ? mapGame(rows[0]) : null;
}
