const JURY_PROMPT_SUGGESTIONS: string[] = [
  "Какое количество уникальных отмененных поездок со стороны пассажира после начала поездки было в разрезе месяца и города в 2026 году?",
  "Какая конверсия составляет в два основных этапа у пассажиров: в принятие заказа и в завершении поездки по всей сети за июнь 2025 года?",
  "Покажи уникальные отмены пассажира после старта поездки по месяцам и городам за 2026 год.",
  "Покажи двухэтапную конверсию пассажиров по всей сети за июнь 2025: принятие заказа и завершение поездки."
];

const EN_TO_RU_LAYOUT: Record<string, string> = {
  q: "й", w: "ц", e: "у", r: "к", t: "е", y: "н", u: "г", i: "ш", o: "щ", p: "з",
  "[": "х", "]": "ъ", a: "ф", s: "ы", d: "в", f: "а", g: "п", h: "р", j: "о", k: "л",
  l: "д", ";": "ж", "'": "э", z: "я", x: "ч", c: "с", v: "м", b: "и", n: "т", m: "ь",
  ",": "б", ".": "ю", "/": ".", "`": "ё"
};

function normalize(value: string): string {
  return value.toLowerCase().replaceAll("ё", "е").trim();
}

function swapKeyboardLayout(value: string): string {
  const low = value.toLowerCase();
  let ruHits = 0;
  let enHits = 0;
  for (const ch of low) {
    if ((ch >= "а" && ch <= "я") || ch === "ё") ruHits += 1;
    if (ch >= "a" && ch <= "z") enHits += 1;
  }
  if (enHits >= ruHits) {
    return low
      .split("")
      .map((ch) => EN_TO_RU_LAYOUT[ch] ?? ch)
      .join("");
  }
  const ruToEn = Object.fromEntries(Object.entries(EN_TO_RU_LAYOUT).map(([k, v]) => [v, k]));
  return low
    .split("")
    .map((ch) => ruToEn[ch] ?? ch)
    .join("");
}

function scoreSuggestion(query: string, suggestion: string): number {
  if (!query) return 1;
  const q = normalize(query);
  const qAlt = normalize(swapKeyboardLayout(query));
  const s = normalize(suggestion);
  if ((!q || q.length < 2) && (!qAlt || qAlt.length < 2)) return 0;
  if ((q && s.startsWith(q)) || (qAlt && s.startsWith(qAlt))) return 100;
  if ((q && s.includes(q)) || (qAlt && s.includes(qAlt))) return 75;

  let score = 0;
  const stems = [q, qAlt]
    .filter(Boolean)
    .flatMap((part) => part.split(/\s+/))
    .map((x) => x.trim())
    .filter((x) => x.length >= 3);
  for (const stem of stems) {
    if (s.includes(stem)) score += 12;
  }
  if (/конвер|конверс|конверис/.test(q) && /конвер/.test(s)) score += 20;
  if (/принят|принет/.test(q) && /принят/.test(s)) score += 16;
  if (/заверш|заверщ/.test(q) && /заверш/.test(s)) score += 16;
  if (/отмен|отменен|отменён/.test(q) && /отмен/.test(s)) score += 16;
  if (/пассаж|пасаж/.test(q) && /пассаж/.test(s)) score += 16;
  if (/сет|сити/.test(q) && /сети/.test(s)) score += 12;
  if (/июн|июнь/.test(q) && /июн/.test(s)) score += 12;
  if (/2026/.test(q) && /2026/.test(s)) score += 10;
  if (/2025/.test(q) && /2025/.test(s)) score += 10;
  return score;
}

export function getPromptSuggestions(input: string, limit = 3): string[] {
  const scored = JURY_PROMPT_SUGGESTIONS.map((item) => ({
    item,
    score: scoreSuggestion(input, item)
  }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(1, limit));
  return scored.map((x) => x.item);
}
