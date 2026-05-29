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
  // Always send X-Tenant: use subdomain or 'demo' for localhost dev
  config.headers['X-Tenant'] = (subdomain && subdomain !== 'localhost') ? subdomain : 'demo'
  return config
})

// Initialize CSRF on app startup
export async function initCsrf() {
  await axios.get('/sanctum/csrf-cookie', { withCredentials: true })
}

// Redirect to login on 401
client.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      window.location.href = '/login'
    }
    return Promise.reject(err)
  }
)

export default client
