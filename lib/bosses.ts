/**
 * Vaste lijst van bosses die getoond worden op de highscores pagina
 * (bv. als tabs/dropdown). De API zelf is niet beperkt tot deze lijst
 * (zodat de plugin later ook nieuwe bosses kan insturen zonder dat je
 * eerst hier de code hoeft aan te passen), maar voor de UI en testdata
 * gebruiken we deze lijst als basis.
 */
export const BOSSES = [
  "Vorkath",
  "Zulrah",
  "Chambers of Xeric",
  "Theatre of Blood",
  "Tombs of Amascut",
  "Corrupted Gauntlet",
  "Nex",
  "Araxxor",
] as const;

export type Boss = (typeof BOSSES)[number];
