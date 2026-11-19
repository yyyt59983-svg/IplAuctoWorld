import React, { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeftRight,
  Shield,
  Coins,
  CheckCircle2,
  AlertTriangle,
  X,
  Users,
  Sparkles,
  ChevronRight,
  TrendingUp,
  Check,
  Clock,
  User,
  Inbox,
  Send,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { TEAMS } from '../data/teams';
import { IPL_PLAYERS } from '../data/players';
import { toFiniteNumber, formatCrores, countOverseas, isOverseasPlayer } from '../lib/auctionDisplay';
import { validatePlayerTrade } from '../lib/auctionRules';
import { evaluateBotTrade } from '../lib/botEngine';
import { getTeamInitialState } from '../data/retentions';

/**
 * Hydrates squad entries (which may be raw IDs, retention objects, or auction purchases)
 * with complete player bio, role, country, image, and accurate valuation.
 */
const hydrateSquadList = (rawSquad) => {
  if (!Array.isArray(rawSquad)) return [];
  return rawSquad
    .map((entry) => {
      if (!entry) return null;
      const pid = typeof entry === 'string' ? entry : entry.id;
      if (!pid) return null;
      const baseInfo = IPL_PLAYERS.find((p) => String(p.id) === String(pid)) || {};
      const isRetained = Boolean(
        (typeof entry === 'object' && entry.isRetained) || baseInfo.isRetained
      );
      const cost = toFiniteNumber(
        entry.bid ?? entry.soldPrice ?? entry.retentionCost ?? entry.cost ?? baseInfo.basePrice,
        0
      );
      return {
        ...baseInfo,
        ...(typeof entry === 'object' ? entry : {}),
        id: pid,
        name: entry.name || baseInfo.name || `Player #${pid}`,
        role: entry.role || baseInfo.role || 'All-Rounder',
        country: entry.country || baseInfo.country || 'IND',
        image: entry.image || baseInfo.image || '',
        cost,
        bid: cost,
        soldPrice: cost,
        isRetained,
        isAuctionPurchase: !isRetained,
      };
    })
    .filter(Boolean);
};

export default function TradeCenterModal({
  isOpen,
  onClose,
  myTeam,
  allTeams = [],
  targetTeamId = null,
  incomingTrades = [],
  outgoingTrades = [],
  onExecuteTrade,
  onRespondToTrade,
  onCancelTrade,
}) {
  const [activeTab, setActiveTab] = useState('propose'); // 'propose' | 'pending'
  const myTeamId = myTeam?.teamId || myTeam?.team;
  const myTeamObj = TEAMS.find((t) => t.id === myTeamId) || TEAMS[0];

  // Rival teams list across ALL 10 IPL franchises (allows trading with ANY chosen franchise)
  const availableRivalTeams = useMemo(() => {
    return TEAMS.filter((meta) => meta.id !== myTeamId).map((meta) => {
      const foundInRoom = (allTeams || []).find((t) => (t.teamId || t.team) === meta.id);
      if (foundInRoom) {
        const effBudget = foundInRoom.budgetRemaining ?? Math.max(0, 150 - (foundInRoom.spent || 0));
        return {
          ...foundInRoom,
          teamId: meta.id,
          team: meta.id,
          teamName: foundInRoom.teamName || meta.name,
          shortName: meta.shortName || meta.id,
          budgetRemaining: effBudget,
          meta,
          isManagedInRoom: true,
        };
      }
      const defaultInit = getTeamInitialState(meta.id, 150);
      return {
        teamId: meta.id,
        team: meta.id,
        teamName: meta.name,
        shortName: meta.shortName || meta.id,
        userId: `bot_${meta.id}`,
        squad: defaultInit.squad,
        budgetRemaining: defaultInit.budgetRemaining,
        spent: defaultInit.spent,
        rtmCards: defaultInit.rtmCards,
        meta,
        isManagedInRoom: false,
      };
    });
  }, [allTeams, myTeamId]);

  const [selectedPartnerId, setSelectedPartnerId] = useState(
    targetTeamId || availableRivalTeams[0]?.teamId || 'MI'
  );
  const [selectedPlayerToGive, setSelectedPlayerToGive] = useState(null);
  const [selectedPlayerToReceive, setSelectedPlayerToReceive] = useState(null);
  const [cashFromMe, setCashFromMe] = useState(0);
  const [tradeStatus, setTradeStatus] = useState(null); // { type: 'success' | 'error', message: string }
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [processingTradeId, setProcessingTradeId] = useState(null);

  useEffect(() => {
    if (targetTeamId && availableRivalTeams.some((t) => t.teamId === targetTeamId)) {
      setSelectedPartnerId(targetTeamId);
      setSelectedPlayerToGive(null);
      setSelectedPlayerToReceive(null);
      setCashFromMe(0);
      setTradeStatus(null);
    }
  }, [targetTeamId, availableRivalTeams, isOpen]);

  const partnerTeam = useMemo(() => {
    const found = availableRivalTeams.find((t) => t.teamId === selectedPartnerId);
    return found || availableRivalTeams[0] || null;
  }, [availableRivalTeams, selectedPartnerId]);

  const partnerTeamObj = TEAMS.find((t) => t.id === (partnerTeam?.teamId || selectedPartnerId)) || TEAMS[1];
  const isPartnerBot = Boolean(
    !partnerTeam?.isManagedInRoom ||
    (partnerTeam?.userId && String(partnerTeam.userId).startsWith('bot_'))
  );

  // My squad list (fully hydrated: includes BOTH Retentions and live Auction Buys)
  const mySquad = useMemo(() => {
    return hydrateSquadList(myTeam?.squad);
  }, [myTeam?.squad]);

  // Partner squad list (fully hydrated: includes BOTH Retentions and live Auction Buys)
  const partnerSquad = useMemo(() => {
    return hydrateSquadList(partnerTeam?.squad);
  }, [partnerTeam?.squad]);

  // Real-time Trade Validation
  const validation = useMemo(() => {
    if (!myTeam || !partnerTeam) return { isValid: false, reason: 'Select franchises' };
    if (!selectedPlayerToGive && !selectedPlayerToReceive && cashFromMe === 0) {
      return { isValid: false, reason: 'Select at least one player or purse amount' };
    }
    return validatePlayerTrade({
      teamA: myTeam,
      teamB: partnerTeam,
      playerA: selectedPlayerToGive,
      playerB: selectedPlayerToReceive,
      cashFromA: cashFromMe,
      cashFromB: 0,
    });
  }, [myTeam, partnerTeam, selectedPlayerToGive, selectedPlayerToReceive, cashFromMe]);

  // Preview AI Coach sentiment (only for bot franchises)
  const coachSentiment = useMemo(() => {
    if (!isPartnerBot || !partnerTeam || (!selectedPlayerToGive && !selectedPlayerToReceive && cashFromMe === 0)) {
      return null;
    }
    return evaluateBotTrade({
      botTeam: partnerTeam,
      humanTeam: myTeam,
      playerOffered: selectedPlayerToGive,
      playerRequested: selectedPlayerToReceive,
      cashOffered: cashFromMe,
      cashRequested: 0,
    });
  }, [isPartnerBot, partnerTeam, myTeam, selectedPlayerToGive, selectedPlayerToReceive, cashFromMe]);

  const handleTradeSubmit = async () => {
    if (!validation.isValid) return;
    setIsSubmitting(true);
    setTradeStatus(null);

    try {
      if (onExecuteTrade) {
        const res = await onExecuteTrade({
          partnerTeamId: selectedPartnerId,
          playerOffered: selectedPlayerToGive,
          playerRequested: selectedPlayerToReceive,
          cashOffered: Number(cashFromMe) || 0,
          cashRequested: 0,
        });

        if (res?.success) {
          confetti({
            particleCount: 80,
            spread: 70,
            origin: { y: 0.6 },
          });
          setTradeStatus({
            type: 'success',
            message: res.message || 'Trade proposal successfully processed!',
          });
          setSelectedPlayerToGive(null);
          setSelectedPlayerToReceive(null);
          setCashFromMe(0);
        } else {
          setTradeStatus({
            type: 'error',
            message: res?.reason || 'Trade was declined by the franchise coach.',
          });
        }
      }
    } catch (err) {
      setTradeStatus({
        type: 'error',
        message: err.message || 'Failed to submit trade proposal.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRespond = async (tradeId, action) => {
    setProcessingTradeId(tradeId);
    try {
      if (onRespondToTrade) {
        await onRespondToTrade(tradeId, action);
      }
    } catch (e) {
      console.error('Failed to respond to trade', e);
    } finally {
      setProcessingTradeId(null);
    }
  };

  const handleCancel = async (tradeId) => {
    setProcessingTradeId(tradeId);
    try {
      if (onCancelTrade) {
        await onCancelTrade(tradeId);
      }
    } catch (e) {
      console.error('Failed to cancel trade', e);
    } finally {
      setProcessingTradeId(null);
    }
  };

  if (!isOpen) return null;

  const totalPending = (incomingTrades?.length || 0) + (outgoingTrades?.length || 0);

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center p-2 sm:p-5 pt-[max(0.75rem,env(safe-area-inset-top))] pb-[max(0.75rem,env(safe-area-inset-bottom))] bg-black/85 backdrop-blur-md overflow-y-auto overscroll-contain">
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 12 }}
          className="relative w-full max-w-4xl max-h-[92vh] sm:max-h-[88vh] flex flex-col rounded-3xl border border-cyan-500/30 bg-gradient-to-b from-[#0e1118] via-[#090b10] to-[#050608] p-3.5 sm:p-6 text-white shadow-[0_25px_80px_rgba(6,182,212,0.25)] my-auto overflow-hidden"
        >
          {/* Header - Fixed at Top */}
          <div className="flex items-center justify-between pb-3 border-b border-white/10 shrink-0">
            <div className="flex items-center gap-2.5 sm:gap-3">
              <div className="flex h-9 w-9 sm:h-11 sm:w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-400 to-blue-600 text-white shadow-lg shadow-cyan-500/30 shrink-0">
                <ArrowLeftRight className="h-5 w-5 sm:h-6 sm:w-6" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-[9px] sm:text-[10px] font-black tracking-widest uppercase px-2 py-0.5 rounded-full bg-cyan-400/20 text-cyan-300 border border-cyan-400/30">
                    TRANSFER WINDOW
                  </span>
                  <span className="text-[10px] sm:text-xs text-slate-400 font-mono hidden sm:inline">
                    PLAYER SWAP & CASH CONSIDERATIONS
                  </span>
                </div>
                <h2 className="text-base sm:text-2xl font-pixel uppercase tracking-tight text-white mt-0.5">
                  IPL TRADE CENTER
                </h2>
              </div>
            </div>

            <button
              onClick={onClose}
              className="p-1.5 sm:p-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white transition-all cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Navigation Tabs - Fixed at Top */}
          <div className="flex gap-2 mt-2.5 sm:mt-3 p-1 rounded-xl bg-white/[0.03] border border-white/10 shrink-0">
            <button
              type="button"
              onClick={() => setActiveTab('propose')}
              className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-bold uppercase tracking-wider transition-all cursor-pointer ${
                activeTab === 'propose'
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Propose Transfer
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('pending')}
              className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-bold uppercase tracking-wider transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                activeTab === 'pending'
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <span>Pending Proposals</span>
              {totalPending > 0 && (
                <span className="px-1.5 py-0.2 rounded-full text-[10px] font-black bg-cyan-400 text-slate-950">
                  {totalPending}
                </span>
              )}
            </button>
          </div>

          {activeTab === 'pending' ? (
            /* Pending Trades View */
            <div className="mt-4 space-y-4 min-h-[300px] max-h-[460px] overflow-y-auto pr-1 scrollbar-thin">
              {/* Incoming Offers */}
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Inbox size={15} className="text-cyan-400" />
                  <span className="text-xs font-bold uppercase tracking-wider text-white">
                    Incoming Trade Offers ({incomingTrades.length})
                  </span>
                </div>

                {incomingTrades.length === 0 ? (
                  <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/5 text-center text-xs text-slate-500 italic">
                    No pending trade offers received from other managers.
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {incomingTrades.map((trade) => {
                      const sTeam = TEAMS.find((t) => t.id === trade.senderTeamId);
                      const isPendingThis = processingTradeId === trade.id;
                      return (
                        <div
                          key={trade.id}
                          className="p-3.5 rounded-2xl bg-gradient-to-r from-cyan-950/30 to-blue-950/20 border border-cyan-500/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3"
                        >
                          <div className="space-y-1 min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-extrabold text-sm text-white">
                                {sTeam?.name || trade.senderTeamName || trade.senderTeamId}
                              </span>
                              <span className="text-[10px] text-slate-400">({trade.senderName || 'Manager'})</span>
                            </div>
                            <div className="text-xs text-slate-300 flex flex-wrap items-center gap-1.5">
                              <span className="text-emerald-400 font-bold">Offers:</span>
                              <span className="font-semibold text-white">
                                {trade.playerOffered ? trade.playerOffered.name : 'None'}
                              </span>
                              {trade.cashOffered > 0 && (
                                <span className="text-emerald-300 font-mono font-bold">
                                  (+₹{formatCrores(trade.cashOffered)} Cr)
                                </span>
                              )}
                              <span className="text-slate-500">⇄</span>
                              <span className="text-rose-400 font-bold">Wants:</span>
                              <span className="font-semibold text-white">
                                {trade.playerRequested ? trade.playerRequested.name : 'None'}
                              </span>
                              {trade.cashRequested > 0 && (
                                <span className="text-rose-300 font-mono font-bold">
                                  (-₹{formatCrores(trade.cashRequested)} Cr)
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-2 w-full sm:w-auto shrink-0">
                            <button
                              type="button"
                              disabled={isPendingThis}
                              onClick={() => handleRespond(trade.id, 'decline')}
                              className="flex-1 sm:flex-none py-1.5 px-3 rounded-xl border border-rose-500/30 bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 text-xs font-bold uppercase tracking-wider transition-all cursor-pointer"
                            >
                              Decline
                            </button>
                            <button
                              type="button"
                              disabled={isPendingThis}
                              onClick={() => handleRespond(trade.id, 'accept')}
                              className="flex-1 sm:flex-none py-1.5 px-4 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 text-slate-950 text-xs font-black uppercase tracking-wider shadow-md shadow-emerald-500/20 transition-all cursor-pointer"
                            >
                              {isPendingThis ? 'Processing...' : 'Accept Trade'}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Outgoing Offers */}
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Send size={15} className="text-cyan-400" />
                  <span className="text-xs font-bold uppercase tracking-wider text-white">
                    Sent Proposals Awaiting Decision ({outgoingTrades.length})
                  </span>
                </div>

                {outgoingTrades.length === 0 ? (
                  <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/5 text-center text-xs text-slate-500 italic">
                    No active proposals awaiting other managers.
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {outgoingTrades.map((trade) => {
                      const rTeam = TEAMS.find((t) => t.id === trade.receiverTeamId);
                      const isPendingThis = processingTradeId === trade.id;
                      return (
                        <div
                          key={trade.id}
                          className="p-3.5 rounded-2xl bg-white/[0.02] border border-white/10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3"
                        >
                          <div className="space-y-1 min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-bold text-slate-400">Proposal sent to:</span>
                              <span className="font-extrabold text-sm text-cyan-300">
                                {rTeam?.name || trade.receiverTeamName || trade.receiverTeamId}
                              </span>
                            </div>
                            <div className="text-xs text-slate-300 flex flex-wrap items-center gap-1.5">
                              <span>You offered:</span>
                              <span className="font-semibold text-white">
                                {trade.playerOffered ? trade.playerOffered.name : 'None'}
                              </span>
                              {trade.cashOffered > 0 && (
                                <span className="text-emerald-300 font-mono">
                                  (+₹{formatCrores(trade.cashOffered)} Cr)
                                </span>
                              )}
                              <span className="text-slate-500">⇄</span>
                              <span>For:</span>
                              <span className="font-semibold text-white">
                                {trade.playerRequested ? trade.playerRequested.name : 'None'}
                              </span>
                            </div>
                          </div>

                          <button
                            type="button"
                            disabled={isPendingThis}
                            onClick={() => handleCancel(trade.id)}
                            className="py-1.5 px-3 rounded-xl border border-white/10 hover:border-rose-500/30 hover:bg-rose-500/10 text-slate-400 hover:text-rose-300 text-xs font-bold uppercase tracking-wider transition-all cursor-pointer"
                          >
                            Cancel Proposal
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* Propose Transfer View */
            <div className="flex flex-col flex-1 min-h-0">
              {/* Scrollable Center Body */}
              <div className="flex-1 overflow-y-auto min-h-0 pr-1 mt-2.5 space-y-3 custom-scrollbar">
                {/* Target Franchise Highlight Banner */}
                <div className="p-3 rounded-2xl bg-gradient-to-r from-blue-950/40 via-cyan-950/25 to-black/60 border border-cyan-500/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shrink-0">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-white/5 border border-white/10 p-1.5 flex items-center justify-center shrink-0">
                      {partnerTeamObj?.logo ? (
                        <img
                          src={partnerTeamObj.logo}
                          alt={partnerTeamObj.name}
                          className="w-full h-full object-contain"
                        />
                      ) : (
                        <Shield className="w-5 h-5 text-cyan-400" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="text-[9px] uppercase font-bold text-cyan-400 tracking-wider">
                        Target Trading Franchise
                      </div>
                      <div className="font-extrabold text-sm sm:text-base text-white truncate">
                        {partnerTeamObj?.name || selectedPartnerId}
                      </div>
                      <div className="text-[10px] text-slate-400 font-mono">
                        Squad: {partnerTeam?.squad?.length || 0}/25 players
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2.5 sm:gap-4 w-full sm:w-auto justify-between sm:justify-end shrink-0">
                    <div className="text-left sm:text-right">
                      <div className="text-[9px] text-slate-400 uppercase font-mono">Purse</div>
                      <div className="text-xs sm:text-sm font-mono font-bold text-cyan-300">
                        ₹{formatCrores(partnerTeam?.budgetRemaining)} Cr
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <span className="text-[9px] text-slate-500 uppercase font-bold hidden sm:inline">
                        Switch:
                      </span>
                      <select
                        value={selectedPartnerId}
                        onChange={(e) => {
                          setSelectedPartnerId(e.target.value);
                          setSelectedPlayerToReceive(null);
                          setTradeStatus(null);
                        }}
                        className="bg-[#0b0e14] border border-cyan-500/40 text-cyan-300 text-xs font-bold py-1.5 px-2.5 rounded-xl cursor-pointer focus:outline-none"
                        title="Switch target team"
                      >
                        {availableRivalTeams.map((t) => (
                          <option key={t.teamId} value={t.teamId} className="bg-[#0b0e14] text-white">
                            {t.meta?.shortName || t.teamId} - {t.teamName}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                {/* Trading Workbench: Split Screen */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
                {/* Left: Your Squad */}
                <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 flex flex-col">
                  <div className="flex items-center justify-between pb-2 border-b border-white/5">
                    <div>
                      <span className="text-[10px] uppercase font-bold text-cyan-400">Your Squad</span>
                      <div className="font-bold text-sm text-white">{myTeamObj.name}</div>
                    </div>
                    <div className="text-right text-xs font-mono text-slate-300">
                      Purse: ₹{formatCrores(myTeam?.budgetRemaining)} Cr
                    </div>
                  </div>

                  <div className="mt-3 flex-1 min-h-[160px] max-h-[220px] overflow-y-auto space-y-1.5 pr-1 scrollbar-thin">
                    {mySquad.length === 0 ? (
                      <div className="h-full flex items-center justify-center text-xs text-slate-500 italic py-6">
                        No players in squad to offer
                      </div>
                    ) : (
                      mySquad.map((player) => {
                        const isSelected = selectedPlayerToGive?.id === player.id;
                        return (
                          <div
                            key={player.id}
                            onClick={() => setSelectedPlayerToGive(isSelected ? null : player)}
                            className={`flex items-center justify-between p-2.5 rounded-xl border cursor-pointer transition-all ${
                              isSelected
                                ? 'bg-cyan-500/20 border-cyan-400 shadow-sm'
                                : 'bg-white/[0.02] border-white/5 hover:border-white/15'
                            }`}
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <div className="w-8 h-8 rounded-lg bg-black/40 border border-white/10 flex items-center justify-center text-xs font-bold font-mono overflow-hidden shrink-0">
                                {player.image ? (
                                  <img src={player.image} alt={player.name} className="w-full h-full object-cover object-top" />
                                ) : (
                                  <span>{player.name?.[0] || '🏏'}</span>
                                )}
                              </div>
                              <div className="min-w-0">
                                <div className="text-xs font-bold text-white truncate">{player.name}</div>
                                <div className="text-[10px] text-slate-400 flex items-center gap-1.5 flex-wrap">
                                  <span>{player.role}</span>
                                  {player.country && player.country !== 'IND' && (
                                    <span className="text-[8.5px] px-1 py-0.2 rounded bg-blue-500/20 text-blue-300 font-mono">✈️ OS</span>
                                  )}
                                  {player.isRetained ? (
                                    <span className="text-amber-400 font-bold text-[8.5px] px-1 py-0.2 rounded bg-amber-400/10 border border-amber-400/20">
                                      ⭐ RETAINED
                                    </span>
                                  ) : (
                                    <span className="text-emerald-400 font-bold text-[8.5px] px-1 py-0.2 rounded bg-emerald-400/10 border border-emerald-400/20">
                                      🔨 AUCTION BUY
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                            <div className="text-right text-xs font-mono font-bold text-cyan-300 shrink-0">
                              ₹{formatCrores(player.cost || player.bid || player.soldPrice || player.retentionCost || player.basePrice)} Cr
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>

                  {selectedPlayerToGive && (
                    <div className="mt-3 p-2 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-xs flex items-center justify-between">
                      <span className="text-slate-300">Offering:</span>
                      <span className="font-bold text-cyan-300">{selectedPlayerToGive.name}</span>
                    </div>
                  )}
                </div>

                {/* Right: Partner Squad */}
                <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 flex flex-col">
                  <div className="flex items-center justify-between pb-2 border-b border-white/5">
                    <div>
                      <span className="text-[10px] uppercase font-bold text-blue-400">Target Franchise</span>
                      <div className="font-bold text-sm text-white">{partnerTeamObj.name}</div>
                    </div>
                    <div className="text-right text-xs font-mono text-slate-300">
                      Purse: ₹{formatCrores(partnerTeam?.budgetRemaining)} Cr
                    </div>
                  </div>

                  <div className="mt-3 flex-1 min-h-[160px] max-h-[220px] overflow-y-auto space-y-1.5 pr-1 scrollbar-thin">
                    {partnerSquad.length === 0 ? (
                      <div className="h-full flex items-center justify-center text-xs text-slate-500 italic py-6">
                        No players in target squad
                      </div>
                    ) : (
                      partnerSquad.map((player) => {
                        const isSelected = selectedPlayerToReceive?.id === player.id;
                        return (
                          <div
                            key={player.id}
                            onClick={() => setSelectedPlayerToReceive(isSelected ? null : player)}
                            className={`flex items-center justify-between p-2.5 rounded-xl border cursor-pointer transition-all ${
                              isSelected
                                ? 'bg-blue-500/20 border-blue-400 shadow-sm'
                                : 'bg-white/[0.02] border-white/5 hover:border-white/15'
                            }`}
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <div className="w-8 h-8 rounded-lg bg-black/40 border border-white/10 flex items-center justify-center text-xs font-bold font-mono overflow-hidden shrink-0">
                                {player.image ? (
                                  <img src={player.image} alt={player.name} className="w-full h-full object-cover object-top" />
                                ) : (
                                  <span>{player.name?.[0] || '🏏'}</span>
                                )}
                              </div>
                              <div className="min-w-0">
                                <div className="text-xs font-bold text-white truncate">{player.name}</div>
                                <div className="text-[10px] text-slate-400 flex items-center gap-1.5 flex-wrap">
                                  <span>{player.role}</span>
                                  {player.country && player.country !== 'IND' && (
                                    <span className="text-[8.5px] px-1 py-0.2 rounded bg-blue-500/20 text-blue-300 font-mono">✈️ OS</span>
                                  )}
                                  {player.isRetained ? (
                                    <span className="text-amber-400 font-bold text-[8.5px] px-1 py-0.2 rounded bg-amber-400/10 border border-amber-400/20">
                                      ⭐ RETAINED
                                    </span>
                                  ) : (
                                    <span className="text-emerald-400 font-bold text-[8.5px] px-1 py-0.2 rounded bg-emerald-400/10 border border-emerald-400/20">
                                      🔨 AUCTION BUY
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                            <div className="text-right text-xs font-mono font-bold text-blue-300 shrink-0">
                              ₹{formatCrores(player.cost || player.bid || player.soldPrice || player.retentionCost || player.basePrice)} Cr
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>

                  {selectedPlayerToReceive && (
                    <div className="mt-3 p-2 rounded-xl bg-blue-500/10 border border-blue-500/30 text-xs flex items-center justify-between">
                      <span className="text-slate-300">Receiving:</span>
                      <span className="font-bold text-blue-300">{selectedPlayerToReceive.name}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Cash consideration adjustment */}
              <div className="mt-4 p-3 rounded-2xl bg-white/[0.02] border border-white/10 flex flex-col sm:flex-row items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Coins className="w-5 h-5 text-amber-400" />
                  <div>
                    <div className="text-xs font-bold text-white">Extra Purse Consideration Offered</div>
                    <div className="text-[10px] text-slate-400">Sweeten the trade deal by transferring purse funds</div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {[0, 1.0, 2.5, 5.0].map((amt) => (
                    <button
                      key={amt}
                      onClick={() => setCashFromMe(amt)}
                      className={`px-3 py-1 rounded-xl text-xs font-mono font-bold border transition-all cursor-pointer ${
                        cashFromMe === amt
                          ? 'bg-amber-400 text-black border-amber-400 shadow-md shadow-amber-400/20'
                          : 'bg-white/5 border-white/10 text-slate-300 hover:border-white/20'
                      }`}
                    >
                      {amt === 0 ? 'None' : `+₹${amt} Cr`}
                    </button>
                  ))}
                </div>
              </div>

              {/* Coach Sentiment or Human Player Notification */}
              {isPartnerBot ? (
                coachSentiment && (
                  <div className="mt-3 p-3 rounded-2xl bg-blue-950/20 border border-blue-500/30 flex items-start gap-3">
                    <Sparkles className="w-5 h-5 text-cyan-400 shrink-0 mt-0.5" />
                    <div>
                      <div className="text-[10px] uppercase font-bold text-cyan-300">
                        {partnerTeamObj.botName || 'Franchise Management'} Assessment
                      </div>
                      <div className="text-xs text-slate-200 mt-0.5 italic">{coachSentiment.message}</div>
                    </div>
                  </div>
                )
              ) : (
                <div className="mt-3 p-3 rounded-2xl bg-cyan-950/20 border border-cyan-500/30 flex items-start gap-3">
                  <Shield className="w-5 h-5 text-cyan-400 shrink-0 mt-0.5" />
                  <div>
                    <div className="text-[10px] uppercase font-bold text-cyan-300">
                      Human Franchise Owner: {partnerTeamObj.name}
                    </div>
                    <div className="text-xs text-slate-200 mt-0.5">
                      This franchise is managed by another player. Submitting this proposal will prompt the owner to Review, Accept, or Decline the trade.
                    </div>
                  </div>
                </div>
              )}

              {/* Trade status alert */}
              {tradeStatus && (
                <div
                  className={`mt-3 p-3 rounded-2xl text-xs flex items-center gap-2.5 border ${
                    tradeStatus.type === 'success'
                      ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-200'
                      : 'bg-red-500/15 border-red-500/40 text-red-200'
                  }`}
                >
                  {tradeStatus.type === 'success' ? (
                    <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-400" />
                  ) : (
                    <AlertTriangle className="w-5 h-5 shrink-0 text-red-400" />
                  )}
                  <span>{tradeStatus.message}</span>
                </div>
              )}

              </div>

              {/* Submission Action - Pinned at bottom */}
              <div className="mt-3 pt-3 border-t border-white/10 flex items-center justify-between gap-2.5 shrink-0">
                <div className="text-[11px] sm:text-xs text-slate-400 min-w-0 flex-1 truncate">
                  {validation.isValid ? (
                    <span className="text-emerald-400 flex items-center gap-1 font-bold">
                      <CheckCircle2 className="w-3.5 h-3.5 shrink-0" /> Valid Deal
                    </span>
                  ) : (
                    <span className="text-amber-400 flex items-center gap-1 truncate">
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> {validation.reason}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={onClose}
                    className="py-2 px-3 sm:px-4 rounded-xl bg-white/5 hover:bg-white/10 text-xs font-bold uppercase tracking-wider text-slate-300 hover:text-white transition-all cursor-pointer"
                  >
                    Close
                  </button>

                  <button
                    onClick={handleTradeSubmit}
                    disabled={!validation.isValid || isSubmitting}
                    className={`py-2 px-4 sm:px-6 rounded-xl text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 sm:gap-2 transition-all cursor-pointer ${
                      validation.isValid && !isSubmitting
                        ? 'bg-gradient-to-r from-cyan-400 to-blue-500 text-white hover:brightness-110 shadow-lg shadow-cyan-500/25 active:scale-[0.98]'
                        : 'bg-white/10 text-gray-500 cursor-not-allowed border border-white/5'
                    }`}
                  >
                    <ArrowLeftRight className="w-3.5 h-3.5" />
                    <span>
                      {isSubmitting
                        ? 'Processing...'
                        : isPartnerBot
                        ? 'CONFIRM TRADE'
                        : 'PROPOSE TRADE'}
                    </span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
