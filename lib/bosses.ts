/**
 * Vaste lijst van bosses die getoond worden op de highscores pagina
 * (bv. als tabs/dropdown). De API zelf is niet beperkt tot deze lijst
 * (zodat de plugin later ook nieuwe bosses kan insturen zonder dat je
 * eerst hier de code hoeft aan te passen), maar voor de UI en testdata
 * gebruiken we deze lijst als basis.
 */
export const BOSSES = [
  "Alchemical Hydra",
  "Amoxliatl",
  "Araxxor",
  "Brutus",
  "Corrupted Gauntlet",
  "Doom of Mokhaïotl",
  "Duke Sucellus",
  "Sol Heredit",
  "The Gauntlet",
  "Grotesque Guardians",
  "Hespori",
  "TzKal-Zuk",
  "The Leviathan",
  "Phosanis Nightmare",
  "Phantom Muspah",
  "Royal Titans",
  "Vardorvis",
  "Vorkath",
  "The Whisperer",
  "Yama",
  "Zulrah",
  "TzTok-Jad",
  "Chambers of Xeric",
  "Chambers of Xeric Challenge Mode",
  "Theatre of Blood",
  "Theatre of Blood Hard Mode",
  "Tombs of Amascut",
  "Tombs of Amascut Expert",
] as const;

export type Boss = (typeof BOSSES)[number];
