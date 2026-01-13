# Implementation Plan: Jackaroo Node.js Game Server

## Overview

本实现计划将现有客户端游戏逻辑提取为共享模块，并构建 Node.js WebSocket 游戏服务端。采用增量开发方式，每个任务都建立在前一个任务的基础上。

## Tasks

- [x] 1. 提取共享逻辑模块
  - [x] 1.1 创建 shared/ 目录结构并迁移类型定义
    - 创建 `shared/` 目录
    - 复制 `types.ts` 和 `constants.ts` 到 shared/
    - 更新导入路径
    - _Requirements: 1.1, 1.2_

  - [x] 1.2 重构 gameLogic.ts 支持依赖注入
    - 复制 `gameLogic.ts` 到 shared/
    - 创建 `GameLogicConfig` 接口
    - 将 `generateId` 和 `shuffleArray` 改为可注入函数
    - 导出 `createGameLogic` 工厂函数
    - _Requirements: 1.4, 1.5_

  - [x] 1.3 迁移 moveEngine.ts 和 boardService.ts
    - 复制到 shared/ 目录
    - 更新所有导入路径
    - 确保无浏览器特定代码
    - _Requirements: 1.2, 1.3_

  - [x] 1.4 编写共享逻辑属性测试
    - **Property 7: Action Validation and Processing**
    - 测试 gameReducer 处理各种动作的正确性
    - **Validates: Requirements 5.1, 5.2, 5.3, 5.4**

- [x] 2. 搭建服务端基础架构
  - [x] 2.1 初始化服务端项目
    - 创建 `server/` 目录
    - 初始化 `package.json`（添加 ws、uuid 等依赖）
    - 配置 TypeScript
    - 创建入口文件 `server/index.ts`
    - _Requirements: 2.1_

  - [x] 2.2 实现消息协议定义
    - 创建 `server/protocol.ts`
    - 定义所有客户端和服务端消息类型
    - 实现消息验证函数
    - _Requirements: 6.1, 6.2, 6.3, 6.4_

  - [ ]* 2.3 编写消息协议属性测试
    - **Property 8: Message Protocol Compliance**
    - 测试所有消息都包含 type 字段且为有效 JSON
    - **Validates: Requirements 6.1, 6.2, 6.3**

- [ ] 3. Checkpoint - 确保基础架构测试通过
  - 确保所有测试通过，如有问题请询问用户

- [x] 4. 实现玩家会话管理
  - [x] 4.1 实现 PlayerSession 类
    - 创建 `server/PlayerSession.ts`
    - 实现连接状态管理（connected/disconnected/reconnecting）
    - 实现 60 秒重连窗口逻辑
    - 实现消息发送方法
    - _Requirements: 2.1, 2.2, 2.3_

  - [ ]* 4.2 编写会话生命周期属性测试
    - **Property 1: Session Lifecycle Consistency**
    - 测试连接、断开、重连状态转换
    - **Validates: Requirements 2.1, 2.2, 2.3**

- [x] 5. 实现房间管理
  - [x] 5.1 实现 Room 类
    - 创建 `server/Room.ts`
    - 实现玩家添加/移除
    - 集成共享逻辑创建游戏状态
    - 实现状态过滤（隐藏其他玩家手牌）
    - _Requirements: 3.2, 3.3, 4.5_

  - [ ]* 5.2 编写手牌隐私属性测试
    - **Property 6: Hand Privacy**
    - 测试 filterStateForPlayer 正确隐藏其他玩家手牌
    - **Validates: Requirements 4.5**

  - [x] 5.3 实现 RoomManager 类
    - 创建 `server/RoomManager.ts`
    - 实现房间创建（生成唯一房间码）
    - 实现房间加入/离开
    - 实现空房间清理逻辑
    - _Requirements: 3.1, 3.4, 3.5, 3.6_

  - [ ]* 5.4 编写房间码唯一性属性测试
    - **Property 2: Room Code Uniqueness**
    - 测试多次创建房间生成的码都唯一
    - **Validates: Requirements 3.1**

  - [ ]* 5.5 编写房间容量属性测试
    - **Property 3: Room Capacity Enforcement**
    - 测试房间满员后拒绝新玩家
    - **Validates: Requirements 3.2, 3.3, 3.6**

- [x] 6. Checkpoint - 确保房间管理测试通过
  - 确保所有测试通过，如有问题请询问用户

- [x] 7. 实现 WebSocket 服务
  - [x] 7.1 实现 WebSocketServer 类
    - 创建 `server/WebSocketServer.ts`
    - 实现连接处理
    - 实现断开处理
    - 实现消息路由
    - _Requirements: 2.1, 2.2, 2.4, 2.5_

  - [x] 7.2 实现 MessageHandler 类
    - 创建 `server/MessageHandler.ts`
    - 实现 CREATE_ROOM 处理
    - 实现 JOIN_ROOM 处理
    - 实现 LEAVE_ROOM 处理
    - 实现 GAME_ACTION 处理
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

  - [ ]* 7.3 编写错误消息处理属性测试
    - **Property 9: Malformed Message Handling**
    - 测试无效消息返回错误响应
    - **Validates: Requirements 6.5**

- [x] 8. 实现游戏动作处理
  - [x] 8.1 实现回合验证逻辑
    - 在 Room 中添加 isCurrentPlayer 检查
    - 在 MessageHandler 中验证动作来源
    - 拒绝非当前玩家的动作
    - _Requirements: 4.3, 4.4_

  - [ ]* 8.2 编写回合验证属性测试
    - **Property 5: Turn Validation**
    - 测试非当前玩家的动作被拒绝
    - **Validates: Requirements 4.3, 4.4**

  - [x] 8.3 实现状态广播逻辑
    - 在 Room 中实现 broadcastState 方法
    - 为每个玩家过滤状态后发送
    - 处理断开连接的玩家
    - _Requirements: 4.1, 4.2_

  - [ ]* 8.4 编写状态广播属性测试
    - **Property 4: State Broadcast Consistency**
    - 测试所有玩家收到一致的状态更新
    - **Validates: Requirements 4.1, 4.2**

- [x] 9. Checkpoint - 确保游戏动作处理测试通过
  - 确保所有测试通过，如有问题请询问用户

- [x] 10. 实现错误处理和限流
  - [x] 10.1 实现全局错误处理
    - 添加 try-catch 包装所有消息处理
    - 实现错误日志记录
    - 确保错误不会导致服务器崩溃
    - _Requirements: 7.1, 7.2, 7.3_

  - [ ]* 10.2 编写错误恢复属性测试
    - **Property 10: Error Resilience**
    - 测试异常不会导致服务器崩溃
    - **Validates: Requirements 7.1**

  - [x] 10.3 实现限流机制
    - 添加每个会话的请求计数器
    - 实现滑动窗口限流
    - 超限时返回错误并暂时拒绝请求
    - _Requirements: 7.4_

  - [ ]* 10.4 编写限流属性测试
    - **Property 11: Rate Limiting**
    - 测试超过限制的请求被拒绝
    - **Validates: Requirements 7.4**

  - [x] 10.5 实现健康检查端点
    - 添加 HTTP 健康检查路由
    - 返回服务器状态信息
    - _Requirements: 7.5_

- [-] 11. 集成和最终测试
  - [x] 11.1 更新客户端导入路径
    - 修改客户端代码从 shared/ 导入
    - 确保客户端仍能正常运行
    - _Requirements: 1.3, 1.4_

  - [ ]* 11.2 编写集成测试
    - 测试完整的 WebSocket 连接流程
    - 测试创建房间 → 加入房间 → 开始游戏 → 执行动作流程
    - _Requirements: 全部_

- [x] 12. Final Checkpoint - 确保所有测试通过
  - 确保所有测试通过，如有问题请询问用户

## Notes

- 标记 `*` 的任务为可选测试任务，可跳过以加快 MVP 开发
- 每个任务都引用了具体的需求以便追溯
- 检查点确保增量验证
- 属性测试验证普遍正确性属性
- 单元测试验证具体示例和边界情况
