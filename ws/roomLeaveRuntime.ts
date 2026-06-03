import type { WebSocket } from 'ws';
import { backendLogger } from '../utils/runtimeLogger.js';
import type { WebSocketConnectionContext } from './connectionContext.js';
import type {
    RoomLifecycleHandlerDependencies,
    RoomLifecycleHandlerLike
} from './roomHandlerTypes.js';

export const leaveRoomFromLifecycleContext = <TRoom extends RoomLifecycleHandlerLike>(
    ws: WebSocket,
    context: WebSocketConnectionContext,
    deps: RoomLifecycleHandlerDependencies<TRoom>
): void => {
    if (context.currentRoomId && context.currentPlayerId) {
        const room = deps.rooms.get(context.currentRoomId);
        if (room) {
            const shouldDetachOnly = room.gameState?.phase && room.gameState.phase !== 'waiting';
            if (shouldDetachOnly) {
                room.detachPlayerConnection(context.currentPlayerId, ws);
            } else {
                const removed = room.removePlayer(context.currentPlayerId, ws);
                if (!removed) {
                    context.currentRoomId = null;
                    context.currentPlayerId = null;
                    return;
                }
                room.broadcast({ type: 'PLAYER_LEFT', payload: { playerId: context.currentPlayerId } });
                const firstSeat = room.players[0];
                const hasOnlyNpc = room.players.length === 1 && room.npcId && firstSeat?.playerId === room.npcId;
                if (room.players.length === 0 || hasOnlyNpc) {
                    deps.rooms.delete(context.currentRoomId);
                    void deps.deleteRoomSnapshot(context.currentRoomId);
                    backendLogger.info(`🗑️ 房間 ${context.currentRoomId} 已刪除`, { roomId: context.currentRoomId });
                }
            }
        }
    }
    context.currentRoomId = null;
    context.currentPlayerId = null;
};
