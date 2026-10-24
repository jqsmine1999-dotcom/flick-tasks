import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { MAX_AI_INPUT } from '../../shared/types'
import { ArrowUp, Sparkles } from './Icons'

const DRAFT_KEY = 'ft.draft'

interface Props {
  busy: boolean
  onSubmit: (text: string) => void
  onAi: (text: string) => Promise<boolean>
}

export function Composer({ busy, onSubmit, onAi }: Props) {
  const [text, setText] = useState(() => {
    try {
      return localStorage.getItem(DRAFT_KEY) ?? ''
    } catch {
      return ''
    }
  })
  const ref = useRef<HTMLTextAreaElement>(null)
  const has = text.trim().length > 0

  useEffect(() => {
    try {
      localStorage.setItem(DRAFT_KEY, text)
    } catch {
      /* ignore */
    }
  }, [text])

  // Focus as early as possible so typing can start the moment the app opens.
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    el.focus({ preventScroll: true })
    el.setSelectionRange(el.value.length, el.value.length)
  }, [])

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [text])

  const submit = () => {
    if (!has || busy) return
    onSubmit(text.trim())
    setText('')
    ref.current?.focus()
  }

  const ai = async () => {
    if (!has || busy) return
    if (await onAi(text.trim().slice(0, MAX_AI_INPUT))) setText('')
    ref.current?.focus()
  }

  return (
    <motion.div
      className={`composer glass ${busy ? 'busy' : ''}`}
      initial={{ opacity: 0, y: 8, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: 'spring', stiffness: 380, damping: 30 }}
    >
      <span className="composer-glow" />
      <label htmlFor="composer" className="sr-only">メモ</label>
      <textarea
        id="composer"
        ref={ref}
        data-testid="composer"
        rows={1}
        value={text}
        readOnly={busy}
        placeholder="メモ"
        enterKeyHint="send"
        autoFocus
        maxLength={MAX_AI_INPUT}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          // Never submit while an IME (e.g. Japanese input) is composing.
          if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && e.keyCode !== 229) {
            e.preventDefault()
            submit()
          }
        }}
      />
      <div className="actions">
        <AnimatePresence initial={false}>
          {has && (
            <motion.button
              key="ai"
              type="button"
              className="round ai-btn"
              data-testid="ai"
              aria-label="AIでタスクに分解"
              onClick={ai}
              disabled={busy}
              initial={{ scale: 0.4, opacity: 0, rotate: -90 }}
              animate={{ scale: 1, opacity: 1, rotate: busy ? 360 : 0 }}
              exit={{ scale: 0.4, opacity: 0, rotate: 90 }}
              transition={busy ? { rotate: { duration: 1.2, repeat: Infinity, ease: 'linear' } } : { type: 'spring', stiffness: 500, damping: 26 }}
              whileTap={{ scale: 0.85 }}
            >
              <Sparkles />
            </motion.button>
          )}
          {has && (
            <motion.button
              key="send"
              type="button"
              className="round send"
              data-testid="send"
              aria-label="追加"
              onClick={submit}
              disabled={busy}
              initial={{ scale: 0.4, opacity: 0, y: 6 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.4, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 520, damping: 26 }}
              whileTap={{ scale: 0.85 }}
            >
              <ArrowUp />
            </motion.button>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  )
}
