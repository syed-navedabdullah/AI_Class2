import { useRef, useState, useCallback } from 'react'
import './App.css'

const KIMI_API_KEY = import.meta.env.VITE_KIMI_API_KEY
const KIMI_BASE_URL = import.meta.env.VITE_KIMI_BASE_URL || 'https://api.moonshot.ai/v1'
const KIMI_MODEL = import.meta.env.VITE_KIMI_MODEL || 'moonshot-v1-8k-vision-preview'

function App() {
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const streamRef = useRef(null)

  const [cameraOn, setCameraOn] = useState(false)
  const [photo, setPhoto] = useState(null)
  const [result, setResult] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const startCamera = useCallback(async () => {
    setError('')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
      }
      setCameraOn(true)
      setPhoto(null)
      setResult('')
    } catch (err) {
      setError(`Could not access camera: ${err.message}`)
    }
  }, [])

  const capturePhoto = useCallback(() => {
    if (!videoRef.current || !canvasRef.current) return
    const video = videoRef.current
    const canvas = canvasRef.current
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d')
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
    setPhoto(canvas.toDataURL('image/jpeg', 0.9))
    setResult('')
  }, [])

  const askKimi = useCallback(async () => {
    if (!photo) return
    if (!KIMI_API_KEY) {
      setError('No Kimi API key found. Add VITE_KIMI_API_KEY to your .env file and restart the dev server.')
      return
    }
    setLoading(true)
    setError('')
    setResult('')
    try {
      const response = await fetch(`${KIMI_BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${KIMI_API_KEY}`,
        },
        body: JSON.stringify({
          model: KIMI_MODEL,
          messages: [
            {
              role: 'user',
              content: [
                { type: 'image_url', image_url: { url: photo } },
                { type: 'text', text: 'What is in this picture? Describe it briefly.' },
              ],
            },
          ],
        }),
      })

      if (!response.ok) {
        const text = await response.text()
        throw new Error(`Kimi API error ${response.status}: ${text}`)
      }

      const data = await response.json()
      setResult(data.choices?.[0]?.message?.content ?? 'No answer returned.')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [photo])

  return (
    <div className="app">
      <h1 className="title">
        <span className="rabbit-emoji" aria-hidden="true">🐰</span> AI Rabbit Cam
      </h1>

      <div className="stage">
        {!photo && (
          <video ref={videoRef} className="video" autoPlay playsInline muted />
        )}
        {photo && <img src={photo} className="video" alt="Captured" />}
        {!cameraOn && !photo && (
          <div className="stage-placeholder">Camera is off</div>
        )}
      </div>

      <canvas ref={canvasRef} style={{ display: 'none' }} />

      <div className="controls">
        <button type="button" className="icon-btn" onClick={startCamera} title="Start camera">
          📷
        </button>
        <button
          type="button"
          className="icon-btn"
          onClick={capturePhoto}
          disabled={!cameraOn}
          title="Capture photo"
        >
          ⏺️
        </button>
        <button
          type="button"
          className="icon-btn rabbit-btn"
          onClick={askKimi}
          disabled={!photo || loading}
          title="Ask AI Rabbit"
        >
          🐰
        </button>
      </div>

      {loading && <p className="status">Asking the rabbit…</p>}
      {error && <p className="status error">{error}</p>}
      {result && (
        <div className="result">
          <h2>The rabbit says:</h2>
          <p>{result}</p>
        </div>
      )}
    </div>
  )
}

export default App
