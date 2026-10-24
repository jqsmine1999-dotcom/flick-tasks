import { AnimatePresence, motion } from 'motion/react'

export interface ToastState {
  id: number
  text: string
  action?: { label: string; run: () => void }
}

export function Toast({ toast, onDone }: { toast: ToastState | null; onDone: () => void }) {
  return (
    <div className="toast-wrap" aria-live="polite">
      <AnimatePresence mode="popLayout">
        {toast && (
          <motion.div
            key={toast.id}
            className="toast"
            data-testid="toast"
            initial={{ y: 40, opacity: 0, scale: 0.9, filter: 'blur(6px)' }}
            animate={{ y: 0, opacity: 1, scale: 1, filter: 'blur(0px)' }}
            exit={{ y: 20, opacity: 0, scale: 0.95, filter: 'blur(6px)' }}
            transition={{ type: 'spring', stiffness: 460, damping: 32 }}
          >
            <span>{toast.text}</span>
            {toast.action && (
              <motion.button
                data-testid="toast-action"
                whileTap={{ scale: 0.9 }}
                onClick={() => {
                  toast.action!.run()
                  onDone()
                }}
              >
                {toast.action.label}
              </motion.button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
