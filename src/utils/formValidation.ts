export const isValidDate = (value: string): boolean => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
};

export const isValidTime = (value: string): boolean => /^([01]\d|2[0-3]):[0-5]\d$/.test(value);

export const focusFirstError = (errors: Record<string, string>) => {
  const id = Object.keys(errors)[0];
  if (id) requestAnimationFrame(() => document.getElementById(id)?.focus());
};
