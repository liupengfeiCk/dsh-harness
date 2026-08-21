/**
 * Storage Backend Factory — creates the appropriate IStorageBackend
 * based on configuration.
 *
 * The default `local` backend is bundled with core. The optional `cos` backend
 * is loaded dynamically; when unavailable, the factory throws a clear error
 * directing the operator to either provide the backend or switch to `type=local`.
 */

import type { IStorageBackend, StorageBackendConfig, StorageLogger } from "./types.js";
import { LocalStorageBackend } from "./local-backend.js";

const TAG = "[storage][factory]";

/**
 * Create a storage backend instance based on configuration.
 *
 * Async because the optional COS backend is dynamically imported only when needed.
 *
 * @param config Backend configuration (type + backend-specific options)
 * @param logger Optional logger
 * @returns IStorageBackend instance
 */
export async function createStorageBackend(
  config: StorageBackendConfig,
  logger?: StorageLogger,
): Promise<IStorageBackend> {
  switch (config.type) {
    // NOTE: 原 COS 远端对象存储分支已随云基础设施裁切移除（设计文档 §8.4）。
    // DSH 单机部署仅使用本地文件存储。config.type 允许 "local" | "cos"，
    // "cos" 分支此处统一回落到 local（配置残留时安全降级），不再动态加载 COS。
    case "cos":
    case "local":
    default: {
      const rootDir = config.localRootDir ?? "./data/storage";
      logger?.info(`${TAG} Creating local storage backend: rootDir=${rootDir}`);
      return new LocalStorageBackend({
        rootDir,
        logger,
      });
    }
  }
}

/**
 * Create a local storage backend for development.
 * Convenience helper for quick local setup.
 */
export function createLocalStorageBackend(
  rootDir: string,
  logger?: StorageLogger,
): IStorageBackend {
  return new LocalStorageBackend({ rootDir, logger });
}
