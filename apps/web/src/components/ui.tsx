import type { ReactNode } from "react";
import { X } from "lucide-react";

export function Panel({
  children,
  className = "",
  glow = false
}: {
  children: ReactNode;
  className?: string;
  glow?: boolean;
}) {
  return (
    <section
      className={`min-w-0 rounded-lg border border-system-border bg-system-card/88 p-4 ${glow ? "shadow-glow" : ""} ${className}`}
    >
      {children}
    </section>
  );
}

export function ProgressBar({
  value,
  max,
  color = "purple"
}: {
  value: number;
  max: number;
  color?: "purple" | "cyan" | "success" | "warning" | "danger";
}) {
  const width = Math.min(100, Math.max(0, (value / Math.max(max, 1)) * 100));
  const colorClass =
    color === "cyan"
      ? "from-system-cyan to-sky-300"
      : color === "success"
        ? "from-system-success to-emerald-300"
        : color === "warning"
          ? "from-system-warning to-amber-300"
          : color === "danger"
            ? "from-system-danger to-red-300"
            : "from-system-purple to-system-cyan";

  return (
    <div className="h-2.5 overflow-hidden rounded bg-black/40 ring-1 ring-white/5">
      <div
        className={`h-full rounded bg-gradient-to-r ${colorClass} shadow-cyan transition-all duration-500`}
        style={{ width: `${width}%` }}
      />
    </div>
  );
}

export function Metric({
  label,
  value,
  accent = "text-system-cyan"
}: {
  label: string;
  value: string;
  accent?: string;
}) {
  return (
    <div className="rounded-md border border-system-border bg-black/18 px-3 py-2">
      <p className="text-[11px] uppercase tracking-normal text-system-muted">{label}</p>
      <p className={`mt-1 break-words text-xs font-semibold sm:text-sm ${accent}`}>{value}</p>
    </div>
  );
}

export function PrimaryButton({
  children,
  onClick,
  disabled = false,
  variant = "primary"
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  variant?: "primary" | "ghost" | "danger";
}) {
  const className =
    variant === "ghost"
      ? "border-system-border bg-white/5 text-system-text"
      : variant === "danger"
        ? "border-system-danger/50 bg-system-danger/15 text-red-100"
        : "border-system-purple/70 bg-system-purple/80 text-white shadow-glow";

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`min-h-11 min-w-0 rounded-lg border px-3 py-2 text-center text-xs font-semibold leading-tight transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45 sm:text-sm ${className}`}
      type="button"
    >
      {children}
    </button>
  );
}

export function Modal({
  title,
  children,
  onClose
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm">
      <div className="level-up w-full max-w-sm rounded-lg border border-system-cyan/50 bg-system-card p-5 shadow-cyan">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-mono text-lg font-black uppercase text-system-text">{title}</h2>
          <button
            className="grid size-9 place-items-center rounded-md border border-system-border bg-white/5 text-system-muted"
            onClick={onClose}
            type="button"
            aria-label="Закрыть окно"
          >
            <X size={18} />
          </button>
        </div>
        <div className="mt-4 text-sm text-system-muted">{children}</div>
      </div>
    </div>
  );
}
