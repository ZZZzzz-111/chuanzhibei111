/**
 * 模拟后端 API 层（粮食商店）
 *
 * 真实项目中这里是 Express/Nest 服务 + 数据库；演示环境下用 localStorage
 * 充当"服务端存储"，对外暴露与 HTTP 接口同构的函数签名（与 walkApi.ts 同范式）。
 *
 * 职责：
 * 1. 商品数据：狗粮/猫粮商品清单
 * 2. 购物车：商品条目持久化（刷新不丢）
 * 3. 订单表单验证：收件人 / 手机号 / 收货地址 / 送达时间 / 备注，逐字段返回错误文案
 * 4. 下单：验证通过后写入 cb_shop_orders（保留最近 20 条），返回订单号
 */

/* ============ 类型 ============ */

export interface Product {
  id: string
  kind: 'dog' | 'cat'
  brand: string
  name: string
  emoji: string
  weight: string
  price: number
  rating: number
  tag: string
  bg: string
}

export const PRODUCTS: Product[] = [
  { id: 'd1', kind: 'dog', brand: '汪膳坊', name: '全犬期牛肉无谷粮', emoji: '🥩', weight: '1.5kg', price: 89, rating: 4.9, tag: '无谷低敏', bg: 'linear-gradient(135deg,#FFDFAF,#F5A65B)' },
  { id: 'd2', kind: 'dog', brand: '汪膳坊', name: '幼犬羊奶高钙粮', emoji: '🥛', weight: '1kg', price: 76, rating: 4.8, tag: '幼犬专属', bg: 'linear-gradient(135deg,#FFE9D6,#F2B36B)' },
  { id: 'd3', kind: 'dog', brand: '肉肉星球', name: '冻干鸡肉双拼粮', emoji: '🍗', weight: '2kg', price: 128, rating: 4.9, tag: '冻干双拼', bg: 'linear-gradient(135deg,#FFE2C4,#E88B4A)' },
  { id: 'd4', kind: 'dog', brand: '肉肉星球', name: '老年犬关节护理粮', emoji: '🍖', weight: '1.5kg', price: 109, rating: 4.7, tag: '护关节', bg: 'linear-gradient(135deg,#F9E0C8,#D98E4A)' },
  { id: 'c1', kind: 'cat', brand: '喵食堂', name: '全猫期三文鱼美毛粮', emoji: '🍣', weight: '1.2kg', price: 96, rating: 4.9, tag: '美毛护肤', bg: 'linear-gradient(135deg,#FFD9CF,#F08D7E)' },
  { id: 'c2', kind: 'cat', brand: '喵食堂', name: '室内猫化毛配方', emoji: '🌾', weight: '1kg', price: 82, rating: 4.8, tag: '化毛保健', bg: 'linear-gradient(135deg,#FBE3D3,#E3A583)' },
  { id: 'c3', kind: 'cat', brand: '夜行猫舍', name: '冻干生骨肉主食罐', emoji: '🥫', weight: '6罐', price: 118, rating: 5.0, tag: '生骨肉', bg: 'linear-gradient(135deg,#FFDCC8,#E77B54)' },
  { id: 'c4', kind: 'cat', brand: '夜行猫舍', name: '幼猫奶糕高能粮', emoji: '🍰', weight: '1kg', price: 88, rating: 4.8, tag: '幼猫奶糕', bg: 'linear-gradient(135deg,#FFE8DB,#F0A97E)' },
]

/** 购物车条目：商品 id + 数量（数量钳制在 1~99） */
export interface CartItem {
  productId: string
  qty: number
}

export const CART_QTY_MIN = 1
export const CART_QTY_MAX = 99

/** 订单表单字段 */
export interface OrderInput {
  receiver: string
  phone: string
  address: string
  /** datetime-local 格式：YYYY-MM-DDTHH:mm */
  deliveryTime: string
  note: string
}

export interface FieldErrors {
  receiver: string | null
  phone: string | null
  address: string | null
  deliveryTime: string | null
  note: string | null
}

export interface OperationResult {
  ok: boolean
  errors: FieldErrors
}

/** 商品查找（找不到返回 null，供购物车容错） */
export function getProduct(id: string): Product | null {
  return PRODUCTS.find((p) => p.id === id) ?? null
}

/* ============ 字段验证（非空 + 格式；null = 通过） ============ */

/** 收件人：非空 + 2~20 字 */
export function validateReceiver(value: string): string | null {
  const v = value.trim()
  if (!v) return '请输入收件人姓名'
  if (v.length < 2) return '姓名至少 2 个字'
  if (v.length > 20) return '姓名最多 20 个字'
  return null
}

/** 手机号：非空 + 11 位大陆手机号 */
export function validatePhone(value: string): string | null {
  const v = value.trim()
  if (!v) return '请输入联系电话'
  if (!/^1[3-9]\d{9}$/.test(v)) return '请输入 11 位大陆手机号，如 13812345678'
  return null
}

/** 收货地址：非空 + 至少 5 个字 */
export function validateAddress(value: string): string | null {
  const v = value.trim()
  if (!v) return '请输入收货地址'
  if (v.length < 5) return '地址太短啦，写详细一点'
  if (v.length > 60) return '地址最多 60 个字'
  return null
}

/** 送达时间：非空 + datetime-local 格式 + 不早于当前时间 */
export function validateDeliveryTime(value: string): string | null {
  if (!value.trim()) return '请选择送达时间'
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value)) return '时间格式不正确（应为 YYYY-MM-DD HH:mm）'
  const t = Date.parse(value)
  if (Number.isNaN(t)) return '不是有效的时间'
  if (t < Date.now()) return '送达时间不能早于当前时间'
  return null
}

/** 备注：选填，≤50 字 */
export function validateNote(value: string): string | null {
  const v = value.trim()
  if (v.length > 50) return '备注最多 50 个字'
  return null
}

/* ============ 存储（模拟服务端数据库） ============ */

const CART_KEY = 'cb_shop_cart'
const ORDERS_KEY = 'cb_shop_orders'
const MAX_ORDERS = 20

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

/** 读取购物车（结构归一化，旧数据缺字段不崩溃） */
export function getCart(): CartItem[] {
  const raw = loadJSON<unknown>(CART_KEY, [])
  if (!Array.isArray(raw)) return []
  return raw
    .filter((i): i is Partial<CartItem> => i !== null && typeof i === 'object')
    .map<CartItem>((i) => ({
      productId: typeof i.productId === 'string' ? i.productId : '',
      qty: typeof i.qty === 'number' && Number.isFinite(i.qty) ? Math.round(i.qty) : CART_QTY_MIN,
    }))
    .filter((i) => i.productId && getProduct(i.productId) !== null)
    .map((i) => ({ ...i, qty: Math.min(CART_QTY_MAX, Math.max(CART_QTY_MIN, i.qty)) }))
}

export function saveCart(items: CartItem[]): void {
  saveJSON(CART_KEY, items)
}

interface StoredOrder extends OrderInput {
  orderNo: string
  createdAt: number
  /** 快照：下单时的商品与数量（价格以商品现价为准，仅展示用途） */
  items: CartItem[]
  total: number
}

/** 提交订单：全字段验证 → 任一失败拦截；通过则持久化并返回订单号 */
export function submitOrder(
  input: OrderInput,
  items: CartItem[]
): OperationResult & { orderNo: string | null } {
  const errors: FieldErrors = {
    receiver: validateReceiver(input.receiver),
    phone: validatePhone(input.phone),
    address: validateAddress(input.address),
    deliveryTime: validateDeliveryTime(input.deliveryTime),
    note: validateNote(input.note),
  }
  if (Object.values(errors).some((e) => e !== null)) {
    return { ok: false, errors, orderNo: null }
  }
  // 空购物车不应走到提交（UI 层已禁用，此处兜底）
  if (items.length === 0) {
    return { ok: false, errors: { ...errors, receiver: '购物车是空的' }, orderNo: null }
  }
  const total = items.reduce((sum, i) => {
    const p = getProduct(i.productId)
    return sum + (p ? p.price * i.qty : 0)
  }, 0)
  const order: StoredOrder = {
    ...input,
    receiver: input.receiver.trim(),
    phone: input.phone.trim(),
    address: input.address.trim(),
    note: input.note.trim(),
    orderNo: `shop_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    createdAt: Date.now(),
    items,
    total,
  }
  const orders = loadJSON<StoredOrder[]>(ORDERS_KEY, [])
  orders.unshift(order)
  saveJSON(ORDERS_KEY, orders.slice(0, MAX_ORDERS))
  return { ok: true, errors: { receiver: null, phone: null, address: null, deliveryTime: null, note: null }, orderNo: order.orderNo }
}
