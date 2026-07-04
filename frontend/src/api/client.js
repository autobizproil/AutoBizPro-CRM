import axios from 'axios'

const client = axios.create({
  baseURL: '/api',
  withCredentials: true, // send cookies (Sanctum SPA mode)
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  },
})

// Inject X-Tenant header from subdomain on every request
client.interceptors.request.use((config) => {
  const hostname = window.location.hostname
  const subdomain = hostname.split('.')[0]
  // Always send X-Tenant: real subdomain, or 'localhost' in dev (matches seeded tenant)
  config.headers['X-Tenant'] = subdomain || 'localhost'
  return config
})

// Initialize CSRF on app startup
export async function initCsrf() {
  await axios.get('/sanctum/csrf-cookie', { withCredentials: true })
}

// Redirect to login on 401 — but NOT for the auth-probe endpoints
// (/auth/me returns 401 when logged out by design; AuthContext handles it).
// Hard-redirecting on those caused an infinite reload loop.
client.interceptors.response.use(
  (res) => res,
  (err) => {
    const url = err.config?.url ?? ''
    const isAuthProbe = url.includes('/auth/me') || url.includes('/auth/login')
    const onLoginPage = window.location.pathname === '/login'
    if (err.response?.status === 401 && !isAuthProbe && !onLoginPage) {
      window.location.href = '/login'
    }
    return Promise.reject(err)
  }
)

export default client
