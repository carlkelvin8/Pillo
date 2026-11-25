/** Whole years between a "YYYY-MM-DD" birthdate and a "YYYY-MM-DD" reference day. */
export function ageOn(birthdate: string, today: string): number {
  const [by = 0, bm = 0, bd = 0] = birthdate.split("-").map(Number);
  const [ty = 0, tm = 0, td = 0] = today.split("-").map(Number);
  let age = ty - by;
  if (tm < bm || (tm === bm && td < bd)) age -= 1;
  return age;
}

/** Keep letters, digits, spaces and a few name/phone characters, so the value is safe inside a PostgREST filter. */
export function sanitizeSearch(input: string): string {
  return input
    .replace(/[^\p{L}\p{N} .'+-]/gu, "")
    .trim()
    .slice(0, 60);
}

export function patientIdLabel(patientNumber: number): string {
  return String(patientNumber).padStart(5, "0");
}
