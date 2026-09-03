export type ChipTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

const DOT: Record<ChipTone, string> = {
  neutral: '●', info: '●', success: '●', warning: '●', danger: '●',
};

// One status-chip look for the whole app (RFQs, invitations, quotes,
// awards, suppliers) — a single semantic tone mapping instead of a new
// color for every screen's own idea of "status".
export function StatusChip({ label, tone }: { label: string; tone: ChipTone }) {
  return (
    <span className={`status-chip status-chip-${tone}`}>
      <span className="status-chip-dot" aria-hidden="true">{DOT[tone]}</span>
      {label}
    </span>
  );
}
