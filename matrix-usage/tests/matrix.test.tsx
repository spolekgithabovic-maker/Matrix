import { expect, test } from 'claude-code/testing'

import { bar, crossed, rain, statusLine } from '../hooks/register'

test('helpers', async () => {
  expect(bar(50)).toBe('█████░░░░░')
  expect(bar(130)).toBe('██████████')
  expect(rain(3).length).toBe(64)
  expect(statusLine({ contextPercent: 34.4, limits: [{ kind: 'five_hour', percentUsed: 62 }], usd: 1 }))
    .toBe('▣ КОНТЕКСТ 34% · 5Ч 62%')
  expect(crossed([{ kind: 'five_hour', percentUsed: 81, resetsAt: 'x' }], []).length).toBe(1)
  expect(crossed([{ kind: 'five_hour', percentUsed: 81, resetsAt: 'x' }], ['five_hour@x']).length).toBe(0)
})

for (const surface of ['terminal', 'desktop'] as const) {
  test(`band draws usage on ${surface}`, async ($, on) => {
    const toasts: string[] = []
    const statuses: (string | undefined)[] = []
    on('session.measure', (_$, e) => ({ changed: e.changed }))
    on('ui.toast', (_$, e) => { toasts.push(e.text); return { value: undefined } })
    on('ui.status', (_$, e) => { statuses.push(e.text); return { value: undefined } })
    await $.session.measure({
      context: { window: 200000, tokens: 68000, percent: 34 },
      rateLimits: [{ kind: 'five_hour', percentUsed: 85, resetsAt: '2026-10-09T16:40:00Z' }],
      cost: { usd: 0.42 },
      changed: ['context', 'rateLimits', 'cost'],
    })
    const ui = await $.ui.mount({
      plugin: 'matrix-usage', surface, component: 'AbovePrompt',
      props: { hasSurvey: false, isWorking: false } as never,
    })
    const drawn = JSON.stringify(await ui.drawn())
    expect(drawn.includes('КОНТЕКСТ [███░░░░░░░] 34%')).toBe(true)
    expect(drawn.includes('5Ч [█████████░] 85%')).toBe(true)
    expect(drawn.includes('$0.42')).toBe(true)
    expect(toasts.length).toBe(1)
    expect(toasts[0]!.includes('Wake up, Neo')).toBe(true)
    expect(statuses.some(t => (t ?? '').includes('5Ч 85%'))).toBe(true)
  })
}
