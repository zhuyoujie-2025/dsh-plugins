export const ACTIVE_POLL_MS = 1000
export const IDLE_POLL_MS = 5000
export const HIDDEN_POLL_MS = 15000

export interface PollState {
  visible: boolean
  open: boolean
  hasRunning: boolean
}

/**
 * Keep active runs responsive, while backing off when the panel is idle or
 * the tab is not visible. The caller uses recursive timeouts, so a slow
 * request can never overlap the next scheduled request.
 */
export function pollDelay(state: PollState): number {
  if (!state.visible) return HIDDEN_POLL_MS
  if (state.open || state.hasRunning) return ACTIVE_POLL_MS
  return IDLE_POLL_MS
}
