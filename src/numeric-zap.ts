export const ZAP_DELAY_MS = 1000;
export interface NumericZap { digits: string; deadline: number }

/** После паузы новый ввод начинает отдельный номер. */
export function appendZapDigit(state: NumericZap | null, digit: string, now: number): NumericZap | null {
  if (!/^[0-9]$/.test(digit)) return state;
  return { digits: (state && now < state.deadline ? state.digits : "") + digit, deadline: now + ZAP_DELAY_MS };
}

/** Номера начинаются с 1; индекс относится к текущему отфильтрованному списку. */
export function zapChannelIndex(digits: string, count: number): number | null {
  if (!/^[0-9]+$/.test(digits)) return null;
  const number = Number(digits);
  return Number.isSafeInteger(number) && number >= 1 && number <= count ? number - 1 : null;
}
