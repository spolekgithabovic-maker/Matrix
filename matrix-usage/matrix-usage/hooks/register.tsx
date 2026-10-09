import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, SessionCost, SessionContextUsage, SessionRateLimit } from 'claude-code'

import type { Limit, Snapshot } from '../types'


const snap = atom({ plugin: 'matrix-usage', key: 'snap' } as const, null)
const frame = atom({ plugin: 'matrix-usage', key: 'frame' } as const, 0)
const warned = atom({ plugin: 'matrix-usage', key: 'warned' } as const, [])
const isHidden = atom({ plugin: 'matrix-usage', key: 'isHidden' } as const, false)

const BRIGHT = '#00FF41'
const MID = '#00B82E'
const DARK = '#006B1A'
const BG = '#0D0208'

const GLYPHS = 'ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜﾝ01234567890Z:.=*+-<>|'
const RAIN_WIDTH = 64
const THRESHOLD = 80

const LABELS: Record<string, string> = {
  five_hour: '5Ч',
  seven_day: '7Д',
  spend_limit: 'БЮДЖЕТ',
}

export function toSnapshot(
  context: SessionContextUsage,
  rateLimits: readonly SessionRateLimit[],
  cost: SessionCost | undefined,
): Snapshot {
  return {
    contextPercent: context.percent ?? null,
    limits: rateLimits.map(l => ({ kind: l.kind, percentUsed: l.percentUsed, resetsAt: l.resetsAt })),
    usd: cost ? cost.usd : null,
  }
}

export function bar(percent: number, width = 10): string {
  const p = Math.max(0, Math.min(100, percent))
  const filled = Math.round((p / 100) * width)
  return '█'.repeat(filled) + '░'.repeat(width - filled)
}

export function label(kind: string): string {
  return LABELS[kind] ?? kind.toUpperCase()
}

export function resetTime(iso: string | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${hh}:${mm}`
}

export function rain(seed: number, width = RAIN_WIDTH): string {
  let s = (seed * 2654435761) >>> 0
  let out = ''
  for (let i = 0; i < width; i++) {
    s = (s * 1103515245 + 12345) >>> 0
    out += (s >>> 16) % 5 === 0 ? ' ' : GLYPHS[(s >>> 8) % GLYPHS.length]
  }
  return out
}

export function statusLine(s: Snapshot): string {
  const parts: string[] = []
  if (s.contextPercent !== null) parts.push(`КОНТЕКСТ ${Math.round(s.contextPercent)}%`)
  for (const l of s.limits) parts.push(`${label(l.kind)} ${Math.round(l.percentUsed)}%`)
  return parts.length ? `▣ ${parts.join(' · ')}` : '▣ ожидание сигнала…'
}

export function crossed(limits: readonly Limit[], already: readonly string[]): Limit[] {
  return limits.filter(l => l.percentUsed >= THRESHOLD && !already.includes(`${l.kind}@${l.resetsAt ?? ''}`))
}

async function apply(
$: EngineInterface, s: Snapshot) {
  await update($, snap, () => s)
  $.ui.status(statusLine(s))

  const done = await read($, warned)
  const fresh = crossed(s.limits, done)
  if (fresh.length) {
    for (const l of fresh) {
      const at = resetTime(l.resetsAt)
      $.ui.toast(
        `Wake up, Neo… Лимит ${label(l.kind)} израсходован на ${Math.round(l.percentUsed)}%${at ? `. Сброс в ${at}` : ''}`,
        { timeoutMs: 8000 },
      )
    }
    await update($, warned, w => [...w, ...fresh.map(l => `${l.kind}@${l.resetsAt ?? ''}`)])
  }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const result = await next(e)
    const u = await $.session.usage()
    await apply($, toSnapshot(u.context, u.rateLimits, u.cost))

    $.command.register({ name: 'matrix', description: 'Показать или скрыть полосу Матрицы' })

    $.clock.every(900, () => {
      void update($, frame, f => (f + 1) % 100000)
    })

    return result
  })

  on('session.measure', async ($, e, next) => {
    await apply($, toSnapshot(e.context, e.rateLimits, e.cost))
    return next(e)
  })

  on('command.run', { command: 'matrix' }, async ($, e) => {
    const hidden = await update($, isHidden, h => !h)
    return { text: hidden ? 'Полоса Матрицы скрыта. /matrix — вернуть.' : 'Полоса Матрицы снова на месте.' }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey || (await read($, isHidden))) return next(e)

    const s = await read($, snap)
    const f = await read($, frame)
    const { Box, Text } = $.ui.resolve(e)

    const rows = s === null ? [] : [
      ...(s.contextPercent !== null
        ? [{ key: 'ctx', name: 'КОНТЕКСТ', p: s.contextPercent, extra: '' }]
        : []),
      ...s.limits.map(l => ({
        key: l.kind,
        name: label(l.kind),
        p: l.percentUsed,
        extra: resetTime(l.resetsAt) ? ` ⟳ ${resetTime(l.resetsAt)}` : '',
      })),
    ]

    return (
      <Box flexDirection="column" backgroundColor={BG} borderStyle="round" borderColor={DARK} paddingX={1}>
        <Text color={DARK} wrap="truncate">{rain(f)}</Text>
        {rows.length === 0 ? (
          <Text color={MID}>{'> ожидание сигнала из Матрицы…'}</Text>
        ) : (
          <Box flexDirection="row" flexWrap="wrap" columnGap={3}>
            {rows.map(r => (
              <Text key={r.key} color={r.p >= THRESHOLD ? '#FF3B3B' : BRIGHT}>
                {`> ${r.name} [${bar(r.p)}] ${Math.round(r.p)}%`}
                <Text color={MID}>{r.extra}</Text>
              </Text>
            ))}
            {s !== null && s.usd !== null ? (
              <Text key="usd" color={MID}>{`$${s.usd.toFixed(2)}`}</Text>
            ) : null}
          </Box>
        )}
        <Text color={DARK} wrap="truncate">{rain(f + 7)}</Text>
      </Box>
    )
  })
}
