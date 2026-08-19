import client, { initCsrf } from './client'

export const authApi = {
  login: async (email, password) => {
    await initCsrf()
    return client.post('/auth/login', { email, password })
  },
  logout: () => client.post('/auth/logout'),
  me:     () => client.get('/auth/me'),
  forgotPassword: (email) => client.post('/auth/forgot-password', { email }),
  resetPassword: ({ email, token, password, password_confirmation }) =>
    client.post('/auth/reset-password', { email, token, password, password_confirmation }),
}
