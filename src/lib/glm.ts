/* ============ 智谱 BigModel（GLM）客户端 ============ */

/**
 * 接口地址：
 * - 本地开发：/api/glm/chat/completions（走 vite.config.mjs 的 glm-proxy 中间件）
 * - 生产部署：VITE_GLM_PROXY_URL 指向 Cloudflare Worker（Key 存在 Worker 端，不进前端 bundle）
 */
const API_URL: string = import.meta.env.VITE_GLM_PROXY_URL
  ? String(import.meta.env.VITE_GLM_PROXY_URL)
  : '/api/glm/chat/completions'

const MODEL = 'glm-4-flash'

export const GLM_API_KEY: string = import.meta.env.VITE_GLM_API_KEY ?? ''

/** 本地代理模式需要本地 Key；Worker 模式由服务端注入，前端无需配置 */
export function isApiConfigured(): boolean {
  return GLM_API_KEY.length > 0 || Boolean(import.meta.env.VITE_GLM_PROXY_URL)
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
      // 本地代理模式由前端带 Key；Worker 模式由服务端注入，前端不持有 Key
      ...(import.meta.env.VITE_GLM_PROXY_URL ? {} : { Authorization: `Bearer ${GLM_API_KEY}` }),
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
