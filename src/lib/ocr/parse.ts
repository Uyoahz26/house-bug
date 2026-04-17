export type ParsedShelfLifeUnit = "day" | "month" | "year";

export interface ParsedOcrData {
  productionDate: string | null;
  shelfLife: number | null;
  unit: ParsedShelfLifeUnit | null;
}

const DATE_WITH_HINT_REGEX =
  /(生产日期|生产|制造日期|mfg|mfd)[^\d]{0,8}(\d{4}[.\-/年]\d{1,2}[.\-/月]\d{1,2}日?)/i;
const DATE_FALLBACK_REGEX = /(\d{4}[.\-/年]\d{1,2}[.\-/月]\d{1,2}日?)/;

const SHELF_LIFE_WITH_HINT_REGEX =
  /(保质期|有效期|质保期)[^\d]{0,8}(\d{1,4})\s*(天|日|周|星期|个月|月|年|days?|months?|years?)/i;
const SHELF_LIFE_FALLBACK_REGEX =
  /(\d{1,4})\s*(天|日|周|星期|个月|月|年|days?|months?|years?)/i;

function pad(num: number): string {
  return String(num).padStart(2, "0");
}

function toIsoDate(candidate: string): string | null {
  const matched = candidate.match(/(\d{4})[.\-/年](\d{1,2})[.\-/月](\d{1,2})/);
  if (!matched) {
    return null;
  }

  const year = Number(matched[1]);
  const month = Number(matched[2]);
  const day = Number(matched[3]);

  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day) ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31
  ) {
    return null;
  }

  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return `${year}-${pad(month)}-${pad(day)}`;
}

function normalizeUnit(rawUnit: string): ParsedShelfLifeUnit | null {
  const unit = rawUnit.trim().toLowerCase();
  if (unit === "天" || unit === "日" || unit === "day" || unit === "days") {
    return "day";
  }

  if (
    unit === "月" ||
    unit === "个月" ||
    unit === "month" ||
    unit === "months"
  ) {
    return "month";
  }

  if (unit === "年" || unit === "year" || unit === "years") {
    return "year";
  }

  if (unit === "周" || unit === "星期") {
    return "day";
  }

  return null;
}

function normalizeShelfLife(
  valueText: string,
  unitText: string,
): {
  shelfLife: number | null;
  unit: ParsedShelfLifeUnit | null;
} {
  const value = Number(valueText);
  if (!Number.isFinite(value) || value <= 0) {
    return { shelfLife: null, unit: null };
  }

  const normalizedUnit = normalizeUnit(unitText);
  if (!normalizedUnit) {
    return { shelfLife: null, unit: null };
  }

  const floored = Math.floor(value);
  if (unitText.trim() === "周" || unitText.trim() === "星期") {
    return { shelfLife: floored * 7, unit: "day" };
  }

  return { shelfLife: floored, unit: normalizedUnit };
}

export function parseOCRText(text: string): ParsedOcrData {
  const source = text.trim();
  if (!source) {
    return {
      productionDate: null,
      shelfLife: null,
      unit: null,
    };
  }

  const hintedDate = source.match(DATE_WITH_HINT_REGEX);
  const fallbackDate = source.match(DATE_FALLBACK_REGEX);

  const productionDate = toIsoDate(hintedDate?.[2] ?? fallbackDate?.[1] ?? "");

  const hintedShelfLife = source.match(SHELF_LIFE_WITH_HINT_REGEX);
  const fallbackShelfLife = source.match(SHELF_LIFE_FALLBACK_REGEX);

  const shelfLifeMatched = hintedShelfLife ?? fallbackShelfLife;
  const normalizedShelfLife = shelfLifeMatched
    ? normalizeShelfLife(shelfLifeMatched[2], shelfLifeMatched[3])
    : { shelfLife: null, unit: null };

  return {
    productionDate,
    shelfLife: normalizedShelfLife.shelfLife,
    unit: normalizedShelfLife.unit,
  };
}
