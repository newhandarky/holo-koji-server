export type TimerHandle = ReturnType<typeof setTimeout>;

export type RoomScheduler = {
    setTimeout: (callback: () => void, delayMs: number) => TimerHandle;
    clearTimeout: (timer: TimerHandle) => void;
};

export const roomScheduler: RoomScheduler = {
    setTimeout: (callback, delayMs) => setTimeout(callback, delayMs),
    clearTimeout: timer => clearTimeout(timer)
};

export const replaceScheduledTimer = (
    scheduler: RoomScheduler,
    currentTimer: TimerHandle | null,
    callback: () => void,
    delayMs: number
): TimerHandle => {
    if (currentTimer) {
        scheduler.clearTimeout(currentTimer);
    }
    return scheduler.setTimeout(callback, delayMs);
};
