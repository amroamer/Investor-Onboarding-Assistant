interface BrandProps {
  className?: string;
}

export function MgxLogo({ className = "h-5 w-auto" }: BrandProps) {
  return (
    <svg
      viewBox="0 0 64 20"
      className={className}
      role="img"
      aria-label="MGX"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
    >
      <text
        x="0"
        y="16"
        fontFamily='Inter, system-ui, sans-serif'
        fontWeight="700"
        fontSize="20"
        letterSpacing="-0.8"
      >
        MGX
      </text>
    </svg>
  );
}

export function MgxMark({ className = "size-7" }: BrandProps) {
  return (
    <div
      className={`grid place-items-center rounded-sm bg-primary text-primary-foreground ${className}`}
    >
      <span className="text-[10px] font-bold leading-none tracking-tight">MGX</span>
    </div>
  );
}
