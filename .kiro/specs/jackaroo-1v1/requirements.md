# Requirements Document

## Introduction

本文档定义了 Jackaroo King 1v1 模式的功能需求。Jackaroo King 是一款策略性扑克棋盘对战游戏，玩家通过打出扑克牌指令驱动棋子移动，目标是率先将 4 颗棋子全部移入终点区域。

## Glossary

- **Game_System**: 游戏核心系统，负责管理游戏状态、回合流程和规则执行
- **Board**: 棋盘，包含环形轨道、基地、起始点和终点区域
- **Marble**: 棋子，每位玩家拥有 4 颗同色棋子
- **Card**: 扑克牌，用于指令棋子移动
- **Player**: 玩家，包括人类玩家和 AI 机器人
- **Base**: 基地，存放未启用棋子的区域
- **Starting_Point**: 起始点，棋子从基地出来的首个位置
- **Home_Area**: 终点区域，棋子的最终目标位置
- **Deck**: 牌堆，未发出的扑克牌集合
- **Discard_Pile**: 弃牌堆，已使用或弃掉的牌
- **Turn**: 回合，玩家出牌行动的单位
- **Round**: 发牌轮次，所有牌出完后重新发牌为一轮

## Requirements

### Requirement 1: 游戏初始化

**User Story:** As a player, I want to start a new 1v1 game, so that I can play against an opponent.

#### Acceptance Criteria

1. WHEN a new game starts, THE Game_System SHALL create a board with 52 nodes in a circular track
2. WHEN a new game starts, THE Game_System SHALL assign 4 marbles to each player with distinct colors (red vs yellow)
3. WHEN a new game starts, THE Game_System SHALL place 1 marble at each player's Starting_Point and 3 marbles in their Base
4. WHEN a new game starts, THE Game_System SHALL create a shuffled deck of 52 standard playing cards
5. WHEN a new game starts, THE Game_System SHALL deal 4 cards to each player for the first round

### Requirement 2: 发牌机制

**User Story:** As a player, I want cards to be dealt according to round rules, so that the game progresses fairly.

#### Acceptance Criteria

1. WHEN all players have empty hands, THE Game_System SHALL deal new cards based on the current round number
2. WHEN the round number modulo 3 equals 0 (rounds 3, 6, 9...), THE Game_System SHALL deal 5 cards to each player
3. WHEN the round number modulo 3 does not equal 0, THE Game_System SHALL deal 4 cards to each player
4. WHEN the deck has insufficient cards for dealing, THE Game_System SHALL shuffle the discard pile back into the deck
5. WHEN one player has cards and the other has none, THE Game_System SHALL wait for the player with cards to finish before dealing

### Requirement 3: 回合流程

**User Story:** As a player, I want to take turns playing cards, so that I can move my marbles strategically.

#### Acceptance Criteria

1. WHEN it is a player's turn, THE Game_System SHALL allow the player to select a card from their hand
2. WHEN a card is selected, THE Game_System SHALL calculate and display all valid moves for that card
3. WHEN a valid move is confirmed, THE Game_System SHALL execute the move and update the board state
4. WHEN a move is completed, THE Game_System SHALL pass the turn to the next player
5. IF a player has no valid moves for any card, THEN THE Game_System SHALL require the player to discard a card

### Requirement 4: 基础移动规则

**User Story:** As a player, I want my marbles to move according to card values, so that I can navigate the board.

#### Acceptance Criteria

1. WHEN a number card (2-10) is played, THE Game_System SHALL move the selected marble forward by the card's value
2. WHEN card 4 is played, THE Game_System SHALL move the selected marble backward by 4 steps
3. WHEN a marble reaches its Home_Area entrance, THE Game_System SHALL allow it to enter the home path
4. WHEN a marble is in the home path, THE Game_System SHALL require exact steps to reach a home slot
5. THE Game_System SHALL prevent marbles from moving past their own Starting_Point if occupied by another marble

### Requirement 5: 出新棋子规则

**User Story:** As a player, I want to bring new marbles onto the board, so that I can have more pieces in play.

#### Acceptance Criteria

1. WHEN card A is played, THE Game_System SHALL allow moving a marble 1 step OR bringing a new marble from Base to Starting_Point
2. WHEN card 2 is played, THE Game_System SHALL allow moving a marble 2 steps OR bringing a new marble from Base to Starting_Point
3. WHEN card K is played, THE Game_System SHALL allow bringing a new marble from Base to Starting_Point OR moving 13 steps with kill-path
4. IF the Starting_Point is occupied by own marble, THEN THE Game_System SHALL prevent bringing a new marble out

### Requirement 6: 特殊卡牌功能 - 7 分步移动

**User Story:** As a player, I want to split 7 steps between marbles, so that I can make strategic multi-marble moves.

#### Acceptance Criteria

1. WHEN card 7 is played, THE Game_System SHALL allow distributing 7 steps across 1 or 2 marbles
2. WHEN splitting steps, THE Game_System SHALL require the total steps to equal exactly 7
3. WHEN the first marble move is confirmed, THE Game_System SHALL calculate valid moves for remaining steps
4. IF no valid moves exist for remaining steps, THEN THE Game_System SHALL forfeit the remaining steps

### Requirement 7: 特殊卡牌功能 - Jack 互换

**User Story:** As a player, I want to swap positions with opponent marbles, so that I can gain strategic advantage.

#### Acceptance Criteria

1. WHEN black Jack is played, THE Game_System SHALL allow swapping position with any opponent marble on the main track
2. WHEN red Jack is played, THE Game_System SHALL move the selected marble forward 11 steps
3. THE Game_System SHALL prevent swapping with marbles in Base or Home_Area
4. THE Game_System SHALL prevent swapping with marbles on Starting_Point

### Requirement 8: 特殊卡牌功能 - 攻击牌

**User Story:** As a player, I want to force my opponent to discard cards, so that I can disrupt their strategy.

#### Acceptance Criteria

1. WHEN card 10 is played, THE Game_System SHALL offer choice between moving 10 steps OR forcing opponent to discard
2. WHEN red Queen is played, THE Game_System SHALL force the opponent to discard one card of their choice
3. WHEN attack is chosen, THE Game_System SHALL switch to opponent for card selection
4. WHEN opponent discards, THE Game_System SHALL return turn to the attacker

### Requirement 9: 捕获机制

**User Story:** As a player, I want to capture opponent marbles, so that I can set back their progress.

#### Acceptance Criteria

1. WHEN a marble lands on a position occupied by an opponent marble, THE Game_System SHALL send the opponent marble back to Base
2. WHEN card K moves 13 steps, THE Game_System SHALL capture all marbles (including own) in the path
3. WHEN a capture occurs, THE Game_System SHALL draw one bonus card for the capturing player
4. WHEN a capture occurs, THE Game_System SHALL grant the capturing player an extra turn
5. THE Game_System SHALL prevent capturing marbles in Home_Area or on Starting_Point

### Requirement 10: 连击机制

**User Story:** As a player, I want to earn bonus actions, so that I can chain strategic moves.

#### Acceptance Criteria

1. WHEN a marble enters a Home_Area slot, THE Game_System SHALL draw one bonus card for that player
2. WHEN a marble enters a Home_Area slot, THE Game_System SHALL grant that player an extra turn
3. WHEN bonus card is drawn, THE Game_System SHALL take it from the deck (not discard pile)
4. IF the deck is empty when bonus is triggered, THEN THE Game_System SHALL skip the bonus card draw

### Requirement 11: 移动限制规则

**User Story:** As a player, I want clear movement restrictions, so that I understand valid moves.

#### Acceptance Criteria

1. THE Game_System SHALL prevent marbles from passing over own marbles on the main track
2. THE Game_System SHALL prevent marbles from passing over the own Starting_Point if occupied
3. THE Game_System SHALL prevent marbles from entering Home_Area if the entrance is blocked
4. THE Game_System SHALL require exact step count to land on Home_Area slots

### Requirement 12: 胜利条件

**User Story:** As a player, I want to win by completing the objective, so that the game has a clear conclusion.

#### Acceptance Criteria

1. WHEN all 4 marbles of a player are in Home_Area, THE Game_System SHALL declare that player as winner
2. WHEN a winner is declared, THE Game_System SHALL end the game and display results
3. THE Game_System SHALL track each player's progress toward victory

### Requirement 13: AI 对手

**User Story:** As a player, I want to play against an AI opponent, so that I can enjoy single-player mode.

#### Acceptance Criteria

1. WHEN it is the AI player's turn, THE Game_System SHALL automatically select and play a card
2. THE AI_Player SHALL prioritize moves that capture opponent marbles
3. THE AI_Player SHALL prioritize moves that advance marbles toward Home_Area
4. THE AI_Player SHALL use attack cards strategically when opponent has advantageous cards
5. WHEN AI must discard, THE AI_Player SHALL select the least valuable card

### Requirement 14: 用户界面交互

**User Story:** As a player, I want intuitive UI feedback, so that I can understand game state and make decisions.

#### Acceptance Criteria

1. WHEN a card is selected, THE Game_System SHALL highlight all valid target positions
2. WHEN a move would capture an opponent, THE Game_System SHALL display a capture indicator on the card
3. WHEN a move would reach Home_Area, THE Game_System SHALL display a home indicator on the card
4. WHEN player is under attack, THE Game_System SHALL display prominent attack notification
5. THE Game_System SHALL display current round number and turn indicator

### Requirement 15: 时间限制与托管

**User Story:** As a player, I want time limits to keep the game moving, so that matches don't stall.

#### Acceptance Criteria

1. WHEN a player's turn begins, THE Game_System SHALL start a 15-second timer
2. IF the timer expires without action, THEN THE Game_System SHALL enter auto-play mode
3. WHILE in auto-play mode, THE Game_System SHALL prioritize cards with valid moves
4. WHILE in auto-play mode, THE Game_System SHALL play cards from right to left if no hints available
