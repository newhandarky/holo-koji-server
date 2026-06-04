# Room Runtime Boundary Notes

## 154 Review Scope

- `GameRoom` already acts mostly as a facade for room state, membership, opening, match, turn, NPC, and action runtimes.
- `roomActionRuntime.ts` still owns two event sequencing concerns in addition to action validation and transition application:
  - active action events: `ACTION_EXECUTED` per recipient, then game-state broadcast, then `endTurn()`;
  - resolved interaction events: `INTERACTION_RESOLVED`, then game-state broadcast, then `endTurn()`.
- Opening, turn, round, NPC timer wiring remains intentionally unchanged in this batch. Those paths have tighter scheduling and snapshot side effects, so they should only be extracted with a separate focused risk review.

## 155 Extraction Target

- Extract action event emission and post-action sequencing from `roomActionRuntime.ts`.
- Preserve event names, payload shapes, recipient-specific hidden-card redaction, broadcast order, and `endTurn()` timing.
- Keep `GameRoom` public method names unchanged.

## 156 Regression Target

- Cover active action event sequencing.
- Cover resolved interaction event sequencing.
- Keep the existing missing game-state guard coverage.
