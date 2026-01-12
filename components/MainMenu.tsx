
import React from 'react';
import { motion } from 'framer-motion';

interface MainMenuProps {
  onStartGame: (players: 2 | 4) => void;
}

export const MainMenu: React.FC<MainMenuProps> = ({ onStartGame }) => {
  return (
    <div className="min-h-screen bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-slate-900 via-[#0f172a] to-black flex flex-col items-center justify-center p-4 text-white relative overflow-hidden">
      
      {/* Background Animated Elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
         <motion.div 
           animate={{ rotate: 360 }}
           transition={{ duration: 100, repeat: Infinity, ease: "linear" }}
           className="absolute -top-[50%] -left-[50%] w-[200%] h-[200%] opacity-5"
           style={{ 
             backgroundImage: 'radial-gradient(circle, #fff 2px, transparent 2px)',
             backgroundSize: '50px 50px' 
            }}
         />
      </div>

      <motion.div 
        initial={{ opacity: 0, y: -50 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, type: "spring" }}
        className="z-10 text-center mb-16"
      >
        <h1 className="text-6xl md:text-8xl font-black text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-orange-600 drop-shadow-2xl mb-4 tracking-tighter">
          JACKAROO<br/>KING
        </h1>
        <p className="text-slate-400 text-lg uppercase tracking-widest font-bold border-t border-slate-800 pt-4 mt-4 inline-block">The Royal Board Game</p>
      </motion.div>

      <div className="z-10 flex flex-col gap-6 w-full max-w-md">
        <MenuButton 
           title="Duel (1v1)" 
           subtitle="Human vs Bot • Strategic"
           color="blue"
           onClick={() => onStartGame(2)} 
        />
        <MenuButton 
           title="Chaos (FFA)" 
           subtitle="Human vs 3 Bots • Classic"
           color="red"
           onClick={() => onStartGame(4)} 
        />
      </div>
      
      <div className="absolute bottom-8 text-slate-700 text-xs font-mono">
        v1.2 • AI EDITION
      </div>
    </div>
  );
};

const MenuButton = ({ title, subtitle, color, onClick }: any) => (
  <motion.button
    whileHover={{ scale: 1.05, filter: "brightness(1.2)" }}
    whileTap={{ scale: 0.95 }}
    initial={{ opacity: 0, x: -20 }}
    animate={{ opacity: 1, x: 0 }}
    onClick={onClick}
    className={`
      relative overflow-hidden group p-6 rounded-2xl border border-white/10
      ${color === 'blue' ? 'bg-indigo-900/40 hover:bg-indigo-800/60' : 'bg-rose-900/40 hover:bg-rose-800/60'}
      backdrop-blur-md transition-all shadow-xl text-left
    `}
  >
    <div className={`absolute inset-0 bg-gradient-to-r ${color === 'blue' ? 'from-blue-600/20 to-purple-600/20' : 'from-red-600/20 to-orange-600/20'} opacity-0 group-hover:opacity-100 transition-opacity`} />
    
    <div className="relative flex items-center justify-between">
      <div>
        <div className="text-3xl font-black text-white italic tracking-tight">{title}</div>
        <div className="text-white/60 text-sm font-medium mt-1">{subtitle}</div>
      </div>
      <div className="text-4xl opacity-50 group-hover:opacity-100 transition-all group-hover:rotate-12 group-hover:scale-110">
        {color === 'blue' ? '⚔️' : '🔥'}
      </div>
    </div>
  </motion.button>
);
