export function parseStatusTags(value) {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  try {
    const parsed = JSON.parse(value || "[]");
    if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean);
  } catch {
    // Non-JSON status tags are accepted as comma-separated legacy input below.
  }
  return String(value || "")
    .split(",")
    .map((item) => item.trim().replace(/^['"]|['"]$/g, ""))
    .filter(Boolean);
}

export const stringifyStatusTags = (tags) => JSON.stringify(tags);
