import type { DomainFailure } from './expression.js';
import type { FwError, FwErrorCode, FwErrorParams } from './errors.js';

/**
 * French wording for every error code. This file is the single source of truth
 * for what a player reads when a function is refused.
 *
 * The tone is deliberate: say what is wrong, say where, and say what to try.
 * A refused function is a teaching moment, not a slap — and it costs no turn.
 */

/** Deterministic French number formatting: comma decimal, at most 4 decimals. */
export function fmt(value: number): string {
  if (!Number.isFinite(value)) {
    return value > 0 ? '+∞' : Number.isNaN(value) ? 'indéfini' : '−∞';
  }
  const rounded = Math.round(value * 1e4) / 1e4;
  return String(rounded).replace('.', ',').replace('-', '−');
}

const DOMAIN_FAILURE_FR: Readonly<Record<DomainFailure, string>> = Object.freeze({
  'division-by-zero': 'une division par zéro',
  'log-of-non-positive': 'un logarithme d’un nombre négatif ou nul',
  'sqrt-of-negative': 'une racine carrée d’un nombre négatif',
  'arc-out-of-range': 'un arcsin ou arccos hors de l’intervalle [−1 ; 1]',
  'tangent-pole': 'un pôle de la tangente',
  'power-undefined': 'une puissance non définie (base négative, exposant non entier)',
  'not-finite': 'une valeur infinie',
});

type Formatters = { [C in FwErrorCode]: (p: FwErrorParams[C]) => string };

const FR: Formatters = {
  // — Parsing ————————————————————————————————————————————————
  ERR_EMPTY_INPUT: () => 'Écris une fonction avant de tirer.',
  ERR_INPUT_TOO_LONG: (p) =>
    `Fonction trop longue : ${String(p.length)} caractères pour ${String(p.max)} autorisés.`,
  ERR_SYNTAX: (p) =>
    `Syntaxe incorrecte au caractère ${String(p.position + 1)} : « ${p.found} » n’est pas attendu ici.`,
  ERR_UNKNOWN_IDENTIFIER: (p) =>
    `« ${p.name} » est inconnu (caractère ${String(p.position + 1)}). La seule variable est x ; les seules constantes sont pi et e.`,
  ERR_UNKNOWN_FUNCTION: (p) =>
    p.suggestion === null
      ? `La fonction « ${p.name} » n’existe pas (caractère ${String(p.position + 1)}).`
      : `La fonction « ${p.name} » n’existe pas (caractère ${String(p.position + 1)}). Voulais-tu écrire « ${p.suggestion} » ?`,
  ERR_ARITY: (p) =>
    `« ${p.name} » prend ${String(p.expected)} argument${p.expected > 1 ? 's' : ''}, tu en as donné ${String(p.received)}.`,
  ERR_AST_TOO_DEEP: (p) =>
    `Fonction trop imbriquée : ${String(p.depth)} niveaux pour ${String(p.max)} autorisés.`,
  ERR_AST_TOO_LARGE: (p) =>
    `Fonction trop complexe : ${String(p.nodeCount)} opérations pour ${String(p.max)} autorisées.`,
  ERR_TOO_MANY_BRANCHES: (p) =>
    `Trop de morceaux : ${String(p.count)} pour ${String(p.max)} autorisés.`,

  // — Validation ——————————————————————————————————————————————
  ERR_UNDEFINED_AT_ORIGIN: (p) =>
    `La fonction n’est pas définie à ton point de départ (x = ${fmt(p.x)}) : elle y produit ${DOMAIN_FAILURE_FR[p.failure]}. Décale-la, par exemple en remplaçant x par x + 1.`,
  ERR_DISCONTINUITY: (p) => {
    const left = p.leftLimit === null ? 'aucune limite' : fmt(p.leftLimit);
    const right = p.rightLimit === null ? 'aucune limite' : fmt(p.rightLimit);
    return `La fonction est discontinue en x = ${fmt(p.x)} : elle vaut ${left} en arrivant par la gauche et ${right} par la droite. Seules les fonctions continues peuvent être tirées — raccorde tes morceaux.`;
  },
  ERR_EVAL_BUDGET: (p) =>
    `Calcul trop long : le tracé a dépassé son budget de ${String(p.budget)} évaluations. Simplifie la fonction ou réduis ses oscillations.`,
  ERR_COMPLEXITY_BUDGET: (p) =>
    `Budget de complexité dépassé : ${String(p.nodeCount)} opérations pour ${String(p.budget)} autorisées ce tour.`,

  // — Rules ——————————————————————————————————————————————————
  ERR_NOT_YOUR_TURN: () => 'Ce n’est pas ton tour.',
  ERR_MATCH_NOT_RUNNING: () => 'La partie n’est pas en cours.',
  ERR_PLAYER_ELIMINATED: () => 'Tu es éliminé : tu peux regarder, plus tirer.',
  ERR_NOT_ENOUGH_PLAYERS: (p) =>
    `Il faut au moins ${String(p.min)} joueurs pour lancer la partie, vous êtes ${String(p.count)}.`,
  ERR_NOT_ENOUGH_TEAMS: (p) =>
    p.count <= 1
      ? 'Une partie en équipes a besoin d’au moins deux équipes : répartissez les joueurs avant de lancer.'
      : `Il faut au moins deux équipes, vous en avez ${String(p.count)}.`,
  ERR_MAP_GENERATION_FAILED: (p) =>
    `Impossible de générer une carte équilibrée en ${String(p.attempts)} tentatives. Change de graine ou baisse les contraintes de placement.`,

  // — Lobby and transport ————————————————————————————————————
  ERR_LOBBY_NOT_FOUND: (p) => `Aucun salon ne porte le code ${p.code}.`,
  ERR_LOBBY_FULL: (p) => `Ce salon est complet (${String(p.max)} joueurs).`,
  ERR_LOBBY_CLOSED: () => 'Ce salon est fermé.',
  ERR_NAME_TAKEN: (p) => `Le pseudo « ${p.name} » est déjà pris dans ce salon.`,
  ERR_BAD_MESSAGE: (p) => `Message invalide : ${p.detail}`,
  ERR_PROTOCOL_VERSION: (p) =>
    `Version de protocole incompatible : ton client parle la version ${String(p.client)}, le serveur la version ${String(p.server)}. Recharge la page.`,
  ERR_RATE_LIMITED: (p) =>
    `Trop de messages. Réessaie dans ${fmt(p.retryAfterMs / 1000)} seconde(s).`,
  ERR_UNAUTHORIZED: () => 'Action refusée : tu n’as pas ce droit.',
  ERR_INTERNAL: () => 'Erreur interne du serveur. La partie n’a pas été modifiée.',
};

/** Build a fully-formed error, message included. The only way to make one. */
export function fwError<C extends FwErrorCode>(code: C, params: FwErrorParams[C]): FwError<C> {
  const render = FR[code];
  return { code, params, message: render(params) } as FwError<C>;
}
