// Real monday Object Storage in production (OBJECT_STORAGE_BUCKET auto-provided by monday Code),
// with a dev-safe in-memory fallback mirroring the Mongo real/in-memory split in db/connection.ts.

export interface ObjectStorageProvider {
  /** Returns a URL the client can PUT raw file bytes to directly. */
  getUploadUrl(objectKey: string, contentType: string, expiresInMs: number): Promise<string>;
  downloadFile(objectKey: string): Promise<{ content: Buffer; contentType?: string } | null>;
  deleteFile(objectKey: string): Promise<void>;
}

export async function createMondayObjectStorageProvider(): Promise<ObjectStorageProvider> {
  const { ObjectStorage } = await import('@mondaycom/apps-sdk');
  const storage = new ObjectStorage();

  return {
    async getUploadUrl(objectKey, contentType, expiresInMs) {
      const res = await storage.getPresignedUploadUrl(objectKey, {
        contentType,
        expires: new Date(Date.now() + expiresInMs),
      });
      if (!res.success || !res.presignedUrl) {
        throw new Error(res.error ?? 'Failed to generate presigned upload URL');
      }
      return res.presignedUrl;
    },

    async downloadFile(objectKey) {
      const res = await storage.downloadFile(objectKey);
      if (!res.success || !res.content) return null;
      return { content: res.content, contentType: res.contentType };
    },

    async deleteFile(objectKey) {
      const res = await storage.deleteFile(objectKey);
      if (!res.success) throw new Error(res.error ?? 'Failed to delete file');
    },
  };
}

/**
 * Dev-mode fallback used when OBJECT_STORAGE_BUCKET is not set (local development,
 * unit tests, first-release bootstrap before monday Code provisions the bucket).
 * getUploadUrl returns a same-origin path served by devStorageRoutes.ts — the client
 * PUTs raw bytes there exactly as it would to a real presigned URL. The objectKey
 * itself is an unguessable per-upload random value (see documentService.genObjectKey),
 * so capability-by-URL-secrecy mirrors how a real presigned URL behaves.
 */
export interface InMemoryObjectStorageProvider extends ObjectStorageProvider {
  /** Used only by devStorageRoutes.ts to record a received PUT body. */
  putFile(objectKey: string, content: Buffer, contentType?: string): void;
}

export function createInMemoryObjectStorageProvider(): InMemoryObjectStorageProvider {
  const files = new Map<string, { content: Buffer; contentType?: string }>();

  return {
    async getUploadUrl(objectKey) {
      return `/api/dev-storage/${encodeURIComponent(objectKey)}`;
    },
    async downloadFile(objectKey) {
      return files.get(objectKey) ?? null;
    },
    async deleteFile(objectKey) {
      files.delete(objectKey);
    },
    putFile(objectKey, content, contentType) {
      files.set(objectKey, { content, contentType });
    },
  };
}
