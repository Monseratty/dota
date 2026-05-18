import type { ReactNode } from "react";

interface MetricCardProps {
  danger?: boolean;
  icon?: ReactNode;
  label: string;
  value: ReactNode;
}

export function MetricCard({ danger = false, icon, label, value }: MetricCardProps) {
  return (
    <div className={`metric ${danger ? "danger" : ""}`}>
      <span>{icon}{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

interface TableSkeletonProps {
  columns: number;
  rows?: number;
}

export function TableSkeleton({ columns, rows = 4 }: TableSkeletonProps) {
  return (
    <div className="skeletonTable" aria-label="Loading data">
      {Array.from({ length: rows }, (_, rowIndex) => (
        <div className="skeletonRow" key={rowIndex} style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
          {Array.from({ length: columns }, (_, columnIndex) => (
            <span key={columnIndex} />
          ))}
        </div>
      ))}
    </div>
  );
}
