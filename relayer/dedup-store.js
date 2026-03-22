/**
 * In-memory deduplication store.
 *
 * Acts as a fast first-pass filter within a relayer session.
 * On-chain state (processedOrders mapping / order_record PDAs) is the true
 * source of truth and catches anything that slips through on restart.
 */

const seen = new Set();

export function hasSeen(id) {
  return seen.has(id);
}

export function markSeen(id) {
  seen.add(id);
}

export function size() {
  return seen.size;
}