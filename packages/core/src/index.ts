// Public API of @leakspot/core consumed by other workspaces. CP0 exposes the
// typed DomainError and the slot/litre unit conversions; later checkpoints add
// the world, engine and run reducers behind the same single "." exports entry.

export { DomainError } from "./errors";
export {
  slotIndexToLabel,
  labelToSlotIndex,
  litresPerHourToPerSlot,
  litresPerSlotToPerHour,
} from "./units";
