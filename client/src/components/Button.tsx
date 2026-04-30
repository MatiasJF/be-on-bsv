import type { ButtonHTMLAttributes, ReactNode } from "react";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost";
  children: ReactNode;
}

const variants: Record<NonNullable<ButtonProps["variant"]>, string> = {
  primary:
    "bg-bsva-blue text-white hover:bg-bsva-navy hover:translate-y-[-1px] focus-visible:ring-2 focus-visible:ring-bsva-blue",
  secondary:
    "bg-bsva-grey text-bsva-navy border border-bsva-ice hover:bg-bsva-ice",
  ghost:
    "text-bsva-soft/70 hover:text-bsva-navy hover:bg-bsva-grey/50",
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
