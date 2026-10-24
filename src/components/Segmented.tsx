import { AnimatePresence, motion } from 'motion/react'
import { STATUSES, type Status } from '../../shared/types'
import { STATUS_META } from '../status'

export function Segmented({ value, counts, onChange }: { value: Status; counts: Record<Status, number>; onChange: (s: Status) => void }) {
  return (
    <div className="segmented glass" role="tablist">
      {STATUSES.map((s) => (
        <motion.button
          key={s}
          role="tab"
          className="seg"
          aria-selected={value === s}
          data-testid={`tab-${s}`}
          onClick={() => onChange(s)}
          whileTap={{ scale: 0.94 }}
        >
          {value === s && <motion.div layoutId="seg-pill" className="seg-pill" transition={{ type: 'spring', stiffness: 520, damping: 38 }} />}
          <span className="dot" style={{ background: STATUS_META[s].color }} />
          <span>{STATUS_META[s].label}</span>
          <span className="count" data-testid={`count-${s}`}>
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.span
                key={counts[s]}
                style={{ display: 'inline-block' }}
                initial={{ y: 12, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: -12, opacity: 0 }}
                transition={{ type: 'spring', stiffness: 600, damping: 32 }}
              >
                {counts[s]}
              </motion.span>
            </AnimatePresence>
          </span>
        </motion.button>
      ))}
    </div>
  )
}
