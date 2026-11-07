import type { CSSProperties } from 'react'

/**
 * 星球装饰：一栋房子（球顶左侧）、一棵大树林（球顶右侧），
 * 外加几棵小树点缀，都长在最外圈的球缘上。
 *
 * 底边中心锚在圆周点上，再按该点的圆周角旋转，
 * 让平底板边与球面切线平行——四个角都不会悬空，接触面严丝合缝。
 *
 * 白天与夜晚的云都在星球外漂移，夜晚只做压暗处理，不再收进球内（避免像脏斑）。
 */
const FOREST_SPRITE: CSSProperties = {
  backgroundImage: "url('/images/forest.png')",
  backgroundSize: '100% 100%',
  backgroundRepeat: 'no-repeat',
}
const HOUSE_SPRITE: CSSProperties = {
  backgroundImage: "url('/images/house%20(2).png')",
  backgroundSize: '100% 100%',
  backgroundRepeat: 'no-repeat',
}
const TREE_SPRITE: CSSProperties = {
  backgroundImage: "url('/images/tree-512x512.png')",
  backgroundSize: '100% 100%',
  backgroundRepeat: 'no-repeat',
}


/** cloud.png 是 2 列 × 4 行雪碧图，按单元格切出单朵云 */
function cloudSprite(col: number, row: number): CSSProperties {
  return {
    backgroundImage: "url('/images/cloud.png')",
    backgroundSize: '200% 400%',
    backgroundPosition: `${col * 100}% ${(row * 100) / 3}%`,
    backgroundRepeat: 'no-repeat',
  }
}

/** 地表装饰：底边中心对齐球面内的圆周点，始终保持正立 */
function SurfaceItem({
  angle,
  radius,
  width,
  height,
  sprite,
  dim,
  inset = 3,
  tilt = 0,
  glow = false,
}: {
  angle: number
  radius: number
  width: number
  height: number
  sprite: CSSProperties
  dim: boolean
  /** 向球心方向内收的距离：0 表示底边正好站在星球圆周上 */
  inset?: number
  /** 绕底边中心旋转的角度，用来让底边与球面切线平行（接触面严丝合缝） */
  tilt?: number
  /** 是否需要暖黄色描边光晕（给插画风素材从深绿贴图里跳出来） */
  glow?: boolean
}) {
  const rad = (angle * Math.PI) / 180
  const r = radius - inset
  const x = r * Math.sin(rad)
  const y = -r * Math.cos(rad)

  const filters: string[] = []
  if (glow) {
    filters.push(`drop-shadow(0 0 6px ${dim ? 'rgba(250,204,21,0.3)' : 'rgba(253,224,71,0.6)'})`)
  }
  if (dim) filters.push('brightness(0.72) saturate(0.9)')

  return (
    <div
      className="pointer-events-none absolute z-[4]"
      style={{
        left: `calc(50% + ${x}px)`,
        top: `calc(50% + ${y}px)`,
        width,
        height,
        transform: `translate(-50%, -100%) rotate(${tilt}deg)`,
        transformOrigin: '50% 100%',
        filter: filters.length ? filters.join(' ') : undefined,
        transition: 'filter 0.7s',
        ...sprite,
      }}
      aria-hidden="true"
    />
  )
}

function PlanetDecor({ radius, isNight }: { radius: number; isNight: boolean }) {
  return (
    <>
      {/* ----------
          地球最外圈上只留一栋房子和一棵树：
          底边中心压在球缘内侧 4px，各自按圆周角旋转（338° → -22°、26° → 26°），
          使底边与球面切线平行，四角贴合、不悬空；
          角度分别落在球顶左右，避开角色（人 0°、狗 13°）与六个模块胶囊。
      ---------- */}
      <SurfaceItem angle={338} radius={radius} width={62} height={62} sprite={HOUSE_SPRITE} dim={isNight} inset={4} tilt={-22} glow />
      <SurfaceItem angle={26} radius={radius} width={80} height={80} sprite={FOREST_SPRITE} dim={isNight} inset={4} tilt={26} glow />

      {/* ----------
          小树点缀：同样长在球缘，按圆周角倾斜贴合球面；
          分布在球顶左右的上半圈空档里（模块胶囊下方的斜坡各一棵 + 房子两侧各一棵），
          避开模块胶囊与角色站位，数量 4 棵，点缀而不喧宾夺主。
      ---------- */}
      <SurfaceItem angle={300} radius={radius} width={30} height={30} sprite={TREE_SPRITE} dim={isNight} inset={4} tilt={-60} glow />
      <SurfaceItem angle={328} radius={radius} width={36} height={36} sprite={TREE_SPRITE} dim={isNight} inset={4} tilt={-32} glow />
      <SurfaceItem angle={350} radius={radius} width={34} height={34} sprite={TREE_SPRITE} dim={isNight} inset={4} tilt={-10} glow />
      <SurfaceItem angle={62} radius={radius} width={30} height={30} sprite={TREE_SPRITE} dim={isNight} inset={4} tilt={62} glow />

      {/* ---------- 云朵：日夜都在球外漂移，夜晚压暗 ---------- */}
      {([
        { top: '12%', w: 70, h: 47, dur: 75, delay: -20, sprite: cloudSprite(1, 0) },
        { top: '8%', w: 40, h: 27, dur: 90, delay: -70, sprite: cloudSprite(0, 3) },
      ]).map((c, i) => (
        <div
          key={i}
          className="pointer-events-none absolute left-0 -z-10"
          style={{
            top: c.top,
            opacity: isNight ? 0.55 : 1,
            filter: isNight ? 'brightness(0.5)' : undefined,
            transition: 'opacity 0.7s, filter 0.7s',
            animation: `cloud-drift ${c.dur}s linear infinite`,
            animationDelay: `${c.delay}s`,
          }}
          aria-hidden="true"
        >
          <div style={{ width: c.w, height: c.h, ...c.sprite }} />
        </div>
      ))}
    </>
  )
}

export default PlanetDecor
