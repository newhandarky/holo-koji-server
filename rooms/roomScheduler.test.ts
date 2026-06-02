import test from 'node:test';
import assert from 'node:assert/strict';
import {
    replaceScheduledTimer,
    type RoomScheduler,
    type TimerHandle
} from './roomScheduler.js';

test('replaceScheduledTimer clears the previous timer and records the replacement delay', () => {
    const cleared: TimerHandle[] = [];
    const scheduled: Array<{ callback: () => void; delayMs: number }> = [];
    const scheduler: RoomScheduler = {
        setTimeout: (callback, delayMs) => {
            scheduled.push({ callback, delayMs });
            return scheduled.length as unknown as TimerHandle;
        },
        clearTimeout: timer => {
            cleared.push(timer);
        }
    };
    const previous = 10 as unknown as TimerHandle;
    let invoked = false;

    const timer = replaceScheduledTimer(scheduler, previous, () => {
        invoked = true;
    }, 800);

    assert.deepEqual(cleared, [previous]);
    assert.equal(timer, 1);
    assert.equal(scheduled[0]?.delayMs, 800);
    scheduled[0]?.callback();
    assert.equal(invoked, true);
});
