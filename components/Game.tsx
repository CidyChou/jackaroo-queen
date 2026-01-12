
import React, { useReducer, useEffect, useState } from 'react';
import { createInitialState, enhancedGameReducer } from '../services/gameLogic';
import { Board } from './Board';
import { CardHand } from './CardHand';
import { AnimatePresence, motion } from 'framer-motion';
import { getBestMove } from '../services/BotLogic';

interface GameProps {
  playerCount: number;
  onExit: () => void;
}

export const Game: React.FC<GameProps> = ({ playerCount, onExit }) => {
  // Lazy initialization of state based on playerCount
  const [gameState, dispatch] = useReducer(enhancedGameReducer, playerCount, createInitialState);
  
  const currentPlayer = gameState.players[gameState.currentPlayerIndex];
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Bot Turn Logic
  useEffect(() => {
    if (!currentPlayer.isBot || gameState.phase !== 'TURN_START') return;

    let isCancelled = false;

    const executeBotTurn = async () => {
       await new Promise(r => setTimeout(r, 1200));
       if (isCancelled) return;

       const decision = getBestMove(gameState, currentPlayer);

       if (decision.action === 'BURN') {
          dispatch({ type: 'SELECT_CARD', cardId: decision.cardId });
          setToastMessage("CPU Burning Card...");
          await new Promise(r => setTimeout(r, 1000));
          dispatch({ type: 'BURN_CARD' });
       } else if (decision.action === 'MOVE' && decision.move) {
          dispatch({ type: 'SELECT_CARD', cardId: decision.cardId });
          await new Promise(r => setTimeout(r, 600)); 
          
          dispatch({ type: 'SELECT_MARBLE', marbleId: decision.move.marbleId });
          
          if (decision.move.targetPosition) {
             dispatch({ type: 'SELECT_TARGET_NODE', nodeId: decision.move.targetPosition });
          } else {
             dispatch({ type: 'CONFIRM_MOVE' });
          }
       }
    };

    executeBotTurn();
    return () => { isCancelled = true; };
  }, [currentPlayer, gameState.phase, gameState.currentRound]);

  // Turn Resolution
  useEffect(() => {
    if (gameState.phase === 'RESOLVING_MOVE') {
      const timer = setTimeout(() => {
        dispatch({ type: 'RESOLVE_TURN' });
        setToastMessage(null);
      }, 1000); 
      return () => clearTimeout(timer);
    }
  }, [gameState.phase]);

  // Handlers
  const handleMarbleClick = (marbleId: string) => {
    if (currentPlayer.isBot) return; 
    if (gameState.phase !== 'PLAYER_INPUT') return;
    dispatch({ type: 'SELECT_MARBLE', marbleId });
  };

  const handleNodeClick = (nodeId: string) => {
    if (currentPlayer.isBot) return; 
    if (gameState.phase !== 'PLAYER_INPUT') return;
    dispatch({ type: 'SELECT_TARGET_NODE', nodeId });
  };

  const canBurn = !currentPlayer.isBot && gameState.selectedCardId && gameState.possibleMoves.length === 0;

  const getNoMoveHint = () => {
    const playerMarbles = gameState.marbles; 
    const myMarbles = currentPlayer.marbles.map(id => playerMarbles[id]);
    const allInBase = myMarbles.every(m => m.position === 'BASE');
    if (allInBase) return "Need an Ace or King to exit Base.";
    return "Blocked or no valid targets.";
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col overflow-hidden relative selection:bg-amber-500/30">
      
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-slate-900 via-slate-950 to-black z-0 pointer-events-none"></div>

      {/* Header / HUD */}
      <div className="absolute top-0 left-0 right-0 p-4 flex justify-between items-start pointer-events-none z-10">
        <div className="pointer-events-auto">
          {/* Back Button */}
          <button 
            onClick={onExit}
            className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors mb-2 group"
          >
            <span className="group-hover:-translate-x-1 transition-transform">←</span> Exit Match
          </button>

          <h1 className="text-3xl font-black text-amber-500 drop-shadow-lg tracking-wider">JACKAROO</h1>
          <div className="bg-black/50 backdrop-blur-md px-4 py-2 rounded-lg border border-white/10 mt-2 flex items-center gap-4">
             <div className="text-sm text-slate-400">Round <span className="text-white font-bold text-lg">{gameState.currentRound}</span></div>
             
             <div className={`px-3 py-1 rounded font-bold text-sm uppercase transition-colors duration-300 flex items-center gap-2
               ${currentPlayer.isBot ? 'bg-yellow-900/50 text-yellow-200' : 'bg-green-900/50 text-green-200'}
             `}>
                {currentPlayer.isBot ? (
                  <>
                    <span className="w-2 h-2 bg-yellow-400 rounded-full animate-ping"></span>
                    Thinking
                  </>
                ) : (
                  <>
                     <span className="text-lg">🫵</span> YOUR TURN
                  </>
                )}
             </div>
          </div>
        </div>
        
        {/* Game Log */}
        <div className="bg-slate-900/80 p-4 rounded-xl border border-slate-700 w-72 pointer-events-auto max-h-48 overflow-auto shadow-2xl backdrop-blur-sm hidden sm:block">
           <h3 className="text-xs uppercase text-slate-500 font-bold mb-2 tracking-widest border-b border-white/10 pb-1">Battle Log</h3>
           <div className="flex flex-col-reverse gap-1">
             {gameState.lastActionLog.map((log, i) => (
               <motion.div 
                 initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} 
                 key={gameState.lastActionLog.length - 1 - i} 
                 className="text-xs text-slate-300 py-1"
               >
                 <span className="text-amber-500 mr-2">➤</span> {log}
               </motion.div>
             ))}
           </div>
        </div>
      </div>

      {/* Main Game Area */}
      <div className="flex-1 flex items-center justify-center p-4 lg:p-10 relative z-0">
        <div className="relative w-full max-w-[650px] aspect-square">
          <Board 
            gameState={gameState} 
            onMarbleClick={handleMarbleClick}
            onNodeClick={handleNodeClick}
          />

          <AnimatePresence>
            {toastMessage && (
               <motion.div
                 initial={{ opacity: 0, y: 20 }}
                 animate={{ opacity: 1, y: 0 }}
                 exit={{ opacity: 0 }}
                 className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 bg-black/80 backdrop-blur px-6 py-3 rounded-full border border-white/20 text-white font-bold shadow-2xl"
               >
                 {toastMessage}
               </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {canBurn && gameState.phase === 'PLAYER_INPUT' && (
              <motion.div 
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 flex flex-col items-center gap-4 w-64"
              >
                <div className="bg-black/90 backdrop-blur px-6 py-4 rounded-xl border border-red-500/50 text-center shadow-2xl">
                  <div className="text-red-400 font-bold text-lg mb-1">No Valid Moves</div>
                  <div className="text-slate-300 text-xs">{getNoMoveHint()}</div>
                </div>
                <button
                  onClick={() => dispatch({ type: 'BURN_CARD' })}
                  className="bg-gradient-to-r from-red-600 to-red-500 hover:from-red-500 hover:to-red-400 text-white font-bold py-3 px-8 rounded-full shadow-[0_0_25px_rgba(220,38,38,0.6)] animate-pulse border border-red-400/30"
                >
                  BURN CARD 🔥
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Footer / Hand */}
      <div className={`transition-opacity duration-500 ${currentPlayer.isBot ? 'opacity-50 pointer-events-none grayscale' : 'opacity-100'}`}>
        <CardHand 
          player={currentPlayer} 
          selectedCardId={gameState.selectedCardId}
          onCardSelect={(id) => {
            if (!currentPlayer.isBot) dispatch({ type: 'SELECT_CARD', cardId: id });
          }}
        />
      </div>
    </div>
  );
};
