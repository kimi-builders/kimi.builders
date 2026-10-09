/* A filter edit replaces only its own dimension. Clear-all removes the
   filter keys while retaining the caller's search, sort, and mode. */
export function mergeFilterQuery(
  baseQuery: string,
  selected: Record<string, string[]>,
): string {
  const params = new URLSearchParams(baseQuery);
  for (const [key, values] of Object.entries(selected)) {
    if (values.length) params.set(key, values.join(","));
    else params.delete(key);
  }
  return params.toString();
}

export function changeFilterQuery(
  query: string,
  changes: Record<string, string | null>,
): string {
  const params = new URLSearchParams(query);
  for (const [key, value] of Object.entries(changes)) {
    if (value === null) params.delete(key);
    else params.set(key, value);
  }
  return params.toString();
}
