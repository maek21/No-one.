import { useCallback, useEffect, useState } from 'react'
import { useAppStore } from '../../store'
import { api } from '../../api'
import { libraryApi } from '../../api/client'
import type { GlassSettings } from '../../types/state'

const MIX_BLEND_MODES = ['normal', 'multiply', 'screen', 'overlay', 'darken', 'lighten', 'color-dodge', 'color-burn', 'hard-light', 'soft-light', 'difference', 'exclusion', 'hue', 'saturation', 'color', 'luminosity', 'plus-darker', 'plus-lighter']
const CHANNELS = ['R', 'G', 'B']

function Slider({ label, value, min, max, step, onChange }: { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'rgba(255,255,255,0.5)', marginBottom: 4 }}>
        <span>{label}</span>
        <span>{value}</span>
      </div>
      <input
        type="range"
        min={min} max={max} step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        style={{ width: '100%', accentColor: 'rgba(255,255,255,0.5)' }}
      />
    </div>
  )
}

function Selector({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (v: string) => void }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginBottom: 4 }}>{label}</div>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          width: '100%', padding: '6px 8px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.1)',
          background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.8)', fontSize: 12,
        }}
      >
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  )
}

const FMT = (bytes: number) => {
  if (bytes === 0) return '0 B'
  const u = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return (bytes / Math.pow(1024, i)).toFixed(1) + ' ' + u[i]
}

const FMT_DUR = (s: number) => {
  if (!s || !isFinite(s)) return '0:00'
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  return h > 0 ? `${h}h ${m}m` : `${m}m ${Math.floor(s % 60)}s`
}

export function SettingsView() {
  const glassSettings = useAppStore((s) => s.glassSettings)
  const setGlassSettings = useAppStore((s) => s.setGlassSettings)
  const lyricsAutoScrollDelay = useAppStore((s) => s.lyricsAutoScrollDelay)
  const setLyricsAutoScrollDelay = useAppStore((s) => s.setLyricsAutoScrollDelay)

  const [stats, setStats] = useState<any>(null)
  const [rebuilding, setRebuilding] = useState(false)
  const [pipelineRunning, setPipelineRunning] = useState(false)
  const [discogsToken, setDiscogsToken] = useState('')
  const [lastfmKey, setLastfmKey] = useState('')

  useEffect(() => {
    libraryApi.getStats().then((res: any) => setStats(res.data)).catch(() => {})
    api.getSettings().then((data: any) => {
      if (data.discogs_token !== undefined) setDiscogsToken(data.discogs_token)
      if (data.lastfm_api_key !== undefined) setLastfmKey(data.lastfm_api_key)
    }).catch(() => {})
  }, [])

  const saveApiKeys = useCallback(() => {
    api.updateSettings({ discogs_token: discogsToken, lastfm_api_key: lastfmKey }).catch(() => {})
  }, [discogsToken, lastfmKey])

  const update = useCallback((partial: Partial<GlassSettings>) => {
    setGlassSettings(partial)
    api.updateSettings({ glass: { ...glassSettings, ...partial } }).catch(() => {})
  }, [setGlassSettings, glassSettings])

  const handleRebuild = useCallback(async () => {
    setRebuilding(true)
    try {
      const res = await fetch('/api/import/rescan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
      if (res.ok) {
        const data = await res.json()
        console.log('Rebuild started:', data)
      }
    } catch (err) {
      console.error('Rebuild failed:', err)
    }
    setRebuilding(false)
  }, [])

  const handlePipeline = useCallback(async () => {
    setPipelineRunning(true)
    try {
      const res = await fetch('/api/import/pipeline', { method: 'POST', headers: { 'Content-Type': 'application/json' } })
      if (res.ok) {
        const data = await res.json()
        console.log('Pipeline done:', data)
      }
    } catch (err) {
      console.error('Pipeline failed:', err)
    }
    setPipelineRunning(false)
  }, [])

  return (
    <div style={{ padding: '120px 24px 100px', height: '100%', overflowY: 'auto' }}>
      <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 20, color: 'rgba(255,255,255,0.8)' }}>Settings</h2>

      <div style={{ maxWidth: 400, display: 'flex', flexDirection: 'column', gap: 20 }}>
        {/* API Keys */}
        <div>
          <h3 style={{ fontSize: 14, fontWeight: 500, color: 'rgba(255,255,255,0.6)', marginBottom: 12, letterSpacing: 0.5, textTransform: 'uppercase' }}>API Keys</h3>
          <InputField label="Discogs Token" value={discogsToken} onChange={setDiscogsToken} placeholder="your_discogs_token" onBlur={saveApiKeys} />
          <InputField label="Last.fm API Key" value={lastfmKey} onChange={setLastfmKey} placeholder="your_lastfm_api_key" onBlur={saveApiKeys} />
          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)', marginTop: 4 }}>
            Keys are saved to the database. Get Discogs token at discogs.com/settings, Last.fm key at last.fm/api
          </div>
        </div>

        {/* Library Diagnostics */}
        <div>
          <h3 style={{ fontSize: 14, fontWeight: 500, color: 'rgba(255,255,255,0.6)', marginBottom: 12, letterSpacing: 0.5, textTransform: 'uppercase' }}>Library Diagnostics</h3>
          {stats ? (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <StatCard label="Tracks" value={stats.tracks} />
              <StatCard label="Albums" value={stats.albums} />
              <StatCard label="Artists" value={stats.artists} />
              <StatCard label="Duration" value={FMT_DUR(stats.total_duration)} />
              <StatCard label="Library Size" value={FMT(stats.total_size_bytes)} />
              <StatCard label="Cache Size" value={FMT(stats.cache_size_bytes)} />
              <div style={{ gridColumn: '1 / -1' }}>
                <StatCard label="Last Scan" value={stats.last_scan_at || 'Never'} />
              </div>
            </div>
          ) : (
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)' }}>Loading...</div>
          )}
          <button
            onClick={handleRebuild}
            disabled={rebuilding}
            style={{
              marginTop: 10, padding: '8px 16px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)',
              background: rebuilding ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.05)',
              color: 'rgba(255,255,255,0.6)', fontSize: 12, cursor: rebuilding ? 'default' : 'pointer',
              width: '100%',
            }}
          >
            {rebuilding ? 'Rebuilding...' : 'Rebuild Index'}
          </button>
          <button
            onClick={handlePipeline}
            disabled={pipelineRunning}
            style={{
              marginTop: 6, padding: '8px 16px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)',
              background: pipelineRunning ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.05)',
              color: 'rgba(255,255,255,0.6)', fontSize: 12, cursor: pipelineRunning ? 'default' : 'pointer',
              width: '100%',
            }}
          >
            {pipelineRunning ? 'Running...' : 'Run Metadata Pipeline'}
          </button>
        </div>

        <div>
          <h3 style={{ fontSize: 14, fontWeight: 500, color: 'rgba(255,255,255,0.6)', marginBottom: 12, letterSpacing: 0.5, textTransform: 'uppercase' }}>Glass Surface</h3>

          <Slider label="Brightness" value={glassSettings.brightness} min={0} max={100} step={1} onChange={(v) => update({ brightness: v })} />
          <Slider label="Opacity" value={glassSettings.opacity} min={0} max={1} step={0.01} onChange={(v) => update({ opacity: v })} />
          <Slider label="Blur" value={glassSettings.blur} min={0} max={30} step={0.5} onChange={(v) => update({ blur: v })} />
          <Slider label="Border Width" value={glassSettings.borderWidth} min={0} max={0.5} step={0.01} onChange={(v) => update({ borderWidth: v })} />
          <Slider label="Background Opacity" value={glassSettings.backgroundOpacity} min={0} max={1} step={0.01} onChange={(v) => update({ backgroundOpacity: v })} />
          <Slider label="Saturation" value={glassSettings.saturation} min={0} max={2} step={0.05} onChange={(v) => update({ saturation: v })} />
          <Slider label="Displace" value={glassSettings.displace} min={0} max={20} step={0.5} onChange={(v) => update({ displace: v })} />
          <Slider label="Distortion Scale" value={glassSettings.distortionScale} min={-500} max={500} step={5} onChange={(v) => update({ distortionScale: v })} />
          <Slider label="Red Offset" value={glassSettings.redOffset} min={-50} max={50} step={1} onChange={(v) => update({ redOffset: v })} />
          <Slider label="Green Offset" value={glassSettings.greenOffset} min={-50} max={50} step={1} onChange={(v) => update({ greenOffset: v })} />
          <Slider label="Blue Offset" value={glassSettings.blueOffset} min={-50} max={50} step={1} onChange={(v) => update({ blueOffset: v })} />

          <Slider label="Dark Overlay" value={glassSettings.darkOverlay} min={0} max={1} step={0.01} onChange={(v) => update({ darkOverlay: v })} />
          <Selector label="Mix Blend Mode" value={glassSettings.mixBlendMode} options={MIX_BLEND_MODES} onChange={(v) => update({ mixBlendMode: v })} />
          <Selector label="X Channel" value={glassSettings.xChannel} options={CHANNELS} onChange={(v) => update({ xChannel: v })} />
          <Selector label="Y Channel" value={glassSettings.yChannel} options={CHANNELS} onChange={(v) => update({ yChannel: v })} />
        </div>

        <div>
          <h3 style={{ fontSize: 14, fontWeight: 500, color: 'rgba(255,255,255,0.6)', marginBottom: 12, letterSpacing: 0.5, textTransform: 'uppercase' }}>Lyrics</h3>
          <Slider label="Auto-scroll delay (ms)" value={lyricsAutoScrollDelay} min={500} max={10000} step={500} onChange={(v) => { setLyricsAutoScrollDelay(v); api.updateSettings({ lyricsAutoScrollDelay: v }).catch(() => {}) }} />
        </div>
      </div>
    </div>
  )
}

function InputField({ label, value, onChange, placeholder, onBlur }: { label: string; value: string; onChange: (v: string) => void; placeholder: string; onBlur?: () => void }) {
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginBottom: 4 }}>{label}</div>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        placeholder={placeholder}
        style={{
          width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)',
          background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.8)', fontSize: 12,
          outline: 'none',
        }}
      />
    </div>
  )
}

function StatCard({ label, value }: { label: string; value: any }) {
  return (
    <div style={{
      background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
      borderRadius: 8, padding: '10px 12px',
    }}>
      <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', marginBottom: 2, textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 600, color: 'rgba(255,255,255,0.85)' }}>{value}</div>
    </div>
  )
}
