import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence, MotionConfig, useReducedMotion } from 'framer-motion'
import {
  CalendarClock,
  Clock,
  CloudFog,
  Dog,
  Droplet,
  Flag,
  Footprints,
  Home,
  PawPrint,
  Phone,
  RadioTower,
  Route,
  Save,
  Sparkles,
  Timer,
  Zap,
  type LucideIcon,
} from 'lucide-react'
import BackToPlanet from '../components/BackToPlanet'
import { useToast } from '../components/Toast'
import {
  WALKERS,
  canViewTrack,
  createSession,
  getActiveSession,
  getLatestSession,
  getUpcomingArrival,
  getWalkerDraft,
  saveWalkerDraft,
  startTrackSimulation,
  type FieldErrors,
  type SessionDraft,
  type WalkSession,
} from '../services/walkApi'
import '../styles/walk.css'

/* ============ 调色板（清晨公园） ============
 * 草纸底 #F1F6EC · 草地绿 #2E7D46 · 树皮棕 #3B2F26
 * 皮革棕 #B4763B（仅用于绳系元素）· 黄铜 #D9A441（狗牌）
 */

/* ============ 数据 ============ */

const DURATIONS = [
  { id: '30min', label: '30 分钟' },
  { id: '1h', label: '1 小时' },
]

const PET_STATES = [
  { id: 'energetic', label: '精力旺盛' },
  { id: 'shy', label: '社恐胆小' },
]

const EXTRAS = [
  { id: 'water', label: '需要喂水' },
  { id: 'flat', label: '只走平路' },
]

/** 各选项的图标（按 id 取用，替代 emoji 贴纸） */
const OPTION_ICONS: Record<string, LucideIcon> = {
  '30min': Clock,
  '1h': Timer,
  energetic: Zap,
  shy: CloudFog,
  water: Droplet,
  flat: Route,
}

// Walker 接口 & WALKERS 数据已统一放到 services/walkApi.ts，避免多处漂移

/* ============ 小组件 ============ */

/** 匹配度数字：圆润展示字体（替代此前的 Comic Sans 发光体） */
function MatchNumber({ value }: { value: number }) {
  return (
    <span className="num-display text-2xl font-extrabold leading-none text-[#2E7D46]">{value}%</span>
  )
}

/** 登山扣：挂在卡片角上的绳系节点，选定后变绿表示"已上绳" */
function ClipMark({ selected }: { selected: boolean }) {
  return (
    <svg
      viewBox="0 0 20 28"
      className="absolute -left-2 -top-2 h-7 w-5 -rotate-12"
      aria-hidden="true"
    >
      <rect
        x="5.5"
        y="3"
        width="9"
        height="22"
        rx="4.5"
        fill={selected ? '#2E7D46' : '#FFFFFF'}
        stroke={selected ? '#2E7D46' : '#B4763B'}
        strokeWidth="2.5"
      />
      <line
        x1="8"
        y1="13"
        x2="12"
        y2="11"
        stroke={selected ? '#FFFFFF' : '#B4763B'}
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </svg>
  )
}

/** 黄铜狗牌：像项圈牌一样挂在 AI 首推的头像上 */
function DogTag() {
  return (
    <svg viewBox="0 0 24 34" className="absolute -bottom-3 -right-2.5 w-6 rotate-12" aria-hidden="true">
      <circle cx="12" cy="4.5" r="2.2" fill="#F1F6EC" stroke="#B4763B" strokeWidth="1.5" />
      <rect x="2" y="5.5" width="20" height="27" rx="6" fill="#D9A441" stroke="#B4763B" strokeWidth="2" />
      <text x="12" y="22.5" textAnchor="middle" fontSize="9.5" fontWeight="800" fill="#5C3D0E">
        首推
      </text>
    </svg>
  )
}

/** 表单分组小标题 */
function FieldLabel({ icon: Icon, children }: { icon: LucideIcon; children: React.ReactNode }) {
  return (
    <h3 className="mb-2 flex items-center gap-1.5 text-[13px] font-bold text-[#3B2F26]/55">
      <Icon size={14} className="text-[#2E7D46]" aria-hidden="true" />
      {children}
    </h3>
  )
}

/** 选项胶囊：图标 + 文案，选中 = 草地绿 */
function Pill({
  active,
  onClick,
  icon: Icon,
  children,
  ariaLabel,
}: {
  active: boolean
  onClick: () => void
  icon: LucideIcon
  children: React.ReactNode
  ariaLabel: string
}) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileTap={{ scale: 0.94 }}
      aria-pressed={active}
      aria-label={ariaLabel}
      className={`inline-flex min-h-[44px] items-center gap-1.5 rounded-full border px-4 py-2 text-sm font-bold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2E7D46] ${
        active
          ? 'border-[#2E7D46] bg-[#2E7D46] text-white shadow-[0_8px_16px_-8px_rgba(46,125,70,0.6)]'
          : 'border-[#3B2F26]/15 bg-white text-[#3B2F26]/70 hover:border-[#2E7D46]/40 hover:text-[#2E7D46]'
      }`}
    >
      <Icon size={15} aria-hidden="true" />
      {children}
    </motion.button>
  )
}

/** 空状态插画：盘成一圈的牵引绳 */
function LeashCoil() {
  return (
    <svg width="128" height="92" viewBox="0 0 128 92" aria-hidden="true">
      <ellipse cx="62" cy="44" rx="36" ry="25" fill="none" stroke="#B4763B" strokeWidth="5.5" />
      <ellipse cx="62" cy="39" rx="27" ry="17" fill="none" stroke="#C98F52" strokeWidth="4" />
      <path
        d="M 92 54 q 15 9 13 26"
        stroke="#B4763B"
        strokeWidth="5.5"
        fill="none"
        strokeLinecap="round"
      />
      <circle cx="105" cy="84" r="5" fill="none" stroke="#B4763B" strokeWidth="3.5" />
    </svg>
  )
}

/** 平滑水平曲线：把站点串成一条遛弯小径 */
function leashPath(pts: { x: number; y: number }[]): string {
  let d = `M ${pts[0].x} ${pts[0].y}`
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]
    const b = pts[i]
    const mx = (a.x + b.x) / 2
    d += ` C ${mx} ${a.y}, ${mx} ${b.y}, ${b.x} ${b.y}`
  }
  return d
}

/** 路线预告小地图：起点家门 → 特殊要求站点 → 平安到家，小狗沿小径小跑 */
const ROUTE_STOP_ICONS: Record<string, LucideIcon> = {
  home: Home,
  water: Droplet,
  flat: Route,
  flag: Flag,
}

function RoutePreview({ stopIds, tip }: { stopIds: string[]; tip: string }) {
  const W = 320
  const H = 60
  const reduceMotion = useReducedMotion()
  const start = { x: 18, y: 44 }
  const end = { x: W - 18, y: 26 }
  const mids = stopIds.slice(1, -1).map((id, i, arr) => ({
    id,
    x: start.x + ((end.x - start.x) * (i + 1)) / (arr.length + 1),
    y: i % 2 === 0 ? 16 : 40,
  }))
  const pts = [start, ...mids.map((m) => ({ x: m.x, y: m.y })), end]
  const d = leashPath(pts)

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.85, type: 'spring', stiffness: 200, damping: 18 }}
      className="mt-3 rounded-2xl bg-[#F3F8F0] px-4 pb-3 pt-3"
    >
      {/* 响应式：viewBox 随宽度缩放，小狗用 SMIL 沿路径往返（尊重减弱动效） */}
      <svg className="mx-auto block h-auto w-full max-w-[320px]" viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
        <path
          d={d}
          fill="none"
          stroke="#B4763B"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeDasharray="1 8"
        />
        {pts.map((p, i) => {
          const id = i === 0 ? 'home' : i === pts.length - 1 ? 'flag' : mids[i - 1].id
          const Icon = ROUTE_STOP_ICONS[id]
          const color = i === 0 ? '#B4763B' : '#2E7D46'
          return (
            <g key={i} transform={`translate(${p.x}, ${p.y})`}>
              <circle r="11.5" fill="#FFFFFF" stroke="#E3D5BC" strokeWidth="1.5" />
              <Icon x={-7} y={-7} width={14} height={14} color={color} />
            </g>
          )
        })}
        {!reduceMotion && (
          <g>
            <Dog x={-9} y={-9} width={18} height={18} color="#3B2F26" />
            <animateMotion
              dur="6s"
              repeatCount="indefinite"
              rotate="auto"
              calcMode="linear"
              keyPoints="0;1;0"
              keyTimes="0;0.5;1"
              path={d}
            />
          </g>
        )}
      </svg>
      <p className="mt-1.5 text-xs font-bold leading-relaxed text-[#2F5D3A]">{tip}</p>
    </motion.div>
  )
}

/* ============ 页面 ============ */

type Phase = 'idle' | 'loading' | 'done'

function Walk() {
  const [duration, setDuration] = useState('30min')
  const [petState, setPetState] = useState('energetic')
  const [extras, setExtras] = useState<string[]>([])
  const [phase, setPhase] = useState<Phase>('idle')

  // AI 匹配加载计时（带清理，防连点乱跳）
  useEffect(() => {
    if (phase !== 'loading') return
    const t = setTimeout(() => setPhase('done'), 1600)
    return () => clearTimeout(t)
  }, [phase])

  // —— 遛狗官选中与服务信息登记 ——
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [draft, setDraft] = useState<SessionDraft>({ contact: '', arrivalTime: '', saved: false })
  const [errors, setErrors] = useState<FieldErrors>({ contact: null, arrivalTime: null })
  const [recentSession] = useState<WalkSession | null>(() => getLatestSession())
  const navigate = useNavigate()
  const toast = useToast()

  const selectedWalker = WALKERS.find((w) => w.id === selectedId) ?? null

  /** 选定遛狗官：瞬间自动填充手机号 + 默认到达时间（无延迟）
   * 若该遛狗官已有保存过的草稿（用户之前改过），优先复用；否则用系统预置值 */
  const handleSelect = (walkerId: number) => {
    const walker = WALKERS.find((w) => w.id === walkerId)
    if (!walker) return
    setSelectedId(walkerId)
    setErrors({ contact: null, arrivalTime: null })
    const existing = getWalkerDraft(walkerId)
    if (existing.contact && existing.arrivalTime) {
      // 用户之前填过并保存过 → 直接复用（含他可能改过的内容）
      setDraft(existing)
    } else {
      // 首次选中 → 用系统预置值瞬间填充，saved 标记为 false 提示用户可修改再保存
      setDraft({
        contact: walker.phone,
        arrivalTime: getUpcomingArrival(walker.defaultArrivalMinutes),
        saved: false,
      })
    }
  }

  /** 编辑任意字段：立即标记为"待保存"并清除该项错误 */
  const updateDraft = (field: 'contact' | 'arrivalTime', value: string) => {
    setDraft((d) => ({ ...d, [field]: value, saved: false }))
    setErrors((e) => ({ ...e, [field]: null }))
  }

  /** 保存服务信息（校验不通过会给出逐字段错误提示） */
  const handleSave = () => {
    if (selectedId === null) return
    const res = saveWalkerDraft(selectedId, { contact: draft.contact, arrivalTime: draft.arrivalTime })
    setErrors(res.errors)
    if (res.ok) {
      setDraft((d) => ({ ...d, saved: true }))
      toast.success('服务信息已保存')
    } else {
      toast.error('请检查联系方式与到达时间')
    }
  }

  /** 确认开始服务：创建会话 → 启动轨迹上报 → 进入实时轨迹页 */
  const handleStartService = () => {
    if (selectedId === null || !selectedWalker) return
    // 已有进行中的服务：直接带用户去看轨迹
    if (getActiveSession()) {
      navigate('/walk/track')
      return
    }
    // 未保存则先保存（校验失败则拦截）
    if (!draft.saved) {
      const res = saveWalkerDraft(selectedId, { contact: draft.contact, arrivalTime: draft.arrivalTime })
      setErrors(res.errors)
      if (!res.ok) {
        toast.error('请先完善联系方式与到达时间')
        return
      }
    }
    const res = createSession({
      walkerId: selectedWalker.id,
      walkerName: selectedWalker.name,
      contact: draft.contact,
      arrivalTime: draft.arrivalTime,
    })
    if (!res.session) {
      toast.error('服务启动失败，请重试')
      return
    }
    startTrackSimulation(res.session.id)
    toast.success(`已指派 ${selectedWalker.name}，正在进入实时轨迹`)
    navigate('/walk/track')
  }

  const toggleExtra = (id: string) => {
    setExtras((prev) => (prev.includes(id) ? prev.filter((e) => e !== id) : [...prev, id]))
  }

  /** 输入框回车 → 直接开始服务（减少一次按钮点击） */
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      handleStartService()
    }
  }

  // 字段有效态（无错误且非空）→ 绿色边框给出即时正反馈
  const contactValid = !errors.contact && /^1[3-9]\d{9}$/.test(draft.contact)
  const arrivalValid = !errors.arrivalTime && draft.arrivalTime.length > 0

  const handleSummon = () => {
    if (phase === 'loading') return
    setPhase('loading')
  }

  // AI 智慧匹配：宠物状态影响排序与匹配度（社恐犬 → 训导员登顶）
  const matched = useMemo(() => {
    const list = WALKERS.map((w) => {
      let score = w.base
      if (petState === 'shy') {
        if (w.id === 3) score += 12
        if (w.id === 1) score -= 2
      } else {
        if (w.id === 1) score = Math.min(99, score + 0)
      }
      return { ...w, match: Math.min(99, score) }
    })
    return list.sort((a, b) => b.match - a.match)
  }, [petState])

  const summary = useMemo(() => {
    const d = DURATIONS.find((x) => x.id === duration)?.label ?? ''
    const s = PET_STATES.find((x) => x.id === petState)?.label ?? ''
    const e = EXTRAS.filter((x) => extras.includes(x.id))
      .map((x) => x.label)
      .join(' · ')
    return `已根据「${d} · ${s}${e ? ' · ' + e : ''}」为你精选 3 位遛狗官`
  }, [duration, petState, extras])

  // 路线沿途站点 id：随特殊要求动态生成（home 起点 / flag 终点固定）
  const routeStopIds = useMemo(() => ['home', ...extras, 'flag'], [extras])
  const routeTip = useMemo(() => {
    const notes: string[] = []
    if (extras.includes('water')) notes.push('沿途设有饮水点')
    if (extras.includes('flat')) notes.push('全程平坦无台阶')
    return (
      '已避开施工路段和流浪狗聚集区，规划出最安全的 2km 散步路线。' +
      (notes.length > 0 ? `（${notes.join('，')}）` : '')
    )
  }, [extras])

  return (
    <MotionConfig reducedMotion="user">
      <main className="relative min-h-screen overflow-hidden bg-[#F1F6EC] text-[#3B2F26]">
        {/* 漂浮的云：清晨公园上空 */}
        <svg
          className="walk-cloud top-[10%] opacity-70"
          style={{ animationDuration: '75s' }}
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
          className="walk-cloud top-[28%] opacity-50"
          style={{ animationDuration: '105s', animationDelay: '-40s' }}
          width="88"
          height="34"
          viewBox="0 0 120 44"
          aria-hidden="true"
        >
          <g fill="#FFFFFF">
            <ellipse cx="36" cy="28" rx="26" ry="14" />
            <ellipse cx="66" cy="22" rx="22" ry="15" />
            <ellipse cx="92" cy="30" rx="22" ry="12" />
          </g>
        </svg>

        {/* 底部草地剪影 */}
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

        {/* 顶部导航 */}
        <header className="relative z-10 flex items-center justify-between px-6 py-5 lg:px-10">
          <motion.div
            initial={{ opacity: 0, x: -24 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5 }}
            className="inline-block"
          >
            <BackToPlanet />
          </motion.div>
          <motion.div
            className="absolute left-1/2 flex -translate-x-1/2 items-center gap-2.5 rounded-full bg-white py-1.5 pl-2 pr-6 shadow-[0_12px_24px_-14px_rgba(46,125,70,0.35)]"
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.15 }}
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#2E7D46] text-white">
              <Dog size={19} aria-hidden="true" />
            </span>
            <h1 className="text-lg font-black tracking-wide">临时遛狗官</h1>
          </motion.div>
          <div className="hidden items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-bold text-[#2E7D46] shadow-[0_12px_24px_-14px_rgba(46,125,70,0.35)] sm:flex">
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#2E7D46] opacity-50" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-[#2E7D46]" />
            </span>
            匹配引擎在线
          </div>
        </header>

        {/* 最近服务横幅：进行中 / 24h 内可回放 */}
        <div className="relative z-10 mx-auto w-full max-w-6xl px-6 pt-1 lg:px-10">
          <AnimatePresence>
            {recentSession && canViewTrack(recentSession) && (
              <motion.div
                initial={{ opacity: 0, y: -14 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -14 }}
                transition={{ type: 'spring', stiffness: 200, damping: 20 }}
                className="walk-card mb-2 flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-white px-4 py-3"
                role="status"
              >
                <p className="flex items-center gap-2 text-sm font-bold text-[#3B2F26]">
                  <RadioTower size={16} className="shrink-0 text-[#2E7D46]" aria-hidden="true" />
                  {recentSession.status === 'active'
                    ? `${recentSession.walkerName} 正在遛狗中，轨迹实时同步`
                    : '上一单服务已结束，轨迹还在 24 小时保留期内'}
                </p>
                <button
                  type="button"
                  onClick={() => navigate('/walk/track')}
                  className="rounded-full bg-[#2E7D46] px-4 py-1.5 text-xs font-black text-white transition-colors hover:bg-[#256639] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2E7D46] focus-visible:ring-offset-2"
                >
                  查看实时轨迹
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* 主体两栏 */}
        <div className="relative z-10 mx-auto grid w-full max-w-6xl grid-cols-1 gap-6 px-6 pb-16 pt-4 lg:grid-cols-[40%_1fr] lg:px-10">
          {/* 左侧：遛狗需求悬赏单 */}
          <section
            className="walk-card relative self-start rounded-[20px] bg-white p-6"
            aria-label="遛狗需求悬赏单"
          >
            <ClipMark selected={false} />

            <h2 className="mb-5 flex items-center gap-2 text-xl font-black">
              <Footprints size={20} className="text-[#2E7D46]" aria-hidden="true" />
              遛狗需求悬赏单
            </h2>

            {/* 遛狗时长 */}
            <div className="mb-5">
              <FieldLabel icon={Timer}>遛狗时长</FieldLabel>
              <div className="flex flex-wrap gap-2.5" role="group" aria-label="遛狗时长单选">
                {DURATIONS.map((d) => (
                  <Pill
                    key={d.id}
                    active={duration === d.id}
                    onClick={() => setDuration(d.id)}
                    icon={OPTION_ICONS[d.id]}
                    ariaLabel={`遛狗时长${d.label}`}
                  >
                    {d.label}
                  </Pill>
                ))}
              </div>
            </div>

            {/* 宠物状态 */}
            <div className="mb-5">
              <FieldLabel icon={Dog}>宠物状态</FieldLabel>
              <div className="flex flex-wrap gap-2.5" role="group" aria-label="宠物状态单选">
                {PET_STATES.map((s) => (
                  <Pill
                    key={s.id}
                    active={petState === s.id}
                    onClick={() => setPetState(s.id)}
                    icon={OPTION_ICONS[s.id]}
                    ariaLabel={`宠物状态${s.label}`}
                  >
                    {s.label}
                  </Pill>
                ))}
              </div>
            </div>

            {/* 特殊要求（多选） */}
            <div className="mb-6">
              <FieldLabel icon={Sparkles}>特殊要求（可多选）</FieldLabel>
              <div className="flex flex-wrap gap-2.5" role="group" aria-label="特殊要求多选">
                {EXTRAS.map((e) => (
                  <Pill
                    key={e.id}
                    active={extras.includes(e.id)}
                    onClick={() => toggleExtra(e.id)}
                    icon={OPTION_ICONS[e.id]}
                    ariaLabel={`特殊要求${e.label}`}
                  >
                    {e.label}
                  </Pill>
                ))}
              </div>
            </div>

            {/* 召唤按钮 */}
            <motion.button
              type="button"
              onClick={handleSummon}
              disabled={phase === 'loading'}
              whileHover={phase === 'loading' ? undefined : { scale: 1.02 }}
              whileTap={phase === 'loading' ? undefined : { scale: 0.97 }}
              aria-label="召唤 AI 智能匹配"
              className={`inline-flex min-h-[52px] w-full items-center justify-center gap-2 rounded-full bg-[#2E7D46] px-6 text-lg font-black text-white shadow-[0_14px_26px_-12px_rgba(46,125,70,0.65)] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2E7D46] focus-visible:ring-offset-2 hover:bg-[#256639] ${
                phase === 'loading' ? 'cursor-wait opacity-75' : ''
              }`}
            >
              <Sparkles size={19} aria-hidden="true" className={phase === 'loading' ? 'animate-pulse' : ''} />
              {phase === 'loading' ? 'AI 匹配中…' : '召唤 AI 智能匹配'}
            </motion.button>
          </section>

          {/* 右侧：AI 匹配大厅 */}
          <section
            className="walk-card relative self-start rounded-[20px] bg-white p-6"
            aria-label="AI 匹配大厅"
          >
            <div className="relative z-10">
              <h2 className="mb-4 flex items-center gap-2 text-xl font-black">
                <PawPrint size={20} className="text-[#2E7D46]" aria-hidden="true" />
                AI 匹配大厅
              </h2>

              {/* 初始状态：盘着的牵引绳在等人 */}
              {phase === 'idle' && (
                <div className="rounded-2xl border-2 border-dashed border-[#B4763B]/25 bg-[#FAF7F0] px-4 py-10 text-center">
                  <div className="flex justify-center">
                    <motion.div
                      animate={{ rotate: [0, -2, 2, 0] }}
                      transition={{ repeat: Infinity, duration: 4, ease: 'easeInOut' }}
                    >
                      <LeashCoil />
                    </motion.div>
                  </div>
                  <p className="mt-3 text-sm font-bold text-[#3B2F26]/55">等待发布需求…</p>
                  <p className="mt-1 text-xs font-medium text-[#3B2F26]/40">
                    填好左侧悬赏单，召唤 AI 帮你找遛狗官
                  </p>
                </div>
              )}

              {/* 加载动画：一串爪印依次落下 */}
              {phase === 'loading' && (
                <div
                  className="rounded-2xl bg-[#F3F8F0] px-4 py-12 text-center"
                  role="status"
                  aria-label="AI 正在匹配遛狗官"
                >
                  <div className="flex items-center justify-center gap-3">
                    {[0, 1, 2].map((i) => (
                      <motion.span
                        key={i}
                        className="inline-block text-[#2E7D46]"
                        animate={{ y: [0, -7, 0], opacity: [0.35, 1, 0.35] }}
                        transition={{ repeat: Infinity, duration: 0.9, delay: i * 0.18, ease: 'easeInOut' }}
                        aria-hidden="true"
                      >
                        <PawPrint size={22} />
                      </motion.span>
                    ))}
                  </div>
                  <p className="mt-3 text-sm font-bold text-[#3B2F26]/60">
                    AI 正在翻遍全城的遛狗官档案…
                  </p>
                </div>
              )}

              {/* 匹配结果 */}
              {phase === 'done' && (
                <div className="flex flex-col gap-4">
                  <p
                    className="flex items-center gap-1.5 rounded-xl bg-[#EAF3E6] px-3 py-2 text-xs font-black text-[#2F5D3A]"
                    role="status"
                  >
                    <Sparkles size={13} className="shrink-0" aria-hidden="true" />
                    {summary}
                  </p>

                  <AnimatePresence>
                    {matched.map((w, i) => (
                      <motion.div
                        key={w.id}
                        initial={{ opacity: 0, x: 56 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ type: 'spring', stiffness: 210, damping: 20, delay: i * 0.16 }}
                        className={`relative rounded-2xl border-2 bg-white p-4 ${
                          selectedId === w.id
                            ? 'walk-card--selected border-[#2E7D46]'
                            : 'walk-card border-[#3B2F26]/10'
                        }`}
                      >
                        {/* 绳系节点：登山扣 */}
                        <ClipMark selected={selectedId === w.id} />

                        <div className="flex items-start gap-3">
                          <span className="relative shrink-0">
                            <span
                              className={`flex h-12 w-12 items-center justify-center rounded-full text-2xl ${
                                i === 0 ? 'bg-[#F6E7C8]' : i === 1 ? 'bg-[#E4EFE0]' : 'bg-[#F0E4D3]'
                              }`}
                              aria-hidden="true"
                            >
                              {w.emoji}
                            </span>
                            {/* AI 首推：项圈上挂黄铜狗牌 */}
                            {i === 0 && <DogTag />}
                          </span>
                          <div className="min-w-0 flex-1">
                            <h3 className="text-[15px] font-black">{w.name}</h3>
                            <p className="mt-0.5 text-xs font-medium text-[#3B2F26]/50">{w.desc}</p>
                            <div className="mt-1.5 flex flex-wrap gap-1">
                              {w.tags.map((t) => (
                                <span
                                  key={t}
                                  className="rounded-full bg-[#EEF5EA] px-2 py-0.5 text-[10px] font-bold text-[#2F5D3A]"
                                >
                                  {t}
                                </span>
                              ))}
                            </div>
                          </div>
                          <div className="shrink-0 text-right">
                            <div className="text-[11px] font-bold text-[#3B2F26]/50">AI 匹配度</div>
                            <MatchNumber value={w.match} />
                          </div>
                        </div>

                        {/* 匹配度：皮革绳段上滑到端的爪印 */}
                        <div className="mt-3 h-[7px] rounded-full bg-[#EADFCB]">
                          <motion.div
                            className="relative h-full rounded-full bg-[#2E7D46]"
                            initial={{ width: 0 }}
                            animate={{ width: `${w.match}%` }}
                            transition={{ type: 'spring', stiffness: 60, damping: 15, delay: 0.3 + i * 0.16 }}
                          >
                            <PawPrint
                              size={14}
                              className="absolute -right-1.5 top-1/2 -translate-y-1/2 text-white"
                              aria-hidden="true"
                            />
                          </motion.div>
                        </div>

                        {/* 选定承接人 */}
                        <button
                          type="button"
                          onClick={() => handleSelect(w.id)}
                          aria-pressed={selectedId === w.id}
                          aria-label={`选择${w.name}作为本次服务承接人`}
                          className={`mt-3 inline-flex min-h-[44px] w-full items-center justify-center rounded-full px-4 py-2 text-sm font-black transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2E7D46] focus-visible:ring-offset-2 ${
                            selectedId === w.id
                              ? 'bg-[#2E7D46] text-white'
                              : 'bg-[#F3F8F0] text-[#2E7D46] hover:bg-[#E4EFE0]'
                          }`}
                        >
                          {selectedId === w.id ? '✓ 已上绳，由 TA 承接' : '选择 TA 接单'}
                        </button>

                        {/* AI 路线规划：只挂在首推卡片下方 */}
                        {i === 0 && <RoutePreview stopIds={routeStopIds} tip={routeTip} />}
                      </motion.div>
                    ))}
                  </AnimatePresence>

                  {/* 服务信息登记：选定遛狗官后出现（绳子另一端扣在登记表上） */}
                  <AnimatePresence>
                    {selectedWalker && (
                      <motion.section
                        key="service-form"
                        initial={{ opacity: 0, y: 24, scale: 0.97 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 24 }}
                        transition={{ type: 'spring', stiffness: 220, damping: 20 }}
                        className="rounded-2xl bg-[#FBF7EF] p-5 shadow-[0_14px_28px_-18px_rgba(180,118,59,0.45)]"
                        aria-label="服务信息登记"
                      >
                        {/* 绳端卡扣 */}
                        <svg
                          className="mx-auto -mt-1 mb-1"
                          width="60"
                          height="24"
                          viewBox="0 0 60 24"
                          aria-hidden="true"
                        >
                          <path
                            d="M30 0 C 30 7, 30 8, 30 11"
                            stroke="#B4763B"
                            strokeWidth="2.5"
                            fill="none"
                            strokeLinecap="round"
                          />
                          <rect
                            x="22"
                            y="11"
                            width="16"
                            height="10"
                            rx="5"
                            fill="none"
                            stroke="#B4763B"
                            strokeWidth="2.5"
                          />
                        </svg>

                        <div className="mb-4 flex items-center justify-between gap-2">
                          <h3 className="text-base font-black">服务信息登记</h3>
                          <span
                            className={`rounded-full px-2.5 py-1 text-[10px] font-black ${
                              draft.saved
                                ? 'bg-[#DCF0DC] text-[#2E7D46]'
                                : 'bg-[#F6E7C8] text-[#8A6116]'
                            }`}
                            role="status"
                          >
                            {draft.saved ? '✓ 信息已保存' : '待保存'}
                          </span>
                        </div>

                        <p className="mb-4 rounded-xl bg-white px-3 py-2 text-xs font-bold text-[#3B2F26]/60">
                          承接人：{selectedWalker.emoji} {selectedWalker.name}
                          <span className="ml-1 text-[#3B2F26]/35">（可在上方卡片中更换）</span>
                        </p>

                        {/* 自动填充提示：选中瞬间出现 */}
                        <motion.p
                          initial={{ opacity: 0, y: -6 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ type: 'spring', stiffness: 260, damping: 20 }}
                          className="mb-4 rounded-xl bg-[#EAF3E6] px-3 py-2 text-xs font-black text-[#2F5D3A]"
                          role="status"
                          aria-live="polite"
                        >
                          已根据 {selectedWalker.emoji} {selectedWalker.name}
                          的资料自动填充联系方式与预计到达时间，可按需修改
                        </motion.p>

                        {/* 联系方式：非空 + 11 位手机号格式校验 */}
                        <label
                          htmlFor="walk-contact"
                          className="flex items-center gap-1.5 text-sm font-black text-[#3B2F26]/70"
                        >
                          <Phone size={14} className="text-[#B4763B]" aria-hidden="true" />
                          联系方式
                        </label>
                        <input
                          id="walk-contact"
                          type="tel"
                          inputMode="tel"
                          placeholder="13812345678"
                          value={draft.contact}
                          onChange={(e) => updateDraft('contact', e.target.value)}
                          onKeyDown={handleKeyDown}
                          autoFocus
                          aria-invalid={errors.contact !== null}
                          className={`num-display mt-1.5 w-full rounded-2xl border-2 bg-white px-4 py-2.5 text-sm font-bold transition-colors placeholder:font-medium placeholder:text-[#3B2F26]/30 focus:outline-none ${
                            errors.contact
                              ? 'border-[#C2703D] bg-[#FBF1E9] focus:border-[#C2703D]'
                              : contactValid
                                ? 'border-[#2E7D46] focus:border-[#256639]'
                                : 'border-[#3B2F26]/15 focus:border-[#2E7D46]'
                          }`}
                        />
                        {errors.contact && (
                          <p
                            role="alert"
                            className="mt-1.5 rounded-xl bg-[#FBF1E9] px-3 py-1.5 text-xs font-black text-[#A34E1F]"
                          >
                            {errors.contact}
                          </p>
                        )}

                        {/* 可到达时间：非空 + 格式 + 不早于当前时间 */}
                        <label
                          htmlFor="walk-arrival"
                          className="mt-4 flex items-center gap-1.5 text-sm font-black text-[#3B2F26]/70"
                        >
                          <CalendarClock size={14} className="text-[#B4763B]" aria-hidden="true" />
                          可到达时间
                        </label>
                        <input
                          id="walk-arrival"
                          type="datetime-local"
                          value={draft.arrivalTime}
                          onChange={(e) => updateDraft('arrivalTime', e.target.value)}
                          onKeyDown={handleKeyDown}
                          aria-invalid={errors.arrivalTime !== null}
                          className={`num-display mt-1.5 w-full rounded-2xl border-2 bg-white px-4 py-2.5 text-sm font-bold transition-colors focus:outline-none ${
                            errors.arrivalTime
                              ? 'border-[#C2703D] bg-[#FBF1E9] focus:border-[#C2703D]'
                              : arrivalValid
                                ? 'border-[#2E7D46] focus:border-[#256639]'
                                : 'border-[#3B2F26]/15 focus:border-[#2E7D46]'
                          }`}
                        />
                        {errors.arrivalTime && (
                          <p
                            role="alert"
                            className="mt-1.5 rounded-xl bg-[#FBF1E9] px-3 py-1.5 text-xs font-black text-[#A34E1F]"
                          >
                            {errors.arrivalTime}
                          </p>
                        )}

                        <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:items-center">
                          <motion.button
                            type="button"
                            onClick={handleSave}
                            whileTap={{ scale: 0.94 }}
                            className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-full border-2 border-[#3B2F26]/20 bg-white px-5 py-2.5 text-sm font-black text-[#3B2F26]/80 transition-colors hover:border-[#3B2F26]/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2E7D46]"
                          >
                            <Save size={15} aria-hidden="true" />
                            保存信息
                          </motion.button>
                          <motion.button
                            type="button"
                            onClick={handleStartService}
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.97 }}
                            className="inline-flex min-h-[48px] flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-full bg-[#2E7D46] px-5 text-base font-black text-white shadow-[0_14px_26px_-12px_rgba(46,125,70,0.65)] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2E7D46] focus-visible:ring-offset-2 hover:bg-[#256639]"
                          >
                            <Footprints size={17} aria-hidden="true" />
                            确认选定，开始遛狗服务
                          </motion.button>
                        </div>
                        <p className="mt-2 text-center text-[11px] font-medium text-[#3B2F26]/45">
                          在输入框中按{' '}
                          <kbd className="rounded bg-[#3B2F26]/8 px-1.5 py-0.5 text-[10px] font-semibold text-[#3B2F26]/60">
                            Enter
                          </kbd>{' '}
                          可直接开始服务
                        </p>
                      </motion.section>
                    )}
                  </AnimatePresence>
                </div>
              )}
            </div>
          </section>
        </div>
      </main>
    </MotionConfig>
  )
}

export default Walk
