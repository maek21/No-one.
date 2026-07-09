const API = '/api';

export const api = {
  async checkHealth() {
    try {
      const r = await fetch(`/health`);
      return r.ok;
    } catch {
      return false;
    }
  },

  async getAlbums(limit = 100, offset = 0) {
    const r = await fetch(`${API}/library/albums?limit=${limit}&offset=${offset}`);
    return r.json();
  },

  async getAlbumTracks(albumId) {
    const r = await fetch(`${API}/library/albums/${albumId}/tracks`);
    return r.json();
  },

  getStreamUrl(trackId) {
    return `/api/playback/stream/${trackId}`;
  },

  async startImport(path) {
    const r = await fetch(`${API}/import/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path, options: {} }),
    });
    return r.json();
  },

  async getImportStatus(jobId) {
    const r = await fetch(`${API}/import/status/${jobId}`);
    return r.json();
  },

  async getAnalysis(trackId) {
    const r = await fetch(`${API}/analysis/${trackId}`);
    if (r.status === 404) return null;
    return r.json();
  },

  async getLyrics(trackId) {
    const r = await fetch(`${API}/lyrics/${trackId}`);
    if (r.status === 404) return null;
    return r.json();
  },

  async getSettings() {
    const r = await fetch(`${API}/settings`);
    return r.json();
  },

  async updateSettings(settings) {
    const r = await fetch(`${API}/settings`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings),
    });
    return r.json();
  },
};