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
import { release as osRelease } from 'node:os';
import { runNativeCommand } from '@deepseek-ai/dsh-native-command';
/** Whether one environment marker is set to a non-empty value. */
function present(value) {
    return value !== undefined && value !== '';
}
/** Distinguish WSL from desktop Linux using its process and kernel markers. */
function isWsl(internals) {
    const env = internals.env ?? process.env;
    if (present(env.WSL_DISTRO_NAME) || present(env.WSL_INTEROP))
        return true;
    return (internals.osRelease ?? osRelease()).toLowerCase().includes('microsoft');
}
/** PowerShell single-quoted literal (doubles embedded quotes). */
function powershellLiteral(path) {
    return `'${path.replace(/'/g, "''")}'`;
}
/** Open one Windows-resolvable path through its registered desktop application. */
async function openWindowsDirectory(path, signal, run) {
    await run('powershell.exe', [
        '-NoProfile',
        '-Command',
        `Invoke-Item -LiteralPath ${powershellLiteral(path)}`,
    ], signal);
}
/** Translate a WSL path before handing it to the Windows desktop. */
async function openWslDirectory(path, signal, run) {
    const translated = await run('wslpath', ['-w', path], signal);
    signal.throwIfAborted();
    const windowsPath = translated.stdout.replace(/[\r\n]+$/, '');
    if (windowsPath === '')
        throw new Error('wslpath returned no Windows path');
    await openWindowsDirectory(windowsPath, signal, run);
}
/**
 * Open one directory with the operating system's default application.
 * @param path - absolute or host-resolvable directory path (the caller owns resolution).
 * @param signal - caller/connection lifetime; abort terminates the native command.
 * @param internals - platform and runner hooks for deterministic tests.
 */
export async function openDirectory(path, signal, internals = {}) {
    const platform = internals.platform ?? process.platform;
    const run = internals.run ?? runNativeCommand;
    if (platform === 'darwin') {
        await run('open', [path], signal);
        return;
    }
    if (platform === 'win32') {
        await openWindowsDirectory(path, signal, run);
        return;
    }
    if (platform === 'linux') {
        if (isWsl(internals)) {
            await openWslDirectory(path, signal, run);
            return;
        }
        await run('xdg-open', [path], signal);
        return;
    }
    throw new Error(`native directory opener is unsupported on ${platform}`);
}
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
export function canOpenDirectory(internals = {}) {
    const platform = internals.platform ?? process.platform;
    if (platform === 'darwin' || platform === 'win32')
        return true;
    if (platform !== 'linux')
        return false;
    const env = internals.env ?? process.env;
    return isWsl(internals) || present(env.DISPLAY) || present(env.WAYLAND_DISPLAY);
}
//# sourceMappingURL=opener.js.map