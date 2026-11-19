import React from 'react';
import { Link } from 'react-router-dom';

const Navbar = () => {
  return (
    <header className="relative z-50 w-full bg-transparent border-none pt-[max(0.25rem,env(safe-area-inset-top))]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-13 sm:h-15 flex items-center justify-between">
        {/* Website Name and Favicon on the Left */}
        <Link
          to="/"
          className="flex items-center gap-2 sm:gap-2.5 font-pixel text-lg sm:text-xl md:text-2xl tracking-tight text-white select-none group"
          aria-label="IplAuctoWorld Home"
        >
          <img
            src="/favicon.svg"
            alt="IplAuctoWorld Cricket Ball"
            width="28"
            height="28"
            className="w-6 h-6 sm:w-7 sm:h-7 object-contain drop-shadow-[0_2px_8px_rgba(220,38,38,0.4)] group-hover:rotate-12 transition-transform duration-300 shrink-0"
          />
          <span>IplAuctoWorld</span>
        </Link>

        {/* Creators Badge on the Right */}
        <div className="flex items-center gap-2">
          <div className="inline-flex items-center gap-2 bg-[#050505]/40 backdrop-blur-md border border-white/10 px-3 py-1.5 rounded-full shadow-sm">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
            <span className="text-[10px] sm:text-[11px] font-black text-gray-200 uppercase tracking-wider">
              Yashwanth N & Vishal Pujari
            </span>
          </div>
        </div>
      </div>
    </header>
  );
};

export default Navbar;
