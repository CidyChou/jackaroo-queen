import React, { useState } from 'react';
import { Game } from './components/Game';
import { MainMenu } from './components/MainMenu';
import { MatchmakingPage } from './components/MatchmakingPage';
import { OnlineGame } from './components/OnlineGame';
import type { GameState } from '@shared/types';

// App modes including online matchmaking and game
type AppMode = 'MENU' | 'GAME' | 'MATCHMAKING' | 'ONLINE_GAME';

// Context for online game session
interface OnlineGameContext {
  roomCode: string;
  playerIndex: number;
  initialState: GameState;
}

const App: React.FC = () => {
  const [appMode, setAppMode] = useState<AppMode>('MENU');
  const [playerCount, setPlayerCount] = useState<number>(2);
  const [onlineGameContext, setOnlineGameContext] = useState<OnlineGameContext | null>(null);

  // Start local bot game
  const handleStartGame = (count: number) => {
    setPlayerCount(count);
    setAppMode('GAME');
  };

  // Start online matchmaking
  const handleStartOnlineMatch = () => {
    setAppMode('MATCHMAKING');
  };

  // Handle successful match found
  const handleMatchFound = (roomCode: string, playerIndex: number, initialState: GameState) => {
    setOnlineGameContext({ roomCode, playerIndex, initialState });
    setAppMode('ONLINE_GAME');
  };

  // Handle matchmaking cancellation
  const handleMatchmakingCancel = () => {
    setAppMode('MENU');
  };

  // Handle matchmaking error
  const handleMatchmakingError = (message: string) => {
    console.error('Matchmaking error:', message);
    // Error is displayed in MatchmakingPage, user can retry or cancel
  };

  // Exit from any game mode back to menu
  const handleExitGame = () => {
    setOnlineGameContext(null);
    setAppMode('MENU');
  };

  return (
    <>
      {appMode === 'MENU' && (
        <MainMenu 
          onStartGame={handleStartGame as any} 
          onStartOnlineMatch={handleStartOnlineMatch}
        />
      )}
      {appMode === 'GAME' && (
        <Game playerCount={playerCount} onExit={handleExitGame} />
      )}
      {appMode === 'MATCHMAKING' && (
        <MatchmakingPage
          onMatchFound={handleMatchFound}
          onCancel={handleMatchmakingCancel}
          onError={handleMatchmakingError}
        />
      )}
      {appMode === 'ONLINE_GAME' && onlineGameContext && (
        <OnlineGame
          roomCode={onlineGameContext.roomCode}
          playerIndex={onlineGameContext.playerIndex}
          initialState={onlineGameContext.initialState}
          onExit={handleExitGame}
        />
      )}
    </>
  );
};

export default App;
