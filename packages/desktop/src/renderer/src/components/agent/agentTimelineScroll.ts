const DEFAULT_NEAR_BOTTOM_THRESHOLD = 48

export interface AgentTimelineScrollMetrics {
  scrollHeight: number
  scrollTop: number
  clientHeight: number
}

export const isAgentTimelineNearBottom = (
  metrics: AgentTimelineScrollMetrics,
  threshold = DEFAULT_NEAR_BOTTOM_THRESHOLD
): boolean => (
  Math.max(0, metrics.scrollHeight - metrics.scrollTop - metrics.clientHeight) <= threshold
)
