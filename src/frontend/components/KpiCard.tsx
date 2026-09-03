import { Icon } from './Icon';

type IconName = Parameters<typeof Icon>[0]['name'];
export type KpiTone = 'neutral' | 'info' | 'warning' | 'success';

// The KPI row used at the top of Sourcing Events and Suppliers — a small
// icon plus an accent border instead of a plain white number-in-a-box,
// so metrics carry semantic weight instead of being pure decoration.
export function KpiCard({ icon, label, value, tone }: { icon: IconName; label: string; value: number; tone: KpiTone }) {
  return (
    <div className={`kpi-card kpi-card-${tone}`}>
      <span className="kpi-card-icon"><Icon name={icon} size={18} /></span>
      <div className="kpi-card-body">
        <strong className="num">{value}</strong>
        <span>{label}</span>
      </div>
    </div>
  );
}
