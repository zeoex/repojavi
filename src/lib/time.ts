export const AR_TZ = "America/Argentina/Buenos_Aires";

const DAY_NAMES = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

export function dayName(dow: number) {
  return DAY_NAMES[dow] ?? "";
}

/** Día de la semana (0-6) y minutos desde medianoche en hora de Argentina. */
export function argentinaNow(date = new Date()): { dow: number; minutes: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: AR_TZ,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const wd = parts.find((p) => p.type === "weekday")?.value ?? "Sun";
  const h = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
  const m = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  const dow = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(wd);
  return { dow, minutes: h * 60 + m };
}

function toMinutes(hhmm: string) {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

export type HoursRow = { dayOfWeek: number; opensAt: string; closesAt: string };

/** Soporta franjas que cruzan la medianoche (ej. 20:00–02:00). */
export function isOpenAt(hours: HoursRow[], date = new Date()): boolean {
  // Sin horario cargado = el comercio atiende siempre (lo decide el comercio al configurar horarios).
  if (hours.length === 0) return true;
  const { dow, minutes } = argentinaNow(date);
  const prev = (dow + 6) % 7;
  return hours.some((h) => {
    const o = toMinutes(h.opensAt);
    const c = toMinutes(h.closesAt);
    if (o === c) return false;
    if (o < c) return h.dayOfWeek === dow && minutes >= o && minutes < c;
    // cruza medianoche
    return (h.dayOfWeek === dow && minutes >= o) || (h.dayOfWeek === prev && minutes < c);
  });
}

export function formatDateTimeAR(d: Date | string) {
  return new Intl.DateTimeFormat("es-AR", {
    timeZone: AR_TZ,
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(d));
}

export function formatDateAR(d: Date | string) {
  return new Intl.DateTimeFormat("es-AR", { timeZone: AR_TZ, dateStyle: "medium" }).format(new Date(d));
}
