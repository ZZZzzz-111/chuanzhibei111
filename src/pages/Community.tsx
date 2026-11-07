import { useEffect, useMemo, useState } from 'react'
import { motion, AnimatePresence, MotionConfig } from 'framer-motion'
import BackToPlanet from '../components/BackToPlanet'
import { Bookmark, Heart, Search, Users, X } from 'lucide-react'
import '../styles/walk.css'

/* ============ 调色板（黄昏·社区广场） ============
 * 暮色纸 #FAF1F2 · 深茄墨 #3A2430 · 暮玫瑰 #E4586B · 玫瑰雾 #FBE7EA
 */

/* ============ 数据 ============ */

interface Note {
  id: number
  emoji: string
  /** 封面渐变（暮色系轮换） */
  bg: string
  title: string
  text: string
  topic: string
  author: string
  authorEmoji: string
  likes: number
  /** 归属分栏：关注 / 发现 / 附近（附近附带距离） */
  tab: 'follow' | 'discover' | 'nearby'
  dist?: string
}

const NOTES: Note[] = [
  {
    id: 1, emoji: '🐱', bg: 'linear-gradient(135deg,#FDE4E4,#F4A9B8)', title: '耳螨反复不好？我用了这三步',
    text: '我家猫耳螨拖了两个月，宠物医院开的药 + 每天用洗耳液清洁 + 伊丽莎白圈防抓，三周彻底好了。关键是坚持清洁，别看到好转就停药。本篇仅个人经验，严重请及时就医。',
    topic: '耳螨护理', author: '团子妈', authorEmoji: '🧶', likes: 1286, tab: 'follow',
  },
  {
    id: 2, emoji: '🐈', bg: 'linear-gradient(135deg,#FDEBDD,#F2B897)', title: '挑食猫改造计划第 7 天，成功了！',
    text: '定点定量、20 分钟不吃就撤走、零食全部收起来。前三天它对我爱答不理，第四天开始主动干饭。挑食大部分是惯出来的，狠下心一周就能改正。',
    topic: '挑食改正', author: '鱼干侦探', authorEmoji: '🎣', likes: 963, tab: 'follow',
  },
  {
    id: 3, emoji: '🏡', bg: 'linear-gradient(135deg,#FDE0DC,#EE8F9C)', title: '领养代替购买：我家三花的领养日记',
    text: '从小区救助站接它回家三个月了，从躲床底到主动踩奶。领养的猫不欠我们什么，是我们幸运地被它选中。附上门体检和过渡期用品清单。',
    topic: '领养代替购买', author: '南巷拾光', authorEmoji: '🌇', likes: 2310, tab: 'nearby', dist: '0.8km',
  },
  {
    id: 4, emoji: '🐕', bg: 'linear-gradient(135deg,#FCE8D5,#E9AE6B)', title: '金毛掉毛季自救指南（亲测有效）',
    text: '每天 5 分钟梳毛 + 一周三次鱼油 + 洗澡用护毛素。掉毛季不可怕，可怕的是满屋毛还不梳。文末附我家梳毛工具清单。',
    topic: '掉毛季', author: '大金noah', authorEmoji: '🌞', likes: 1587, tab: 'discover',
  },
  {
    id: 5, emoji: '🦷', bg: 'linear-gradient(135deg,#E8E6F7,#B9B3E8)', title: '狗狗牙结石清理全过程记录',
    text: '宠物医院的洁牙需要麻醉，术前做了全套血检。麻醉不可怕，不做口腔护理才可怕。现在每周给它刷牙三次，口气清新多了。',
    topic: '口腔护理', author: '兽护小张', authorEmoji: '🩺', likes: 742, tab: 'discover',
  },
  {
    id: 6, emoji: '⛺', bg: 'linear-gradient(135deg,#FDEBD2,#EFC178)', title: '周末带猫出门露营全攻略',
    text: '胸背带提前两周在家适应、背包选硬壳透气款、先从楼下草地开始短途训练。我家猫现在能在帐篷里晒一下午太阳。安全绳一定要拴！',
    topic: '遛猫', author: '帐篷与猫', authorEmoji: '⛺', likes: 1105, tab: 'nearby', dist: '1.6km',
  },
  {
    id: 7, emoji: '💉', bg: 'linear-gradient(135deg,#FBE0EA,#EFA3C0)', title: '绝育后护理注意事项合集',
    text: '头三天戴圈、伤口每天观察、营养膏别急着加。母猫比公猫恢复慢，多陪陪它。第七天拆线后就满血复活了。有异常分泌物立刻回院。',
    topic: '绝育护理', author: '团子妈', authorEmoji: '🧶', likes: 1688, tab: 'follow',
  },
  {
    id: 8, emoji: '🍳', bg: 'linear-gradient(135deg,#FCE9D9,#F0A97E)', title: '自制鲜食一周搭配（附营养配比）',
    text: '鸡胸肉 + 南瓜 + 西兰花为主，鱼油补钙磷比，一切都按钙磷比 40%~70% 的区间来算。附我家七天不重样菜单和克数表。',
    topic: '鲜食日记', author: '米娅和皮蛋', authorEmoji: '🍮', likes: 2044, tab: 'discover',
  },
  {
    id: 9, emoji: '📣', bg: 'linear-gradient(135deg,#FDE3E9,#F0909F)', title: '走失 48 小时找回！全靠邻居接力',
    text: '猫从纱窗溜走，物业群 + 寻宠雷达 + 楼下便利店监控，第 48 小时在车库找到。给所有养猫人提个醒：纱窗一定要装锁扣！',
    topic: '走失找回', author: '老周家的猫', authorEmoji: '🧢', likes: 3077, tab: 'nearby', dist: '2.3km',
  },
  {
    id: 10, emoji: '🗓️', bg: 'linear-gradient(135deg,#EDE9FB,#B9ABEF)', title: '幼犬疫苗时间表，一篇讲清楚',
    text: '45 天首针联苗，间隔 21 天第二三针，狂犬三个月后打。打完一周内别洗澡别出门。收藏这张表，新手不迷路。',
    topic: '疫苗科普', author: '兽护小张', authorEmoji: '🩺', likes: 4231, tab: 'discover',
  },
  {
    id: 11, emoji: '🐾', bg: 'linear-gradient(135deg,#FCE5DC,#EDA184)', title: '我家狗学会握手只用了三天',
    text: '零食引诱 + 口令固定 + 每次成功立刻奖励。第三天它已经会主动伸爪碰我的手。训练的核心是让狗觉得好玩，不是让它害怕。',
    topic: '训练打卡', author: '椰椰和球球', authorEmoji: '🥥', likes: 1320, tab: 'follow',
  },
  {
    id: 12, emoji: '💧', bg: 'linear-gradient(135deg,#FCE7E0,#EF9E8A)', title: '猫咪喝水神器测评：5 款饮水机',
    text: '流动水源的饮水量确实比静态碗高 40%。但噪音大的机器猫反而不喝。综合静音、滤芯成本、清洗难度，我留了两款，另外三款闲置了。',
    topic: '喝水测评', author: '鱼干侦探', authorEmoji: '🎣', likes: 1875, tab: 'discover',
  },
]

const TABS = [
  { key: 'follow', label: '关注' },
  { key: 'discover', label: '发现' },
  { key: 'nearby', label: '附近' },
] as const

type TabKey = (typeof TABS)[number]['key']

/** 封面高度轮换：制造瀑布流的高低错落 */
const COVER_HEIGHTS = ['h-40', 'h-28', 'h-44', 'h-32', 'h-36']

/* ============ 小组件 ============ */

/** 点赞按钮：心形填充 + 弹跳反馈 */
function LikeButton({
  liked,
  likes,
  onToggle,
  size = 'sm',
}: {
  liked: boolean
  likes: number
  onToggle: () => void
  size?: 'sm' | 'lg'
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        onToggle()
      }}
      aria-pressed={liked}
      aria-label={liked ? '取消点赞' : '点赞'}
      className={`inline-flex min-h-[36px] items-center gap-1 rounded-full px-2 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#E4586B] ${
        liked ? 'text-[#E4586B]' : 'text-[#3A2430]/55 hover:text-[#E4586B]'
      } ${size === 'lg' ? 'text-sm' : 'text-[11px]'}`}
    >
      <motion.span
        key={String(liked)}
        initial={{ scale: liked ? 1.5 : 1 }}
        animate={{ scale: 1 }}
        transition={{ type: 'spring', stiffness: 400, damping: 12 }}
        className="inline-flex"
        aria-hidden="true"
      >
        <Heart size={size === 'lg' ? 18 : 14} fill={liked ? 'currentColor' : 'none'} />
      </motion.span>
      <span className="num-display font-bold">{likes}</span>
    </button>
  )
}

/* ============ 页面 ============ */

function Community() {
  const [tab, setTab] = useState<TabKey>('discover')
  const [query, setQuery] = useState('')
  const [likedIds, setLikedIds] = useState<Set<number>>(new Set())
  const [savedIds, setSavedIds] = useState<Set<number>>(new Set())
  const [openId, setOpenId] = useState<number | null>(null)

  // Tab 过滤（发现页展示全部内容）+ 关键词搜索（标题/话题/作者）
  const feed = useMemo(() => {
    const pool = tab === 'discover' ? NOTES : NOTES.filter((n) => n.tab === tab)
    const kw = query.trim().toLowerCase()
    return pool.filter((n) =>
      kw
        ? n.title.toLowerCase().includes(kw) ||
          n.topic.toLowerCase().includes(kw) ||
          n.author.toLowerCase().includes(kw)
        : true
    )
  }, [tab, query])

  const openNote = openId !== null ? NOTES.find((n) => n.id === openId) ?? null : null

  // Esc 关闭详情弹层
  useEffect(() => {
    if (openId === null) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpenId(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [openId])

  const toggleLike = (id: number) => {
    setLikedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }
  const toggleSave = (id: number) => {
    setSavedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }
  const likeCount = (n: Note) => n.likes + (likedIds.has(n.id) ? 1 : 0)

  return (
    <MotionConfig reducedMotion="user">
      <main className="relative min-h-screen overflow-x-hidden bg-[#FAF1F2] text-[#3A2430]">
        {/* 黄昏广场氛围：极淡的落日光晕 */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'radial-gradient(circle at 85% 0%, rgba(228,88,107,0.08) 0%, rgba(228,88,107,0.03) 30%, transparent 55%)',
          }}
          aria-hidden="true"
        />

        {/* 顶部导航 */}
        <header className="relative z-10 flex items-center justify-between px-6 py-5 lg:px-10">
          <motion.div initial={{ opacity: 0, x: -24 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.5 }} className="inline-block">
            <BackToPlanet />
          </motion.div>
          <motion.div
            className="absolute left-1/2 flex -translate-x-1/2 items-center gap-2.5 rounded-full bg-white py-1.5 pl-2 pr-6 shadow-[0_12px_24px_-14px_rgba(228,88,107,0.45)]"
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.15 }}
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#E4586B] text-white">
              <Users size={19} aria-hidden="true" />
            </span>
            <h1 className="text-lg font-black tracking-wide">宠物圈</h1>
          </motion.div>
          <div className="hidden items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-bold text-[#E4586B] shadow-[0_12px_24px_-14px_rgba(228,88,107,0.45)] sm:flex">
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full rounded-full bg-[#E4586B] opacity-50 motion-safe:animate-ping" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-[#E4586B]" />
            </span>
            广场在线
          </div>
        </header>

        {/* 吸顶工具条：分栏 Tab + 搜索 */}
        <div className="sticky top-0 z-20 border-b border-[#3A2430]/8 bg-[#FAF1F2]/95 backdrop-blur">
          <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-3 px-6 py-3 lg:px-10">
            <div
              className="flex rounded-full bg-white p-1 shadow-[0_10px_20px_-14px_rgba(228,88,107,0.5)]"
              role="tablist"
              aria-label="宠物圈分栏"
            >
              {TABS.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  role="tab"
                  aria-selected={tab === t.key}
                  onClick={() => setTab(t.key)}
                  className={`inline-flex min-h-[36px] items-center rounded-full px-4 text-sm font-black transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#E4586B] ${
                    tab === t.key ? 'bg-[#E4586B] text-white' : 'text-[#3A2430]/60 hover:text-[#E4586B]'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <label className="ml-auto flex min-h-[36px] w-full max-w-[240px] items-center gap-1.5 rounded-full border-2 border-[#3A2430]/10 bg-white px-3 transition-colors focus-within:border-[#E4586B] sm:w-auto">
              <Search size={14} className="shrink-0 text-[#3A2430]/40" aria-hidden="true" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="搜笔记 / 话题 / 铲屎官"
                aria-label="搜索宠物圈笔记"
                className="w-full bg-transparent text-xs font-bold outline-none placeholder:font-medium placeholder:text-[#3A2430]/35"
              />
            </label>
          </div>
        </div>

        {/* 瀑布流笔记流 */}
        <div className="relative z-10 mx-auto w-full max-w-6xl px-6 pb-16 pt-5 lg:px-10">
          {feed.length === 0 ? (
            <div className="rounded-[20px] bg-white px-4 py-14 text-center shadow-[0_14px_28px_-18px_rgba(228,88,107,0.35)]">
              <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[#FBE7EA] text-[#E4586B]" aria-hidden="true">
                <Search size={26} />
              </span>
              <p className="mt-4 text-sm font-black">没有找到相关笔记</p>
              <p className="mt-1 text-xs font-medium text-[#3A2430]/45">换个关键词，或者去发现页逛逛</p>
            </div>
          ) : (
            <div className="columns-2 gap-4 sm:columns-3 xl:columns-4 [&>*]:mb-4">
              {feed.map((n, i) => (
                <motion.article
                  key={n.id}
                  initial={{ opacity: 0, y: 18 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ type: 'spring', stiffness: 220, damping: 22, delay: Math.min(i * 0.05, 0.4) }}
                  className="walk-card break-inside-avoid overflow-hidden rounded-2xl bg-white"
                >
                  {/* 封面（点击打开详情） */}
                  <button
                    type="button"
                    onClick={() => setOpenId(n.id)}
                    aria-label={`打开笔记：${n.title}`}
                    className="relative block w-full text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-[#E4586B]"
                  >
                    <span
                      className={`relative flex items-center justify-center ${COVER_HEIGHTS[n.id % COVER_HEIGHTS.length]}`}
                      style={{ background: n.bg }}
                      aria-hidden="true"
                    >
                      <span className="text-5xl drop-shadow-sm">{n.emoji}</span>
                    </span>
                    <span className="absolute bottom-2 left-2 rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-black text-[#E4586B]">
                      #{n.topic}
                    </span>
                    {n.dist && (
                      <span className="absolute right-2 top-2 rounded-full bg-[#3A2430]/60 px-2 py-0.5 text-[10px] font-bold text-white">
                        {n.dist}
                      </span>
                    )}
                  </button>
                  <div className="p-3">
                    <button
                      type="button"
                      onClick={() => setOpenId(n.id)}
                      className="block w-full text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-[#E4586B] focus-visible:ring-offset-2"
                    >
                      <h2 className="line-clamp-2 text-[13px] font-black leading-snug">{n.title}</h2>
                    </button>
                    <div className="mt-2 flex items-center justify-between">
                      <span className="flex min-w-0 items-center gap-1.5">
                        <span
                          className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#FBE7EA] text-[11px]"
                          aria-hidden="true"
                        >
                          {n.authorEmoji}
                        </span>
                        <span className="truncate text-[11px] font-bold text-[#3A2430]/55">{n.author}</span>
                      </span>
                      <LikeButton
                        liked={likedIds.has(n.id)}
                        likes={likeCount(n)}
                        onToggle={() => toggleLike(n.id)}
                      />
                    </div>
                  </div>
                </motion.article>
              ))}
            </div>
          )}
        </div>

        {/* 笔记详情弹层（本页仪式动效） */}
        <AnimatePresence>
          {openNote && (
            <motion.div
              key="note-modal"
              className="fixed inset-0 z-50 flex items-end justify-center bg-[#3A2430]/45 p-0 backdrop-blur-sm sm:items-center sm:p-6"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={() => setOpenId(null)}
            >
              <motion.article
                role="dialog"
                aria-modal="true"
                aria-label={`笔记详情：${openNote.title}`}
                initial={{ opacity: 0, y: 60, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 40, scale: 0.97 }}
                transition={{ type: 'spring', stiffness: 300, damping: 26 }}
                className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-[24px] bg-white sm:rounded-[24px]"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="relative flex h-44 items-center justify-center" style={{ background: openNote.bg }}>
                  <span className="text-6xl drop-shadow-sm" aria-hidden="true">
                    {openNote.emoji}
                  </span>
                  <button
                    type="button"
                    onClick={() => setOpenId(null)}
                    aria-label="关闭笔记"
                    className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full bg-white/90 text-[#3A2430] transition-colors hover:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#E4586B]"
                  >
                    <X size={16} aria-hidden="true" />
                  </button>
                </div>
                <div className="p-5">
                  <span className="rounded-full bg-[#FBE7EA] px-2.5 py-1 text-[11px] font-black text-[#E4586B]">
                    #{openNote.topic}
                  </span>
                  <h2 className="mt-3 text-lg font-black leading-snug">{openNote.title}</h2>
                  <p className="mt-2 text-sm font-medium leading-7 text-[#3A2430]/75">{openNote.text}</p>
                  <div className="mt-5 flex items-center justify-between border-t border-[#3A2430]/8 pt-4">
                    <span className="flex items-center gap-2">
                      <span
                        className="flex h-8 w-8 items-center justify-center rounded-full bg-[#FBE7EA] text-sm"
                        aria-hidden="true"
                      >
                        {openNote.authorEmoji}
                      </span>
                      <span className="text-sm font-black">{openNote.author}</span>
                      {openNote.dist && (
                        <span className="rounded-full bg-[#FBE7EA] px-2 py-0.5 text-[10px] font-bold text-[#E4586B]">
                          距你 {openNote.dist}
                        </span>
                      )}
                    </span>
                    <span className="flex items-center gap-1">
                      <LikeButton
                        liked={likedIds.has(openNote.id)}
                        likes={likeCount(openNote)}
                        onToggle={() => toggleLike(openNote.id)}
                        size="lg"
                      />
                      <button
                        type="button"
                        onClick={() => toggleSave(openNote.id)}
                        aria-pressed={savedIds.has(openNote.id)}
                        aria-label={savedIds.has(openNote.id) ? '取消收藏' : '收藏笔记'}
                        className={`inline-flex h-[36px] items-center gap-1 rounded-full px-2.5 text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#E4586B] ${
                          savedIds.has(openNote.id) ? 'text-[#E4586B]' : 'text-[#3A2430]/55 hover:text-[#E4586B]'
                        }`}
                      >
                        <Bookmark size={17} fill={savedIds.has(openNote.id) ? 'currentColor' : 'none'} aria-hidden="true" />
                        收藏
                      </button>
                    </span>
                  </div>
                </div>
              </motion.article>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </MotionConfig>
  )
}

export default Community
