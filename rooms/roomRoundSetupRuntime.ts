import type {
    CustomCharacterSelection,
    Geisha,
    GeishaSet,
    RoomSetupMode
} from '@newhandarky/hanakoji-game-types';
import { DEFAULT_GEISHA_SET } from '../game/geishaSetRules.js';
import {
    createCustomSelectedGeishas,
    createRandomizedGeishas
} from '../game/geishaBoardFactory.js';
import type {
    PlayerMetaMap,
    ServerGameState
} from '../game/serverGameStateTypes.js';
import {
    backendLogger,
    summarizeGameState
} from '../utils/runtimeLogger.js';
import {
    buildPreparedRoundState,
    inspectRoundSetup,
    type DealSequenceStep
} from '../game/roundPreparation.js';
import { GEISHA_SET_CONFIG_ERROR_MESSAGE } from './roomErrors.js';

export type RoundPreparationOptions = {
    orderedPlayerIds?: string[] | null;
    roundNumber?: number | null;
    openOrderDecision?: boolean;
};

export type RoomRoundSetupRuntime = {
    roomId: string;
    hostId: string | null;
    players: Array<{ playerId: string }>;
    geishaSet: GeishaSet;
    setupMode: RoomSetupMode;
    customSelection: CustomCharacterSelection | null;
    baseGeishas: Geisha[] | null;
    dealSequence: DealSequenceStep[];
    gameState: ServerGameState | null;
    getPlayerMetaMap: () => PlayerMetaMap;
    sendError: (playerId: string, message: string, code?: string) => void;
    validateRoundSetup: () => void;
};

export const regenerateRoomBaseGeishas = (room: RoomRoundSetupRuntime): boolean => {
    try {
        const activeGeishaSet = room.geishaSet ?? DEFAULT_GEISHA_SET;
        room.baseGeishas = room.setupMode === 'custom'
            ? createCustomSelectedGeishas(activeGeishaSet, room.customSelection ?? undefined)
            : createRandomizedGeishas(activeGeishaSet);
        return true;
    } catch (error) {
        backendLogger.error(`❌ 房間 ${room.roomId} 建立藝妓資料失敗`, {
            roomId: room.roomId,
            error: error instanceof Error ? error.message : 'unknown'
        });
        room.players.forEach((player) => {
            room.sendError(player.playerId, GEISHA_SET_CONFIG_ERROR_MESSAGE);
        });
        return false;
    }
};

export const ensureRoomBaseGeishas = (room: RoomRoundSetupRuntime): boolean => {
    if (room.baseGeishas) {
        return true;
    }

    return regenerateRoomBaseGeishas(room);
};

export const prepareRoomRoundState = (
    room: RoomRoundSetupRuntime,
    { orderedPlayerIds = null, roundNumber = null, openOrderDecision = true }: RoundPreparationOptions = {}
): void => {
    const playerIds = orderedPlayerIds ?? room.players.map(player => player.playerId);

    if (playerIds.length < 2) {
        backendLogger.warn(`⚠️ 房間 ${room.roomId} 嘗試準備回合，但玩家不足`, {
            roomId: room.roomId,
            playerCount: playerIds.length
        });
        return;
    }

    if (!ensureRoomBaseGeishas(room)) {
        return;
    }

    const baseGeishas = room.baseGeishas;
    if (!baseGeishas) {
        return;
    }

    const resolvedRound = roundNumber ?? room.gameState?.round ?? 1;
    const preparation = buildPreparedRoundState({
        roomId: room.roomId,
        hostId: room.hostId,
        playerIds,
        baseGeishas,
        playerMetaMap: room.getPlayerMetaMap(),
        roundNumber: resolvedRound,
        openOrderDecision
    });
    if (!preparation.ok) {
        backendLogger.error(`❌ 房間 ${room.roomId} 準備回合失敗`, {
            roomId: room.roomId,
            error: preparation.errorMessage
        });
        return;
    }

    room.dealSequence = preparation.dealSequence;
    room.gameState = preparation.gameState;

    backendLogger.info(`🃏 房間 ${room.roomId} 已準備新回合`, {
        roomId: room.roomId,
        dealSequenceLength: room.dealSequence.length,
        ...summarizeGameState(room.gameState)
    });

    room.validateRoundSetup();
};

export const validateRoomRoundSetup = (room: Pick<RoomRoundSetupRuntime, 'roomId' | 'gameState'>): void => {
    if (!room.gameState) {
        return;
    }

    const diagnostics = inspectRoundSetup(room.gameState);

    if (diagnostics.hasUnexpectedTotalCards) {
        backendLogger.warn(`⚠️ 房間 ${room.roomId} 牌數異常`, {
            roomId: room.roomId,
            totalCardsInGame: diagnostics.totalCardsInGame,
            expectedCards: 21
        });
    }

    if (diagnostics.hasUnexpectedHandSizes) {
        backendLogger.warn(`⚠️ 房間 ${room.roomId} 手牌數量異常`, {
            roomId: room.roomId,
            handSizes: diagnostics.handSizes.join(',')
        });
    }

    if (diagnostics.hasUnexpectedDrawPileSize) {
        backendLogger.warn(`⚠️ 房間 ${room.roomId} 牌堆數量異常`, {
            roomId: room.roomId,
            drawPileSize: diagnostics.drawPileSize
        });
    }

    if (diagnostics.hasDuplicateCardIds) {
        backendLogger.warn(`⚠️ 房間 ${room.roomId} 發現重複卡片 ID，請檢查洗牌與發牌流程`, {
            roomId: room.roomId
        });
    }
};
