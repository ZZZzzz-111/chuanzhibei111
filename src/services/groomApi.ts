/**
 * 模拟后端 API 层（宠物美容院）
 *
 * 与 walkApi.ts / shopApi.ts 同范式：localStorage 充当服务端存储，
 * 对外暴露与 HTTP 接口同构的函数签名。
 *
 * 职责：
 * 1. 服务/体型/造型/美容师数据
 * 2. AI 造型顾问回答的结构化解析（【推荐造型】【推荐服务】）
 * 3. 预约表单验证（昵称/电话/到店时间/备注）
 * 4. 下单：计价（Σ服务单价 × 体型系数）+ 持久化 cb_groom_bookings
 */

/* ============ 数据 ============ */

export interface Service {
  id: string
  name: string
  price: number
  desc: string
}

export const SERVICES: Service[] = [
  { id: 'bath', name: '精洗泡泡浴', price: 68, desc: '深层去污 + 护毛素' },
  { id: 'cut', name: '精细剪毛造型', price: 108, desc: '按指定造型修剪' },
  { id: 'spa', name: 'SPA 深层护理', price: 88, desc: '精油按摩 + 毛发修复' },
  { id: 'med', name: '驱虫药浴', price: 78, desc: '体外驱虫 + 皮肤舒缓' },
]

export interface BodySize {
  id: string
  label: string
  /** 计价系数 */
  mult: number
}

export const BODY_SIZES: BodySize[] = [
  { id: 'small', label: '小型犬', mult: 1 },
  { id: 'medium', label: '中型犬', mult: 1.3 },
  { id: 'large', label: '大型犬', mult: 1.6 },
  { id: 'cat', label: '猫咪', mult: 1.2 },
]

export interface Style {
  id: string
  label: string
  emoji: string
}

export const STYLES: Style[] = [
  { id: 'short', label: '清爽短毛', emoji: '✂️' },
  { id: 'teddy', label: '甜美泰迪', emoji: '🧸' },
  { id: 'lion', label: '酷炫狮子', emoji: '🦁' },
  { id: 'mushroom', label: '呆萌蘑菇', emoji: '🍄' },
]

export interface Groomer {
  id: number
  emoji: string
  name: string
  specialty: string
  rating: number
}

export const GROOMERS: Groomer[] = [
  { id: 1, emoji: '👨‍🎨', name: '首席阿凯', specialty: '泰迪造型一把手', rating: 4.9 },
  { id: 2, emoji: '💆', name: '理疗师小莫', specialty: 'SPA 护理专家', rating: 4.8 },
  { id: 3, emoji: '🎖️', name: '老师傅陈伯', specialty: '40 年剪刀功', rating: 5.0 },
]

/* ============ AI 造型顾问 ============ */

export const GROOM_SYSTEM_PROMPT =
  '你是一位经验丰富的宠物美容师。请针对用户描述的宠物（品种、毛色、毛发状态、' +
  '性格等），给出专业的造型与服务建议：1）推荐造型及理由；2）推荐服务项目；' +
  '3）护理小提示。全程使用中文，语气专业温柔。' +
  '在回答末尾另起一行输出「【推荐造型】」，后面跟一个造型名（清爽短毛/甜美泰迪/酷炫狮子/呆萌蘑菇之一）；' +
  '再另起一行输出「【推荐服务】」，后面跟服务名，多个用「｜」分隔（可选：精洗泡泡浴/精细剪毛造型/SPA 深层护理/驱虫药浴）。' +
  '两个标记行不要加粗、不要加序号、不要有多余文字。最后提醒主人：美容前后请保持宠物情绪平稳。'

export interface AiAdvice {
  /** 解析出的造型 id（匹配失败为 null） */
  styleId: string | null
  /** 解析出的服务 id 列表 */
  serviceIds: string[]
}

/** 从 AI 回答中提取推荐造型与服务（宽容匹配：允许包含 markdown/多余空格） */
export function parseAiAdvice(text: string): AiAdvice {
  const styleLine = text.match(/【推荐造型】\s*([^\n]+)/)
  const flatStyle = (styleLine?.[1] ?? '').replace(/\*\*/g, '').trim()
  const styleId =
    STYLES.find((s) => flatStyle.includes(s.label))?.id ?? null

  const serviceLine = text.match(/【推荐服务】\s*([^\n]+)/)
  const parts = (serviceLine?.[1] ?? '')
    .replace(/\*\*/g, '')
    .split(/[|｜、]/)
    .map((s) => s.trim())
    .filter(Boolean)
  const serviceIds = SERVICES.filter((s) => parts.some((p) => p.includes(s.name))).map((s) => s.id)

  return { styleId, serviceIds }
}

/* ============ 表单字段验证（null = 通过） ============ */

export interface BookingInput {
  petName: string
  phone: string
  /** datetime-local 格式：YYYY-MM-DDTHH:mm */
  bookTime: string
  note: string
}

export interface FieldErrors {
  petName: string | null
  phone: string | null
  bookTime: string | null
  note: string | null
}

/** 宠物昵称：非空 + 2~12 字 */
export function validatePetName(value: string): string | null {
  const v = value.trim()
  if (!v) return '请填写宠物昵称'
  if (v.length < 2) return '昵称至少 2 个字'
  if (v.length > 12) return '昵称最多 12 个字'
  return null
}

/** 联系电话：非空 + 11 位大陆手机号 */
export function validatePhone(value: string): string | null {
  const v = value.trim()
  if (!v) return '请输入联系电话'
  if (!/^1[3-9]\d{9}$/.test(v)) return '请输入 11 位大陆手机号，如 13812345678'
  return null
}

/** 到店时间：非空 + datetime-local 格式 + 不早于当前时间 */
export function validateBookTime(value: string): string | null {
  if (!value.trim()) return '请选择到店时间'
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value)) return '时间格式不正确（应为 YYYY-MM-DD HH:mm）'
  const t = Date.parse(value)
  if (Number.isNaN(t)) return '不是有效的时间'
  if (t < Date.now()) return '到店时间不能早于当前时间'
  return null
}

/** 备注：选填，≤50 字 */
export function validateNote(value: string): string | null {
  const v = value.trim()
  if (v.length > 50) return '备注最多 50 个字'
  return null
}

/* ============ 计价与下单 ============ */

/** 合计 = Σ服务单价 × 体型系数（四舍五入到元） */
export function calcTotal(serviceIds: string[], sizeId: string): number {
  const size = BODY_SIZES.find((s) => s.id === sizeId)
  const mult = size ? size.mult : 1
  const sum = SERVICES.filter((s) => serviceIds.includes(s.id)).reduce((acc, s) => acc + s.price, 0)
  return Math.round(sum * mult)
}

export interface OperationResult {
  ok: boolean
  errors: FieldErrors
}

const BOOKINGS_KEY = 'cb_groom_bookings'
const MAX_BOOKINGS = 20

interface StoredBooking extends BookingInput {
  bookingNo: string
  createdAt: number
  serviceIds: string[]
  sizeId: string
  styleId: string | null
  groomerId: number | null
  total: number
}

/** 提交预约：全字段验证 → 任一失败拦截；通过则持久化并返回预约号与合计 */
export function submitBooking(
  input: BookingInput,
  serviceIds: string[],
  sizeId: string,
  styleId: string | null,
  groomerId: number | null
): OperationResult & { bookingNo: string | null; total: number } {
  const errors: FieldErrors = {
    petName: validatePetName(input.petName),
    phone: validatePhone(input.phone),
    bookTime: validateBookTime(input.bookTime),
    note: validateNote(input.note),
  }
  if (Object.values(errors).some((e) => e !== null)) {
    return { ok: false, errors, bookingNo: null, total: 0 }
  }
  // 服务与造型是必选（UI 层禁用，此处兜底）
  if (serviceIds.length === 0) {
    return { ok: false, errors: { ...errors, note: '请至少选择一项服务' }, bookingNo: null, total: 0 }
  }
  const total = calcTotal(serviceIds, sizeId)
  const booking: StoredBooking = {
    ...input,
    petName: input.petName.trim(),
    phone: input.phone.trim(),
    note: input.note.trim(),
    bookingNo: `groom_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    createdAt: Date.now(),
    serviceIds,
    sizeId,
    styleId,
    groomerId,
    total,
  }
  try {
    const raw = localStorage.getItem(BOOKINGS_KEY)
    const bookings: StoredBooking[] = raw ? (JSON.parse(raw) as StoredBooking[]) : []
    bookings.unshift(booking)
    localStorage.setItem(BOOKINGS_KEY, JSON.stringify(bookings.slice(0, MAX_BOOKINGS)))
  } catch {
    /* 存储被禁用时静默失败，不影响演示 */
  }
  return { ok: true, errors: { petName: null, phone: null, bookTime: null, note: null }, bookingNo: booking.bookingNo, total }
}
