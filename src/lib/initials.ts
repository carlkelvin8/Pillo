/** "Maria Santos" -> "MS", "reyes@clinic.ph" -> "R". */
export function initials(nameOrEmail: string): string {
  const base = nameOrEmail.includes("@") ? (nameOrEmail.split("@")[0] ?? "") : nameOrEmail;
  const parts = base.split(/[\s._-]+/).filter(Boolean);
  const letters = parts.length > 1 ? [parts[0], parts[parts.length - 1]] : [parts[0]];
  return letters
    .map((p) => p?.charAt(0) ?? "")
    .join("")
    .toUpperCase();
}
