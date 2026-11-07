import { motion } from 'framer-motion'
import { PawPrint } from 'lucide-react'

interface LoadingRunProps {
  targetName?: string
  /** 目标模块功能预告（固定文案，替代通用贴士轮播） */
  teaser?: string
  /** true 时小狗向右冲刺出屏，衔接页面切换 */
  sprint?: boolean
}

/**
 * 全屏加载动画：小狗沿爪印逐格跳走，爪印即进度条；
 * 最后冲刺出屏，视觉上"跑进了新页面"。
 */
function LoadingRun({ targetName, teaser, sprint = false }: LoadingRunProps) {
  return (
    <div
      className="flex flex-col items-center gap-10"
      role="status"
      aria-label={`正在前往${targetName ?? '目的地'}`}
    >
      {/* 文案区：主标题 + 目标模块功能预告 */}
      <div className="text-center">
        <p className="text-2xl font-black tracking-wide text-white drop-shadow-md">
          正在前往{targetName ?? '目的地'}…
        </p>
        {teaser && (
          <motion.p
            className="mt-3 text-sm font-medium text-white/85"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5, duration: 0.3 }}
          >
            {teaser}
          </motion.p>
        )}
      </div>

      {/* 奔跑区：4 枚爪印依次点亮后不熄灭（伪进度条），小狗随节拍逐格前进 */}
      <div className="flex items-end" aria-hidden="true">
        {[0, 1, 2, 3].map((i) => (
          <motion.span
            key={i}
            className="mb-1 mr-6"
            initial={{ opacity: 0.15, scale: 0.8 }}
            animate={{ opacity: 0.95, scale: 1 }}
            transition={{ delay: 0.5 + i * 0.45, duration: 0.3, ease: 'easeOut' }}
          >
            <PawPrint size={20} className="text-emerald-950/70" />
          </motion.span>
        ))}
        <motion.div
          animate={
            sprint
              ? { x: 560, opacity: 0, transition: { duration: 0.35, ease: 'easeIn' } }
              : { x: [0, 26, 52, 78], transition: { delay: 0.45, duration: 1.8, times: [0, 0.33, 0.66, 1], ease: 'easeOut' } }
          }
        >
          {/* 落地弹跳 */}
          <motion.div
            animate={{ y: [0, -7, 0] }}
            transition={{ duration: 0.45, repeat: Infinity, ease: 'easeInOut' }}
          >
            <div style={{ transform: 'scale(2.2)', transformOrigin: 'bottom right' }}>
              <div
                className="sprite-dog walking"
                style={{ width: 36, height: 36, transform: 'scaleX(-1)' }}
              />
            </div>
          </motion.div>
        </motion.div>
      </div>
    </div>
  )
}

export default LoadingRun
