// Filtros de fecha (?desde=YYYY-MM-DD&hasta=YYYY-MM-DD) interpretados en hora de Argentina (UTC-3, sin horario de verano).
const DAY = /^\d{4}-\d{2}-\d{2}$/;

function valid(d: Date) {
  return !Number.isNaN(d.getTime());
}

export function parseDateRange(sp: { desde?: string | string[]; hasta?: string | string[] }) {
  const desde = typeof sp.desde === "string" && DAY.test(sp.desde) ? sp.desde : "";
  const hasta = typeof sp.hasta === "string" && DAY.test(sp.hasta) ? sp.hasta : "";
  const fromD = desde ? new Date(`${desde}T00:00:00.000-03:00`) : undefined;
  const toD = hasta ? new Date(`${hasta}T23:59:59.999-03:00`) : undefined;
  const from = fromD && valid(fromD) ? fromD : undefined;
  const to = toD && valid(toD) ? toD : undefined;
  return { desde: from ? desde : "", hasta: to ? hasta : "", from, to, invalid: Boolean(from && to && from > to) };
}

/** Fecha de hoy (YYYY-MM-DD) en Argentina. */
export function todayAR() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires" }).format(new Date());
}
