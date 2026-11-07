import { Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'

/**
 * 返回星球按钮：白色胶囊，悬停时墨色滑块向右铺满。
 * 中性配色以适配四个模块页各自的纸色 / 暗色底。
 * 文案与首页"生态星球"术语保持一致。
 */
function BackToPlanet() {
  return (
    <Link
      to="/"
      aria-label="返回生态星球首页"
      className="group relative block h-12 w-44 rounded-full bg-white text-base font-bold text-[#3B2F26]/80 shadow-[0_12px_24px_-14px_rgba(59,47,38,0.4)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2E7D46] focus-visible:ring-offset-2"
    >
      <div className="absolute left-1 top-1 z-10 flex h-10 w-[38px] items-center justify-center rounded-full bg-[#3B2F26] text-white transition-[width] duration-500 group-hover:w-[168px]">
        <ArrowLeft size={18} aria-hidden="true" />
      </div>
      <p className="pr-5 text-right leading-[2.75rem]">返回星球</p>
    </Link>
  )
}

export default BackToPlanet
