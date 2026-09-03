import type { SupplierInvitation } from '../../server/types/invitation';
import type { SupplierQuote } from '../../server/types/quote';

export interface BuyerApiClient {
  listInvitations(eventId: string): Promise<SupplierInvitation[]>;
  createInvitation(eventId: string, body: CreateInvitationBody): Promise<{ invitation: SupplierInvitation; portalToken: string }>;
  revokeInvitation(id: string): Promise<SupplierInvitation>;
  regenerateInvitation(id: string): Promise<{ invitation: SupplierInvitation; portalToken: string }>;
  listQuotes(eventId: string): Promise<SupplierQuote[]>;
  getQuote(id: string): Promise<SupplierQuote>;
}

export interface CreateInvitationBody {
  eventReference: string;
  eventTitleSnapshot: string;
  supplierId: string;
  supplierNameSnapshot: string;
  supplierEmailSnapshot: string;
  supplierCodeSnapshot?: string;
  expiresAt?: string;
}

export function createBuyerApiClient(baseUrl: string, getToken: () => Promise<string>): BuyerApiClient {
  async function headers(): Promise<Record<string, string>> {
    const token = await getToken();
    return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
  }

  async function get<T>(path: string): Promise<T> {
    const res = await fetch(`${baseUrl}${path}`, { headers: await headers() });
    if (!res.ok) throw new Error(`API error ${res.status}: ${path}`);
    return res.json() as Promise<T>;
  }

  async function post<T>(path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${baseUrl}${path}`, { method: 'POST', headers: await headers(), body: body ? JSON.stringify(body) : undefined });
    if (!res.ok) throw new Error(`API error ${res.status}: ${path}`);
    return res.json() as Promise<T>;
  }

  return {
    async listInvitations(eventId) {
      const data = await get<{ invitations: SupplierInvitation[] }>(`/api/buyer/events/${eventId}/invitations`);
      return data.invitations;
    },
    async createInvitation(eventId, body) {
      return post<{ invitation: SupplierInvitation; portalToken: string }>(`/api/buyer/events/${eventId}/invitations`, body);
    },
    async revokeInvitation(id) {
      const data = await post<{ invitation: SupplierInvitation }>(`/api/buyer/invitations/${id}/revoke`);
      return data.invitation;
    },
    async regenerateInvitation(id) {
      return post<{ invitation: SupplierInvitation; portalToken: string }>(`/api/buyer/invitations/${id}/regenerate`);
    },
    async listQuotes(eventId) {
      const data = await get<{ quotes: SupplierQuote[] }>(`/api/buyer/events/${eventId}/quotes`);
      return data.quotes;
    },
    async getQuote(id) {
      const data = await get<{ quote: SupplierQuote }>(`/api/buyer/quotes/${id}`);
      return data.quote;
    },
  };
}
