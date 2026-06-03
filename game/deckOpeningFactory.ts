import type {
    Geisha,
    ItemCard,
    OpeningDealSummary,
    OpeningDealStep
} from '@newhandarky/hanakoji-game-types';
import { ginzaBoardSlotDefinitions } from './geishaSetCatalog.js';
import {
    defaultRandomSource,
    normalizeRandomSource,
    shuffleArray,
    type PartialRandomSource
} from './gameRandomSource.js';

interface OpeningDealInputStep {
    playerId: string;
}

interface OpeningDealOptions {
    sequenceId?: string;
    status?: 'pending' | 'completed' | 'not_replayable';
    replayable?: boolean;
}

const buildGinzaCardForGeisha = (
    geisha: Geisha,
    copy: number,
    randomSource: PartialRandomSource = defaultRandomSource
): ItemCard => {
    const source = normalizeRandomSource(randomSource);
    const boardSlot = ginzaBoardSlotDefinitions.find((slot) => slot.slotId === geisha.boardSlotId);
    if (!boardSlot) {
        throw new Error(`Missing Ginza board slot definition for slot ${geisha.boardSlotId}`);
    }

    return {
        id: `card-${geisha.id}-${copy}-${source.nextToken()}`,
        geishaId: geisha.id,
        type: boardSlot.itemAssetName,
        boardSlotId: boardSlot.slotId,
        itemAssetName: boardSlot.itemAssetName,
        itemLabel: boardSlot.itemLabel,
        itemImageUrl: boardSlot.itemImageUrl,
        itemIconUrl: boardSlot.itemIconUrl
    };
};

export const buildDeckForGeishas = (
    geishas: Geisha[],
    options: { randomSource?: PartialRandomSource } = {}
): { deck: ItemCard[]; removedCard: ItemCard | null } => {
    const { randomSource = defaultRandomSource } = options;
    const cards: ItemCard[] = [];

    geishas.forEach((geisha) => {
        const copies = geisha.charmPoints ?? 0;
        for (let copy = 0; copy < copies; copy += 1) {
            if (!geisha.boardSlotId) {
                throw new Error(`Missing boardSlotId for geisha ${geisha.id}`);
            }
            cards.push(buildGinzaCardForGeisha(geisha, copy, randomSource));
        }
    });

    const shuffled = shuffleArray(cards, randomSource);
    const removedCard = shuffled.pop() ?? null;

    return {
        deck: shuffled,
        removedCard
    };
};

export const buildOpeningDealSummary = (
    dealSequence: OpeningDealInputStep[] = [],
    options: OpeningDealOptions = {}
): OpeningDealSummary => {
    const {
        sequenceId = 'opening-deal',
        status = 'completed',
        replayable = true
    } = options;
    const cardIndexesByPlayer = new Map<string, number>();
    const steps: OpeningDealStep[] = [
        {
            type: 'BURN_HIDDEN_CARD',
            order: 0,
            targetZone: 'hidden-reserve'
        }
    ];

    dealSequence.forEach((step) => {
        const currentIndex = (cardIndexesByPlayer.get(step.playerId) ?? 0) + 1;
        cardIndexesByPlayer.set(step.playerId, currentIndex);
        steps.push({
            type: 'DEAL_CARD_BACK',
            order: steps.length,
            targetPlayerId: step.playerId,
            cardIndex: currentIndex
        });
    });

    steps.push({
        type: 'OPENING_DEAL_COMPLETE',
        order: steps.length
    });

    return {
        sequenceId,
        status,
        completed: status === 'completed' || status === 'not_replayable',
        replayable,
        steps
    };
};

export const markOpeningDealNotReplayable = (openingDeal?: OpeningDealSummary): OpeningDealSummary | undefined => {
    if (!openingDeal) {
        return openingDeal;
    }

    return {
        ...openingDeal,
        status: 'not_replayable',
        replayable: false,
        completed: true,
        steps: Array.isArray(openingDeal.steps)
            ? openingDeal.steps.map((step) => ({ ...step }))
            : []
    };
};
