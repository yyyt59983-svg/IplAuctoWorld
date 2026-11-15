import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Shield, Zap, Clock, AlertTriangle, ArrowRight, Award, CheckCircle2, X } from 'lucide-react';
import { TEAMS } from '../data/teams';
import { toFiniteNumber, formatCrores } from '../lib/auctionDisplay';

export default function RTMCardModal({
  isOpen,
  player,
  currentBid,
  highBidderName,
  highBidderTeamId,
  myTeam,
  rtmCardsLeft = 1,
  deadline,
  onMatch,
  onPass,
}) {
  const [timeLeft, setTimeLeft] = useState(12);

  useEffect(() => {
    if (!isOpen) return;
    const interval = setInterval(() => {
      if (deadline) {
        const remaining = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
        setTimeLeft(remaining);
        if (remaining <= 0) {
          clearInterval(interval);
          if (onPass) onPass();
        }
      } else {
        setTimeLeft((prev) => {
          if (prev <= 1) {
            clearInterval(interval);
            if (onPass) onPass();
            return 0;
          }
          return prev - 1;
        });
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [isOpen, deadline, onPass]);

  if (!isOpen || !player) return null;

  const myTeamObj = TEAMS.find((t) => t.id === (myTeam?.teamId || myTeam?.team));
  const rivalTeamObj = TEAMS.find((t) => t.id === highBidderTeamId);
  const cost = toFiniteNumber(currentBid, 0);
  const myBudget = toFiniteNumber(myTeam?.budgetRemaining, 0);
  const canAfford = myBudget >= cost;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md">
        <motion.div
          initial={{ opacity: 0, scale: 0.92, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.92, y: 20 }}
          transition={{ type: 'spring', damping: 25, stiffness: 350 }}
          className="relative w-full max-w-xl overflow-hidden rounded-3xl border border-amber-500/40 bg-gradient-to-b from-[#16140d] via-[#0e0f14] to-[#07080a] p-6 sm:p-8 text-white shadow-[0_25px_70px_rgba(245,158,11,0.25)]"
        >
          {/* Glowing Top Banner */}
          <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-96 h-48 bg-amber-500/20 blur-[90px] rounded-full pointer-events-none" />

          {/* Header */}
          <div className="flex items-center justify-between pb-4 border-b border-amber-500/20">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-400 to-amber-600 text-black shadow-lg shadow-amber-500/30">
                <Shield className="h-6 w-6 fill-current" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-black tracking-widest uppercase px-2 py-0.5 rounded-full bg-amber-400/20 text-amber-300 border border-amber-400/30">
                    IPL OFFICIAL RULE
                  </span>
                  <span className="text-xs text-amber-200/80 font-mono">
                    {rtmCardsLeft} {rtmCardsLeft === 1 ? 'CARD' : 'CARDS'} LEFT
                  </span>
                </div>
                <h2 className="text-lg sm:text-2xl font-pixel uppercase tracking-tight text-white mt-0.5">
                  RIGHT TO MATCH (RTM)
                </h2>
              </div>
            </div>

            {/* Countdown Badge */}
            <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 font-mono font-bold text-sm">
              <Clock className="w-4 h-4 animate-spin text-amber-400" />
              <span>{timeLeft}s</span>
            </div>
          </div>

          {/* Narrative text */}
          <p className="mt-4 text-xs sm:text-sm text-slate-300 leading-relaxed">
            <span className="font-bold text-white">{player.name}</span> previously played for{' '}
            <span className="font-bold text-amber-300">{myTeamObj?.name || 'Your Franchise'}</span>. As the original franchise, you hold the legal right to match the highest bid and bring them back!
          </p>

          {/* Duel stage */}
          <div className="mt-5 grid grid-cols-5 items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.02] p-4">
            {/* Winning Bidder */}
            <div className="col-span-2 text-center p-3 rounded-xl bg-black/40 border border-white/5">
              <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Top Bidder</div>
              <div className="font-pixel text-sm sm:text-base text-red-400 truncate mt-1">
                {rivalTeamObj?.shortName || highBidderName || 'Rival Team'}
              </div>
              <div className="text-xs font-mono text-slate-300 mt-1">Bid: ₹{formatCrores(cost)}</div>
            </div>

            {/* VS Icon */}
            <div className="col-span-1 flex flex-col items-center justify-center">
              <div className="h-8 w-8 rounded-full bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-300 text-xs font-black">
                VS
              </div>
            </div>

            {/* Your Franchise */}
            <div className="col-span-2 text-center p-3 rounded-xl bg-amber-500/10 border border-amber-500/30">
              <div className="text-[10px] uppercase font-bold text-amber-300 tracking-wider">Your Franchise</div>
              <div className="font-pixel text-sm sm:text-base text-white truncate mt-1">
                {myTeamObj?.shortName || 'You'}
              </div>
              <div className="text-xs font-mono text-amber-200 mt-1">
                Purse: ₹{formatCrores(myBudget)}
              </div>
            </div>
          </div>

          {/* Player Mini Dossier */}
          <div className="mt-4 flex items-center gap-4 p-3 rounded-2xl bg-white/[0.03] border border-white/10">
            {player.image ? (
              <img
                src={player.image}
                alt={player.name}
                className="w-14 h-14 rounded-xl object-cover border border-amber-500/30 bg-black/50"
              />
            ) : (
              <div className="w-14 h-14 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-300 font-pixel text-lg">
                {player.name?.[0]}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="text-sm sm:text-base font-bold text-white truncate">{player.name}</div>
              <div className="text-xs text-slate-400 flex items-center gap-2 mt-0.5">
                <span>{player.role}</span>
                <span>•</span>
                <span className="text-amber-300">{player.country || 'IND'}</span>
                {player.rating && (
                  <>
                    <span>•</span>
                    <span className="text-emerald-400 font-mono font-bold">★ {player.rating}</span>
                  </>
                )}
              </div>
            </div>
            <div className="text-right">
              <div className="text-[10px] text-slate-400 uppercase font-mono">Match Price</div>
              <div className="text-base sm:text-xl font-mono font-black text-amber-400">
                ₹{formatCrores(cost)}
              </div>
            </div>
          </div>

          {/* Affordability warning */}
          {!canAfford && (
            <div className="mt-3 flex items-center gap-2 p-2.5 rounded-xl bg-red-500/15 border border-red-500/30 text-red-300 text-xs">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>Insufficient purse (₹{formatCrores(myBudget)} available, ₹{formatCrores(cost)} needed).</span>
            </div>
          )}

          {/* Action CTAs */}
          <div className="mt-6 flex flex-col sm:flex-row items-center gap-3">
            <button
              onClick={onPass}
              className="w-full sm:w-1/3 py-3 px-4 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 hover:text-white font-bold text-xs uppercase tracking-wider transition-all"
            >
              Pass / Release
            </button>

            <button
              onClick={onMatch}
              disabled={!canAfford}
              className={`w-full sm:w-2/3 py-3 px-5 rounded-xl font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all ${
                canAfford
                  ? 'bg-gradient-to-r from-amber-400 via-amber-500 to-yellow-400 text-black hover:brightness-110 shadow-lg shadow-amber-500/25 active:scale-[0.98]'
                  : 'bg-white/10 text-gray-500 cursor-not-allowed border border-white/5'
              }`}
            >
              <Zap className="w-4 h-4 fill-current" />
              <span>EXERCISE RTM (MATCH ₹{formatCrores(cost)})</span>
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
