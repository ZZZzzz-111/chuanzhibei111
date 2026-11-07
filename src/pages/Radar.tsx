import { useEffect, useMemo, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import BackToPlanet from '../components/BackToPlanet'
import { motion, AnimatePresence, MotionConfig } from 'framer-motion'
import { useToast } from '../components/Toast'
import {
  BadgeCheck,
  MapPin,
  Phone,
  Plus,
  Radar as RadarIcon,
  Satellite,
  Search,
  X,
} from 'lucide-react'

/* ============ 调色板（夜航雷达站·全站唯一暗页） ============
 * 夜幕 #171B2E · 舱板 #232842 · 雾白 #E8EAF6 · 跟踪紫 #818CF8 · 信号琥珀 #FBBF24
 */

/* ============ 数据 ============ */

const TAGS = [
  { id: 'orange', label: '橘猫', emoji: '🧡' },
  { id: 'whitepaws', label: '白手套', emoji: '🐾' },
  { id: 'neutered', label: '绝育', emoji: '✂️' },
  { id: 'collar', label: '戴项圈', emoji: '🦮' },
  { id: 'calico', label: '三花猫', emoji: '🌸' },
  { id: 'roundface', label: '圆脸', emoji: '🍙' },
]

interface Clue {
  id: number
  emoji: string
  title: string
  tags: string[]
  dist: string
  sim: number
}

const CLUES: Clue[] = [
  { id: 1, emoji: '🐱', title: '巷口打盹的橘猫', tags: ['橘猫', '戴项圈'], dist: '1.2km', sim: 90 },
  { id: 2, emoji: '🐈', title: '花坛边的白手套', tags: ['白手套', '三花猫'], dist: '0.8km', sim: 82 },
  { id: 3, emoji: '😻', title: '便利店门口讨饭的', tags: ['橘猫', '圆脸'], dist: '2.5km', sim: 76 },
  { id: 4, emoji: '🐱', title: '车棚里躲雨的', tags: ['绝育', '白手套'], dist: '3.4km', sim: 65 },
]

// 线索点在雷达地图上的位置（百分比）
const DOT_POS = [
  { x: '24%', y: '26%' },
  { x: '72%', y: '20%' },
  { x: '30%', y: '70%' },
  { x: '74%', y: '68%' },
]

const generateClues = (tagIds: string[], customKeywords: string[]): { pool: Clue[]; matched: boolean } => {
  // selectedTags 存的是 TAGS.id（如 'orange'），而 CLUES.tags 是中文标签（如 '橘猫'），
  // 需先把 id 映射成 label 再做包含判断；自定义关键词直接参与匹配
  const labels = tagIds
    .map((id) => TAGS.find((t) => t.id === id)?.label)
    .filter((l): l is string => typeof l === 'string')
  const keywords = [...labels, ...customKeywords.map((k) => k.trim()).filter(Boolean)]
  if (keywords.length === 0) return { pool: CLUES.slice(0, 3), matched: true }

  const hit = (clue: Clue, k: string) =>
    clue.tags.some((t) => t.includes(k) || k.includes(t)) || clue.title.includes(k)
  const pool = CLUES.filter((c) => keywords.some((k) => hit(c, k)))
  // 关键词没命中任何线索时，回退展示全部，避免"空白页"的挫败感
  return pool.length > 0
    ? { pool: pool.slice(0, 3), matched: true }
    : { pool: CLUES.slice(0, 3), matched: false }
}

/* ============ 页面 ============ */

/** 自定义特征上限：太长会挤爆雷达面板，也避免用户输入失控 */
const MAX_CUSTOM_FEATURES = 5
const MAX_KEYWORD_LEN = 12

/** 圆体相似度数字（替代此前的 Comic Sans 发光体） */
function SimNumber({ value }: { value: number }) {
  return (
    <span className="num-display text-[15px] font-bold leading-none text-[#A5B4FC]">
      {value}%
    </span>
  )
}

function Radar() {
  const toast = useToast()
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [customFeatures, setCustomFeatures] = useState<string[]>([])
  const [draft, setDraft] = useState('')
  const [inputError, setInputError] = useState<string | null>(null)
  const [scanning, setScanning] = useState(false)
  const [feed, setFeed] = useState<Clue[]>([])
  const [activeDot, setActiveDot] = useState<number | null>(null)
  const [contacted, setContacted] = useState<Record<number, boolean>>({})

  // 扫描状态计时（带清理，防连点乱跳）
  useEffect(() => {
    if (!scanning) return
    const t = setTimeout(() => setScanning(false), 1600)
    return () => clearTimeout(t)
  }, [scanning])

  const toggleTag = (id: string) => {
    setSelectedTags((prev) => (prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]))
  }

  /** 添加自定义特征：支持中英文逗号/顿号一次输入多个，去重 + 长度校验 */
  const addCustomFeature = () => {
    const parts = draft
      .split(/[,，、]/)
      .map((s) => s.trim())
      .filter(Boolean)
    if (parts.length === 0) {
      setInputError('请先输入一个特征关键词')
      return
    }

    const accepted: string[] = []
    let error: string | null = null

    for (const part of parts) {
      if (part.length > MAX_KEYWORD_LEN) {
        error ??= `单个关键词最多 ${MAX_KEYWORD_LEN} 个字`
        continue
      }
      const duplicated =
        customFeatures.includes(part) || TAGS.some((t) => t.label === part)
      if (duplicated) {
        error ??= `「${part}」已经在特征列表里啦`
        continue
      }
      if (customFeatures.length + accepted.length >= MAX_CUSTOM_FEATURES) {
        error ??= `最多添加 ${MAX_CUSTOM_FEATURES} 个自定义特征`
        break
      }
      accepted.push(part)
    }

    if (accepted.length > 0) {
      setCustomFeatures((prev) => [...prev, ...accepted])
      setDraft('')
      toast.success(`已添加自定义特征：${accepted.join(' · ')}`)
    }
    setInputError(error)
  }

  const removeCustomFeature = (feature: string) => {
    setCustomFeatures((prev) => prev.filter((f) => f !== feature))
  }

  /** 输入框键盘：回车添加（空输入则直接扫描）、退格删最后一个、Esc 清空 */
  const handleInputKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    // 中文输入法组合中不拦截，避免"选词即添加"
    if (e.nativeEvent.isComposing) return
    if (e.key === 'Enter') {
      e.preventDefault()
      if (draft.trim()) addCustomFeature()
      else if (!scanning) handleScan()
    } else if (e.key === 'Backspace' && draft === '' && customFeatures.length > 0) {
      setCustomFeatures((prev) => prev.slice(0, -1))
    } else if (e.key === 'Escape') {
      setDraft('')
      setInputError(null)
    }
  }

  const handleScan = () => {
    if (scanning) return
    // 预设特征与自定义关键词一起参与匹配，互不冲突
    const { pool, matched } = generateClues(selectedTags, customFeatures)
    setFeed(pool)
    setActiveDot(null)
    setContacted({})
    setScanning(true)
    if (matched) {
      toast.success(`雷达扫描完成，捕捉到 ${pool.length} 条线索`)
    } else {
      toast.info('未找到完全匹配的线索，已为你展示最接近的 3 条')
    }
  }

  const selectedLabels = useMemo(
    () => TAGS.filter((t) => selectedTags.includes(t.id)).map((t) => t.label),
    [selectedTags]
  )

  // 预设标签 + 自定义关键词，统一用于"已选"展示与线索标签排序
  const activeKeywords = useMemo(
    () => [...selectedLabels, ...customFeatures],
    [selectedLabels, customFeatures]
  )

  return (
    <MotionConfig reducedMotion="user">
      <main className="relative min-h-screen overflow-hidden bg-[#171B2E] text-[#E8EAF6]">
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
            className="absolute left-1/2 flex -translate-x-1/2 items-center gap-2.5 rounded-full bg-[#232842] py-1.5 pl-2 pr-6 shadow-[0_14px_28px_-16px_rgba(129,140,248,0.5)]"
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.15 }}
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#818CF8] text-[#171B2E]">
              <RadarIcon size={19} aria-hidden="true" />
            </span>
            <h1 className="text-lg font-black tracking-wide text-[#E8EAF6]">寻宠雷达</h1>
          </motion.div>
          <div className="flex items-center gap-2 rounded-full bg-[#232842] px-4 py-2 text-sm font-bold text-[#A5B4FC] shadow-[0_14px_28px_-16px_rgba(129,140,248,0.5)]">
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full rounded-full bg-[#818CF8] opacity-50 motion-safe:animate-ping" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-[#818CF8]" />
            </span>
            雷达在线
          </div>
        </header>

        {/* 主体三栏 */}
        <div className="relative z-10 mx-auto grid w-full max-w-7xl grid-cols-1 gap-6 px-6 pb-16 lg:grid-cols-[24%_1fr_28%] lg:px-10">
          {/* 左侧：任务简报（特征筛选） */}
          <section
            className="relative self-start rounded-[20px] border border-white/10 bg-[#232842] p-5 shadow-[0_20px_36px_-24px_rgba(0,0,0,0.8)]"
            aria-label="毛孩子特征筛选"
          >
            <h2 className="mb-4 flex items-center gap-2 text-lg font-black text-[#E8EAF6]">
              <Search size={19} className="text-[#818CF8]" aria-hidden="true" /> 毛孩子特征（多选）
            </h2>
            <div className="flex flex-wrap gap-2.5" role="group" aria-label="特征标签多选">
              {TAGS.map((tag) => {
                const active = selectedTags.includes(tag.id)
                return (
                  <motion.button
                    key={tag.id}
                    type="button"
                    onClick={() => toggleTag(tag.id)}
                    whileTap={{ scale: 0.92 }}
                    aria-pressed={active}
                    className={`inline-flex min-h-[44px] items-center rounded-full border px-3.5 py-2 text-sm font-bold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#818CF8] ${
                      active
                        ? 'border-[#818CF8] bg-[#818CF8] text-[#171B2E]'
                        : 'border-white/15 bg-transparent text-[#A9B0CC] hover:border-[#818CF8]/60 hover:text-[#A5B4FC]'
                    }`}
                  >
                    <span className="mr-1" aria-hidden="true">{tag.emoji}</span>
                    {tag.label}
                  </motion.button>
                )
              })}
            </div>
            {/* 自定义特征输入：与预设标签并存，统一参与扫描 */}
            <div className="mt-4 rounded-2xl border-2 border-dashed border-[#818CF8]/30 bg-[#1C2138] p-3">
              <label
                htmlFor="radar-custom"
                className="flex items-center gap-1.5 text-xs font-black text-[#A5B4FC]"
              >
                <Plus size={13} aria-hidden="true" />
                没找到？手动输入自定义特征
              </label>
              <div className="mt-2 flex gap-2">
                <input
                  id="radar-custom"
                  type="text"
                  value={draft}
                  onChange={(e) => {
                    setDraft(e.target.value)
                    setInputError(null)
                  }}
                  onKeyDown={handleInputKeyDown}
                  maxLength={MAX_KEYWORD_LEN}
                  placeholder="如：蓝眼睛、怕生、左耳缺口"
                  aria-invalid={inputError !== null}
                  aria-describedby="radar-custom-hint"
                  className={`min-h-[44px] w-full min-w-0 flex-1 rounded-xl border-2 bg-[#171B2E] px-3 text-sm font-bold text-[#E8EAF6] placeholder:font-medium placeholder:text-[#767E9E] transition-colors focus:outline-none ${
                    inputError
                      ? 'border-[#F87171]/70'
                      : 'border-white/10 focus:border-[#818CF8]'
                  }`}
                />
                <button
                  type="button"
                  onClick={addCustomFeature}
                  aria-label="添加自定义特征"
                  className="inline-flex min-h-[44px] shrink-0 items-center rounded-xl bg-[#818CF8] px-3.5 text-sm font-black text-[#171B2E] transition-colors hover:bg-[#9BA3F9] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#818CF8] focus-visible:ring-offset-2 focus-visible:ring-offset-[#232842]"
                >
                  添加
                </button>
              </div>
              <p id="radar-custom-hint" className="mt-1.5 text-[11px] font-medium text-[#767E9E]">
                回车添加 · 逗号可一次加多个 · 空输入回车直接扫描
              </p>
              {inputError && (
                <p role="alert" className="mt-1 text-[11px] font-bold text-[#F87171]">
                  {inputError}
                </p>
              )}
              {customFeatures.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5" role="list" aria-label="自定义特征">
                  {customFeatures.map((f) => (
                    <span
                      key={f}
                      role="listitem"
                      className="inline-flex min-h-[44px] items-center gap-1 rounded-full bg-[#818CF8] pl-3 pr-1 text-xs font-black text-[#171B2E]"
                    >
                      {f}
                      <button
                        type="button"
                        onClick={() => removeCustomFeature(f)}
                        aria-label={`删除自定义特征${f}`}
                        className="flex h-9 w-9 items-center justify-center rounded-full text-[#171B2E]/80 transition-colors hover:bg-white/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#171B2E]"
                      >
                        <X size={14} aria-hidden="true" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            <p className="mt-4 text-xs font-medium text-[#767E9E]">
              已选：
              {activeKeywords.length > 0
                ? activeKeywords.join(' · ')
                : '无（扫描全部线索）'}
            </p>

            {/* 扫描按钮 */}
            <motion.button
              type="button"
              onClick={handleScan}
              disabled={scanning}
              whileHover={scanning ? undefined : { scale: 1.02 }}
              whileTap={scanning ? undefined : { scale: 0.97 }}
              aria-label="开启雷达扫描"
              className={`mt-5 inline-flex min-h-[52px] w-full items-center justify-center gap-2 rounded-full bg-[#818CF8] px-6 text-base font-black text-[#171B2E] shadow-[0_16px_28px_-14px_rgba(129,140,248,0.75)] transition-colors hover:bg-[#9BA3F9] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#818CF8] focus-visible:ring-offset-2 focus-visible:ring-offset-[#232842] ${
                scanning ? 'cursor-wait opacity-70' : ''
              }`}
            >
              <RadarIcon size={18} aria-hidden="true" className={scanning ? 'motion-safe:animate-spin' : ''} />
              {scanning ? '扫描中...' : feed.length > 0 ? '重新扫描' : '开启雷达扫描'}
            </motion.button>
          </section>

          {/* 中间：雷达地图 */}
          <section
            className="relative rounded-[20px] border border-white/10 bg-[#232842] p-5 shadow-[0_20px_36px_-24px_rgba(0,0,0,0.8)]"
            aria-label="雷达地图"
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-lg font-black text-[#E8EAF6]">
                <MapPin size={19} className="text-[#818CF8]" aria-hidden="true" /> 侦探线索板
              </h2>
              <span className="rounded-full bg-[#1C2138] px-3 py-1 text-xs font-bold text-[#A5B4FC]" role="status">
                {scanning ? '信号捕捉中...' : feed.length > 0 ? `捕捉到 ${feed.length} 条线索` : '等待启动...'}
              </span>
            </div>

            {/* 地图底板：暗紫网格 */}
            <div
              className="flex min-h-[340px] items-center justify-center rounded-2xl bg-[#1C2138] p-4 sm:min-h-[420px]"
              style={{
                backgroundImage:
                  'linear-gradient(rgba(129, 140, 248, 0.07) 1px, transparent 1px), linear-gradient(90deg, rgba(129, 140, 248, 0.07) 1px, transparent 1px)',
                backgroundSize: '28px 28px',
              }}
            >
              {/* 雷达圆盘 */}
              <div
                className="relative aspect-square w-full max-w-[380px] overflow-hidden rounded-full"
                style={{ background: 'radial-gradient(circle at center, #2A3054 0%, #1D2240 100%)' }}
                aria-label="雷达扫描盘"
              >
                {/* 同心环 + 距离读数 */}
                <div className="absolute inset-[12%] rounded-full border border-[#818CF8]/20" aria-hidden="true" />
                <div className="absolute inset-[28%] rounded-full border border-[#818CF8]/20" aria-hidden="true" />
                <div className="absolute inset-[44%] rounded-full border border-[#818CF8]/20" aria-hidden="true" />
                {/* 十字准线 */}
                <div className="absolute left-1/2 top-0 h-full w-px bg-[#818CF8]/15" aria-hidden="true" />
                <div className="absolute top-1/2 left-0 h-px w-full bg-[#818CF8]/15" aria-hidden="true" />
                {/* 中心点 */}
                <div className="absolute left-1/2 top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#818CF8] shadow-[0_0_0_4px_rgba(129,140,248,0.25)]" aria-hidden="true" />

                {/* 扫描光束：扫描时加速（MotionConfig 已尊重减弱动效） */}
                <motion.div
                  className="absolute inset-0 rounded-full"
                  style={{
                    background:
                      'conic-gradient(from 0deg, rgba(129, 140, 248, 0.5), rgba(129, 140, 248, 0.16) 55deg, transparent 85deg)',
                  }}
                  animate={{ rotate: 360 }}
                  transition={{ repeat: Infinity, duration: scanning ? 1.1 : 7, ease: 'linear' }}
                  aria-hidden="true"
                />
                {/* 扫描时的扩散波纹 */}
                <AnimatePresence>
                  {scanning && (
                    <motion.div
                      key="pulse"
                      className="absolute inset-0 rounded-full border-4 border-[#818CF8]/60"
                      initial={{ scale: 0.4, opacity: 0.9 }}
                      animate={{ scale: 1.25, opacity: 0 }}
                      exit={{ opacity: 0 }}
                      transition={{ repeat: Infinity, duration: 1, ease: 'easeOut' }}
                      aria-hidden="true"
                    />
                  )}
                </AnimatePresence>

                {/* 线索点：扫描后出现（外层原生 div 负责居中定位，FM 只动内层，避免 transform 冲突） */}
                {feed.map((clue, i) => {
                  const pos = DOT_POS[i % DOT_POS.length]
                  return (
                    <div
                      key={clue.id}
                      className="absolute z-10"
                      style={{ left: pos.x, top: pos.y, transform: 'translate(-50%, -50%)' }}
                    >
                      {/* 相似度气泡 */}
                      <AnimatePresence>
                        {activeDot === clue.id && (
                          <div
                            className="absolute bottom-full left-1/2 z-20 mb-3"
                            style={{ transform: 'translateX(-50%)' }}
                          >
                            <motion.div
                              initial={{ opacity: 0, y: 8, scale: 0.85 }}
                              animate={{ opacity: 1, y: 0, scale: 1 }}
                              exit={{ opacity: 0, y: 6, scale: 0.9 }}
                              transition={{ type: 'spring', stiffness: 300, damping: 18 }}
                              className="relative whitespace-nowrap rounded-2xl border border-[#818CF8]/40 bg-[#2C3154] px-3.5 py-2 text-xs font-black text-[#E8EAF6] shadow-[0_14px_26px_-14px_rgba(0,0,0,0.9)]"
                              role="status"
                            >
                              发现相似度 {clue.sim}% 的猫咪
                              <span
                                className="absolute left-1/2 top-full -translate-x-1/2 -mt-px block h-2.5 w-2.5 rotate-45 bg-[#2C3154]"
                                aria-hidden="true"
                              />
                            </motion.div>
                          </div>
                        )}
                      </AnimatePresence>
                      {/* 信号点（外层 44px 触摸区，内层保留视觉光点） */}
                      <motion.button
                        type="button"
                        initial={{ scale: 0, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{ type: 'spring', stiffness: 300, damping: 14, delay: i * 0.12 }}
                        whileHover={{ scale: 1.15 }}
                        whileTap={{ scale: 0.9 }}
                        onClick={() => setActiveDot((prev) => (prev === clue.id ? null : clue.id))}
                        aria-label={`线索点：发现相似度${clue.sim}%的猫咪，${clue.title}`}
                        className="relative flex h-11 w-11 items-center justify-center rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-[#FBBF24]"
                      >
                        <span
                          className="h-4 w-4 rounded-full bg-[#FBBF24] shadow-[0_0_0_4px_rgba(251,191,36,0.25)]"
                          aria-hidden="true"
                        />
                        <span className="absolute h-4 w-4 motion-safe:animate-ping rounded-full bg-[#FBBF24]/60" aria-hidden="true" />
                      </motion.button>
                    </div>
                  )
                })}
              </div>
            </div>
          </section>

          {/* 右侧：线索回执 */}
          <aside
            className="relative self-start overflow-hidden rounded-[20px] border border-white/10 bg-[#232842] p-5 shadow-[0_20px_36px_-24px_rgba(0,0,0,0.8)] lg:sticky lg:top-24"
            aria-label="雷达捕捉到的线索"
          >
            <div className="relative z-10">
              <h2 className="mb-4 flex items-center gap-2 text-lg font-black text-[#E8EAF6]">
                <Satellite size={19} className="text-[#818CF8]" aria-hidden="true" /> 雷达捕捉到的线索
              </h2>

              {feed.length === 0 ? (
                <div className="rounded-2xl bg-[#1C2138] px-4 py-8 text-center text-sm font-bold text-[#767E9E]">
                  还没有线索，去开启雷达扫描吧
                </div>
              ) : (
                <ol className="flex flex-col gap-4" role="list">
                  <AnimatePresence>
                    {feed.map((clue, i) => (
                      <motion.li
                        key={clue.id}
                        initial={{ opacity: 0, x: 40 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ type: 'spring', stiffness: 200, damping: 16, delay: i * 0.18 }}
                        className="rounded-2xl border border-white/8 bg-[#262C4A] p-4"
                      >
                        <div className="flex items-start gap-3">
                          {/* 头像占位（数据 emoji） */}
                          <span
                            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-2xl ${
                              i % 2 === 0 ? 'bg-[#818CF8]/15' : 'bg-[#FBBF24]/15'
                            }`}
                            aria-hidden="true"
                          >
                            {clue.emoji}
                          </span>
                          <div className="min-w-0 flex-1">
                            <h3 className="truncate text-sm font-black text-[#E8EAF6]">{clue.title}</h3>
                            <div className="mt-1.5 flex flex-wrap gap-1">
                              {(activeKeywords.length > 0
                                ? clue.tags.filter((t) => activeKeywords.includes(t)).concat(
                                    clue.tags.filter((t) => !activeKeywords.includes(t))
                                  )
                                : clue.tags
                              ).map((t) => (
                                <span
                                  key={t}
                                  className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                                    activeKeywords.includes(t)
                                      ? 'bg-[#818CF8]/25 text-[#C7CBFD]'
                                      : 'bg-white/8 text-[#A9B0CC]'
                                  }`}
                                >
                                  {t}
                                </span>
                              ))}
                            </div>
                            <p className="mt-1.5 flex items-center gap-1 text-xs font-bold text-[#A9B0CC]">
                              <MapPin size={11} aria-hidden="true" />
                              距离你 {clue.dist}
                            </p>
                          </div>
                          <span className="shrink-0 rounded-full bg-[#818CF8]/15 px-2 py-1 text-[11px] font-black text-[#C7CBFD]">
                            相似度 <SimNumber value={clue.sim} />
                          </span>
                        </div>
                        {/* 相似度信号条 */}
                        <div className="mt-2.5 h-2 overflow-hidden rounded-full bg-[#171B2E]">
                          <motion.div
                            className="h-full rounded-full bg-[#818CF8]"
                            initial={{ width: 0 }}
                            animate={{ width: `${clue.sim}%` }}
                            transition={{ type: 'spring', stiffness: 60, damping: 15, delay: 0.2 + i * 0.18 }}
                          />
                        </div>
                        {/* 联系发现者 */}
                        <motion.button
                          type="button"
                          whileHover={contacted[clue.id] ? undefined : { scale: 1.02 }}
                          whileTap={contacted[clue.id] ? undefined : { scale: 0.96 }}
                          onClick={() => {
                            setContacted((prev) => ({ ...prev, [clue.id]: true }))
                            toast.success(`已联系「${clue.title}」的发现者，请留意回复`)
                          }}
                          disabled={contacted[clue.id]}
                          aria-label={`联系发现者，关于${clue.title}`}
                          className={`mt-3 inline-flex min-h-[44px] w-full items-center justify-center gap-1.5 rounded-full border px-4 py-2 text-sm font-black transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#818CF8] ${
                            contacted[clue.id]
                              ? 'cursor-default border-[#818CF8] bg-[#818CF8] text-[#171B2E]'
                              : 'border-[#818CF8]/50 bg-transparent text-[#A5B4FC] hover:border-[#818CF8] hover:bg-[#818CF8]/10'
                          }`}
                        >
                          {contacted[clue.id] ? (
                            <>
                              <BadgeCheck size={15} aria-hidden="true" />
                              已联系发现者
                            </>
                          ) : (
                            <>
                              <Phone size={15} aria-hidden="true" />
                              联系发现者
                            </>
                          )}
                        </motion.button>
                      </motion.li>
                    ))}
                  </AnimatePresence>
                </ol>
              )}
            </div>
          </aside>
        </div>
      </main>
    </MotionConfig>
  )
}

export default Radar
