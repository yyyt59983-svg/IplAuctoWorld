import { IPL_PLAYERS } from '../data/players.js';
import { TEAMS } from '../data/teams.js';
import { toFiniteNumber, countOverseas, isOverseasPlayer, r2 } from './auctionDisplay.js';
import { getNextBidAmount, generatePlayerOrder, getRTMEligibility, canTeamUseRTM, validatePlayerTrade, executePlayerTradeInSquads } from './auctionRules.js';
import { evaluateBotBid, evaluateBotRTM, evaluateBotTrade } from './botEngine.js';
import { simulateBotLot, simulateRemainingAuction } from './botSimulation.js';
import { getTeamInitialState, getCustomTeamRetainedState, TOTAL_MEGA_PURSE } from '../data/retentions.js';

export const SCHEMA_VERSION = 1;
export const MAX_SOLO_SAVES = 5;
export const STORAGE_PREFIX = 'crickauction_solo_';
export const STORAGE_INDEX_KEY = 'crickauction_solo_index';
export const STORAGE_LOCK_PREFIX = 'crickauction_solo_lock_';

/**
 * Unified detector for local-mode solo auction rooms.
 *
 * Rules:
 * 1. An explicit cloud server parameter (e.g. ?server=server-1) ALWAYS wins over a stale local store.
 * 2. If server is explicitly 'local' (or ?server=local), returns true.
 * 3. If hasLocalStore is true and no explicit cloud server was requested, returns true.
 * 4. Otherwise returns false.
 */
export function isLocalRoom(roomId, serverOrParams, hasLocalStore = false) {
  if (!roomId) return false;

  let serverVal = null;
  if (typeof serverOrParams === 'string') {
    serverVal = serverOrParams;
  } else if (serverOrParams && typeof serverOrParams.get === 'function') {
    serverVal = serverOrParams.get('server');
  }

  // An explicit cloud server parameter ALWAYS overrides a stale local store
  if (serverVal && serverVal !== 'local') {
    return false;
  }

  if (serverVal === 'local') {
    return true;
  }

  if (typeof roomId === 'string' && roomId.startsWith('SOLO-')) {
    return true;
  }

  return Boolean(hasLocalStore);
}

/**
 * Deterministic pseudo-random number generator (LCG) using 32-bit integer arithmetic.
 * Returns a function that produces [0, 1) float and advances the internal seed.
 */
export function createSeededRng(seed = 123456789) {
  let s = (Math.floor(seed) || 123456789) >>> 0;
  return function nextRandom() {
    s = (Math.imul(1664525, s) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/**
 * Pure reducer for local solo auction state transitions.
 * Zero Firebase, zero Supabase dependencies.
 */
export function localAuctionReducer(state, action) {
  if (!action) return state;

  switch (action.type) {
    case 'INIT_AUCTION': {
      const {
        roomId,
        humanUser,
        auctionType = 'mega',
        seed = Date.now(),
        settings: initialSettings = {},
      } = action;
      const bidTimer = Number(initialSettings?.bidTimer || action.bidTimer || 10);

      const isSprint5 = auctionType === 'sprint5';
      const isSprint11 = auctionType === 'sprint11';
      const isMega = !isSprint5 && !isSprint11;

      const budget = isSprint5 ? 60.0 : isSprint11 ? 90.0 : 150.0;
      const squadLimit = isSprint5 ? 5 : isSprint11 ? 11 : 25;
      const overseasLimit = isSprint5 ? 2 : isSprint11 ? 4 : 8;

      const humanTeamId = humanUser.team;
      const humanTeamObj = TEAMS.find((t) => t.id === humanTeamId) || TEAMS[0];

      const humanState = isMega
        ? getCustomTeamRetainedState(humanTeamId, action.customRetainedPlayerIds, budget)
        : { squad: [], squadCount: 0, spent: 0, budgetRemaining: budget, rtmCards: 0 };

      // 1 human player + 9 AI bot franchises
      const players = [
        {
          id: humanUser.uid,
          name: humanUser.displayName || 'Manager',
          team: humanTeamId,
          teamName: humanTeamObj.name,
          isHost: true,
          isBot: false,
          spent: humanState.spent,
          squadCount: humanState.squadCount,
        },
      ];

      const roomTeams = [
        {
          id: `${roomId}_${humanUser.uid}`,
          auctionId: roomId,
          userId: humanUser.uid,
          teamId: humanTeamId,
          teamName: humanTeamObj.name,
          budgetRemaining: humanState.budgetRemaining,
          spent: humanState.spent,
          squad: humanState.squad,
          squadCount: humanState.squadCount,
          rtmCards: humanState.rtmCards,
        },
      ];

      TEAMS.forEach((t) => {
        if (t.id === humanTeamId) return;
        const botId = `bot_${t.id}`;
        const botState = isMega
          ? getTeamInitialState(t.id, budget)
          : { squad: [], squadCount: 0, spent: 0, budgetRemaining: budget, rtmCards: 0 };

        players.push({
          id: botId,
          name: t.botName || `${t.name} Bot`,
          team: t.id,
          teamName: t.name,
          isHost: false,
          isBot: true,
          spent: botState.spent,
          squadCount: botState.squadCount,
        });

        roomTeams.push({
          id: `${roomId}_${botId}`,
          auctionId: roomId,
          userId: botId,
          teamId: t.id,
          teamName: t.name,
          budgetRemaining: botState.budgetRemaining,
          spent: botState.spent,
          squad: botState.squad,
          squadCount: botState.squadCount,
          rtmCards: botState.rtmCards,
        });
      });

      // Same lot order as cloud: grouped by player set, marquee first (excluding retained in Mega)
      const playerOrder = generatePlayerOrder(auctionType, isMega);

      const firstPlayer = IPL_PLAYERS[playerOrder[0]] || IPL_PLAYERS[0];
      const now = action.now || Date.now();

      return {
        id: roomId,
        hostId: humanUser.uid,
        hostName: humanUser.displayName || 'Manager',
        status: 'active',
        auctionType,
        server: 'local',
        squadLimit,
        overseasLimit,
        settings: { bidTimer, budget },
        players,
        roomTeams,
        teams: roomTeams,
        playerOrder,
        currentPlayerIndex: 0,
        rngSeed: seed,
        fastForwarded: false,
        isFastForwarding: false,
        messages: [
          {
            id: `msg_init_${roomId}`,
            text: `Single player auction started with 9 AI Bots. Mode: ${auctionType.toUpperCase()}.`,
            type: 'log',
            timestamp: now,
          },
        ],
        currentAuction: {
          playerId: firstPlayer.id,
          currentBid: 0,
          highBidderId: '',
          highBidderName: '',
          highBidderTeamId: '',
          timerEndsAt: now + bidTimer * 1000,
          status: 'bidding',
          pausedRemainingMs: null,
        },
        currentLot: {
          playerId: firstPlayer.id,
          currentBid: 0,
          highBidderId: '',
          highBidderName: '',
          highBidderTeamId: '',
          timerEndsAt: now + bidTimer * 1000,
          status: 'bidding',
          pausedRemainingMs: null,
        },
      };
    }

    case 'PLACE_BID': {
      if (!state || state.status !== 'active') return state;
      const live = state.currentAuction;
      if (!live || live.status !== 'bidding') return state;

      const { bidderId, now = Date.now() } = action;
      if (!bidderId) return state;

      const bidderTeam = state.roomTeams.find((t) => t.userId === bidderId);
      if (!bidderTeam) return state;

      const player = IPL_PLAYERS.find((p) => p.id === live.playerId);
      if (!player) return state;

      // Don't bid against self
      if (live.highBidderId === bidderId) return state;

      // Calculate next bid
      const nextBid = getNextBidAmount(player, live.currentBid);

      // Validate budget
      const currentSquad = bidderTeam.squad || [];
      const slotsRemaining = state.squadLimit - currentSquad.length;
      if (slotsRemaining <= 0) return state;

      // Reserve budget check for human
      const slotsAfterThis = Math.max(0, slotsRemaining - 1);
      const minReserve = slotsAfterThis * 0.30;
      const budgetRemaining = toFiniteNumber(bidderTeam.budgetRemaining, state.settings?.budget || 120);

      if (budgetRemaining < nextBid || (budgetRemaining - nextBid) < minReserve) {
        return state;
      }

      // Overseas check
      if (isOverseasPlayer(player)) {
        const count = countOverseas(currentSquad, IPL_PLAYERS);
        if (count >= state.overseasLimit) return state;
      }

      const timerSec = state.settings?.bidTimer || 10;
      const teamObj = TEAMS.find((t) => t.id === bidderTeam.teamId);
      const bidderName = bidderTeam.userId.startsWith('bot_')
        ? (teamObj?.botName || `${teamObj?.name || 'Bot'} Bot`)
        : state.hostName || 'Manager';

      const updatedLot = {
        ...live,
        currentBid: nextBid,
        highBidderId: bidderId,
        highBidderName: bidderName,
        highBidderTeamId: bidderTeam.teamId,
        timerEndsAt: now + timerSec * 1000,
      };

      return {
        ...state,
        currentAuction: updatedLot,
        currentLot: updatedLot,
        messages: [
          ...state.messages.slice(-50),
          {
            id: `bid_${now}_${Math.random().toString(36).slice(2, 7)}`,
            text: `New bid: ₹${nextBid.toFixed(2)} Cr by ${bidderName}`,
            type: 'log',
            timestamp: now,
          },
        ],
      };
    }

    case 'BOT_BID': {
      if (!state || state.status !== 'active') return state;
      const live = state.currentAuction;
      if (!live || live.status !== 'bidding') return state;

      const { now = Date.now() } = action;
      const player = IPL_PLAYERS.find((p) => p.id === live.playerId);
      if (!player) return state;

      // Filter eligible bots
      const botTeams = state.roomTeams.filter((t) => t.userId && t.userId.startsWith('bot_'));
      if (botTeams.length === 0) return state;

      const rng = createSeededRng(state.rngSeed + now);
      const shuffledBots = [...botTeams].sort(() => rng() - 0.5);

      for (const bTeam of shuffledBots) {
        if (bTeam.userId === live.highBidderId) continue;

        const decision = evaluateBotBid({
          player,
          currentBid: live.currentBid,
          highBidderId: live.highBidderId,
          botTeam: bTeam,
          squadLimit: state.squadLimit,
          overseasLimit: state.overseasLimit,
          initialBudget: state.settings?.budget || 120,
          randomFn: rng,
        });

        if (decision && decision.shouldBid) {
          const teamObj = TEAMS.find((t) => t.id === decision.teamId);
          const botName = teamObj?.botName || (teamObj ? `${teamObj.name} Bot` : 'Bot');
          const timerSec = state.settings?.bidTimer || 10;

          const updatedLot = {
            ...live,
            currentBid: decision.nextBid,
            highBidderId: decision.botUserId,
            highBidderName: botName,
            highBidderTeamId: decision.teamId,
            timerEndsAt: now + timerSec * 1000,
          };

          return {
            ...state,
            rngSeed: (state.rngSeed + 1) >>> 0,
            currentAuction: updatedLot,
            currentLot: updatedLot,
            messages: [
              ...state.messages.slice(-50),
              {
                id: `bid_bot_${now}_${Math.random().toString(36).slice(2, 7)}`,
                text: `New bid: ₹${decision.nextBid.toFixed(2)} Cr by ${botName}`,
                type: 'log',
                timestamp: now,
              },
            ],
          };
        }
      }

      return state;
    }

    case 'RESOLVE_LOT': {
      if (!state || state.status !== 'active') return state;
      const live = state.currentAuction;
      if (!live) return state;

      // A duplicate resolve (e.g. the timer and the bot loop both firing) must not
      // skip the sold/unsold celebration. ADVANCE_LOT is the only way forward.
      if (live.status === 'sold' || live.status === 'unsold') return state;

      if (live.status !== 'bidding') return state;

      const { now = Date.now() } = action;
      const player = IPL_PLAYERS.find((p) => p.id === live.playerId);
      if (!player) return state;

      const isSold = Boolean(live.highBidderId && live.currentBid > 0);
      let updatedRoomTeams = state.roomTeams;
      let updatedPlayers = state.players;

      // Check Right To Match (RTM) eligibility before finalizing normal sale
      const rtmEligible = isSold && !action.ignoreRtm && getRTMEligibility({
        player,
        teams: state.roomTeams,
        highBidderTeamId: live.highBidderTeamId,
        squadLimit: state.squadLimit,
        overseasLimit: state.overseasLimit,
      });

      if (rtmEligible) {
        const isHumanRtm = rtmEligible.team.userId === state.humanUser?.uid || !String(rtmEligible.team.userId || '').startsWith('bot_');
        if (isHumanRtm) {
          return {
            ...state,
            currentAuction: {
              ...live,
              status: 'rtm_pending',
              rtmTeamId: rtmEligible.teamId,
              rtmTeamName: rtmEligible.team.teamName,
              rtmPlayer: player,
              rtmCost: live.currentBid,
              rtmDeadline: now + 12000,
            },
            messages: [
              ...state.messages.slice(-50),
              {
                id: `rtm_${now}_${player.id}`,
                text: `🚨 RTM TRIGGERED! ${rtmEligible.team.teamName} has the Right To Match ₹${live.currentBid.toFixed(2)} Cr for ${player.name}!`,
                type: 'rtm_alert',
                timestamp: now,
              },
            ],
          };
        } else {
          // AI Bot RTM decision
          const botDecision = evaluateBotRTM({
            player,
            botTeam: rtmEligible.team,
            currentBid: live.currentBid,
            squadLimit: state.squadLimit,
            overseasLimit: state.overseasLimit,
            initialBudget: state.settings?.budget || 150.0,
          });

          if (botDecision.shouldMatch) {
            const botTeam = rtmEligible.team;
            const buyerId = botTeam.userId;
            const buyerTeamId = rtmEligible.teamId;
            const buyerName = botTeam.teamName;

            updatedRoomTeams = state.roomTeams.map((t) => {
              if (t.userId !== buyerId) return t;
              const newSquad = [
                ...(t.squad || []),
                {
                  id: player.id,
                  name: player.name,
                  role: player.role,
                  bid: live.currentBid,
                  team: buyerTeamId,
                  matchedViaRTM: true,
                },
              ];
              const newSpent = r2(toFiniteNumber(t.spent, 0) + live.currentBid);
              const newBudget = r2(Math.max(0, toFiniteNumber(t.budgetRemaining, state.settings?.budget || 150) - live.currentBid));
              const newRtm = Math.max(0, toFiniteNumber(t.rtmCards, 1) - 1);
              return {
                ...t,
                squad: newSquad,
                spent: newSpent,
                budgetRemaining: newBudget,
                rtmCards: newRtm,
              };
            });

            updatedPlayers = state.players.map((p) => {
              if (p.id !== buyerId) return p;
              return {
                ...p,
                spent: r2(toFiniteNumber(p.spent, 0) + live.currentBid),
                squadCount: toFiniteNumber(p.squadCount, 0) + 1,
              };
            });

            const rtmMsg = `🔥 RTM EXERCISED! ${buyerName} used a Right-To-Match card to secure ${player.name} for ₹${live.currentBid.toFixed(2)} Cr!`;
            const newMessages = [
              ...state.messages.slice(-50),
              {
                id: `res_${now}_${player.id}`,
                text: rtmMsg,
                type: 'sold_card',
                metadata: {
                  playerId: player.id,
                  teamId: buyerTeamId,
                  bid: live.currentBid,
                  buyerId,
                  buyerName,
                  isRTM: true,
                },
                timestamp: now,
              },
            ];

            const nextIndex = state.currentPlayerIndex + 1;
            const allDone = nextIndex >= state.playerOrder.length;
            const celebrationMs = action.celebrationMs || 5000;

            return {
              ...state,
              status: allDone ? 'completed' : 'active',
              roomTeams: updatedRoomTeams,
              players: updatedPlayers,
              currentAuction: {
                ...live,
                status: 'sold',
                currentBid: live.currentBid,
                highBidderId: buyerId,
                highBidderName: buyerName,
                highBidderTeamId: buyerTeamId,
                isRTM: true,
                soldAt: now,
                celebrationUntil: now + celebrationMs,
              },
              messages: newMessages,
            };
          }
        }
      }

      if (isSold) {
        updatedRoomTeams = state.roomTeams.map((t) => {
          if (t.userId !== live.highBidderId) return t;
          const newSquad = [
            ...(t.squad || []),
            {
              id: player.id,
              name: player.name,
              role: player.role,
              bid: live.currentBid,
              team: live.highBidderTeamId,
            },
          ];
          const newSpent = r2(toFiniteNumber(t.spent, 0) + live.currentBid);
          const newBudget = r2(Math.max(0, toFiniteNumber(t.budgetRemaining, state.settings?.budget || 150) - live.currentBid));
          return {
            ...t,
            squad: newSquad,
            spent: newSpent,
            budgetRemaining: newBudget,
          };
        });

        updatedPlayers = state.players.map((p) => {
          if (p.id !== live.highBidderId) return p;
          return {
            ...p,
            spent: r2(toFiniteNumber(p.spent, 0) + live.currentBid),
            squadCount: toFiniteNumber(p.squadCount, 0) + 1,
          };
        });
      }

      const nextIndex = state.currentPlayerIndex + 1;
      const allDone = nextIndex >= state.playerOrder.length;

      const resultMsg = isSold
        ? `${player.name} SOLD to ${live.highBidderName} for ₹${live.currentBid.toFixed(2)} Cr`
        : `${player.name} UNSOLD`;

      const newMessages = [
        ...state.messages.slice(-50),
        {
          id: `res_${now}_${player.id}`,
          text: resultMsg,
          type: isSold ? 'sold_card' : 'log',
          metadata: isSold ? {
            playerId: player.id,
            teamId: live.highBidderTeamId,
            bid: live.currentBid,
            buyerId: live.highBidderId,
            buyerName: live.highBidderName,
          } : null,
          timestamp: now,
        },
      ];

      // Celebration stage: pause on sold/unsold animation before advancing
      if (action.celebrate) {
        // Match cloud timing: 5s on a sale, 2s on unsold.
        const celebrationMs = action.celebrationMs || (isSold ? 5000 : 2000);
        const resolvedLot = {
          ...live,
          status: isSold ? 'sold' : 'unsold',
          celebrationEndsAt: now + celebrationMs,
          timerEndsAt: now + celebrationMs,
        };
        return {
          ...state,
          roomTeams: updatedRoomTeams,
          teams: updatedRoomTeams,
          players: updatedPlayers,
          messages: newMessages,
          currentAuction: resolvedLot,
          currentLot: resolvedLot,
        };
      }

      if (allDone) {
        const completedLot = {
          ...live,
          status: isSold ? 'sold' : 'unsold',
        };
        return {
          ...state,
          status: 'completed',
          roomTeams: updatedRoomTeams,
          teams: updatedRoomTeams,
          players: updatedPlayers,
          currentPlayerIndex: nextIndex,
          messages: [
            ...newMessages,
            {
              id: `msg_comp_${now}`,
              text: 'The Solo Mega Auction is officially complete!',
              type: 'log',
              timestamp: now,
            },
          ],
          currentAuction: completedLot,
          currentLot: completedLot,
        };
      }

      const nextPlayerId = state.playerOrder[nextIndex];
      const nextPlayer = IPL_PLAYERS[nextPlayerId] || IPL_PLAYERS[0];
      const timerSec = state.settings?.bidTimer || 10;
      const nextLot = {
        playerId: nextPlayer.id,
        // Cloud opens each lot at 0; the first bid equals the base price.
        currentBid: 0,
        highBidderId: '',
        highBidderName: '',
        highBidderTeamId: '',
        timerEndsAt: now + timerSec * 1000,
        status: 'bidding',
        pausedRemainingMs: null,
      };

      return {
        ...state,
        roomTeams: updatedRoomTeams,
        teams: updatedRoomTeams,
        players: updatedPlayers,
        currentPlayerIndex: nextIndex,
        messages: newMessages,
        currentAuction: nextLot,
        currentLot: nextLot,
      };
    }

    case 'ADVANCE_LOT': {
      if (!state || state.status !== 'active') return state;
      const { now = Date.now() } = action;
      const nextIndex = state.currentPlayerIndex + 1;
      const allDone = nextIndex >= state.playerOrder.length;

      if (allDone) {
        const completedLot = {
          ...(state.currentAuction || {}),
          status: 'sold',
        };
        return {
          ...state,
          status: 'completed',
          currentPlayerIndex: nextIndex,
          messages: [
            ...state.messages.slice(-50),
            {
              id: `msg_comp_${now}`,
              text: 'The Solo Mega Auction is officially complete!',
              type: 'log',
              timestamp: now,
            },
          ],
          currentAuction: completedLot,
          currentLot: completedLot,
        };
      }

      const nextPlayerId = state.playerOrder[nextIndex];
      const nextPlayer = IPL_PLAYERS[nextPlayerId] || IPL_PLAYERS[0];
      const timerSec = state.settings?.bidTimer || 10;
      const nextLot = {
        playerId: nextPlayer.id,
        // Cloud opens each lot at 0; the first bid equals the base price.
        currentBid: 0,
        highBidderId: '',
        highBidderName: '',
        highBidderTeamId: '',
        timerEndsAt: now + timerSec * 1000,
        status: 'bidding',
        pausedRemainingMs: null,
      };

      return {
        ...state,
        currentPlayerIndex: nextIndex,
        currentAuction: nextLot,
        currentLot: nextLot,
      };
    }

    case 'PAUSE_AUCTION': {
      if (!state || state.status !== 'active') return state;
      const live = state.currentAuction;
      if (!live || live.status !== 'bidding') return state;

      const { now = Date.now() } = action;
      const remainingMs = Math.max(0, (live.timerEndsAt || 0) - now);
      const pausedLot = {
        ...live,
        status: 'paused',
        pausedRemainingMs: remainingMs,
      };

      return {
        ...state,
        currentAuction: pausedLot,
        currentLot: pausedLot,
      };
    }

    case 'RESUME_AUCTION': {
      if (!state || state.status !== 'active') return state;
      const live = state.currentAuction;
      if (!live || live.status !== 'paused') return state;

      const { now = Date.now() } = action;
      const remaining = live.pausedRemainingMs ?? (state.settings?.bidTimer || 10) * 1000;
      const resumedLot = {
        ...live,
        status: 'bidding',
        timerEndsAt: now + remaining,
        pausedRemainingMs: null,
      };

      return {
        ...state,
        currentAuction: resumedLot,
        currentLot: resumedLot,
      };
    }

    case 'SKIP_LOT': {
      if (!state || state.status !== 'active') return state;
      const live = state.currentAuction;
      if (!live) return state;
      if (live.status === 'sold' || live.status === 'unsold') {
        return localAuctionReducer(state, { type: 'ADVANCE_LOT', now: action.now || Date.now() });
      }
      if (live.status !== 'bidding') return state;

      const { now = Date.now() } = action;
      const player = IPL_PLAYERS.find((p) => p.id === live.playerId);
      if (!player) return state;

      const botTeams = state.roomTeams.filter((t) => t.userId !== state.hostId);
      const rng = createSeededRng(state.rngSeed + now);

      const simRes = simulateBotLot({
        player,
        botTeams,
        currentBid: live.currentBid,
        highBidderId: live.highBidderId,
        highBidderName: live.highBidderName,
        highBidderTeamId: live.highBidderTeamId,
        squadLimit: state.squadLimit,
        overseasLimit: state.overseasLimit,
        initialBudget: state.settings?.budget || 120,
        randomFn: rng,
      });

      // Advance with simulated winner or unsold
      const interimState = {
        ...state,
        currentAuction: {
          ...live,
          currentBid: simRes.finalBid,
          highBidderId: simRes.winnerId,
          highBidderName: simRes.winnerName,
          highBidderTeamId: simRes.winnerTeamId,
        },
      };

      return localAuctionReducer(interimState, { type: 'RESOLVE_LOT', now });
    }

    case 'FAST_FORWARD': {
      if (!state || state.status !== 'active') return state;
      if (state.isFastForwarding) return state;

      const { now = Date.now() } = action;
      const live = state.currentAuction;
      const humanTeam = state.roomTeams.find((t) => t.userId === state.hostId);
      const humanTeamId = humanTeam?.teamId || '';

      const rng = createSeededRng(state.rngSeed + now);

      // Runs pure in-memory simulation for all remaining lots
      // Note: If human is leading on active lot, simulateRemainingAuction automatically awards it to human!
      const simResult = simulateRemainingAuction({
        playerOrder: state.playerOrder,
        currentPlayerIndex: state.currentPlayerIndex,
        currentLive: live,
        humanUserId: state.hostId,
        humanTeamId,
        teams: state.roomTeams,
        settings: state.settings,
        squadLimit: state.squadLimit,
        overseasLimit: state.overseasLimit,
        randomFn: rng,
      });

      const simulatedTeams = Array.isArray(simResult)
        ? simResult
        : simResult?.simulatedTeams || [];

      const updatedPlayers = state.players.map((p) => {
        const matchingTeam = simulatedTeams.find((t) => t.userId === p.id);
        if (!matchingTeam) return p;
        return {
          ...p,
          spent: matchingTeam.spent,
          squadCount: matchingTeam.squad?.length || 0,
        };
      });

      return {
        ...state,
        status: 'completed',
        roomTeams: simulatedTeams,
        teams: simulatedTeams,
        players: updatedPlayers,
        fastForwarded: true,
        isFastForwarding: false,
        currentPlayerIndex: state.playerOrder.length,
        currentAuction: {
          ...(live || {}),
          status: 'sold',
        },
        currentLot: {
          ...(live || {}),
          status: 'sold',
        },
        messages: [
          ...state.messages.slice(-50),
          {
            id: `ff_${now}`,
            text: 'Fast-Forward complete: Remaining lots were drafted by AI bots.',
            type: 'log',
            timestamp: now,
          },
        ],
      };
    }

    case 'END_AUCTION': {
      if (!state) return state;
      const { now = Date.now() } = action;
      return {
        ...state,
        status: 'completed',
        isFastForwarding: false,
        currentAuction: {
          ...(state.currentAuction || {}),
          status: 'sold',
        },
        currentLot: {
          ...(state.currentAuction || {}),
          status: 'sold',
        },
        messages: [
          ...state.messages.slice(-50),
          {
            id: `msg_end_${now}`,
            text: 'Auction COMPLETED by Admin.',
            type: 'log',
            timestamp: now,
          },
        ],
      };
    }

    case 'EXERCISE_RTM': {
      if (!state || state.status !== 'active') return state;
      const live = state.currentAuction;
      if (!live || live.status !== 'rtm_pending') return state;

      const player = IPL_PLAYERS.find((p) => p.id === live.playerId);
      if (!player) return state;

      const { now = Date.now(), humanUserId } = action;
      const buyerId = humanUserId || state.humanUser?.uid || state.hostId;
      const rtmTeam = state.roomTeams.find((t) => t.userId === buyerId || t.teamId === live.rtmTeamId);
      if (!rtmTeam) return state;

      const cost = live.currentBid;
      const updatedRoomTeams = state.roomTeams.map((t) => {
        if (t.teamId !== rtmTeam.teamId) return t;
        const newSquad = [
          ...(t.squad || []),
          {
            id: player.id,
            name: player.name,
            role: player.role,
            bid: cost,
            team: rtmTeam.teamId,
            matchedViaRTM: true,
          },
        ];
        return {
          ...t,
          squad: newSquad,
          spent: r2(toFiniteNumber(t.spent, 0) + cost),
          budgetRemaining: r2(Math.max(0, toFiniteNumber(t.budgetRemaining, 150) - cost)),
          rtmCards: Math.max(0, toFiniteNumber(t.rtmCards, 1) - 1),
        };
      });

      const updatedPlayers = state.players.map((p) => {
        if (p.id !== buyerId && p.team !== rtmTeam.teamId) return p;
        return {
          ...p,
          spent: r2(toFiniteNumber(p.spent, 0) + cost),
          squadCount: toFiniteNumber(p.squadCount, 0) + 1,
        };
      });

      const nextIndex = state.currentPlayerIndex + 1;
      const allDone = nextIndex >= state.playerOrder.length;
      const celebrationMs = 5000;

      return {
        ...state,
        status: allDone ? 'completed' : 'active',
        roomTeams: updatedRoomTeams,
        teams: updatedRoomTeams,
        players: updatedPlayers,
        currentAuction: {
          ...live,
          status: 'sold',
          currentBid: cost,
          highBidderId: buyerId,
          highBidderName: rtmTeam.teamName,
          highBidderTeamId: rtmTeam.teamId,
          isRTM: true,
          soldAt: now,
          celebrationUntil: now + celebrationMs,
          timerEndsAt: now + celebrationMs,
        },
        currentLot: {
          ...live,
          status: 'sold',
          currentBid: cost,
          highBidderId: buyerId,
          highBidderName: rtmTeam.teamName,
          highBidderTeamId: rtmTeam.teamId,
          isRTM: true,
          soldAt: now,
          celebrationUntil: now + celebrationMs,
          timerEndsAt: now + celebrationMs,
        },
        messages: [
          ...state.messages.slice(-50),
          {
            id: `rtm_sold_${now}`,
            text: `🔥 RTM EXERCISED! ${rtmTeam.teamName} matched the bid and signed ${player.name} for ₹${cost.toFixed(2)} Cr!`,
            type: 'sold_card',
            metadata: {
              playerId: player.id,
              teamId: rtmTeam.teamId,
              bid: cost,
              isRTM: true,
            },
            timestamp: now,
          },
        ],
      };
    }

    case 'PASS_RTM': {
      return localAuctionReducer(state, {
        type: 'RESOLVE_LOT',
        now: action.now || Date.now(),
        celebrate: true,
        ignoreRtm: true,
      });
    }

    case 'EXECUTE_TRADE': {
      if (!state) return state;
      const {
        teamAId,
        teamBId,
        playerA,
        playerB,
        cashFromA = 0,
        cashFromB = 0,
        now = Date.now(),
      } = action;

      const teamA = state.roomTeams.find((t) => t.teamId === teamAId);
      let teamB = state.roomTeams.find((t) => t.teamId === teamBId);

      if (!teamB) {
        const budget = state.settings?.budget || 150.0;
        const isMega = state.auctionType === 'mega' || !state.auctionType;
        const initState = isMega
          ? getTeamInitialState(teamBId, budget)
          : { budgetRemaining: budget, spent: 0, squad: [], rtmCards: 0 };
        const teamMeta = TEAMS.find((t) => t.id === teamBId);
        teamB = {
          teamId: teamBId,
          team: teamBId,
          teamName: teamMeta?.name || teamBId,
          shortName: teamMeta?.shortName || teamBId,
          userId: `bot_${teamBId}`,
          squad: initState.squad || [],
          budgetRemaining: initState.budgetRemaining ?? budget,
          spent: initState.spent ?? 0,
          rtmCards: initState.rtmCards ?? 0,
          squadCount: (initState.squad || []).length,
        };
      }

      const validation = validatePlayerTrade({
        teamA,
        teamB,
        playerA,
        playerB,
        cashFromA,
        cashFromB,
        squadLimit: state.squadLimit,
        overseasLimit: state.overseasLimit,
      });

      if (!validation.isValid) {
        return state;
      }

      const { teamA: updatedA, teamB: updatedB } = executePlayerTradeInSquads({
        teamA,
        teamB,
        playerA,
        playerB,
        cashFromA,
        cashFromB,
      });

      const hadTeamB = state.roomTeams.some((t) => t.teamId === teamBId);
      let updatedRoomTeams = state.roomTeams.map((t) => {
        if (t.teamId === teamAId) return updatedA;
        if (t.teamId === teamBId) return updatedB;
        return t;
      });
      if (!hadTeamB) {
        updatedRoomTeams.push(updatedB);
      }

      const updatedPlayers = state.players.map((p) => {
        if (p.team === teamAId) {
          return { ...p, spent: updatedA.spent, squadCount: updatedA.squadCount };
        }
        if (p.team === teamBId) {
          return { ...p, spent: updatedB.spent, squadCount: updatedB.squadCount };
        }
        return p;
      });

      const tradeDetails = `${playerA ? playerA.name : '₹' + cashFromA + ' Cr'} ⇄ ${playerB ? playerB.name : '₹' + cashFromB + ' Cr'}`;
      const tradeMsg = `🚨 MEGA TRADE COMPLETED: ${teamA.teamName} and ${teamB.teamName} exchanged ${tradeDetails}!`;

      return {
        ...state,
        roomTeams: updatedRoomTeams,
        teams: updatedRoomTeams,
        players: updatedPlayers,
        messages: [
          ...state.messages.slice(-50),
          {
            id: `trade_${now}`,
            text: tradeMsg,
            type: 'trade_alert',
            metadata: { teamAId, teamBId, playerA, playerB },
            timestamp: now,
          },
        ],
      };
    }

    case 'UPDATE_TEAM': {
      if (!state) return state;
      const { userId, newTeamId, customRetainedPlayerIds } = action;
      const isMega = state.auctionType === 'mega' || !state.auctionType;
      const budget = state.settings?.budget || 150.0;
      const teamDetails = TEAMS.find((t) => t.id === newTeamId) || TEAMS[0];

      const teamInit = isMega
        ? getCustomTeamRetainedState(newTeamId, customRetainedPlayerIds, budget)
        : { squad: [], squadCount: 0, spent: 0, budgetRemaining: budget, rtmCards: 0 };

      const updatedPlayers = state.players.map((p) =>
        p.id === userId
          ? {
              ...p,
              team: newTeamId,
              teamName: teamDetails.name,
              spent: teamInit.spent,
              squadCount: teamInit.squadCount,
            }
          : p,
      );

      const updatedRoomTeams = state.roomTeams.map((t) =>
        t.userId === userId
          ? {
              ...t,
              teamId: newTeamId,
              teamName: teamDetails.name,
              squad: teamInit.squad,
              squadCount: teamInit.squadCount,
              spent: teamInit.spent,
              budgetRemaining: teamInit.budgetRemaining,
              rtmCards: teamInit.rtmCards,
            }
          : t,
      );

      return {
        ...state,
        players: updatedPlayers,
        roomTeams: updatedRoomTeams,
        teams: updatedRoomTeams,
      };
    }

    case 'UPDATE_SETTINGS': {
      if (!state) return state;
      const { settings = {} } = action;
      return {
        ...state,
        settings: {
          ...state.settings,
          ...settings,
        },
      };
    }

    default:
      return state;
  }
}

/**
 * Storage helpers with schema versioning, safe try/catch, and LRU pruning.
 */

function getStorage() {
  if (typeof window !== 'undefined' && window.localStorage) {
    return window.localStorage;
  }
  return null;
}

export function loadLocalSoloRoom(roomId) {
  const storage = getStorage();
  if (!storage || !roomId) return null;

  try {
    const raw = storage.getItem(STORAGE_PREFIX + roomId);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.version !== SCHEMA_VERSION || !parsed.data) {
      return null;
    }
    return parsed.data;
  } catch (err) {
    console.warn(`[localEngine] Could not load local solo room ${roomId}:`, err);
    return null;
  }
}

export function saveLocalSoloRoom(roomIdOrState, stateArg, synced = false) {
  const storage = getStorage();
  if (!storage || !roomIdOrState) return false;

  let roomId = null;
  let state = null;
  let isSynced = Boolean(synced);

  if (typeof roomIdOrState === 'string') {
    roomId = roomIdOrState;
    state = stateArg;
  } else if (roomIdOrState && typeof roomIdOrState === 'object') {
    state = roomIdOrState;
    roomId = state.id;
    if (typeof stateArg === 'boolean') {
      isSynced = stateArg;
    }
  }

  if (!roomId || !state) return false;

  try {
    const record = {
      version: SCHEMA_VERSION,
      roomId,
      savedAt: Date.now(),
      synced: isSynced,
      data: state,
    };

    // Update LRU index
    let index = [];
    try {
      const indexRaw = storage.getItem(STORAGE_INDEX_KEY);
      if (indexRaw) index = JSON.parse(indexRaw) || [];
    } catch {
      index = [];
    }

    // Move roomId to end of LRU list
    index = index.filter((id) => id !== roomId);
    index.push(roomId);

    // Prune oldest if over MAX_SOLO_SAVES
    // Rule: LRU pruning must NEVER delete saves that are completed but not yet synced!
    while (index.length > MAX_SOLO_SAVES) {
      let candidateIndex = -1;
      for (let i = 0; i < index.length; i++) {
        const idToCheck = index[i];
        if (idToCheck === roomId) continue; // don't prune current save
        try {
          const rawCheck = storage.getItem(STORAGE_PREFIX + idToCheck);
          if (rawCheck) {
            const parsedCheck = JSON.parse(rawCheck);
            // If completed and not synced, DO NOT prune!
            if (parsedCheck?.data?.status === 'completed' && !parsedCheck?.synced) {
              continue;
            }
          }
          candidateIndex = i;
          break;
        } catch {
          candidateIndex = i;
          break;
        }
      }

      if (candidateIndex === -1) {
        // All other saves are protected unsynced saves; stop pruning
        break;
      }

      const [removedId] = index.splice(candidateIndex, 1);
      try {
        storage.removeItem(STORAGE_PREFIX + removedId);
      } catch {
        /* best-effort */
      }
    }

    storage.setItem(STORAGE_PREFIX + roomId, JSON.stringify(record));
    storage.setItem(STORAGE_INDEX_KEY, JSON.stringify(index));
    return true;
  } catch (err) {
    console.warn(`[localEngine] Could not save local solo room ${roomId}:`, err);
    return false;
  }
}

export function deleteLocalSoloRoom(roomId) {
  const storage = getStorage();
  if (!storage || !roomId) return;

  try {
    storage.removeItem(STORAGE_PREFIX + roomId);
    const indexRaw = storage.getItem(STORAGE_INDEX_KEY);
    if (indexRaw) {
      const index = JSON.parse(indexRaw) || [];
      storage.setItem(STORAGE_INDEX_KEY, JSON.stringify(index.filter((id) => id !== roomId)));
    }
  } catch (err) {
    console.warn(`[localEngine] Error deleting local solo room ${roomId}:`, err);
  }
}

/**
 * List device-local solo saves, newest first. Used by the History tab so a
 * player can resume a solo auction after leaving the room.
 */
export function listLocalSoloRooms() {
  const storage = getStorage();
  if (!storage) return [];

  let index = [];
  try {
    index = JSON.parse(storage.getItem(STORAGE_INDEX_KEY) || '[]') || [];
  } catch {
    index = [];
  }

  const rooms = [];
  index.forEach((roomId) => {
    try {
      const raw = storage.getItem(STORAGE_PREFIX + roomId);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!parsed || parsed.version !== SCHEMA_VERSION || !parsed.data) return;
      rooms.push({
        roomId: parsed.data.id || roomId,
        savedAt: parsed.savedAt || 0,
        synced: Boolean(parsed.synced),
        state: parsed.data,
      });
    } catch {
      // Corrupt row: skip it rather than blocking the whole list.
    }
  });

  return rooms.sort((a, b) => b.savedAt - a.savedAt);
}

/**
 * Rows for Supabase when a device-local auction ends. Mirrors the cloud flush
 * (auction + one team row per franchise) so the summary survives this device.
 */
export function buildSoloPersistPayload(state) {
  if (!state?.id) return null;
  const roomId = state.id;
  const teams = state.roomTeams || state.teams || [];
  const budget = toFiniteNumber(state.settings?.budget, 120);

  return {
    auction: {
      id: roomId,
      host_id: state.hostId || '',
      host_name: state.hostName || 'Manager',
      is_public: false,
      status: state.status || 'completed',
      auction_type: state.auctionType || 'mega',
      players: state.players || [],
      settings: { ...(state.settings || {}), server: 'local' },
      banned_players: [],
      overseas_limit: toFiniteNumber(state.overseasLimit, 8),
      squad_limit: toFiniteNumber(state.squadLimit, 25),
    },
    teams: teams.map((t) => ({
      id: `${roomId}_${t.userId}`,
      auction_id: roomId,
      user_id: t.userId || '',
      team_id: t.teamId || '',
      team_name: t.teamName || 'Unknown',
      budget_remaining: toFiniteNumber(t.budgetRemaining, budget),
      spent: toFiniteNumber(t.spent, 0),
      squad: t.squad || [],
    })),
  };
}

/**
 * Two-tab lease lock: Web Locks API with fallback heartbeat lease (5000ms).
 * Supports lock stealing (takeover) and onSteal notifications.
 */
export async function acquireSoloRoomLock(roomId, tabId = Math.random().toString(36).slice(2), onSteal = null) {
  let channel = null;
  if (typeof BroadcastChannel !== 'undefined') {
    try {
      channel = new BroadcastChannel(`crickauction_solo_tab_${roomId}`);
      channel.onmessage = (e) => {
        if (e.data?.type === 'takeover' && e.data?.tabId !== tabId) {
          if (onSteal) onSteal();
        }
      };
    } catch {
      // BroadcastChannel unavailable
    }
  }

  const broadcastTakeover = () => {
    try {
      channel?.postMessage({ type: 'takeover', tabId });
    } catch {
      // Ignore
    }
  };

  if (typeof navigator !== 'undefined' && navigator.locks?.request) {
    try {
      let releaseLock = null;
      const lockName = `crickauction_lock_${roomId}`;

      return await new Promise((resolve) => {
        navigator.locks.request(lockName, { ifAvailable: true }, async (lock) => {
          if (!lock) {
            try { channel?.close(); channel = null; } catch {}
            resolve({
              acquired: false,
              steal: async () => {
                try {
                  const ch = new BroadcastChannel(`crickauction_solo_tab_${roomId}`);
                  ch.postMessage({ type: 'takeover', tabId });
                  ch.close();
                } catch {}
                return await new Promise((resSteal) => {
                  navigator.locks.request(lockName, { steal: true }, async (stolenLock) => {
                    const stolenCh = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(`crickauction_solo_tab_${roomId}`) : null;
                    if (stolenCh && onSteal) {
                      stolenCh.onmessage = (e) => {
                        if (e.data?.type === 'takeover' && e.data?.tabId !== tabId) onSteal();
                      };
                    }
                    resSteal({
                      acquired: true,
                      release: async () => {
                        if (releaseLock) releaseLock();
                        try { stolenCh?.close(); } catch {}
                      },
                    });
                    await new Promise((r) => { releaseLock = r; });
                  });
                });
              },
              release: async () => {
                try { channel?.close(); } catch {}
              },
            });
            return;
          }

          resolve({
            acquired: true,
            release: async () => {
              if (releaseLock) releaseLock();
              try { channel?.close(); } catch {}
              await new Promise((r) => setTimeout(r, 20));
            },
          });

          try {
            await new Promise((r) => {
              releaseLock = r;
            });
          } finally {
            if (onSteal) onSteal();
          }
        });
      });
    } catch {
      // Fall back to storage heartbeat
    }
  }

  // Fallback: Heartbeat timestamp in localStorage
  const storage = getStorage();
  if (!storage) {
    return {
      acquired: true,
      release: async () => {
        try { channel?.close(); } catch {}
      },
    };
  }

  const lockKey = STORAGE_LOCK_PREFIX + roomId;
  const now = Date.now();
  const currentLockRaw = storage.getItem(lockKey);

  if (currentLockRaw) {
    try {
      const currentLock = JSON.parse(currentLockRaw);
      // 5-second lease: if still active by another tab, reject
      if (currentLock.tabId !== tabId && now - currentLock.timestamp < 5000) {
        try { channel?.close(); channel = null; } catch {}
        return {
          acquired: false,
          steal: async () => {
            try {
              const ch = new BroadcastChannel(`crickauction_solo_tab_${roomId}`);
              ch.postMessage({ type: 'takeover', tabId });
              ch.close();
            } catch {}
            storage.setItem(lockKey, JSON.stringify({ tabId, timestamp: Date.now() }));
            return {
              acquired: true,
              release: async () => {
                try { storage.removeItem(lockKey); } catch {}
              },
            };
          },
          release: async () => {
            try { channel?.close(); } catch {}
          },
        };
      }
    } catch {
      // Corrupt lock, take over
    }
  }

  // Claim lease
  storage.setItem(lockKey, JSON.stringify({ tabId, timestamp: now }));

  const heartbeat = setInterval(() => {
    storage.setItem(lockKey, JSON.stringify({ tabId, timestamp: Date.now() }));
  }, 2000);
  if (heartbeat.unref) heartbeat.unref();

  return {
    acquired: true,
    release: async () => {
      clearInterval(heartbeat);
      try { channel?.close(); } catch {}
      try {
        const cur = storage.getItem(lockKey);
        if (cur && JSON.parse(cur).tabId === tabId) {
          storage.removeItem(lockKey);
        }
      } catch {
        // Ignore
      }
    },
  };
}
