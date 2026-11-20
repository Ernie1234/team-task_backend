/** Time-zone helpers built on Intl (no extra dependency) */

export const isValidTimeZone = (tz: string) => {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
};

/** Offset of `tz` from UTC at `date`, in ms */
const offsetAt = (date: Date, tz: string) => {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
      .formatToParts(date)
      .map((p) => [p.type, p.value])
  );
  const asUtc = Date.UTC(+parts.year!, +parts.month! - 1, +parts.day!, +parts.hour!, +parts.minute!, +parts.second!);
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
};

/** Midnight of a calendar date ("2026-11-20") in `tz`, as an instant */
export const zonedMidnight = (date: string, tz: string): Date => {
  const [y, m, d] = date.split("-").map(Number);
  const guess = Date.UTC(y!, m! - 1, d!);
  let utc = guess - offsetAt(new Date(guess), tz);
  // Second pass handles days where the offset changes (DST)
  utc = guess - offsetAt(new Date(utc), tz);
  return new Date(utc);
};

/** The calendar date ("2026-11-20") of an instant in `tz` */
export const dateInZone = (instant: Date, tz: string): string =>
  new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(instant);
