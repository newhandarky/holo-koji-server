import test from 'node:test';
import assert from 'node:assert/strict';
import { scheduleRoomNextRound } from './roomTurnRoundRuntime.js';
import type { TimerHandle } from './roomScheduler.js';

test('scheduleRoomNextRound replaces stale round timers and invokes room next round', () => {
    const cleared: TimerHandle[] = [];
    const scheduled: Array<() => void> = [];
    let started = 0;
    const room = {
        roundResolveTimer: 1 as unknown as TimerHandle,
        scheduler: {
            setTimeout: (callback: () => void, delayMs: number) => {
                assert.equal(delayMs, 2500);
                scheduled.push(callback);
                return 2 as unknown as TimerHandle;
            },
            clearTimeout: (timer: TimerHandle) => {
                cleared.push(timer);
            }
        },
        startNextRound: () => {
            started += 1;
        }
    };

    scheduleRoomNextRound(room);
    scheduled[0]?.();

    assert.deepEqual(cleared, [1 as unknown as TimerHandle]);
    assert.equal(room.roundResolveTimer, null);
    assert.equal(started, 1);
});
