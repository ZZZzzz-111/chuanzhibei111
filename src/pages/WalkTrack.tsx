import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion, AnimatePresence, MotionConfig } from 'framer-motion'
import {
  ArrowLeft,
  CalendarClock,
  ChevronDown,
  CircleCheckBig,
  Dog,
  Flag,
  History,
  Home,
  Lock,
  Pause,
  PawPrint,
  Phone,
  Play,
  RadioTower,
  SkipBack,
  SkipForward,
  Timer,
} from 'lucide-react'
import LoadingDots from '../components/LoadingDots'
import { useToast } from '../components/Toast'
import {
  endSession,
  ensureTrackSimulation,
  fmtDateTime,
  fmtLocal,
  getAllSessions,
  getLatestTrackView,
  SYNC_INTERVAL_MS,
  type TrackPoint,
  type TrackView,
  type WalkSession,
} from '../services/walkApi'
import '../styles/walk.css'

/* ============ 调色板：与 Walk 页同一套「清晨公园 / 牵绳」系统 ============
 * 草纸底 #F1F6EC · 草地绿 #2E7D46 · 树皮棕 #3B2F26 · 皮革棕 #B4763B · 黄铜 #D9A441
 * 轨迹线即牵引绳：已走 = 手里的绳（草地绿实线），待走 = 还没牵到的绳（皮革棕虚线）
 */

function fmtTime(ts: number): string {
  return new Date(ts).toTimeString().slice(0, 8)
}

/** 已走里程：路线共 41 个定位点 ≈ 2km，校准后每点约 49m */
const METERS_PER_TRACK_POINT = 49
function fmtDistance(pointCount: number): string {
  const meters = pointCount * METERS_PER_TRACK_POINT
  return meters >= 1000 ? `${(meters / 1000).toFixed(1)} km` : `${meters} m`
}

/* ============ 页面 ============ */

function WalkTrack() {
  const toast = useToast()
  const [view, setView] = useState<TrackView | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [mode, setMode] = useState<'live' | 'replay'>('live')
  const [playIndex, setPlayIndex] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState(1)
  const [selectedTs, setSelectedTs] = useState<number | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const [lastSync, setLastSync] = useState(() => Date.now())
  const [historyOpen, setHistoryOpen] = useState(false)
  const [history, setHistory] = useState<WalkSession[]>([])
  const timelineRef = useRef<HTMLDivElement | null>(null)
  // 回放播放器用的最新点数（用 ref 读取，避免轮询更新 view 时重启播放定时器）
  const totalRef = useRef(0)
  useEffect(() => {
    totalRef.current = view?.points.length ?? 0
  }, [view?.points.length])

  const refresh = useCallback(() => {
    const v = getLatestTrackView()
    setView(v)
    setLastSync(Date.now())
    setHistory(getAllSessions())
    setLoaded(true)
    return v
  }, [])

  // 实时轮询（2s ≤ 10s 要求）+ 每秒刷新时长显示
  useEffect(() => {
    const first = refresh()
    if (first.allowed && first.sessionId && first.status === 'active') {
      ensureTrackSimulation(first.sessionId)
    }
    const poll = setInterval(refresh, SYNC_INTERVAL_MS)
    const tick = setInterval(() => setNow(Date.now()), 1000)
    return () => {
      clearInterval(poll)
      clearInterval(tick)
    }
  }, [refresh])

  // 回放播放器：按速度逐点推进，走到终点自动暂停（终点判定放进更新器，避免轮询抖动）
  useEffect(() => {
    if (mode !== 'replay' || !playing) return
    const timer = setInterval(() => {
      setPlayIndex((i) => {
        const total = totalRef.current
        const next = Math.min(i + 1, Math.max(0, total - 1))
        if (total > 0 && next >= total - 1) setPlaying(false)
        return next
      })
    }, 700 / speed)
    return () => clearInterval(timer)
  }, [mode, playing, speed])

  // 实时模式下新点位到达时，时间轴自动滚动到底部（jsdom 等环境无 scrollTo，做能力守卫）
  useEffect(() => {
    const el = timelineRef.current
    if (el && mode === 'live' && typeof el.scrollTo === 'function') {
      el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
    }
  }, [view?.points.length, mode])

  const points = view?.points ?? []
  const total = points.length
  const displayIndex = mode === 'replay' ? Math.min(playIndex, Math.max(0, total - 1)) : Math.max(0, total - 1)
  const currentPoint: TrackPoint | undefined = total > 0 ? points[displayIndex] : undefined
  const planned = view?.plannedRoute ?? []
  const traversed = points
    .slice(0, displayIndex + 1)
    .map((p) => `${p.x},${p.y}`)
    .join(' ')
  const remaining = planned
    .slice(displayIndex + 1)
    .map((p) => `${p.x},${p.y}`)
    .join(' ')
  const selected = selectedTs !== null ? points.find((p) => p.ts === selectedTs) : undefined
  const isActive = view?.status === 'active'

  const switchToLive = () => {
    setMode('live')
    setPlaying(false)
    setSelectedTs(null)
  }
  const switchToReplay = () => {
    setMode('replay')
    setPlayIndex(0)
    setPlaying(false)
    setSelectedTs(null)
  }
  const handleEndService = useCallback(() => {
    if (view?.sessionId) {
      endSession(view.sessionId)
      refresh()
      toast.success('狗狗已安全送达，服务已结束')
    }
  }, [view?.sessionId, refresh, toast])

  // 键盘快捷键：服务进行中按 E 结束服务（输入框聚焦时不响应）
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'e' && e.key !== 'E') return
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      if (view?.status === 'active' && view.sessionId) {
        e.preventDefault()
        handleEndService()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [view?.status, view?.sessionId, handleEndService])

  /* ---- 页面骨架 ---- */
  const shell = (children: React.ReactNode) => (
    <MotionConfig reducedMotion="user">
      <main className="relative min-h-screen overflow-hidden bg-[#F1F6EC] text-[#3B2F26]">
        {/* 漂浮的云 + 底部草地剪影：与 Walk 页同一片公园 */}
        <svg
          className="walk-cloud top-[9%] opacity-70"
          style={{ animationDuration: '85s' }}
          width="120"
          height="44"
          viewBox="0 0 120 44"
          aria-hidden="true"
        >
          <g fill="#FFFFFF">
            <ellipse cx="36" cy="28" rx="26" ry="14" />
            <ellipse cx="66" cy="22" rx="22" ry="15" />
            <ellipse cx="92" cy="30" rx="22" ry="12" />
          </g>
        </svg>
        <svg
          className="pointer-events-none absolute bottom-0 left-0 h-14 w-full"
          viewBox="0 0 1440 56"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <path
            fill="#2E7D46"
            opacity="0.10"
            d="M0 56 V30 Q90 8 180 26 T360 24 T540 30 T720 22 T900 30 T1080 24 T1260 30 T1440 26 V56 Z"
          />
          <path
            fill="#2E7D46"
            opacity="0.06"
            d="M0 56 V40 Q120 22 240 38 T480 36 T720 40 T960 34 T1200 40 T1440 36 V56 Z"
          />
        </svg>

        <header className="relative z-10 flex flex-wrap items-center gap-3 px-6 py-5 lg:px-10">
          <motion.div whileTap={{ scale: 0.95 }} className="inline-block">
            <Link
              to="/walk"
              aria-label="返回临时遛狗官页面"
              className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-2 text-sm font-bold text-[#3B2F26]/80 shadow-[0_12px_24px_-14px_rgba(46,125,70,0.35)] transition-colors hover:text-[#2E7D46] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2E7D46]"
            >
              <ArrowLeft size={16} aria-hidden="true" />
              返回遛狗官
            </Link>
          </motion.div>
          <div className="flex items-center gap-2.5 rounded-full bg-white py-1.5 pl-2 pr-6 shadow-[0_12px_24px_-14px_rgba(46,125,70,0.35)]">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#2E7D46] text-white">
              <RadioTower size={18} aria-hidden="true" />
            </span>
            <h1 className="text-lg font-black tracking-wide">遛狗实时轨迹</h1>
          </div>
        </header>
        <div className="relative z-10 mx-auto w-full max-w-6xl px-6 pb-16 lg:px-10">{children}</div>
      </main>
    </MotionConfig>
  )

  /* ---- 首帧加载 ---- */
  if (!loaded) {
    return shell(
      <div
        className="walk-card flex min-h-[50vh] items-center justify-center rounded-[20px] bg-white"
        role="status"
        aria-label="轨迹加载中"
      >
        <LoadingDots label="正在调取遛狗轨迹..." />
      </div>
    )
  }

  /* ---- 隐私不可见状态 ---- */
  if (!view || !view.allowed) {
    const expired = view?.reason === 'expired'
    return shell(
      <div className="walk-card rounded-[20px] bg-white p-10 text-center">
        <span
          className={`mx-auto flex h-20 w-20 items-center justify-center rounded-full ${
            expired ? 'bg-[#F6E7C8] text-[#B4763B]' : 'bg-[#E4EFE0] text-[#2E7D46]'
          }`}
          aria-hidden="true"
        >
          {expired ? <Lock size={34} /> : <Dog size={38} />}
        </span>
        <h2 className="mt-5 text-xl font-black">{expired ? '隐私保护期已过' : '还没有进行中的遛狗服务'}</h2>
        <p className="mx-auto mt-2 max-w-md text-sm font-bold leading-relaxed text-[#3B2F26]/50">
          {expired
            ? `「${view?.walkerName ?? ''}」的这单服务轨迹已满 24 小时保留期，轨迹数据已自动删除，平台不留存任何行踪记录。`
            : '选好遛狗官并开始服务后，这里会实时展示毛孩子的遛弯路线。'}
        </p>
        <Link
          to="/walk"
          className="mt-7 inline-flex min-h-[44px] items-center rounded-full bg-[#2E7D46] px-6 text-sm font-black text-white shadow-[0_14px_26px_-12px_rgba(46,125,70,0.65)] transition-colors hover:bg-[#256639] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2E7D46] focus-visible:ring-offset-2"
        >
          {expired ? '去开启新的遛狗服务' : '去召唤遛狗官'}
        </Link>
      </div>
    )
  }

  /* ---- 正常轨迹视图 ---- */
  const walkedMinutes = view.createdAt ? Math.max(1, Math.round((now - view.createdAt) / 60000)) : 0

  return shell(
    <div className="flex flex-col gap-5">
      {/* 状态头：联系人 / 到达时间 / 时长 / 同步状态 */}
      <section className="walk-card flex flex-wrap items-center gap-2.5 rounded-[20px] bg-white p-4" aria-label="服务信息">
        <span className="rounded-full bg-[#EAF3E6] px-3 py-1.5 text-xs font-black text-[#2F5D3A]">
          🐕 {view.walkerName}
        </span>
        <span className="flex items-center gap-1 rounded-full bg-[#F3F8F0] px-3 py-1.5 text-xs font-black text-[#3B2F26]/70">
          <Phone size={12} className="text-[#B4763B]" aria-hidden="true" />
          {view.contactMasked}
        </span>
        <span className="flex items-center gap-1 rounded-full bg-[#F3F8F0] px-3 py-1.5 text-xs font-black text-[#3B2F26]/70">
          <CalendarClock size={12} className="text-[#B4763B]" aria-hidden="true" />
          约定 {fmtLocal(view.arrivalTime)}
        </span>
        <span className="flex items-center gap-1 rounded-full bg-[#F3F8F0] px-3 py-1.5 text-xs font-black text-[#3B2F26]/70">
          <Timer size={12} className="text-[#2E7D46]" aria-hidden="true" />
          已走 {walkedMinutes} 分钟 · {fmtDistance(total)}
        </span>
        {isActive ? (
          <span
            className="flex items-center gap-1.5 rounded-full bg-[#2E7D46] px-3 py-1.5 text-xs font-black text-white"
            role="status"
          >
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full rounded-full bg-white opacity-60 motion-safe:animate-ping" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-white" />
            </span>
            实时同步中 · 延迟 ≤ 10s
          </span>
        ) : (
          <span className="rounded-full bg-[#3B2F26]/8 px-3 py-1.5 text-xs font-black text-[#3B2F26]/60" role="status">
            服务已结束 · 可回放
          </span>
        )}
        <span className="num-display text-[11px] font-bold text-[#3B2F26]/40">上次同步 {fmtTime(lastSync)}</span>
        {isActive && (
          <div className="ml-auto flex items-center gap-2">
            <span className="hidden text-[11px] font-bold text-[#3B2F26]/40 sm:inline">
              按{' '}
              <kbd className="rounded bg-[#3B2F26]/8 px-1.5 py-0.5 text-[10px] font-semibold text-[#3B2F26]/60">E</kbd>{' '}
              结束
            </span>
            <motion.button
              type="button"
              onClick={handleEndService}
              whileTap={{ scale: 0.94 }}
              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-full border-2 border-[#C2703D]/40 bg-[#FBF1E9] px-4 py-2 text-xs font-black text-[#A34E1F] transition-colors hover:border-[#C2703D]/70 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#C2703D]"
              aria-label="结束本次遛狗服务"
            >
              <Flag size={14} aria-hidden="true" />
              结束服务
            </motion.button>
          </div>
        )}
      </section>

      {/* 已安全送达：服务完成时弹出，清晰展示狗狗被送回的时间 */}
      <AnimatePresence>
        {view.returnedAt != null && view.status === 'ended' && (
          <motion.section
            key="delivered"
            initial={{ opacity: 0, y: -18, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -18 }}
            transition={{ type: 'spring', stiffness: 260, damping: 20 }}
            role="status"
            aria-live="polite"
            className="flex flex-wrap items-center gap-3 rounded-[20px] bg-[#EAF3E6] p-5 shadow-[0_16px_30px_-18px_rgba(46,125,70,0.45)]"
          >
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#2E7D46] text-white" aria-hidden="true">
              <CircleCheckBig size={24} />
            </span>
            <div className="flex-1">
              <p className="text-base font-black text-[#1F4A2C]">{view.walkerName} 已将狗狗安全送回！</p>
              <p className="mt-1 text-xs font-bold text-[#2F5D3A]/85">
                安全送达时间：
                <span className="num-display">{fmtDateTime(view.returnedAt)}</span>
                {view.createdAt !== null && (
                  <span className="ml-2">（本次服务总用时 {Math.max(1, Math.round((view.returnedAt - view.createdAt) / 60000))} 分钟）</span>
                )}
              </p>
            </div>
          </motion.section>
        )}
      </AnimatePresence>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_340px]">
        {/* 地图：牵引绳轨迹线 + 位置点标记 + 小狗 */}
        <section className="walk-card overflow-hidden rounded-[20px] bg-white p-4" aria-label="轨迹地图">
          <div className="relative h-[360px] overflow-hidden rounded-2xl bg-[#F4F9F1] sm:h-[440px]">
            {/* 纸图装饰：池塘与树冠（软色块，不用贴纸） */}
            <span className="absolute left-[14%] top-[10%] h-16 w-28 rounded-[100%] bg-[#CFE7EE]" aria-hidden="true" />
            <span className="absolute right-[12%] top-[6%] h-16 w-16 rounded-full bg-[#DCEBD5]" aria-hidden="true" />
            <span className="absolute right-[16.5%] top-[13%] h-9 w-9 rounded-full bg-[#D3E6CB]" aria-hidden="true" />
            <span className="absolute right-[30%] top-[42%] h-12 w-12 rounded-full bg-[#DCEBD5]/90" aria-hidden="true" />
            <span className="absolute left-[64%] top-[62%] h-8 w-12 rounded-[100%] bg-[#E3EFDC]/80" aria-hidden="true" />

            {/* 轨迹线：皮革虚线=还没牵到的绳，草地绿实线=手里的绳 */}
            <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
              {remaining && (
                <polyline
                  points={remaining}
                  fill="none"
                  stroke="#B4763B"
                  strokeWidth="2"
                  strokeDasharray="4 5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  vectorEffect="non-scaling-stroke"
                />
              )}
              {traversed && (
                <polyline
                  points={traversed}
                  fill="none"
                  stroke="#2E7D46"
                  strokeWidth="3.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  vectorEffect="non-scaling-stroke"
                />
              )}
            </svg>

            {/* 位置点标记（可点击查看时间戳）：外层 44px 触摸区，内层保留视觉圆点 */}
            {points.map((p, i) => (
              <button
                key={p.ts}
                type="button"
                onClick={() => setSelectedTs(selectedTs === p.ts ? null : p.ts)}
                aria-label={`第 ${i + 1} 站 ${p.label}，时间 ${fmtTime(p.ts)}`}
                aria-pressed={selectedTs === p.ts}
                className={`absolute z-10 flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full transition-transform hover:scale-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2E7D46]`}
                style={{ left: `${p.x}%`, top: `${p.y}%` }}
              >
                <span
                  className={`rounded-full ${
                    selectedTs === p.ts
                      ? 'h-4 w-4 bg-[#D9A441] ring-4 ring-[#D9A441]/30'
                      : i === displayIndex
                        ? 'h-3.5 w-3.5 bg-[#2E7D46] ring-2 ring-[#2E7D46]/25'
                        : 'h-2 w-2 bg-[#2E7D46]/80 ring-2 ring-white'
                  }`}
                  aria-hidden="true"
                />
              </button>
            ))}

            {/* 起点 / 终点小圆牌 */}
            {points[0] && (
              <span
                className="absolute z-10 flex h-7 w-7 items-center justify-center rounded-full bg-white text-[#B4763B] shadow-[0_6px_14px_-6px_rgba(59,47,38,0.4)]"
                style={{ left: `${points[0].x}%`, top: `${points[0].y}%`, transform: 'translate(-140%,-50%)' }}
                aria-hidden="true"
              >
                <Home size={14} />
              </span>
            )}
            {total > 1 && points[total - 1] && (
              <span
                className="absolute z-10 flex h-7 w-7 items-center justify-center rounded-full bg-white text-[#2E7D46] shadow-[0_6px_14px_-6px_rgba(59,47,38,0.4)]"
                style={{ left: `${points[total - 1].x}%`, top: `${points[total - 1].y}%`, transform: 'translate(40%,-50%)' }}
                aria-hidden="true"
              >
                <Flag size={13} />
              </span>
            )}

            {/* 当前位置：实时小狗 / 回放爪印 */}
            {currentPoint && (
              <div
                className="pointer-events-none absolute z-20 -translate-x-1/2 -translate-y-1/2"
                style={{ left: `${currentPoint.x}%`, top: `${currentPoint.y}%` }}
              >
                <motion.span
                  key={`${mode}-${currentPoint.ts}`}
                  initial={{ scale: 0.3, y: -10 }}
                  animate={{ scale: 1, y: 0 }}
                  transition={{ type: 'spring', stiffness: 300, damping: 12 }}
                  className={`inline-flex h-9 w-9 items-center justify-center rounded-full bg-white shadow-[0_8px_16px_-8px_rgba(46,125,70,0.55)] ${
                    mode === 'live' && isActive ? 'ring-2 ring-[#2E7D46]' : 'ring-2 ring-[#B4763B]/40'
                  }`}
                  aria-hidden="true"
                >
                  {mode === 'live' ? (
                    <Dog size={19} className="text-[#3B2F26]" />
                  ) : (
                    <PawPrint size={17} className="text-[#B4763B]" />
                  )}
                </motion.span>
              </div>
            )}

            {/* 位置点气泡：时间戳 + 地名 */}
            <AnimatePresence>
              {selected && (
                <div
                  key={selected.ts}
                  className="pointer-events-none absolute z-30 -translate-x-1/2"
                  style={{ left: `${selected.x}%`, top: `${selected.y}%` }}
                >
                  <div className="-translate-y-[calc(100%+14px)]">
                    <motion.div
                      initial={{ opacity: 0, scale: 0.6, y: 8 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.6 }}
                      transition={{ type: 'spring', stiffness: 320, damping: 18 }}
                      className="num-display whitespace-nowrap rounded-xl border-2 border-[#B4763B]/25 bg-white px-3 py-1.5 text-[11px] font-bold text-[#3B2F26]/80 shadow-[0_10px_20px_-12px_rgba(59,47,38,0.4)]"
                    >
                      ⏱ {fmtTime(selected.ts)} · 📍 {selected.label}
                    </motion.div>
                  </div>
                </div>
              )}
            </AnimatePresence>

            {/* 无点位提示 */}
            {total === 0 && (
              <div className="absolute inset-0 flex flex-col items-center justify-center" role="status">
                <motion.span
                  animate={{ y: [0, -6, 0] }}
                  transition={{ repeat: Infinity, duration: 1.6 }}
                  className="flex h-14 w-14 items-center justify-center rounded-full bg-white text-[#B4763B] shadow-[0_10px_20px_-12px_rgba(59,47,38,0.4)]"
                  aria-hidden="true"
                >
                  <PawPrint size={24} />
                </motion.span>
                <p className="mt-3 text-sm font-black text-[#3B2F26]/45">等待遛狗官上报第一个定位点…</p>
              </div>
            )}

            {/* 图例 */}
            <div className="absolute bottom-2.5 left-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl bg-white/90 px-3 py-1.5 text-[10px] font-bold text-[#3B2F26]/60">
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-[3px] w-5 rounded-full bg-[#2E7D46]" aria-hidden="true" />
                已走过
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-0 w-5 border-t-2 border-dashed border-[#B4763B]" aria-hidden="true" />
                待走
              </span>
              <span className="flex items-center gap-1">
                <Dog size={12} aria-hidden="true" />
                当前位置
              </span>
              <span>点击圆点看时间</span>
            </div>
          </div>

          {/* 模式切换 + 回放控制 */}
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <div className="flex gap-2" role="group" aria-label="查看模式切换">
              <button
                type="button"
                onClick={switchToLive}
                aria-pressed={mode === 'live'}
                className={`inline-flex min-h-[44px] items-center gap-1.5 rounded-full border px-4 py-2 text-xs font-black transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2E7D46] ${
                  mode === 'live'
                    ? 'border-[#2E7D46] bg-[#2E7D46] text-white shadow-[0_8px_16px_-8px_rgba(46,125,70,0.6)]'
                    : 'border-[#3B2F26]/15 bg-white text-[#3B2F26]/70 hover:border-[#2E7D46]/40 hover:text-[#2E7D46]'
                }`}
              >
                <RadioTower size={14} aria-hidden="true" />
                实时
              </button>
              <button
                type="button"
                onClick={switchToReplay}
                aria-pressed={mode === 'replay'}
                disabled={total < 2}
                className={`inline-flex min-h-[44px] items-center gap-1.5 rounded-full border px-4 py-2 text-xs font-black transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2E7D46] disabled:cursor-not-allowed disabled:opacity-40 ${
                  mode === 'replay'
                    ? 'border-[#2E7D46] bg-[#2E7D46] text-white shadow-[0_8px_16px_-8px_rgba(46,125,70,0.6)]'
                    : 'border-[#3B2F26]/15 bg-white text-[#3B2F26]/70 hover:border-[#2E7D46]/40 hover:text-[#2E7D46]'
                }`}
              >
                <History size={14} aria-hidden="true" />
                轨迹回放
              </button>
            </div>
            {mode === 'live' ? (
              <p className="text-xs font-bold text-[#3B2F26]/45">
                {isActive ? `遛狗官端每 ${SYNC_INTERVAL_MS / 1000} 秒自动上报一次位置` : '服务已结束，切换到回放查看完整路线'}
              </p>
            ) : (
              <p className="text-xs font-black text-[#2F5D3A]" role="status" aria-label="回放进度">
                <span className="num-display">{currentPoint ? fmtTime(currentPoint.ts) : '--:--:--'}</span>
                <span>
                  {' '}· 📍 {currentPoint?.label ?? '--'} · 第 {displayIndex + 1}/{total} 站
                </span>
              </p>
            )}
          </div>
        </section>

        {/* 右栏：回放控制 + 时间轴 + 隐私说明 */}
        <div className="flex flex-col gap-5">
          {mode === 'replay' && (
            <motion.section
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ type: 'spring', stiffness: 220, damping: 20 }}
              className="walk-card rounded-[20px] bg-white p-5"
              aria-label="回放控制台"
            >
              <h2 className="mb-3 flex items-center gap-1.5 text-sm font-black">
                <History size={15} className="text-[#2E7D46]" aria-hidden="true" />
                回放控制台
              </h2>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => { setPlayIndex(0); setPlaying(false) }}
                  aria-label="回到起点"
                  className="inline-flex h-[44px] w-[44px] items-center justify-center rounded-full border-2 border-[#3B2F26]/15 bg-white text-[#3B2F26]/70 transition-colors hover:border-[#3B2F26]/35 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2E7D46]"
                >
                  <SkipBack size={16} aria-hidden="true" />
                </button>
                <motion.button
                  type="button"
                  onClick={() => setPlaying((p) => !p)}
                  whileTap={{ scale: 0.9 }}
                  aria-label={playing ? '暂停回放' : '播放回放'}
                  className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-full bg-[#2E7D46] px-5 text-sm font-black text-white shadow-[0_12px_22px_-10px_rgba(46,125,70,0.65)] transition-colors hover:bg-[#256639] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2E7D46] focus-visible:ring-offset-2"
                >
                  {playing ? <Pause size={16} aria-hidden="true" /> : <Play size={16} aria-hidden="true" />}
                  {playing ? '暂停' : '播放'}
                </motion.button>
                <button
                  type="button"
                  onClick={() => { setPlayIndex(Math.max(0, total - 1)); setPlaying(false) }}
                  aria-label="跳到终点"
                  className="inline-flex h-[44px] w-[44px] items-center justify-center rounded-full border-2 border-[#3B2F26]/15 bg-white text-[#3B2F26]/70 transition-colors hover:border-[#3B2F26]/35 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2E7D46]"
                >
                  <SkipForward size={16} aria-hidden="true" />
                </button>
              </div>
              <div className="mt-3 flex items-center justify-end gap-1" role="group" aria-label="回放速度">
                {[1, 2, 4].map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setSpeed(s)}
                    aria-pressed={speed === s}
                    aria-label={`${s}倍速播放`}
                    className={`num-display inline-flex min-h-[40px] items-center rounded-full border px-3 py-1.5 text-[11px] font-bold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2E7D46] ${
                      speed === s
                        ? 'border-[#2E7D46] bg-[#2E7D46] text-white'
                        : 'border-[#3B2F26]/15 bg-white text-[#3B2F26]/60 hover:border-[#2E7D46]/40'
                    }`}
                  >
                    ×{s}
                  </button>
                ))}
              </div>
              <input
                type="range"
                min={0}
                max={Math.max(0, total - 1)}
                value={displayIndex}
                onChange={(e) => setPlayIndex(Number(e.target.value))}
                aria-label="回放进度滑块"
                className="mt-3 w-full accent-[#2E7D46]"
              />
            </motion.section>
          )}

          {/* 时间轴：时间序列 */}
          <section className="walk-card rounded-[20px] bg-white p-5" aria-label="轨迹时间轴">
            <h2 className="mb-3 flex items-center justify-between text-sm font-black">
              <span className="flex items-center gap-1.5">
                <Timer size={15} className="text-[#2E7D46]" aria-hidden="true" />
                行动时间轴
              </span>
              <span className="num-display text-[11px] font-bold text-[#3B2F26]/40">{total} 个定位点</span>
            </h2>
            <div ref={timelineRef} className="max-h-56 overflow-y-auto rounded-2xl bg-[#F3F8F0] p-2" role="log" aria-label="按时间排序的轨迹点">
              {total === 0 ? (
                <p className="px-3 py-6 text-center text-xs font-bold text-[#3B2F26]/40">定位点上报中…</p>
              ) : (
                points.map((p, i) => (
                  <div
                    key={p.ts}
                    className={`num-display flex items-center gap-2 rounded-xl px-3 py-1.5 text-xs font-bold ${
                      i === total - 1 && isActive && mode === 'live'
                        ? 'bg-[#DCF0DC] text-[#1F4A2C]'
                        : 'text-[#3B2F26]/60'
                    }`}
                  >
                    <span className="w-7 shrink-0 text-[#3B2F26]/35">#{i + 1}</span>
                    <span>{fmtTime(p.ts)}</span>
                    <span className="font-sans">{p.label}</span>
                  </div>
                ))
              )}
            </div>
          </section>

          {/* 隐私承诺 */}
          <p
            className="flex items-start gap-2 rounded-[20px] bg-[#FBF7EF] px-4 py-3 text-xs font-bold leading-relaxed text-[#3B2F26]/65"
            role="note"
          >
            <Lock size={13} className="mt-0.5 shrink-0 text-[#B4763B]" aria-hidden="true" />
            <span>
              隐私承诺：轨迹仅可在服务进行中及结束后 24 小时内查看
              {view.retainedUntil ? `（本次轨迹保留至 ${fmtDateTime(view.retainedUntil)}）` : ''}，
              到期自动删除，不作任何其他用途。
            </span>
          </p>

          {/* 历史服务记录：按时间倒序，保留已持久化的关键时间节点 */}
          <motion.section className="walk-card rounded-[20px] bg-white p-4" aria-label="历史服务记录">
            <button
              type="button"
              onClick={() => setHistoryOpen((o) => !o)}
              aria-expanded={historyOpen}
              className="flex w-full items-center justify-between text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2E7D46] focus-visible:ring-offset-2 rounded-full"
            >
              <span className="flex items-center gap-2 text-sm font-black">
                <History size={15} className="text-[#2E7D46]" aria-hidden="true" />
                历史服务记录
                <span className="rounded-full bg-[#F3F8F0] px-2 py-0.5 text-[10px] font-bold text-[#2F5D3A]">
                  共 {history.length} 条（隐私期内可查）
                </span>
              </span>
              <motion.span
                animate={{ rotate: historyOpen ? 180 : 0 }}
                transition={{ duration: 0.2 }}
                className="text-[#3B2F26]/40"
              >
                <ChevronDown size={16} aria-hidden="true" />
              </motion.span>
            </button>
            <AnimatePresence initial={false}>
              {historyOpen && (
                <motion.ul
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.22 }}
                  className="mt-3 space-y-2 overflow-hidden"
                >
                  {history.length === 0 ? (
                    <li className="rounded-xl bg-[#F3F8F0] px-3 py-4 text-center text-xs font-bold text-[#3B2F26]/40">
                      暂无历史服务记录
                    </li>
                  ) : (
                    history.slice(0, 10).map((s) => (
                      <li
                        key={s.id}
                        className={`rounded-xl border-2 px-3 py-2 text-[11px] font-bold leading-relaxed ${
                          s.status === 'active'
                            ? 'border-[#2E7D46]/40 bg-[#EAF3E6] text-[#1F4A2C]'
                            : 'border-[#3B2F26]/10 bg-[#FAF7F0] text-[#3B2F26]/70'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-black">{s.walkerName}</span>
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-black ${
                              s.status === 'active' ? 'bg-[#2E7D46] text-white' : 'bg-[#3B2F26]/10 text-[#3B2F26]/55'
                            }`}
                          >
                            {s.status === 'active' ? '进行中' : '已完成'}
                          </span>
                        </div>
                        <div className="num-display mt-1.5 grid grid-cols-1 gap-1">
                          <span>发起：{fmtDateTime(s.createdAt)}</span>
                          <span>约定到达：{fmtLocal(s.arrivalTime)}</span>
                          {s.returnedAt != null ? (
                            <span className="text-[#2E7D46]">✅ 安全送达：{fmtDateTime(s.returnedAt)}</span>
                          ) : s.status === 'ended' ? (
                            <span className="text-[#A34E1F]">未记录送达时间</span>
                          ) : (
                            <span className="text-[#3B2F26]/40">服务进行中…</span>
                          )}
                        </div>
                      </li>
                    ))
                  )}
                </motion.ul>
              )}
            </AnimatePresence>
          </motion.section>
        </div>
      </div>
    </div>
  )
}

export default WalkTrack
