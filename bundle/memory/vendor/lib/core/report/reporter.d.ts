import type { StorageAdapter } from "../storage/adapter.js";
export declare const REPORT_CONST: {
    readonly PLUGIN: "plugin";
};
export type ReportPayload = Record<string, unknown>;
export interface IReporter {
    reportFunc(category: string, payload: ReportPayload): void;
}
export declare function initReporter(opts: {
    enabled: boolean;
    type: string;
    logger: {
        info: (msg: string) => void;
        debug?: (msg: string) => void;
    };
    instanceId: string;
    pluginVersion: string;
}): void;
export declare function setReporter(reporter: IReporter): void;
/**
 * Reset the reporter singleton so that the next `initReporter` call takes effect.
 * Must be called at plugin re-registration (hot-reload) to pick up config changes.
 */
export declare function resetReporter(): void;
export declare function report(event: string, data: ReportPayload): void;
export declare function getOrCreateInstanceId(pluginDataDir: string, storage?: StorageAdapter): Promise<string>;
