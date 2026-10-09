export type Limit = { kind: string; percentUsed: number; resetsAt?: string }
export type Snapshot = { contextPercent: number | null; limits: Limit[]; usd: number | null }

declare module 'claude-code' {
  interface PluginState {
    'matrix-usage': { snap: Snapshot | null; frame: number; warned: string[]; isHidden: boolean }
  }
}
