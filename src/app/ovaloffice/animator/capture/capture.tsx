'use client'

import { CircleDot, Download, PersonStanding, Square, Video, VideoOff, Wand2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Camera } from '@/app/ovaloffice/animator/capture/camera'
import { QUALITIES, type Quality } from '@/app/ovaloffice/animator/capture/landmarker'
import { Preview } from '@/app/ovaloffice/animator/capture/preview'
import { draftKey } from '@/app/ovaloffice/animator/draft'
import { saveDoc } from '@/app/ovaloffice/animator/download'
import type { RigHandle } from '@/app/ovaloffice/animator/posing'
import { Num, Pick, Slide } from '@/app/ovaloffice/studio/parts'
import { Button } from '@/components/ui/button'
import { type AnimationDoc, MAX_DURATION, samplePose } from '@/domain/animator/clip'
import type { PoseFrame } from '@/domain/mocap/landmarks'
import { retarget } from '@/domain/mocap/retarget'
import type { MocapSkeleton } from '@/domain/mocap/skeleton'
import { type TakeFrame, toDoc } from '@/domain/mocap/take'

/**
 * Standing in front of a webcam and coming away with a clip.
 *
 * ---------------------------------------------------------------------------
 * The shape of the thing
 * ---------------------------------------------------------------------------
 * Two pictures side by side and one button. On the left the camera with the
 * skeleton the model found drawn over it; on the right the dummy doing the
 * same thing a twentieth of a second later. Everything else on the page is a
 * dial, and the two pictures are the argument for putting them together: when
 * the dummy does something strange, the overlay tells you instantly whether
 * the camera lost the arm or this app's arithmetic did.
 *
 * ---------------------------------------------------------------------------
 * What is recorded
 * ---------------------------------------------------------------------------
 * Landmarks, not poses. Every dial below - smoothing aside, which is applied
 * as frames arrive - is re-applied to the recording afterwards, so changing
 * the frame rate or how hard the keys are thinned re-derives the clip from
 * what the camera saw rather than asking you to perform the move again. See
 * the note at the top of `@/domain/mocap/take`.
 *
 * ---------------------------------------------------------------------------
 * And what this is not
 * ---------------------------------------------------------------------------
 * A first pass. One camera gives joint angles and guesses at depth; it has no
 * idea where you are in the room (the feed is hip-centred, so the figure is
 * stood on the floor instead of following you across it) and it cannot see a
 * wrist roll at all. A capture is worth what a rough layout is worth in any
 * animation: it gets the timing and the shape right, and then you key over it
 * next door.
 *
 * ---------------------------------------------------------------------------
 * Where the take goes is the caller's business
 * ---------------------------------------------------------------------------
 * The same bargain `ClipShelf` strikes for the animator, and for the same
 * reason: this component knows how to turn a body into a document and has no
 * opinion about where documents live. On its own page it offers a download and
 * a hand-off to the backoffice editor's draft. Given `onKeep` it offers that
 * instead - which is how the space's clip shelf embeds it, hands the take
 * straight to the editor above it, and lets the existing Save keep it as a
 * clip with everything that involves: a name, a price, a row.
 */

/** Where a capture is up to. One value, because they are all exclusive. */
type Phase = 'live' | 'counting' | 'recording' | 'review'

const COUNT_IN = 3

export function Capture({
  onKeep,
  keepLabel = 'Use this take',
}: {
  /**
   * Take the finished document, instead of this page offering the animator.
   *
   * Present on a surface that has somewhere to put a clip; absent on the
   * standalone page, where the only two things to do with a take are download
   * it and open it next door.
   */
  onKeep?: (doc: AnimationDoc) => void
  /** What that button says. The caller's, because it is the caller's shelf. */
  keepLabel?: string
} = {}) {
  const router = useRouter()

  // ---- the camera --------------------------------------------------------
  const [on, setOn] = useState(false)
  const [quality, setQuality] = useState<Quality>('fast')
  const [smoothing, setSmoothing] = useState(0.6)
  const [trouble, setTrouble] = useState<string | null>(null)
  const [rate, setRate] = useState(0)
  const [seen, setSeen] = useState(false)

  // ---- what to make of it ------------------------------------------------
  const [ground, setGround] = useState(true)
  const [fps, setFps] = useState(24)
  const [thin, setThin] = useState(2)
  const [name, setName] = useState('capture')

  // ---- the take ----------------------------------------------------------
  const [phase, setPhase] = useState<Phase>('live')
  const [countdown, setCountdown] = useState(COUNT_IN)
  const [elapsed, setElapsed] = useState(0)
  const [doc, setDoc] = useState<AnimationDoc | null>(null)
  /** How long the take actually ran, so a clip cut to fit can say so. */
  const [taken, setTaken] = useState(0)
  const [took, setTook] = useState(0)
  const [note, setNote] = useState<string | null>(null)

  /**
   * The live body, the same body as numbers, and the recording.
   *
   * All refs, and all for one reason: they are written by a loop running at
   * the camera's rate. A recording is up to a minute of landmarks - putting
   * that through `useState` would re-render the page thirty times a second to
   * change an array nothing renders.
   */
  const rigRef = useRef<RigHandle | null>(null)
  const skeletonRef = useRef<MocapSkeleton | null>(null)
  const framesRef = useRef<TakeFrame[]>([])
  const startedRef = useRef(0)
  const phaseRef = useRef<Phase>('live')
  const groundRef = useRef(ground)

  useEffect(() => {
    phaseRef.current = phase
    groundRef.current = ground
  }, [phase, ground])

  const onReady = useCallback((rig: RigHandle, skeleton: MocapSkeleton) => {
    rigRef.current = rig
    skeletonRef.current = skeleton
  }, [])

  /**
   * A frame from the camera: recorded if we are recording, and worn either
   * way.
   *
   * Retargeting here rather than in the camera keeps that component about the
   * camera. It costs one pose per frame - twenty-odd quaternions - which is
   * nothing next to the detector that produced the landmarks.
   */
  const onFrame = useCallback((frame: PoseFrame) => {
    setSeen(true)
    const rig = rigRef.current
    const skeleton = skeletonRef.current
    if (!rig || !skeleton) return

    if (phaseRef.current === 'recording') {
      framesRef.current.push({ time: (performance.now() - startedRef.current) / 1000, frame })
    }

    // In review the clip is driving the body, and a live frame written over
    // the top of it would be the two fighting for the same bones.
    if (phaseRef.current === 'review') return
    rig.apply(retarget(frame, skeleton, { ground: groundRef.current }))
  }, [])

  const onTrouble = useCallback((message: string | null) => {
    setTrouble(message)
    // A camera that would not start is a camera that is not running, whatever
    // the button says.
    if (message) setOn(false)
  }, [])

  // ---- recording ---------------------------------------------------------

  const record = useCallback(() => {
    setNote(null)
    setDoc(null)
    setCountdown(COUNT_IN)
    setPhase('counting')
  }, [])

  const finish = useCallback(() => {
    // A recording with nothing in it is not a take. It happens for one reason
    // - the model never found a body - and saying so is worth more than a
    // review screen with an empty document behind it.
    if (framesRef.current.length === 0) {
      setNote('Nothing was recorded: the model never found a body in the picture.')
      setPhase('live')
      return
    }
    setTaken(framesRef.current[framesRef.current.length - 1].time)
    setPhase('review')
    setTook((count) => count + 1)
  }, [])

  /**
   * The count-in. Three seconds is about as long as it takes to step back.
   *
   * Every state change happens inside the timeout rather than in the effect's
   * body - the last second of the count *is* the start of the recording, and
   * moving that into the body would be a render triggering another render.
   */
  useEffect(() => {
    if (phase !== 'counting') return
    const timer = setTimeout(() => {
      if (countdown > 1) {
        setCountdown((count) => count - 1)
        return
      }
      framesRef.current = []
      startedRef.current = performance.now()
      setElapsed(0)
      setPhase('recording')
    }, 1000)
    return () => clearTimeout(timer)
  }, [phase, countdown])

  /**
   * The clock on the recording, and the stop it cannot run past.
   *
   * Ten times a second rather than every frame: it is a number with one
   * decimal on it, and the loop that matters is the camera's.
   */
  useEffect(() => {
    if (phase !== 'recording') return
    const timer = setInterval(() => {
      const seconds = (performance.now() - startedRef.current) / 1000
      setElapsed(seconds)
      if (seconds >= MAX_DURATION) finish()
    }, 100)
    return () => clearInterval(timer)
  }, [phase, finish])

  /**
   * The document, re-derived whenever a dial moves.
   *
   * This is the whole reason the take is landmarks: `fps`, `thin` and the
   * floor are decisions about a recording that already happened, and every one
   * of them is a slider you can drag while watching the result loop.
   */
  useEffect(() => {
    if (phase !== 'review') return
    const skeleton = skeletonRef.current
    if (!skeleton || framesRef.current.length === 0) return
    setDoc(toDoc(framesRef.current, skeleton, { fps, thin, ground, name }))
  }, [phase, took, fps, thin, ground, name])

  /** The take, looping on the dummy, so a dial's effect is visible. */
  useEffect(() => {
    if (phase !== 'review' || !doc) return
    const rig = rigRef.current
    if (!rig) return

    let frame = 0
    const started = performance.now()
    const span = Math.max(doc.duration, 1 / doc.fps)
    const tick = () => {
      frame = requestAnimationFrame(tick)
      rig.apply(samplePose(doc, ((performance.now() - started) / 1000) % span, rig.rest))
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [phase, doc])

  const again = useCallback(() => {
    framesRef.current = []
    setDoc(null)
    setNote(null)
    setPhase('live')
  }, [])

  // ---- what to do with it ------------------------------------------------

  const send = useCallback(() => {
    if (!doc) return
    const key = draftKey('dummy')
    // The animator autosaves whatever is open into this key, so handing it a
    // capture is throwing that away. Ask - the draft is somebody's afternoon,
    // and a download is right here if the answer is no.
    const existing = window.localStorage.getItem(key)
    if (existing && !window.confirm('The animator has a draft for the person. Replace it with this capture?')) {
      return
    }
    try {
      window.localStorage.setItem(key, JSON.stringify(doc))
    } catch {
      setNote('This browser would not store the clip - download it instead.')
      return
    }
    router.push('/ovaloffice/animator')
  }, [doc, router])

  const busy = phase === 'counting' || phase === 'recording'

  return (
    <div className="flex flex-col gap-4">
      {trouble && (
        <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-foreground">
          {trouble}
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="relative">
          <Camera
            running={on}
            quality={quality}
            smoothing={smoothing}
            onFrame={onFrame}
            onTrouble={onTrouble}
            onRate={setRate}
          />
          {phase === 'counting' && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <span className="text-7xl font-semibold text-white drop-shadow-lg">
                {countdown || 'go'}
              </span>
            </div>
          )}
          {phase === 'recording' && (
            <span className="pointer-events-none absolute left-3 top-3 flex items-center gap-2 rounded-full bg-black/60 px-3 py-1 text-xs font-medium text-white">
              <CircleDot className="size-3.5 animate-pulse text-red-400" />
              {elapsed.toFixed(1)}s
            </span>
          )}
          {on && (
            <span className="pointer-events-none absolute right-3 top-3 rounded-full bg-black/60 px-2 py-1 font-mono text-[11px] text-white/80">
              {rate} fps{seen ? '' : ' · nobody in shot'}
            </span>
          )}
        </div>

        <Preview onReady={onReady} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button variant={on ? 'secondary' : 'default'} onClick={() => setOn((was) => !was)} disabled={busy}>
          {on ? <VideoOff /> : <Video />}
          {on ? 'Stop the camera' : 'Start the camera'}
        </Button>

        {phase === 'recording' ? (
          <Button variant="destructive" onClick={finish}>
            <Square /> Stop recording
          </Button>
        ) : (
          <Button onClick={record} disabled={!on || phase === 'counting'}>
            <CircleDot /> {phase === 'review' ? 'Record another' : 'Record'}
          </Button>
        )}

        {phase === 'review' && doc && (
          <>
            {onKeep ? (
              <Button onClick={() => onKeep(doc)}>
                <Wand2 /> {keepLabel}
              </Button>
            ) : (
              <Button variant="secondary" onClick={send}>
                <Wand2 /> Open in the animator
              </Button>
            )}
            <Button variant="secondary" onClick={() => saveDoc(doc)}>
              <Download /> Download .json
            </Button>
            <Button variant="ghost" onClick={again}>
              Throw it away
            </Button>
          </>
        )}
      </div>

      {note && <p className="text-sm text-muted-foreground">{note}</p>}

      <div className="grid gap-4 rounded-lg border border-border bg-secondary/30 p-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="flex flex-col gap-2">
          <Pick
            label="Model"
            value={quality}
            options={QUALITIES}
            onChange={(next) => setQuality(next as Quality)}
          />
          <p className="text-xs text-muted-foreground">
            Steady sees depth better and costs about twice the work. Changing it restarts the
            camera.
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <span className="text-xs text-muted-foreground">Smoothing</span>
          <Slide label="" value={smoothing} min={0} max={1} step={0.05} onChange={setSmoothing} />
          <p className="text-xs text-muted-foreground">
            Held still, a joint still shakes by a centimetre. This blends that away and lets go as
            soon as you move properly, so a wave does not arrive late.
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <Num label="Frames a second" value={fps} min={6} max={60} step={1} onChange={setFps} />
          <span className="text-xs text-muted-foreground">Thin the keys</span>
          <Slide label="" value={thin} min={0} max={8} step={0.5} unit="°" onChange={setThin} />
          <p className="text-xs text-muted-foreground">
            {doc
              ? `${doc.keys.length} keys over ${doc.duration.toFixed(2)}s.`
              : 'A key on every frame, then the ones a straight blend would have made anyway are dropped.'}
            {/*
              Said only when it happened. A clip may carry so many samples and
              no more - the same limit wherever one is kept - and at a high
              frame rate that arrives well before the minute the recorder will
              let you run for.
            */}
            {doc && taken - doc.duration > 0.05 && (
              <>
                {' '}
                Cut from {taken.toFixed(1)}s: a clip holds about a minute at 24fps, and fewer
                seconds the faster you key it.
              </>
            )}
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={ground}
              onChange={(event) => setGround(event.target.checked)}
              className="size-4 accent-accent"
            />
            <PersonStanding className="size-4" /> Stand it on the floor
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Clip name
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="w-full rounded-lg border border-border bg-secondary/40 px-2 py-1 text-sm text-foreground transition focus:border-accent focus:bg-transparent focus:outline-none"
            />
          </label>
          <p className="text-xs text-muted-foreground">
            The camera cannot see where you are standing, only how you are standing. The floor keeps
            the feet down so a crouch is a crouch.
          </p>
        </div>
      </div>
    </div>
  )
}
