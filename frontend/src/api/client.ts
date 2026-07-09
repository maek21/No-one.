import axios from 'axios'

export const apiClient = axios.create({
  baseURL: '/api',
  headers: {
    'Content-Type': 'application/json'
  }
})

// Library API
export const libraryApi = {
  getTracks: () => apiClient.get('/library/tracks'),
  getAlbums: () => apiClient.get('/library/albums'),
  getArtists: () => apiClient.get('/library/artists'),
  getAlbumTracks: (albumId: string) => apiClient.get(`/library/albums/${albumId}/tracks`),
  getArtistTracks: (artistId: string) => apiClient.get(`/library/artists/${artistId}/tracks`),
  search: (query: string) => apiClient.get('/library/search', { params: { q: query } }),
  toggleFavorite: (trackId: string) => apiClient.post(`/library/tracks/${trackId}/favorite`),
  getStats: () => apiClient.get('/library/stats')
}

// Playback API
export const playbackApi = {
  play: (trackId: string) => apiClient.post('/playback/play', { track_id: trackId }),
  pause: () => apiClient.post('/playback/pause'),
  resume: () => apiClient.post('/playback/resume'),
  stop: () => apiClient.post('/playback/stop'),
  next: () => apiClient.post('/playback/next'),
  previous: () => apiClient.post('/playback/previous'),
  seek: (position: number) => apiClient.post('/playback/seek', { position }),
  setVolume: (volume: number) => apiClient.post('/playback/volume', { volume }),
  getStatus: () => apiClient.get('/playback/status'),
  getQueue: () => apiClient.get('/playback/queue'),
  addToQueue: (trackId: string) => apiClient.post('/playback/queue/add', { track_id: trackId }),
  clearQueue: () => apiClient.post('/playback/queue/clear')
}

// Import API
export const importApi = {
  start: (path: string, options = {}) => apiClient.post('/import/start', { path, options }),
  getStatus: (jobId: string) => apiClient.get(`/import/status/${jobId}`),
  cancel: (jobId: string) => apiClient.post(`/import/cancel/${jobId}`)
}

// Analysis API
export const analysisApi = {
  get: (trackId: string) => apiClient.get(`/analysis/${trackId}`),
}

// Settings API
export const settingsApi = {
  get: () => apiClient.get('/settings'),
  update: (settings: any) => apiClient.patch('/settings', settings)
}

// Playlists API
export const playlistsApi = {
  getAll: () => apiClient.get('/playlists'),
  get: (playlistId: string) => apiClient.get(`/playlists/${playlistId}`),
  getTracks: (playlistId: string) => apiClient.get(`/playlists/${playlistId}/tracks`),
  create: (name: string, description?: string) => apiClient.post('/playlists', { name, description }),
  update: (playlistId: string, payload: any) => apiClient.patch(`/playlists/${playlistId}`, payload),
  delete: (playlistId: string) => apiClient.delete(`/playlists/${playlistId}`),
  addTracks: (playlistId: string, trackIds: string[], position?: number) => apiClient.post(`/playlists/${playlistId}/tracks`, { track_ids: trackIds, position }),
  removeTrack: (playlistId: string, trackId: string) => apiClient.delete(`/playlists/${playlistId}/tracks/${trackId}`),
}
