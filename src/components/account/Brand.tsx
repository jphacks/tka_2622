/** A box opening toward its next destination. Shared with the app icon. */
export function BrandMark() {
  return (
    <svg className="monosaki-mark" viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <path d="M6 12v14h20V12M6 12l10 5 10-5M16 17v9M6 12l10-5 5 2" />
      <path d="M23 4h5v5M28 4l-8 8" />
    </svg>
  );
}

export function Brand({ name = "ものさき。" }: { name?: string }) {
  return <span className="monosaki-brand"><BrandMark /><span>{name}</span></span>;
}
