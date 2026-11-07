/**
 * 模拟后端 API 层（临时遛狗官模块）
 *
 * 真实项目中这里是 Express/Nest 服务 + 数据库；演示环境下用 localStorage
 * 充当"服务端存储"，对外暴露与 HTTP 接口同构的函数签名，未来可无缝替换为 fetch。
 *
 * 职责：
 * 1. 会话管理：选定遛狗官后创建服务会话，联系信息可编辑保存（带校验）
 * 2. 轨迹数据：按时间序列（ts 单调递增）存储定位点，由模拟器每 2s 上报一个点
 * 3. 隐私合规：轨迹仅在「服务进行中」及「结束后 24 小时内」可查看，
 *    过期后轨迹数据被物理删除（仅保留不含轨迹/联系方式的墓碑记录用于提示）
 */

/* ============ 类型 ============ */

export type SessionStatus = 'active' | 'ended'

/** 单个定位点（时间序列中的一个样本） */
export interface TrackPoint {
  /** 上报时间戳（ms），时间序列主键 */
  ts: number
  /** 地图横向位置（百分比 0-100，演示用虚拟坐标系） */
  x: number
  /** 地图纵向位置（百分比 0-100） */
  y: number
  /** 位置名称 */
  label: string
}

/** 计划路线的站点 */
export interface RouteStop {
  x: number
  y: number
  label: string
}

/** 遛狗官候选人（含默认资料，选中时可自动填充） */
export interface Walker {
  id: number
  emoji: string
  name: string
  desc: string
  tags: string[]
  /** AI 匹配度的基准分（宠物状态会微调） */
  base: number
  /** 系统预置的手机号，选中 TA 时自动填入表单，用户可覆盖 */
  phone: string
  /** 默认到达时间 = 当前时间 + defaultArrivalMinutes 分钟（分钟精度） */
  defaultArrivalMinutes: number
}

export const WALKERS: Walker[] = [
  {
    id: 1, emoji: '🏃', name: '体育生小王', desc: '体院在读 · 陪跑冠军',
    tags: ['距离 500m', '擅长大型犬', '五星好评 ⭐4.9'], base: 98,
    phone: '13812345678', defaultArrivalMinutes: 15,
  },
  {
    id: 2, emoji: '👩‍🦳', name: '爱狗阿姨', desc: '养狗 20 年 · 自家小院',
    tags: ['距离 800m', '持证上岗', '五星好评 ⭐4.8'], base: 92,
    phone: '13987654321', defaultArrivalMinutes: 25,
  },
  {
    id: 3, emoji: '🎖️', name: '退役军犬训导员', desc: '行为矫正 · 治愈系大师',
    tags: ['距离 1.2km', '社恐犬克星', '五星好评 ⭐5.0'], base: 87,
    phone: '13765432109', defaultArrivalMinutes: 20,
  },
]

/** 一次遛狗服务会话（对应后端的一行记录） */
export interface WalkSession {
  id: string
  walkerId: number
  walkerName: string
  /** 联系方式（敏感字段，只存"服务端"，对外只暴露脱敏值） */
  contact: string
  /** 可到达时间（datetime-local 格式：YYYY-MM-DDTHH:mm） */
  arrivalTime: string
  status: SessionStatus
  createdAt: number
  endedAt: number | null
  /** 狗狗被安全送回的时间（精确到分钟）：服务结束瞬间写入 */
  returnedAt: number | null
  /** 已上报的轨迹点数量（= track.length，用于刷新后续跑模拟器） */
  routeIndex: number
  /** 轨迹时间序列，ts 严格递增 */
  track: TrackPoint[]
}

/** 前端填写但尚未开始服务的草稿（每位遛狗官一份） */
export interface SessionDraft {
  contact: string
  arrivalTime: string
  saved: boolean
}

/** 轨迹查看视图：平台端拿到的全部数据（隐私过滤之后） */
export interface TrackView {
  sessionId: string | null
  allowed: boolean
  /** 不可查看的原因：no_session=无服务，expired=隐私保护期已过 */
  reason: 'no_session' | 'expired' | null
  walkerName: string
  status: SessionStatus | null
  /** 脱敏后的联系方式（如 138****5678），过期时不返回 */
  contactMasked: string
  arrivalTime: string
  createdAt: number | null
  endedAt: number | null
  /** 狗狗被安全送回的时间（精确到分钟），进行中为 null */
  returnedAt: number | null
  /** 轨迹保留截止时间（结束后 24h），进行中为 null */
  retainedUntil: number | null
  /** 已上报的轨迹点（时间序列） */
  points: TrackPoint[]
  /** 完整计划路线（用于绘制"待走"虚线） */
  plannedRoute: RouteStop[]
}

export interface FieldErrors {
  contact: string | null
  arrivalTime: string | null
}

export interface OperationResult {
  ok: boolean
  errors: FieldErrors
}

/* ============ 时间工具（全站统一 YYYY-MM-DD HH:mm 展示） ============ */

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

/** 时间戳 → 统一展示格式：2026-11-05 18:32（精确到分钟） */
export function fmtDateTime(ts: number | null | undefined): string {
  if (ts === null || ts === undefined || Number.isNaN(ts)) return '--'
  const d = new Date(ts)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** datetime-local 输入值 → 展示格式：把 T 换成空格 */
export function fmtLocal(value: string): string {
  return value.trim().replace('T', ' ')
}

/**
 * 计算"X 分钟后"的可到达时间，格式化为 datetime-local 字符串。
 * 用于选中遛狗官时自动填充表单，瞬间完成，无延迟。
 */
export function getUpcomingArrival(minutes: number, now: number = Date.now()): string {
  const d = new Date(now + minutes * 60_000)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/* ============ 常量 ============ */

const SESSIONS_KEY = 'cb_walk_sessions'
const DRAFTS_KEY = 'cb_walk_drafts'
const TOMBSTONES_KEY = 'cb_walk_expired_tombstones'

/** 隐私窗口：服务结束后轨迹可保留 24 小时 */
export const PRIVACY_WINDOW_MS = 24 * 60 * 60 * 1000

/** 轨迹上报/前端轮询间隔：2s，远低于「延迟不超过 10s」的要求 */
export const SYNC_INTERVAL_MS = 2000

/** 计划路线（虚拟公园坐标系）：家门口 → 公园 → 回家 */
const WALK_ROUTE: RouteStop[] = [
  { x: 10, y: 88, label: '主人家门口' },
  { x: 24, y: 72, label: '小区南门' },
  { x: 38, y: 60, label: '樱花小道' },
  { x: 52, y: 52, label: '中央草坪' },
  { x: 47, y: 36, label: '宠物饮水站' },
  { x: 62, y: 26, label: '观景平台' },
  { x: 76, y: 34, label: '平缓步道' },
  { x: 84, y: 52, label: '社区花园' },
  { x: 72, y: 70, label: '梧桐大道' },
  { x: 52, y: 82, label: '回家路' },
  { x: 10, y: 88, label: '平安到家' },
]

/** 相邻站点之间插值步数（让轨迹看起来是连续走出来的） */
const STEPS_PER_SEGMENT = 4

/** 完整插值后的计划路线（1 + 10 段 × 4 步 = 41 个点） */
const PLANNED_ROUTE: RouteStop[] = buildPlannedRoute()

function buildPlannedRoute(): RouteStop[] {
  const out: RouteStop[] = [{ ...WALK_ROUTE[0] }]
  for (let i = 0; i < WALK_ROUTE.length - 1; i++) {
    const a = WALK_ROUTE[i]
    const b = WALK_ROUTE[i + 1]
    for (let s = 1; s <= STEPS_PER_SEGMENT; s++) {
      const t = s / STEPS_PER_SEGMENT
      out.push({
        x: Math.round((a.x + (b.x - a.x) * t) * 10) / 10,
        y: Math.round((a.y + (b.y - a.y) * t) * 10) / 10,
        label: s === STEPS_PER_SEGMENT ? b.label : a.label,
      })
    }
  }
  return out
}

/* ============ 字段校验（非空 + 格式） ============ */

/** 联系方式校验：非空 + 11 位大陆手机号。返回 null 表示通过，否则为错误文案 */
export function validateContact(value: string): string | null {
  const v = value.trim()
  if (!v) return '请输入联系方式'
  if (!/^1[3-9]\d{9}$/.test(v)) return '请输入 11 位大陆手机号，如 13812345678'
  return null
}

/** 可到达时间校验：非空 + datetime-local 格式 + 不早于当前时间 */
export function validateArrivalTime(value: string): string | null {
  if (!value.trim()) return '请选择可到达时间'
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value)) return '时间格式不正确（应为 YYYY-MM-DD HH:mm）'
  const t = Date.parse(value)
  if (Number.isNaN(t)) return '不是有效的时间'
  if (t < Date.now() - 60_000) return '可到达时间不能早于当前时间'
  return null
}

/* ============ 存储（模拟服务端数据库） ============ */

function loadJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

function saveJSON(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* 存储被禁用等场景下静默失败，不影响演示 */
  }
}

function loadSessions(): WalkSession[] {
  const raw = loadJSON<unknown>(SESSIONS_KEY, [])
  // 旧版本 localStorage 可能缺字段（如 returnedAt），做一次结构归一化，
  // 避免渲染层 undefined 误判"已送达"或 NaN
  if (!Array.isArray(raw)) return []
  return raw
    .filter((s): s is Partial<WalkSession> => s !== null && typeof s === 'object')
    .map<WalkSession>((s) => ({
      id: typeof s.id === 'string' ? s.id : `walk_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      walkerId: typeof s.walkerId === 'number' ? s.walkerId : 0,
      walkerName: typeof s.walkerName === 'string' ? s.walkerName : '未知遛狗官',
      contact: typeof s.contact === 'string' ? s.contact : '',
      arrivalTime: typeof s.arrivalTime === 'string' ? s.arrivalTime : '',
      status: s.status === 'active' || s.status === 'ended' ? s.status : 'ended',
      createdAt: typeof s.createdAt === 'number' ? s.createdAt : Date.now(),
      endedAt: typeof s.endedAt === 'number' ? s.endedAt : null,
      returnedAt: typeof s.returnedAt === 'number' ? s.returnedAt : null,
      routeIndex: typeof s.routeIndex === 'number' ? s.routeIndex : 0,
      track: Array.isArray(s.track) ? s.track : [],
    }))
}

function saveSessions(sessions: WalkSession[]): void {
  saveJSON(SESSIONS_KEY, sessions)
}

function findSession(id: string): WalkSession | null {
  return loadSessions().find((s) => s.id === id) ?? null
}

/* ============ 草稿：录入信息的编辑与保存 ============ */

export function getWalkerDraft(walkerId: number): SessionDraft {
  const drafts = loadJSON<Record<string, SessionDraft>>(DRAFTS_KEY, {})
  return drafts[String(walkerId)] ?? { contact: '', arrivalTime: '', saved: false }
}

/** 保存前校验，非法输入直接拒绝并返回逐字段错误 */
export function saveWalkerDraft(
  walkerId: number,
  draft: { contact: string; arrivalTime: string }
): OperationResult {
  const contactErr = validateContact(draft.contact)
  const arrivalErr = validateArrivalTime(draft.arrivalTime)
  if (contactErr || arrivalErr) {
    return { ok: false, errors: { contact: contactErr, arrivalTime: arrivalErr } }
  }
  const drafts = loadJSON<Record<string, SessionDraft>>(DRAFTS_KEY, {})
  drafts[String(walkerId)] = { contact: draft.contact.trim(), arrivalTime: draft.arrivalTime, saved: true }
  saveJSON(DRAFTS_KEY, drafts)
  return { ok: true, errors: { contact: null, arrivalTime: null } }
}

/* ============ 会话 CRUD ============ */

export interface CreateSessionInput {
  walkerId: number
  walkerName: string
  contact: string
  arrivalTime: string
}

export function createSession(input: CreateSessionInput): OperationResult & { session: WalkSession | null } {
  const contactErr = validateContact(input.contact)
  const arrivalErr = validateArrivalTime(input.arrivalTime)
  if (contactErr || arrivalErr) {
    return { ok: false, errors: { contact: contactErr, arrivalTime: arrivalErr }, session: null }
  }
  const sessions = loadSessions()
  // 平台约束：同一时间只允许一个进行中的服务，旧的自动结束（结束即视为安全送回）
  for (const s of sessions) {
    if (s.status === 'active') {
      s.status = 'ended'
      s.endedAt = Date.now()
      s.returnedAt = s.endedAt
      stopTrackSimulation(s.id)
    }
  }
  const session: WalkSession = {
    id: `walk_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    walkerId: input.walkerId,
    walkerName: input.walkerName,
    contact: input.contact.trim(),
    arrivalTime: input.arrivalTime,
    status: 'active',
    createdAt: Date.now(),
    endedAt: null,
    returnedAt: null,
    routeIndex: 0,
    track: [],
  }
  sessions.push(session)
  saveSessions(sessions)
  return { ok: true, errors: { contact: null, arrivalTime: null }, session }
}

/** 服务进行中允许修正联系信息（编辑 + 保存），结束后锁定 */
export function updateSessionInfo(
  sessionId: string,
  patch: Partial<Pick<CreateSessionInput, 'contact' | 'arrivalTime'>>
): OperationResult {
  const sessions = loadSessions()
  const s = sessions.find((x) => x.id === sessionId)
  if (!s) return { ok: false, errors: { contact: '服务不存在', arrivalTime: null } }
  if (s.status !== 'active') {
    return { ok: false, errors: { contact: '服务已结束，信息不可再修改', arrivalTime: null } }
  }
  const contactErr = patch.contact !== undefined ? validateContact(patch.contact) : null
  const arrivalErr = patch.arrivalTime !== undefined ? validateArrivalTime(patch.arrivalTime) : null
  if (contactErr || arrivalErr) {
    return { ok: false, errors: { contact: contactErr, arrivalTime: arrivalErr } }
  }
  if (patch.contact !== undefined) s.contact = patch.contact.trim()
  if (patch.arrivalTime !== undefined) s.arrivalTime = patch.arrivalTime
  saveSessions(sessions)
  return { ok: true, errors: { contact: null, arrivalTime: null } }
}

export function endSession(sessionId: string): WalkSession | null {
  const sessions = loadSessions()
  const s = sessions.find((x) => x.id === sessionId)
  if (!s || s.status === 'ended') return s ?? null
  const now = Date.now()
  s.status = 'ended'
  s.endedAt = now
  s.returnedAt = now // 手动结束时也视为狗狗被安全送回
  saveSessions(sessions)
  stopTrackSimulation(s.id)
  return s
}

export function getActiveSession(): WalkSession | null {
  return loadSessions().find((s) => s.status === 'active') ?? null
}

export function getLatestSession(): WalkSession | null {
  return loadSessions().sort((a, b) => b.createdAt - a.createdAt)[0] ?? null
}

/** 获取全部可查询的历史会话（按创建时间倒序，不包含已被隐私清理的） */
export function getAllSessions(): WalkSession[] {
  return loadSessions().sort((a, b) => b.createdAt - a.createdAt)
}

/* ============ 轨迹：时间序列写入 ============ */

/**
 * 追加一个定位点。ts 取当前时间，天然单调递增；
 * 走完全程自动结束服务（隐私 24h 窗口从此刻起算）。
 */
export function appendTrackPoint(sessionId: string): TrackPoint | null {
  const sessions = loadSessions()
  const s = sessions.find((x) => x.id === sessionId)
  if (!s || s.status !== 'active' || s.routeIndex >= PLANNED_ROUTE.length) return null
  const wp = PLANNED_ROUTE[s.routeIndex]
  const point: TrackPoint = { ts: Date.now(), x: wp.x, y: wp.y, label: wp.label }
  s.track.push(point)
  s.routeIndex = s.track.length
  if (s.routeIndex >= PLANNED_ROUTE.length) {
    const now = Date.now()
    s.status = 'ended'
    s.endedAt = now
    s.returnedAt = now // 走完全程 → 狗狗被安全送回，精确到秒
  }
  saveSessions(sessions)
  return point
}

/* ============ 轨迹模拟器（代替遛狗官手机端的 GPS 上报） ============ */

// 挂到 globalThis：HMR 热更新重载模块时不会产生重复的定时器与僵尸句柄
const globalScope = globalThis as unknown as {
  __cbWalkActiveSims?: Set<string>
  __cbWalkTimers?: Map<string, ReturnType<typeof setInterval>>
}
const activeSims: Set<string> = (globalScope.__cbWalkActiveSims ??= new Set())
const timers: Map<string, ReturnType<typeof setInterval>> = (globalScope.__cbWalkTimers ??= new Map())

export function startTrackSimulation(sessionId: string): void {
  const s = findSession(sessionId)
  if (!s || s.status !== 'active' || s.routeIndex >= PLANNED_ROUTE.length) return
  if (activeSims.has(sessionId)) return
  activeSims.add(sessionId)
  const timer = setInterval(() => {
    const point = appendTrackPoint(sessionId)
    if (!point) stopTrackSimulation(sessionId)
  }, SYNC_INTERVAL_MS)
  timers.set(sessionId, timer)
}

/** 页面刷新后恢复模拟：已走完的点不重复补发，从断点继续 */
export function ensureTrackSimulation(sessionId: string): void {
  startTrackSimulation(sessionId)
}

export function stopTrackSimulation(sessionId: string): void {
  const timer = timers.get(sessionId)
  if (timer) clearInterval(timer)
  timers.delete(sessionId)
  activeSims.delete(sessionId)
}

/** 测试/清理用：停掉全部模拟器 */
export function stopAllSimulations(): void {
  for (const id of [...activeSims]) stopTrackSimulation(id)
}

/* ============ 隐私合规 ============ */

export function canViewTrack(s: WalkSession, now: number = Date.now()): boolean {
  if (s.status === 'active') return true
  return s.endedAt !== null && now - s.endedAt <= PRIVACY_WINDOW_MS
}

/** 联系方式脱敏：138****5678 */
function maskContact(contact: string): string {
  if (/^1[3-9]\d{9}$/.test(contact)) return `${contact.slice(0, 3)}****${contact.slice(7)}`
  return `${contact.slice(0, 2)}****`
}

interface Tombstone {
  id: string
  walkerName: string
  endedAt: number
  prunedAt: number
}

/**
 * 清理过期轨迹：物理删除超过 24h 的会话数据（隐私要求），
 * 只保留不含轨迹/联系方式的"墓碑"用于前端友好提示，墓碑本身 48h 后也删除。
 */
export function pruneExpiredSessions(now: number = Date.now()): void {
  const sessions = loadSessions()
  const kept: WalkSession[] = []
  const expired: WalkSession[] = []
  for (const s of sessions) {
    if (canViewTrack(s, now)) kept.push(s)
    else expired.push(s)
  }
  if (expired.length > 0) {
    const tombs = loadJSON<Tombstone[]>(TOMBSTONES_KEY, [])
    for (const s of expired) {
      tombs.push({ id: s.id, walkerName: s.walkerName, endedAt: s.endedAt ?? now, prunedAt: now })
    }
    saveJSON(TOMBSTONES_KEY, tombs.filter((t) => now - t.prunedAt <= PRIVACY_WINDOW_MS).slice(-10))
    saveSessions(kept)
  }
}

function emptyView(reason: 'no_session' | 'expired', walkerName = ''): TrackView {
  return {
    sessionId: null,
    allowed: false,
    reason,
    walkerName,
    status: null,
    contactMasked: '',
    arrivalTime: '',
    createdAt: null,
    endedAt: null,
    returnedAt: null,
    retainedUntil: null,
    points: [],
    plannedRoute: [],
  }
}

/**
 * 平台端获取最新一条可查看的轨迹。
 * 隐私过滤：过期会话不返回轨迹点与联系方式，仅返回"保护期已过"的状态。
 */
export function getLatestTrackView(now: number = Date.now()): TrackView {
  pruneExpiredSessions(now)
  const sessions = loadSessions().sort((a, b) => b.createdAt - a.createdAt)
  if (sessions.length === 0) {
    const tombs = loadJSON<Tombstone[]>(TOMBSTONES_KEY, [])
    // 按 endedAt 倒序取最近一条，而不是 prunedAt（同一批次 prunedAt 相同）
    const latestTomb = tombs.sort((a, b) => b.endedAt - a.endedAt)[0]
    if (latestTomb) return emptyView('expired', latestTomb.walkerName)
    return emptyView('no_session')
  }
  // pruneExpiredSessions 已保证 sessions 中只剩可查看项，无需再判 canViewTrack
  const latest = sessions[0]
  return {
    sessionId: latest.id,
    allowed: true,
    reason: null,
    walkerName: latest.walkerName,
    status: latest.status,
    contactMasked: maskContact(latest.contact),
    arrivalTime: latest.arrivalTime,
    createdAt: latest.createdAt,
    endedAt: latest.endedAt,
    returnedAt: latest.returnedAt,
    retainedUntil: latest.status === 'ended' && latest.endedAt !== null ? latest.endedAt + PRIVACY_WINDOW_MS : null,
    points: latest.track,
    plannedRoute: PLANNED_ROUTE,
  }
}

/* ============ 模块初始化 ============ */

// 服务端冷启动要做的事：清掉过期数据，恢复未完成服务的轨迹上报
pruneExpiredSessions()
for (const s of loadSessions()) {
  if (s.status === 'active') ensureTrackSimulation(s.id)
}
