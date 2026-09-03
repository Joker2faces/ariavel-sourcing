import type { SourcingEventStatus } from '../../shared/types/domain';
import { StatusChip, type ChipTone } from '../components/StatusChip';

export const EVENT_STATUS_LABEL: Record<SourcingEventStatus, string> = {
  DRAFT: 'Draft',
  READY_FOR_INVITATION: 'Ready for Invitation',
  OPEN: 'Open',
  EVALUATING: 'Evaluating',
  AWARDED: 'Awarded',
  CANCELLED: 'Cancelled',
};

const EVENT_STATUS_TONE: Record<SourcingEventStatus, ChipTone> = {
  DRAFT: 'neutral',
  READY_FOR_INVITATION: 'info',
  OPEN: 'info',
  EVALUATING: 'warning',
  AWARDED: 'success',
  CANCELLED: 'neutral',
};

export function EventStatusChip({ status }: { status: SourcingEventStatus }) {
  return <StatusChip label={EVENT_STATUS_LABEL[status]} tone={EVENT_STATUS_TONE[status]} />;
}
