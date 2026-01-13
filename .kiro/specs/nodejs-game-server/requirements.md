# Requirements Document

## Introduction

本文档定义了 Jackaroo 游戏 Node.js 服务端的需求。目标是复用现有客户端的游戏逻辑（状态机、移动引擎等），构建一个支持多人实时对战的游戏服务器。

## Glossary

- **Game_Server**: Node.js 游戏服务端，负责管理游戏房间、玩家连接和游戏状态
- **Shared_Logic**: 从客户端复用的游戏核心逻辑模块（gameLogic、moveEngine、boardService）
- **Room**: 游戏房间，包含 2-4 名玩家的一局游戏实例
- **Player_Session**: 玩家会话，管理单个玩家的连接状态和身份
- **Game_State**: 游戏状态对象，由 Shared_Logic 管理
- **WebSocket_Connection**: 客户端与服务端的实时双向通信连接

## Requirements

### Requirement 1: 共享逻辑模块提取

**User Story:** As a developer, I want to extract shared game logic into a reusable module, so that both client and server can use the same game rules.

#### Acceptance Criteria

1. THE Shared_Logic SHALL be extracted into a separate `shared/` directory
2. THE Shared_Logic SHALL include gameLogic.ts, moveEngine.ts, boardService.ts, types.ts, and constants.ts
3. THE Shared_Logic SHALL NOT contain any browser-specific or React-specific code
4. WHEN the Shared_Logic is imported, THE Game_Server SHALL be able to create and manage game states
5. THE Shared_Logic SHALL replace `Math.random()` with an injectable random function for testability

### Requirement 2: WebSocket 连接管理

**User Story:** As a player, I want to connect to the game server via WebSocket, so that I can play in real-time with other players.

#### Acceptance Criteria

1. WHEN a client connects via WebSocket, THE Game_Server SHALL create a Player_Session
2. WHEN a client disconnects, THE Game_Server SHALL mark the Player_Session as disconnected
3. IF a player reconnects within 60 seconds, THEN THE Game_Server SHALL restore their session
4. THE Game_Server SHALL support at least 100 concurrent WebSocket connections
5. WHEN a connection error occurs, THE Game_Server SHALL log the error and clean up resources

### Requirement 3: 房间管理

**User Story:** As a player, I want to create or join game rooms, so that I can play with friends or random opponents.

#### Acceptance Criteria

1. WHEN a player requests to create a room, THE Game_Server SHALL generate a unique room code and create a new Room
2. WHEN a player requests to join a room with a valid code, THE Game_Server SHALL add them to that Room
3. IF a room is full (2 or 4 players based on mode), THEN THE Game_Server SHALL reject new join requests
4. WHEN all players leave a room, THE Game_Server SHALL destroy the Room after 5 minutes
5. THE Game_Server SHALL support both 2-player and 4-player game modes
6. WHEN a room is created, THE Game_Server SHALL allow the creator to set the player count (2 or 4)

### Requirement 4: 游戏状态同步

**User Story:** As a player, I want to see real-time game updates, so that I can play smoothly with other players.

#### Acceptance Criteria

1. WHEN a player performs a valid action, THE Game_Server SHALL broadcast the updated Game_State to all players in the Room
2. THE Game_Server SHALL use the Shared_Logic reducer to process all game actions
3. WHEN a player sends an invalid action, THE Game_Server SHALL reject it and send an error message
4. THE Game_Server SHALL validate that actions come from the current player's turn
5. WHEN serializing Game_State for transmission, THE Game_Server SHALL hide other players' hands (cards)

### Requirement 5: 游戏动作处理

**User Story:** As a player, I want my game actions to be processed correctly, so that the game follows the rules.

#### Acceptance Criteria

1. WHEN a SELECT_CARD action is received, THE Game_Server SHALL validate the card belongs to the current player
2. WHEN a SELECT_MARBLE action is received, THE Game_Server SHALL validate the marble selection is legal
3. WHEN a CONFIRM_MOVE action is received, THE Game_Server SHALL execute the move using Shared_Logic
4. WHEN a BURN_CARD action is received, THE Game_Server SHALL process the card burn correctly
5. THE Game_Server SHALL handle all special card actions (7 split, Jack swap, 10/Q attack)

### Requirement 6: 消息协议

**User Story:** As a developer, I want a clear message protocol, so that client-server communication is consistent.

#### Acceptance Criteria

1. THE Game_Server SHALL use JSON format for all WebSocket messages
2. WHEN sending a message, THE Game_Server SHALL include a message type field
3. WHEN receiving a message, THE Game_Server SHALL validate the message structure
4. THE Game_Server SHALL define message types for: JOIN_ROOM, LEAVE_ROOM, GAME_ACTION, STATE_UPDATE, ERROR
5. WHEN parsing a message fails, THE Game_Server SHALL send an error response

### Requirement 7: 错误处理与日志

**User Story:** As a developer, I want proper error handling and logging, so that I can debug issues in production.

#### Acceptance Criteria

1. WHEN an unexpected error occurs, THE Game_Server SHALL catch it and prevent server crash
2. THE Game_Server SHALL log all game actions with timestamps
3. THE Game_Server SHALL log connection events (connect, disconnect, reconnect)
4. IF a player sends too many requests, THEN THE Game_Server SHALL rate limit them
5. THE Game_Server SHALL provide health check endpoint for monitoring
