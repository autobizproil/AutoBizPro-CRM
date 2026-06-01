import client, { initCsrf } from './client'

export const authApi = {
  login: async (email, password) => {
    await initCsrf()
    return client.post('/auth/login', { email, password })
  },
  logout: () => client.post('/auth/logout'),
  me:     () => client.get('/auth/me'),
}
