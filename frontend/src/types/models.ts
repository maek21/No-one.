export interface Track {
  id: string
  path: string
  title: string
  artist: string | null
  album: string | null
  album_id: string | null
  duration: number | null
  track_number: number | null
  is_favorite: boolean
  artwork: string | null
  palette: Palette | null
}

export interface Album {
  id: string
  title: string
  artist: string | null
  artist_id: string | null
  year: number | null
  track_count: number
  artwork_path: string | null
  palette_primary: string | null
  tracks?: Track[]
}

export interface Artist {
  id: string
  name: string
  album_count: number
  track_count: number
}

export interface Palette {
  primary: string
  secondary: string
  accent: string
  shadow: string
  highlight: string
  ambient: string
}

export interface QueueTrack {
  id: string
  title: string
  artist: string
  duration: number
  artwork: string | null
  palette: Palette | string[] | null
  source?: string  // "tag" | "filename" | "folder" | "musicbrainz"
}

export interface Playlist {
  id: string
  name: string
  description: string | null
  artwork_path: string | null
  track_count: number
  palette_primary: string | null
  palette_accent: string | null
  palette_secondary: string | null
  palette_shadow: string | null
  palette_highlight: string | null
  palette_ambient: string | null
  created_at: string | null
  updated_at: string | null
}

export interface PlaylistTrack {
  id: string
  track_id: string
  title: string
  artist: string | null
  duration: number | null
  position: number
}
