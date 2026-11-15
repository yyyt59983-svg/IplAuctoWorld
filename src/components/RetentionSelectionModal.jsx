import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Shield,
  Star,
  Check,
  X,
  Coins,
  Sparkles,
  Info,
  CheckCircle2,
  AlertCircle,
  RotateCcw,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { TEAMS } from '../data/teams';
import { getRetentionCandidates, getCustomTeamRetainedState, TOTAL_MEGA_PURSE } from '../data/retentions';
import { formatCrores, toFiniteNumber } from '../lib/auctionDisplay';

export default function RetentionSelectionModal({
  isOpen,
  teamId,
  currentRetainedIds = null,
  onConfirm,
  onClose,
}) {
  const teamMeta = useMemo(() => {
    return TEAMS.find((t) => t.id === teamId) || TEAMS[0];
  }, [teamId]);

  const candidates = useMemo(() => {
    return teamId ? getRetentionCandidates(teamId) : [];
  }, [teamId]);

  // Initial selection: if currentRetainedIds is given, use it; otherwise default to all candidates
  const [selectedIds, setSelectedIds] = useState([]);

  useEffect(() => {
    if (isOpen && teamId) {
      if (Array.isArray(currentRetainedIds)) {
        setSelectedIds(currentRetainedIds);
      } else {
        // Default to all official candidates for this team
        setSelectedIds(candidates.map((c) => c.id));
      }
    }
  }, [isOpen, teamId, currentRetainedIds, candidates]);

  const togglePlayer = (playerId) => {
    setSelectedIds((prev) => {
      if (prev.includes(playerId)) {
        return prev.filter((id) => id !== playerId);
      }
      if (prev.length >= 6) {
        return prev; // Maximum 6 retentions
      }
      return [...prev, playerId];
    });
  };

  const selectAll = () => {
    setSelectedIds(candidates.slice(0, 6).map((c) => c.id));
  };

  const clearAll = () => {
    setSelectedIds([]);
  };

  const customState = useMemo(() => {
    if (!teamId) return { squad: [], spent: 0, budgetRemaining: 150, rtmCards: 6 };
    return getCustomTeamRetainedState(teamId, selectedIds, TOTAL_MEGA_PURSE);
  }, [teamId, selectedIds]);

  const handleConfirm = () => {
    confetti({
      particleCount: 50,
      spread: 60,
      origin: { y: 0.7 },
    });
    if (onConfirm) {
      onConfirm({
        teamId,
        selectedPlayerIds: selectedIds,
        customState,
      });
    }
  };

  if (!isOpen || !teamId) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/85 backdrop-blur-md overflow-y-auto">
        <motion.div
          initial={{ opacity: 0, scale: 0.94, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.94, y: 15 }}
          className="relative w-full max-w-3xl overflow-hidden rounded-3xl border border-amber-500/30 bg-gradient-to-b from-[#14120e] via-[#0d0e12] to-[#07080a] p-5 sm:p-7 text-white shadow-[0_25px_80px_rgba(245,158,11,0.2)]"
        >
          {/* Header */}
          <div className="flex items-center justify-between pb-4 border-b border-white/10">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-amber-400/10 border border-amber-400/30 p-2 flex items-center justify-center shrink-0">
                <img
                  src={teamMeta.logo}
                  alt={teamMeta.name}
                  className="w-full h-full object-contain"
                />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-black tracking-widest uppercase px-2 py-0.5 rounded-full bg-amber-400/20 text-amber-300 border border-amber-400/30">
                    FRANCHISE STRATEGY
                  </span>
                  <span className="text-xs text-slate-400 font-mono">SELECT CORE STARS</span>
                </div>
                <h2 className="text-lg sm:text-2xl font-pixel uppercase tracking-tight text-white mt-0.5">
                  RETAIN PLAYERS FOR {teamMeta.name}
                </h2>
              </div>
            </div>

            {onClose && (
              <button
                onClick={onClose}
                className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white transition-all cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>

          {/* Description & quick-select toolbar */}
          <div className="mt-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-white/[0.02] border border-white/5 p-3 rounded-2xl">
            <p className="text-xs text-slate-300 leading-relaxed max-w-lg">
              Choose which players you want to lock into your squad before the auction. Non-retained players enter the auction pool and reward you with extra <span className="text-amber-300 font-bold">RTM Cards</span>!
            </p>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={selectAll}
                className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-[10px] font-black uppercase text-slate-300 hover:text-white transition-all cursor-pointer"
              >
                Select All
              </button>
              <button
                type="button"
                onClick={clearAll}
                className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-[10px] font-black uppercase text-slate-300 hover:text-white transition-all cursor-pointer"
              >
                Release All
              </button>
            </div>
          </div>

          {/* Candidates Grid */}
          <div className="mt-4 max-h-[320px] overflow-y-auto pr-1 space-y-2.5 scrollbar-thin">
            {candidates.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-500 italic">
                No official pre-configured retention candidates found for this franchise.
              </div>
            ) : (
              candidates.map((player) => {
                const isSelected = selectedIds.includes(player.id);
                return (
                  <div
                    key={player.id}
                    onClick={() => togglePlayer(player.id)}
                    className={`flex items-center justify-between p-3 rounded-2xl border transition-all cursor-pointer select-none ${
                      isSelected
                        ? 'bg-amber-500/10 border-amber-400/50 shadow-sm shadow-amber-500/10'
                        : 'bg-white/[0.02] border-white/5 hover:border-white/15 hover:bg-white/[0.04]'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {/* Checkbox badge */}
                      <div
                        className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 border transition-all ${
                          isSelected
                            ? 'bg-amber-400 border-amber-400 text-black'
                            : 'border-white/20 bg-black/40'
                        }`}
                      >
                        {isSelected && <Check className="w-4 h-4 stroke-[3]" />}
                      </div>

                      {/* Player Image */}
                      {player.image ? (
                        <img
                          src={player.image}
                          alt={player.name}
                          className="w-12 h-12 rounded-xl object-cover bg-black/40 border border-white/10 shrink-0"
                        />
                      ) : (
                        <div className="w-12 h-12 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-300 font-pixel text-base shrink-0">
                          {player.name?.[0]}
                        </div>
                      )}

                      {/* Bio */}
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <h4 className="text-sm font-bold text-white truncate">{player.name}</h4>
                          {player.isUncapped ? (
                            <span className="text-[8px] font-black uppercase px-1.5 py-0.2 rounded bg-blue-500/20 text-blue-300 border border-blue-500/30">
                              UNCAPPED
                            </span>
                          ) : (
                            <span className="text-[8px] font-black uppercase px-1.5 py-0.2 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30">
                              CAPPED
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-400 flex items-center gap-2 mt-0.5">
                          <span>{player.role}</span>
                          <span>•</span>
                          <span>{player.country}</span>
                          {player.stats?.matches && (
                            <>
                              <span>•</span>
                              <span className="font-mono">{player.stats.matches} matches</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Cost */}
                    <div className="text-right shrink-0">
                      <div className="text-[10px] text-slate-400 uppercase font-mono">Retention Cost</div>
                      <div
                        className={`text-sm sm:text-base font-mono font-bold ${
                          isSelected ? 'text-amber-300' : 'text-slate-400'
                        }`}
                      >
                        ₹{formatCrores(player.cost)} Cr
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Real-time Summary Cards */}
          <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <div className="p-3 rounded-xl bg-white/[0.03] border border-white/5">
              <span className="text-[9px] font-bold text-slate-400 uppercase block mb-0.5">Retained</span>
              <span className="text-base font-pixel text-white">
                {selectedIds.length} <span className="text-xs text-slate-500 font-mono">/ 6 max</span>
              </span>
            </div>

            <div className="p-3 rounded-xl bg-white/[0.03] border border-white/5">
              <span className="text-[9px] font-bold text-slate-400 uppercase block mb-0.5">Purse Spent</span>
              <span className="text-base font-mono font-bold text-amber-300">
                ₹{formatCrores(customState.spent)} Cr
              </span>
            </div>

            <div className="p-3 rounded-xl bg-white/[0.03] border border-white/5">
              <span className="text-[9px] font-bold text-slate-400 uppercase block mb-0.5">Remaining Purse</span>
              <span className="text-base font-mono font-bold text-emerald-400">
                ₹{formatCrores(customState.budgetRemaining)} Cr
              </span>
            </div>

            <div className="p-3 rounded-xl bg-white/[0.03] border border-white/5">
              <span className="text-[9px] font-bold text-slate-400 uppercase block mb-0.5">RTM Cards Gained</span>
              <span className="text-base font-pixel text-cyan-300">
                {customState.rtmCards} <span className="text-xs font-mono text-cyan-400/80">Cards</span>
              </span>
            </div>
          </div>

          {/* Action CTAs */}
          <div className="mt-6 flex flex-col sm:flex-row items-center justify-between gap-3 pt-3 border-t border-white/10">
            <div className="text-xs text-slate-400">
              {selectedIds.length === 0 ? (
                <span className="text-cyan-300 font-semibold">
                  Starting with full ₹150 Cr purse and max 6 RTM cards!
                </span>
              ) : (
                <span>
                  Retaining <strong className="text-white">{selectedIds.length}</strong> core players.
                </span>
              )}
            </div>

            <div className="flex items-center gap-3 w-full sm:w-auto">
              {onClose && (
                <button
                  type="button"
                  onClick={onClose}
                  className="w-full sm:w-auto py-2.5 px-4 rounded-xl bg-white/5 hover:bg-white/10 text-xs font-bold uppercase tracking-wider text-slate-300 hover:text-white transition-all cursor-pointer"
                >
                  Cancel
                </button>
              )}

              <button
                type="button"
                onClick={handleConfirm}
                className="w-full sm:w-auto py-2.5 px-6 rounded-xl font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 bg-gradient-to-r from-amber-400 via-amber-500 to-yellow-400 text-black hover:brightness-110 shadow-lg shadow-amber-500/25 active:scale-[0.98] transition-all cursor-pointer"
              >
                <CheckCircle2 className="w-4 h-4 fill-current" />
                <span>CONFIRM RETENTIONS</span>
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
