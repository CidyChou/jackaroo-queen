/**
 * Integration Tests for MainMenu and App Mode Switching
 * Requirements: 1.1, 1.2
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MainMenu } from './MainMenu';
import App from '../App';

// Mock framer-motion to avoid animation issues in tests
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
    button: ({ children, ...props }: any) => <button {...props}>{children}</button>,
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));

// Mock Game component to avoid complex game logic in integration tests
vi.mock('./Game', () => ({
  Game: ({ onExit }: { onExit: () => void }) => (
    <div data-testid="game-component">
      <button onClick={onExit} data-testid="exit-game">Exit Game</button>
    </div>
  ),
}));

// Mock MatchmakingPage component
vi.mock('./MatchmakingPage', () => ({
  MatchmakingPage: ({ onCancel, onMatchFound }: any) => (
    <div data-testid="matchmaking-page">
      <button onClick={onCancel} data-testid="cancel-matchmaking">Cancel</button>
      <button 
        onClick={() => onMatchFound('TEST123', 0, { players: [], marbles: {}, board: {}, deck: [], discardPile: [], currentPlayerIndex: 0, currentRound: 1, phase: 'IDLE', selectedCardId: null, selectedMarbleId: null, possibleMoves: [], pendingAttackerIndex: null, repeatTurn: false, split7State: null, lastActionLog: [] })}
        data-testid="simulate-match-found"
      >
        Simulate Match Found
      </button>
    </div>
  ),
}));

// Mock OnlineGame component
vi.mock('./OnlineGame', () => ({
  OnlineGame: ({ onExit, roomCode, playerIndex }: any) => (
    <div data-testid="online-game-component">
      <span data-testid="room-code">{roomCode}</span>
      <span data-testid="player-index">{playerIndex}</span>
      <button onClick={onExit} data-testid="exit-online-game">Exit Online Game</button>
    </div>
  ),
}));

describe('MainMenu Component', () => {
  describe('Game Mode Options Display (Requirement 1.1)', () => {
    it('should display three game mode options', () => {
      const onStartGame = vi.fn();
      const onStartOnlineMatch = vi.fn();
      
      render(<MainMenu onStartGame={onStartGame} onStartOnlineMatch={onStartOnlineMatch} />);
      
      // Check for Duel (1v1 Bot) option
      expect(screen.getByText('Duel (1v1)')).toBeInTheDocument();
      expect(screen.getByText('Human vs Bot • Strategic')).toBeInTheDocument();
      
      // Check for Chaos (FFA Bot) option
      expect(screen.getByText('Chaos (FFA)')).toBeInTheDocument();
      expect(screen.getByText('Human vs 3 Bots • Classic')).toBeInTheDocument();
      
      // Check for Online Match (1v1 PvP) option
      expect(screen.getByText('Online Match')).toBeInTheDocument();
      expect(screen.getByText('1v1 PvP • Real Opponent')).toBeInTheDocument();
    });

    it('should call onStartGame with 2 when Duel is clicked', () => {
      const onStartGame = vi.fn();
      const onStartOnlineMatch = vi.fn();
      
      render(<MainMenu onStartGame={onStartGame} onStartOnlineMatch={onStartOnlineMatch} />);
      
      fireEvent.click(screen.getByText('Duel (1v1)'));
      
      expect(onStartGame).toHaveBeenCalledWith(2);
    });

    it('should call onStartGame with 4 when Chaos is clicked', () => {
      const onStartGame = vi.fn();
      const onStartOnlineMatch = vi.fn();
      
      render(<MainMenu onStartGame={onStartGame} onStartOnlineMatch={onStartOnlineMatch} />);
      
      fireEvent.click(screen.getByText('Chaos (FFA)'));
      
      expect(onStartGame).toHaveBeenCalledWith(4);
    });

    it('should call onStartOnlineMatch when Online Match is clicked', () => {
      const onStartGame = vi.fn();
      const onStartOnlineMatch = vi.fn();
      
      render(<MainMenu onStartGame={onStartGame} onStartOnlineMatch={onStartOnlineMatch} />);
      
      fireEvent.click(screen.getByText('Online Match'));
      
      expect(onStartOnlineMatch).toHaveBeenCalled();
    });
  });
});

// Helper function to check if MainMenu is displayed
const expectMainMenuVisible = () => {
  expect(screen.getByText('Duel (1v1)')).toBeInTheDocument();
  expect(screen.getByText('Chaos (FFA)')).toBeInTheDocument();
  expect(screen.getByText('Online Match')).toBeInTheDocument();
};

describe('App Mode Switching Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Initial State', () => {
    it('should show MainMenu on initial load', () => {
      render(<App />);
      
      expectMainMenuVisible();
    });
  });

  describe('Navigation to Local Game (Requirement 1.2)', () => {
    it('should navigate to Game when Duel is clicked', () => {
      render(<App />);
      
      fireEvent.click(screen.getByText('Duel (1v1)'));
      
      expect(screen.getByTestId('game-component')).toBeInTheDocument();
      expect(screen.queryByText('Duel (1v1)')).not.toBeInTheDocument();
    });

    it('should navigate to Game when Chaos is clicked', () => {
      render(<App />);
      
      fireEvent.click(screen.getByText('Chaos (FFA)'));
      
      expect(screen.getByTestId('game-component')).toBeInTheDocument();
    });

    it('should return to MainMenu when exiting local game', () => {
      render(<App />);
      
      // Navigate to game
      fireEvent.click(screen.getByText('Duel (1v1)'));
      expect(screen.getByTestId('game-component')).toBeInTheDocument();
      
      // Exit game
      fireEvent.click(screen.getByTestId('exit-game'));
      
      // Should be back at menu
      expectMainMenuVisible();
    });
  });

  describe('Navigation to Online Matchmaking (Requirement 1.2)', () => {
    it('should navigate to MatchmakingPage when Online Match is clicked', () => {
      render(<App />);
      
      fireEvent.click(screen.getByText('Online Match'));
      
      expect(screen.getByTestId('matchmaking-page')).toBeInTheDocument();
      expect(screen.queryByText('Duel (1v1)')).not.toBeInTheDocument();
    });

    it('should return to MainMenu when matchmaking is cancelled', () => {
      render(<App />);
      
      // Navigate to matchmaking
      fireEvent.click(screen.getByText('Online Match'));
      expect(screen.getByTestId('matchmaking-page')).toBeInTheDocument();
      
      // Cancel matchmaking
      fireEvent.click(screen.getByTestId('cancel-matchmaking'));
      
      // Should be back at menu
      expectMainMenuVisible();
    });

    it('should navigate to OnlineGame when match is found', () => {
      render(<App />);
      
      // Navigate to matchmaking
      fireEvent.click(screen.getByText('Online Match'));
      
      // Simulate match found
      fireEvent.click(screen.getByTestId('simulate-match-found'));
      
      // Should be in online game
      expect(screen.getByTestId('online-game-component')).toBeInTheDocument();
      expect(screen.getByTestId('room-code')).toHaveTextContent('TEST123');
      expect(screen.getByTestId('player-index')).toHaveTextContent('0');
    });

    it('should return to MainMenu when exiting online game', () => {
      render(<App />);
      
      // Navigate to matchmaking
      fireEvent.click(screen.getByText('Online Match'));
      
      // Simulate match found
      fireEvent.click(screen.getByTestId('simulate-match-found'));
      expect(screen.getByTestId('online-game-component')).toBeInTheDocument();
      
      // Exit online game
      fireEvent.click(screen.getByTestId('exit-online-game'));
      
      // Should be back at menu
      expectMainMenuVisible();
    });
  });

  describe('Complete Navigation Flow', () => {
    it('should support full navigation cycle: Menu -> Matchmaking -> OnlineGame -> Menu', () => {
      render(<App />);
      
      // Start at menu
      expectMainMenuVisible();
      
      // Go to matchmaking
      fireEvent.click(screen.getByText('Online Match'));
      expect(screen.getByTestId('matchmaking-page')).toBeInTheDocument();
      
      // Match found, go to online game
      fireEvent.click(screen.getByTestId('simulate-match-found'));
      expect(screen.getByTestId('online-game-component')).toBeInTheDocument();
      
      // Exit back to menu
      fireEvent.click(screen.getByTestId('exit-online-game'));
      expectMainMenuVisible();
    });

    it('should support navigation: Menu -> LocalGame -> Menu -> Matchmaking -> Cancel -> Menu', () => {
      render(<App />);
      
      // Start at menu
      expectMainMenuVisible();
      
      // Go to local game
      fireEvent.click(screen.getByText('Duel (1v1)'));
      expect(screen.getByTestId('game-component')).toBeInTheDocument();
      
      // Exit to menu
      fireEvent.click(screen.getByTestId('exit-game'));
      expectMainMenuVisible();
      
      // Go to matchmaking
      fireEvent.click(screen.getByText('Online Match'));
      expect(screen.getByTestId('matchmaking-page')).toBeInTheDocument();
      
      // Cancel and return to menu
      fireEvent.click(screen.getByTestId('cancel-matchmaking'));
      expectMainMenuVisible();
    });
  });
});
