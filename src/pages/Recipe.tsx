import { useEffect, useMemo, useRef, useState } from 'react'
import BackToPlanet from '../components/BackToPlanet'
import { motion, AnimatePresence, MotionConfig } from 'framer-motion'
import { useToast } from '../components/Toast'
import {
  BadgeCheck,
  Beef,
  Cat,
  ChefHat,
  Dog,
  Flame,
  GripVertical,
  Minus,
  Plus,
  Scale,
  ShoppingCart,
  Sparkles,
  Star,
  Store,
  Trash2,
  TriangleAlert,
  X,
  CircleCheck,
} from 'lucide-react'
import {
  PRODUCTS,
  CART_QTY_MAX,
  CART_QTY_MIN,
  getCart,
  saveCart,
  submitOrder,
  type CartItem,
  type FieldErrors,
  type OrderInput,
  type Product,
} from '../services/shopApi'
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import '../styles/walk.css'
import '../styles/recipe.css'

/* ============ 调色板（厨房案台） ============
 * 燕麦米纸 #FBF5EC · 深可可 #3E2A20 · 焙橙 #C2410C · 蜜橙 #FFE9D6 · 陶土 #E8A765
 */

/* ============ 食材与营养数据 ============ */

interface Ingredient {
  id: string
  emoji: string
  name: string
  tag: string
  protein: number // 蛋白质 g/份
  ca: number // 钙
  p: number // 磷
  cal: number // 热量 kcal/份
}

const INGREDIENTS: Ingredient[] = [
  { id: 'chicken', emoji: '🍗', name: '鸡胸肉', tag: '高蛋白', protein: 30, ca: 4, p: 10, cal: 20 },
  { id: 'beef', emoji: '🥩', name: '牛肉', tag: '高蛋白', protein: 35, ca: 6, p: 12, cal: 25 },
  { id: 'duck', emoji: '🦆', name: '鸭肉', tag: '低敏', protein: 27, ca: 4, p: 9, cal: 21 },
  { id: 'salmon', emoji: '🍣', name: '三文鱼', tag: '高蛋白', protein: 28, ca: 5, p: 9, cal: 22 },
  { id: 'egg', emoji: '🥚', name: '鸡蛋', tag: '高蛋白', protein: 13, ca: 5, p: 8, cal: 15 },
  { id: 'broccoli', emoji: '🥦', name: '西兰花', tag: '高钙', protein: 8, ca: 12, p: 4, cal: 8 },
  { id: 'carrot', emoji: '🥕', name: '胡萝卜', tag: '护眼', protein: 1, ca: 4, p: 3, cal: 4 },
  { id: 'pumpkin', emoji: '🎃', name: '南瓜', tag: '低脂', protein: 5, ca: 8, p: 6, cal: 15 },
  { id: 'blueberry', emoji: '🫐', name: '蓝莓', tag: '抗氧化', protein: 1, ca: 1, p: 1, cal: 3 },
  { id: 'oat', emoji: '🌾', name: '燕麦', tag: '低脂', protein: 5, ca: 3, p: 6, cal: 12 },
  { id: 'yogurt', emoji: '🥛', name: '酸奶', tag: '益生元', protein: 3, ca: 12, p: 9, cal: 6 },
  { id: 'fishoil', emoji: '🐟', name: '鱼油', tag: '补钙', protein: 2, ca: 18, p: 2, cal: 10 },
]

/** 背包分组：按类别陈列，方便找食材 */
const ING_GROUPS: { label: string; ids: string[] }[] = [
  { label: '肉类', ids: ['chicken', 'beef', 'duck', 'salmon', 'egg'] },
  { label: '蔬果', ids: ['broccoli', 'carrot', 'pumpkin', 'blueberry'] },
  { label: '谷物·补剂', ids: ['oat', 'yogurt', 'fishoil'] },
]

// 钙磷比健康区间（%），超出则警告
const RATIO_MIN = 40
const RATIO_MAX = 70

const DISH_BY_ING: Record<string, { emoji: string; name: string }> = {
  chicken: { emoji: '🍮', name: '滑嫩鸡肉冻' },
  beef: { emoji: '🍡', name: '牛肉能量丸' },
  duck: { emoji: '🥟', name: '鸭肉清润丸' },
  salmon: { emoji: '🍥', name: '三文鱼美毛冻' },
  egg: { emoji: '🍳', name: '太阳蛋花碎' },
  broccoli: { emoji: '🥗', name: '翠花蔬菜脆' },
  carrot: { emoji: '🧁', name: '胡萝卜小方' },
  pumpkin: { emoji: '🍲', name: '南瓜暖胃盅' },
  blueberry: { emoji: '🍬', name: '蓝莓护眼软糖' },
  oat: { emoji: '🍪', name: '燕麦脆脆圈' },
  yogurt: { emoji: '🍨', name: '酸奶冰酪盏' },
  fishoil: { emoji: '✨', name: '美毛鱼油膏' },
}

/* ============ 粮食商店数据 ============ */
// Product 接口与 PRODUCTS 数据统一放在 services/shopApi.ts（与 walkApi 同范式的模拟后端）

interface BowlItem {
  uid: number
  ingId: string
}

interface Recipe {
  emoji: string
  name: string
  used: string
  protein: number
  cal: number
}

/* ============ 小组件 ============ */

/** 圆体数字，值变化时弹跳（替代此前的 Comic Sans 发光体） */
function GameNumber({ value, warn = false }: { value: number; warn?: boolean }) {
  return (
    <motion.span
      key={value}
      initial={{ scale: 1.4, opacity: 0.4 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 320, damping: 14 }}
      className={`num-display inline-block text-lg font-bold leading-none ${
        warn ? 'text-[#B3261E]' : 'text-[#3E2A20]'
      }`}
    >
      {value}
    </motion.span>
  )
}

/** 营养秤刻度条 */
function StatBar({
  icon: Icon,
  label,
  display,
  width,
  warn = false,
}: {
  icon: typeof Beef
  label: string
  display: string
  width: number
  warn?: boolean
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-sm font-bold text-[#3E2A20]/75">
          <Icon size={14} className="text-[#C2410C]" aria-hidden="true" />
          {label}
        </span>
        <span className="flex items-baseline gap-1">
          <GameNumber value={Number(display.replace(/[^0-9]/g, '')) || 0} warn={warn} />
          <span className="sr-only">{display}</span>
        </span>
      </div>
      <div
        className="h-3 overflow-hidden rounded-full bg-[#F1E7D8]"
        style={{
          backgroundImage:
            'repeating-linear-gradient(90deg, transparent 0 15px, rgba(62,42,32,0.08) 15px 16px)',
        }}
      >
        <motion.div
          className={`h-full rounded-full ${warn ? 'motion-safe:animate-pulse bg-[#D9534B]' : 'bg-[#C2410C]'}`}
          initial={false}
          animate={{ width: `${Math.min(100, Math.max(0, width))}%` }}
          transition={{ type: 'spring', stiffness: 60, damping: 15 }}
        />
      </div>
    </div>
  )
}

/** 可拖拽的食材小卡片（点击也可以直接投喂）
 *  注意：这里必须用原生 button，不能用 motion.button——
 *  framer-motion 会接管 transform（whileHover/whileTap），
 *  覆盖 dnd-kit 拖拽跟随所需的 translate，导致拖拽失效 */
function DraggableIngredient({ ing, onAdd }: { ing: Ingredient; onAdd: (id: string) => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: ing.id })
  return (
    <button
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      type="button"
      onClick={() => onAdd(ing.id)}
      aria-label={`食材${ing.name}，拖拽或点击放入大碗`}
      className={`flex min-h-[44px] w-full cursor-grab touch-none items-center gap-2.5 rounded-2xl bg-white px-3 py-2.5 text-left shadow-[0_10px_20px_-14px_rgba(62,42,32,0.35)] transition-colors hover:bg-[#FFF7EF] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#C2410C] active:cursor-grabbing ${
        isDragging ? 'opacity-40' : ''
      }`}
    >
      <span className="text-2xl" aria-hidden="true">
        {ing.emoji}
      </span>
      <span className="flex-1">
        <span className="block text-sm font-bold text-[#3E2A20]">{ing.name}</span>
        <span className="block text-[11px] font-bold text-[#C2410C]/80">{ing.tag}</span>
      </span>
      <GripVertical size={16} className="text-[#3E2A20]/25" aria-hidden="true" />
    </button>
  )
}

/** 碗口热气（烹饪时显示，CSS 驱动、reduced-motion 时不播） */
function Steam() {
  return (
    <svg
      className="pointer-events-none absolute -top-14 left-1/2 -translate-x-1/2"
      width="120"
      height="60"
      viewBox="0 0 120 60"
      aria-hidden="true"
    >
      <g fill="none" stroke="#C2410C" strokeWidth="5" strokeLinecap="round" opacity="0.65">
        <path className="steam-path" d="M 40 52 C 32 40, 48 32, 40 20 C 34 12, 40 6, 42 0" />
        <path className="steam-path" d="M 60 54 C 52 42, 68 34, 60 22 C 54 14, 60 8, 62 0" />
        <path className="steam-path" d="M 80 52 C 72 40, 88 32, 80 20 C 74 12, 80 6, 82 0" />
      </g>
    </svg>
  )
}

/** 烹饪陶碗：useDroppable 必须在 DndContext 的子组件里调用才有注册效果
 *  （在渲染 DndContext 的同一组件里调用会读到父级的默认空 context，导致拖放判定永远失效） */
function BowlDroppable({
  cooking,
  bowlItems,
  ingredientById,
}: {
  cooking: boolean
  bowlItems: BowlItem[]
  ingredientById: Record<string, Ingredient>
}) {
  const { isOver, setNodeRef } = useDroppable({ id: 'bowl' })
  return (
    /* 陶碗本体：碗沿釉色 + 内碗浅陶底
        ref 节点保持稳定（不放 key），droppable 才不会反复重挂载 */
    <motion.div
      ref={setNodeRef}
      animate={{
        scale: isOver ? 1.05 : 1,
        rotate: cooking ? [0, -2, 2, 0] : 0,
      }}
      transition={
        cooking
          ? { repeat: Infinity, duration: 0.5 }
          : { type: 'spring', stiffness: 260, damping: 16 }
      }
      aria-label="烹饪大碗，把食材拖到这里"
      role="region"
      className="relative flex h-64 w-64 items-center justify-center overflow-hidden rounded-full sm:h-80 sm:w-80"
      style={{
        background:
          'radial-gradient(circle at 35% 28%, #F2BE83 0%, #E8A765 52%, #C9853F 115%)',
        boxShadow:
          'inset 10px 12px 26px rgba(146, 92, 34, 0.35), inset -8px -8px 18px rgba(255, 244, 230, 0.6), 0 22px 34px -22px rgba(62, 42, 32, 0.5)',
      }}
    >
      {/* 碗沿釉色环 */}
      <div
        className="pointer-events-none absolute inset-3 rounded-full"
        style={{ boxShadow: 'inset 0 0 0 7px rgba(255, 236, 214, 0.5)' }}
        aria-hidden="true"
      />
      {/* 手绘釉线 */}
      <div
        className="pointer-events-none absolute inset-6 rounded-full border-[3px] border-dashed border-[#C2410C]/25"
        aria-hidden="true"
      />
      {/* 悬停高亮 */}
      <div
        className={`pointer-events-none absolute inset-0 rounded-full bg-[#FFF3E4]/50 transition-opacity ${
          isOver ? 'opacity-100' : 'opacity-0'
        }`}
        aria-hidden="true"
      />
      {/* 碗内食材（key 在内层内容上，每次投喂重播弹跳） */}
      {bowlItems.length === 0 ? (
        <p className="relative z-10 px-8 text-center text-sm font-bold text-[#7A4A22]">
          {isOver ? '松手投喂！' : '把食材拖进碗里吧'}
        </p>
      ) : (
        <motion.div
          key={bowlItems.length}
          initial={{ scale: 0.92 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', stiffness: 300, damping: 15 }}
          className="relative z-10 flex max-h-full flex-wrap content-center items-center justify-center gap-1.5 p-12"
        >
          {bowlItems.slice(0, 14).map((item) => (
            <motion.span
              key={item.uid}
              initial={{ scale: 0, rotate: -40, y: -18 }}
              animate={{ scale: 1, rotate: 0, y: 0 }}
              transition={{ type: 'spring', stiffness: 380, damping: 14 }}
              className="text-3xl drop-shadow-sm"
              aria-hidden="true"
            >
              {ingredientById[item.ingId].emoji}
            </motion.span>
          ))}
          {bowlItems.length > 14 && (
            <span className="num-display text-sm font-bold text-[#5C3A1E]">
              +{bowlItems.length - 14}
            </span>
          )}
        </motion.div>
      )}
    </motion.div>
  )
}

/** 粮食商店：狗粮/猫粮商品网格 */
function ShopView({ onAdd }: { onAdd: (p: Product) => void }) {
  const [kind, setKind] = useState<'all' | 'dog' | 'cat'>('all')
  const list = kind === 'all' ? PRODUCTS : PRODUCTS.filter((p) => p.kind === kind)
  const FILTERS = [
    { key: 'all', label: '全部' },
    { key: 'dog', label: '狗粮' },
    { key: 'cat', label: '猫粮' },
  ] as const

  return (
    <div className="relative z-10 mx-auto w-full max-w-6xl px-6 pb-16">
      <div className="mb-5 flex flex-wrap gap-2" role="group" aria-label="商品分类筛选">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            aria-pressed={kind === f.key}
            onClick={() => setKind(f.key)}
            className={`inline-flex min-h-[44px] items-center gap-1.5 rounded-full border px-4 py-2 text-sm font-bold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#C2410C] ${
              kind === f.key
                ? 'border-[#C2410C] bg-[#C2410C] text-white shadow-[0_8px_16px_-8px_rgba(194,65,12,0.6)]'
                : 'border-[#3E2A20]/15 bg-white text-[#3E2A20]/70 hover:border-[#C2410C]/40 hover:text-[#C2410C]'
            }`}
          >
            {f.key === 'all' ? <Store size={15} aria-hidden="true" /> : f.key === 'dog' ? <Dog size={15} aria-hidden="true" /> : <Cat size={15} aria-hidden="true" />}
            {f.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
        {list.map((p) => (
          <motion.article
            key={p.id}
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: 'spring', stiffness: 200, damping: 20 }}
            className="walk-card overflow-hidden rounded-[20px] bg-white"
          >
            <div className="relative flex h-28 items-center justify-center" style={{ background: p.bg }}>
              <span className="text-5xl drop-shadow-sm" aria-hidden="true">
                {p.emoji}
              </span>
              <span className="absolute left-2.5 top-2.5 rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-black text-[#C2410C]">
                {p.brand}
              </span>
              <span className="absolute right-2.5 top-2.5 rounded-full bg-[#3E2A20]/70 px-2 py-0.5 text-[10px] font-bold text-white">
                {p.kind === 'dog' ? '犬用' : '猫用'}
              </span>
            </div>
            <div className="p-3.5">
              <h3 className="truncate text-sm font-black text-[#3E2A20]">{p.name}</h3>
              <div className="mt-1 flex items-center gap-1.5 text-[11px] font-bold text-[#3E2A20]/55">
                <span>{p.weight}</span>
                <span aria-hidden="true">·</span>
                <span className="flex items-center gap-0.5">
                  <Star size={11} className="text-[#E8A765]" fill="currentColor" aria-hidden="true" />
                  <span className="num-display">{p.rating}</span>
                </span>
                <span aria-hidden="true">·</span>
                <span className="rounded-full bg-[#FFF3E8] px-1.5 py-0.5 text-[10px] font-bold text-[#C2410C]">{p.tag}</span>
              </div>
              <div className="mt-2.5 flex items-center justify-between gap-2">
                <span className="num-display text-lg font-bold leading-none text-[#C2410C]">¥{p.price}</span>
                <button
                  type="button"
                  onClick={() => onAdd(p)}
                  aria-label={`将${p.name}加入购物车`}
                  className="inline-flex min-h-[36px] items-center gap-1 rounded-full bg-[#C2410C] px-3 text-xs font-black text-white transition-colors hover:bg-[#A8380A] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#C2410C] focus-visible:ring-offset-2"
                >
                  <ShoppingCart size={13} aria-hidden="true" />
                  加购
                </button>
              </div>
            </div>
          </motion.article>
        ))}
      </div>
    </div>
  )
}

/* ============ 购物车抽屉（三步：cart → checkout → done） ============ */

const EMPTY_ERRORS: FieldErrors = { receiver: null, phone: null, address: null, deliveryTime: null, note: null }

export interface CartLine {
  product: Product
  qty: number
}

type DrawerStep = 'cart' | 'checkout' | 'done'

/** 表单字段通用样式：错误橙框 / 有效绿框 / 默认灰框（与 Walk 页同语言） */
function fieldCls(error: string | null, valid: boolean): string {
  if (error) return 'border-[#C2703D] bg-[#FBF1E9] focus:border-[#C2703D]'
  if (valid) return 'border-[#2E7D46] bg-white focus:border-[#256639]'
  return 'border-[#3E2A20]/15 bg-white focus:border-[#C2410C]'
}

function CartDrawer({
  open,
  step,
  lines,
  total,
  form,
  errors,
  orderNo,
  onClose,
  onStep,
  onQty,
  onRemove,
  onFormChange,
  onSubmit,
  onDone,
}: {
  open: boolean
  step: DrawerStep
  lines: CartLine[]
  total: number
  form: OrderInput
  errors: FieldErrors
  orderNo: string | null
  onClose: () => void
  onStep: (s: Exclude<DrawerStep, 'done'>) => void
  onQty: (productId: string, delta: 1 | -1) => void
  onRemove: (productId: string) => void
  onFormChange: (field: keyof OrderInput, value: string) => void
  onSubmit: () => void
  onDone: () => void
}) {
  // Esc 关闭抽屉
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  const receiverValid = !errors.receiver && form.receiver.trim().length >= 2
  const phoneValid = !errors.phone && /^1[3-9]\d{9}$/.test(form.phone.trim())
  const addressValid = !errors.address && form.address.trim().length >= 5
  const deliveryValid = !errors.deliveryTime && form.deliveryTime.trim().length > 0
  const TITLE: Record<DrawerStep, string> = { cart: '购物车', checkout: '确认订单', done: '下单成功' }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="cart-drawer"
          className="fixed inset-0 z-40 flex justify-end bg-[#3E2A20]/40 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onClick={onClose}
        >
          <motion.aside
            role="dialog"
            aria-modal="true"
            aria-label="购物车"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            className="flex h-full w-full max-w-md flex-col bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 抽屉头 */}
            <div className="flex items-center justify-between border-b border-[#3E2A20]/10 px-5 py-4">
              <h2 className="flex items-center gap-2 text-lg font-black">
                <ShoppingCart size={18} className="text-[#C2410C]" aria-hidden="true" />
                {TITLE[step]}
              </h2>
              <button
                type="button"
                onClick={onClose}
                aria-label="关闭购物车"
                className="flex h-9 w-9 items-center justify-center rounded-full text-[#3E2A20]/60 transition-colors hover:bg-[#FFF3E8] hover:text-[#3E2A20] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#C2410C]"
              >
                <X size={16} aria-hidden="true" />
              </button>
            </div>

            {/* 抽屉主体 */}
            <div className="flex-1 overflow-y-auto p-5">
              {/* 步骤一：购物车列表 */}
              {step === 'cart' &&
                (lines.length === 0 ? (
                  <div className="py-16 text-center">
                    <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[#FFF3E8] text-[#C2410C]" aria-hidden="true">
                      <ShoppingCart size={26} />
                    </span>
                    <p className="mt-4 text-sm font-black">购物车还是空的</p>
                    <p className="mt-1 text-xs font-medium text-[#3E2A20]/45">去商店挑点粮食吧</p>
                  </div>
                ) : (
                  <ul className="flex flex-col gap-3" aria-label="购物车商品列表">
                    {lines.map(({ product: p, qty }) => (
                      <li key={p.id} className="flex items-center gap-3 rounded-2xl bg-[#FAF6EF] p-3">
                        <span
                          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-2xl"
                          style={{ background: p.bg }}
                          aria-hidden="true"
                        >
                          {p.emoji}
                        </span>
                        <div className="min-w-0 flex-1">
                          <h3 className="truncate text-sm font-black text-[#3E2A20]">{p.name}</h3>
                          <p className="num-display mt-0.5 text-xs font-bold text-[#3E2A20]/55">
                            ¥{p.price} / {p.weight}
                          </p>
                          {/* 数量步进器：min 1 max 99 */}
                          <div className="mt-1.5 flex items-center gap-1.5" role="group" aria-label={`${p.name}数量`}>
                            <button
                              type="button"
                              onClick={() => onQty(p.id, -1)}
                              disabled={qty <= CART_QTY_MIN}
                              aria-label={`减少${p.name}数量`}
                              className="flex h-7 w-7 items-center justify-center rounded-full border border-[#3E2A20]/20 bg-white text-[#3E2A20]/70 transition-colors hover:border-[#C2410C] hover:text-[#C2410C] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#C2410C] disabled:opacity-35"
                            >
                              <Minus size={13} aria-hidden="true" />
                            </button>
                            <span className="num-display w-6 text-center text-sm font-bold">{qty}</span>
                            <button
                              type="button"
                              onClick={() => onQty(p.id, 1)}
                              disabled={qty >= CART_QTY_MAX}
                              aria-label={`增加${p.name}数量`}
                              className="flex h-7 w-7 items-center justify-center rounded-full border border-[#3E2A20]/20 bg-white text-[#3E2A20]/70 transition-colors hover:border-[#C2410C] hover:text-[#C2410C] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#C2410C] disabled:opacity-35"
                            >
                              <Plus size={13} aria-hidden="true" />
                            </button>
                          </div>
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-1.5">
                          <span className="num-display text-sm font-bold text-[#C2410C]">¥{p.price * qty}</span>
                          <button
                            type="button"
                            onClick={() => onRemove(p.id)}
                            aria-label={`从购物车移除${p.name}`}
                            className="flex h-8 w-8 items-center justify-center rounded-full text-[#3E2A20]/40 transition-colors hover:bg-[#FBEAE8] hover:text-[#B3261E] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#B3261E]"
                          >
                            <Trash2 size={14} aria-hidden="true" />
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                ))}

              {/* 步骤二：确认订单表单 */}
              {step === 'checkout' && (
                <div className="flex flex-col gap-4">
                  {/* 商品摘要 */}
                  <div className="rounded-2xl bg-[#FAF6EF] px-3 py-2.5" aria-label="订单商品摘要">
                    {lines.map(({ product: p, qty }) => (
                      <div key={p.id} className="flex items-center justify-between py-0.5 text-xs font-bold text-[#3E2A20]/70">
                        <span>
                          {p.emoji} {p.name} × {qty}
                        </span>
                        <span className="num-display">¥{p.price * qty}</span>
                      </div>
                    ))}
                  </div>

                  {/* 收件人 */}
                  <div>
                    <label htmlFor="shop-receiver" className="text-sm font-black text-[#3E2A20]/70">
                      收件人
                    </label>
                    <input
                      id="shop-receiver"
                      type="text"
                      value={form.receiver}
                      onChange={(e) => onFormChange('receiver', e.target.value)}
                      placeholder="收件人姓名"
                      aria-invalid={errors.receiver !== null}
                      className={`mt-1.5 w-full rounded-2xl border-2 px-4 py-2.5 text-sm font-bold transition-colors placeholder:font-medium placeholder:text-[#3E2A20]/30 focus:outline-none ${fieldCls(errors.receiver, receiverValid)}`}
                    />
                    {errors.receiver && (
                      <p role="alert" className="mt-1.5 rounded-xl bg-[#FBF1E9] px-3 py-1.5 text-xs font-black text-[#A34E1F]">
                        {errors.receiver}
                      </p>
                    )}
                  </div>

                  {/* 手机号 */}
                  <div>
                    <label htmlFor="shop-phone" className="text-sm font-black text-[#3E2A20]/70">
                      联系电话
                    </label>
                    <input
                      id="shop-phone"
                      type="tel"
                      inputMode="tel"
                      value={form.phone}
                      onChange={(e) => onFormChange('phone', e.target.value)}
                      placeholder="13812345678"
                      aria-invalid={errors.phone !== null}
                      className={`num-display mt-1.5 w-full rounded-2xl border-2 px-4 py-2.5 text-sm font-bold transition-colors placeholder:font-medium placeholder:text-[#3E2A20]/30 focus:outline-none ${fieldCls(errors.phone, phoneValid)}`}
                    />
                    {errors.phone && (
                      <p role="alert" className="mt-1.5 rounded-xl bg-[#FBF1E9] px-3 py-1.5 text-xs font-black text-[#A34E1F]">
                        {errors.phone}
                      </p>
                    )}
                  </div>

                  {/* 收货地址 */}
                  <div>
                    <label htmlFor="shop-address" className="text-sm font-black text-[#3E2A20]/70">
                      收货地址
                    </label>
                    <input
                      id="shop-address"
                      type="text"
                      value={form.address}
                      onChange={(e) => onFormChange('address', e.target.value)}
                      placeholder="如：阳光小区 3 号楼 201 室"
                      aria-invalid={errors.address !== null}
                      className={`mt-1.5 w-full rounded-2xl border-2 px-4 py-2.5 text-sm font-bold transition-colors placeholder:font-medium placeholder:text-[#3E2A20]/30 focus:outline-none ${fieldCls(errors.address, addressValid)}`}
                    />
                    {errors.address && (
                      <p role="alert" className="mt-1.5 rounded-xl bg-[#FBF1E9] px-3 py-1.5 text-xs font-black text-[#A34E1F]">
                        {errors.address}
                      </p>
                    )}
                  </div>

                  {/* 送达时间 */}
                  <div>
                    <label htmlFor="shop-delivery" className="text-sm font-black text-[#3E2A20]/70">
                      送达时间
                    </label>
                    <input
                      id="shop-delivery"
                      type="datetime-local"
                      value={form.deliveryTime}
                      onChange={(e) => onFormChange('deliveryTime', e.target.value)}
                      aria-invalid={errors.deliveryTime !== null}
                      className={`num-display mt-1.5 w-full rounded-2xl border-2 px-4 py-2.5 text-sm font-bold transition-colors focus:outline-none ${fieldCls(errors.deliveryTime, deliveryValid)}`}
                    />
                    {errors.deliveryTime && (
                      <p role="alert" className="mt-1.5 rounded-xl bg-[#FBF1E9] px-3 py-1.5 text-xs font-black text-[#A34E1F]">
                        {errors.deliveryTime}
                      </p>
                    )}
                  </div>

                  {/* 备注（选填） */}
                  <div>
                    <label htmlFor="shop-note" className="text-sm font-black text-[#3E2A20]/70">
                      备注<span className="ml-1 text-xs font-medium text-[#3E2A20]/40">（选填）</span>
                    </label>
                    <textarea
                      id="shop-note"
                      value={form.note}
                      onChange={(e) => onFormChange('note', e.target.value)}
                      rows={2}
                      maxLength={50}
                      placeholder="如：放门口货架上即可"
                      aria-invalid={errors.note !== null}
                      className={`mt-1.5 w-full resize-none rounded-2xl border-2 px-4 py-2.5 text-sm font-bold transition-colors placeholder:font-medium placeholder:text-[#3E2A20]/30 focus:outline-none ${fieldCls(errors.note, false)}`}
                    />
                    {errors.note && (
                      <p role="alert" className="mt-1.5 rounded-xl bg-[#FBF1E9] px-3 py-1.5 text-xs font-black text-[#A34E1F]">
                        {errors.note}
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* 步骤三：下单成功 */}
              {step === 'done' && (
                <div className="py-14 text-center">
                  <motion.span
                    initial={{ scale: 0.4, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ type: 'spring', stiffness: 320, damping: 16 }}
                    className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-[#EAF3E6] text-[#2E7D46]"
                    aria-hidden="true"
                  >
                    <CircleCheck size={40} />
                  </motion.span>
                  <p className="mt-5 text-base font-black">订单已提交，毛孩子的粮食在路上！</p>
                  {orderNo && (
                    <p className="num-display mt-2 text-sm font-bold text-[#3E2A20]/60">
                      订单号：{orderNo}
                    </p>
                  )}
                  <motion.button
                    type="button"
                    onClick={onDone}
                    whileTap={{ scale: 0.96 }}
                    className="mt-6 inline-flex min-h-[44px] items-center gap-1.5 rounded-full bg-[#C2410C] px-6 text-sm font-black text-white shadow-[0_14px_26px_-12px_rgba(194,65,12,0.65)] transition-colors hover:bg-[#A8380A] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#C2410C] focus-visible:ring-offset-2"
                  >
                    <Store size={15} aria-hidden="true" />
                    继续购物
                  </motion.button>
                </div>
              )}
            </div>

            {/* 抽屉底栏：合计 + 主行动（done 步没有底栏） */}
            {step !== 'done' && lines.length > 0 && (
              <div className="border-t border-[#3E2A20]/10 bg-[#FAF6EF] px-5 py-4">
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-sm font-black text-[#3E2A20]/70">
                    合计<span className="ml-1 text-xs font-medium text-[#3E2A20]/40">（{lines.length} 种商品）</span>
                  </span>
                  <span className="num-display text-xl font-bold text-[#C2410C]">¥{total}</span>
                </div>
                {step === 'cart' ? (
                  <motion.button
                    type="button"
                    onClick={() => onStep('checkout')}
                    whileTap={{ scale: 0.97 }}
                    className="inline-flex min-h-[48px] w-full items-center justify-center gap-1.5 rounded-full bg-[#C2410C] text-base font-black text-white shadow-[0_16px_28px_-14px_rgba(194,65,12,0.7)] transition-colors hover:bg-[#A8380A] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#C2410C] focus-visible:ring-offset-2"
                  >
                    去结算
                  </motion.button>
                ) : (
                  <div className="flex items-center gap-3">
                    <motion.button
                      type="button"
                      onClick={() => onStep('cart')}
                      whileTap={{ scale: 0.94 }}
                      className="inline-flex min-h-[44px] items-center rounded-full border-2 border-[#3E2A20]/20 bg-white px-4 text-sm font-black text-[#3E2A20]/70 transition-colors hover:border-[#3E2A20]/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#C2410C]"
                    >
                      返回购物车
                    </motion.button>
                    <motion.button
                      type="button"
                      onClick={onSubmit}
                      whileTap={{ scale: 0.97 }}
                      className="inline-flex min-h-[48px] flex-1 items-center justify-center gap-1.5 rounded-full bg-[#C2410C] text-base font-black text-white shadow-[0_16px_28px_-14px_rgba(194,65,12,0.7)] transition-colors hover:bg-[#A8380A] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#C2410C] focus-visible:ring-offset-2"
                    >
                      提交订单
                    </motion.button>
                  </div>
                )}
              </div>
            )}
          </motion.aside>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

/* ============ 页面 ============ */

function Recipe() {
  const toast = useToast()
  const [tab, setTab] = useState<'workshop' | 'shop'>('workshop')
  const [cartItems, setCartItems] = useState<CartItem[]>(() => getCart())
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [drawerStep, setDrawerStep] = useState<DrawerStep>('cart')
  const [orderForm, setOrderForm] = useState<OrderInput>({
    receiver: '',
    phone: '',
    address: '',
    deliveryTime: '',
    note: '',
  })
  const [orderErrors, setOrderErrors] = useState<FieldErrors>(EMPTY_ERRORS)
  const [orderNo, setOrderNo] = useState<string | null>(null)
  const [bowlItems, setBowlItems] = useState<BowlItem[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [cooking, setCooking] = useState(false)
  const [recipe, setRecipe] = useState<Recipe | null>(null)
  const [dingUid, setDingUid] = useState<number | null>(null)
  const uidRef = useRef(0)
  const pendingRecipeRef = useRef<Recipe | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    // 键盘无障碍：Tab 聚焦食材后按空格拾起、方向键移动、空格放下
    useSensor(KeyboardSensor)
  )

  const ingredientById = useMemo(() => Object.fromEntries(INGREDIENTS.map((i) => [i.id, i])), [])

  // 营养统计：蛋白质 g / 钙磷比 % / 热量 kcal
  const stats = useMemo(() => {
    let protein = 0
    let ca = 0
    let p = 0
    let cal = 0
    for (const item of bowlItems) {
      const ing = ingredientById[item.ingId]
      if (!ing) continue
      protein += ing.protein
      ca += ing.ca
      p += ing.p
      cal += ing.cal
    }
    const ratio = ca + p > 0 ? Math.round((ca / (ca + p)) * 100) : 0
    return {
      protein,
      ratio,
      cal,
      ratioWarn: bowlItems.length > 0 && (ratio < RATIO_MIN || ratio > RATIO_MAX),
    }
  }, [bowlItems, ingredientById])

  // “叮”弹跳提示自动消失
  useEffect(() => {
    if (dingUid === null) return
    const t = setTimeout(() => setDingUid(null), 800)
    return () => clearTimeout(t)
  }, [dingUid])

  // 烹饪计时（带清理，防连点乱跳）
  useEffect(() => {
    if (!cooking) return
    const t = setTimeout(() => {
      setRecipe(pendingRecipeRef.current)
      setCooking(false)
      toast.success('美味出锅啦！营养配方已生成')
    }, 1400)
    return () => clearTimeout(t)
  }, [cooking, toast])

  const addIngredient = (ingId: string) => {
    // 烹饪中禁止投喂，保证 1.4s 后展示的配方与碗内状态一致
    if (cooking) return
    uidRef.current += 1
    const uid = uidRef.current
    setBowlItems((prev) => [...prev, { uid, ingId }])
    setDingUid(uid)
  }

  const handleDragStart = (e: DragStartEvent) => setActiveId(String(e.active.id))

  const handleDragEnd = (e: DragEndEvent) => {
    setActiveId(null)
    if (e.over?.id === 'bowl' && e.active.id) {
      addIngredient(String(e.active.id))
    }
  }

  const handleGenerate = () => {
    if (bowlItems.length === 0 || cooking) return
    // 以数量最多的食材决定菜名
    const count = new Map<string, number>()
    for (const item of bowlItems) count.set(item.ingId, (count.get(item.ingId) ?? 0) + 1)
    let topId = bowlItems[0].ingId
    for (const [id, n] of count) if (n > (count.get(topId) ?? 0)) topId = id
    const dish = DISH_BY_ING[topId]
    pendingRecipeRef.current = {
      emoji: dish.emoji,
      name: dish.name,
      used: [...count.entries()].map(([id, n]) => `${ingredientById[id].emoji}×${n}`).join(' '),
      protein: stats.protein,
      cal: stats.cal,
    }
    setRecipe(null)
    setCooking(true)
  }

  // 碗内食材汇总 chips
  const bowlSummary = useMemo(() => {
    const count = new Map<string, number>()
    for (const item of bowlItems) count.set(item.ingId, (count.get(item.ingId) ?? 0) + 1)
    return [...count.entries()].map(([id, n]) => ({
      id,
      emoji: ingredientById[id].emoji,
      n,
    }))
  }, [bowlItems, ingredientById])

  const activeIng = activeId ? ingredientById[activeId] : null

  // —— 购物车派生数据 ——
  const cartLines: CartLine[] = useMemo(
    () =>
      cartItems.flatMap((i) => {
        const p = PRODUCTS.find((x) => x.id === i.productId)
        return p ? [{ product: p, qty: i.qty }] : []
      }),
    [cartItems]
  )
  const cartTotal = useMemo(() => cartLines.reduce((s, l) => s + l.product.price * l.qty, 0), [cartLines])
  const cartTotalQty = useMemo(() => cartItems.reduce((s, i) => s + i.qty, 0), [cartItems])

  /** 加入购物车：同商品数量 +1（上限 99），持久化到 localStorage */
  const handleAddToCart = (p: Product) => {
    setCartItems((prev) => {
      const next = prev.some((i) => i.productId === p.id)
        ? prev.map((i) => (i.productId === p.id ? { ...i, qty: Math.min(CART_QTY_MAX, i.qty + 1) } : i))
        : [...prev, { productId: p.id, qty: CART_QTY_MIN }]
      saveCart(next)
      return next
    })
    toast.success(`已加入购物车：${p.name}`)
  }

  /** 购物车数量增减（钳制 1~99），持久化 */
  const handleQty = (productId: string, delta: 1 | -1) => {
    setCartItems((prev) => {
      const next = prev.map((i) =>
        i.productId === productId
          ? { ...i, qty: Math.min(CART_QTY_MAX, Math.max(CART_QTY_MIN, i.qty + delta)) }
          : i
      )
      saveCart(next)
      return next
    })
  }

  const handleRemove = (productId: string) => {
    setCartItems((prev) => {
      const next = prev.filter((i) => i.productId !== productId)
      saveCart(next)
      return next
    })
  }

  /** 表单编辑：更新值并即时清除该字段错误 */
  const handleFormChange = (field: keyof OrderInput, value: string) => {
    setOrderForm((f) => ({ ...f, [field]: value }))
    setOrderErrors((e) => ({ ...e, [field]: null }))
  }

  /** 提交订单：全字段校验；失败逐字段 alert + Toast 汇总；成功进入 done 步并清空购物车 */
  const handleSubmitOrder = () => {
    const res = submitOrder(orderForm, cartItems)
    if (!res.ok) {
      setOrderErrors(res.errors)
      toast.error('请完善收货信息')
      return
    }
    setOrderErrors(EMPTY_ERRORS)
    setOrderNo(res.orderNo)
    setDrawerStep('done')
    setCartItems([])
    saveCart([])
    toast.success('订单已提交')
  }

  /** 继续购物：清空表单、关抽屉、回商店 */
  const handleOrderDone = () => {
    setOrderForm({ receiver: '', phone: '', address: '', deliveryTime: '', note: '' })
    setOrderNo(null)
    setDrawerStep('cart')
    setDrawerOpen(false)
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={pointerWithin}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActiveId(null)}
    >
      <MotionConfig reducedMotion="user">
        <main className="relative min-h-screen overflow-hidden bg-[#FBF5EC] text-[#3E2A20]">
          {/* 厨房案台氛围：极淡的台面纹 */}
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.35]"
            style={{
              backgroundImage:
                'repeating-linear-gradient(0deg, transparent 0 47px, rgba(62,42,32,0.045) 47px 48px)',
            }}
            aria-hidden="true"
          />

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
              className="absolute left-1/2 flex -translate-x-1/2 items-center gap-2.5 rounded-full bg-white py-1.5 pl-2 pr-6 shadow-[0_12px_24px_-14px_rgba(62,42,32,0.35)]"
              initial={{ opacity: 0, y: -12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.15 }}
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#C2410C] text-white">
                <ChefHat size={19} aria-hidden="true" />
              </span>
              <h1 className="text-lg font-black tracking-wide">鲜食工坊</h1>
            </motion.div>
            <span className="hidden h-9 w-9 sm:block" aria-hidden="true" />
          </header>

          {/* 视图切换：鲜食工坊 / 粮食商店 */}
          <div className="relative z-10 mx-auto mt-1 w-fit px-6">
            <div
              className="flex rounded-full bg-white p-1 shadow-[0_12px_24px_-14px_rgba(62,42,32,0.35)]"
              role="tablist"
              aria-label="食堂视图切换"
            >
              {(
                [
                  { key: 'workshop', label: '鲜食工坊', icon: ChefHat },
                  { key: 'shop', label: '粮食商店', icon: Store },
                ] as const
              ).map(({ key, label, icon: Icon }) => (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={tab === key}
                  onClick={() => setTab(key)}
                  className={`inline-flex min-h-[40px] items-center gap-1.5 rounded-full px-5 text-sm font-black transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#C2410C] ${
                    tab === key ? 'bg-[#C2410C] text-white' : 'text-[#3E2A20]/60 hover:text-[#C2410C]'
                  }`}
                >
                  <Icon size={15} aria-hidden="true" />
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* 购物车入口：右上角，点击打开抽屉 */}
          <div className="absolute right-6 top-5 z-20 lg:right-10">
            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              aria-label={cartTotalQty > 0 ? `打开购物车，共 ${cartTotalQty} 件商品` : '打开购物车'}
              className="flex items-center gap-1.5 rounded-full bg-white px-3 py-2 text-sm font-bold text-[#3E2A20] shadow-[0_12px_24px_-14px_rgba(62,42,32,0.4)] transition-colors hover:text-[#C2410C] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#C2410C]"
            >
              <span className="relative flex h-7 w-7 items-center justify-center rounded-full bg-[#C2410C] text-white">
                <ShoppingCart size={14} aria-hidden="true" />
                {cartTotalQty > 0 && (
                  <span className="num-display absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#3E2A20] px-0.5 text-[9px] font-bold text-white">
                    {cartTotalQty}
                  </span>
                )}
              </span>
              购物车
            </button>
          </div>

          {/* 主体三栏：背包 / 大碗 / 属性面板 */}
          {/* 工坊视图：三栏（背包 / 大碗 / 营养秤） */}
          {tab === 'workshop' && (
          <div className="relative z-10 mx-auto grid w-full max-w-7xl grid-cols-1 gap-6 px-6 pb-16 lg:grid-cols-[25%_1fr_28%] lg:px-10">
            {/* 左侧：食材背包 */}
            <section
              className="walk-card self-start rounded-[20px] bg-white p-5"
              aria-label="食材背包"
            >
              <h2 className="mb-4 flex items-center gap-2 text-lg font-black">
                <Beef size={19} className="text-[#C2410C]" aria-hidden="true" /> 食材背包
              </h2>
              <div className="flex flex-col gap-4">
                {ING_GROUPS.map((group) => (
                  <div key={group.label}>
                    <h3 className="mb-2 text-[13px] font-bold text-[#3E2A20]/55">{group.label}</h3>
                    <div className="flex flex-col gap-2.5">
                      {group.ids.map((id) => {
                        const ing = ingredientById[id]
                        return <DraggableIngredient key={id} ing={ing} onAdd={addIngredient} />
                      })}
                    </div>
                  </div>
                ))}
              </div>
              <p className="mt-4 text-center text-xs font-medium text-[#3E2A20]/45">
                拖拽或点击卡片投喂
              </p>
            </section>

            {/* 中间：烹饪大碗 */}
            <section className="flex flex-col items-center gap-5" aria-label="烹饪大碗">
              <div className={`relative ${cooking ? 'cooking' : ''}`}>
                {/* “叮♪”音效感气泡 */}
                <AnimatePresence>
                  {dingUid !== null && (
                    <motion.span
                      key={dingUid}
                      initial={{ opacity: 0, y: 14, scale: 0.6 }}
                      animate={{ opacity: 1, y: -10, scale: 1 }}
                      exit={{ opacity: 0, y: -34, scale: 0.9 }}
                      transition={{ type: 'spring', stiffness: 300, damping: 18 }}
                      className="num-display absolute -top-2 left-1/2 z-20 -translate-x-1/2 rounded-full bg-[#C2410C] px-3 py-1 text-sm font-bold text-white shadow-[0_10px_20px_-10px_rgba(194,65,12,0.6)]"
                      aria-hidden="true"
                    >
                      叮♪
                    </motion.span>
                  )}
                </AnimatePresence>

                {/* 烹饪热气 */}
                {cooking && <Steam />}

                {/* 陶碗本体（useDroppable 在子组件内调用，见 BowlDroppable 注释） */}
                <BowlDroppable
                  cooking={cooking}
                  bowlItems={bowlItems}
                  ingredientById={ingredientById}
                />
                {/* 陶碗小脚 */}
                <span className="absolute -bottom-2 left-10 h-3 w-8 rounded-full bg-[#C9853F] shadow-[0_6px_12px_-6px_rgba(62,42,32,0.5)]" aria-hidden="true" />
                <span className="absolute -bottom-2 right-10 h-3 w-8 rounded-full bg-[#C9853F] shadow-[0_6px_12px_-6px_rgba(62,42,32,0.5)]" aria-hidden="true" />
              </div>

              {/* 烹饪按钮 */}
              <motion.button
                type="button"
                onClick={handleGenerate}
                disabled={bowlItems.length === 0 || cooking}
                whileHover={bowlItems.length > 0 && !cooking ? { scale: 1.02 } : undefined}
                whileTap={bowlItems.length > 0 && !cooking ? { scale: 0.96 } : undefined}
                aria-label="AI 生成营养配方"
                className={`inline-flex min-h-[52px] items-center gap-2 rounded-full bg-[#C2410C] px-9 text-lg font-black text-white shadow-[0_16px_28px_-14px_rgba(194,65,12,0.7)] transition-colors hover:bg-[#A8380A] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#C2410C] focus-visible:ring-offset-2 ${
                  bowlItems.length === 0 || cooking ? 'cursor-not-allowed opacity-50' : ''
                }`}
              >
                <Sparkles size={19} aria-hidden="true" className={cooking ? 'motion-safe:animate-pulse' : ''} />
                {cooking ? '烹饪中...' : 'AI 生成营养配方'}
              </motion.button>
              {bowlItems.length === 0 && !cooking && (
                <p className="text-xs font-medium text-[#3E2A20]/45">先拖点食材进碗吧</p>
              )}

              {/* 食谱卡：撕票边 + 菜品信息 */}
              <AnimatePresence>
                {recipe && !cooking && (
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.96 }}
                    transition={{ type: 'spring', stiffness: 240, damping: 18 }}
                    className="recipe-ticket relative w-full max-w-md bg-white px-5 pb-5 pt-7 shadow-[0_18px_30px_-20px_rgba(62,42,32,0.45)]"
                    aria-label="AI 营养配方结果"
                    role="status"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-4xl" aria-hidden="true">
                        {recipe.emoji}
                      </span>
                      <div>
                        <h3 className="text-lg font-black">{recipe.name}</h3>
                        <p className="text-xs font-bold text-[#3E2A20]/55">食材：{recipe.used}</p>
                      </div>
                    </div>
                    <p className="num-display mt-3 flex items-center gap-1.5 rounded-xl bg-[#FFF3E8] px-3 py-2 text-xs font-bold text-[#8A4A17]">
                      <BadgeCheck size={14} className="shrink-0 text-[#C2410C]" aria-hidden="true" />
                      {`蛋白质 ${recipe.protein}g · 热量 ${recipe.cal}kcal，毛孩子开饭啦`}
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>
            </section>

            {/* 右侧：营养秤面板 */}
            <aside
              className="walk-card relative self-start overflow-hidden rounded-[20px] bg-white p-5 lg:sticky lg:top-24"
              aria-label="营养属性面板"
            >
              <div className="relative z-10 flex flex-col gap-5">
                <h2 className="flex items-center gap-2 text-lg font-black">
                  <Scale size={19} className="text-[#C2410C]" aria-hidden="true" /> 营养属性
                </h2>

                {/* 碗内汇总 */}
                <div className="min-h-[2rem] rounded-2xl bg-[#FFF3E8] px-3 py-2">
                  {bowlSummary.length === 0 ? (
                    <p className="text-xs font-bold text-[#3E2A20]/45">碗还是空的，快去投喂吧～</p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5" aria-label="碗内食材汇总">
                      {bowlSummary.map((s) => (
                        <span
                          key={s.id}
                          className="rounded-full bg-white px-2 py-0.5 text-xs font-black text-[#3E2A20]/75 shadow-[0_6px_12px_-8px_rgba(62,42,32,0.4)]"
                        >
                          {s.emoji}×{s.n}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* 三条营养秤 */}
                <div className="flex flex-col gap-4">
                  <StatBar
                    icon={Beef}
                    label="蛋白质"
                    display={`${stats.protein}g`}
                    width={stats.protein * 1.4}
                  />
                  <StatBar
                    icon={Scale}
                    label="钙磷比"
                    display={`${stats.ratio}%`}
                    width={stats.ratio}
                    warn={stats.ratioWarn}
                  />
                  <StatBar
                    icon={Flame}
                    label="热量"
                    display={`${stats.cal}kcal`}
                    width={stats.cal}
                  />
                </div>

                {/* 钙磷比警告 */}
                <AnimatePresence>
                  {stats.ratioWarn && (
                    <motion.p
                      initial={{ opacity: 0, scale: 0.96, y: 8 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.97 }}
                      transition={{ type: 'spring', stiffness: 300, damping: 18 }}
                      className="flex items-start gap-1.5 rounded-2xl bg-[#FBEAE8] px-3 py-2.5 text-xs font-black leading-relaxed text-[#B3261E]"
                      role="alert"
                    >
                      <TriangleAlert size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
                      {stats.ratio < RATIO_MIN
                        ? '钙磷比失衡（偏低），建议添加鱼油'
                        : '钙磷比超标，建议减少鱼油、多加肉肉'}
                    </motion.p>
                  )}
                </AnimatePresence>

                <p className="num-display text-center text-[11px] font-medium text-[#3E2A20]/45">
                  健康区间：钙磷比 {RATIO_MIN}%~{RATIO_MAX}%
                </p>
              </div>
            </aside>
          </div>
          )}

          {/* 商店视图：狗粮/猫粮商品网格 */}
          {tab === 'shop' && <ShopView onAdd={handleAddToCart} />}

          {/* 购物车抽屉：列表 → 结算表单 → 下单成功 */}
          <CartDrawer
            open={drawerOpen}
            step={drawerStep}
            lines={cartLines}
            total={cartTotal}
            form={orderForm}
            errors={orderErrors}
            orderNo={orderNo}
            onClose={() => setDrawerOpen(false)}
            onStep={setDrawerStep}
            onQty={handleQty}
            onRemove={handleRemove}
            onFormChange={handleFormChange}
            onSubmit={handleSubmitOrder}
            onDone={handleOrderDone}
          />
        </main>
      </MotionConfig>

      {/* 拖拽跟随悬浮层 */}
      <DragOverlay>
        {activeIng && (
          <span className="inline-block text-5xl drop-shadow-lg" aria-hidden="true">
            {activeIng.emoji}
          </span>
        )}
      </DragOverlay>
    </DndContext>
  )
}

export default Recipe
