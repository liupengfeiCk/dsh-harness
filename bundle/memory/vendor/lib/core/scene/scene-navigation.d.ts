/**
 * Scene navigation: generates a summary navigation section appended to persona.md.
 *
 * The navigation includes **absolute** file paths so the agent can directly
 * use read_file for on-demand scene loading (progressive disclosure).
 */
import type { SceneIndexEntry } from "./scene-index.js";
/**
 * Generate the scene navigation Markdown section.
 *
 * @param entries - Scene index entries
 * @param dataDir - Absolute path to the plugin data directory; when provided
 *                  and useCos=false, paths are absolute for read_file.
 * @param useCos  - When true, paths use scenes/ prefix and footer says tdai_read_cos.
 */
export declare function generateSceneNavigation(entries: SceneIndexEntry[], dataDir?: string, useCos?: boolean): string;
/**
 * Strip the scene navigation section from persona content.
 */
export declare function stripSceneNavigation(personaContent: string): string;
