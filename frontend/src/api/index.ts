import axios from 'axios'

const apiClient = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
})

export const api = {
  checkHealth: async () => {
    try {
      const res = await apiClient.get('/health')
      return res.data?.status === 'healthy'
    } catch { return false }
  },

  getAlbums: (limit = 200, offset = 0) =>
    apiClient.get('/library/albums', { params: { limit, offset } }).then((r) => r.data),

  getAlbumTracks: (albumId: string) =>
    apiClient.get(`/library/albums/${albumId}/tracks`).then((r) => r.data),

  getStreamUrl: (trackId: string) => `/api/playback/stream/${trackId}`,

  startImport: (path: string) =>
    apiClient.post('/import/start', { path }).then((r) => r.data),

  getLyrics: (trackId: string) =>
    apiClient.get(`/lyrics/${trackId}`).then((r) => r.data),

  getSettings: () =>
    apiClient.get('/settings').then((r) => r.data),

  updateSettings: (data: any) =>
    apiClient.patch('/settings', data).then((r) => r.data),
}

export { apiClient }

export * from './client'