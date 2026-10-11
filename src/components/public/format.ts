type AddressLike = {
  street: string;
  streetNumber: string;
  apartment?: string | null;
  city: string;
  province?: string | null;
  postalCode: string;
};

export function formatAddressLine(a: AddressLike) {
  const main = `${a.street} ${a.streetNumber}${a.apartment ? `, ${a.apartment}` : ""}`;
  return `${main} — ${a.city}${a.province ? `, ${a.province}` : ""} (CP ${a.postalCode})`;
}

export function etaLabel(min: number | null | undefined, max: number | null | undefined) {
  if (!min && !max) return null;
  if (min && max && min !== max) return `${min}–${max} min`;
  return `${min ?? max} min`;
}
