/** Month cells (Monday first) in a timezone-independent calendar. */
export function productionMonthCells(year: number, month: number): Array<string | null> {
  if (!Number.isInteger(year) || year < 1900 || year > 2100 || !Number.isInteger(month) || month < 1 || month > 12) {
    throw new Error("Mes o año de Producción inválido");
  }
  const firstWeekday = (new Date(Date.UTC(year, month - 1, 1)).getUTCDay() + 6) % 7;
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const count = Math.ceil((firstWeekday + days) / 7) * 7;
  return Array.from({ length: count }, (_, index) => {
    const day = index - firstWeekday + 1;
    return day < 1 || day > days ? null
      : `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  });
}
