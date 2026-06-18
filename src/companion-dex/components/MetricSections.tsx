import { useRef, useState, type ReactNode } from "react";
import { TrendingDown, TrendingUp } from "lucide-react";
import { CountNum } from "./CountNum";

interface LabelProps {
  icon: ReactNode;
  children: ReactNode;
}

export function Label({ icon, children }: LabelProps) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
      <span style={{ color: "var(--primary)", display: "inline-flex", transition: "color .5s" }}>{icon}</span>
      <h3 style={{ margin: 0, fontSize: 12, fontWeight: 700, letterSpacing: ".14em", textTransform: "uppercase", color: "var(--ink-2)" }}>{children}</h3>
    </div>
  );
}

interface BlockProps {
  icon: ReactNode;
  title: string;
  children: ReactNode;
}

export function Block({ icon, title, children }: BlockProps) {
  return (
    <section style={{ marginTop: 38, paddingTop: 38, borderTop: "1px solid var(--hair)" }}>
      <Label icon={icon}>{title}</Label>
      {children}
    </section>
  );
}

interface SectionSpinnerProps {
  label: string;
}

export function SectionSpinner({ label }: SectionSpinnerProps) {
  return (
    <div className="cd-section-loading" role="status" aria-live="polite">
      <span className="cd-section-spinner" aria-hidden />
      <span>{label}</span>
    </div>
  );
}

interface BarProps {
  label: string;
  value: number;
}

export function Bar({ label, value }: BarProps) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 6 }}>
        <span style={{ fontWeight: 600, letterSpacing: ".04em", color: "var(--ink-2)" }}>{label}</span>
        <span style={{ fontFamily: "var(--mono)", color: "var(--deep)", fontWeight: 600, transition: "color .5s" }}>
          <CountNum value={value} />
        </span>
      </div>
      <div style={{ height: 9, borderRadius: 99, background: "var(--track)", overflow: "hidden" }}>
        <div
          style={{
            height: "100%",
            width: `${value}%`,
            borderRadius: 99,
            background: "var(--primary)",
            transition: "width .7s cubic-bezier(.2,.8,.2,1), background-color .5s",
          }}
        />
      </div>
    </div>
  );
}

interface SparklineProps {
  data: number[];
}

export function Sparkline({ data }: SparklineProps) {
  const w = 116;
  const h = 30;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const y = (v: number) => h - ((v - min) / (max - min || 1)) * (h - 6) - 3;
  const pts = data.map((v, i) => `${((i / (data.length - 1)) * w).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const delta = data[data.length - 1] - data[0];
  const up = delta >= 0;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <svg width={w} height={h}>
        <polyline points={pts} fill="none" stroke="var(--primary)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx={w} cy={y(data[data.length - 1])} r="3.5" fill="var(--primary)" />
      </svg>
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 3,
          fontSize: 12,
          fontWeight: 700,
          color: up ? "var(--deep)" : "var(--muted)",
          fontFamily: "var(--mono)",
        }}
      >
        {up ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
        {up ? "+" : ""}
        {delta}
      </span>
    </div>
  );
}

interface VitalProps {
  icon: ReactNode;
  label: string;
  value: number;
  onTap?: () => void;
}

export function Vital({ icon, label, value, onTap }: VitalProps) {
  const r = 22;
  const circ = 2 * Math.PI * r;
  const progress = Math.max(0, Math.min(value, 100));
  const [bursts, setBursts] = useState<number[]>([]);
  const nextBurst = useRef(0);

  const handleTap = () => {
    onTap?.();

    const id = nextBurst.current;
    nextBurst.current += 1;
    setBursts((current) => [...current, id]);
    window.setTimeout(() => {
      setBursts((current) => current.filter((burst) => burst !== id));
    }, 700);
  };

  const content = (
    <>
      <div className="cd-vital-ring" style={{ position: "relative", width: 58, height: 58, margin: "0 auto 8px" }}>
        <svg width="58" height="58" style={{ transform: "rotate(-90deg)" }} aria-hidden>
          <circle cx="29" cy="29" r={r} fill="none" stroke="var(--track)" strokeWidth="6" />
          <circle
            cx="29"
            cy="29"
            r={r}
            fill="none"
            stroke="var(--primary)"
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={circ}
            strokeDashoffset={circ * (1 - progress / 100)}
            style={{ transition: "stroke-dashoffset .8s cubic-bezier(.2,.8,.2,1), stroke .5s" }}
          />
        </svg>
        <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", color: "var(--deep)", transition: "color .5s" }}>{icon}</div>
        {bursts.map((burst) => (
          <span key={burst} className="cd-vital-burst" aria-hidden>
            {icon}
          </span>
        ))}
      </div>
      <div style={{ fontSize: 11, color: "var(--ink-2)", fontWeight: 600 }}>{label}</div>
      <div style={{ marginTop: 3, fontFamily: "var(--mono)", fontSize: 12, color: "var(--deep)", fontWeight: 700, transition: "color .5s" }}>
        <CountNum value={value} />
      </div>
    </>
  );

  if (onTap) {
    return (
      <button type="button" className="cd-vital-button" onClick={handleTap} aria-label={`${label}: ${value}`}>
        {content}
      </button>
    );
  }

  return (
    <div style={{ flex: 1, textAlign: "center" }}>
      {content}
    </div>
  );
}

interface HeatmapProps {
  hours: number[];
  peak: string;
}

export function Heatmap({ hours, peak }: HeatmapProps) {
  const max = Math.max(...hours, 1);

  return (
    <div>
      <div style={{ display: "flex", gap: 2, alignItems: "flex-end", height: 48 }}>
        {hours.map((v, i) => (
          <div
            key={i}
            title={`${i}:00`}
            style={{
              flex: 1,
              height: `${Math.max(8, (v / max) * 100)}%`,
              borderRadius: 3,
              background: "var(--primary)",
              opacity: 0.3 + (v / max) * 0.7,
              transition: "height .6s cubic-bezier(.2,.8,.2,1), background-color .5s, opacity .6s",
            }}
          />
        ))}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontFamily: "var(--mono)", fontSize: 10, color: "var(--ink-2)", marginTop: 6 }}>
        <span>12a</span>
        <span>6a</span>
        <span>12p</span>
        <span>6p</span>
        <span>11p</span>
      </div>
      <p style={{ margin: "12px 0 0", fontSize: 14, color: "var(--ink-1)" }}>
        Usually finds you in the <strong style={{ color: "var(--deep)", transition: "color .5s" }}>{peak}</strong>.
      </p>
    </div>
  );
}
