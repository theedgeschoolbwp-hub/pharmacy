import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../services/supabase'
import db from '../services/db'
import { Pill, Eye, EyeOff, AlertCircle, WifiOff } from 'lucide-react'

// SHA-256 hash helper (Web Crypto API)
async function sha256(str) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str))
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
}

export default function Login() {
  const { login } = useAuth()
  const navigate = useNavigate()

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [isOnline, setIsOnline] = useState(navigator.onLine)

  useEffect(() => {
    const on = () => setIsOnline(true)
    const off = () => setIsOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off) }
  }, [])

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!username.trim() || !password.trim()) return setError('Enter username and password')
    setLoading(true)
    setError('')
    try {
      const pwHash = await sha256(password)

      // ── Online login via Supabase RPC ────────────────────────────────────
      if (navigator.onLine) {
        const { data, error } = await supabase.rpc('secure_login', {
          p_username: username.trim().toLowerCase(),
          p_password_hash: pwHash,
        })
        if (error || !data || data.length === 0) throw new Error('Invalid username or password')
        const userData = data[0]
        // Cache locally for offline fallback
        await db.users.put({ ...userData, password_hash: pwHash })
        sessionStorage.setItem('user_pw_hash', pwHash)
        login(userData)
      } else {
        // ── Offline login from IndexedDB ──────────────────────────────────
        const localUser = await db.users
          .filter(u => u.username?.toLowerCase() === username.trim().toLowerCase())
          .first()
        if (!localUser || localUser.password_hash !== pwHash) throw new Error('Invalid credentials (offline mode)')
        login(localUser)
      }
      navigate('/dashboard')
    } catch (err) {
      setError(err.message || 'Login failed. Check credentials.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-teal-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-3 shadow-lg">
            <Pill size={32} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">PharmaCare POS</h1>
          <p className="text-sm text-gray-500 mt-1">Pharmacy Management System</p>
        </div>

        {/* Offline badge */}
        {!isOnline && (
          <div className="mb-4 flex items-center gap-2 bg-orange-50 border border-orange-200 text-orange-700 text-xs rounded-lg px-3 py-2">
            <WifiOff size={14} />
            <span>Offline mode — login with saved credentials</span>
          </div>
        )}

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-xl border border-gray-100 p-6">
          <h2 className="text-lg font-semibold text-gray-800 mb-5">Sign in to your account</h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Username</label>
              <input
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value)}
                placeholder="Enter username"
                autoFocus
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Password</label>
              <div className="relative">
                <input
                  type={showPass ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Enter password"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all pr-10"
                />
                <button type="button" onClick={() => setShowPass(v => !v)}
                  className="absolute right-3 top-2.5 text-gray-400 hover:text-gray-600">
                  {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {error && (
              <div className="flex items-center gap-2 bg-red-50 border border-red-100 text-red-600 text-xs rounded-lg px-3 py-2">
                <AlertCircle size={14} className="flex-shrink-0" />
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 text-white py-2.5 rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
            >
              {loading ? (
                <><span className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" /> Signing in…</>
              ) : (
                'Sign In'
              )}
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-gray-400 mt-4">
          PharmaCare POS v1.0 • {isOnline ? '🟢 Online' : '🔴 Offline'}
        </p>
      </div>
    </div>
  )
}
