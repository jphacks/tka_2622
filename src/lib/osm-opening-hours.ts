const WEEKDAYS: Record<string, string> = {
  Mo: "月",
  Tu: "火",
  We: "水",
  Th: "木",
  Fr: "金",
  Sa: "土",
  Su: "日",
};

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

const DAY = "(Mo|Tu|We|Th|Fr|Sa|Su)";
const WEEKDAY_PATTERN = new RegExp(
  `^${DAY}(?:-${DAY})?(?:\\[(\\d(?:,\\d)*)\\])?$`,
);
const DATE_PATTERN = new RegExp(
  `^(${MONTHS.join("|")})\\s+(\\d{1,2})(?:-(\\d{1,2}))?$`,
);
const TIMES_PATTERN =
  /^(.*?)\s*((?:\d{1,2}:\d{2}(?:-\d{1,2}:\d{2}|\+))(?:\s*,\s*\d{1,2}:\d{2}(?:-\d{1,2}:\d{2}|\+))*|off|closed)$/i;

function formatSelectorToken(token: string): string | null {
  if (token === "PH") return "祝日";
  const weekday = WEEKDAY_PATTERN.exec(token);
  if (weekday) {
    const [, from, to, nth] = weekday;
    const days = to
      ? `${WEEKDAYS[from]}〜${WEEKDAYS[to]}`
      : WEEKDAYS[from];
    return nth ? `第${nth.split(",").join("・")}${days}曜` : days;
  }
  const date = DATE_PATTERN.exec(token);
  if (date) {
    const [, month, from, to] = date;
    const monthLabel = `${MONTHS.indexOf(month) + 1}月`;
    return to
      ? `${monthLabel}${Number(from)}日〜${Number(to)}日`
      : `${monthLabel}${Number(from)}日`;
  }
  return null;
}

function formatRule(rule: string): string | null {
  if (rule === "24/7") return "24時間営業";
  const match = TIMES_PATTERN.exec(rule);
  if (!match) return null;
  const [, selector, times] = match;

  const timeLabel = /^(off|closed)$/i.test(times)
    ? "休み"
    : times
        .split(",")
        .map((range) => range.trim().replace("-", "〜").replace(/\+$/, "〜"))
        .join("、");
  if (!selector.trim()) return timeLabel;

  const days = selector
    .split(/,(?![^[]*\])/)
    .map((token) => formatSelectorToken(token.trim()));
  if (days.some((day) => day === null)) return null;
  return `${days.join("・")} ${timeLabel}`;
}

/**
 * Converts an OpenStreetMap opening_hours value into Japanese notation,
 * e.g. "Mo-Su 11:00-20:00" → "月〜日 11:00〜20:00". Returns the raw value
 * unchanged when it uses syntax this formatter does not understand.
 */
export function formatOsmOpeningHours(value: string): string {
  const rules = value
    .split(";")
    .map((rule) => rule.trim())
    .filter(Boolean);
  const formatted = rules.map(formatRule);
  if (rules.length === 0 || formatted.some((rule) => rule === null)) {
    return value;
  }
  return formatted.join("／");
}
