import mondaySdkFactory from 'monday-sdk-js';
import type { AppFeatureObjectContext } from 'monday-sdk-js/types/client-context.type';

export { AppFeatureObjectContext };

export enum RuntimeMode {
  MONDAY = 'MONDAY',
  LOCAL_DEVELOPMENT = 'LOCAL_DEVELOPMENT',
  TEST = 'TEST',
}

export function detectRuntimeMode(): RuntimeMode {
  if (typeof process !== 'undefined' && process.env.NODE_ENV === 'test') {
    return RuntimeMode.TEST;
  }
  if (typeof window !== 'undefined' && window.self !== window.top) {
    return RuntimeMode.MONDAY;
  }
  return RuntimeMode.LOCAL_DEVELOPMENT;
}

export interface StorageGetResult {
  success: boolean;
  value: string | null;
  version?: string;
}

export interface StorageSetResult {
  success: boolean;
  version: string;
}

export interface MondayRuntimeAdapter {
  readonly mode: RuntimeMode;
  getContext(): Promise<AppFeatureObjectContext>;
  /** monday.get("sessionToken") — a short-lived JWT verified server-side against MONDAY_CLIENT_SECRET. */
  getSessionToken(): Promise<string>;
  api(query: string, variables?: Record<string, unknown>): Promise<unknown>;
  storage: {
    getItem(key: string): Promise<StorageGetResult>;
    setItem(key: string, value: string, options?: { previous_version?: string }): Promise<StorageSetResult>;
    deleteItem(key: string): Promise<void>;
  };
}

const MONDAY_API_VERSION = '2026-07';

interface MondaySdkInstance {
  setApiVersion(v: string): void;
  get(type: string, params?: Record<string, unknown>): Promise<{ data: unknown }>;
  api(query: string, options?: Record<string, unknown>): Promise<unknown>;
  storage: {
    getItem(key: string): Promise<{ data: { success: boolean; value: unknown; version?: string } }>;
    setItem(key: string, value: unknown, options?: { previous_version?: string }): Promise<{ data: { success: boolean; version: string } }>;
    deleteItem(key: string): Promise<unknown>;
  };
}

let _sdkInstance: MondaySdkInstance | undefined;
function getSdk(): MondaySdkInstance {
  if (!_sdkInstance) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    _sdkInstance = (mondaySdkFactory as any)() as MondaySdkInstance;
    _sdkInstance.setApiVersion(MONDAY_API_VERSION);
  }
  return _sdkInstance;
}

export function createMondayRuntimeAdapter(): MondayRuntimeAdapter {
  const sdk = getSdk();

  return {
    mode: RuntimeMode.MONDAY,

    async getContext(): Promise<AppFeatureObjectContext> {
      const result = await sdk.get('context');
      return result.data as AppFeatureObjectContext;
    },

    async getSessionToken(): Promise<string> {
      const result = await sdk.get('sessionToken');
      return result.data as string;
    },

    async api(query: string, variables?: Record<string, unknown>): Promise<unknown> {
      const opts: Record<string, unknown> = { apiVersion: MONDAY_API_VERSION };
      if (variables) opts.variables = variables;
      return sdk.api(query, opts);
    },

    storage: {
      async getItem(key: string): Promise<StorageGetResult> {
        const result = await sdk.storage.getItem(key);
        const data = result.data;
        return {
          success: data.success,
          value: data.value != null ? String(data.value) : null,
          version: data.version,
        };
      },

      async setItem(key: string, value: string, options?: { previous_version?: string }): Promise<StorageSetResult> {
        const result = await sdk.storage.setItem(key, value, options);
        const data = result.data;
        return { success: data.success, version: data.version };
      },

      async deleteItem(key: string): Promise<void> {
        await sdk.storage.deleteItem(key);
      },
    },
  };
}
