# Requirements Document

## Introduction

本功能为 Jackaroo Queen 游戏添加在线1v1匹配模式。在保留现有人机对战模式（Duel 1v1 和 Chaos FFA）的基础上，新增一个在线匹配入口，允许两个真实玩家通过 WebSocket 服务器进行实时对战。

## Glossary

- **Client**: 运行在浏览器中的 React 前端应用
- **Server**: 运行在 Node.js 上的 WebSocket 游戏服务器
- **Matchmaking_Service**: 客户端中负责与服务器通信、管理匹配状态的服务模块
- **Matchmaking_Page**: 显示匹配状态、等待对手的 UI 页面
- **Room**: 服务器端管理的游戏房间，包含两个玩家
- **Online_Game**: 通过 WebSocket 进行状态同步的在线对战游戏实例

## Requirements

### Requirement 1: 主菜单新增在线匹配入口

**User Story:** 作为玩家，我希望在主菜单看到在线匹配选项，以便我可以与真实玩家对战。

#### Acceptance Criteria

1. WHEN the main menu loads, THE Client SHALL display three game mode options: Duel (1v1 Bot), Chaos (FFA Bot), and Online Match (1v1 PvP)
2. WHEN a user clicks the Online Match button, THE Client SHALL navigate to the matchmaking page
3. THE Client SHALL visually distinguish the online mode from bot modes using distinct styling

### Requirement 2: WebSocket 连接管理

**User Story:** 作为玩家，我希望客户端能自动连接到游戏服务器，以便我可以进行在线匹配。

#### Acceptance Criteria

1. WHEN the user enters the matchmaking page, THE Matchmaking_Service SHALL establish a WebSocket connection to the server
2. WHILE the WebSocket connection is active, THE Matchmaking_Service SHALL maintain the connection with periodic ping/pong messages
3. IF the WebSocket connection fails, THEN THE Client SHALL display an error message and provide a retry option
4. WHEN the user leaves the matchmaking page, THE Matchmaking_Service SHALL close the WebSocket connection gracefully

### Requirement 3: 房间创建与匹配

**User Story:** 作为玩家，我希望能够创建或加入游戏房间，以便与其他玩家匹配。

#### Acceptance Criteria

1. WHEN the user clicks "Start Matching", THE Matchmaking_Service SHALL send a CREATE_ROOM message to the server with playerCount=2
2. WHEN the server responds with ROOM_CREATED, THE Client SHALL display the room code and waiting status
3. WHEN another player joins the room, THE Server SHALL send PLAYER_JOINED message to the first player
4. WHEN both players are in the room, THE Server SHALL automatically start the game and send GAME_STARTED message

### Requirement 4: 匹配页面 UI

**User Story:** 作为玩家，我希望看到清晰的匹配状态，以便了解当前匹配进度。

#### Acceptance Criteria

1. WHILE waiting for an opponent, THE Matchmaking_Page SHALL display a loading animation and "Waiting for opponent..." message
2. WHEN an opponent joins, THE Matchmaking_Page SHALL display "Opponent found!" notification
3. THE Matchmaking_Page SHALL provide a "Cancel" button to exit matchmaking at any time
4. IF matchmaking is cancelled, THEN THE Matchmaking_Service SHALL send LEAVE_ROOM message and return to main menu

### Requirement 5: 在线游戏状态同步

**User Story:** 作为玩家，我希望游戏状态能实时同步，以便我和对手看到一致的游戏画面。

#### Acceptance Criteria

1. WHEN a player performs a game action, THE Client SHALL send GAME_ACTION message to the server
2. WHEN the server processes an action, THE Server SHALL broadcast STATE_UPDATE to all players in the room
3. WHEN the client receives STATE_UPDATE, THE Client SHALL update the local game state to match the server state
4. THE Online_Game SHALL disable local bot logic and rely entirely on server-authoritative state

### Requirement 6: 在线游戏 UI 适配

**User Story:** 作为玩家，我希望在线对战时能清楚知道对手的状态。

#### Acceptance Criteria

1. WHILE it is the opponent's turn, THE Client SHALL display "Opponent's Turn" indicator instead of bot thinking animation
2. WHEN the opponent disconnects, THE Client SHALL display a notification and provide options to wait or exit
3. THE Client SHALL display both players' connection status during the game

### Requirement 7: 错误处理与断线重连

**User Story:** 作为玩家，我希望在网络问题时能得到适当的提示和处理。

#### Acceptance Criteria

1. IF the WebSocket connection is lost during a game, THEN THE Client SHALL attempt to reconnect automatically
2. IF reconnection fails after 3 attempts, THEN THE Client SHALL display an error and option to return to main menu
3. WHEN an error message is received from the server, THE Client SHALL display the error to the user
4. IF the opponent disconnects for more than 30 seconds, THEN THE Client SHALL declare the remaining player as winner

