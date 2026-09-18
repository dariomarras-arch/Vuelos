import clsx from "clsx";
import { ReactNode } from "react";

export function MetricCard({
  label,
  value,
  hint,
  accent,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  accent?: "up" | "down" | "neutral";
}) {
  return (
    <div className="card card-pad">
      <div className="text-xs font-medium uppercase tracking-wide text-base-400">{label}</div>
      <div className="mt-1.5 text-2xl font-semibold text-base-50">{value}</div>
      {hint ? (
        <div
          className={clsx(
            "mt-1 text-xs",
            accent === "up" && "text-emerald-400",
            accent === "down" && "text-red-400",
            (!accent || accent === "neutral") && "text-base-400",
          )}
        >
          {hint}
        </div>
      ) : null}
    </div>
  );
}
