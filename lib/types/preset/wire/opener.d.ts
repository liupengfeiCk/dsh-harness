/**
 * Native directory opener for the subagent-management wire layer.
 *
 * Opening one subagent's directory is a host-desktop gesture: the browser
 * names a subagent id, the Host resolves it to its directory, and this module
 * hands that directory to the operating system's default application. It is a
 * separate concern from the registry so the wire layer can decide — like the
 * withdrawn apiproxy domain did — whether the deployment can open anything at
 * all (a headless or containerised Host reports no opener and the surface then
 * reveals the path as text instead of offering a button that would spawn
 * `xdg-open` into nothing).
 *
 * Only the "open a directory with the default application" intent is needed
 * here (a subagent directory is never a browser-renderable document), so this
 * opener is deliberately narrower than the apiproxy file/text opener it
 * replaces. Cross-platform behaviour mirrors that opener: macOS `open`, the
 * Windows `Invoke-Item` PowerShell hand-off, WSL path translation, and desktop
 * Linux `xdg-open`.
 * @module dsh-harness-subagent-bundle/preset/wire-opener
 */
import { type NativeCommandRunner } from '@deepseek-ai/dsh-native-command';
/** Injectable platform facts for deterministic opener tests. */
export interface WireOpenerInternals {
    platform?: NodeJS.Platform;
    /** Kernel release override used to distinguish WSL from desktop Linux. */
    osRelease?: string;
    /** Environment used for WSL markers and the desktop Linux display test. */
    env?: NodeJS.ProcessEnv;
    /** Command runner seam (defaults to the no-shell native runner). */
    run?: NativeCommandRunner;
}
/**
 * Open one directory with the operating system's default application.
 * @param path - absolute or host-resolvable directory path (the caller owns resolution).
 * @param signal - caller/connection lifetime; abort terminates the native command.
 * @param internals - platform and runner hooks for deterministic tests.
 */
export declare function openDirectory(path: string, signal: AbortSignal, internals?: WireOpenerInternals): Promise<void>;
/**
 * Whether {@link openDirectory} plausibly reaches a desktop on this host.
 *
 * macOS and Windows always carry a desktop opener; Linux does when it is WSL
 * (the Windows desktop takes the path) or a display server is announced.
 * A headless or containerised Linux host answers false, which is what lets a
 * surface show a directory as text instead of offering an open button.
 * @param internals - platform and environment seam for deterministic tests.
 * @returns true when handing a directory to the native opener can work at all.
 */
export declare function canOpenDirectory(internals?: WireOpenerInternals): boolean;
//# sourceMappingURL=opener.d.ts.map