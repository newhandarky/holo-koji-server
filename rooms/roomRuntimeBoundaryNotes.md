# Room Runtime Boundary Notes

## 154 Review Scope

- `GameRoom` already acts mostly as a facade for room state, membership, opening, match, turn, NPC, and action runtimes.
- `roomActionRuntime.ts` still owns two event sequencing concerns in addition to action validation and transition application:
  - active action events: `ACTION_EXECUTED` per recipient, then game-state broadcast, then `endTurn()`;
  - resolved interaction events: `INTERACTION_RESOLVED`, then game-state broadcast, then `endTurn()`.
- Opening, turn, round, NPC timer wiring remains intentionally unchanged in this batch. Those paths have tighter scheduling and snapshot side effects, so they should only be extracted with a separate focused risk review.

## 155 Extraction Target

- Extract action event emission and post-action sequencing from `roomActionRuntime.ts`.
- Preserve event names, payload shapes, recipient-specific hidden-card redaction, broadcast order, and `endTurn()` timing.
- Keep `GameRoom` public method names unchanged.

## 156 Regression Target

- Cover active action event sequencing.
- Cover resolved interaction event sequencing.
- Keep the existing missing game-state guard coverage.

## 239 Facade 對照

`GameRoom` 刻意保留為 room runtime collaborators 的 public facade。它的 method surface 必須對 WebSocket handlers、room registry、restore logic 與 focused runtime tests 保持穩定。

- Snapshot / persistence：`buildRoomSnapshot()`、`persistRoomSnapshot()`。
- Seat / membership：`addPlayer()`、`removePlayer()`、`detachPlayerConnection()`、`isFull()`、`getPlayerMetaMap()`。
- Client events：`sendToPlayer()`、`sendError()`、`broadcast()`、`broadcastGameState()`、`broadcastGameStateEvent()`、`buildClientGameState()`、`sendPendingInteractionState()`、`buildDealSequenceForPlayer()`。
- Opening / order：`prepareRoundState()`、`prepareOrderDecisionState()`、`startOrderDecision()`、`decideOrder()`、`confirmOrder()`、`startGameWithOrder()`。
- Turn / round：`beginTurnForCurrentPlayer()`、`endTurn()`、`resolveRound()`、`scheduleNextRound()`、`startNextRound()`、`validateRoundSetup()`。
- NPC：`addNpcPlayer()`、`isNpcPlayerId()`、`clearNpcTimers()`、`scheduleNpcTurn()`、`scheduleNpcResponse()`、`performNpcAction()`、`performNpcResponse()`、`buildNpcAction()`。
- Match flow：`requestRematch()`、`startReadyCheck()`、`confirmReady()`、`startRematch()`。
- Action / interaction：guard methods 加上 `handleAction()`、active actions、interaction initiate / resolve methods。

## 242 Confidence 目標

- `GameRoom` method names、parameters 與 return values 維持不變。
- 除非出現具體 sequencing 問題，優先用 facade grouping comments 與 regression tests，不再做 production extraction。
- 在 `gameRoom.test.ts` 直接保護高風險路徑：viewer-safe projection、direct message routing、snapshot / restore resume delegation、opening event order、NPC scheduling、ready / rematch payloads。
