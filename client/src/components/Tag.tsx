interface TagProps {
  label: string;
  onClick?: () => void;
}

export function Tag({ label, onClick }: TagProps) {
  const Element = onClick ? "button" : "span";
  return (
    <Element
      onClick={onClick}
      className="inline-flex items-center px-3 py-1 rounded-full text-xs font-body bg-bsva-cyan/10 text-bsva-cyan border border-bsva-cyan/20 hover:bg-bsva-cyan/20 transition-colors"
    >
      {label}
    </Element>
  );
}
