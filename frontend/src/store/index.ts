import { create } from 'zustand'
import type { AppState, IslandState, AudioAnalysis, GlassSettings } from '../types/state'
import type { Track, Album, QueueTrack, Palette } from '../types/models'

const INITIAL_AUDIO: AudioAnalysis = { bass: 0, mid: 0, treble: 0, energy: 0 }

export const useStore = create<AppState>((set, get) => ({
  // ── Connection ──
  isConnected: false,
  setConnected: (connected) => set({ isConnected: connected }),

  // ── Library ──
  library: [],
  albums: [],
  setLibrary: (library) => set({ library }),
  setAlbums: (albums) => set({ albums }),

  // ── Playback ──
  nowPlaying: null,
  queue: [],
  queueIndex: -1,
  isPlaying: false,
  currentTime: 0,
  duration: 0,
  volume: 0.7,

  setNowPlaying: (track) => set({ nowPlaying: track }),
  setIsPlaying: (playing) => set({ isPlaying: playing }),
  setCurrentTime: (time) => set({ currentTime: time }),
  setDuration: (duration) => set({ duration }),
  setVolume: (volume) => set({ volume }),

  setQueue: (tracks, startIndex = 0) =>
    set({
      queue: tracks,
      queueIndex: startIndex,
      nowPlaying: tracks[startIndex] || null,
    }),

  removeFromQueue: (index) => set((s) => {
    const q = [...s.queue]
    q.splice(index, 1)
    const qi = s.queueIndex
    const newIdx = index < qi ? qi - 1 : index === qi ? Math.min(qi, q.length - 1) : qi
    return {
      queue: q,
      queueIndex: newIdx,
      nowPlaying: q[newIdx] || null,
    }
  }),

  clearQueue: () => set({ queue: [], queueIndex: -1, nowPlaying: null, isPlaying: false }),

  reorderQueue: (fromIndex, toIndex) => set((s) => {
    const q = [...s.queue]
    const [moved] = q.splice(fromIndex, 1)
    q.splice(toIndex, 0, moved)
    let qi = s.queueIndex
    if (fromIndex === qi) qi = toIndex
    else if (fromIndex < qi && toIndex >= qi) qi--
    else if (fromIndex > qi && toIndex <= qi) qi++
    return { queue: q, queueIndex: qi, nowPlaying: q[qi] || null }
  }),

  playNext: () => {
    const { queue, queueIndex } = get()
    const nextIndex = queueIndex + 1
    if (nextIndex < queue.length) {
      set({ queueIndex: nextIndex, nowPlaying: queue[nextIndex], isPlaying: true })
    } else {
      set({ isPlaying: false })
    }
  },

  playPrev: () => {
    const { queue, queueIndex } = get()
    const prevIndex = Math.max(0, queueIndex - 1)
    if (prevIndex !== queueIndex) {
      set({ queueIndex: prevIndex, nowPlaying: queue[prevIndex], isPlaying: true })
    }
  },

  // ── UI ──
  islandState: 'idle' as IslandState,
  setIslandState: (state) => set({ islandState: state }),
  dragActive: false,
  setDragActive: (active) => set({ dragActive: active }),
  dragProximity: 0,
  dragCursorX: 0,
  setDragProximity: (proximity, cursorX) => set({ dragProximity: proximity, dragCursorX: cursorX }),
  isImporting: false,
  importProgress: 0,
  setImporting: (importing, progress = 0) => set({ isImporting: importing, importProgress: progress }),

  // ── Visual ──
  palette: null,
  setPalette: (palette: Palette | null) => set({ palette }),
  audioAnalysis: { ...INITIAL_AUDIO },
  setAudioAnalysis: (analysis) => set({ audioAnalysis: analysis }),

  // ── Lyrics ──
  lyricsVisible: false,
  setLyricsVisible: (v) => set({ lyricsVisible: v }),
  lyricsFullscreen: false,
  setLyricsFullscreen: (v) => set({ lyricsFullscreen: v }),
  lyricsAutoScrollDelay: 3000,
  setLyricsAutoScrollDelay: (v) => set({ lyricsAutoScrollDelay: v }),
  syncedLyricsRaw: '',
  setSyncedLyricsRaw: (s) => set({ syncedLyricsRaw: s }),

  // ── Glass Settings ──
  glassSettings: {
    borderWidth: 0.07,
    brightness: 50,
    opacity: 0.93,
    blur: 11,
    displace: 0,
    backgroundOpacity: 0,
    saturation: 1,
    distortionScale: -180,
    redOffset: 0,
    greenOffset: 10,
    blueOffset: 20,
    mixBlendMode: 'difference',
    xChannel: 'R',
    yChannel: 'G',
    darkOverlay: 0.2,
  } as GlassSettings,
  setGlassSettings: (partial) => set((s) => ({ glassSettings: { ...s.glassSettings, ...partial } })),

  // ── Playlists ──
  playlists: [],
  setPlaylists: (playlists) => set({ playlists }),
  addPlaylist: (playlist) => set((s) => ({ playlists: [...s.playlists, playlist] })),
  removePlaylist: (id) => set((s) => ({ playlists: s.playlists.filter((p) => p.id !== id) })),
  updatePlaylist: (id, changes) => set((s) => ({
    playlists: s.playlists.map((p) => (p.id === id ? { ...p, ...changes } : p)),
  })),
  editingPlaylist: null,
  setEditingPlaylist: (p) => set({ editingPlaylist: p }),
}))

// Alias for gradual migration from old store.js
export const useAppStore = useStore
