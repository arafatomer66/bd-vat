import { Decimal } from "decimal.js";

/**
 * All VAT money math runs through Decimal to avoid binary float drift. NBR figures
 * are reported in BDT; we keep 2-decimal precision and round half-up, which matches
 * conventional Mushak rounding.
 */
Decimal.set({ rounding: Decimal.ROUND_HALF_UP });

export type Money = Decimal.Value;

export function d(value: Money): Decimal {
  return new Decimal(value);
}

/** Round to 2 decimal places (poisha) and return a string for stable storage/transport. */
export function toBdt(value: Money): string {
  return new Decimal(value).toDecimalPlaces(2).toFixed(2);
}

export function sum(values: Money[]): Decimal {
  return values.reduce<Decimal>((acc, v) => acc.plus(v), new Decimal(0));
}
