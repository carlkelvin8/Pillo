/**
 * Deterministic safety net that runs BEFORE any model call. A patient describing an emergency gets
 * immediate guidance and a human handoff, whatever the model might have said.
 */
const PATTERNS: RegExp[] = [
  /chest pain/i,
  /(can'?t|cannot|hard to|difficulty|trouble) (breathe|breathing)/i,
  /(sakit|masakit).{0,12}dibdib/i,
  /(hirap|nahihirapan).{0,12}(huminga|hininga)/i,
  /(unconscious|passed out|not breathing|hindi (na )?humihinga)/i,
  /(nawalan|nawawalan) ng (malay|ulirat)/i,
  /\b(hindi|di)\s+(\w+\s+){0,2}makahinga/i,
  /shortness of breath/i,
  /(severe|heavy|won'?t stop) bleeding/i,
  /bleeding.{0,25}\b(won'?t|will not|doesn'?t|does not|can'?t|cannot|not)\s+(\w+\s+)?stop/i,
  /(dumudugo|pagdurugo).{0,20}(hindi|di) (humihinto|tumitigil)/i,
  /(ayaw|hindi|di)\s+(tumitigil|tumigil|humihinto|huminto).{0,20}(dugo|pagdurugo)/i,
  /(dugo|pagdurugo|dumudugo).{0,25}(ayaw|hindi|di)\s+(tumitigil|tumigil|humihinto|huminto)/i,
  /\b(stroke|seizure|convulsion|kombulsyon)\b/i,
  /\boverdose\b/i,
  /(heart attack|atake sa puso|inatake)/i,
  /(throat|lalamunan).{0,20}(clos|swell|namamaga|sumasara)/i,
  /\banaphyla/i,
  /\b(nasasakal|nabulunan|choking|choked)\b/i,
  /(suicid|kill myself|magpapakamatay|magpakamatay|\bgusto kong mamatay\b)/i,
  /\bgusto ko( na)?( nang)? mamatay\b/i,
  /\b(end my (own )?life|want to die|wanna die|ayoko nang mabuhay|ayaw ko nang mabuhay)\b/i,
  /\bemergency\b/i,
];

export function detectEmergency(text: string): boolean {
  return PATTERNS.some((p) => p.test(text));
}

export const EMERGENCY_REPLY =
  "Kung emergency po ito, tumawag agad sa 911 o pumunta sa pinakamalapit na ospital. If this is an emergency, please call 911 or go to the nearest hospital right now. Ipinaalam ko na rin ito sa staff namin.";
