import { useEffect, useMemo, useRef, useState } from 'react'
import BackToPlanet from '../components/BackToPlanet'
import { motion, MotionConfig } from 'framer-motion'
import { useToast } from '../components/Toast'
import {
  CircleCheck,
  FileText,
  PawPrint,
  Pill,
  Send,
  Stethoscope,
  UserRound,
} from 'lucide-react'
import { aiUnavailableReason, streamChat, type ChatMessage } from '../lib/glm'
import '../styles/walk.css'
import '../styles/clinic.css'

/* ============ 调色板（诊室·处方笺） ============
 * 诊室纸 #F2F7F5 · 深松墨 #16332C · 诊室青 #0F766E · 薄荷雾 #D9EFE9 · 章红 #C2453D
 */

/* ============ 流式日志与药品卡片 ============ */

interface LogStep {
  text: string
  at: number // 流式进度达到该比例时点亮
}

const LOG_STEPS: LogStep[] = [
  { text: '连接兽医大模型...', at: 0.0 },
  { text: '解析症状描述，提取关键特征...', at: 0.12 },
  { text: '检索兽医知识库，匹配相似病例...', at: 0.38 },
  { text: '综合推理，生成诊断结论...', at: 0.68 },
  { text: '输出治疗方案与用药建议', at: 0.9 },
]

interface Medicine {
  name: string
  target: string
  usage: string
  note: string
}

const DRUG_HEADER = '【推荐药品】'

/** 从 AI 回答中提取药品清单（宽容匹配：无标头 / 含 markdown 加粗 / 带序号） */
function parseMedicines(text: string): Medicine[] {
  let block = ''
  const idx = text.indexOf(DRUG_HEADER)
  if (idx >= 0) {
    block = text.slice(idx + DRUG_HEADER.length)
  } else {
    // 模型偶尔忘记标头，退而求其次：只扫描含「药名：」或「｜」分隔的行
    block = text
  }

  const out: Medicine[] = []
  for (const rawLine of block.split('\n')) {
    let line = rawLine.trim().replace(/\*\*/g, '').replace(/^[-*·\d.、\s]+/, '')
    if (!line) continue
    // 「药名：xxx｜适用：yyy｜...」→ 去掉字段标签只保留值
    line = line.replace(/(药名|适用症状|适用|用法用量|用法|注意事项|注意)\s*[::]\s*/g, '')
    const parts = line.split(/[|｜]/).map((s) => s.trim()).filter(Boolean)
    if (parts.length >= 2 && parts[0].length > 1 && parts[0].length < 30) {
      out.push({
        name: parts[0],
        target: parts[1] ?? '适用症状见说明',
        usage: parts[2] ?? '请遵医嘱使用',
        note: parts[3] ?? '使用前请阅读说明书',
      })
    }
    if (out.length >= 4) break
  }
  return out
}

/* ============ 小组件 ============ */

/** AI 思考中：爪印依次落下 */
function ThinkingPaws() {
  return (
    <div className="flex items-center gap-1.5 py-2" role="status" aria-label="AI 兽医正在思考">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="inline-block text-[#0F766E]"
          animate={{ y: [0, -6, 0], opacity: [0.35, 1, 0.35] }}
          transition={{ repeat: Infinity, duration: 0.9, delay: i * 0.18, ease: 'easeInOut' }}
          aria-hidden="true"
        >
          <PawPrint size={18} />
        </motion.span>
      ))}
    </div>
  )
}

/** 诊室头像圆盘 */
function Avatar({ kind }: { kind: 'doctor' | 'owner' }) {
  return (
    <span
      className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${
        kind === 'doctor' ? 'bg-[#0F766E] text-white' : 'bg-[#D9EFE9] text-[#0F766E]'
      }`}
      aria-hidden="true"
    >
      {kind === 'doctor' ? <Stethoscope size={20} /> : <UserRound size={20} />}
    </span>
  )
}

/* ============ 页面 ============ */

type Phase = 'idle' | 'thinking' | 'streaming' | 'done' | 'error'
type Turn = { role: 'user' | 'assistant'; text: string }

const SUGGESTIONS = ['我家金毛一直挠耳朵，还有黑色分泌物', '猫咪两天没吃饭了，精神也不好', '狗狗呕吐了一次，要不要紧？']

function Clinic() {
  const [turns, setTurns] = useState<Turn[]>([])
  const [streamingText, setStreamingText] = useState('')
  const [input, setInput] = useState('')
  const [phase, setPhase] = useState<Phase>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const chatRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<AbortController | null>(null)
  const toast = useToast()
  const aiUnavailable = aiUnavailableReason()

  const busy = phase === 'thinking' || phase === 'streaming'
  const medicines = useMemo(() => parseMedicines(turns.filter((t) => t.role === 'assistant').map((t) => t.text).join('\n')), [turns])
  const progress =
    phase === 'thinking' ? 0.05 : phase === 'streaming' ? Math.min(streamingText.length / 900, 0.98) : phase === 'done' ? 1 : 0

  // 对话流自动滚到底部
  useEffect(() => {
    const el = chatRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [turns, streamingText, phase])

  // 页面卸载时取消未完成请求
  useEffect(() => () => abortRef.current?.abort(), [])

  async function ask(question: string) {
    const q = question.trim()
    if (!q || busy) return
    if (aiUnavailable) {
      toast.error(aiUnavailable)
      return
    }
    setErrorMsg('')
    setTurns((ts) => [...ts, { role: 'user', text: q }])
    setInput('')
    setPhase('thinking')
    setStreamingText('')

    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl

    const history: ChatMessage[] = [...turns, { role: 'user', text: q } as Turn].map((t) => ({
      role: t.role,
      content: t.text,
    }))

    // 假启动：若 1.2s 内没有首帧，保持 thinking 动画
    const kick = setTimeout(() => setPhase((p) => (p === 'thinking' ? 'streaming' : p)), 1200)

    try {
      const full = await streamChat(
        history,
        {
          onDelta: (d) => {
            setPhase('streaming')
            setStreamingText((s) => s + d)
          },
        },
        ctrl.signal,
      )
      clearTimeout(kick)
      const finalText = full || streamingText
      setTurns((ts) => [...ts, { role: 'assistant', text: finalText }])
      setStreamingText('')
      setPhase('done')
      toast.success('AI 兽医诊断完成')
    } catch (err) {
      clearTimeout(kick)
      if (ctrl.signal.aborted) return
      setStreamingText('')
      setPhase('error')
      const msg = err instanceof Error ? err.message : '请求失败，请稍后重试'
      setErrorMsg(msg)
      toast.error(msg)
    }
  }

  return (
    <MotionConfig reducedMotion="user">
      <main className="relative min-h-screen overflow-hidden bg-[#F2F7F5] text-[#16332C]">
      {/* 诊室氛围：极淡的十字记号 */}
      <span className="pointer-events-none absolute right-[10%] top-[16%] select-none text-6xl font-black text-[#0F766E]/[0.05]" aria-hidden="true">＋</span>
      <span className="pointer-events-none absolute bottom-[14%] left-[6%] select-none text-5xl font-black text-[#0F766E]/[0.04]" aria-hidden="true">＋</span>

      <header className="relative z-10 flex items-center justify-between px-6 py-5 lg:px-10">
        <motion.div initial={{ opacity: 0, x: -24 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.5 }} className="inline-block">
          <BackToPlanet />
        </motion.div>
        <motion.div
          className="absolute left-1/2 flex -translate-x-1/2 items-center gap-2.5 rounded-full bg-white py-1.5 pl-2 pr-6 shadow-[0_12px_24px_-14px_rgba(15,118,110,0.4)]"
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.15 }}
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#0F766E] text-white">
            <Stethoscope size={19} aria-hidden="true" />
          </span>
          <h1 className="text-lg font-black tracking-wide">赛博诊所</h1>
        </motion.div>
        <div className="flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-bold text-[#0F766E] shadow-[0_12px_24px_-14px_rgba(15,118,110,0.4)]">
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full rounded-full bg-[#0F766E] opacity-50 motion-safe:animate-ping" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-[#0F766E]" />
          </span>
          AI 兽医在线
        </div>
      </header>

      <div className="relative z-10 mx-auto grid w-full max-w-7xl grid-cols-1 gap-8 px-6 pb-16 lg:grid-cols-[60%_40%] lg:px-10">
        {/* 左侧：问诊记录 */}
        <section
          className="walk-card flex max-h-[calc(100vh-150px)] min-h-[420px] flex-col overflow-hidden rounded-[20px] bg-white"
          aria-label="AI 问诊"
        >
          <div ref={chatRef} className="relative flex-1 overflow-y-auto p-6" role="log" aria-live="off">
            <h1 className="mb-6 flex items-center gap-2 text-2xl font-black tracking-wide">
              <FileText size={24} className="text-[#0F766E]" aria-hidden="true" />
              赛博诊所
              <span className="text-sm font-bold text-[#0F766E]">· {busy ? '问诊中' : '待问诊'}</span>
            </h1>

            {aiUnavailable && (
              <div className="mb-5 rounded-2xl border-2 border-dashed border-[#D9A441]/60 bg-[#FBF7EF] px-4 py-3 text-sm font-bold text-[#8A6116]">
                {aiUnavailable}
              </div>
            )}

            {turns.length === 0 && !busy && (
              <div className="mb-5">
                <p className="mb-3 text-sm font-bold text-[#16332C]/60">描述你家毛孩子的症状，猫头鹰医生会给出初步判断：</p>
                <div className="flex flex-wrap gap-2">
                  {SUGGESTIONS.map((s) => (
                    <button key={s} type="button" onClick={() => ask(s)} className="rounded-full border-2 border-[#16332C]/10 bg-white px-3 py-1.5 text-xs font-bold text-[#16332C]/70 transition-colors hover:border-[#0F766E]/50 hover:text-[#0F766E] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0F766E]">
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="flex flex-col gap-6">
              {turns.map((t, i) =>
                t.role === 'user' ? (
                  <div key={i} className="flex items-start justify-end gap-3">
                    <div className="max-w-[85%] rounded-2xl rounded-tr-none bg-[#D9EFE9] px-4 py-3 text-sm font-medium leading-relaxed text-[#16332C]">{t.text}</div>
                    <Avatar kind="owner" />
                  </div>
                ) : (
                  <div key={i} className="flex items-start justify-start gap-3">
                    <Avatar kind="doctor" />
                    <div className="min-w-0 max-w-[85%]">
                      <div className="mb-1.5 text-xs font-black tracking-widest text-[#16332C]/45">猫头鹰医生 · 看诊完成</div>
                      <div className="rounded-2xl rounded-tl-none border-l-4 border-[#0F766E] bg-white px-4 py-3 shadow-[0_12px_22px_-16px_rgba(15,118,110,0.5)]">
                        <p className="whitespace-pre-wrap text-sm font-medium leading-7 text-[#16332C]">{t.text}</p>
                      </div>
                    </div>
                  </div>
                ),
              )}

              {busy && (
                <div className="flex items-start justify-start gap-3">
                  <Avatar kind="doctor" />
                  <div className="min-w-0 max-w-[85%]">
                    <div className="mb-1.5 text-xs font-black tracking-widest text-[#16332C]/45">猫头鹰医生 · 正在看诊</div>
                    {phase === 'thinking' && <ThinkingPaws />}
                    {streamingText && (
                      <div className="rounded-2xl rounded-tl-none border-l-4 border-[#0F766E] bg-white px-4 py-3 shadow-[0_12px_22px_-16px_rgba(15,118,110,0.5)]">
                        <p className="whitespace-pre-wrap text-sm font-medium leading-7 text-[#16332C]">
                          {streamingText}
                          <span className="ml-0.5 inline-block h-4 w-2 motion-safe:animate-pulse rounded-sm bg-[#0F766E] align-middle" aria-hidden="true" />
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {phase === 'error' && (
                <div className="rounded-2xl border-2 border-[#C2453D]/35 bg-[#FBEBEA] px-4 py-3 text-sm font-bold text-[#8F2B24]">
                  看诊失败：{errorMsg}。请检查网络与 API Key 后重试。
                </div>
              )}
            </div>
          </div>

          {/* 输入区 */}
          <div className="border-t border-[#16332C]/10 bg-[#F7FBF9] p-4">
            <div className="flex items-end gap-3">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    ask(input)
                  }
                }}
                placeholder="例如：我家金毛一直挠耳朵，还有黑色分泌物"
                rows={2}
                maxLength={500}
                disabled={busy}
                className="flex-1 resize-none rounded-2xl border-2 border-[#16332C]/10 bg-white px-4 py-3 text-sm font-medium outline-none transition-colors focus:border-[#0F766E] disabled:opacity-60"
              />
              <button
                type="button"
                onClick={() => ask(input)}
                disabled={busy || !input.trim() || !aiUnavailable}
                className="inline-flex min-h-[48px] items-center gap-1.5 rounded-2xl bg-[#0F766E] px-5 text-sm font-black text-white shadow-[0_14px_24px_-12px_rgba(15,118,110,0.7)] transition-colors hover:bg-[#0C5F58] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0F766E] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Send size={15} aria-hidden="true" />
                {busy ? '看诊中…' : '发送'}
              </button>
            </div>
            <p className="mt-2 text-right text-[10px] font-medium text-[#16332C]/40">Enter 发送 · Shift+Enter 换行 · 回答由 AI 生成，仅供参考</p>
          </div>
        </section>

        {/* 右侧：处方笺 */}
        <aside
          className="walk-card relative max-h-[calc(100vh-150px)] self-start overflow-y-auto rounded-[20px] bg-white p-6 lg:sticky lg:top-24"
          aria-label="诊疗面板"
        >
          <div className="relative z-10 flex flex-col gap-6">
            {/* 诊疗流程（真实序列） */}
            <div>
              <h2 className="mb-3 flex items-center gap-1.5 text-sm font-black tracking-widest text-[#16332C]/70">
                <Stethoscope size={15} className="text-[#0F766E]" aria-hidden="true" /> 诊疗流程
              </h2>
              <ol className="flex flex-col gap-2.5" role="list">
                {LOG_STEPS.map(({ text, at }) => {
                  const active = progress >= at
                  const isCurrent = active && progress < Math.min(at + 0.22, 1)
                  return (
                    <motion.li
                      key={text}
                      initial={false}
                      animate={{ opacity: active ? 1 : 0.38, x: active ? 0 : -6 }}
                      transition={{ duration: 0.35 }}
                      className="flex items-center gap-2.5 text-sm"
                      aria-current={isCurrent ? 'step' : undefined}
                    >
                      {active ? (
                        isCurrent ? (
                          <span className="rp-breath inline-block h-3.5 w-3.5 shrink-0 rounded-full bg-[#0F766E]" aria-hidden="true" />
                        ) : (
                          <CircleCheck size={17} className="shrink-0 text-[#0F766E]" aria-hidden="true" />
                        )
                      ) : (
                        <span className="inline-block h-3.5 w-3.5 shrink-0 rounded-full border-2 border-dashed border-[#16332C]/25" aria-hidden="true" />
                      )}
                      <span className={active ? 'rounded-lg bg-[#EAF4F1] px-2 py-0.5 font-bold text-[#16332C]' : 'font-medium text-[#16332C]/45'}>{text}</span>
                    </motion.li>
                  )
                })}
              </ol>
            </div>

            {/* 处方笺 */}
            <div className="relative">
              {/* 笺纸：Rp 淡字 + 稿纸横线 */}
              <div className="rp-ruled relative overflow-hidden rounded-2xl border-2 border-[#0F766E]/15 bg-[#FBFEFD] px-4 pb-4 pt-3">
                <span
                  className="pointer-events-none absolute right-3 top-1 select-none text-4xl font-black leading-none text-[#0F766E]/[0.14]"
                  aria-hidden="true"
                >
                  Rp
                </span>
                <h2 className="mb-2 flex items-center gap-1.5 text-sm font-black tracking-widest text-[#16332C]/70">
                  <Pill size={15} className="text-[#0F766E]" aria-hidden="true" /> 推荐药品
                </h2>

                {medicines.length === 0 ? (
                  <div className="rounded-xl bg-[#EAF4F1]/70 px-4 py-6 text-center text-xs font-bold text-[#16332C]/45">
                    {busy ? '猫头鹰医生正在斟酌用药…' : '问诊完成后，这里会开具对应的常用药'}
                  </div>
                ) : (
                  <div className="flex flex-col gap-3">
                    {medicines.map((m) => (
                      <motion.article
                        key={m.name}
                        initial={{ opacity: 0, y: 14 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ type: 'spring', stiffness: 120, damping: 16 }}
                        className="rounded-xl border-l-4 border-[#0F766E] bg-white/95 p-3 shadow-[0_10px_18px_-14px_rgba(15,118,110,0.55)]"
                      >
                        <h3 className="mb-1.5 text-sm font-black text-[#16332C]">{m.name}</h3>
                        <dl className="flex flex-col gap-1 text-xs leading-5 text-[#16332C]/70">
                          <div className="flex gap-2"><dt className="shrink-0 font-black text-[#0F766E]">适用</dt><dd>{m.target}</dd></div>
                          <div className="flex gap-2"><dt className="shrink-0 font-black text-[#0F766E]">用法</dt><dd>{m.usage}</dd></div>
                          <div className="flex gap-2"><dt className="shrink-0 font-black text-[#0F766E]">注意</dt><dd>{m.note}</dd></div>
                        </dl>
                      </motion.article>
                    ))}
                  </div>
                )}

                {/* 红印章：诊断完成时盖上（唯一仪式动作） */}
                {phase === 'done' && medicines.length > 0 && (
                  <motion.div
                    initial={{ opacity: 0, scale: 1.9, rotate: -4 }}
                    animate={{ opacity: 1, scale: 1, rotate: -12 }}
                    transition={{ type: 'spring', stiffness: 320, damping: 16 }}
                    className="rp-stamp pointer-events-none absolute bottom-3 right-3 flex h-24 w-24 flex-col items-center justify-center text-center"
                    aria-hidden="true"
                  >
                    <span className="text-[13px] font-black leading-tight">AI 生成</span>
                    <span className="text-[11px] font-bold leading-tight">仅供参考</span>
                  </motion.div>
                )}
              </div>

              <p className="mt-3 flex items-start gap-1.5 rounded-xl bg-[#FBF7EF] px-3 py-2 text-[10px] font-bold leading-4 text-[#8A6116]">
                <CircleCheck size={12} className="mt-0.5 shrink-0" aria-hidden="true" />
                药品信息由 AI 生成，仅供参考；实际用药请遵医嘱并仔细阅读药品说明书。
              </p>
            </div>
          </div>
        </aside>
      </div>
      </main>
    </MotionConfig>
  )
}

export default Clinic
