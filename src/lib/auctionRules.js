import { IPL_PLAYERS } from '../data/players.js';
import { countOverseas, isOverseasPlayer, r2, toFiniteNumber } from './auctionDisplay.js';
import { isPlayerRetained, getPlayerPreviousTeam } from '../data/retentions.js';

/**
 * Pure auction rules used by the cloud (RTDB) engine. Keeping these in one
 * place lets the regression tests exercise the real logic.
 */

export const shuffleArray = (array) => {
  const a = [...array];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

/** Build the shuffled lot order for an auction type, grouped by player set. */
export function generatePlayerOrder(auctionType = 'mega', excludeRetained = false) {
  let targetPlayers = IPL_PLAYERS.length;
  if (auctionType === 'sprint11') targetPlayers = 150;
  else if (auctionType === 'sprint5') targetPlayers = 75;

  const marquee = [];
  const byRole = {};
  IPL_PLAYERS.forEach((p, i) => {
    if (excludeRetained && isPlayerRetained(p.id)) return;
    if (p.set.includes('Marquee')) marquee.push(i);
    else (byRole[p.role] ||= []).push(i);
  });

  const selected = new Set(marquee);
  const nonMarqueeTarget = Math.max(0, targetPlayers - marquee.length);
  const nonMarqueeTotal = Math.max(1, IPL_PLAYERS.length - marquee.length);
  const fraction = nonMarqueeTotal > 0 ? nonMarqueeTarget / nonMarqueeTotal : 1;

  Object.values(byRole).forEach((indices) => {
    const shuffled = shuffleArray(indices);
    const limit =
      auctionType === 'mega' ? shuffled.length : Math.max(1, Math.ceil(shuffled.length * fraction));
    shuffled.slice(0, limit).forEach((i) => selected.add(i));
  });

  const sets = [...new Set(IPL_PLAYERS.map((p) => p.set))];
  const order = [];
  sets.forEach((setName) => {
    const idxs = [];
    IPL_PLAYERS.forEach((p, i) => {
      if (excludeRetained && isPlayerRetained(p.id)) return;
      if (p.set === setName && selected.has(i)) idxs.push(i);
    });
    order.push(...shuffleArray(idxs));
  });
  return order;
}

export const normalizeSquad = (squad) => mapRoomPlayers(squad, (entry) => entry);

export const getSquadEntryId = (entry) =>
  typeof entry === 'string' ? entry : entry?.id;

/** RTDB may return a dense JSON array or an object keyed by index. */
export function mapRoomPlayers(players, mapper) {
  const list = Array.isArray(players)
    ? players
    : players && typeof players === 'object'
      ? Object.values(players)
      : [];
  return list.filter(Boolean).map(mapper);
}

export const MIN_TEAMS_TO_START = 2;

/** Distinct franchises in the room. Human and bot managers both carry `team`. */
export function countAuctionTeams(players) {
  return new Set(mapRoomPlayers(players, (player) => player.team).filter(Boolean)).size;
}

/** Base price for the opening bid, otherwise the next increment (rounded). */
export function getNextBidAmount(player, currentBid) {
  const current = toFiniteNumber(currentBid, 0);
  if (current === 0) return toFiniteNumber(player?.basePrice, 0);
  return r2(current + (current < 5 ? 0.2 : 0.25));
}

/**
 * Squad/overseas rules that every winning bid must satisfy. Returns a reason
 * string, or null when the team may bid.
 */
export function getSquadConstraintError({
  team,
  player,
  squadLimit = 25,
  overseasLimit = 8,
  playerIndex,
}) {
  if (!team) return 'Pick a team before bidding';

  const squad = normalizeSquad(team.squad);
  const playerId = player?.id;

  if (squad.some((entry) => getSquadEntryId(entry) === playerId)) {
    return 'This player is already in your squad';
  }

  if (squad.length >= toFiniteNumber(squadLimit, 25)) {
    return 'Squad is full';
  }

  if (isOverseasPlayer(player)) {
    const overseas = countOverseas(squad, playerIndex);
    if (overseas >= toFiniteNumber(overseasLimit, 8)) {
      return 'Overseas player limit reached';
    }
  }

  return null;
}

/**
 * Merge a manager into a room roster without dropping stats that were already
 * recorded (spent / squadCount / bot flags). Used inside RTDB transactions so
 * two managers joining at the same moment cannot overwrite each other.
 */
export function mergeRoomPlayer(players, player) {
  const list = mapRoomPlayers(players, (entry) => entry);

  const existing = list.find(
    (entry) => entry.id === player.id || entry.userId === player.id,
  );

  return [
    ...list.filter(
      (entry) => entry.id !== player.id && entry.userId !== player.id,
    ),
    { ...(existing || {}), ...player },
  ];
}

/**
 * Decide what `startAuction` should do from the current room/live snapshot.
 * - completed: auction finished, do nothing
 * - running: a lot is already live, never restart it
 * - resume: room is active but the live lot is missing (a start was interrupted)
 * - start: waiting room, create the order and first lot
 */
export function getStartDisposition(room, live) {
  if (!room) return 'missing';
  if (room.status === 'completed') return 'completed';
  // The last lot was finalized; only the room-status write may be missing.
  if (live?.status === 'completed') return 'completed';
  if (live?.status && live.status !== 'waiting') return 'running';
  if (room.status === 'active') return 'resume';
  return 'start';
}

/** Recovery delay before a finalized lot is advanced again by any client. */
export function finalizedLotRecoveryDelay(status) {
  if (status === 'sold') return 6000;
  if (status === 'unsold') return 3000;
  return null;
}

/**
 * Decision predicate for server-side host-disconnect auto-pause.
 * The server-side onDisconnect fallback must only be armed when:
 * 1. The client socket is actively connected.
 * 2. The client is the host.
 * 3. This tab is the designated primary tab for this host session.
 * 4. The room is actively running (not waiting/completed).
 * 5. The live lot is actively bidding (not paused/sold/unsold/completed).
 * 6. A valid lot/player is active.
 */
export function shouldArmDisconnectPause({
  socketConnected,
  isHost,
  isPrimaryTab = true,
  roomStatus,
  liveStatus,
  playerId,
}) {
  return Boolean(
    socketConnected &&
    isHost &&
    isPrimaryTab &&
    roomStatus === 'active' &&
    liveStatus === 'bidding' &&
    playerId,
  );
}

/**
 * Action resolver for the onDisconnect lifecycle.
 * Prevents stale operations from lingering or overwriting newer lots/completed rooms.
 */
export function resolveDisconnectAction({
  shouldArm,
  currentlyArmed,
  armedLotId,
  currentLotId,
}) {
  if (shouldArm) {
    if (currentlyArmed && armedLotId !== currentLotId) {
      return 'rearm';
    }
    if (!currentlyArmed) {
      return 'arm';
    }
    return 'none';
  }
  if (currentlyArmed) {
    return 'cancel';
  }
  return 'none';
}

/**
 * Checks whether any team in the room is eligible to trigger Right To Match (RTM)
 * for the player currently under the hammer.
 */
export function getRTMEligibility({ player, teams, highBidderTeamId, squadLimit = 25, overseasLimit = 8 }) {
  if (!player) return null;
  const prevTeamId = getPlayerPreviousTeam(player);
  if (!prevTeamId) return null;
  // If the high bidder is already the original team, RTM is unnecessary
  if (highBidderTeamId === prevTeamId) return null;

  const teamList = Array.isArray(teams) ? teams : Object.values(teams || {});
  const eligibleTeam = teamList.find(
    (t) => (t.teamId === prevTeamId || t.team === prevTeamId || t.id === prevTeamId)
  );
  if (!eligibleTeam) return null;

  const rtmCards = toFiniteNumber(eligibleTeam.rtmCards, 0);
  if (rtmCards <= 0) return null;

  return {
    teamId: prevTeamId,
    team: eligibleTeam,
    rtmCards,
  };
}

/**
 * Validates whether the candidate team can legally exercise an RTM card at the specified bid.
 */
export function canTeamUseRTM({ team, player, currentBid, squadLimit = 25, overseasLimit = 8 }) {
  if (!team || !player) return { canUse: false, reason: 'Invalid team or player' };
  const rtmCards = toFiniteNumber(team.rtmCards, 0);
  if (rtmCards <= 0) return { canUse: false, reason: 'No RTM cards remaining for this franchise' };

  const budget = toFiniteNumber(team.budgetRemaining, 0);
  const cost = toFiniteNumber(currentBid, 0);
  if (budget < cost) {
    return { canUse: false, reason: `Insufficient budget (₹${budget} Cr available, ₹${cost} Cr required)` };
  }

  const constraintErr = getSquadConstraintError({ team, player, squadLimit, overseasLimit });
  if (constraintErr) return { canUse: false, reason: constraintErr };

  return { canUse: true };
}

/**
 * Validates a proposed trade / exchange of players and cash between two franchises.
 */
export function validatePlayerTrade({
  teamA,
  teamB,
  playerA,
  playerB,
  cashFromA = 0,
  cashFromB = 0,
  squadLimit = 25,
  overseasLimit = 8,
}) {
  if (!teamA || !teamB) return { isValid: false, reason: 'Both franchises are required for a trade' };
  if (!playerA && !playerB && !cashFromA && !cashFromB) {
    return { isValid: false, reason: 'At least one player or cash amount must be exchanged' };
  }

  const squadA = normalizeSquad(teamA.squad);
  const squadB = normalizeSquad(teamB.squad);

  if (playerA && !squadA.some((p) => getSquadEntryId(p) === playerA.id)) {
    return { isValid: false, reason: `${teamA.teamName || 'Team A'} does not own ${playerA.name}` };
  }
  if (playerB && !squadB.some((p) => getSquadEntryId(p) === playerB.id)) {
    return { isValid: false, reason: `${teamB.teamName || 'Team B'} does not own ${playerB.name}` };
  }

  const newSizeA = squadA.length - (playerA ? 1 : 0) + (playerB ? 1 : 0);
  const newSizeB = squadB.length - (playerB ? 1 : 0) + (playerA ? 1 : 0);

  if (newSizeA > toFiniteNumber(squadLimit, 25)) {
    return { isValid: false, reason: `${teamA.teamName || 'Team A'} would exceed squad limit (${squadLimit})` };
  }
  if (newSizeB > toFiniteNumber(squadLimit, 25)) {
    return { isValid: false, reason: `${teamB.teamName || 'Team B'} would exceed squad limit (${squadLimit})` };
  }

  const newSquadA = squadA.filter((p) => getSquadEntryId(p) !== playerA?.id);
  if (playerB) newSquadA.push(playerB);
  if (countOverseas(newSquadA) > toFiniteNumber(overseasLimit, 8)) {
    return { isValid: false, reason: `${teamA.teamName || 'Team A'} would exceed overseas limit (${overseasLimit})` };
  }

  const newSquadB = squadB.filter((p) => getSquadEntryId(p) !== playerB?.id);
  if (playerA) newSquadB.push(playerA);
  if (countOverseas(newSquadB) > toFiniteNumber(overseasLimit, 8)) {
    return { isValid: false, reason: `${teamB.teamName || 'Team B'} would exceed overseas limit (${overseasLimit})` };
  }

  const budgetA = toFiniteNumber(teamA.budgetRemaining, 0);
  const budgetB = toFiniteNumber(teamB.budgetRemaining, 0);

  const netCashFromA = toFiniteNumber(cashFromA, 0) - toFiniteNumber(cashFromB, 0);
  if (budgetA < netCashFromA) {
    return { isValid: false, reason: `${teamA.teamName || 'Team A'} has insufficient purse for this trade` };
  }
  if (budgetB < -netCashFromA) {
    return { isValid: false, reason: `${teamB.teamName || 'Team B'} has insufficient purse for this trade` };
  }

  return { isValid: true };
}

/**
 * Pure state transformation executing an approved trade between two franchises.
 */
export function executePlayerTradeInSquads({
  teamA,
  teamB,
  playerA,
  playerB,
  cashFromA = 0,
  cashFromB = 0,
}) {
  const squadA = normalizeSquad(teamA.squad).filter((p) => getSquadEntryId(p) !== playerA?.id);
  if (playerB) squadA.push({ ...playerB, teamId: teamA.teamId || teamA.team });

  const squadB = normalizeSquad(teamB.squad).filter((p) => getSquadEntryId(p) !== playerB?.id);
  if (playerA) squadB.push({ ...playerA, teamId: teamB.teamId || teamB.team });

  const netCashFromA = toFiniteNumber(cashFromA, 0) - toFiniteNumber(cashFromB, 0);

  const updatedBudgetA = r2(toFiniteNumber(teamA.budgetRemaining, 0) - netCashFromA);
  const updatedSpentA = r2(toFiniteNumber(teamA.spent, 0) + netCashFromA);

  const updatedBudgetB = r2(toFiniteNumber(teamB.budgetRemaining, 0) + netCashFromA);
  const updatedSpentB = r2(toFiniteNumber(teamB.spent, 0) - netCashFromA);

  return {
    teamA: {
      ...teamA,
      squad: squadA,
      squadCount: squadA.length,
      budgetRemaining: updatedBudgetA,
      spent: updatedSpentA,
    },
    teamB: {
      ...teamB,
      squad: squadB,
      squadCount: squadB.length,
      budgetRemaining: updatedBudgetB,
      spent: updatedSpentB,
    },
  };
}


