import { AnimatePresence, motion } from 'motion/react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { STATUSES, type Status, type Task, type User } from '../shared/types'
import { Composer } from './components/Composer'
import { GoogleG, Inbox, Trash } from './components/Icons'
import { Segmented } from './components/Segmented'
import { Sheet } from './components/Sheet'
import { SkeletonCards, SkeletonSegmented, SkeletonTopbar } from './components/Skeleton'
import { TaskCard } from './components/TaskCard'
import { Toast, type ToastState } from './components/Toast'
import { FLICK, STATUS_META, type Dir } from './status'
import { addTask, addTasks, aiSplit, boot, deleteAccount, logout, removeTask, restoreTask, updateTask, useStore } from './store'

const spring = { type: 'spring', stiffness: 380, damping: 34 } as const

export default function App() {
  const tasks = useStore((s) => s.tasks)
  const user = useStore((s) => s.user)
  const booting = useStore((s) => s.booting)
  const aiBusy = useStore((s) => s.aiBusy)
  const online = useStore((s) => s.online)

  const [tab, setTab] = useState<Status>('todo')
  const [tabDir, setTabDir] = useState(1)
  const [openId, setOpenId] = useState<string | null>(null)
  const [sheet, setSheet] = useState<'account' | 'login' | null>(null)
  const [toast, setToast] = useState<ToastState | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const flickDirs = useRef<Record<string, Dir | undefined>>({})

  const showToast = useCallback((text: string, action?: ToastState['action']) => {
    setToast({ id: Date.now(), text, action })
  }, [])

  useEffect(() => {
    void boot()
    const params = new URLSearchParams(location.search)
    if (params.get('login') === 'failed') {
      showToast('ログインに失敗しました')
      history.replaceState(null, '', '/')
    }
  }, [showToast])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 3800)
    return () => clearTimeout(t)
  }, [toast])

  const counts = useMemo(() => {
    const c: Record<Status, number> = { todo: 0, doing: 0, done: 0 }
    for (const t of tasks) c[t.status]++
    return c
  }, [tasks])

  const items = useMemo(() => {
    const key = tab === 'todo' ? 'createdAt' : 'updatedAt'
    return tasks.filter((t) => t.status === tab).sort((a, b) => b[key] - a[key])
  }, [tasks, tab])

  const changeTab = (next: Status) => {
    if (next === tab) return
    setTabDir(STATUSES.indexOf(next) > STATUSES.indexOf(tab) ? 1 : -1)
    setTab(next)
  }

  const deleteWithUndo = (task: Task) => {
    removeTask(task.id)
    showToast('削除しました', { label: '元に戻す', run: () => restoreTask(task) })
  }

  const flick = (task: Task, dir: Dir) => {
    const action = FLICK[task.status][dir]
    flickDirs.current[task.id] = dir
    if (action.kind === 'delete') return deleteWithUndo(task)
    const prev = task.status
    updateTask(task.id, { status: action.to })
    showToast(`${STATUS_META[action.to].label}へ移動`, {
      label: '元に戻す',
      run: () => {
        flickDirs.current[task.id] = undefined
        updateTask(task.id, { status: prev })
      },
    })
  }

  const submit = (text: string) => {
    addTask(text)
    if (tab !== 'todo') changeTab('todo')
  }

  const ai = async (text: string) => {
    if (!user) {
      setSheet('login')
      return false
    }
    if (tab !== 'todo') changeTab('todo')
    try {
      const titles = await aiSplit(text)
      if (titles.length === 0) {
        showToast('タスクが見つかりませんでした')
        return false
      }
      addTasks(titles)
      showToast(`${titles.length}件追加`)
      return true
    } catch {
      showToast('AIを利用できませんでした')
      return false
    }
  }

  const openTask = tasks.find((t) => t.id === openId) ?? null

  return (
    <>
      <div className="ambient" aria-hidden>
        <i /><i /><i /><i />
      </div>
      <main className="app">
        <AnimatePresence mode="popLayout" initial={false}>
          {booting ? (
            <motion.div key="sk-top" exit={{ opacity: 0 }}>
              <SkeletonTopbar />
            </motion.div>
          ) : (
            <motion.header
              key="top"
              className="topbar"
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={spring}
            >
              <AnimatePresence>
                {!online && (
                  <motion.span
                    className="sync-dot"
                    data-testid="offline"
                    title="オフライン"
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    exit={{ scale: 0 }}
                  />
                )}
              </AnimatePresence>
              <div className="spacer" />
              {user ? (
                <motion.button
                  className="avatar glass"
                  data-testid="avatar"
                  aria-label="アカウント"
                  onClick={() => setSheet('account')}
                  whileTap={{ scale: 0.9 }}
                >
                  <Avatar user={user} />
                </motion.button>
              ) : (
                <motion.a
                  href="/auth/google"
                  className="login-pill glass"
                  data-testid="login"
                  whileTap={{ scale: 0.94 }}
                  style={{ textDecoration: 'none', color: 'inherit' }}
                >
                  <GoogleG />
                  ログイン
                </motion.a>
              )}
            </motion.header>
          )}
        </AnimatePresence>

        <Composer busy={aiBusy} onSubmit={submit} onAi={ai} />

        <AnimatePresence mode="popLayout" initial={false}>
          {booting ? (
            <motion.div key="sk-body" exit={{ opacity: 0, transition: { duration: 0.18 } }}>
              <SkeletonSegmented />
              <div className="list">
                <SkeletonCards />
              </div>
            </motion.div>
          ) : (
            <motion.div key="body" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.25 }}>
              <Segmented value={tab} counts={counts} onChange={changeTab} />
              <div style={{ position: 'relative' }}>
                <AnimatePresence mode="popLayout" initial={false} custom={tabDir}>
                  <motion.div
                    key={tab}
                    className="list"
                    data-testid={`list-${tab}`}
                    custom={tabDir}
                    variants={{
                      enter: (d: number) => ({ x: d * 48, opacity: 0, filter: 'blur(4px)' }),
                      center: { x: 0, opacity: 1, filter: 'blur(0px)' },
                      exit: (d: number) => ({ x: d * -48, opacity: 0, filter: 'blur(4px)' }),
                    }}
                    initial="enter"
                    animate="center"
                    exit="exit"
                    transition={spring}
                  >
                    <AnimatePresence mode="popLayout" custom={flickDirs.current}>
                      {aiBusy && tab === 'todo' && (
                        <motion.div key="ai-sk" layout style={{ display: 'flex', flexDirection: 'column', gap: 10 }} exit={{ opacity: 0 }}>
                          <SkeletonCards count={3} />
                        </motion.div>
                      )}
                      {items.map((t, i) => (
                        <TaskCard key={t.id} task={t} index={i} onFlick={flick} onOpen={(task) => setOpenId(task.id)} />
                      ))}
                      {items.length === 0 && !aiBusy && (
                        <motion.div
                          key="empty"
                          className="empty"
                          data-testid="empty"
                          initial={{ opacity: 0, scale: 0.9 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.9 }}
                        >
                          <motion.span animate={{ y: [0, -6, 0] }} transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}>
                            <Inbox />
                          </motion.span>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>
                </AnimatePresence>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      <TaskSheet
        task={openTask}
        onClose={() => setOpenId(null)}
        onDelete={(t) => {
          flickDirs.current[t.id] = undefined
          setOpenId(null)
          deleteWithUndo(t)
        }}
        onStatus={(t, s) => {
          flickDirs.current[t.id] = undefined
          updateTask(t.id, { status: s })
          setOpenId(null)
        }}
      />

      <Sheet
        open={sheet === 'account' && !!user}
        onClose={() => {
          setSheet(null)
          setConfirmDelete(false)
        }}
        label="アカウント"
      >
        {user && (
          <>
            <div className="account">
              <div className="avatar glass"><Avatar user={user} /></div>
              <div className="meta">
                <b>{user.name}</b>
                <small>{user.email}</small>
              </div>
            </div>
            <motion.button
              className="danger-btn"
              data-testid="logout"
              whileTap={{ scale: 0.97 }}
              onClick={async () => {
                setSheet(null)
                await logout()
              }}
            >
              ログアウト
            </motion.button>
            <motion.button
              className="danger-btn"
              data-testid="delete-account"
              whileTap={{ scale: 0.97 }}
              animate={confirmDelete ? { background: 'var(--danger)', color: '#fff' } : { background: 'rgba(239, 68, 68, 0)', color: 'var(--danger)' }}
              onClick={async () => {
                if (!confirmDelete) return setConfirmDelete(true)
                setConfirmDelete(false)
                setSheet(null)
                if (!(await deleteAccount())) showToast('削除できませんでした')
              }}
            >
              {confirmDelete ? 'すべてのデータを削除する' : 'アカウントを削除'}
            </motion.button>
            <div className="legal">
              <a href="/privacy">プライバシーポリシー</a>
              <a href="/terms">利用規約</a>
            </div>
          </>
        )}
      </Sheet>

      <Sheet open={sheet === 'login'} onClose={() => setSheet(null)} label="ログイン">
        <motion.a
          href="/auth/google"
          className="chip"
          data-testid="login-google"
          whileTap={{ scale: 0.97 }}
          style={{ textDecoration: 'none', color: 'inherit', height: 54, fontSize: 16 }}
        >
          <GoogleG />
          Googleでログイン
        </motion.a>
      </Sheet>

      <Toast toast={toast} onDone={() => setToast(null)} />
    </>
  )
}

function Avatar({ user }: { user: User }) {
  const [broken, setBroken] = useState(false)
  if (user.picture && !broken) return <img src={user.picture} alt="" referrerPolicy="no-referrer" onError={() => setBroken(true)} />
  return <span>{(user.name || user.email).slice(0, 1).toUpperCase()}</span>
}

function TaskSheet({
  task,
  onClose,
  onDelete,
  onStatus,
}: {
  task: Task | null
  onClose: () => void
  onDelete: (t: Task) => void
  onStatus: (t: Task, s: Status) => void
}) {
  const [title, setTitle] = useState('')
  const last = useRef<Task | null>(null)
  if (task) last.current = task
  const t = task ?? last.current

  useEffect(() => {
    if (task) setTitle(task.title)
  }, [task?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const close = () => {
    const trimmed = title.trim()
    if (task && trimmed && trimmed !== task.title) updateTask(task.id, { title: trimmed })
    onClose()
  }

  return (
    <Sheet open={!!task} onClose={close} label="タスク">
      {t && (
        <>
          <textarea
            data-testid="edit-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && e.keyCode !== 229) {
                e.preventDefault()
                close()
              }
            }}
          />
          <div className="sheet-row">
            {STATUSES.map((s) => (
              <motion.button
                key={s}
                className="chip"
                data-testid={`set-${s}`}
                aria-pressed={t.status === s}
                style={t.status === s ? { background: STATUS_META[s].color } : undefined}
                whileTap={{ scale: 0.94 }}
                onClick={() => (s === t.status ? close() : onStatus(t, s))}
              >
                {STATUS_META[s].label}
              </motion.button>
            ))}
          </div>
          <motion.button className="danger-btn" data-testid="delete" whileTap={{ scale: 0.97 }} onClick={() => onDelete(t)}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <Trash width={18} height={18} />
              削除
            </span>
          </motion.button>
        </>
      )}
    </Sheet>
  )
}
