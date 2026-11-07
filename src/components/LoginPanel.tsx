import { useState } from 'react'

export interface UserProfile {
  nickname: string
  phone: string
}

interface LoginPanelProps {
  open: boolean
  user: UserProfile | null
  onClose: () => void
  onLogin: (user: UserProfile) => void
  onLogout: () => void
}

const PHONE_RE = /^1[3-9]\d{9}$/

/** 演示用登录面板：无后端，纯前端校验 + localStorage 持久化 */
function LoginPanel({ open, user, onClose, onLogin, onLogout }: LoginPanelProps) {
  const [nickname, setNickname] = useState('')
  const [phone, setPhone] = useState('')
  const [error, setError] = useState('')

  if (!open) return null

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const nick = nickname.trim()
    if (nick.length < 2 || nick.length > 12) {
      setError('昵称需要 2-12 个字')
      return
    }
    if (!PHONE_RE.test(phone.trim())) {
      setError('请输入 11 位手机号')
      return
    }
    setError('')
    onLogin({ nickname: nick, phone: phone.trim() })
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center px-4">
      <button
        type="button"
        className="absolute inset-0 cursor-default bg-slate-900/40 backdrop-blur-sm"
        onClick={onClose}
        aria-label="关闭登录面板"
      />

      <form
        className="login-form relative"
        onSubmit={handleSubmit}
        role="dialog"
        aria-modal="true"
        aria-label="川知贝账号登录"
      >
        <button type="button" className="login-close" onClick={onClose} aria-label="关闭登录面板">
          ×
        </button>

        <div className="login-title">
          {user ? `欢迎回来，${user.nickname}` : '欢迎登岛，'}
          <br />
          <span>{user ? '宠物档案已同步到这台设备' : '登录后保存宠物档案与鲜食偏好'}</span>
        </div>

        {user ? (
          <>
            <div className="login-user">
              <span className="login-avatar">{user.nickname.slice(0, 1)}</span>
              <span className="login-user-meta">
                <b>{user.nickname}</b>
                <span>
                  {user.phone.slice(0, 3)}****{user.phone.slice(-4)}
                </span>
              </span>
            </div>
            <button type="button" className="login-submit" onClick={onLogout}>
              退出登录
            </button>
          </>
        ) : (
          <>
            <input
              className="login-input"
              name="nickname"
              placeholder="铲屎官的名字"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              aria-label="昵称"
              autoFocus
            />
            <input
              className="login-input"
              name="phone"
              placeholder="11 位手机号"
              inputMode="numeric"
              maxLength={11}
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              aria-label="手机号"
            />

            <div className="login-social">
              <button
                type="button"
                className="login-btn"
                aria-label="微信登录暂未开放"
                onClick={() => setError('微信登录暂未开放')}
              >
                <svg className="login-icon" viewBox="0 0 48 48" aria-hidden="true">
                  <ellipse cx="19" cy="18" rx="14.5" ry="12.5" fill="#07C160" />
                  <circle cx="14" cy="16" r="2" fill="#f5f5dc" />
                  <circle cx="24" cy="16" r="2" fill="#f5f5dc" />
                  <ellipse
                    cx="32"
                    cy="31"
                    rx="11"
                    ry="9.5"
                    fill="#07C160"
                    stroke="#f5f5dc"
                    strokeWidth="2.5"
                  />
                  <circle cx="28.5" cy="30" r="1.6" fill="#f5f5dc" />
                  <circle cx="36" cy="30" r="1.6" fill="#f5f5dc" />
                </svg>
              </button>
              <button
                type="button"
                className="login-btn"
                aria-label="QQ 登录暂未开放"
                onClick={() => setError('QQ 登录暂未开放')}
              >
                <svg className="login-icon" viewBox="0 0 48 48" aria-hidden="true">
                  <ellipse cx="16" cy="8" rx="3.6" ry="4.6" fill="#12B7F5" />
                  <ellipse cx="32" cy="8" rx="3.6" ry="4.6" fill="#12B7F5" />
                  <ellipse cx="10" cy="27" rx="3.6" ry="8" fill="#12B7F5" />
                  <ellipse cx="38" cy="27" rx="3.6" ry="8" fill="#12B7F5" />
                  <ellipse cx="24" cy="37" rx="9.5" ry="6.5" fill="#12B7F5" />
                  <ellipse cx="24" cy="22" rx="12.5" ry="14" fill="#12B7F5" />
                  <circle cx="19" cy="19" r="2.4" fill="#f5f5dc" />
                  <circle cx="29" cy="19" r="2.4" fill="#f5f5dc" />
                  <path d="M21 25l3 2.6 3-2.6z" fill="#ffb300" />
                </svg>
              </button>
              <button
                type="button"
                className="login-btn"
                aria-label="抖音登录暂未开放"
                onClick={() => setError('抖音登录暂未开放')}
              >
                <svg className="login-icon" viewBox="0 0 48 48" aria-hidden="true">
                  <rect x="27" y="6" width="7" height="25" rx="3.5" fill="#111111" />
                  <circle cx="21" cy="31" r="9" fill="#FE2C55" />
                  <path
                    d="M8 18c4 1.5 7 4 9 7.5"
                    stroke="#12B7F5"
                    strokeWidth="3"
                    fill="none"
                    strokeLinecap="round"
                  />
                  <path
                    d="M6 10c3.5 1.5 6 3.5 8 6.5"
                    stroke="#12B7F5"
                    strokeWidth="3"
                    fill="none"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            </div>

            {error && (
              <p role="alert" className="login-error">
                {error}
              </p>
            )}

            <button type="submit" className="login-submit">
              进入星球 →
            </button>
            <p className="login-tip">演示账号，信息仅保存在本机</p>
          </>
        )}
      </form>
    </div>
  )
}

export default LoginPanel
