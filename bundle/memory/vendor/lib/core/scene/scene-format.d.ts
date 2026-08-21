/**
 * Scene Block file format: parse and format the META-delimited Markdown files.
 */
export interface SceneBlockMeta {
    created: string;
    updated: string;
    summary: string;
    heat: number;
}
export interface SceneBlock {
    filename: string;
    meta: SceneBlockMeta;
    content: string;
}
/**
 * Parse a Scene Block file into structured data.
 */
export declare function parseSceneBlock(raw: string, filename: string): SceneBlock;
/**
 * Format a Scene Block back into file content.
 */
export declare function formatSceneBlock(meta: SceneBlockMeta, content: string): string;
/**
 * Format the META section.
 */
export declare function formatMeta(meta: SceneBlockMeta): string;
