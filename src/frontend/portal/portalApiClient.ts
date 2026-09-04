import type { InvitationPublicDTO, RfqLineSnapshot } from '../../server/types/invitation';
import type { QuoteInput, QuotePublicDTO } from '../../server/types/quote';
import type { ExcelImportResult } from '../../shared/types/document';

export interface PortalApiClient {
  getInvitation(token: string): Promise<InvitationPublicDTO>;
  getQuote(token: string): Promise<QuotePublicDTO | null>;
  saveDraft(token: string, input: QuoteInput): Promise<QuotePublicDTO>;
  submit(token: string): Promise<Pick<QuotePublicDTO, 'status' | 'submittedAt'>>;
  /** Same-origin URL the browser can navigate/download directly — no fetch wrapper needed for a GET file download. */
  quoteTemplateUrl(token: string, rfqReference: string, lines: RfqLineSnapshot[]): string;
  /** Dry-run parse of a supplier-uploaded quote file; never auto-submits. */
  importQuote(token: string, csvContent: string, validLineIds: string[], rfqReference?: string): Promise<ExcelImportResult>;
}

export class PortalApiError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
  }
}

// Public, token-authenticated client for the supplier portal — no monday
// session, no Authorization header. The raw invitation token IS the
// credential, carried in the URL path exactly as the buyer's invite link
// contains it.
export function createPortalApiClient(baseUrl = ''): PortalApiClient {
  async function req<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`${baseUrl}${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new PortalApiError(res.status, body.error ?? `Request failed (${res.status})`);
    }
    return res.json() as Promise<T>;
  }

  return {
    async getInvitation(token) {
      const data = await req<{ invitation: InvitationPublicDTO }>(`/api/portal/invitations/${encodeURIComponent(token)}`);
      return data.invitation;
    },
    async getQuote(token) {
      const data = await req<{ quote: QuotePublicDTO | null }>(`/api/portal/invitations/${encodeURIComponent(token)}/quote`);
      return data.quote;
    },
    async saveDraft(token, input) {
      const data = await req<{ quote: QuotePublicDTO }>(`/api/portal/invitations/${encodeURIComponent(token)}/quote`, {
        method: 'PUT',
        body: JSON.stringify(input),
      });
      return data.quote;
    },
    async submit(token) {
      const data = await req<{ quote: Pick<QuotePublicDTO, 'status' | 'submittedAt'> }>(`/api/portal/invitations/${encodeURIComponent(token)}/submit`, {
        method: 'POST',
      });
      return data.quote;
    },
    quoteTemplateUrl(token, rfqReference, lines) {
      // The server's template generator expects SourcingLine-shaped objects
      // (id, not lineId) — map the invitation's RfqLineSnapshot before serializing.
      const eventLines = lines.map(l => ({ id: l.lineId, description: l.description, quantity: l.quantity, unit: l.unit }));
      const params = new URLSearchParams({ rfqReference, eventLines: JSON.stringify(eventLines) });
      return `${baseUrl}/api/portal/invitations/${encodeURIComponent(token)}/quote-template?${params.toString()}`;
    },
    async importQuote(token, csvContent, validLineIds, rfqReference) {
      const data = await req<{ result: ExcelImportResult }>(`/api/portal/invitations/${encodeURIComponent(token)}/quote-import`, {
        method: 'POST',
        body: JSON.stringify({ csvContent, validLineIds, rfqReference }),
      });
      return data.result;
    },
  };
}
