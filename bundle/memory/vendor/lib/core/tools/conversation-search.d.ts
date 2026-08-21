/**
 * conversation_search tool: Agent-callable tool for searching L0 conversation records.
 *
 * Supports three search strategies with automatic degradation:
 *   1. **hybrid** (default) — FTS5 keyword + vector embedding in parallel,
 *      merged via Reciprocal Rank Fusion (RRF).
 *   2. **embedding** — pure vector similarity (when FTS5 is unavailable).
 *   3. **fts** — pure FTS5 keyword search (when embedding is unavailable).
 *
 * The tool is registered via `api.registerTool()` in index.ts.
 */
import type { IMemoryStore, IsolationFilter } from "../store/types.js";
import type { EmbeddingService } from "../store/embedding.js";
import type { Logger } from "../types.js";
export interface ConversationSearchResultItem {
    id: string;
    session_key: string;
    session_id: string;
    user_id: string;
    agent_id: string;
    /** Role of the message sender: "user" or "assistant" */
    role: string;
    /** Text content of this single message */
    content: string;
    score: number;
    recorded_at: string;
}
export interface ConversationSearchResult {
    results: ConversationSearchResultItem[];
    total: number;
    /** Actual search strategy used: "hybrid", "embedding", "fts", or "none". */
    strategy: string;
    /** Optional message, e.g. when embedding is not configured. */
    message?: string;
}
export declare function executeConversationSearch(params: {
    query: string;
    limit: number;
    sessionKey?: string;
    filter?: IsolationFilter;
    vectorStore?: IMemoryStore;
    embeddingService?: EmbeddingService;
    logger?: Logger;
}): Promise<ConversationSearchResult>;
export declare function formatConversationSearchResponse(result: ConversationSearchResult): string;
