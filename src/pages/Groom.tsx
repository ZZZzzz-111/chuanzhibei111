import { useEffect, useMemo, useRef, useState } from 'react'
import BackToPlanet from '../components/BackToPlanet'
import { motion, AnimatePresence, MotionConfig } from 'framer-motion'
import {
  Bath,
  CalendarClock,
  ClipboardCheck,
  Phone,
  Scissors,
  Send,
  Sparkles,
  Star,
  Tag,
  UserRound,
} from 'lucide-react'
import { useToast } from '../components/Toast'
import { aiUnavailableReason, streamChat, type ChatMessage } from '../lib/glm'
import {
  BODY_SIZES,
  GROOMERS,
  GROOM_SYSTEM_PROMPT,
  SERVICES,
  STYLES,
  calcTotal,
  parseAiAdvice,
  submitBooking,
  type BookingInput,
  type FieldErrors,
} from '../services/groomApi'
import '../styles/walk.css'
import '../styles/groom.css'

/* ============ 调色板（上午 · 泡泡美容院） ============
 * 泡泡纸 #F0F7FB · 湖蓝 #0B77BE · 深青墨 #1C3340 · 泡泡雾 #DCEEF9 · 泡泡金 #E8B93E
 */

type Phase = 'idle' | 'processing' | 'done'
type MirrorStage = 0 | 1 | 2 | 3 // 毛糙 / 泡沫浴 / 吹干 / 完成
type AiPhase = 'idle' | 'thinking' | 'streaming' | 'done' | 'error'

const STAGE_CAPTIONS: Record<MirrorStage, string> = {
  0: '美容师正在打量毛发…',
  1: '泡泡浴进行中，搓搓小泥猴',
  2: '呼呼吹干，毛发要蓬松起来啦',
  3: '造型完成，闪亮登场！',
}

/** 体型 → 镜中的宠物 emoji */
function petEmoji(sizeId: string): string {
  if (sizeId === 'cat') return '🐱'
  if (sizeId === 'small') return '🐶'
  return '🐕'
}

/* ============ 变身镜 ============ */

function MagicMirror({ phase, stage, sizeId }: { phase: Phase; stage: MirrorStage; sizeId: string }) {
  return (
    <div
      className="relative mx-auto aspect-square w-full max-w-[300px] rounded-full border-[10px] border-white bg-gradient-to-b from-[#DCEEF9] to-[#B9DDF2] shadow-[0_22px_40px_-22px_rgba(11,119,190,0.55),inset_0_8px_20px_rgba(255,255,255,0.9)]"
      role="img"
      aria-label={`变身镜：${STAGE_CAPTIONS[stage]}`}
    >
      {/* 镜面高光 */}
      <span
        className="pointer-events-none absolute inset-2 rounded-full"
        style={{
          background: 'radial-gradient(circle at 28% 18%, rgba(255,255,255,0.75) 0%, rgba(255,255,255,0.12) 32%, transparent 58%)',
        }}
        aria-hidden="true"
      />
      {/* 泡沫浴阶段：镜底泡沫层 + 上升泡泡 */}
      {stage === 1 && (
        <>
          <span
            className="absolute bottom-0 left-0 h-1/3 w-full rounded-b-full bg-gradient-to-t from-white/90 to-white/10"
            aria-hidden="true"
          />
          <span className="groom-bubble left-[22%] bottom-[26%] h-9 w-9" aria-hidden="true" />
          <span className="groom-bubble left-[44%] bottom-[18%] h-12 w-12" aria-hidden="true" />
          <span className="groom-bubble left-[64%] bottom-[32%] h-7 w-7" aria-hidden="true" />
        </>
      )}
      {/* 吹干阶段：风线 */}
      {stage === 2 && (
        <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" aria-hidden="true">
          <g fill="none" stroke="#0B77BE" strokeWidth="2.4" opacity="0.7">
            <path className="groom-wind" d="M 12 38 Q 40 30 78 40" />
            <path className="groom-wind" d="M 10 52 Q 42 44 82 53" />
            <path className="groom-wind" d="M 14 66 Q 40 58 76 67" />
          </g>
        </svg>
      )}
      {/* 完成阶段：金色闪光环 + 蝴蝶结 */}
      {stage === 3 && (
        <>
          <span
            className="pointer-events-none absolute inset-3 rounded-full"
            style={{ boxShadow: 'inset 0 0 0 3px rgba(232,185,62,0.75)' }}
            aria-hidden="true"
          />
          <span className="groom-sparkle absolute left-[20%] top-[22%] text-2xl" aria-hidden="true">✨</span>
          <span className="groom-sparkle absolute right-[18%] top-[28%] text-xl" aria-hidden="true">✨</span>
          <span className="groom-sparkle absolute right-[26%] bottom-[24%] text-lg" aria-hidden="true">✨</span>
        </>
      )}

      {/* 镜中宠物 */}
      <div className="absolute inset-0 flex items-center justify-center">
        {phase === 'idle' ? (
          <p className="px-10 text-center text-sm font-bold text-[#0B77BE]/60">
            选好服务和造型，提交预约后就能看到变身过程
          </p>
        ) : (
          <motion.span
            key={stage}
            initial={{ scale: 0.85, opacity: 0.5 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 260, damping: 16 }}
            className={
              stage === 0
                ? 'text-6xl grayscale-[0.35]' // 毛糙：灰扑扑
                : stage === 3
                  ? 'text-7xl'
                  : 'text-6xl'
            }
            aria-hidden="true"
          >
            {petEmoji(sizeId)}
          </motion.span>
        )}
      </div>
      {/* 蝴蝶结在完成时挂在宠物头顶 */}
      {phase !== 'idle' && stage === 3 && (
        <motion.span
          initial={{ scale: 0, rotate: -30 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 14, delay: 0.2 }}
          className="absolute left-1/2 top-[22%] -translate-x-1/2 text-3xl"
          aria-hidden="true"
        >
          🎀
        </motion.span>
      )}
    </div>
  )
}

/* ============ 页面 ============ */

function Groom() {
  const toast = useToast()
  const aiUnavailable = aiUnavailableReason()

  // —— 选择区 ——
  const [serviceIds, setServiceIds] = useState<string[]>([])
  const [sizeId, setSizeId] = useState<string>('small')
  const [styleId, setStyleId] = useState<string | null>(null)
  const [groomerId, setGroomerId] = useState<number | null>(null)

  // —— 预约表单 ——
  const [form, setForm] = useState<BookingInput>({ petName: '', phone: '', bookTime: '', note: '' })
  const [errors, setErrors] = useState<FieldErrors>({ petName: null, phone: null, bookTime: null, note: null })

  // —— 提交流程 ——
  const [phase, setPhase] = useState<Phase>('idle')
  const [stage, setStage] = useState<MirrorStage>(0)
  const [result, setResult] = useState<{ bookingNo: string; total: number } | null>(null)
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([])

  // —— AI 造型顾问 ——
  const [aiInput, setAiInput] = useState('')
  const [aiPhase, setAiPhase] = useState<AiPhase>('idle')
  const [aiText, setAiText] = useState('')
  const [aiAdvice, setAiAdvice] = useState<{ styleId: string | null; serviceIds: string[] } | null>(null)
  const aiAbort = useRef<AbortController | null>(null)

  const total = useMemo(() => calcTotal(serviceIds, sizeId), [serviceIds, sizeId])
  const petNameValid = !errors.petName && form.petName.trim().length >= 2
  const phoneValid = !errors.phone && /^1[3-9]\d{9}$/.test(form.phone.trim())
  const bookTimeValid = !errors.bookTime && form.bookTime.trim().length > 0

  useEffect(() => () => {
    timersRef.current.forEach(clearTimeout)
    aiAbort.current?.abort()
  }, [])

  const toggleService = (id: string) => {
    setServiceIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  const updateForm = (field: keyof BookingInput, value: string) => {
    setForm((f) => ({ ...f, [field]: value }))
    setErrors((e) => ({ ...e, [field]: null }))
  }

  /** AI 造型顾问：流式提问 */
  const askAdvisor = () => {
    const q = aiInput.trim()
    if (!q || aiPhase === 'thinking' || aiPhase === 'streaming') return
    if (aiUnavailable) {
      toast.error(aiUnavailable)
      return
    }
    setAiPhase('thinking')
    setAiText('')
    setAiAdvice(null)
    aiAbort.current?.abort()
    const ctrl = new AbortController()
    aiAbort.current = ctrl
    const history: ChatMessage[] = [{ role: 'user', content: q }]
    const kick = setTimeout(() => setAiPhase((p) => (p === 'thinking' ? 'streaming' : p)), 1200)
    streamChat(
      history,
      {
        onDelta: (d) => {
          setAiPhase('streaming')
          setAiText((s) => s + d)
        },
      },
      ctrl.signal,
      GROOM_SYSTEM_PROMPT,
    )
      .then((full) => {
        clearTimeout(kick)
        setAiPhase('done')
        setAiAdvice(parseAiAdvice(full))
      })
      .catch((err: unknown) => {
        clearTimeout(kick)
        if (ctrl.signal.aborted) return
        setAiPhase('error')
        toast.error(err instanceof Error ? err.message : 'AI 顾问开小差了，请重试')
      })
  }

  /** 一键应用 AI 建议 */
  const applyAdvice = () => {
    if (!aiAdvice) return
    if (aiAdvice.styleId) setStyleId(aiAdvice.styleId)
    if (aiAdvice.serviceIds.length > 0) setServiceIds(aiAdvice.serviceIds)
    toast.success('已应用 AI 造型顾问的建议')
  }

  /** 提交预约：校验 → 变身镜四阶段播放 → 完成态 */
  const handleSubmit = () => {
    if (phase === 'processing') return
    if (serviceIds.length === 0) {
      toast.error('请至少选择一项服务')
      return
    }
    if (!styleId) {
      toast.error('请为毛孩子选一个造型')
      return
    }
    const res = submitBooking(form, serviceIds, sizeId, styleId, groomerId)
    if (!res.ok) {
      setErrors(res.errors)
      toast.error('请完善预约信息')
      return
    }
    setResult({ bookingNo: res.bookingNo ?? '', total: res.total })
    setPhase('processing')
    setStage(0)
    // 四阶段定时编排：毛糙 1.2s → 泡沫浴 1.5s → 吹干 1.5s → 完成
    const seq: [MirrorStage, number][] = [
      [1, 1200],
      [2, 2700],
      [3, 4200],
    ]
    timersRef.current = seq.map(([s, delay]) => setTimeout(() => setStage(s), delay))
    const finish = setTimeout(() => setPhase('done'), 5200)
    timersRef.current.push(finish)
    toast.success('预约成功，变身开始！')
  }

  /** 继续预约：重置全部状态 */
  const handleReset = () => {
    setPhase('idle')
    setStage(0)
    setResult(null)
    setServiceIds([])
    setStyleId(null)
    setGroomerId(null)
    setForm({ petName: '', phone: '', bookTime: '', note: '' })
    setErrors({ petName: null, phone: null, bookTime: null, note: null })
  }

  const groomer = GROOMERS.find((g) => g.id === groomerId) ?? null
  const fmtBookTime = form.bookTime.replace('T', ' ')

  return (
    <MotionConfig reducedMotion="user">
      <main className="relative min-h-screen overflow-hidden bg-[#F0F7FB] text-[#1C3340]">
        {/* 美容院氛围：漂浮的小泡泡装饰 */}
        <span className="groom-bubble left-[8%] top-[18%] h-10 w-10 opacity-60" aria-hidden="true" />
        <span className="groom-bubble right-[10%] top-[12%] h-7 w-7 opacity-50" aria-hidden="true" />
        <span className="groom-bubble left-[46%] bottom-[8%] h-8 w-8 opacity-40" aria-hidden="true" />

        <header className="relative z-10 flex items-center justify-between px-6 py-5 lg:px-10">
          <motion.div initial={{ opacity: 0, x: -24 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.5 }} className="inline-block">
            <BackToPlanet />
          </motion.div>
          <motion.div
            className="absolute left-1/2 flex -translate-x-1/2 items-center gap-2.5 rounded-full bg-white py-1.5 pl-2 pr-6 shadow-[0_12px_24px_-14px_rgba(11,119,190,0.45)]"
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.15 }}
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#0B77BE] text-white">
              <Bath size={19} aria-hidden="true" />
            </span>
            <h1 className="text-lg font-black tracking-wide">宠物美容院</h1>
          </motion.div>
          <div className="hidden items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-bold text-[#0B77BE] shadow-[0_12px_24px_-14px_rgba(11,119,190,0.45)] sm:flex">
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full rounded-full bg-[#0B77BE] opacity-50 motion-safe:animate-ping" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-[#0B77BE]" />
            </span>
            美容师在线
          </div>
        </header>

        <div className="relative z-10 mx-auto grid w-full max-w-6xl grid-cols-1 gap-6 px-6 pb-16 lg:grid-cols-[1fr_400px] lg:px-10">
          {/* 左栏：需求与预约 */}
          <section className="walk-card rounded-[20px] bg-white p-6" aria-label="美容需求与预约">
            <h2 className="mb-5 flex items-center gap-2 text-xl font-black">
              <Scissors size={20} className="text-[#0B77BE]" aria-hidden="true" />
              美容预约单
            </h2>

            {/* 服务菜单（多选，带价格） */}
            <h3 className="mb-2 flex items-center gap-1.5 text-[13px] font-bold text-[#1C3340]/55">
              <Tag size={14} className="text-[#0B77BE]" aria-hidden="true" /> 服务项目（可多选）
            </h3>
            <div className="mb-5 flex flex-wrap gap-2.5" role="group" aria-label="服务项目多选">
              {SERVICES.map((s) => {
                const active = serviceIds.includes(s.id)
                return (
                  <motion.button
                    key={s.id}
                    type="button"
                    onClick={() => toggleService(s.id)}
                    whileTap={{ scale: 0.94 }}
                    aria-pressed={active}
                    className={`inline-flex min-h-[44px] items-center gap-1.5 rounded-full border px-4 py-2 text-sm font-bold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0B77BE] ${
                      active
                        ? 'border-[#0B77BE] bg-[#0B77BE] text-white shadow-[0_8px_16px_-8px_rgba(11,119,190,0.65)]'
                        : 'border-[#1C3340]/15 bg-white text-[#1C3340]/70 hover:border-[#0B77BE]/40 hover:text-[#0B77BE]'
                    }`}
                  >
                    {s.name}
                    <span className="num-display text-xs">¥{s.price}</span>
                  </motion.button>
                )
              })}
            </div>

            {/* 宠物体型（计价系数） */}
            <h3 className="mb-2 flex items-center gap-1.5 text-[13px] font-bold text-[#1C3340]/55">
              <UserRound size={14} className="text-[#0B77BE]" aria-hidden="true" /> 宠物体型（影响价格）
            </h3>
            <div className="mb-5 flex flex-wrap gap-2.5" role="group" aria-label="宠物体型单选">
              {BODY_SIZES.map((b) => {
                const active = sizeId === b.id
                return (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => setSizeId(b.id)}
                    aria-pressed={active}
                    className={`inline-flex min-h-[44px] items-center gap-1.5 rounded-full border px-4 py-2 text-sm font-bold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0B77BE] ${
                      active
                        ? 'border-[#0B77BE] bg-[#DCEEF9] text-[#0B77BE]'
                        : 'border-[#1C3340]/15 bg-white text-[#1C3340]/70 hover:border-[#0B77BE]/40'
                    }`}
                  >
                    {b.label}
                    <span className="num-display text-xs opacity-70">×{b.mult}</span>
                  </button>
                )
              })}
            </div>

            {/* 期望造型（单选卡片） */}
            <h3 className="mb-2 flex items-center gap-1.5 text-[13px] font-bold text-[#1C3340]/55">
              <Sparkles size={14} className="text-[#0B77BE]" aria-hidden="true" /> 期望造型
            </h3>
            <div className="mb-5 grid grid-cols-2 gap-2.5 sm:grid-cols-4" role="group" aria-label="期望造型单选">
              {STYLES.map((st) => {
                const active = styleId === st.id
                return (
                  <button
                    key={st.id}
                    type="button"
                    onClick={() => setStyleId(st.id)}
                    aria-pressed={active}
                    className={`flex min-h-[76px] flex-col items-center justify-center gap-1 rounded-2xl border-2 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0B77BE] ${
                      active
                        ? 'border-[#0B77BE] bg-[#DCEEF9]'
                        : 'border-[#1C3340]/10 bg-white hover:border-[#0B77BE]/40'
                    }`}
                  >
                    <span className="text-3xl" aria-hidden="true">
                      {st.emoji}
                    </span>
                    <span className="text-xs font-black">{st.label}</span>
                  </button>
                )
              })}
            </div>

            {/* 美容师（单选） */}
            <h3 className="mb-2 flex items-center gap-1.5 text-[13px] font-bold text-[#1C3340]/55">
              <Scissors size={14} className="text-[#0B77BE]" aria-hidden="true" /> 指定美容师
            </h3>
            <div className="mb-6 flex flex-wrap gap-2.5" role="group" aria-label="美容师单选">
              {GROOMERS.map((g) => {
                const active = groomerId === g.id
                return (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => setGroomerId(g.id)}
                    aria-pressed={active}
                    className={`flex min-h-[56px] items-center gap-2 rounded-2xl border-2 px-3 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0B77BE] ${
                      active ? 'border-[#0B77BE] bg-[#DCEEF9]' : 'border-[#1C3340]/10 bg-white hover:border-[#0B77BE]/40'
                    }`}
                  >
                    <span className="text-xl" aria-hidden="true">
                      {g.emoji}
                    </span>
                    <span className="flex flex-col items-start leading-tight">
                      <span className="text-xs font-black">{g.name}</span>
                      <span className="flex items-center gap-0.5 text-[10px] font-bold text-[#1C3340]/55">
                        <Star size={9} className="text-[#E8B93E]" fill="currentColor" aria-hidden="true" />
                        <span className="num-display">{g.rating}</span>
                        {g.specialty}
                      </span>
                    </span>
                  </button>
                )
              })}
            </div>

            {/* 预约表单 */}
            <div className="rounded-2xl bg-[#F5FAFD] p-5">
              {/* 宠物昵称 */}
              <label htmlFor="groom-pet" className="flex items-center gap-1.5 text-sm font-black text-[#1C3340]/70">
                <UserRound size={14} className="text-[#0B77BE]" aria-hidden="true" />
                宠物昵称
              </label>
              <input
                id="groom-pet"
                type="text"
                value={form.petName}
                onChange={(e) => updateForm('petName', e.target.value)}
                placeholder="如：团子"
                aria-invalid={errors.petName !== null}
                className={`mt-1.5 w-full rounded-2xl border-2 px-4 py-2.5 text-sm font-bold transition-colors placeholder:font-medium placeholder:text-[#1C3340]/30 focus:outline-none ${
                  errors.petName ? 'border-[#C2703D] bg-[#FBF1E9]' : petNameValid ? 'border-[#2E7D46]' : 'border-[#1C3340]/15 focus:border-[#0B77BE]'
                }`}
              />
              {errors.petName && (
                <p role="alert" className="mt-1.5 rounded-xl bg-[#FBF1E9] px-3 py-1.5 text-xs font-black text-[#A34E1F]">
                  {errors.petName}
                </p>
              )}

              {/* 联系电话 */}
              <label htmlFor="groom-phone" className="mt-4 flex items-center gap-1.5 text-sm font-black text-[#1C3340]/70">
                <Phone size={14} className="text-[#0B77BE]" aria-hidden="true" />
                联系电话
              </label>
              <input
                id="groom-phone"
                type="tel"
                inputMode="tel"
                value={form.phone}
                onChange={(e) => updateForm('phone', e.target.value)}
                placeholder="13812345678"
                aria-invalid={errors.phone !== null}
                className={`num-display mt-1.5 w-full rounded-2xl border-2 px-4 py-2.5 text-sm font-bold transition-colors placeholder:font-medium placeholder:text-[#1C3340]/30 focus:outline-none ${
                  errors.phone ? 'border-[#C2703D] bg-[#FBF1E9]' : phoneValid ? 'border-[#2E7D46]' : 'border-[#1C3340]/15 focus:border-[#0B77BE]'
                }`}
              />
              {errors.phone && (
                <p role="alert" className="mt-1.5 rounded-xl bg-[#FBF1E9] px-3 py-1.5 text-xs font-black text-[#A34E1F]">
                  {errors.phone}
                </p>
              )}

              {/* 到店时间 */}
              <label htmlFor="groom-time" className="mt-4 flex items-center gap-1.5 text-sm font-black text-[#1C3340]/70">
                <CalendarClock size={14} className="text-[#0B77BE]" aria-hidden="true" />
                到店时间
              </label>
              <input
                id="groom-time"
                type="datetime-local"
                value={form.bookTime}
                onChange={(e) => updateForm('bookTime', e.target.value)}
                aria-invalid={errors.bookTime !== null}
                className={`num-display mt-1.5 w-full rounded-2xl border-2 px-4 py-2.5 text-sm font-bold transition-colors focus:outline-none ${
                  errors.bookTime ? 'border-[#C2703D] bg-[#FBF1E9]' : bookTimeValid ? 'border-[#2E7D46]' : 'border-[#1C3340]/15 focus:border-[#0B77BE]'
                }`}
              />
              {errors.bookTime && (
                <p role="alert" className="mt-1.5 rounded-xl bg-[#FBF1E9] px-3 py-1.5 text-xs font-black text-[#A34E1F]">
                  {errors.bookTime}
                </p>
              )}

              {/* 备注 */}
              <label htmlFor="groom-note" className="mt-4 flex items-center gap-1.5 text-sm font-black text-[#1C3340]/70">
                备注<span className="ml-1 text-xs font-medium text-[#1C3340]/40">（选填）</span>
              </label>
              <textarea
                id="groom-note"
                value={form.note}
                onChange={(e) => updateForm('note', e.target.value)}
                rows={2}
                maxLength={50}
                placeholder="如：性格胆小，请轻一点"
                aria-invalid={errors.note !== null}
                className={`mt-1.5 w-full resize-none rounded-2xl border-2 px-4 py-2.5 text-sm font-bold transition-colors placeholder:font-medium placeholder:text-[#1C3340]/30 focus:outline-none ${
                  errors.note ? 'border-[#C2703D] bg-[#FBF1E9]' : 'border-[#1C3340]/15 focus:border-[#0B77BE]'
                }`}
              />
              {errors.note && (
                <p role="alert" className="mt-1.5 rounded-xl bg-[#FBF1E9] px-3 py-1.5 text-xs font-black text-[#A34E1F]">
                  {errors.note}
                </p>
              )}
            </div>

            {/* 实时合计 + 提交 */}
            <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
              <p className="flex items-baseline gap-2 text-sm font-black text-[#1C3340]/70">
                合计
                <span className="num-display text-2xl font-bold text-[#0B77BE]">¥{total}</span>
                <span className="text-xs font-bold text-[#1C3340]/40">
                  （{serviceIds.length} 项服务{sizeId ? ` · ${BODY_SIZES.find((b) => b.id === sizeId)?.label}系数` : ''}）
                </span>
              </p>
              <motion.button
                type="button"
                onClick={phase === 'done' ? handleReset : handleSubmit}
                disabled={phase === 'processing'}
                whileTap={phase === 'processing' ? undefined : { scale: 0.96 }}
                className="inline-flex min-h-[48px] items-center gap-2 rounded-full bg-[#0B77BE] px-7 text-base font-black text-white shadow-[0_16px_28px_-14px_rgba(11,119,190,0.7)] transition-colors hover:bg-[#0A6AA5] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0B77BE] focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-60"
              >
                <ClipboardCheck size={17} aria-hidden="true" />
                {phase === 'processing' ? '变身中…' : phase === 'done' ? '再约一次' : '提交预约'}
              </motion.button>
            </div>
          </section>

          {/* 右栏：AI 造型顾问 + 变身镜 */}
          <div className="flex flex-col gap-6">
            <section className="walk-card rounded-[20px] bg-white p-5" aria-label="AI 造型顾问">
              <h2 className="mb-3 flex items-center gap-2 text-base font-black">
                <Sparkles size={17} className="text-[#0B77BE]" aria-hidden="true" /> AI 造型顾问
              </h2>
              {aiUnavailable && (
                <p className="mb-3 rounded-xl bg-[#FBF7EF] px-3 py-2 text-xs font-bold text-[#8A6116]">
                  {aiUnavailable}
                </p>
              )}
              <div className="flex gap-2">
                <input
                  type="text"
                  value={aiInput}
                  onChange={(e) => setAiInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                      e.preventDefault()
                      askAdvisor()
                    }
                  }}
                  placeholder="描述宠物：如 棕色泰迪、毛有点打结"
                  aria-label="向 AI 造型顾问描述宠物"
                  className="min-h-[44px] w-full min-w-0 flex-1 rounded-full border-2 border-[#1C3340]/15 bg-white px-4 text-sm font-bold placeholder:font-medium placeholder:text-[#1C3340]/35 focus:border-[#0B77BE] focus:outline-none"
                />
                <button
                  type="button"
                  onClick={askAdvisor}
                  disabled={!aiInput.trim() || aiPhase === 'thinking' || aiPhase === 'streaming'}
                  aria-label="向 AI 造型顾问提问"
                  className="inline-flex min-h-[44px] shrink-0 items-center gap-1 rounded-full bg-[#0B77BE] px-4 text-sm font-black text-white transition-colors hover:bg-[#0A6AA5] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0B77BE] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Send size={14} aria-hidden="true" />
                </button>
              </div>

              {/* 回答区 */}
              {aiPhase === 'thinking' && (
                <div className="mt-3 flex items-center gap-2 py-1" role="status" aria-label="AI 造型顾问思考中">
                  {[0, 1, 2].map((i) => (
                    <motion.span
                      key={i}
                      className="h-2 w-2 rounded-full bg-[#0B77BE]"
                      animate={{ y: [0, -6, 0], opacity: [0.35, 1, 0.35] }}
                      transition={{ repeat: Infinity, duration: 0.9, delay: i * 0.18, ease: 'easeInOut' }}
                      aria-hidden="true"
                    />
                  ))}
                </div>
              )}
              {(aiPhase === 'streaming' || aiPhase === 'done' || aiPhase === 'error') && (
                <div className="mt-3 rounded-2xl bg-[#F5FAFD] p-3.5">
                  {aiPhase === 'error' ? (
                    <p className="text-xs font-bold text-[#A34E1F]">顾问回答失败，请检查网络后重试。</p>
                  ) : (
                    <p className="whitespace-pre-wrap text-xs font-medium leading-6 text-[#1C3340]/80">
                      {aiText}
                      {aiPhase === 'streaming' && (
                        <span className="ml-0.5 inline-block h-3.5 w-1.5 motion-safe:animate-pulse rounded-sm bg-[#0B77BE] align-middle" aria-hidden="true" />
                      )}
                    </p>
                  )}
                  {aiPhase === 'done' && (aiAdvice?.styleId || (aiAdvice?.serviceIds.length ?? 0) > 0) && (
                    <motion.button
                      type="button"
                      onClick={applyAdvice}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="mt-3 inline-flex min-h-[36px] items-center gap-1.5 rounded-full bg-[#0B77BE] px-4 text-xs font-black text-white transition-colors hover:bg-[#0A6AA5] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0B77BE]"
                    >
                      <Sparkles size={13} aria-hidden="true" />
                      一键应用推荐
                    </motion.button>
                  )}
                </div>
              )}
            </section>

            {/* 变身镜 */}
            <section className="walk-card rounded-[20px] bg-white p-5" aria-label="变身镜">
              <h2 className="mb-3 flex items-center gap-2 text-base font-black">
                <Bath size={17} className="text-[#0B77BE]" aria-hidden="true" /> 变身镜
              </h2>
              <MagicMirror phase={phase} stage={stage} sizeId={sizeId} />
              {/* 阶段字幕 */}
              {phase !== 'idle' && (
                <p
                  className="num-display mt-4 text-center text-xs font-black text-[#0B77BE]"
                  role="status"
                  aria-live="polite"
                >
                  {STAGE_CAPTIONS[stage]}
                </p>
              )}

              {/* 完成卡 */}
              <AnimatePresence>
                {phase === 'done' && result && (
                  <motion.div
                    initial={{ opacity: 0, y: 14 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ type: 'spring', stiffness: 240, damping: 18 }}
                    className="mt-4 rounded-2xl bg-[#F5FAFD] p-4"
                    role="status"
                  >
                    <p className="flex items-center gap-1.5 text-sm font-black text-[#1F4A2C]">
                      <Star size={14} className="text-[#E8B93E]" fill="currentColor" aria-hidden="true" />
                      {form.petName.trim()} 变美完成，预约成功！
                    </p>
                    <div className="num-display mt-2 flex flex-col gap-1 text-xs font-bold text-[#1C3340]/65">
                      <span>预约号：{result.bookingNo}</span>
                      <span>合计：¥{result.total}（{serviceIds.length} 项服务）</span>
                      <span>到店时间：{fmtBookTime}</span>
                      {groomer && <span>美容师：{groomer.emoji} {groomer.name}</span>}
                    </div>
                    <motion.button
                      type="button"
                      onClick={handleReset}
                      whileTap={{ scale: 0.96 }}
                      className="mt-3 inline-flex min-h-[40px] w-full items-center justify-center gap-1.5 rounded-full border-2 border-[#0B77BE] text-sm font-black text-[#0B77BE] transition-colors hover:bg-[#DCEEF9] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0B77BE]"
                    >
                      继续预约
                    </motion.button>
                  </motion.div>
                )}
              </AnimatePresence>
            </section>
          </div>
        </div>
      </main>
    </MotionConfig>
  )
}

export default Groom
