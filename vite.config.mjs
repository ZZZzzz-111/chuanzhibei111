import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'
import os from 'node:os'
import path from 'node:path'

const GLM_TARGET = 'https://open.bigmodel.cn/api/paas/v4/chat/completions'

/** 把 /api/glm/chat/completions 转发到智谱，避免浏览器直连 HTTPS+跨域导致 failed to fetch */
const glmProxy = {
  name: 'glm-proxy',
  configureServer(server) {
    server.middlewares.use(async (req, res, next) => {
      if (!req.url?.startsWith('/api/glm/chat/completions')) return next()
      if (req.method !== 'POST') {
        res.statusCode = 405
        res.end('Method Not Allowed')
        return
      }
      const chunks = []
      for await (const c of req) chunks.push(c)
      try {
        const upstream = await fetch(GLM_TARGET, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: req.headers.authorization ?? '',
          },
          body: Buffer.concat(chunks),
        })
        res.statusCode = upstream.status
        const ct = upstream.headers.get('content-type')
        if (ct) res.setHeader('Content-Type', ct)
        if (!upstream.body) {
          res.end()
          return
        }
        const reader = upstream.body.getReader()
        for (;;) {
          const { done, value } = await reader.read()
          if (done) break
          res.write(value)
        }
        res.end()
      } catch (err) {
        console.error('[glm-proxy] upstream failed:', err)
        res.statusCode = 502
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ error: 'proxy_failed', message: String(err?.message ?? err) }))
      }
    })
  },
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), glmProxy],
  // GitHub Pages 项目站点的 URL 是 https://<user>.github.io/<repo>/，构建时用 GH_BASE_PATH 注入子路径
  // base: process.env.GH_BASE_PATH || '/',
  base: '/chuanzhibei111/',
  // 缓存移到系统 Temp：安全软件拦截项目目录内 node 的随机目录创建（EPERM mkdir）
  // 用 os.tmpdir() 保证跨用户/跨机器可移植
  cacheDir: path.join(os.tmpdir(), 'chuanzhibei-vite-cache'),
})
