import test from 'node:test';
import assert from 'node:assert/strict';

import {
  OFFICIAL_RETENTIONS,
  getTeamInitialState,
  getTeamRetainedSquad,
  getPlayerPreviousTeam,
  isPlayerRetained,
  getRetentionCandidates,
  getCustomTeamRetainedState,
  TOTAL_MEGA_PURSE,
  MAX_RETENTIONS_AND_RTM,
} from '../src/data/retentions.js';
import {
  getRTMEligibility,
  canTeamUseRTM,
  validatePlayerTrade,
  executePlayerTradeInSquads,
  generatePlayerOrder,
} from '../src/lib/auctionRules.js';
import { evaluateBotRTM, evaluateBotTrade } from '../src/lib/botEngine.js';
import { localAuctionReducer } from '../src/lib/localAuctionEngine.js';
import { transactTeamSale } from '../src/lib/auctionTransactions.js';
import { IPL_PLAYERS } from '../src/data/players.js';
import { TEAMS } from '../src/data/teams.js';

test('IPL Retentions: all 10 franchises have valid starting retentions and 150 Cr purse', () => {
  assert.equal(TOTAL_MEGA_PURSE, 150.0);
  const franchises = ['CSK', 'MI', 'RCB', 'SRH', 'KKR', 'RR', 'DC', 'GT', 'LSG', 'PBKS'];

  franchises.forEach((teamId) => {
    const state = getTeamInitialState(teamId, TOTAL_MEGA_PURSE);
    assert.ok(state.squadCount >= 2 && state.squadCount <= 6, `${teamId} should retain between 2 and 6 players`);
    assert.equal(state.squad.length, state.squadCount);
    assert.ok(state.spent > 0, `${teamId} spent should be positive`);
    assert.equal(
      state.budgetRemaining,
      parseFloat((TOTAL_MEGA_PURSE - state.spent).toFixed(2)),
      `${teamId} remaining budget must equal 150 - spent`
    );
    assert.equal(
      state.rtmCards,
      MAX_RETENTIONS_AND_RTM - state.squadCount,
      `${teamId} RTM cards must equal 6 - retentions`
    );
  });
});

test('IPL Retentions: specific franchise details match official IPL numbers', () => {
  // CSK: 5 retained (Dhoni, Gaikwad, Jadeja, Pathirana, Dube) -> 1 RTM, ₹65 Cr spent, ₹85 Cr left
  const csk = getTeamInitialState('CSK', 150.0);
  assert.equal(csk.squadCount, 5);
  assert.equal(csk.spent, 65.0);
  assert.equal(csk.budgetRemaining, 85.0);
  assert.equal(csk.rtmCards, 1);

  // MI: 5 retained (Bumrah, Surya, Hardik, Rohit, Tilak) -> 1 RTM, ₹75 Cr spent, ₹75 Cr left
  const mi = getTeamInitialState('MI', 150.0);
  assert.equal(mi.squadCount, 5);
  assert.equal(mi.spent, 75.0);
  assert.equal(mi.budgetRemaining, 75.0);
  assert.equal(mi.rtmCards, 1);

  // RCB: 3 retained (Kohli, Patidar, Dayal) -> 3 RTMs, ₹37 Cr spent, ₹113 Cr left
  const rcb = getTeamInitialState('RCB', 150.0);
  assert.equal(rcb.squadCount, 3);
  assert.equal(rcb.spent, 37.0);
  assert.equal(rcb.budgetRemaining, 113.0);
  assert.equal(rcb.rtmCards, 3);

  // PBKS: 2 retained (Shashank, Prabhsimran) -> 4 RTMs, ₹9.5 Cr spent, ₹140.5 Cr left
  const pbks = getTeamInitialState('PBKS', 150.0);
  assert.equal(pbks.squadCount, 2);
  assert.equal(pbks.spent, 9.5);
  assert.equal(pbks.budgetRemaining, 140.5);
  assert.equal(pbks.rtmCards, 4);

  // KKR: 6 retained -> 0 RTMs
  const kkr = getTeamInitialState('KKR', 150.0);
  assert.equal(kkr.squadCount, 6);
  assert.equal(kkr.rtmCards, 0);
});

test('RTM Eligibility: identifies previous franchise and rejects ineligible teams', () => {
  const pant = IPL_PLAYERS.find((p) => p.name === 'Rishabh Pant');
  assert.ok(pant, 'Rishabh Pant must exist');
  assert.equal(getPlayerPreviousTeam(pant), 'DC');

  const testTeams = [
    { teamId: 'DC', teamName: 'Delhi Capitals', rtmCards: 2, budgetRemaining: 95.0, squad: [] },
    { teamId: 'CSK', teamName: 'Chennai Super Kings', rtmCards: 1, budgetRemaining: 85.0, squad: [] },
    { teamId: 'KKR', teamName: 'Kolkata Knight Riders', rtmCards: 0, budgetRemaining: 90.0, squad: [] },
  ];

  // If CSK is high bidder on Pant, DC should be eligible for RTM
  const eligible = getRTMEligibility({
    player: pant,
    teams: testTeams,
    highBidderTeamId: 'CSK',
  });
  assert.ok(eligible);
  assert.equal(eligible.teamId, 'DC');
  assert.equal(eligible.rtmCards, 2);

  // If DC is already the high bidder, RTM is not eligible (cannot RTM self)
  const selfRtm = getRTMEligibility({
    player: pant,
    teams: testTeams,
    highBidderTeamId: 'DC',
  });
  assert.equal(selfRtm, null);

  // If DC has 0 RTM cards left, not eligible
  const noCardsTeams = [
    { teamId: 'DC', teamName: 'Delhi Capitals', rtmCards: 0, budgetRemaining: 95.0, squad: [] },
  ];
  const noCards = getRTMEligibility({
    player: pant,
    teams: noCardsTeams,
    highBidderTeamId: 'CSK',
  });
  assert.equal(noCards, null);
});

test('canTeamUseRTM: validates budget and squad constraints', () => {
  const player = { id: 'p_101', name: 'Arshdeep Singh', role: 'Bowler', country: 'IND' };
  const team = {
    teamId: 'PBKS',
    rtmCards: 2,
    budgetRemaining: 15.0,
    squad: [],
  };

  // Affordable bid (10 Cr < 15 Cr budget)
  const ok = canTeamUseRTM({ team, player, currentBid: 10.0 });
  assert.equal(ok.canUse, true);

  // Unaffordable bid (18 Cr > 15 Cr budget)
  const tooExpensive = canTeamUseRTM({ team, player, currentBid: 18.0 });
  assert.equal(tooExpensive.canUse, false);
  assert.match(tooExpensive.reason, /Insufficient budget/);

  // No RTM cards remaining
  const zeroCards = canTeamUseRTM({
    team: { ...team, rtmCards: 0 },
    player,
    currentBid: 10.0,
  });
  assert.equal(zeroCards.canUse, false);
  assert.match(zeroCards.reason, /No RTM cards/);
});

test('Player Trade: validates and executes authentic franchise player transfers', () => {
  const bumrah = { id: 'p_621', name: 'Jasprit Bumrah', role: 'Bowler', country: 'IND', bid: 18.0 };
  const kohli = { id: 'p_142', name: 'Virat Kohli', role: 'Batsman', country: 'IND', bid: 21.0 };

  const teamMI = {
    teamId: 'MI',
    teamName: 'Mumbai Indians',
    squad: [bumrah],
    squadCount: 1,
    budgetRemaining: 50.0,
    spent: 18.0,
  };

  const teamRCB = {
    teamId: 'RCB',
    teamName: 'Royal Challengers Bengaluru',
    squad: [kohli],
    squadCount: 1,
    budgetRemaining: 60.0,
    spent: 21.0,
  };

  // Valid 1-for-1 player swap
  const validCheck = validatePlayerTrade({
    teamA: teamMI,
    teamB: teamRCB,
    playerA: bumrah,
    playerB: kohli,
  });
  assert.equal(validCheck.isValid, true);

  // Execute trade
  const traded = executePlayerTradeInSquads({
    teamA: teamMI,
    teamB: teamRCB,
    playerA: bumrah,
    playerB: kohli,
    cashFromA: 3.0, // MI offers 3 Cr extra cash to balance deal
  });

  // MI now has Kohli, RCB has Bumrah
  assert.equal(traded.teamA.squad[0].name, 'Virat Kohli');
  assert.equal(traded.teamB.squad[0].name, 'Jasprit Bumrah');

  // MI gave 3 Cr cash, so budget drops from 50 to 47
  assert.equal(traded.teamA.budgetRemaining, 47.0);
  assert.equal(traded.teamA.spent, 21.0);

  // RCB gained 3 Cr cash, so budget increases from 60 to 63
  assert.equal(traded.teamB.budgetRemaining, 63.0);
  assert.equal(traded.teamB.spent, 18.0);
});

test('Player Trade: enforces overseas limits on swap', () => {
  const osPlayer = { id: 'p_991', name: 'Overseas Star', role: 'Bowler', country: 'OS', type: 'Overseas' };
  const indPlayer = { id: 'p_992', name: 'Indian Domestic', role: 'Batsman', country: 'IND', type: 'Indian' };

  // Team A already has 8 overseas players
  const existing8OS = Array.from({ length: 8 }, (_, i) => ({
    id: `os_${i}`,
    name: `OS ${i}`,
    country: 'OS',
    type: 'Overseas',
  }));

  const teamA = {
    teamId: 'CSK',
    teamName: 'Chennai Super Kings',
    squad: [...existing8OS, indPlayer],
    budgetRemaining: 20.0,
  };

  const teamB = {
    teamId: 'MI',
    teamName: 'Mumbai Indians',
    squad: [osPlayer],
    budgetRemaining: 20.0,
  };

  // Trading indPlayer for osPlayer would give Team A 9 overseas players -> REJECT
  const check = validatePlayerTrade({
    teamA,
    teamB,
    playerA: indPlayer,
    playerB: osPlayer,
    overseasLimit: 8,
  });

  assert.equal(check.isValid, false);
  assert.match(check.reason, /overseas limit/);
});

test('Custom Retentions: user can customize retained players, purse and RTM cards dynamically', () => {
  const candidates = getRetentionCandidates('MI');
  assert.ok(candidates.length >= 5, 'MI should have at least 5 retention candidates');
  assert.ok(candidates.some((c) => c.name === 'Jasprit Bumrah'));

  // Case 1: User releases all players -> 0 retentions, 150 Cr purse, 6 RTM cards
  const releaseAll = getCustomTeamRetainedState('MI', [], 150.0);
  assert.equal(releaseAll.squadCount, 0);
  assert.equal(releaseAll.squad.length, 0);
  assert.equal(releaseAll.spent, 0);
  assert.equal(releaseAll.budgetRemaining, 150.0);
  assert.equal(releaseAll.rtmCards, 6);

  // Case 2: User retains only 2 players (Bumrah: 18 Cr, Rohit: 16.3 Cr)
  const bumrahId = candidates.find((c) => c.name === 'Jasprit Bumrah').id;
  const rohitId = candidates.find((c) => c.name === 'Rohit Sharma').id;
  const customTwo = getCustomTeamRetainedState('MI', [bumrahId, rohitId], 150.0);

  assert.equal(customTwo.squadCount, 2);
  assert.equal(customTwo.squad.length, 2);
  assert.equal(customTwo.spent, 34.3);
  assert.equal(customTwo.budgetRemaining, 115.7);
  assert.equal(customTwo.rtmCards, 4); // 6 - 2 = 4 RTM cards
});

test('Solo Auction Engine: initializes with custom user retentions and accurate purse', () => {
  const candidates = getRetentionCandidates('RCB');
  const kohliId = candidates.find((c) => c.name === 'Virat Kohli').id;

  // Initialize solo auction where human player manages RCB and retains ONLY Virat Kohli
  const state = localAuctionReducer(null, {
    type: 'INIT_AUCTION',
    roomId: 'SOLO-TEST1',
    humanUser: { uid: 'user_1', displayName: 'Captain', team: 'RCB' },
    auctionType: 'mega',
    customRetainedPlayerIds: [kohliId],
    settings: { bidTimer: 10 },
    bidTimer: 10,
  });

  const humanTeam = state.roomTeams.find((t) => t.userId === 'user_1');
  assert.ok(humanTeam, 'Human team must exist');
  assert.equal(humanTeam.teamId, 'RCB');
  assert.equal(humanTeam.squadCount, 1);
  assert.equal(humanTeam.squad[0].name, 'Virat Kohli');
  assert.equal(humanTeam.spent, 21.0);
  assert.equal(humanTeam.budgetRemaining, 129.0); // 150 - 21 = 129
  assert.equal(humanTeam.rtmCards, 5); // 6 - 1 = 5 RTM cards

  // Bot teams retain their official rosters
  const cskBot = state.roomTeams.find((t) => t.teamId === 'CSK');
  assert.equal(cskBot.squadCount, 5);
  assert.equal(cskBot.spent, 65.0);
  assert.equal(cskBot.budgetRemaining, 85.0);
  assert.equal(cskBot.rtmCards, 1);
});

test('transactTeamSale: preserves retention costs and does not reset purse to 150 Cr', () => {
  // Start with MI official retentions (75 Cr spent, 75 Cr remaining)
  const miInitial = getTeamInitialState('MI', 150.0);
  assert.equal(miInitial.spent, 75.0);
  assert.equal(miInitial.budgetRemaining, 75.0);

  const miTeamNode = {
    auctionId: 'TEST_ROOM',
    userId: 'user_mi',
    teamId: 'MI',
    teamName: 'Mumbai Indians',
    squad: miInitial.squad,
    spent: miInitial.spent,
    budgetRemaining: miInitial.budgetRemaining,
    rtmCards: miInitial.rtmCards,
  };

  // Now MI wins a new player in the auction for 10 Cr
  const updatedTeam = transactTeamSale(miTeamNode, {
    roomId: 'TEST_ROOM',
    playerId: 'p_new_star',
    bid: 10.0,
    winnerId: 'user_mi',
    winnerTeamId: 'MI',
    winnerName: 'Mumbai Indians',
    initialBudget: 150.0,
  });

  // Total spent must now be 75 + 10 = 85 Cr, and remaining purse must be 150 - 85 = 65 Cr!
  assert.equal(updatedTeam.squad.length, miInitial.squad.length + 1);
  assert.equal(updatedTeam.spent, 85.0);
  assert.equal(updatedTeam.budgetRemaining, 65.0);
});

test('Human-to-Human Trade: validates, swaps players, and adjusts cash consideration', () => {
  const cskInitial = getTeamInitialState('CSK', 150.0);
  const miInitial = getTeamInitialState('MI', 150.0);

  const teamA = {
    userId: 'user_csk',
    teamId: 'CSK',
    teamName: 'Chennai Super Kings',
    squad: cskInitial.squad,
    spent: cskInitial.spent, // 65 Cr
    budgetRemaining: cskInitial.budgetRemaining, // 85 Cr
  };

  const teamB = {
    userId: 'user_mi',
    teamId: 'MI',
    teamName: 'Mumbai Indians',
    squad: miInitial.squad,
    spent: miInitial.spent, // 75 Cr
    budgetRemaining: miInitial.budgetRemaining, // 75 Cr
  };

  const playerA = teamA.squad[0]; // e.g. Ruturaj Gaikwad
  const playerB = teamB.squad[0]; // e.g. Jasprit Bumrah

  const val = validatePlayerTrade({
    teamA,
    teamB,
    playerA,
    playerB,
    cashFromA: 2.0,
    cashFromB: 0,
    squadLimit: 25,
    overseasLimit: 8,
  });
  assert.equal(val.isValid, true);

  const { teamA: updatedA, teamB: updatedB } = executePlayerTradeInSquads({
    teamA,
    teamB,
    playerA,
    playerB,
    cashFromA: 2.0,
    cashFromB: 0,
  });

  // Team A gave 2.0 Cr cash to Team B:
  // Team A budget remaining: 85 - 2 = 83 Cr
  // Team B budget remaining: 75 + 2 = 77 Cr
  assert.equal(updatedA.budgetRemaining, 83.0);
  assert.equal(updatedA.spent, 67.0);
  assert.equal(updatedB.budgetRemaining, 77.0);
  assert.equal(updatedB.spent, 73.0);

  // Check players were swapped
  assert.ok(updatedA.squad.some((p) => p.id === playerB.id));
  assert.ok(!updatedA.squad.some((p) => p.id === playerA.id));
  assert.ok(updatedB.squad.some((p) => p.id === playerA.id));
  assert.ok(!updatedB.squad.some((p) => p.id === playerB.id));
});
