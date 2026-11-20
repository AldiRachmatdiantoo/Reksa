type IconProps = {
  /** Nama glyph Material Symbols, mis. "timer". */
  name: string;
  fill?: boolean;
  className?: string;
};

/** Ikon dekoratif. Selalu aria-hidden: makna wajib ada di teks di sebelahnya. */
export function Icon({ name, fill = false, className = '' }: IconProps) {
  return (
    <span aria-hidden="true" data-fill={fill} className={`material-symbols-outlined ${className}`}>
      {name}
    </span>
  );
}
