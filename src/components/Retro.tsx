"use client";

import type { ReactNode } from "react";
import { Minus, Square, X } from "lucide-react";

export function WindowFrame({
  title,
  icon,
  children,
  className = "",
  titleExtra,
}: {
  title: string;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
  titleExtra?: ReactNode;
}) {
  return (
    <section className={`win ${className}`}>
      <header className="titlebar">
        <span className="tb-dot" aria-hidden />
        {icon}
        <span className="truncate">{title}</span>
        {titleExtra}
        <span className="tb-btns" aria-hidden>
          <span className="tb-btn"><Minus size={9} strokeWidth={3} /></span>
          <span className="tb-btn"><Square size={8} strokeWidth={3} /></span>
          <span className="tb-btn"><X size={9} strokeWidth={3} /></span>
        </span>
      </header>
      <div className="win-body">{children}</div>
    </section>
  );
}

export function MarqueeLoader() {
  return (
    <div className="marquee-track sunk" aria-hidden>
      <div className="marquee-strip">
        {Array.from({ length: 14 }).map((_, i) => (
          <span key={i} className="marquee-block" />
        ))}
      </div>
    </div>
  );
}

export function GreekBand() {
  return <div className="greek-band" aria-hidden />;
}

export function DitherDivider() {
  return <div className="dither" style={{ height: 4 }} aria-hidden />;
}
