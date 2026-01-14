# Implementation Plan: Online 1v1 Matchmaking

## Overview

本实现计划将在线1v1匹配功能分解为可执行的编码任务。采用增量开发方式，每个任务都建立在前一个任务的基础上。

## Tasks

- [x] 1. 创建 WebSocket 服务模块
  - [x] 1.1 创建 `services/WebSocketService.ts` 文件
    - 实现 WebSocketService 类
    - 实现 connect(), disconnect(), send() 方法
    - 实现连接状态管理 (disconnected, connecting, connected, error)
    - 实现消息监听器注册机制
    - _Requirements: 2.1, 2.4_
  - [x] 1.2 实现 Ping/Pong 心跳机制
    - 每30秒发送 PING 消息
    - 处理 PONG 响应
    - _Requirements: 2.2_
  - [x] 1.3 实现自动重连逻辑
    - 断线后自动尝试重连
    - 最多重试3次
    - 重连失败后触发错误回调
    - _Requirements: 7.1, 7.2_
  - [x] 1.4 编写 WebSocketService 单元测试
    - 测试连接建立和断开
    - 测试消息发送
    - 测试重连逻辑
    - _Requirements: 2.1, 2.2, 2.4, 7.1, 7.2_

- [x] 2. 创建协议类型定义
  - [x] 2.1 将协议移至 `shared/protocol.ts` 共享模块
    - 将 server/src/protocol.ts 移动到 shared/protocol.ts
    - 服务端和客户端共用同一份协议定义
    - 导出 ClientMessage 和 ServerMessage 类型
    - 导出消息创建辅助函数
    - _Requirements: 3.1, 5.1_

- [x] 3. Checkpoint - 确保 WebSocket 服务可用
  - 确保所有测试通过，如有问题请询问用户

- [x] 4. 创建匹配页面组件
  - [x] 4.1 创建 `components/MatchmakingPage.tsx` 文件
    - 实现匹配状态管理 (connecting, creating_room, waiting, opponent_found, starting, error)
    - 实现等待动画和状态文字显示
    - 实现取消按钮
    - _Requirements: 4.1, 4.2, 4.3, 4.4_
  - [x] 4.2 实现匹配逻辑
    - 组件挂载时连接 WebSocket
    - 发送 CREATE_ROOM 消息
    - 处理 ROOM_CREATED, PLAYER_JOINED, GAME_STARTED 消息
    - 组件卸载时发送 LEAVE_ROOM 并断开连接
    - _Requirements: 2.1, 2.4, 3.1, 3.2_
  - [x] 4.3 实现错误处理 UI
    - 显示连接错误
    - 提供重试按钮
    - _Requirements: 2.3, 7.3_
  - [x] 4.4 编写 MatchmakingPage 单元测试
    - 测试状态流转
    - 测试取消匹配
    - 测试错误显示
    - _Requirements: 4.1, 4.2, 4.3, 4.4_

- [x] 5. 创建在线游戏组件
  - [x] 5.1 创建 `components/OnlineGame.tsx` 文件
    - 基于现有 Game.tsx 组件结构
    - 接收 roomCode, playerIndex, initialState 作为 props
    - 禁用本地 Bot 逻辑
    - _Requirements: 5.4, 6.1_
  - [x] 5.2 实现游戏动作发送
    - 拦截所有游戏动作
    - 通过 WebSocket 发送 GAME_ACTION 消息
    - _Requirements: 5.1_
  - [x] 5.3 实现状态同步
    - 监听 STATE_UPDATE 消息
    - 更新本地游戏状态
    - _Requirements: 5.3_
  - [x] 5.4 实现对手状态显示
    - 显示 "Opponent's Turn" 指示器
    - 显示双方连接状态
    - _Requirements: 6.1, 6.3_
  - [x] 5.5 实现断线处理
    - 监听 PLAYER_LEFT 消息
    - 显示对手断线通知
    - 实现30秒超时判定胜利
    - _Requirements: 6.2, 7.4_
  - [x] 5.6 编写 OnlineGame 单元测试
    - 测试状态同步
    - 测试动作发送
    - 测试断线处理
    - _Requirements: 5.1, 5.3, 5.4, 6.1, 6.2_

- [x] 6. Checkpoint - 确保在线游戏组件可用
  - 确保所有测试通过，如有问题请询问用户

- [x] 7. 修改主菜单和应用入口
  - [x] 7.1 修改 `components/MainMenu.tsx`
    - 添加 "Online Match (1v1 PvP)" 按钮
    - 添加 onStartOnlineMatch 回调
    - 使用不同样式区分在线模式
    - _Requirements: 1.1, 1.2, 1.3_
  - [x] 7.2 修改 `App.tsx`
    - 添加 MATCHMAKING 和 ONLINE_GAME 模式
    - 实现模式切换逻辑
    - 管理在线游戏上下文 (roomCode, playerIndex, initialState)
    - _Requirements: 1.2_
  - [x] 7.3 编写 MainMenu 和 App 集成测试
    - 测试模式切换
    - 测试导航流程
    - _Requirements: 1.1, 1.2_

- [x] 8. 属性测试
  - [x] 8.1 编写 Ping/Pong 属性测试
    - **Property 1: Ping/Pong Connection Maintenance**
    - **Validates: Requirements 2.2**
  - [x] 8.2 编写游戏动作传输属性测试
    - **Property 2: Game Action Transmission**
    - **Validates: Requirements 5.1**
  - [x] 8.3 编写状态同步属性测试
    - **Property 3: State Synchronization**
    - **Validates: Requirements 5.3**
  - [x] 8.4 编写自动重连属性测试
    - **Property 4: Automatic Reconnection**
    - **Validates: Requirements 7.1, 7.2**
  - [x] 8.5 编写错误消息显示属性测试
    - **Property 5: Error Message Display**
    - **Validates: Requirements 7.3**

- [x] 9. Final Checkpoint - 完整功能验证
  - 确保所有测试通过
  - 验证完整匹配流程
  - 如有问题请询问用户

## Notes

- 所有任务都是必需的，包括测试任务
- 每个任务都引用了具体的需求编号以便追溯
- Checkpoint 任务用于阶段性验证
- 属性测试使用 fast-check 库实现
