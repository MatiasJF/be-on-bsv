interface TagProps {
  label: string;
  onClick?: () => void;
}

export function Tag({ label, onClick }: TagProps) {
  const Element = onClick ? "button" : "span";
  return (
    <Element
      onClick={onClick}
      className="inline-flex items-center px-3 py-1 rounded-full text-xs font-display font-semibold bg-bsva-cyan text-bsva-navy hover:bg-bsva-ice transition-colors"
    >
      {label}
    </Element>
  );
}
