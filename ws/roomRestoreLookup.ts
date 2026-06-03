import type { RestorableRoomSnapshot } from '../rooms/roomRestore.js';
import { restoreRoomFromSnapshot } from '../rooms/roomRestore.js';
import type {
    RoomLifecycleHandlerDependencies,
    RoomLifecycleHandlerLike
} from './roomHandlerTypes.js';

export interface RoomRestoreLookupResult<TRoom extends RoomLifecycleHandlerLike> {
    room: TRoom | null;
    errorMessage: string | null;
}

export const lookupRoomForJoin = async <TRoom extends RoomLifecycleHandlerLike>(
    roomId: string,
    deps: RoomLifecycleHandlerDependencies<TRoom>
): Promise<RoomRestoreLookupResult<TRoom>> => {
    const existingRoom = deps.rooms.get(roomId);
    if (existingRoom) {
        return { room: existingRoom, errorMessage: null };
    }

    const snapshot = await deps.loadRoomSnapshot<RestorableRoomSnapshot>(roomId);
    if (!snapshot) {
        return { room: null, errorMessage: null };
    }

    const restoreResult = restoreRoomFromSnapshot(snapshot, {
        createRoom: restoredRoomId => deps.createRoom(restoredRoomId)
    });
    const restoredRoom = restoreResult.room ?? null;
    if (restoredRoom) {
        deps.rooms.set(roomId, restoredRoom);
        return { room: restoredRoom, errorMessage: null };
    }

    return {
        room: null,
        errorMessage: restoreResult.errorMessage
    };
};
