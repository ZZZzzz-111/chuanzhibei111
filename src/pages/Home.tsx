import { useEffect, useRef, useState } from 'react'
import ThemeToggle from '../components/ThemeToggle'
import { useNavigate } from 'react-router-dom'
import { Utensils, Stethoscope, Footprints, MapPin, UserRound, Users, Scissors } from 'lucide-react'
import { AnimatePresence, motion, MotionConfig, useMotionValue, useTransform, animate, type AnimationPlaybackControls } from 'framer-motion'
import LoadingRun from '../components/LoadingRun'
import PlanetDecor from '../components/PlanetDecor'
import LoginPanel, { type UserProfile } from '../components/LoginPanel'
import Particles, { ParticlesProvider, useParticlesProvider } from '@tsparticles/react'
import { loadSlim } from '@tsparticles/slim'
import type { Engine, ISourceOptions } from '@tsparticles/engine'
import '../styles/sprite.css'

/* ============ 精灵图规格（从 PNG IHDR 读取的真实尺寸） ============
 * male_walk.png : 1560×256 → 10 帧横向   → 单帧 156×256（0.609:1）
 * dog_walk.png  :  384×192 → 8 列 × 4 行  → 单帧  48× 48（1:1），第二行 33.33%
 *
 * 人物精灵图里混有正面（1、3 帧）与背面（8、9 帧）朝向，
 * 连续播放会"忽正忽背"地闪烁；行走时只取侧面帧（2、4、5、6、7、10），
 * 由 sprite.css 用离散关键帧切换，保证朝向全程一致。
 */

const HUMAN_H = 64 // 精灵容器高度 px
const HUMAN_W = 39 // 与 156:256 帧比例一致，避免横向拉伸
const DOG_H = 36
const DOG_W = 36
/** 精灵帧底部透明留白补偿（按像素级 alpha 分析实测）：向下轻推，让脚底/爪底真正贴住球面 */
const HUMAN_FOOT_GAP = 3 // 人物帧底留白 ≈12.5 帧px × 0.25 缩放 ≈ 3
const DOG_FOOT_GAP = 3 // 小狗帧底留白 4 帧px × 0.75 缩放 = 3，与人物脚底严格同一基线
/**
 * 狗狗比主人"超前"的角度：走在前面更有牵引感。
 * 竖直站立模式下两人的水平间隔由圆心角决定，6° 只有 29px，人和狗会叠在一起；
 * 13° 约 63px，在球顶、四角、球侧都能让两个精灵错开。
 */
const DOG_LEAD_DEG = 13
/** 牵引绳向球心方向的自然下垂量 */
const LEASH_SAG = 9
/** 主人握绳手的位置（沿身体外法线的高度 / 沿前进方向的前移），按帧内拳头实测标定 */
const HAND_HEIGHT = HUMAN_H * 0.53
const HAND_AHEAD = 5
/** 狗狗项圈位置（按第二行帧内颈部实测标定） */
const COLLAR_HEIGHT = DOG_H * 0.58
const COLLAR_AHEAD = DOG_W * 0.29

interface ModuleConfig {
  id: number
  name: string
  icon: typeof Utensils
  angle: number
  route: string
  speech: string
  hideHuman: boolean
  /** 转场扩屏圆主题色（白天原色，黑夜压暗） */
  color: string
  /** 加载页功能预告文案 */
  teaser: string
}

const modules: ModuleConfig[] = [
  { id: 1, name: '鲜食食堂', icon: Utensils, angle: 315, route: '/recipe', speech: '肚子饿了', hideHuman: false, color: '#fb923c', teaser: 'AI 正在为你搭配一周鲜食菜单' },
  { id: 2, name: '赛博诊所', icon: Stethoscope, angle: 45, route: '/clinic', speech: '呜...我生病了', hideHuman: false, color: '#2dd4bf', teaser: 'AI 问诊就绪，科室分布一图看清' },
  { id: 3, name: '临时遛狗官', icon: Footprints, angle: 135, route: '/walk', speech: '求带走', hideHuman: false, color: '#22c55e', teaser: '正在匹配附近最靠谱的遛狗官' },
  { id: 4, name: '寻宠雷达', icon: MapPin, angle: 225, route: '/radar', speech: '主人你在哪', hideHuman: true, color: '#818cf8', teaser: '正在扫描全城的走失线索' },
  { id: 5, name: '宠物圈', icon: Users, angle: 90, route: '/community', speech: '求关注', hideHuman: false, color: '#E4586B', teaser: '正在刷出毛孩子圈的新鲜事' },
  { id: 6, name: '宠物美容院', icon: Scissors, angle: 270, route: '/groom', speech: '我要变美', hideHuman: false, color: '#38BDF8', teaser: '美容师已就位，泡泡浴安排上了' },
]

/** 登录态本地持久化的键名（无后端，仅演示） */
const USER_KEY = 'czb.profile'

/** 上次进入的模块 id：从模块页返回时，人物应站在该模块旁边而不是重回正上方 */
const LAST_MODULE_KEY = 'czb.lastModule'
/** 返回站位的角度偏移：贴着模块，又不完全挡住胶囊 */
const RETURN_ANGLE_OFFSET = 10

/** 首次进站站在正上方（0°）；从模块页返回则站在上次进入的模块旁 */
function initialAngle() {
  if (typeof window === 'undefined') return 0
  try {
    const id = window.sessionStorage.getItem(LAST_MODULE_KEY)
    const mod = modules.find((m) => String(m.id) === id)
    return mod ? mod.angle + RETURN_ANGLE_OFFSET : 0
  } catch {
    return 0
  }
}

// 星空粒子配置
const starOptions: ISourceOptions = {
  fullScreen: false,
  fpsLimit: 60,
  detectRetina: true,
  background: { color: { value: 'transparent' } },
  particles: {
    number: { value: 90 },
    color: { value: '#ffffff' },
    shape: { type: 'circle' },
    opacity: {
      value: { min: 0.2, max: 0.7 },
      animation: { enable: true, speed: 0.4, sync: false },
    },
    size: { value: { min: 0.5, max: 2.5 } },
    move: { enable: true, speed: 0.25, direction: 'none', random: true, straight: false, outModes: { default: 'out' } },
    twinkle: { particles: { enable: true, frequency: 0.08, opacity: 0.8 } },
  },
}

const initParticles = async (engine: Engine) => {
  await loadSlim(engine)
}

/** 角度 → 球心偏移 (px)。0°=正上，90°=正右，180°=正下，270°=正左 */
function angleToOffset(angle: number, radius: number) {
  const rad = (angle * Math.PI) / 180
  return { x: radius * Math.sin(rad), y: -radius * Math.cos(rad) }
}

/** 角色朝向：右半侧朝右（+1），左半侧朝左（-1），跨过正上/正下时翻面 */
function facingSign(angleDeg: number) {
  return Math.cos((angleDeg * Math.PI) / 180) >= 0 ? 1 : -1
}

/** 二次贝塞尔牵引绳：手 → 项圈，控制点向下垂，形成自然的松弛弧 */
function buildLeashPath(hand: { x: number; y: number }, collar: { x: number; y: number }): string {
  const mx = (hand.x + collar.x) / 2
  const my = (hand.y + collar.y) / 2 + LEASH_SAG
  return `M ${hand.x.toFixed(1)} ${hand.y.toFixed(1)} Q ${mx.toFixed(1)} ${my.toFixed(1)} ${collar.x.toFixed(1)} ${collar.y.toFixed(1)}`
}

function Starfield() {
  const { loaded } = useParticlesProvider()
  if (!loaded) return null
  return (
    <Particles id="starfield" className="absolute inset-0" options={starOptions} aria-hidden="true" />
  )
}

/** 白天模式的背景白云：柔和模糊椭圆，缓慢从左向右漂移 */
const DAY_CLOUDS = [
  { top: '12%', size: 220, duration: 55, delay: 0 },
  { top: '30%', size: 160, duration: 70, delay: -25 },
  { top: '55%', size: 260, duration: 80, delay: -50 },
  { top: '72%', size: 180, duration: 60, delay: -15 },
  { top: '42%', size: 130, duration: 65, delay: -40 },
]

function DayClouds() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      {DAY_CLOUDS.map((c, i) => (
        <motion.div
          key={i}
          className="absolute rounded-full bg-white/80 blur-2xl"
          style={{ top: c.top, width: c.size, height: c.size * 0.45 }}
          initial={{ left: '-25%' }}
          animate={{ left: '110%' }}
          transition={{ duration: c.duration, delay: c.delay, repeat: Infinity, ease: 'linear' }}
        />
      ))}
    </div>
  )
}

function Home() {
  const navigate = useNavigate()

  // 角度：用 MotionValue 让 framer-motion 直接接管，跳过 useState → re-render → re-transform 的抖动
  const angle = useMotionValue(initialAngle())

  // 星球半径 px：同时受宽高约束（vmin），避免扁平屏幕上角色顶出视口
  const calcRadius = () =>
    Math.min(window.innerWidth * 0.75, window.innerHeight * 0.75, 600) / 2
  const [radius, setRadius] = useState(() =>
    typeof window === 'undefined' ? 0 : calcRadius()
  )
  useEffect(() => {
    const update = () => {
      setRadius(calcRadius())
    }
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])

  // 模块状态
  const [activeModule, setActiveModule] = useState<ModuleConfig | null>(null)
  const [isTransitioning, setIsTransitioning] = useState(false)
  const [bubbleVisible, setBubbleVisible] = useState(false)
  const [isWalking, setIsWalking] = useState(false)
  // 加载收尾：小狗冲刺出屏
  const [isSprinting, setIsSprinting] = useState(false)
  // 默认黑夜；开关勾选 = 黑夜（月亮），未勾选 = 白天（太阳）
  const [isNight, setIsNight] = useState(true)

  // 登录态：仅存本机，刷新后仍保持
  const [user, setUser] = useState<UserProfile | null>(() => {
    if (typeof window === 'undefined') return null
    try {
      const raw = window.localStorage.getItem(USER_KEY)
      return raw ? (JSON.parse(raw) as UserProfile) : null
    } catch {
      return null
    }
  })
  const [loginOpen, setLoginOpen] = useState(false)

  const handleLogin = (profile: UserProfile) => {
    setUser(profile)
    try {
      window.localStorage.setItem(USER_KEY, JSON.stringify(profile))
    } catch {
      // 隐私模式下写入失败不影响本次登录态
    }
    setLoginOpen(false)
  }

  const handleLogout = () => {
    setUser(null)
    try {
      window.localStorage.removeItem(USER_KEY)
    } catch {
      // 忽略
    }
    setLoginOpen(false)
  }

  // 实时从 MV 派生坐标（useTransform 自动订阅角度变化）
  // 人狗只沿圆周平移、身体始终竖直，绝不随球面法线旋转
  const humanFoot = useTransform(angle, (a: number) => angleToOffset(a, radius))
  const humanFootX = useTransform(humanFoot, (v) => v.x)
  const humanFootY = useTransform(humanFoot, (v) => v.y)
  // 精灵图原始朝向为左，朝右时水平镜像（scaleX = -1）
  const humanScaleX = useTransform(angle, (a: number) => -facingSign(a))

  // 小狗整体比主人超前一个小角度，始终走在牵引绳前端
  const dogAngle = useTransform(angle, (a: number) => a + DOG_LEAD_DEG)
  const dogFoot = useTransform(dogAngle, (a: number) => angleToOffset(a, radius))
  const dogFootX = useTransform(dogFoot, (v) => v.x)
  const dogFootY = useTransform(dogFoot, (v) => v.y)
  const dogScaleX = useTransform(dogAngle, (a: number) => -facingSign(a))

  // 台词气泡挂在狗头顶：所有模块的台词都由小狗来说
  const bubbleX = useTransform(dogFoot, (v) => v.x)
  const bubbleY = useTransform(dogFoot, (v) => v.y - DOG_H - 10)

  // 牵引绳：手 → 项圈，随角度实时重算（两点都贴合球面）
  const [leash, setLeash] = useState({ d: '', clip: { x: 0, y: 0 } })
  useEffect(() => {
    const compute = () => {
      const a = angle.get()
      const dir = facingSign(a)
      const foot = angleToOffset(a, radius)
      const hand = { x: foot.x + HAND_AHEAD * dir, y: foot.y - HAND_HEIGHT }
      const dogFoot = angleToOffset(a + DOG_LEAD_DEG, radius)
      const collar = { x: dogFoot.x + COLLAR_AHEAD * dir, y: dogFoot.y - COLLAR_HEIGHT }
      setLeash({ d: buildLeashPath(hand, collar), clip: collar })
    }
    compute()
    return angle.on('change', compute)
  }, [angle, radius])

  // 键盘快捷键：1-4 直接选择对应模块，减少鼠标移动
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (loginOpen) return
      const idx = ['1', '2', '3', '4', '5', '6'].indexOf(e.key)
      if (idx >= 0) handleIconClick(modules[idx])
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isWalking, activeModule, loginOpen])

  // 动画停止句柄：组件卸载时停掉，避免 onComplete 在卸载后 setState
  const animStopRef = useRef<AnimationPlaybackControls | null>(null)
  useEffect(() => () => { animStopRef.current?.stop() }, [])

  const handleIconClick = (mod: ModuleConfig) => {
    // 行走中或已有活动模块时拦截，防止并发点击
    if (isWalking || activeModule) return
    setIsWalking(true)
    setActiveModule(mod)
    // 记下这次进入的模块，返回地球时人物停在该模块旁
    try {
      window.sessionStorage.setItem(LAST_MODULE_KEY, String(mod.id))
    } catch {
      // 隐私模式下写入失败不影响进入
    }
    animStopRef.current?.stop()
    // isWalking 已保证不会有第二个动画并发，onComplete 里直接弹气泡即可
    animStopRef.current = animate(angle, mod.angle, {
      type: 'spring',
      stiffness: 40,
      damping: 15,
      onComplete: () => {
        setIsWalking(false)
        setBubbleVisible(true)
        animStopRef.current = null
      },
    })
  }

  // 气泡 2.5s → 全屏转场
  useEffect(() => {
    if (!bubbleVisible) return
    const t = setTimeout(() => setIsTransitioning(true), 2500)
    return () => clearTimeout(t)
  }, [bubbleVisible])

  // 转场圆点铺满后 → 小狗冲刺 → 路由跳转
  useEffect(() => {
    if (!isTransitioning || !activeModule) return
    const sprintTimer = setTimeout(() => setIsSprinting(true), 2050)
    const navTimer = setTimeout(() => navigate(activeModule.route), 2450)
    return () => { clearTimeout(sprintTimer); clearTimeout(navTimer) }
  }, [isTransitioning, activeModule, navigate])

  const coverScale =
    typeof window === 'undefined' ? 100 : Math.hypot(window.innerWidth, window.innerHeight) / 2 / 12

  return (
    <ParticlesProvider init={initParticles}>
      <MotionConfig reducedMotion="user">
      <main
        className={`relative flex min-h-screen items-center justify-center overflow-hidden transition-colors duration-700 ${isNight ? 'bg-[#0f172a] text-white' : 'bg-sky-200 text-slate-800'}`}
        aria-label="生态星球首页"
      >
        {/* 天空层：昼夜渐变交叉淡入（渐变无法 transition，用双图层透明度切换，main 底色兜底） */}
        <div
          className="pointer-events-none absolute inset-0 -z-10"
          style={{ background: 'linear-gradient(180deg, #7DD3FC 0%, #BAE6FD 48%, #E0F2FE 100%)' }}
          aria-hidden="true"
        />
        <div
          className="pointer-events-none absolute inset-0 -z-10 transition-opacity duration-700"
          style={{
            background:
              'linear-gradient(180deg, #0B1437 0%, #14264D 55%, #1E3A5F 100%), radial-gradient(ellipse at 68% 28%, rgba(139,92,246,0.12) 0%, transparent 45%)',
            opacity: isNight ? 1 : 0,
          }}
          aria-hidden="true"
        />

        {/* 黑夜：星幕；白天：背景白云缓慢漂移 */}
        {isNight ? <Starfield /> : <DayClouds />}

        {/* 白天：左上角一片暖白阳光，给平涂天空制造纵深 */}
        {!isNight && (
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                'radial-gradient(circle at 14% 4%, rgba(255,252,240,0.9) 0%, rgba(255,255,255,0.35) 30%, transparent 60%)',
            }}
            aria-hidden="true"
          />
        )}

        {/* 夜晚：一轮满月挂在左上，夜空终于有了光源主体（避让右上工具栏） */}
        <AnimatePresence>
          {isNight && (
            <motion.div
              key="moon"
              initial={{ opacity: 0, scale: 0.7, y: -8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ duration: 0.7, ease: 'easeInOut' }}
              className="pointer-events-none absolute left-[12%] top-[9%]"
              aria-hidden="true"
            >
              <div
                className="relative h-14 w-14 rounded-full"
                style={{
                  background:
                    'radial-gradient(circle at 32% 28%, #FFFFFF 0%, #FFF7E6 55%, #F2DCB0 100%)',
                  boxShadow:
                    '0 0 34px 6px rgba(253,230,200,0.4), inset -6px -6px 14px rgba(120,100,60,0.25)',
                }}
              >
                <span className="absolute left-[24%] top-[30%] h-3.5 w-3.5 rounded-full bg-[#EBD9B0]/70" />
                <span className="absolute right-[22%] top-[52%] h-2.5 w-2.5 rounded-full bg-[#EBD9B0]/60" />
                <span className="absolute left-[52%] bottom-[24%] h-2 w-2 rounded-full bg-[#EBD9B0]/55" />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* 夜晚：一道流星斜划，~9s 一周期（CSS 驱动，reduced-motion 不播） */}
        {isNight && (
          <span className="home-shooting-star pointer-events-none absolute right-[16%] top-[14%]" aria-hidden="true" />
        )}

        {/* 品牌层：人物站在正上方，居中标题会被挡住，因此靠左上角放置 */}
        <header className="pointer-events-none absolute left-4 top-4 z-20 sm:left-5">
          <div
            className={`rounded-2xl border px-3.5 py-3 backdrop-blur-md transition-colors duration-700 ${
              isNight
                ? 'border-emerald-200/15 bg-slate-900/45 shadow-[0_10px_30px_rgba(0,0,0,0.35)]'
                : 'border-emerald-900/10 bg-white/55 shadow-[0_10px_30px_rgba(6,78,59,0.12)]'
            }`}
          >
            <div className="flex items-stretch gap-2.5">
              {/* 一束竖直的光，把品牌名和副标题连成一体 */}
              <span
                aria-hidden="true"
                className={`my-0.5 w-[3px] shrink-0 rounded-full bg-gradient-to-b transition-colors duration-700 ${
                  isNight
                    ? 'from-emerald-200 via-emerald-400 to-emerald-500/0'
                    : 'from-emerald-700 via-emerald-600 to-emerald-500/0'
                }`}
              />
              <div>
                <h1
                  className={`bg-gradient-to-r bg-clip-text text-[22px] leading-none font-black tracking-[0.2em] text-transparent ${
                    isNight
                      ? 'from-emerald-50 via-emerald-200 to-teal-200 drop-shadow-[0_0_12px_rgba(52,211,153,0.4)]'
                      : 'from-emerald-900 via-emerald-700 to-teal-600 drop-shadow-[0_1px_0_rgba(255,255,255,0.8)]'
                  }`}
                >
                  川知贝
                </h1>
                <p
                  className={`mt-2 text-[10px] leading-none tracking-[0.16em] transition-colors duration-700 ${
                    isNight ? 'text-emerald-300/80' : 'text-emerald-800/75'
                  }`}
                >
                  让每一只宠物都被温柔照顾
                </p>
                {/* 呼应星球轨道的虚线，末端点一颗小星 */}
                <div aria-hidden="true" className="mt-2.5 flex items-center gap-1.5">
                  <span
                    className={`h-0 flex-1 border-t border-dashed transition-colors duration-700 ${
                      isNight ? 'border-emerald-300/25' : 'border-emerald-700/25'
                    }`}
                  />
                  <span
                    className={`h-1 w-1 rounded-full transition-colors duration-700 ${
                      isNight ? 'bg-emerald-300/70' : 'bg-emerald-700/60'
                    }`}
                  />
                </div>
                {/* 时段标签：把昼夜状态变成可读信息 */}
                <div
                  className={`mt-2.5 inline-flex w-fit items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold transition-colors duration-700 ${
                    isNight ? 'bg-indigo-400/15 text-indigo-200' : 'bg-amber-500/15 text-amber-800'
                  }`}
                >
                  <span
                    className={`h-1.5 w-1.5 rounded-full transition-colors duration-700 ${
                      isNight ? 'bg-indigo-300' : 'bg-amber-500'
                    }`}
                  />
                  {isNight ? '夜晚 · 星空漫步' : '白天 · 散步时间'}
                </div>
              </div>
            </div>
          </div>
        </header>

        {/* 右上工具栏：日夜开关 + 登录入口 */}
        <div className="absolute right-4 top-4 z-30 flex items-center gap-2">
          <ThemeToggle checked={isNight} onChange={setIsNight} />
          <button
            type="button"
            onClick={() => setLoginOpen(true)}
            aria-label={user ? `账号：${user.nickname}` : '登录川知贝'}
            className={`flex h-10 items-center gap-1.5 rounded-full border px-3.5 text-[13px] font-semibold transition-transform hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 ${
              isNight
                ? 'border-white/20 bg-white/10 text-white backdrop-blur'
                : 'border-white bg-white/90 text-slate-700 shadow-sm backdrop-blur'
            }`}
          >
            {user ? (
              <>
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500 text-[11px] font-bold text-white">
                  {user.nickname.slice(0, 1)}
                </span>
                <span className="max-w-[64px] truncate">{user.nickname}</span>
              </>
            ) : (
              <>
                <UserRound size={14} aria-hidden="true" />
                登录
              </>
            )}
          </button>
        </div>

        {/* 精灵图预加载层：让首次切帧不闪白；分两个 div 避免 background-image 互相覆盖 */}
        <div aria-hidden="true" className="sprite-preload-human" />
        <div aria-hidden="true" className="sprite-preload-dog" />

        {/* 轨道容器 */}
        <div className="relative z-10 w-[85vmin] h-[85vmin] max-w-[640px] max-h-[640px]">
          <div className="absolute inset-0 rounded-full border-[1.5px] border-dotted border-white/10" aria-hidden="true" />
          {/* 轨道公转微光：60s 一周（MotionConfig 已让 reduced-motion 用户静止） */}
          <motion.div
            className="pointer-events-none absolute inset-0"
            aria-hidden="true"
            animate={{ rotate: 360 }}
            transition={{ repeat: Infinity, duration: 60, ease: 'linear' }}
          >
            <span
              className="absolute left-1/2 top-0 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full transition-colors duration-700"
              style={{
                backgroundColor: isNight ? '#FDE68A' : '#FFFFFF',
                boxShadow: isNight
                  ? '0 0 10px 3px rgba(253,230,138,0.55)'
                  : '0 0 8px 3px rgba(255,255,255,0.65)',
              }}
            />
          </motion.div>

          {/* 星球：生成贴图（绿丘+河流+云朵）叠加径向渐变打底，外缘大气辉光 */}
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[75vmin] h-[75vmin] max-w-[600px] max-h-[600px]">
            <div
              className="absolute inset-0 rounded-full overflow-hidden"
              style={{
                background: `url('/images/planet_surface.jpg') center/cover, radial-gradient(circle at 30% 30%, #86efac 0%, #22c55e 50%, #166534 100%)`,
                boxShadow: isNight
                  ? '0 0 44px rgba(96,165,250,0.3), 0 0 100px rgba(96,165,250,0.12), inset -16px -16px 50px rgba(0,0,0,0.65)'
                  : '0 0 60px rgba(56,189,248,0.45), 0 0 120px rgba(56,189,248,0.15), inset -16px -16px 50px rgba(0,0,0,0.4)',
                filter: isNight ? 'brightness(0.75)' : 'none',
                transition: 'box-shadow 0.7s, filter 0.7s',
              }}
              aria-hidden="true"
            />
            {/* 昼夜体积光：双图层交叉淡入（白天右上阳光 / 夜晚左上月光 + 反向阴影面；装饰贴图 z-4 始终被照亮） */}
            <div
              className="pointer-events-none absolute inset-0 rounded-full overflow-hidden transition-opacity duration-700"
              style={{
                background:
                  'radial-gradient(circle at 78% 16%, rgba(255,251,235,0.6) 0%, transparent 40%), linear-gradient(295deg, rgba(2,6,23,0.22) 0%, rgba(2,6,23,0.06) 28%, transparent 52%)',
                opacity: isNight ? 0 : 1,
              }}
              aria-hidden="true"
            />
            <div
              className="pointer-events-none absolute inset-0 rounded-full overflow-hidden transition-opacity duration-700"
              style={{
                background:
                  'radial-gradient(circle at 24% 20%, rgba(191,219,254,0.38) 0%, transparent 36%), linear-gradient(115deg, rgba(2,6,23,0.45) 0%, rgba(2,6,23,0.12) 30%, transparent 55%)',
                opacity: isNight ? 1 : 0,
              }}
              aria-hidden="true"
            />

            {/* 星球装饰：树/房子贴地表，云朵白天绕星球漂移、夜晚收进球内 */}
            <PlanetDecor radius={radius} isNight={isNight} />

            {/* 白天：星球左上高光，让球体像被阳光照到而不是一块平面贴图 */}
            {!isNight && (
              <div
                className="pointer-events-none absolute inset-0 rounded-full"
                style={{
                  background:
                    'radial-gradient(circle at 30% 22%, rgba(255,255,255,0.5) 0%, rgba(255,255,255,0.12) 34%, transparent 58%)',
                }}
                aria-hidden="true"
              />
            )}

            {/* 人狗层：锚点在球心 */}
            {/* 用 relative 容器覆盖星球区域，SVG 牵引绳放在这里保证 z 正确 */}
            <div className="absolute inset-0">
              {/* SVG 牵引绳层：放在最上（z-10），但 pointer-events-none
                  放在星球容器里，viewBox 0~星球尺寸，坐标直接用 px */}
              <motion.svg
                className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10"
                width={(radius + 40) * 2}
                height={(radius + 40) * 2}
                viewBox={`${-radius - 40} ${-radius - 40} ${(radius + 40) * 2} ${(radius + 40) * 2}`}
                aria-hidden="true"
              >
                {/* 主绳：浅色描边 + 稍宽底色产生描边感 */}
                <motion.path
                  d={leash.d}
                  fill="none"
                  stroke="#ffffff"
                  strokeWidth={1.5}
                  strokeLinecap="round"
                  strokeOpacity={0.9}
                  style={{ willChange: 'd' }}
                />
                <motion.path
                  d={leash.d}
                  fill="none"
                  stroke="#1e293b"
                  strokeWidth={0.6}
                  strokeLinecap="round"
                  strokeOpacity={0.5}
                />
                {/* 项圈处的小金属扣 */}
                <circle cx={leash.clip.x} cy={leash.clip.y} r={2} fill="#fbbf24" stroke="#92400e" strokeWidth={0.5} />
              </motion.svg>

              {/* ============ 人狗层：沿圆周平移，身体始终竖直（不随球面旋转，杜绝倒走） ============ */}
              {/* 小狗：比主人超前 6°，脚步落在同一圆周上 */}
              <motion.div
                className="pointer-events-none absolute left-1/2 top-1/2 z-[5]"
                style={{ x: dogFootX, y: dogFootY, width: 0, height: 0, willChange: 'transform' }}
                aria-hidden="true"
              >
                <div
                  className="absolute left-0 top-0"
                  style={{ width: DOG_W, height: DOG_H, transform: 'translate(-50%, -100%)' }}
                >
                  <motion.div
                    className={`sprite-dog h-full w-full ${isWalking ? 'walking' : ''}`}
                    style={{
                      // 精灵图默认朝左，朝右时水平镜像；再向下补偿脚底留白
                      scaleX: dogScaleX,
                      y: DOG_FOOT_GAP,
                      willChange: 'background-position',
                    }}
                  />
                </div>
              </motion.div>

              {/* 主人：寻宠模块下 → 气泡弹出瞬间消失 */}
              <AnimatePresence>
                {!(activeModule?.hideHuman && bubbleVisible) && (
                  <motion.div
                    key="human"
                    className="pointer-events-none absolute left-1/2 top-1/2 z-[6]"
                    initial={{ opacity: 1 }}
                    exit={{ opacity: 0, scale: 0.5, transition: { duration: 0.6 } }}
                    style={{ x: humanFootX, y: humanFootY, width: 0, height: 0, willChange: 'transform' }}
                  >
                    <div
                      className="absolute left-0 top-0"
                      style={{ width: HUMAN_W, height: HUMAN_H, transform: 'translate(-50%, -100%)' }}
                    >
                      <motion.div
                        className={`sprite-human h-full w-full ${isWalking ? 'walking' : ''}`}
                        style={{
                          scaleX: humanScaleX,
                          y: HUMAN_FOOT_GAP,
                          // 邻帧"半截人"渗透的裁剪由 sprite.css 逐帧 clip-path 处理
                          willChange: 'background-position',
                        }}
                      />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* 台词气泡：独立层，挂在小狗头顶（所有台词都由小狗来说） */}
              <AnimatePresence>
                {bubbleVisible && activeModule && (
                  <motion.div
                    key="bubble"
                    className="absolute left-1/2 top-1/2 z-20"
                    style={{ x: bubbleX, y: bubbleY, willChange: 'transform' }}
                  >
                    <motion.div
                      className="-translate-x-1/2 -translate-y-full"
                      initial={{ opacity: 0, scale: 0.5 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.5 }}
                      transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                      role="status"
                    >
                      <div className="relative whitespace-nowrap rounded-2xl bg-white/10 backdrop-blur-md border border-white/20 px-4 py-2 text-sm">
                        {activeModule.speech}
                        <span className="absolute left-1/2 top-full -translate-x-1/2 -mt-px block h-3 w-3 rotate-45 border-b border-r border-white/20 bg-white/10" />
                      </div>
                    </motion.div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          {/* 模块入口：浮动胶囊压在球缘（西北→东北→东→东南→西南→西，顺时针＝快捷键 1→6）
              图标 + 名称 + 数字角标收进单件套，白天/黑夜都保持可读 */}
          {modules.map((mod) => {
            const offset = angleToOffset(mod.angle, radius + 24)
            // 小狗说话时，它头顶正好是目标胶囊的位置：把该胶囊淡出，让台词气泡独占这块空间
            const speaking = bubbleVisible && activeModule?.id === mod.id
            return (
              <div
                key={mod.id}
                className="absolute left-1/2 top-1/2 z-10 transition-opacity duration-300"
                style={{
                  transform: `translate(-50%, -50%) translate(${offset.x}px, ${offset.y}px)`,
                  opacity: speaking ? 0 : 1,
                }}
              >
                <button
                  type="button"
                  onClick={() => handleIconClick(mod)}
                  aria-label={`让小伙伴走向${mod.name}（快捷键 ${mod.id}）`}
                  className="module-pill flex cursor-pointer items-center gap-1.5 rounded-full border py-1.5 pl-1.5 pr-2.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 focus-visible:ring-offset-2"
                  style={{
                    ['--sc' as string]: mod.color,
                    backgroundColor: isNight ? 'rgba(15,23,42,0.72)' : 'rgba(255,255,255,0.92)',
                    borderColor: isNight ? `${mod.color}80` : mod.color,
                    color: isNight ? '#e2e8f0' : '#0f172a',
                    backdropFilter: 'blur(8px)',
                  }}
                >
                  <span
                    className="flex h-6 w-6 items-center justify-center rounded-full"
                    style={{ backgroundColor: isNight ? 'rgba(255,255,255,0.10)' : `${mod.color}1f` }}
                  >
                    <mod.icon size={15} style={{ color: mod.color }} aria-hidden="true" />
                  </span>
                  <span className="text-[12px] font-semibold leading-none tracking-tight">{mod.name}</span>
                  <span
                    className="ml-0.5 flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-bold text-white"
                    style={{ backgroundColor: mod.color }}
                    aria-hidden="true"
                  >
                    {mod.id}
                  </span>
                </button>
              </div>
            )
          })}
        </div>

        {/* 全屏转场遮罩 */}
        <motion.div
          className="pointer-events-none fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2 rounded-full"
          style={{
            width: 24,
            height: 24,
            willChange: 'transform',
            // 扩屏圆跟随目标模块主题色；黑夜模式压暗 15% 避免与星空反差过大
            backgroundColor: activeModule?.color ?? '#22c55e',
            filter: isNight ? 'brightness(0.85)' : undefined,
          }}
          initial={false}
          animate={{ scale: isTransitioning ? coverScale : 0 }}
          transition={{ duration: 0.45, ease: 'easeInOut' }}
          aria-hidden="true"
        />
        <AnimatePresence>
          {isTransitioning && (
            <motion.div
              key="transition-loading"
              className="pointer-events-none fixed inset-0 z-[60] flex items-center justify-center"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1, transition: { delay: 0.35, duration: 0.15 } }}
              exit={{ opacity: 0, transition: { duration: 0.1 } }}
            >
              <LoadingRun targetName={activeModule?.name} teaser={activeModule?.teaser} sprint={isSprinting} />
            </motion.div>
          )}
        </AnimatePresence>

        {/* 快捷键提示已内置于各胶囊的数字角标，不再单独占位 */}
        <LoginPanel
          open={loginOpen}
          user={user}
          onClose={() => setLoginOpen(false)}
          onLogin={handleLogin}
          onLogout={handleLogout}
        />
      </main>
      </MotionConfig>
    </ParticlesProvider>
  )
}

export default Home
