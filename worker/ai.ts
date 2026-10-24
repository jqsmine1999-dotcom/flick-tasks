import { MAX_TITLE } from '../shared/types'
import type { Env } from './env'

const SYSTEM_PROMPT = `あなたはタスク整理アシスタントです。ユーザーのメモに書かれている行動だけを、個別のタスクに分解してください。
- メモに書かれていない作業を推測で追加しない（準備・計画・確認などの補足タスクも足さない）
- 「AとBを〜する」のように1文に複数の行動があれば分ける
- 数量・期限・人名・場所など、メモにある具体的な情報は省略せず残す
- 1タスク = 1行の短い文（40文字以内目安）。動詞で終える
- 入力と同じ言語で書く
- 重複や挨拶・説明文は含めない
- 出力は {"tasks": ["...", "..."]} のJSONのみ

例: 「土曜の引っ越しに向けて段ボールを10箱買って、電気と水道に解約の電話」
→ {"tasks": ["段ボールを10箱買う（土曜の引っ越し用）", "電気会社に解約の電話をする", "水道局に解約の電話をする"]}`

const SCHEMA = {
  type: 'object',
  properties: { tasks: { type: 'array', items: { type: 'string' }, maxItems: 10 } },
  required: ['tasks'],
}

export async function splitIntoTasks(env: Env, text: string): Promise<{ tasks: string[]; source: 'ai' | 'fallback' }> {
  try {
    const out = (await env.AI.run(env.AI_MODEL as Parameters<Ai['run']>[0], {
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: text },
      ],
      response_format: { type: 'json_schema', json_schema: SCHEMA },
      max_tokens: 800,
      temperature: 0.2,
    } as never)) as { response?: unknown }
    const tasks = clean(parseTasks(out?.response))
    if (tasks.length > 0) return { tasks, source: 'ai' }
  } catch (err) {
    console.error('workers-ai failed', err)
  }
  return { tasks: clean(heuristicSplit(text)), source: 'fallback' }
}

function parseTasks(response: unknown): unknown[] {
  if (response && typeof response === 'object' && Array.isArray((response as { tasks?: unknown }).tasks)) {
    return (response as { tasks: unknown[] }).tasks
  }
  if (typeof response === 'string') {
    const match = response.match(/\{[\s\S]*\}/)
    if (match) {
      try {
        return parseTasks(JSON.parse(match[0]))
      } catch {
        /* fall through */
      }
    }
  }
  return []
}

/** Used when Workers AI is unavailable: split on lines, bullets and sentence ends. */
export function heuristicSplit(text: string): string[] {
  return text
    .split(/\r?\n|[。．！？!?]|(?:^|\s)[-・*•]\s*|、(?=.{6,})/)
    .map((s) => s.replace(/^\s*(?:\d+[.)]|[-・*•])\s*/, '').trim())
    .filter(Boolean)
}

function clean(items: unknown[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const item of items) {
    if (typeof item !== 'string') continue
    const t = item.trim().slice(0, MAX_TITLE)
    if (!t || seen.has(t)) continue
    seen.add(t)
    result.push(t)
    if (result.length >= 10) break
  }
  return result
}
