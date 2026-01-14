
import React, { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';

interface ActionLogProps {
  logs: string[];
}

export const ActionLog: React.FC<ActionLogProps> = ({ logs }) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when logs change
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs]);

  if (logs.length === 0) return null;

  return (
    <motion.div 
      initial={{ opacity: 0, x: 50 }}
      animate={{ opacity: 1, x: 0 }}
      className="hidden md:flex fixed bottom-6 right-6 z-40 w-80 max-h-48 flex-col gap-2 pointer-events-none"
    >
      <div className="bg-slate-900/80 backdrop-blur-md border border-slate-700/50 rounded-xl p-3 shadow-2xl pointer-events-auto">
        <div className="text-[10px] uppercase tracking-wider font-bold text-slate-500 mb-2 border-b border-slate-700 pb-1">
          Battle Log
        </div>
        <div 
          ref={scrollRef}
          className="overflow-y-auto max-h-32 text-xs font-mono flex flex-col gap-1 pr-1 custom-scrollbar"
        >
          {logs.map((log, index) => (
            <div key={index} className="text-slate-300 border-l-2 border-slate-700 pl-2 py-0.5 leading-tight">
              {log}
            </div>
          ))}
        </div>
      </div>
    </motion.div>
  );
};
