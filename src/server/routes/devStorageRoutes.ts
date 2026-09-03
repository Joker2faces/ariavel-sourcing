import express, { Router, type Request, type Response } from 'express';
import type { InMemoryObjectStorageProvider } from '../storage/objectStorageProvider.js';
import type { AttachmentRepository } from '../db/attachmentRepository.js';

const rawBody = express.raw({ type: '*/*', limit: '25mb' });

/**
 * Dev-only receiver for the in-memory ObjectStorage fallback's upload URLs
 * (see objectStorageProvider.ts). Mounted only when OBJECT_STORAGE_BUCKET is
 * not set — i.e. local development, tests, or before monday Code provisions
 * the real bucket. Never mounted against the real monday Object Storage adapter.
 *
 * Security: the objectKey itself is an unguessable per-upload random value, and
 * the write is additionally gated on a matching PENDING_UPLOAD attachment record
 * — an attacker without both the exact key and a pending upload gets a 404.
 */
export function createDevStorageRouter(
  storage: InMemoryObjectStorageProvider,
  attachmentRepo: AttachmentRepository,
): Router {
  const router = Router();

  router.put('/:objectKey', rawBody, async (req: Request, res: Response) => {
    const objectKey = decodeURIComponent(req.params['objectKey'] as string);
    const parts = objectKey.split('/');
    const tenantId = parts[0];
    if (!tenantId) { res.status(400).json({ error: 'Invalid object key' }); return; }

    // Confirm a pending attachment actually references this exact key before accepting bytes.
    const pending = await attachmentRepo.listForEntity(tenantId, parts[1] ?? '', parts[2] ?? '');
    const match = pending.find(a => a.objectKey === objectKey && a.status === 'PENDING_UPLOAD');
    if (!match) { res.status(404).json({ error: 'No pending upload for this object key' }); return; }

    const contentType = req.headers['content-type'];
    storage.putFile(objectKey, req.body as Buffer, typeof contentType === 'string' ? contentType : undefined);
    res.status(200).json({ ok: true });
  });

  return router;
}
