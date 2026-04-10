import logoWhite from "../assets/brand/logo-white-linear.svg";
import logoBlue from "../assets/brand/logo-blue-linear.svg";

interface LogoProps {
  variant?: "white" | "blue";
  className?: string;
}

/**
 * BSVA primary logo. White-on-dark by default — switch to "blue" only on
 * light surfaces (per BSVA Style Guide §04.1).
 */
export function Logo({ variant = "white", className = "h-8 w-auto" }: LogoProps) {
  const src = variant === "blue" ? logoBlue : logoWhite;
  return <img src={src} alt="BSV Association" className={className} draggable={false} />;
}
