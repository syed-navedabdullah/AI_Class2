import { useRef, useState, useCallback, useEffect } from 'react'
import './App.css'

const KIMI_API_KEY = import.meta.env.VITE_KIMI_API_KEY
const KIMI_BASE_URL = import.meta.env.VITE_KIMI_BASE_URL || 'https://api.moonshot.ai/v1'
const KIMI_MODEL = import.meta.env.VITE_KIMI_MODEL || 'moonshot-v1-8k-vision-preview'

const POSES = [
  {
    title: 'Pose 1 — Power Stance',
    instruction: 'Stand tall, hands on your hips, chin slightly up, shoulders back. Look confidently into the lens.',
  },
  {
    title: 'Pose 2 — Candid Angle',
    instruction: 'Turn your body about 45°, weight on your back leg, soft smile, eyes toward the camera.',
  },
  {
    title: 'Pose 3 — Editorial Look',
    instruction: 'Cross your arms, tilt your head slightly, strong/intense expression, chin down a touch.',
  },
]

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function App() {
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const streamRef = useRef(null)
  const readyResolveRef = useRef(null)

  // idle | live | instruction | countdown | flash | review | evaluating | done
  const [stage, setStage] = useState('idle')
  const [poseIndex, setPoseIndex] = useState(0)
  const [countdown, setCountdown] = useState(5)
  const [photos, setPhotos] = useState([])
  const [evaluations, setEvaluations] = useState(null)
  const [rawResult, setRawResult] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    const videoVisible = ['live', 'instruction', 'countdown', 'flash'].includes(stage)
    if (videoVisible && streamRef.current && videoRef.current && videoRef.current.srcObject !== streamRef.current) {
      videoRef.current.srcObject = streamRef.current
    }
  }, [stage])

  const grabFrame = () => {
    const video = videoRef.current
    const canvas = canvasRef.current
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d')
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
    return canvas.toDataURL('image/jpeg', 0.9)
  }

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }
  }

  const handleReady = () => {
    if (readyResolveRef.current) {
      readyResolveRef.current()
      readyResolveRef.current = null
    }
  }

  const waitForReady = () => new Promise((resolve) => { readyResolveRef.current = resolve })

  const runSession = useCallback(async () => {
    setError('')
    setPhotos([])
    setEvaluations(null)
    setRawResult('')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true })
      streamRef.current = stream
      setStage('live')
      await delay(400)

      const captured = []
      for (let i = 0; i < POSES.length; i++) {
        setPoseIndex(i)
        setStage('instruction')
        await waitForReady()

        setStage('countdown')
        for (let c = 5; c >= 1; c--) {
          setCountdown(c)
          await delay(1000)
        }

        const shot = grabFrame()
        captured.push(shot)
        setPhotos([...captured])
        setStage('flash')
        await delay(500)
      }

      stopCamera()
      setStage('review')
    } catch (err) {
      stopCamera()
      setError(`Could not access camera: ${err.message}`)
      setStage('idle')
    }
  }, [])

  const parseEvaluations = (text) => {
    const matches = [...text.matchAll(/POSE\s*(\d+)[:.\-]?\s*([\s\S]*?)(?=(?:POSE\s*\d+[:.\-]?)|$)/gi)]
    if (matches.length < POSES.length) return null
    const result = POSES.map(() => '')
    matches.forEach((m) => {
      const idx = parseInt(m[1], 10) - 1
      if (idx >= 0 && idx < POSES.length) result[idx] = m[2].trim()
    })
    return result.every((r) => r) ? result : null
  }

  const evaluatePoses = useCallback(async () => {
    if (photos.length < POSES.length) return
    if (!KIMI_API_KEY) {
      setError('No Kimi API key found. Add VITE_KIMI_API_KEY to your .env file and restart the dev server.')
      return
    }
    setStage('evaluating')
    setError('')
    try {
      const content = [
        {
          type: 'text',
          text:
            'You are a professional posing coach. I attempted three modeling poses, each based on a written instruction. ' +
            'For each pose, give 2-3 sentences of constructive feedback on how well I executed it plus one tip to improve. ' +
            'Reply in exactly this format with no extra commentary:\n' +
            'POSE 1: <feedback>\nPOSE 2: <feedback>\nPOSE 3: <feedback>',
        },
      ]
      POSES.forEach((pose, i) => {
        content.push({ type: 'text', text: `Pose ${i + 1} instruction: ${pose.instruction}` })
        content.push({ type: 'image_url', image_url: { url: photos[i] } })
      })

      const response = await fetch(`${KIMI_BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${KIMI_API_KEY}`,
        },
        body: JSON.stringify({
          model: KIMI_MODEL,
          messages: [{ role: 'user', content }],
        }),
      })

      if (!response.ok) {
        const text = await response.text()
        throw new Error(`Kimi API error ${response.status}: ${text}`)
      }

      const data = await response.json()
      const text = data.choices?.[0]?.message?.content ?? ''
      const parsed = parseEvaluations(text)
      setEvaluations(parsed)
      setRawResult(text)
      setStage('done')
    } catch (err) {
      setError(err.message)
      setStage('review')
    }
  }, [photos])

  const reset = () => {
    stopCamera()
    setStage('idle')
    setPoseIndex(0)
    setPhotos([])
    setEvaluations(null)
    setRawResult('')
    setError('')
  }

  return (
    <div className="app">
      <h1 className="title">
        <span className="rabbit-emoji" aria-hidden="true">🐰</span> AI Rabbit Cam
      </h1>

      {stage === 'idle' && (
        <>
          <div className="stage">
            <div className="stage-placeholder">Camera is off</div>
          </div>
          <button type="button" className="icon-btn" onClick={runSession} title="Start camera">
            📷
          </button>
        </>
      )}

      {(stage === 'live' || stage === 'instruction' || stage === 'countdown' || stage === 'flash') && (
        <>
          <p className="status">Pose {poseIndex + 1} of {POSES.length}</p>
          <div className="stage">
            <video ref={videoRef} className="video" autoPlay playsInline muted />
            {stage === 'countdown' && <div className="countdown-overlay">{countdown}</div>}
            {stage === 'flash' && <div className="flash-overlay" />}
          </div>
          {stage === 'instruction' && (
            <div className="pose-card">
              <h2>{POSES[poseIndex].title}</h2>
              <p>{POSES[poseIndex].instruction}</p>
              <button type="button" className="ready-btn" onClick={handleReady}>
                I&apos;m Ready
              </button>
            </div>
          )}
        </>
      )}

      {(stage === 'review' || stage === 'evaluating') && (
        <>
          <div className="gallery">
            {photos.map((p, i) => (
              <div className="gallery-item" key={i}>
                <img src={p} alt={POSES[i].title} />
                <p className="pose-label">{POSES[i].title}</p>
              </div>
            ))}
          </div>
          <button
            type="button"
            className="icon-btn rabbit-btn"
            onClick={evaluatePoses}
            disabled={stage === 'evaluating'}
            title="Ask AI Rabbit"
          >
            🐰
          </button>
          {stage === 'evaluating' && <p className="status">Asking the rabbit to judge your poses…</p>}
        </>
      )}

      {stage === 'done' && (
        <>
          <div className="results">
            {photos.map((p, i) => (
              <div className="result-card" key={i}>
                <img src={p} alt={POSES[i].title} />
                <div className="result-text">
                  <h2>{POSES[i].title}</h2>
                  <p>{evaluations ? evaluations[i] : ''}</p>
                </div>
              </div>
            ))}
          </div>
          {!evaluations && rawResult && (
            <div className="result-raw">
              <p>{rawResult}</p>
            </div>
          )}
          <button type="button" className="icon-btn" onClick={reset} title="Start over">
            🔄
          </button>
        </>
      )}

      {error && <p className="status error">{error}</p>}

      <canvas ref={canvasRef} style={{ display: 'none' }} />
    </div>
  )
}

export default App
