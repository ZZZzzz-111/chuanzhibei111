/**
 * czb-glm-proxy —— Cloudflare Worker
 *
 * 中转前端 → 智谱 GLM 开放平台：
 * 1. GLM_API_KEY 存在 Worker 的 Secret 里，前端 bundle 完全不持有 Key
 * 2. 注入 CORS 头，让 github.io 页面可以跨域调用
 * 3. 只放行页面域名（GitHub Pages）和本地开发地址，防止接口被滥用
 *
 * 部署：见同级 deploy.sh（token 与 key 从环境变量读取，不落盘）
 */

const TARGET = 'https://open.bigmodel.cn/api/paas/v4/chat/completions'

/** 允许调用此 Worker 的来源（部署后按实际 Pages 域名调整） */
const ALLOWED_ORIGINS = [
  'https://zzzzzz-111.github.io', // GitHub Pages 站点
  'http://localhost:5173', // 本地开发
  'http://127.0.0.1:5173',
]

function cors(origin) {
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ''
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  }
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || ''
    const corsHeaders = cors(origin)

    // 预检请求直接放行
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders })
    }

    // 非白名单来源拒绝
    if (!ALLOWED_ORIGINS.includes(origin)) {
      return new Response('forbidden origin', { status: 403, headers: corsHeaders })
    }
    if (request.method !== 'POST') {
      return new Response('method not allowed', { status: 405, headers: corsHeaders })
    }
    if (!env.GLM_API_KEY) {
      return new Response('worker secret GLM_API_KEY missing', { status: 500, headers: corsHeaders })
    }

    // 转发到智谱（SSE 流式原样回传）
    const body = await request.text()
    const upstream = await fetch(TARGET, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.GLM_API_KEY}`,
      },
      body,
    })

    return new Response(upstream.body, {
      status: upstream.status,
      headers: {
        ...corsHeaders,
        'Content-Type': upstream.headers.get('Content-Type') || 'text/event-stream',
        'Cache-Control': 'no-cache',
      },
    })
  },
}
