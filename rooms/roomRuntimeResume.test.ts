import test from 'node:test';
import assert from 'node:assert/strict';
import { resumeRestoredRoomRuntime } from './roomRuntimeResume.js';

test('resumeRestoredRoomRuntime routes resolution snapshots to next-round scheduling', () => {
    let scheduled = 0;
    const room = {
        gameState: { phase: 'resolution' as const },
        scheduleNextRound: () => {
            scheduled += 1;
        }
    };

    resumeRestoredRoomRuntime(room);

    assert.equal(scheduled, 1);
});
