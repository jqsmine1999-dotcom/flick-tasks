import { motion } from 'motion/react'

const WIDTHS = ['72%', '54%', '86%', '62%', '44%', '78%']

export function SkeletonTopbar() {
  return (
    <div className="topbar" data-testid="skeleton">
      <div className="spacer" />
      <div className="sk glass" style={{ width: 40, height: 40, borderRadius: 99 }} />
    </div>
  )
}

export function SkeletonSegmented() {
  return <div className="sk glass" style={{ marginTop: 18, height: 48, borderRadius: 99 }} />
}

export function SkeletonCards({ count = WIDTHS.length }: { count?: number }) {
  return (
    <>
      {WIDTHS.slice(0, count).map((w, i) => (
        <motion.div
          key={i}
          className="card glass"
          data-testid="skeleton-card"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={{ delay: i * 0.05 }}
        >
          <div className="sk" style={{ width: 22, height: 22, borderRadius: 99 }} />
          <div className="sk sk-line" style={{ width: w }} />
        </motion.div>
      ))}
    </>
  )
}
