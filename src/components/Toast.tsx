import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { CheckCircle2, XCircle, Info, X } from 'lucide-react'

type ToastType = 'success' | 'error' | 'info'

interface ToastItem {
  id: number
  type: ToastType
  message: string
}

interface ToastContextValue {
  success: (message: string) => void
  error: (message: string) => void
  info: (message: string) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

/** 使用 Toast：在子组件中调用 useToast() 获得 success/error/info */
export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast 必须在 <ToastProvider> 内部使用')
  return ctx
}

const ICONS: Record<ToastType, typeof CheckCircle2> = {
  success: CheckCircle2,
  error: XCircle,
  info: Info,
}

const STYLES: Record<ToastType, string> = {
  success: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  error: 'border-rose-200 bg-rose-50 text-rose-800',
  info: 'border-sky-200 bg-sky-50 text-sky-800',
}

const ICON_COLOR: Record<ToastType, string> = {
  success: 'text-emerald-500',
  error: 'text-rose-500',
  info: 'text-sky-500',
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const idRef = useRef(0)

  const remove = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const push = useCallback(
    (type: ToastType, message: string) => {
      const id = ++idRef.current
      setToasts((prev) => {
        // 成功提示出现时清除之前的错误提示，避免"问题已修复但错误还在"的困惑
        const kept = type === 'success' ? prev.filter((t) => t.type !== 'error') : prev
        return [...kept, { id, type, message }]
      })
      // 3 秒后自动消失（足够阅读又不阻塞）
      setTimeout(() => remove(id), 3000)
    },
    [remove]
  )

  const value = useMemo<ToastContextValue>(
    () => ({
      success: (m) => push('success', m),
      error: (m) => push('error', m),
      info: (m) => push('info', m),
    }),
    [push]
  )

  return (
    <ToastContext.Provider value={value}>
      {children}
      {/* 固定在视口右上角，不阻挡主操作区 */}
      <div
        className="pointer-events-none fixed right-4 top-4 z-[100] flex w-[min(92vw,360px)] flex-col gap-2"
        role="region"
        aria-label="操作通知"
      >
        <AnimatePresence initial={false}>
          {toasts.map((t) => {
            const Icon = ICONS[t.type]
            return (
              <motion.div
                key={t.id}
                layout
                initial={{ opacity: 0, x: 40, scale: 0.9 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={{ opacity: 0, x: 40, scale: 0.9 }}
                transition={{ type: 'spring', stiffness: 380, damping: 28 }}
                className={`pointer-events-auto flex items-start gap-2.5 rounded-2xl border px-4 py-3 shadow-lg ${STYLES[t.type]}`}
                role={t.type === 'error' ? 'alert' : 'status'}
              >
                <Icon size={18} className={`mt-0.5 shrink-0 ${ICON_COLOR[t.type]}`} aria-hidden="true" />
                <p className="flex-1 text-sm font-bold leading-snug">{t.message}</p>
                <button
                  type="button"
                  onClick={() => remove(t.id)}
                  aria-label="关闭通知"
                  className="shrink-0 rounded-full p-0.5 opacity-50 transition hover:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-current"
                >
                  <X size={14} aria-hidden="true" />
                </button>
              </motion.div>
            )
          })}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  )
}
