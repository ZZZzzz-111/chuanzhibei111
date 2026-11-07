/**
 * 临时遛狗官模块 · 集成测试
 * 覆盖：匹配 → 选定遛狗官 → 信息录入校验 → 保存 → 开始服务 → 实时轨迹同步
 *       → 位置点标记/时间戳 → 轨迹回放 → 结束服务 → 隐私过期状态
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../App'
import { SYNC_INTERVAL_MS, createSession, endSession, stopAllSimulations } from '../services/walkApi'

const START = new Date('2026-01-01T08:00:00').getTime()
const FUTURE = '2099-01-01T10:00'

beforeEach(() => {
  localStorage.clear()
  window.history.pushState({}, '', '/walk')
  vi.useFakeTimers()
  vi.setSystemTime(START)
})

afterEach(() => {
  stopAllSimulations()
  cleanup()
  vi.useRealTimers()
  localStorage.clear()
})

function summonMatched() {
  fireEvent.click(screen.getByRole('button', { name: '召唤 AI 智能匹配' }))
  return act(async () => {
    await vi.advanceTimersByTimeAsync(1600)
  })
}

describe('临时遛狗官 · 全链路集成', () => {
  it('匹配 → 选人 → 校验拦截 → 保存 → 开始服务 → 实时轨迹 → 回放 → 结束服务', async () => {
    render(<App />)

    // 1. 召唤 AI 匹配，三张遛狗官卡片滑入
    await summonMatched()
    expect(screen.getByText(/体育生小王/)).toBeDefined()

    // 2. 选定承接人，瞬间自动填充手机号 + 默认到达时间（无延迟）
    fireEvent.click(screen.getByRole('button', { name: '选择体育生小王作为本次服务承接人' }))
    expect(screen.getByText(/服务信息登记/)).toBeDefined()
    const contactInput = screen.getByLabelText(/联系方式/) as HTMLInputElement
    const arrivalInput = screen.getByLabelText(/可到达时间/) as HTMLInputElement
    expect(contactInput.value).toBe('13812345678') // walker.phone 自动填充
    expect(arrivalInput.value.length).toBeGreaterThan(0) // 默认到达时间也自动填充
    expect(screen.getByText(/已根据.*的资料自动填充/)).toBeDefined()

    // 3. 清空字段后保存 → 非空校验拦截，两条错误提示（证明校验逻辑仍在）
    fireEvent.change(contactInput, { target: { value: '' } })
    fireEvent.change(arrivalInput, { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: /保存信息/ }))
    // 字段级校验错误（联系方式 + 到达时间）+ 顶部 Toast 错误汇总，均带 role="alert"
    expect(screen.getAllByRole('alert').length).toBeGreaterThanOrEqual(2)
    expect(screen.getByText(/请输入联系方式/)).toBeDefined()
    expect(screen.getByText(/请选择可到达时间/)).toBeDefined()

    // 4. 合法信息保存成功
    fireEvent.change(screen.getByLabelText(/联系方式/), { target: { value: '13812345678' } })
    fireEvent.change(screen.getByLabelText(/可到达时间/), { target: { value: FUTURE } })
    fireEvent.click(screen.getByRole('button', { name: /保存信息/ }))
    expect(screen.getByText('✓ 信息已保存')).toBeDefined()
    // 字段级校验错误应已清除（Toast 仍可能在右上角展示，不影响字段校验状态）
    expect(screen.queryByText(/请输入联系方式/)).toBeNull()
    expect(screen.queryByText(/请选择可到达时间/)).toBeNull()

    // 5. 开始服务 → 跳转实时轨迹页
    fireEvent.click(screen.getByRole('button', { name: /确认选定，开始遛狗服务/ }))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(window.location.pathname).toBe('/walk/track')
    expect(screen.getByText('🐕 体育生小王')).toBeDefined()
    expect(screen.getByText(/实时同步中/)).toBeDefined()

    // 6. 实时同步：4 个上报周期（每个 2s）后出现 4 个定位点
    await act(async () => {
      await vi.advanceTimersByTimeAsync(SYNC_INTERVAL_MS * 4)
    })
    const markers = screen.getAllByRole('button', { name: /第 \d+ 站/ })
    expect(markers).toHaveLength(4)

    // 7. 位置点标记 → 点击弹出时间戳气泡
    fireEvent.click(markers[0])
    expect(screen.getByText(/· 📍/)).toBeDefined()

    // 8. 轨迹回放：切到回放模式并播放 3 步（期间实时同步可能追加点位，站点总数用通配匹配）
    fireEvent.click(screen.getByRole('button', { name: /轨迹回放/ }))
    fireEvent.click(screen.getByRole('button', { name: '播放回放' }))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(700 * 3)
    })
    expect(screen.getByText(/第 4\/\d+ 站/)).toBeDefined()

    // 9. 结束服务 → 状态切换为已结束，出现安全送达卡片 + 精确时间（YYYY-MM-DD HH:mm）
    fireEvent.click(screen.getByRole('button', { name: '结束本次遛狗服务' }))
    expect(screen.getByText(/服务已结束 · 可回放/)).toBeDefined()
    expect(screen.getByText(/已将狗狗安全送回/)).toBeDefined()
    expect(screen.getByText(/安全送达时间/)).toBeDefined()
    // 历史服务面板应能查到这一单的返回时间（持久化可追溯）
    fireEvent.click(screen.getByRole('button', { name: /历史服务记录/ }))
    expect(screen.getByText(/✅ 安全送达：/)).toBeDefined()
  }, 15000)

  it('Walk 页展示最近服务横幅（24h 保留期内）并可跳转轨迹页', async () => {
    const { session } = createSession({
      walkerId: 1,
      walkerName: '体育生小王',
      contact: '13812345678',
      arrivalTime: FUTURE,
    })
    endSession(session!.id)

    window.history.pushState({}, '', '/walk')
    render(<App />)
    expect(screen.getByText(/轨迹还在 24 小时保留期内/)).toBeDefined()

    fireEvent.click(screen.getByRole('button', { name: /查看实时轨迹/ }))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(window.location.pathname).toBe('/walk/track')
    expect(screen.getByText(/可回放/)).toBeDefined()
  })

  it('无服务时轨迹页展示可爱的空状态引导', () => {
    window.history.pushState({}, '', '/walk/track')
    render(<App />)
    expect(screen.getByText(/还没有进行中的遛狗服务/)).toBeDefined()
    expect(screen.getByRole('link', { name: /去召唤遛狗官/ })).toBeDefined()
  })

  it('服务结束超过 24 小时：轨迹不可查看且数据被物理删除', () => {
    const { session } = createSession({
      walkerId: 2,
      walkerName: '爱狗阿姨',
      contact: '13812345678',
      arrivalTime: FUTURE,
    })
    endSession(session!.id)

    // 模拟时间流逝：把结束时间拨回到 25 小时前
    const raw = JSON.parse(localStorage.getItem('cb_walk_sessions') ?? '[]')
    raw[0].endedAt = START - 25 * 60 * 60 * 1000
    localStorage.setItem('cb_walk_sessions', JSON.stringify(raw))

    window.history.pushState({}, '', '/walk/track')
    render(<App />)
    expect(screen.getByText(/隐私保护期已过/)).toBeDefined()
    expect(screen.getByText(/已自动删除/)).toBeDefined()
    expect(screen.queryAllByRole('button', { name: /第 \d+ 站/ })).toHaveLength(0)
    expect(JSON.parse(localStorage.getItem('cb_walk_sessions') ?? '[]')).toHaveLength(0)
  })
})
