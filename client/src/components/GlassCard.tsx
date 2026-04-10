import type { HTMLAttributes, ReactNode } from "react";

interface GlassCardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  strong?: boolean;
}

export function GlassCard({ children, strong, className = "", ...rest }: GlassCardProps) {
  return (
    <div
      className={`${strong ? "glass-strong" : "glass"} rounded-2xl ${className}`}
      {...rest}
    >
      {children}
    </div>
  );
}
