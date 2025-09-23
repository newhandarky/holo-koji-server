// src/reducers/gameReducer.ts
import { GameState, GameAction, Geisha } from "game-shared-types"
import { createRandomizedGeishas } from '../utils/gameUtils';

const initialGeishas: Geisha[] = createRandomizedGeishas();

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
        currentPlayer: ''
    }
};

export const gameReducer = (state: GameState, action: GameAction): GameState => {
    console.log('🔄 [Reducer] ===== 收到動作 =====');
    console.log('🔄 [Reducer] 動作類型:', action.type);
    console.log('🔄 [Reducer] 動作內容:', action);
    console.log('🔄 [Reducer] 當前狀態:', state);

    switch (action.type) {
        case 'INIT_GAME':
            console.log('🚨 [Reducer] ===== 處理 INIT_GAME =====');
            console.log('🚨 [Reducer] payload.gameId:', action.payload.gameId);
            console.log('🚨 [Reducer] payload.players:', action.payload.players);

            const newState = {
                ...state,
                gameId: action.payload.gameId,
                players: action.payload.players,
                phase: action.payload.players.length >= 2 ?
                    (action.payload.players[0].hand.length > 0 ? 'playing' as const : 'waiting' as const) :
                    'waiting' as const
            };

            console.log('✅ [Reducer] INIT_GAME 處理完成');
            console.log('✅ [Reducer] 新狀態 gameId:', newState.gameId);
            console.log('✅ [Reducer] 新狀態 players:', newState.players);
            console.log('✅ [Reducer] 新狀態 phase:', newState.phase);

            return newState;

        // 新增：開始順序決定
        case 'START_ORDER_DECISION':
            console.log('🎲 [Reducer] ===== 處理 START_ORDER_DECISION =====');
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
                    currentPlayer: action.payload.players[0]
                }
            };

        // 新增：順序決定結果
        case 'ORDER_DECISION_RESULT':
            console.log('🎯 [Reducer] ===== 處理 ORDER_DECISION_RESULT =====');
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
            console.log('✅ [Reducer] ===== 處理 UPDATE_ORDER_CONFIRMATIONS =====');
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

        case 'SYNC_SERVER_STATE':
            console.log('🌐 [Reducer] ===== 處理 SYNC_SERVER_STATE =====');
            return {
                ...state,
                ...action.payload,
                orderDecision: {
                    ...state.orderDecision,
                    ...action.payload.orderDecision,
                }
            };

        case 'PLAY_ACTION':
            console.log('🎯 [Reducer] ===== 處理 PLAY_ACTION =====');
            return {
                ...state,
                // 這裡可以添加具體的遊戲動作處理邏輯
            };

        case 'END_TURN':
            console.log('⏭️ [Reducer] ===== 處理 END_TURN =====');
            return {
                ...state,
                currentPlayer: (state.currentPlayer + 1) % state.players.length
            };

        case 'END_GAME':
            console.log('🏆 [Reducer] ===== 處理 END_GAME =====');
            return {
                ...state,
                phase: 'ended',
                winner: action.payload.winner
            };

        // !
        // case 'RESET_GAME':
        //     return {
        //         ...state,
        //         geishas: initialGeishas, // 重置時重新隨機
        //         phase: 'waiting',
        //         currentPlayer: 0,
        //     };

        // case 'START_NEW_ROUND':
        //     return {
        //         ...state,
        //         geishas: createRandomizedGeishas(), // 新回合重新隨機
        //     };

        default:
            console.warn('⚠️ [Reducer] 未知動作類型:', action);
            return state;
    }
};
