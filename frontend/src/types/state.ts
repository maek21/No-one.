import type { Track, Album, QueueTrack, Palette, Playlist, PlaylistTrack } from './models'

export type IslandState = 'idle' | 'playing' | 'importing' | 'editing'

export type PlayStatus = 'idle' | 'playing' | 'paused'

export interface AudioAnalysis {
  bass: number
  mid: number
  treble: number
  energy: number
}

export interface AppState {
  // Connection
  isConnected: boolean
  setConnected: (connected: boolean) => void

  // Library
  library: Track[]
  albums: Album[]
  setLibrary: (tracks: Track[]) => void
  setAlbums: (albums: Album[]) => void

  // Playback
  nowPlaying: QueueTrack | null
  queue: QueueTrack[]
  queueIndex: number
  isPlaying: boolean
  currentTime: number
  duration: number
  volume: number
  setNowPlaying: (track: QueueTrack | null) => void
  setIsPlaying: (playing: boolean) => void
  setCurrentTime: (time: number) => void
  setDuration: (duration: number) => void
  setVolume: (volume: number) => void
  setQueue: (tracks: QueueTrack[], startIndex?: number) => void
  removeFromQueue: (index: number) => void
  clearQueue: () => void
  reorderQueue: (fromIndex: number, toIndex: number) => void
  playNext: () => void
  playPrev: () => void

  // UI
  islandState: IslandState
  setIslandState: (state: IslandState) => void
  dragActive: boolean
  setDragActive: (active: boolean) => void
  dragProximity: number
  dragCursorX: number
  setDragProximity: (proximity: number, cursorX: number) => void
  isImporting: boolean
  importProgress: number
  setImporting: (importing: boolean, progress?: number) => void

  // Visual
  palette: Palette | string[] | null
  setPalette: (palette: Palette | string[] | null) => void
  audioAnalysis: AudioAnalysis
  setAudioAnalysis: (analysis: AudioAnalysis) => void

  // Lyrics
  lyricsVisible: boolean
  setLyricsVisible: (v: boolean) => void
  syncedLyricsRaw: string
  setSyncedLyricsRaw: (s: string) => void

  // Glass Settings
  glassSettings: GlassSettings
  setGlassSettings: (s: Partial<GlassSettings>) => void

  // Lyrics
  lyricsFullscreen: boolean
  setLyricsFullscreen: (v: boolean) => void
  lyricsAutoScrollDelay: number
  setLyricsAutoScrollDelay: (v: number) => void

  // Playlists
  playlists: Playlist[]
  setPlaylists: (playlists: Playlist[]) => void
  addPlaylist: (playlist: Playlist) => void
  removePlaylist: (id: string) => void
  updatePlaylist: (id: string, changes: Partial<Playlist>) => void
  editingPlaylist: Playlist | null
  setEditingPlaylist: (p: Playlist | null) => void
}

export interface GlassSettings {
  borderWidth: number
  brightness: number
  opacity: number
  blur: number
  displace: number
  backgroundOpacity: number
  saturation: number
  distortionScale: number
  redOffset: number
  greenOffset: number
  blueOffset: number
  mixBlendMode: string
  xChannel: string
  yChannel: string
  darkOverlay: number
}
