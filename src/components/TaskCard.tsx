import { animate, motion, useMotionValue, useMotionValueEvent, useTransform, type PanInfo } from 'motion/react'
import { useRef, useState, type Ref } from 'react'
import type { Task } from '../../shared/types'
import { FLICK, STATUS_META, actionColor, actionLabel, type Dir, type FlickAction } from '../status'
import { Check, Play, Trash, Undo } from './Icons'

const DISTANCE = 96
const VELOCITY = 520

function ActionIcon({ action, dir }: { action: FlickAction; dir: Dir }) {
  if (action.kind === 'delete') return <Trash />
  if (action.to === 'done') return <Check />
  if (action.to === 'doing' && dir === 'right') return <Play />
  return <Undo />
}

interface Props {
  task: Task
  index: number
  onFlick: (task: Task, dir: Dir) => void
  onOpen: (task: Task) => void
  ref?: Ref<HTMLDivElement>
}

export function TaskCard({ task, index, onFlick, onOpen, ref }: Props) {
  const x = useMotionValue(0)
  const [armed, setArmed] = useState<Dir | null>(null)
  // A drag must never also count as a tap (which would open the edit sheet).
  const dragged = useRef(false)
  const actions = FLICK[task.status]

  const rightOpacity = useTransform(x, [0, 24, DISTANCE], [0, 0.5, 1])
  const leftOpacity = useTransform(x, [-DISTANCE, -24, 0], [1, 0.5, 0])
  const rightIcon = useTransform(x, [0, DISTANCE], [0.5, 1])
  const leftIcon = useTransform(x, [-DISTANCE, 0], [1, 0.5])
  const tilt = useTransform(x, [-240, 0, 240], [-2.5, 0, 2.5])
  // Hide the colored layer at rest so it never tints the translucent card.
  const bgOpacity = useTransform(x, (v) => Math.min(1, Math.abs(v) / 16))

  useMotionValueEvent(x, 'change', (v) => {
    const next = v > DISTANCE ? 'right' : v < -DISTANCE ? 'left' : null
    if (next !== armed) setArmed(next)
  })

  const onDragEnd = (_: unknown, info: PanInfo) => {
    const { offset, velocity } = info
    let dir: Dir | null = null
    if (offset.x > DISTANCE || (velocity.x > VELOCITY && offset.x > 24)) dir = 'right'
    else if (offset.x < -DISTANCE || (velocity.x < -VELOCITY && offset.x < -24)) dir = 'left'
    if (dir) onFlick(task, dir)
    else animate(x, 0, { type: 'spring', stiffness: 500, damping: 34 })
  }

  return (
    <motion.div
      ref={ref}
      layout
      className="row"
      data-testid="task"
      data-status={task.status}
      initial={{ opacity: 0, y: -14, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1, transition: { type: 'spring', stiffness: 420, damping: 32, delay: Math.min(index, 8) * 0.035 } }}
      variants={{
        exit: (dirs: Record<string, Dir | undefined>) => {
          const d = dirs[task.id]
          return d
            ? { x: d === 'right' ? '115%' : '-115%', opacity: 0, transition: { duration: 0.28, ease: [0.32, 0.72, 0, 1] } }
            : { opacity: 0, scale: 0.9, transition: { duration: 0.2 } }
        },
      }}
      exit="exit"
      transition={{ layout: { type: 'spring', stiffness: 500, damping: 40 } }}
    >
      <motion.div className="row-bg" style={{ opacity: bgOpacity, background: actionColor(armed === 'left' ? actions.left : actions.right) }}>
        <motion.span className="hint" style={{ opacity: rightOpacity, scale: rightIcon }}>
          <motion.span animate={{ scale: armed === 'right' ? 1.18 : 1 }}>
            <ActionIcon action={actions.right} dir="right" />
          </motion.span>
          {actionLabel(actions.right)}
        </motion.span>
        <motion.span className="hint" style={{ opacity: leftOpacity, scale: leftIcon }}>
          {actionLabel(actions.left)}
          <motion.span animate={{ scale: armed === 'left' ? 1.18 : 1 }}>
            <ActionIcon action={actions.left} dir="left" />
          </motion.span>
        </motion.span>
      </motion.div>
      <motion.div
        className={`card glass ${task.status}`}
        style={{ x, rotate: tilt }}
        drag="x"
        dragDirectionLock
        dragMomentum={false}
        onPointerDown={() => (dragged.current = false)}
        onDragStart={() => (dragged.current = true)}
        onDragEnd={onDragEnd}
        onTap={() => !dragged.current && onOpen(task)}
        whileTap={{ scale: 0.985 }}
        role="button"
        tabIndex={0}
        aria-label={task.title}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onOpen(task)
          if (e.key === 'ArrowRight') onFlick(task, 'right')
          if (e.key === 'ArrowLeft') onFlick(task, 'left')
        }}
      >
        <StatusRing status={task.status} />
        <span className="title">{task.title}</span>
      </motion.div>
    </motion.div>
  )
}

function StatusRing({ status }: { status: Task['status'] }) {
  const color = STATUS_META[status].color
  return (
    <motion.span
      className="status-ring"
      initial={false}
      animate={{
        background: status === 'done' ? 'var(--done)' : 'rgba(255,255,255,0)',
        boxShadow: `inset 0 0 0 2px ${color}`,
      }}
    >
      {status === 'done' && (
        <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} style={{ color: '#fff', display: 'grid' }}>
          <Check width={14} height={14} />
        </motion.span>
      )}
      {status === 'doing' && (
        <motion.span
          style={{ width: 8, height: 8, borderRadius: 9, background: color }}
          animate={{ scale: [1, 1.35, 1], opacity: [1, 0.6, 1] }}
          transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
        />
      )}
    </motion.span>
  )
}
