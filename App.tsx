
import React, { useState } from 'react';
import { Game } from './components/Game';
import { MainMenu } from './components/MainMenu';

const App: React.FC = () => {
  const [appMode, setAppMode] = useState<'MENU' | 'GAME'>('MENU');
  const [playerCount, setPlayerCount] = useState<number>(2);

  const handleStartGame = (count: number) => {
    setPlayerCount(count);
    setAppMode('GAME');
  };

  const handleExitGame = () => {
    setAppMode('MENU');
  };

  return (
    <>
      {appMode === 'MENU' && <MainMenu onStartGame={handleStartGame as any} />}
      {appMode === 'GAME' && <Game playerCount={playerCount} onExit={handleExitGame} />}
    </>
  );
};

export default App;
