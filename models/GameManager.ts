// src/models/GameManager.ts
import { GameState, GameAction, Player } from "@newhandarky/hanakoji-game-types";
import { gameReducer, initialState } from '../reducers/gameReducer';
import { createRandomizedGeishas } from '../utils/gameUtils';
import { backendLogger } from '../utils/runtimeLogger.js';

class GameManager {
    // 遊戲房間資料表（gameId → GameState）
    private games: Map<string, GameState> = new Map();

    // 建立新遊戲房間
    createGame(gameId: string): GameState {
        // 建立初始狀態並隨機產生藝妓
        const gameState: GameState = {
            ...initialState,
            gameId,
            geishas: createRandomizedGeishas(), // 後端統一生成
        };

        this.games.set(gameId, gameState);
        backendLogger.diagnostic('🐞 [GameManager] 建立遊戲房間摘要', { gameId });
        return gameState;
    }

    // 加入玩家
    addPlayer(gameId: string, player: Player): GameState | null {
        const game = this.games.get(gameId);
        if (!game) return null;

        // 檢查玩家是否已存在
        const existingPlayer = game.players.find(p => p.id === player.id);
        if (existingPlayer) {
            return game; // 玩家已存在，直接返回當前狀態
        }

        const updatedGame = {
            ...game,
            players: [...game.players, player]
        };

        this.games.set(gameId, updatedGame);
        return updatedGame;
    }

    // 執行遊戲動作
    executeAction(gameId: string, action: GameAction): GameState | null {
        const game = this.games.get(gameId);
        if (!game) return null;

        // 透過 reducer 計算新狀態
        const newState = gameReducer(game, action);
        this.games.set(gameId, newState);

        backendLogger.diagnostic('🐞 [GameManager] 執行遊戲動作摘要', {
            gameId,
            actionType: action.type
        });
        return newState;
    }

    // 獲取遊戲狀態
    getGame(gameId: string): GameState | null {
        return this.games.get(gameId) || null;
    }

    // 移除遊戲房間
    removeGame(gameId: string): boolean {
        return this.games.delete(gameId);
    }
}

// 全域 GameManager 單例
export const gameManager = new GameManager();
