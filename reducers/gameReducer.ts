// src/reducers/gameReducer.ts
import type { GameState, GameAction, Geisha } from "@newhandarky/hanakoji-game-types"
// 後端統一由 geisha board factory 建立藝妓資料
import { createRandomizedGeishas } from '../game/geishaBoardFactory';
import { backendLogger } from '../utils/runtimeLogger.js';

// 初始藝妓資料（隨機順序）
const initialGeishas: Geisha[] = createRandomizedGeishas();

// 初始遊戲狀態
export const initialState: GameState = {
    gameId: '',
    players: [],
    geishas: initialGeishas,
    currentPlayer: 0,
    phase: 'waiting',
    round: 1,
    winner: undefined,
    orderDecision: {
        isOpen: false,
        phase: 'deciding',
        players: [],
        result: undefined,
        confirmations: [],
        waitingFor: [],
        currentPlayer: '',
        onConfirm: () => { }
    }
};

// 遊戲狀態 reducer（僅供部分後端模組使用）
export const gameReducer = (state: GameState, action: GameAction): GameState => {
    backendLogger.diagnostic('🐞 [Reducer] 收到動作摘要', {
        gameId: state.gameId || undefined,
        actionType: action.type,
        playerCount: state.players.length
    });

    switch (action.type) {
        case 'INIT_GAME':
            const newState = {
                ...state,
                gameId: action.payload.gameId,
                players: action.payload.players,
                phase: action.payload.players.length >= 2 ?
                    (action.payload.players[0].hand.length > 0 ? 'playing' as const : 'waiting' as const) :
                    'waiting' as const
            };

            return newState;

        // 新增：開始順序決定
        case 'START_ORDER_DECISION':
            return {
                ...state,
                phase: 'deciding_order',
                orderDecision: {
                    isOpen: true,
                    phase: 'deciding',
                    players: action.payload.players,
                    result: undefined,
                    confirmations: [],
                    waitingFor: [],
                    currentPlayer: action.payload.players[0],
                    onConfirm: () => { }
                }
            };

        // 新增：順序決定結果
        case 'ORDER_DECISION_RESULT':
            return {
                ...state,
                orderDecision: {
                    ...state.orderDecision,
                    phase: 'result',
                    result: action.payload,
                    waitingFor: state.orderDecision.players // 初始時所有玩家都需要確認
                }
            };

        // 新增：更新確認狀態
        case 'UPDATE_ORDER_CONFIRMATIONS':
            const updatedOrderDecision = {
                ...state,
                orderDecision: {
                    ...state.orderDecision,
                    phase: action.payload.waitingFor.length > 0 ? 'waiting_confirmation' as const : 'result' as const,
                    confirmations: action.payload.confirmations,
                    waitingFor: action.payload.waitingFor
                }
            };

            // 如果所有玩家都確認了，隱藏順序決定彈窗
            if (action.payload.waitingFor.length === 0) {
                return {
                    ...updatedOrderDecision,
                    orderDecision: {
                        ...updatedOrderDecision.orderDecision,
                        isOpen: false
                    }
                };
            }

            return updatedOrderDecision;

        case 'PLAY_ACTION':
            return {
                ...state,
                // 這裡可以添加具體的遊戲動作處理邏輯
            };

        case 'END_TURN':
            return {
                ...state,
                currentPlayer: (state.currentPlayer + 1) % state.players.length
            };

        case 'END_GAME':
            return {
                ...state,
                phase: 'ended',
                winner: action.payload.winner
            };

        default:
            backendLogger.warn('⚠️ [Reducer] 未知動作類型', {
                gameId: state.gameId || undefined,
                actionType: action.type
            });
            return state;
    }
};
