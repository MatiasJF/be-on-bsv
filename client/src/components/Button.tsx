import type { ButtonHTMLAttributes, ReactNode } from "react";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost";
  children: ReactNode;
}

const variants: Record<NonNullable<ButtonProps["variant"]>, string> = {
  primary:
    "bg-bsva-blue text-white shadow-blue-glow hover:translate-y-[-1px] hover:shadow-cyan-glow focus-visible:ring-2 focus-visible:ring-bsva-cyan",
  secondary:
    "glass text-white hover:bg-white/10",
  ghost:
    "text-white/80 hover:text-white hover:bg-white/5",
};

export function Button({
  variant = "primary",
  className = "",
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 px-6 py-3 rounded-full font-display font-semibold text-sm tracking-wide transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed ${variants[variant]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}
