import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  PRIVACY_WINDOW_MS,
  SYNC_INTERVAL_MS,
  appendTrackPoint,
  canViewTrack,
  createSession,
  endSession,
  getActiveSession,
  getLatestSession,
  getLatestTrackView,
  getWalkerDraft,
  saveWalkerDraft,
  startTrackSimulation,
  stopAllSimulations,
  updateSessionInfo,
  validateArrivalTime,
  validateContact,
  type WalkSession,
} from './walkApi'

/** 演示用的固定"当前时间" */
const START = new Date('2026-01-01T08:00:00').getTime()
/** 一个永远合法的可到达时间 */
const FUTURE = '2099-01-01T10:00'

function seedSession(contact = '13812345678') {
  return createSession({ walkerId: 1, walkerName: '体育生小王', contact, arrivalTime: FUTURE })
}

function makeSession(over: Partial<WalkSession> = {}): WalkSession {
  return {
    id: 't1',
    walkerId: 1,
    walkerName: '体育生小王',
    contact: '13812345678',
    arrivalTime: FUTURE,
    status: 'active',
    createdAt: START,
    endedAt: null,
    returnedAt: null,
    routeIndex: 0,
    track: [],
    ...over,
  }
}

function storedSessions(): WalkSession[] {
  return JSON.parse(localStorage.getItem('cb_walk_sessions') ?? '[]') as WalkSession[]
}

beforeEach(() => {
  localStorage.clear()
  vi.useFakeTimers()
  vi.setSystemTime(START)
})

afterEach(() => {
  stopAllSimulations()
  vi.useRealTimers()
  localStorage.clear()
})

/* ============ 字段校验 ============ */

describe('字段校验：联系方式', () => {
  it('非空校验', () => {
    expect(validateContact('')).toBe('请输入联系方式')
    expect(validateContact('   ')).toBe('请输入联系方式')
  })

  it('格式校验：必须是 11 位大陆手机号', () => {
    expect(validateContact('12345')).toMatch(/11 位/)
    expect(validateContact('23812345678')).toMatch(/11 位/)
    expect(validateContact('1381234567a')).toMatch(/11 位/)
  })

  it('合法手机号通过（含首尾空格）', () => {
    expect(validateContact('13812345678')).toBeNull()
    expect(validateContact(' 13812345678 ')).toBeNull()
  })
})

describe('字段校验：可到达时间', () => {
  it('非空校验', () => {
    expect(validateArrivalTime('')).toBe('请选择可到达时间')
  })

  it('格式校验', () => {
    expect(validateArrivalTime('2026/01/01 08:00')).toMatch(/格式/)
    expect(validateArrivalTime('not-a-date')).toMatch(/格式/)
  })

  it('不能早于当前时间', () => {
    expect(validateArrivalTime('2020-01-01T08:00')).toMatch(/不能早于/)
  })

  it('合法未来时间通过', () => {
    expect(validateArrivalTime(FUTURE)).toBeNull()
  })
})

/* ============ 草稿的编辑与保存 ============ */

describe('服务信息草稿（编辑 + 保存）', () => {
  it('非法输入被拒绝，草稿不落库', () => {
    const res = saveWalkerDraft(1, { contact: '', arrivalTime: '' })
    expect(res.ok).toBe(false)
    expect(res.errors.contact).toMatch(/请输入联系方式/)
    expect(res.errors.arrivalTime).toMatch(/请选择/)
    expect(getWalkerDraft(1).saved).toBe(false)
  })

  it('合法输入保存成功并可重复读取（持久化）', () => {
    expect(saveWalkerDraft(1, { contact: ' 13812345678 ', arrivalTime: FUTURE }).ok).toBe(true)
    const draft = getWalkerDraft(1)
    expect(draft.saved).toBe(true)
    expect(draft.contact).toBe('13812345678')
    expect(draft.arrivalTime).toBe(FUTURE)
  })

  it('再次编辑保存会覆盖旧值', () => {
    saveWalkerDraft(1, { contact: '13812345678', arrivalTime: FUTURE })
    saveWalkerDraft(1, { contact: '13987654321', arrivalTime: '2099-06-01T09:30' })
    const draft = getWalkerDraft(1)
    expect(draft.contact).toBe('13987654321')
    expect(draft.arrivalTime).toBe('2099-06-01T09:30')
  })
})

/* ============ 会话 CRUD ============ */

describe('服务会话', () => {
  it('创建会话：字段完整、初始状态正确', () => {
    const { ok, session } = seedSession()
    expect(ok).toBe(true)
    expect(session).not.toBeNull()
    expect(session!.status).toBe('active')
    expect(session!.contact).toBe('13812345678')
    expect(session!.track).toEqual([])
    expect(session!.routeIndex).toBe(0)
    expect(getActiveSession()?.id).toBe(session!.id)
  })

  it('非法字段直接拒绝创建', () => {
    const res = createSession({ walkerId: 1, walkerName: '体育生小王', contact: '123', arrivalTime: FUTURE })
    expect(res.ok).toBe(false)
    expect(res.session).toBeNull()
    expect(getActiveSession()).toBeNull()
  })

  it('同一时间只允许一个进行中的服务：新单自动结束旧单', () => {
    const first = seedSession().session!
    const second = seedSession().session!
    const stored = storedSessions()
    const firstRow = stored.find((s) => s.id === first.id)
    expect(firstRow?.status).toBe('ended')
    expect(firstRow?.endedAt).toBe(START)
    expect(getActiveSession()?.id).toBe(second.id)
  })

  it('服务进行中允许修正联系信息（编辑 + 保存），结束后锁定', () => {
    const s = seedSession().session!
    expect(updateSessionInfo(s.id, { contact: '13987654321' }).ok).toBe(true)
    expect(getLatestTrackView().contactMasked).toBe('139****4321')

    // 非法修改被整体拒绝，旧值保持不变
    const bad = updateSessionInfo(s.id, { contact: '123' })
    expect(bad.ok).toBe(false)
    expect(getLatestTrackView().contactMasked).toBe('139****4321')

    // 结束后不可再修改
    endSession(s.id)
    const locked = updateSessionInfo(s.id, { arrivalTime: FUTURE })
    expect(locked.ok).toBe(false)
    expect(locked.errors.contact).toMatch(/已结束/)
  })
})

/* ============ 轨迹时间序列 ============ */

describe('轨迹时间序列存储', () => {
  it('定位点按时间戳严格递增追加', () => {
    const s = seedSession().session!
    const p1 = appendTrackPoint(s.id)
    vi.setSystemTime(START + SYNC_INTERVAL_MS)
    const p2 = appendTrackPoint(s.id)
    vi.setSystemTime(START + SYNC_INTERVAL_MS * 2)
    const p3 = appendTrackPoint(s.id)

    expect(p1!.ts).toBe(START)
    expect(p2!.ts).toBe(START + SYNC_INTERVAL_MS)
    expect(p3!.ts).toBe(START + SYNC_INTERVAL_MS * 2)

    const points = getLatestTrackView().points
    expect(points.map((p) => p.ts)).toEqual([START, START + SYNC_INTERVAL_MS, START + SYNC_INTERVAL_MS * 2])
    expect(points[0].label).toBe('主人家门口')
  })

  it('走完全程自动结束服务（41 个定位点 = 完整计划路线）', () => {
    const s = seedSession().session!
    let appended = 0
    for (let i = 0; i < 100; i++) {
      if (appendTrackPoint(s.id) === null) break
      appended++
    }
    // 计划路线 1 个起点 + 10 段 × 4 步 = 41 个点
    expect(appended).toBe(41)
    const latest = getLatestSession()
    expect(latest?.status).toBe('ended')
    expect(latest?.endedAt).toBe(START)
  })

  it('轨迹模拟器按 2s 节奏上报，走完后自动停表', () => {
    const { session } = seedSession()
    startTrackSimulation(session!.id)
    vi.advanceTimersByTime(SYNC_INTERVAL_MS)
    expect(getLatestTrackView().points).toHaveLength(1)

    vi.advanceTimersByTime(41 * SYNC_INTERVAL_MS)
    expect(getLatestTrackView().points).toHaveLength(41)
    expect(getLatestTrackView().status).toBe('ended')

    // 结束后定时器自清，不再产生新点
    vi.advanceTimersByTime(SYNC_INTERVAL_MS * 5)
    expect(getLatestTrackView().points).toHaveLength(41)
  })

  it('stopAllSimulations 可随时停止上报', () => {
    const { session } = seedSession()
    startTrackSimulation(session!.id)
    stopAllSimulations()
    vi.advanceTimersByTime(SYNC_INTERVAL_MS * 5)
    expect(getLatestTrackView().points).toHaveLength(0)
  })
})

/* ============ 隐私合规 ============ */

describe('隐私合规：24 小时轨迹窗口', () => {
  it('进行中的服务可查看，联系方式脱敏展示', () => {
    seedSession()
    const view = getLatestTrackView()
    expect(view.allowed).toBe(true)
    expect(view.contactMasked).toBe('138****5678')
    expect(view.retainedUntil).toBeNull()
  })

  it('结束后 24 小时内仍可查看，并返回保留截止时间', () => {
    const s = seedSession().session!
    endSession(s.id)
    vi.setSystemTime(START + 60 * 60 * 1000) // 1 小时后
    const view = getLatestTrackView()
    expect(view.allowed).toBe(true)
    expect(view.retainedUntil).toBe(START + PRIVACY_WINDOW_MS)
  })

  it('canViewTrack 边界：恰好 24 小时可见，超过即不可见', () => {
    const ended = makeSession({ status: 'ended', endedAt: START - PRIVACY_WINDOW_MS })
    expect(canViewTrack(ended, START)).toBe(true)
    expect(canViewTrack(ended, START + 1)).toBe(false)
    expect(canViewTrack(makeSession(), START)).toBe(true)
  })

  it('超过 24 小时：轨迹物理删除，仅保留墓碑用于提示', () => {
    const s = seedSession().session!
    endSession(s.id)
    vi.setSystemTime(START + PRIVACY_WINDOW_MS + 60 * 60 * 1000) // 25 小时后

    const view = getLatestTrackView() // 内部会触发 pruneExpiredSessions
    expect(view.allowed).toBe(false)
    expect(view.reason).toBe('expired')
    expect(view.points).toEqual([])
    expect(view.walkerName).toBe('体育生小王')

    // 会话记录（含轨迹与联系方式）已被删除，只剩无敏感信息的墓碑
    expect(storedSessions()).toHaveLength(0)
    const tombs = JSON.parse(localStorage.getItem('cb_walk_expired_tombstones') ?? '[]')
    expect(tombs).toHaveLength(1)
    expect(tombs[0].walkerName).toBe('体育生小王')
    expect(tombs[0]).not.toHaveProperty('track')
    expect(tombs[0]).not.toHaveProperty('contact')
  })

  it('完全无数据时返回 no_session 空视图', () => {
    const view = getLatestTrackView()
    expect(view.allowed).toBe(false)
    expect(view.reason).toBe('no_session')
  })
})
