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
  const subdomain = window.location.hostname.split('.')[0]
  if (subdomain && subdomain !== 'localhost') {
    config.headers['X-Tenant'] = subdomain
  }
  return config
})

// Get CSRF cookie before first mutating request
let csrfInitialized = false
export async function initCsrf() {
  if (csrfInitialized) return
  await axios.get('/sanctum/csrf-cookie', { withCredentials: true })
  csrfInitialized = true
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
