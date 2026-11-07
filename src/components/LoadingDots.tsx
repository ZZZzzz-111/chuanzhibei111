import { motion } from 'framer-motion'

/**
 * 全局加载动画：三个圆点从左到右依次填充颜色，循环递进
 * （参考《喜羊羊与灰太狼》经典加载样式）
 */
function LoadingDots({ label = '加载中' }: { label?: string }) {
  return (
    <div
      className="flex items-center gap-3"
      role="status"
      aria-label={label}
    >
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="block h-4 w-4 rounded-full"
          animate={{
            backgroundColor: [
              'rgba(255, 255, 255, 0.25)',
              '#ffffff',
              'rgba(255, 255, 255, 0.25)',
            ],
            scale: [1, 1.25, 1],
          }}
          transition={{
            duration: 1.05,
            repeat: Infinity,
            delay: i * 0.175,
            ease: 'easeInOut',
          }}
          style={{ willChange: 'transform, background-color' }}
        />
      ))}
    </div>
  )
}

export default LoadingDots
