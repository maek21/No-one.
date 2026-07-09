import { useQuery } from '@tanstack/react-query'
import { libraryApi } from '../api/client'
import './Library.css'

export function Library() {
  const { data: albums, isLoading } = useQuery({
    queryKey: ['albums'],
    queryFn: async () => {
      const response = await libraryApi.getAlbums()
      return response.data
    }
  })

  const { data: stats } = useQuery({
    queryKey: ['stats'],
    queryFn: async () => {
      const response = await libraryApi.getStats()
      return response.data
    }
  })

  if (isLoading) {
    return (
      <div className="library library-loading">
        <p>Loading library...</p>
      </div>
    )
  }

  return (
    <div className="library">
      <header className="library-header">
        <h1>Library</h1>
        {stats && (
          <div className="library-stats">
            <span>{stats.tracks} tracks</span>
            <span>{stats.albums} albums</span>
            <span>{stats.artists} artists</span>
          </div>
        )}
      </header>

      <div className="album-grid">
        {albums && albums.length > 0 ? (
          albums.map((album: any) => (
            <div key={album.id} className="album-card">
              <div className="album-artwork">
                {album.artwork_path ? (
                  <img src={album.artwork_path} alt={album.title} />
                ) : (
                  <div className="album-artwork-placeholder" />
                )}
              </div>
              <div className="album-info">
                <h3 className="album-title">{album.title}</h3>
                <p className="album-artist">{album.artist || 'Unknown Artist'}</p>
              </div>
            </div>
          ))
        ) : (
          <p>No albums found</p>
        )}
      </div>
    </div>
  )
}
