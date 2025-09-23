// src/models/GameManager.ts
import { GameState, GameAction, Player, ActionToken } from "game-shared-types";
import { gameReducer, initialState } from '../reducers/gameReducer';
import { createRandomizedGeishas } from '../utils/gameUtils';

class GameManager {
    private games: Map<string, GameState> = new Map();

    private createDefaultActionTokens(): ActionToken[] {
        return [
            { type: 'secret', used: false },
            { type: 'trade-off', used: false },
            { type: 'gift', used: false },
            { type: 'competition', used: false },
        ];
    }

    private ensurePlayerState(player: Player): Player {
        return {
            id: player.id,
            name: player.name || player.id,
            hand: player.hand ?? [],
            playedCards: player.playedCards ?? [],
            secretCards: player.secretCards ?? [],
            discardedCards: player.discardedCards ?? [],
            actionTokens: (player.actionTokens && player.actionTokens.length > 0)
                ? player.actionTokens
                : this.createDefaultActionTokens()
        };
    }

    // 建立新遊戲房間
    createGame(gameId: string): GameState {
        const gameState: GameState = {
            ...initialState,
            gameId,
            geishas: createRandomizedGeishas(), // 後端統一生成
        };

        this.games.set(gameId, gameState);
        console.log(`🎮 遊戲房間已建立: ${gameId}`);
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
            players: [...game.players, this.ensurePlayerState(player)]
        };

        this.games.set(gameId, updatedGame);
        return updatedGame;
    }

    // 執行遊戲動作
    executeAction(gameId: string, action: GameAction): GameState | null {
        const game = this.games.get(gameId);
        if (!game) return null;

        const newState = gameReducer(game, action);
        this.games.set(gameId, newState);

        console.log(`🎯 遊戲動作執行: ${action.type} in ${gameId}`);
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

export const gameManager = new GameManager();
