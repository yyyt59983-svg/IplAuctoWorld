import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeftRight, Check, X, Shield, IndianRupee, User, Sparkles, AlertCircle } from 'lucide-react';
import { TEAMS } from '../data/teams';
import { formatCrores, toFiniteNumber } from '../lib/auctionDisplay';

export default function IncomingTradeModal({
  isOpen,
  incomingTrades = [],
  myTeam,
  onAccept,
  onDecline,
  onClose,
}) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);

  // Focus on the first pending trade
  const activeTrade = incomingTrades && incomingTrades.length > 0 ? incomingTrades[0] : null;

  if (!isOpen || !activeTrade) return null;

  const senderTeamObj = TEAMS.find((t) => t.id === activeTrade.senderTeamId);
  const myTeamObj = TEAMS.find((t) => t.id === (myTeam?.teamId || myTeam?.team || activeTrade.receiverTeamId));

  const offered = activeTrade.playerOffered;
  const requested = activeTrade.playerRequested;
  const cashOffered = toFiniteNumber(activeTrade.cashOffered, 0);
  const cashRequested = toFiniteNumber(activeTrade.cashRequested, 0);

  // Net cash received by me (positive means I gain purse, negative means I pay purse)
  const netPurseChange = cashOffered - cashRequested;

  const handleAction = async (action) => {
    setIsProcessing(true);
    setErrorMsg(null);
    try {
      if (action === 'accept' && onAccept) {
        const res = await onAccept(activeTrade.id);
        if (res && !res.success) {
          setErrorMsg(res.reason || 'Failed to accept trade');
          setIsProcessing(false);
          return;
        }
      } else if (action === 'decline' && onDecline) {
        await onDecline(activeTrade.id);
      }
    } catch (err) {
      setErrorMsg(err.message || 'Operation failed');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/85 backdrop-blur-md overflow-y-auto">
        <motion.div
          initial={{ opacity: 0, scale: 0.94, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.94, y: 15 }}
          transition={{ type: 'spring', damping: 25, stiffness: 350 }}
          className="relative w-full max-w-2xl overflow-hidden rounded-3xl border border-cyan-500/40 bg-gradient-to-b from-[#0c1322] via-[#090d17] to-[#04060a] p-5 sm:p-7 text-white shadow-[0_25px_80px_rgba(6,182,212,0.3)]"
        >
          {/* Glowing Ambient Backdrop */}
          <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-96 h-48 bg-cyan-500/20 blur-[90px] rounded-full pointer-events-none" />

          {/* Header */}
          <div className="flex items-center justify-between pb-4 border-b border-cyan-500/20">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-400 to-blue-600 text-white shadow-lg shadow-cyan-500/30">
                <ArrowLeftRight className="h-6 w-6 animate-pulse" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-black tracking-widest uppercase px-2 py-0.5 rounded-full bg-cyan-400/20 text-cyan-300 border border-cyan-400/30">
                    INCOMING TRADE PROPOSAL
                  </span>
                  {incomingTrades.length > 1 && (
                    <span className="text-[10px] font-bold text-amber-300 bg-amber-500/15 border border-amber-500/30 px-2 py-0.5 rounded-full">
                      +{incomingTrades.length - 1} more pending
                    </span>
                  )}
                </div>
                <h2 className="text-lg sm:text-2xl font-pixel uppercase tracking-tight text-white mt-0.5">
                  TRADE OFFER FROM {activeTrade.senderTeamName || activeTrade.senderTeamId}
                </h2>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white transition-all cursor-pointer"
              title="Close and review later in Trade Center"
            >
              <X size={18} />
            </button>
          </div>

          {/* Proposer Information */}
          <div className="mt-4 flex items-center justify-between p-3 rounded-2xl bg-white/[0.03] border border-white/10">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-white/5 p-1 flex items-center justify-center border border-white/10">
                {senderTeamObj?.logo ? (
                  <img src={senderTeamObj.logo} alt={senderTeamObj.name} className="w-full h-full object-contain" />
                ) : (
                  <Shield className="w-6 h-6 text-cyan-400" />
                )}
              </div>
              <div>
                <div className="text-xs font-bold text-white flex items-center gap-1.5">
                  <span>{activeTrade.senderName || 'Manager'}</span>
                  <span className="text-[10px] text-slate-400">({senderTeamObj?.name || activeTrade.senderTeamId})</span>
                </div>
                <div className="text-[10px] text-slate-400 font-mono">
                  has proposed the following player transfer to your franchise ({myTeamObj?.name || myTeam?.teamName}):
                </div>
              </div>
            </div>
          </div>

          {/* Trade Offer Grid: What you GET vs What you GIVE */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 mt-4">
            {/* Left: What they are offering YOU */}
            <div className="p-4 rounded-2xl bg-emerald-950/20 border border-emerald-500/30 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-2 pb-1.5 border-b border-emerald-500/20">
                  <span className="text-[10px] font-black uppercase tracking-wider text-emerald-400 flex items-center gap-1">
                    <Sparkles size={12} /> YOU RECEIVE
                  </span>
                  {cashOffered > 0 && (
                    <span className="text-[10px] font-bold font-mono text-emerald-300">
                      +₹{formatCrores(cashOffered)} Cr Cash
                    </span>
                  )}
                </div>

                {offered ? (
                  <div className="flex items-center gap-3 mt-3">
                    <div className="w-14 h-14 rounded-xl bg-white/5 overflow-hidden border border-emerald-500/20 flex-shrink-0">
                      {offered.image ? (
                        <img src={offered.image} alt={offered.name} className="w-full h-full object-cover object-top" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-slate-500">
                          <User size={24} />
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-extrabold text-white truncate">{offered.name}</div>
                      <div className="text-[10px] text-emerald-400/90 font-semibold">{offered.role}</div>
                      <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                        Valuation: ₹{formatCrores(offered.cost || offered.soldPrice)} Cr
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="py-4 text-center text-xs text-slate-400 font-medium">
                    No player included (Cash-only offer)
                  </div>
                )}
              </div>

              {cashOffered > 0 && (
                <div className="mt-3 pt-2 border-t border-emerald-500/15 flex items-center justify-between text-xs text-emerald-300 font-semibold">
                  <span>Bonus Cash to your purse:</span>
                  <span className="font-mono font-extrabold">+₹{formatCrores(cashOffered)} Cr</span>
                </div>
              )}
            </div>

            {/* Right: What they want from YOU */}
            <div className="p-4 rounded-2xl bg-rose-950/20 border border-rose-500/30 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-2 pb-1.5 border-b border-rose-500/20">
                  <span className="text-[10px] font-black uppercase tracking-wider text-rose-400 flex items-center gap-1">
                    <ArrowLeftRight size={12} /> YOU SEND
                  </span>
                  {cashRequested > 0 && (
                    <span className="text-[10px] font-bold font-mono text-rose-300">
                      -₹{formatCrores(cashRequested)} Cr Cash
                    </span>
                  )}
                </div>

                {requested ? (
                  <div className="flex items-center gap-3 mt-3">
                    <div className="w-14 h-14 rounded-xl bg-white/5 overflow-hidden border border-rose-500/20 flex-shrink-0">
                      {requested.image ? (
                        <img src={requested.image} alt={requested.name} className="w-full h-full object-cover object-top" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-slate-500">
                          <User size={24} />
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-extrabold text-white truncate">{requested.name}</div>
                      <div className="text-[10px] text-rose-400/90 font-semibold">{requested.role}</div>
                      <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                        Valuation: ₹{formatCrores(requested.cost || requested.soldPrice)} Cr
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="py-4 text-center text-xs text-slate-400 font-medium">
                    No player requested
                  </div>
                )}
              </div>

              {cashRequested > 0 && (
                <div className="mt-3 pt-2 border-t border-rose-500/15 flex items-center justify-between text-xs text-rose-300 font-semibold">
                  <span>Deduction from your purse:</span>
                  <span className="font-mono font-extrabold">-₹{formatCrores(cashRequested)} Cr</span>
                </div>
              )}
            </div>
          </div>

          {/* Net Financial Impact Bar */}
          <div className="mt-3 px-4 py-2.5 rounded-xl bg-white/[0.02] border border-white/10 flex items-center justify-between text-xs">
            <span className="text-slate-400 font-medium">Net Purse Impact on Your Franchise:</span>
            <span
              className={`font-mono font-black ${
                netPurseChange > 0
                  ? 'text-emerald-400'
                  : netPurseChange < 0
                  ? 'text-rose-400'
                  : 'text-slate-300'
              }`}
            >
              {netPurseChange > 0
                ? `+₹${formatCrores(netPurseChange)} Cr (Purse Increases)`
                : netPurseChange < 0
                ? `-₹${formatCrores(Math.abs(netPurseChange))} Cr (Purse Decreases)`
                : '₹0.00 Cr (Straight Player Swap)'}
            </span>
          </div>

          {/* Error notice if action failed */}
          {errorMsg && (
            <div className="mt-3 p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
              <AlertCircle size={16} className="shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Action Buttons */}
          <div className="mt-5 flex gap-3">
            <button
              type="button"
              disabled={isProcessing}
              onClick={() => handleAction('decline')}
              className="flex-1 py-3 px-4 rounded-xl border border-rose-500/30 bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 font-bold text-xs uppercase tracking-wider transition-all disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2"
            >
              <X size={16} />
              <span>Decline Trade</span>
            </button>

            <button
              type="button"
              disabled={isProcessing}
              onClick={() => handleAction('accept')}
              className="flex-1 py-3 px-4 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-black text-xs uppercase tracking-wider shadow-lg shadow-emerald-500/25 transition-all disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2"
            >
              <Check size={16} strokeWidth={3} />
              <span>{isProcessing ? 'Processing Trade...' : 'Accept Trade Offer'}</span>
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
