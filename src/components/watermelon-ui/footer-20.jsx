import React from 'react';
import { Link } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { ArrowUpRight, Globe } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { isUserAdmin } from '../../lib/adminAuth';

const staggerContainer = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.08,
      delayChildren: 0.04,
    },
  },
};

const riseItem = {
  hidden: { opacity: 0, y: 16 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { type: 'spring', duration: 0.5, bounce: 0 },
  },
};

const giantTextVariant = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { type: 'spring', duration: 0.7, bounce: 0 },
  },
};

export default function Footer20() {
  const currentYear = new Date().getFullYear();
  const { user } = useAuth();
  const isAdmin = isUserAdmin(user, import.meta.env.VITE_ADMIN_EMAIL);
  const shouldReduceMotion = useReducedMotion();

  const containerProps = shouldReduceMotion
    ? {}
    : {
        variants: staggerContainer,
        initial: 'hidden',
        whileInView: 'visible',
        viewport: { once: true, amount: 0.12 },
      };

  const itemProps = shouldReduceMotion ? {} : { variants: riseItem };
  const textProps = shouldReduceMotion ? {} : { variants: giantTextVariant };

  return (
    <motion.footer
      {...containerProps}
      className="relative w-full bg-transparent text-gray-400 font-sans overflow-hidden flex flex-col justify-between border-t border-white/[0.06] mt-20 sm:mt-32 z-10"
    >
      {/* Main content wrapper with dashed borders */}
      <div className="relative z-10 max-w-7xl w-full mx-auto px-6 md:px-12 lg:px-16 pt-16 md:pt-24 flex flex-col">
        {/* Top Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-8 mb-12 md:mb-16">
          {/* Left Column (Brand info) */}
          <motion.div
            {...itemProps}
            className="lg:col-span-5 xl:col-span-4 flex flex-col gap-5 md:gap-6"
          >
            {/* Logo */}
            <Link
              to="/"
              className="inline-flex items-center gap-2 font-pixel text-xl sm:text-2xl text-white select-none tracking-tight w-fit"
            >
              IplAuctoWorld
            </Link>

            {/* Description */}
            <p className="text-[14px] leading-relaxed text-gray-400 max-w-sm">
              The ultimate multiplayer IPL auction simulator and game. Host live
              IPL mega auctions with friends in real-time, choose your franchise,
              bid strategically, and build championship squads.
            </p>

            {/* Creator / Craft Attribution */}
            <div className="pt-2">
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-400">
                <span>
                  Crafted by{' '}
                  <span className="text-white font-bold">
                    Yashwanth N & Vishal Pujari
                  </span>
                </span>
              </span>
              <p className="text-[11px] text-gray-400 uppercase tracking-wider mt-2">
                © {currentYear} CrickAuction. All rights reserved.
              </p>
            </div>
          </motion.div>

          {/* Right Columns (Links Grid) */}
          <div className="lg:col-span-7 xl:col-span-8 grid grid-cols-2 sm:grid-cols-3 gap-8 md:gap-10">
            {/* Navigation Column */}
            <motion.div {...itemProps} className="flex flex-col gap-4">
              <span className="text-xs font-black uppercase tracking-[0.2em] text-white">
                Platform
              </span>
              <ul className="flex flex-col gap-2.5">
                <li>
                  <Link
                    to="/"
                    className="text-[14px] text-gray-400 hover:text-white transition-colors"
                  >
                    Home
                  </Link>
                </li>
                <li>
                  <Link
                    to="/guide"
                    className="text-[14px] text-gray-400 hover:text-white transition-colors"
                  >
                    Game Guide
                  </Link>
                </li>
                <li>
                  <Link
                    to="/about"
                    className="text-[14px] text-gray-400 hover:text-white transition-colors"
                  >
                    About Us
                  </Link>
                </li>
                {isAdmin && (
                  <li>
                    <Link
                      to="/admin"
                      className="text-[14px]  text-gray-400 hover:text-white font-semibold transition-colors"
                    >
                      Admin Dashboard
                    </Link>
                  </li>
                )}
              </ul>
            </motion.div>

            {/* Legal Column */}
            <motion.div {...itemProps} className="flex flex-col gap-4">
              <span className="text-xs font-black uppercase tracking-[0.2em] text-white">
                Legal
              </span>
              <ul className="flex flex-col gap-2.5">
                <li>
                  <Link
                    to="/terms"
                    className="text-[14px] text-gray-400 hover:text-white transition-colors"
                  >
                    Terms & Conditions
                  </Link>
                </li>
                <li>
                  <Link
                    to="/privacy"
                    className="text-[14px] text-gray-400 hover:text-white transition-colors"
                  >
                    Privacy Policy
                  </Link>
                </li>
                <li>
                  <Link
                    to="/credits"
                    className="text-[14px] text-gray-400 hover:text-white transition-colors"
                  >
                    Photo Credits
                  </Link>
                </li>
              </ul>
            </motion.div>

            {/* Developers Column */}
            <motion.div {...itemProps} className="flex flex-col gap-4 col-span-2 sm:col-span-1">
              <span className="text-xs font-black uppercase tracking-[0.2em] text-white">
                Developers
              </span>
              <ul className="flex flex-col gap-2.5">
                <li className="text-[14px] text-gray-300 font-semibold flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block"></span>
                  <span>Yashwanth N</span>
                </li>
                <li className="text-[14px] text-gray-300 font-semibold flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block"></span>
                  <span>Vishal Pujari</span>
                </li>
              </ul>
            </motion.div>
          </div>
        </div>

        {/* Non-Affiliation Legal Disclaimer */}
        <motion.div
          {...itemProps}
          className="pt-6 pb-8 border-t border-white/[0.06] text-xs text-gray-500 leading-relaxed max-w-4xl"
        >
          <p>
            <strong className="text-gray-400 font-medium">Disclaimer:</strong> IplAuctoWorld is an independent, fan-made tactical cricket simulation game developed strictly for educational and entertainment purposes. It is not affiliated with, endorsed by, sponsored by, or associated with the Board of Control for Cricket in India (BCCI), the Indian Premier League (IPL), or any participating franchise. All team names, logos, player names, and associated trademarks remain the sole intellectual property of their respective rights holders.
          </p>
        </motion.div>

        {/* Giant Watermark Text SVG */}
        <motion.div
          {...textProps}
          className="w-full flex justify-center md:mt-auto pb-0 select-none overflow-hidden"
        >
          <svg
            className="w-full h-auto select-none transition-colors duration-300"
            viewBox="0 32 1100 80"
            preserveAspectRatio="xMidYMid meet"
            aria-label="IPLAUCTOWORLD"
          >
            <defs>
              <linearGradient
                id="iplauctoworld-watermark-gradient"
                x1="0%"
                y1="0%"
                x2="0%"
                y2="100%"
              >
                <stop offset="0%" stopColor="#454b59" stopOpacity="0.4" />
                <stop offset="30%" stopColor="#2e333e" stopOpacity="0.25" />
                <stop offset="65%" stopColor="#1a1d24" stopOpacity="0.15" />
                <stop offset="100%" stopColor="#0c0e13" stopOpacity="0.04" />
              </linearGradient>
            </defs>
            <text
              x="0"
              y="130"
              dominantBaseline="alphabetic"
              textAnchor="start"
              textLength="100%"
              lengthAdjust="spacing"
              fill="url(#iplauctoworld-watermark-gradient)"
              className="font-pixel font-black tracking-tighter"
              fontSize="135"
            >
              IPLAUCTOWORLD
            </text>
          </svg>
        </motion.div>
      </div>
    </motion.footer>
  );
}

