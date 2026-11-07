/**
 * 一键部署脚本：GitHub Pages + Cloudflare Worker
 *
 * 用法（令牌全部从环境变量读取，不落盘）：
 *   GH_TOKEN=ghp_xxx GH_USER=zzz-111 GH_REPO=chuanzhibei \
 *   CF_TOKEN=cft_xxx CF_ACCOUNT=xxx GLM_KEY=xxx.yyyy \
 *   node scripts/deploy.mjs
 *
 * 做的事：
 *  1. 部署 worker/glm-proxy.js 到 Cloudflare，注入 GLM_API_KEY secret
 *  2. git 初始化并提交源码
 *  3. 在 GitHub 建仓库（如不存在）
 *  4. 以生产模式构建（base 子路径 + Worker URL 注入）
 *  5. 源码推 main、构建产物推 gh-pages、开启 Pages
 */
import { execSync } from 'node:child_process'
import { cpSync, existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const { GH_TOKEN, GH_USER, GH_REPO, CF_TOKEN, CF_ACCOUNT, GLM_KEY } = process.env
const missing = ['GH_TOKEN', 'GH_USER', 'GH_REPO', 'CF_TOKEN', 'CF_ACCOUNT', 'GLM_KEY'].filter(
  (k) => !process.env[k],
)
if (missing.length > 0) {
  console.error('缺少环境变量:', missing.join(', '))
  process.exit(1)
}

const WORKER_NAME = 'czb-glm-proxy'
const sh = (cmd) => execSync(cmd, { stdio: 'inherit' })

// ---------- 1. 部署 Worker ----------
console.log('\n=== [1/5] 部署 Cloudflare Worker ===')
process.env.CLOUDFLARE_API_TOKEN = CF_TOKEN
sh(`npx wrangler deploy worker/glm-proxy.js --name ${WORKER_NAME} --account-id ${CF_ACCOUNT}`)

// ---------- 2. 注入 GLM Key secret ----------
console.log('\n=== [2/5] 注入 GLM_API_KEY secret ===')
const secretRes = await fetch(
  `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT}/workers/scripts/${WORKER_NAME}/secrets`,
  {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${CF_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ type: 'secret_text', name: 'GLM_API_KEY', text: GLM_KEY }),
  },
)
if (!secretRes.ok) {
  console.error('secret 注入失败:', await secretRes.text())
  process.exit(1)
}

// ---------- 3. 拿 workers.dev 子域名，拼 Worker URL ----------
let subdomain
const subRes = await fetch(
  `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT}/workers/subdomain`,
  { headers: { Authorization: `Bearer ${CF_TOKEN}` } },
)
const subJson = await subRes.json()
subdomain = subJson?.result?.subdomain
if (!subdomain) {
  // 账号还没注册 workers.dev 子域名，注册一个（基于 GitHub 用户名）
  const claim = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT}/workers/subdomain`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${CF_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ subdomain: GH_USER.toLowerCase().replace(/[^a-z0-9-]/g, '-') }),
    },
  )
  const claimJson = await claim.json()
  subdomain = claimJson?.result?.subdomain
  if (!subdomain) {
    console.error('获取/注册 workers.dev 子域名失败:', JSON.stringify(claimJson))
    process.exit(1)
  }
}
const workerUrl = `https://${WORKER_NAME}.${subdomain}.workers.dev`
console.log('Worker URL:', workerUrl)

// ---------- 4. git 初始化 + 提交源码 ----------
console.log('\n=== [3/5] 提交源码 ===')
if (!existsSync('.git')) {
  sh('git init -b main')
}
execSync('git config user.name >/dev/null 2>&1 || git config user.name "deploy"')
execSync('git config user.email >/dev/null 2>&1 || git config user.email "deploy@users.noreply.github.com"')
sh('git add -A')
try {
  sh('git commit -m "build: 部署前提交"')
} catch {
  console.log('没有待提交的改动')
}

// ---------- 5. 建 GitHub 仓库（如不存在）----------
console.log('\n=== [4/5] 检查/创建 GitHub 仓库 ===')
const repoRes = await fetch(`https://api.github.com/repos/${GH_USER}/${GH_REPO}`, {
  headers: { Authorization: `token ${GH_TOKEN}` },
})
if (repoRes.status === 404) {
  const create = await fetch('https://api.github.com/user/repos', {
    method: 'POST',
    headers: { Authorization: `token ${GH_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: GH_REPO, description: '川知贝 · 宠物星球服务平台', private: false }),
  })
  if (!create.ok) {
    console.error('建仓库失败:', await create.text())
    process.exit(1)
  }
  console.log(`仓库已创建: ${GH_USER}/${GH_REPO}`)
} else {
  console.log(`仓库已存在: ${GH_USER}/${GH_REPO}`)
}

// ---------- 6. 生产构建 ----------
console.log('\n=== [5/5] 生产构建 + 推送 gh-pages ===')
process.env.GH_BASE_PATH = `/${GH_REPO}/`
process.env.VITE_GLM_PROXY_URL = workerUrl
sh('npm run build')

// SPA 深链兜底：刷新 /walk 等子路径时 GitHub Pages 返回 404.html
cpSync('dist/index.html', 'dist/404.html')

const remote = `https://${GH_TOKEN}@github.com/${GH_USER}/${GH_REPO}.git`
execSync(`git remote remove origin 2>/dev/null; true`)
sh(`git remote add origin ${remote}`)
sh('git push -u origin main')

// dist 作为 gh-pages 分支提交（孤儿分支，历史干净）
const distDir = join(process.cwd(), 'dist')
const tmpBranch = 'gh-pages'
rmSync('.gh-pages-tmp', { recursive: true, force: true })
execSync('git worktree add .gh-pages-tmp --detach')
execSync(`git -C .gh-pages-tmp checkout --orphan ${tmpBranch}`)
execSync('git -C .gh-pages-tmp rm -rf --quiet .')
// 用 .gh-pages-tmp 作为暂存区：拷贝 dist 内容进去
for (const f of execSync('ls -A dist', { encoding: 'utf8' }).trim().split('\n')) {
  cpSync(join(distDir, f), join('.gh-pages-tmp', f), { recursive: true })
}
execSync('git -C .gh-pages-tmp add -A')
execSync(`git -C .gh-pages-tmp commit -m "deploy: gh-pages 更新"`)
execSync(`git -C .gh-pages-tmp push -f origin ${tmpBranch}`)
rmSync('.gh-pages-tmp', { recursive: true, force: true })

// ---------- 7. 开启 Pages ----------
console.log('\n=== 开启 GitHub Pages ===')
const pagesRes = await fetch(`https://api.github.com/repos/${GH_USER}/${GH_REPO}/pages`, {
  method: 'POST',
  headers: { Authorization: `token ${GH_TOKEN}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ source: { branch: 'gh-pages', path: '/' } }),
})
if (pagesRes.ok || pagesRes.status === 409) {
  console.log('Pages 已开启（409 = 此前已开启）')
} else {
  console.error('开启 Pages 失败:', await pagesRes.text())
}

console.log(`\n✅ 部署完成：https://${GH_USER}.github.io/${GH_REPO}/`)
console.log(`Worker（AI 中转）：${workerUrl}`)
console.log('\n注意：首次部署后 Pages 需要等 1-2 分钟构建。')
