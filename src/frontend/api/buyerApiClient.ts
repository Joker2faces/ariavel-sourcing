import type { SupplierInvitation, RfqLineSnapshot } from '../../server/types/invitation';
import type { SupplierQuote } from '../../server/types/quote';
import type { ComparisonSnapshot, ComparisonInput } from '../../shared/types/bid';
import type { SourcingLine } from '../../shared/types/domain';
import type { TenantSettings, TenantSettingsInput } from '../../shared/types/tenantSettings';
import type { AwardScenario, AwardScenarioInput } from '../../shared/types/award';
import type { AuditEvent } from '../../server/types/audit';
import type { Attachment, PresignedUploadResponse } from '../../shared/types/document';

export interface BuyerApiClient {
  listInvitations(eventId: string): Promise<SupplierInvitation[]>;
  createInvitation(eventId: string, body: CreateInvitationBody): Promise<{ invitation: SupplierInvitation; portalToken: string }>;
  revokeInvitation(id: string): Promise<SupplierInvitation>;
  regenerateInvitation(id: string): Promise<{ invitation: SupplierInvitation; portalToken: string }>;
  listQuotes(eventId: string): Promise<SupplierQuote[]>;
  getQuote(id: string): Promise<SupplierQuote>;
  buildComparison(eventId: string, eventLines: SourcingLine[], input: ComparisonInput): Promise<ComparisonSnapshot>;
  getLatestComparison(eventId: string): Promise<ComparisonSnapshot | null>;
  listComparisons(eventId: string): Promise<ComparisonSnapshot[]>;
  setManualTechnicalScore(snapshotId: string, supplierId: string, score: number, comment?: string): Promise<ComparisonSnapshot>;
  getSettings(): Promise<TenantSettings>;
  updateSettings(input: TenantSettingsInput, expectedVersion: number): Promise<TenantSettings>;
  createRecommendedAwardScenario(eventId: string, eventLines: SourcingLine[], input: AwardScenarioInput): Promise<AwardScenario>;
  createEmptyAwardScenario(eventId: string, eventLines: SourcingLine[], input: AwardScenarioInput): Promise<AwardScenario>;
  listAwardScenarios(eventId: string): Promise<AwardScenario[]>;
  getAwardScenario(id: string): Promise<AwardScenario>;
  awardLine(scenarioId: string, lineId: string, supplierId: string, quantity: number, overrideReason?: string): Promise<AwardScenario>;
  clearAwardLine(scenarioId: string, lineId: string): Promise<AwardScenario>;
  markAwardLineNoAward(scenarioId: string, lineId: string): Promise<AwardScenario>;
  removeAwardLineAllocation(scenarioId: string, lineId: string, supplierId: string): Promise<AwardScenario>;
  finalizeAwardScenario(scenarioId: string): Promise<AwardScenario>;
  listAuditEvents(eventId: string): Promise<AuditEvent[]>;
  exportAuditCsv(eventId: string): Promise<Blob>;
  exportTenantData(): Promise<Blob>;
  deleteTenantData(confirm: string): Promise<Record<string, number>>;
  listEventAttachments(eventId: string): Promise<Attachment[]>;
  initiateEventAttachmentUpload(eventId: string, filename: string, mimeType: string, sizeBytes: number): Promise<PresignedUploadResponse>;
  uploadAttachmentBytes(uploadUrl: string, file: File): Promise<void>;
  confirmAttachmentUpload(attachmentId: string): Promise<Attachment>;
  deleteAttachment(attachmentId: string): Promise<void>;
  downloadAttachment(attachmentId: string, filename: string): Promise<void>;
  listQuoteAttachments(invitationId: string): Promise<Attachment[]>;
  downloadQuoteTemplate(invitationId: string, rfqReference: string, eventLines: SourcingLine[]): Promise<void>;
}

export interface CreateInvitationBody {
  eventReference: string;
  eventTitleSnapshot: string;
  supplierId: string;
  supplierNameSnapshot: string;
  supplierEmailSnapshot: string;
  supplierCodeSnapshot?: string;
  linesSnapshot?: RfqLineSnapshot[];
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

  async function patch<T>(path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${baseUrl}${path}`, { method: 'PATCH', headers: await headers(), body: body ? JSON.stringify(body) : undefined });
    if (!res.ok) throw new Error(`API error ${res.status}: ${path}`);
    return res.json() as Promise<T>;
  }

  async function put<T>(path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${baseUrl}${path}`, { method: 'PUT', headers: await headers(), body: body ? JSON.stringify(body) : undefined });
    if (!res.ok) {
      const err = new Error(`API error ${res.status}: ${path}`) as Error & { status?: number };
      err.status = res.status;
      throw err;
    }
    return res.json() as Promise<T>;
  }

  async function del<T>(path: string): Promise<T> {
    const res = await fetch(`${baseUrl}${path}`, { method: 'DELETE', headers: await headers() });
    if (!res.ok) {
      const err = new Error(`API error ${res.status}: ${path}`) as Error & { status?: number };
      err.status = res.status;
      throw err;
    }
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
    async buildComparison(eventId, eventLines, input) {
      const data = await post<{ snapshot: ComparisonSnapshot }>(`/api/buyer/events/${eventId}/comparisons`, { ...input, eventLines });
      return data.snapshot;
    },
    async getLatestComparison(eventId) {
      try {
        const data = await get<{ snapshot: ComparisonSnapshot }>(`/api/buyer/events/${eventId}/comparisons/latest`);
        return data.snapshot;
      } catch {
        return null;
      }
    },
    async listComparisons(eventId) {
      const data = await get<{ snapshots: ComparisonSnapshot[] }>(`/api/buyer/events/${eventId}/comparisons`);
      return data.snapshots;
    },
    async setManualTechnicalScore(snapshotId, supplierId, score, comment) {
      const data = await patch<{ snapshot: ComparisonSnapshot }>(`/api/buyer/comparisons/${snapshotId}/scores/${supplierId}`, { score, comment });
      return data.snapshot;
    },
    async getSettings() {
      const data = await get<{ settings: TenantSettings }>('/api/buyer/settings');
      return data.settings;
    },
    async updateSettings(input, expectedVersion) {
      const data = await put<{ settings: TenantSettings }>('/api/buyer/settings', { ...input, expectedVersion });
      return data.settings;
    },
    async createRecommendedAwardScenario(eventId, eventLines, input) {
      const data = await post<{ scenario: AwardScenario }>(`/api/buyer/events/${eventId}/award-scenarios/recommended`, { ...input, eventLines });
      return data.scenario;
    },
    async createEmptyAwardScenario(eventId, eventLines, input) {
      const data = await post<{ scenario: AwardScenario }>(`/api/buyer/events/${eventId}/award-scenarios`, { ...input, eventLines });
      return data.scenario;
    },
    async listAwardScenarios(eventId) {
      const data = await get<{ scenarios: AwardScenario[] }>(`/api/buyer/events/${eventId}/award-scenarios`);
      return data.scenarios;
    },
    async getAwardScenario(id) {
      const data = await get<{ scenario: AwardScenario }>(`/api/buyer/award-scenarios/${id}`);
      return data.scenario;
    },
    async awardLine(scenarioId, lineId, supplierId, quantity, overrideReason) {
      const data = await patch<{ scenario: AwardScenario }>(`/api/buyer/award-scenarios/${scenarioId}/lines/${lineId}`, { supplierId, quantity, overrideReason });
      return data.scenario;
    },
    async clearAwardLine(scenarioId, lineId) {
      const data = await del<{ scenario: AwardScenario }>(`/api/buyer/award-scenarios/${scenarioId}/lines/${lineId}`);
      return data.scenario;
    },
    async markAwardLineNoAward(scenarioId, lineId) {
      const data = await post<{ scenario: AwardScenario }>(`/api/buyer/award-scenarios/${scenarioId}/lines/${lineId}/no-award`);
      return data.scenario;
    },
    async removeAwardLineAllocation(scenarioId, lineId, supplierId) {
      const data = await del<{ scenario: AwardScenario }>(`/api/buyer/award-scenarios/${scenarioId}/lines/${lineId}/allocations/${supplierId}`);
      return data.scenario;
    },
    async finalizeAwardScenario(scenarioId) {
      const data = await post<{ scenario: AwardScenario }>(`/api/buyer/award-scenarios/${scenarioId}/finalize`);
      return data.scenario;
    },
    async listAuditEvents(eventId) {
      const data = await get<{ events: AuditEvent[] }>(`/api/buyer/audit?eventId=${encodeURIComponent(eventId)}`);
      return data.events;
    },
    async exportAuditCsv(eventId) {
      const res = await fetch(`${baseUrl}/api/buyer/audit/export.csv?eventId=${encodeURIComponent(eventId)}`, { headers: await headers() });
      if (!res.ok) throw new Error(`API error ${res.status}: audit export`);
      return res.blob();
    },
    async exportTenantData() {
      const res = await fetch(`${baseUrl}/api/buyer/data/export`, { headers: await headers() });
      if (!res.ok) throw new Error(`API error ${res.status}: data export`);
      return res.blob();
    },
    async deleteTenantData(confirm) {
      const data = await post<{ deleted: Record<string, number> }>('/api/buyer/data/delete', { confirm });
      return data.deleted;
    },
    async listEventAttachments(eventId) {
      const data = await get<{ attachments: Attachment[] }>(`/api/buyer/events/${eventId}/attachments`);
      return data.attachments;
    },
    async initiateEventAttachmentUpload(eventId, filename, mimeType, sizeBytes) {
      return post<PresignedUploadResponse>(`/api/buyer/events/${eventId}/attachments`, { filename, mimeType, sizeBytes });
    },
    async uploadAttachmentBytes(uploadUrl, file) {
      // Presigned/dev-storage upload target — never our own Authorization
      // header; that's not this endpoint's auth scheme (S3-style presigned
      // URLs reject unexpected headers, and the dev-storage fallback needs
      // none at all).
      const res = await fetch(uploadUrl, { method: 'PUT', headers: { 'Content-Type': file.type }, body: file });
      if (!res.ok) throw new Error(`Upload failed (${res.status})`);
    },
    async confirmAttachmentUpload(attachmentId) {
      const data = await post<{ attachment: Attachment }>(`/api/buyer/attachments/${attachmentId}/confirm`);
      return data.attachment;
    },
    async deleteAttachment(attachmentId) {
      const res = await fetch(`${baseUrl}/api/buyer/attachments/${attachmentId}`, { method: 'DELETE', headers: await headers() });
      if (!res.ok) throw new Error(`API error ${res.status}: delete attachment`);
    },
    async downloadAttachment(attachmentId, filename) {
      const res = await fetch(`${baseUrl}/api/buyer/attachments/${attachmentId}/download`, { headers: await headers() });
      if (!res.ok) throw new Error(`API error ${res.status}: download attachment`);
      triggerBlobDownload(await res.blob(), filename);
    },
    async listQuoteAttachments(invitationId) {
      const data = await get<{ attachments: Attachment[] }>(`/api/buyer/invitations/${invitationId}/quote-attachments`);
      return data.attachments;
    },
    async downloadQuoteTemplate(invitationId, rfqReference, eventLines) {
      const qs = new URLSearchParams({ rfqReference, eventLines: JSON.stringify(eventLines) });
      const res = await fetch(`${baseUrl}/api/buyer/invitations/${invitationId}/quote-template?${qs}`, { headers: await headers() });
      if (!res.ok) throw new Error(`API error ${res.status}: quote template`);
      triggerBlobDownload(await res.blob(), `${rfqReference}-quote-template.csv`);
    },
  };
}

function triggerBlobDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
