import type { Geisha, ItemCard } from '@newhandarky/hanakoji-game-types';

export type NpcScoringPlayer = {
    playedCards: ItemCard[];
};

export type NpcSnapshotEntry = {
    npc: number;
    opp: number;
    charm: number;
};

export type NpcSnapshot = Map<number, NpcSnapshotEntry>;

export const buildGeishaCountSnapshot = (
    geishas: readonly Pick<Geisha, 'id' | 'charmPoints'>[],
    npcPlayer: NpcScoringPlayer,
    opponentPlayer: NpcScoringPlayer
): NpcSnapshot => {
    const snapshot: NpcSnapshot = new Map();

    geishas.forEach((geisha) => {
        const npcCount = npcPlayer.playedCards.filter(card => card.geishaId === geisha.id).length;
        const oppCount = opponentPlayer.playedCards.filter(card => card.geishaId === geisha.id).length;
        snapshot.set(geisha.id, {
            npc: npcCount,
            opp: oppCount,
            charm: geisha.charmPoints
        });
    });

    return snapshot;
};

export const getCardUtility = (snapshot: NpcSnapshot, geishaId: number, isNpc: boolean): number => {
    const entry = snapshot.get(geishaId);
    if (!entry) {
        return 0;
    }

    const myCount = isNpc ? entry.npc : entry.opp;
    const oppCount = isNpc ? entry.opp : entry.npc;
    const charm = entry.charm;

    if (myCount + 1 > oppCount && myCount <= oppCount) {
        return charm * 4;
    }

    if (myCount + 1 === oppCount) {
        return charm * 2;
    }

    return charm;
};

export const evaluateSnapshot = (snapshot: NpcSnapshot): number => {
    let npcScore = 0;
    let oppScore = 0;

    snapshot.forEach((entry) => {
        const base = entry.charm * 2;
        const diff = entry.npc - entry.opp;

        npcScore += base + diff * 3;
        oppScore += base - diff * 3;
    });

    return npcScore - oppScore;
};

export const applyCardsToSnapshot = (
    snapshot: NpcSnapshot,
    geishaIdList: readonly number[],
    isNpc: boolean
): NpcSnapshot => {
    const next: NpcSnapshot = new Map();
    snapshot.forEach((value: NpcSnapshotEntry, key: number) => {
        next.set(key, { ...value });
    });

    geishaIdList.forEach((geishaId) => {
        const entry = next.get(geishaId);
        if (!entry) {
            return;
        }
        if (isNpc) {
            entry.npc += 1;
        } else {
            entry.opp += 1;
        }
    });

    return next;
};
