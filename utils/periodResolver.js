// ── Period Resolver ────────────────────────────────────────────────────────────
// Converts any QuerySchema period descriptor into { startDate, endDate, label }.
// Pure JS — no I/O, no AI calls. Called after queryParser extracts the period intent.

const now = () => new Date();

const startOfDay = (d) => {
  const r = new Date(d);
  r.setHours(0, 0, 0, 0);
  return r;
};
const endOfDay = (d) => {
  const r = new Date(d);
  r.setHours(23, 59, 59, 999);
  return r;
};

// ── Named period helpers ───────────────────────────────────────────────────────

const thisMonth = () => {
  const d = now();
  return {
    startDate: new Date(d.getFullYear(), d.getMonth(), 1),
    endDate:   new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999),
    label:     d.toLocaleString("en-GB", { month: "long", year: "numeric" }),
  };
};

const lastMonth = () => {
  const d = now();
  const start = new Date(d.getFullYear(), d.getMonth() - 1, 1);
  const end   = new Date(d.getFullYear(), d.getMonth(), 0, 23, 59, 59, 999);
  return { startDate: start, endDate: end, label: start.toLocaleString("en-GB", { month: "long", year: "numeric" }) };
};

const thisYear = () => {
  const y = now().getFullYear();
  return { startDate: new Date(y, 0, 1), endDate: endOfDay(now()), label: String(y) };
};

const lastYear = () => {
  const y = now().getFullYear() - 1;
  return { startDate: new Date(y, 0, 1), endDate: new Date(y, 11, 31, 23, 59, 59, 999), label: String(y) };
};

const thisWeek = () => {
  const d   = now();
  const day = d.getDay(); // 0=Sun
  const mon = new Date(d);
  mon.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
  return { startDate: startOfDay(mon), endDate: endOfDay(d), label: "This week" };
};

const lastWeek = () => {
  const d   = now();
  const day = d.getDay();
  const thisMon = new Date(d);
  thisMon.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
  const lastMon = new Date(thisMon);
  lastMon.setDate(thisMon.getDate() - 7);
  const lastSun = new Date(thisMon);
  lastSun.setDate(thisMon.getDate() - 1);
  return { startDate: startOfDay(lastMon), endDate: endOfDay(lastSun), label: "Last week" };
};

// ── Main resolver ──────────────────────────────────────────────────────────────

export const resolvePeriod = (period) => {
  if (!period || !period.type) return thisMonth();

  switch (period.type) {
    case "all_time":
      return { startDate: new Date("2000-01-01T00:00:00Z"), endDate: now(), label: "All time" };

    case "today": {
      const d = now();
      return { startDate: startOfDay(d), endDate: endOfDay(d), label: "Today" };
    }

    case "yesterday": {
      const d = new Date(now());
      d.setDate(d.getDate() - 1);
      return { startDate: startOfDay(d), endDate: endOfDay(d), label: "Yesterday" };
    }

    case "this_week":  return thisWeek();
    case "last_week":  return lastWeek();
    case "this_month": return thisMonth();
    case "last_month": return lastMonth();
    case "this_year":  return thisYear();
    case "last_year":  return lastYear();

    case "rolling_days": {
      const days  = period.days ?? 30;
      const start = new Date(now());
      start.setDate(start.getDate() - days);
      return { startDate: startOfDay(start), endDate: endOfDay(now()), label: `Past ${days} days` };
    }

    case "rolling_months": {
      const months = period.months ?? 3;
      const start  = new Date(now());
      start.setMonth(start.getMonth() - months);
      start.setDate(1);
      return { startDate: startOfDay(start), endDate: endOfDay(now()), label: `Past ${months} months` };
    }

    case "specific_month": {
      const y     = period.year  ?? now().getFullYear();
      const m     = period.month ?? (now().getMonth() + 1);
      const start = new Date(y, m - 1, 1);
      const end   = new Date(y, m, 0, 23, 59, 59, 999);
      return { startDate: start, endDate: end, label: start.toLocaleString("en-GB", { month: "long", year: "numeric" }) };
    }

    case "specific_year": {
      const y = period.year ?? now().getFullYear();
      return {
        startDate: new Date(y, 0, 1),
        endDate:   new Date(y, 11, 31, 23, 59, 59, 999),
        label:     String(y),
      };
    }

    case "quarter": {
      const y          = period.year    ?? now().getFullYear();
      const q          = period.quarter ?? 1;
      const startMonth = (q - 1) * 3;
      return {
        startDate: new Date(y, startMonth, 1),
        endDate:   new Date(y, startMonth + 3, 0, 23, 59, 59, 999),
        label:     `Q${q} ${y}`,
      };
    }

    case "date_range":
      if (period.startDate && period.endDate) {
        return {
          startDate: startOfDay(new Date(period.startDate)),
          endDate:   endOfDay(new Date(period.endDate)),
          label:     `${period.startDate} to ${period.endDate}`,
        };
      }
      return thisMonth();

    // "comparison" type has no single period — caller uses resolveComparisonPeriods instead
    case "comparison":
      return thisMonth(); // fallback for any code that calls resolvePeriod on a comparison schema

    default:
      return thisMonth();
  }
};

// Resolve both sides of a comparison period.
// Returns { period1, period2 } each with { startDate, endDate, label }.
export const resolveComparisonPeriods = (period) => {
  if (period?.comparison?.period1 && period?.comparison?.period2) {
    return {
      period1: resolvePeriod(period.comparison.period1),
      period2: resolvePeriod(period.comparison.period2),
    };
  }
  // Default: this month vs last month
  return { period1: thisMonth(), period2: lastMonth() };
};
