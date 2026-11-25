export function firstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] ?? fullName;
}

/** The text staff send (or copy) to the patient. Short, Taglish, with the private link. */
export function offerMessage(args: {
  fullName: string;
  clinicName: string;
  doctorName: string;
  slotLabel: string;
  link: string;
}): string {
  return `Hi ${firstName(args.fullName)} po! May nabakante pong oras sa ${args.clinicName}: ${args.slotLabel} kay ${args.doctorName}. Gusto n'yo po ba? Pindutin lang ito para kunin: ${args.link} (Sasagot po ang link na ito sa loob ng ilang oras.)`;
}
