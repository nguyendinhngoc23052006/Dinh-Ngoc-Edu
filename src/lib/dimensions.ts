// A theme isn't just a recolor — it's a "dimension" that re-skins the course
// map (the node path) into a themed world. The dimension token lives in the
// theme's `data.dimension`; CSS keys off `[data-dimension="<token>"]`. This maps
// tokens to friendly labels for the Market and Settings UI.

export const DIMENSION_LABELS: Record<string, string> = {
  meadow: 'Meadow',
  volcano: 'Volcano',
  tide: 'Tide',
  twilight: 'Twilight',
  cosmos: 'Cosmos',
}

// The display label for a dimension token, or null if there is none / unknown.
export function dimensionLabel(token: string | undefined): string | null {
  if (!token) return null
  return DIMENSION_LABELS[token] ?? null
}
