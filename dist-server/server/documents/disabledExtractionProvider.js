export const disabledExtractionProvider = {
    name: 'disabled',
    isEnabled: false,
    async extract(_objectKey, _filename, _mimeType) {
        throw new Error('Document AI extraction is not enabled. Configure an AI provider to enable this feature.');
    },
};
