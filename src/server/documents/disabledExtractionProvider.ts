import type { DocumentExtractionProvider, DocumentExtractionResult } from '../../shared/types/document.js';

export const disabledExtractionProvider: DocumentExtractionProvider = {
  name: 'disabled',
  isEnabled: false,

  async extract(_objectKey: string, _filename: string, _mimeType: string): Promise<DocumentExtractionResult> {
    throw new Error('Document AI extraction is not enabled. Configure an AI provider to enable this feature.');
  },
};
