/* ============ 智谱 BigModel（GLM）客户端 ============ */

/**
 * 接口地址（自动三态，无需任何配置）：
 * - 本地开发（npm run dev）：/api/glm/chat/completions，走 vite.config.mjs 的 glm-proxy 中间件，前端带本地 Key
 * - 生产构建（npm run build）：Cloudflare Worker czb-glm-proxy，Key 由 Worker Secret 注入，前端零密钥
 * - VITE_GLM_PROXY_URL 可显式覆盖 Worker 地址（换域名/自建中转时用）
 */
const WORKER_URL = 'https://czb-glm-proxy.2160410393.workers.dev'

/** 显式配置了 Worker 地址（VITE_GLM_PROXY_URL）时，生产环境 AI 全量可用 */
const EXPLICIT_WORKER = Boolean(import.meta.env.VITE_GLM_PROXY_URL)

const USE_WORKER = EXPLICIT_WORKER || import.meta.env.DEV === false

const API_URL: string =
  import.meta.env.VITE_GLM_PROXY_URL ?? (import.meta.env.DEV ? '/api/glm/chat/completions' : WORKER_URL)

const MODEL = 'glm-4-flash'

export const GLM_API_KEY: string = import.meta.env.VITE_GLM_API_KEY ?? ''

/**
 * AI 是否可用（不可用时请展示 aiUnavailableReason() 的引导文案）
 */
export function isApiConfigured(): boolean {
  return aiUnavailableReason() === null
}

/**
 * AI 不可用时的面向用户说明；null = 可用。
 * - 显式配置了 Worker（VITE_GLM_PROXY_URL）：生产环境 AI 全量可用
 * - 线上静态版（GitHub Pages 直发、未配 Worker）：不发起注定失败的请求，给出引导
 * - 本地开发：检查 .env 的 Key
 */
export function aiUnavailableReason(): string | null {
  if (EXPLICIT_WORKER) return null
  if (import.meta.env.DEV === false) {
    return '在线演示版未包含 AI 服务。请在本地运行项目体验完整 AI 功能（配置方法见 README），或观看演示视频。'
  }
  return GLM_API_KEY.length > 0
    ? null
    : '尚未配置 API Key。请复制 .env.example 为 .env，填入智谱 VITE_GLM_API_KEY 后重启开发服务器。'
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

const VET_SYSTEM_PROMPT =
  '你是一位专业、耐心的宠物 AI 兽医。请针对用户描述的宠物症状，给出：' +
  '1）最可能的诊断（附置信度）；2）可能的其他病因；3）详细治疗方案；' +
  '4）日常护理建议。' +
  '如果症状涉及宠物用药，请在回答末尾单独一行输出「【推荐药品】」，' +
  '随后每种药品单独一行，严格按此格式书写：药名｜适用症状｜用法用量｜注意事项，' +
  '不要加粗、不要加序号、不要有多余文字。' +
  '全程使用中文，语气专业温和，最后务必提醒：本回答仅供参考，确诊请及时到宠物医院就诊。'

export interface StreamCallbacks {
  onDelta: (text: string) => void
  onError?: (message: string) => void
}

/**
 * 以 SSE 流式调用 GLM，返回完整回答文本。
 * 网络/HTTP 错误会抛出 Error，由调用方展示提示。
 * systemPrompt 可选：不传使用内置兽医 system prompt（Clinic 行为不变）。
 */
export async function streamChat(
  messages: ChatMessage[],
  callbacks: StreamCallbacks,
  signal?: AbortSignal,
  systemPrompt: string = VET_SYSTEM_PROMPT,
): Promise<string> {
  const resp = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      // Worker 模式由服务端注入 Key，前端不持有；本地代理模式由前端带本地 Key
      ...(USE_WORKER ? {} : { Authorization: `Bearer ${GLM_API_KEY}` }),
    },
    body: JSON.stringify({
      model: MODEL,
      stream: true,
      messages: [{ role: 'system', content: systemPrompt }, ...messages],
    }),
    signal,
  })

  if (!resp.ok) {
    const body = await resp.text().catch(() => '')
    if (resp.status === 401) throw new Error('API Key 无效或未配置')
    throw new Error(`AI 服务返回 ${resp.status}${body ? `：${body.slice(0, 300)}` : ''}`)
  }
  if (!resp.body) throw new Error('AI 服务未返回流式内容')

  const reader = resp.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let full = ''

  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''

    for (const raw of lines) {
      const line = raw.trim()
      if (!line.startsWith('data:')) continue
      const payload = line.slice(5).trim()
      if (payload === '[DONE]') return full
      try {
        const json = JSON.parse(payload)
        const delta: unknown = json?.choices?.[0]?.delta?.content
        if (typeof delta === 'string' && delta) {
          full += delta
          callbacks.onDelta(delta)
        }
      } catch {
        // 跳过不完整/非 JSON 行
      }
    }
  }
  return full
}
