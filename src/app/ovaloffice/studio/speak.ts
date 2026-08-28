import { dialogue, type ShotSpec } from '@/domain/studio/shot'
import { type Blip, droopAt, speechBlips, voiceFor } from '@/domain/studio/voice'

/**
 * The cast, out loud.
 *
 * `@/domain/studio/voice` decides what a line sounds like without touching a
 * browser; this is the part that makes noise. One `AudioContext`, one gain
 * node, and an oscillator per blip scheduled ahead of time.
 *
 * ---------------------------------------------------------------------------
 * Why the whole shot is scheduled at once
 * ---------------------------------------------------------------------------
 * Web Audio schedules against its own clock, which runs on the audio thread and
 * does not stutter when the renderer does. Firing each blip from the frame loop
 * would tie the dialogue to the frame rate - and the frame rate during a capture
 * is the thing that is *known* to be under pressure, so the words would slur on
 * exactly the take that matters.
 *
 * So pressing play schedules every blip from here to the end of the shot in one
 * go, at absolute times, and then leaves it alone. Seeking or pausing tears the
 * whole schedule down and builds it again from the new position, which is cheap:
 * a minute of dialogue is a few hundred oscillators.
 *
 * ---------------------------------------------------------------------------
 * The same graph is the recording
 * ---------------------------------------------------------------------------
 * The output goes to two places: the speakers, so playback is audible, and a
 * `MediaStreamDestination`, whose track is handed to `MediaRecorder` alongside
 * the canvas's. That is the only route to sound in the exported file -
 * `speechSynthesis` plays out of the tab rather than through a graph, so a
 * recorder cannot see it.
 */

export class Voice {
  private context: AudioContext | null = null
  private master: GainNode | null = null
  private sink: MediaStreamAudioDestinationNode | null = null
  /** Everything scheduled and not yet finished, so a seek can silence it. */
  private live: AudioScheduledSourceNode[] = []

  /**
   * Built on the first play rather than at construction.
   *
   * A context created before a gesture starts suspended in every browser, and
   * one created per line would leak a hardware handle each time.
   */
  private open(): AudioContext | null {
    if (typeof window === 'undefined') return null
    if (this.context) return this.context

    const Ctor = window.AudioContext ?? (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctor) return null

    const context = new Ctor()
    const master = context.createGain()
    // Well under unity: a dozen overlapping blips at full tilt clip, and the
    // export is a master that gets levelled in an editor anyway.
    master.gain.value = 0.28
    master.connect(context.destination)

    const sink = context.createMediaStreamDestination()
    master.connect(sink)

    this.context = context
    this.master = master
    this.sink = sink
    return context
  }

  /** The audio track for the recorder, or null if there is no sound to give it. */
  track(): MediaStreamTrack | null {
    return this.sink?.stream.getAudioTracks()[0] ?? null
  }

  /** Whether anything can be heard at all. Off in a browser with no Web Audio. */
  get available(): boolean {
    return typeof window !== 'undefined' && Boolean(window.AudioContext)
  }

  /**
   * Speak everything from `from` to the end of the shot.
   *
   * Lines already under way when the playhead lands mid-sentence are started
   * from their middle rather than replayed, so scrubbing into the second half
   * of a line does not repeat its first half over the top of the picture.
   */
  start(shot: ShotSpec, from: number): void {
    this.stop()
    if (!shot.voice) return

    const context = this.open()
    if (!context || !this.master) return
    // A context built before the click, or suspended by the tab going to the
    // background, has to be woken or nothing is heard and nothing errors.
    void context.resume()

    const origin = context.currentTime + 0.06

    for (const line of dialogue(shot)) {
      const end = line.at + line.length
      if (end <= from) continue

      const voice = voiceFor(line.avatar)
      const blips = speechBlips(line.text, voice, line.length)
      const span = blips.length > 0 ? blips[blips.length - 1].at : 1

      for (const blip of blips) {
        const when = line.at + blip.at - from
        if (when < 0) continue
        this.schedule(context, blip, origin + when, span <= 0 ? 0 : blip.at / span, voice.wave)
      }
    }
  }

  /** One blip, as an oscillator that cleans up after itself. */
  private schedule(
    context: AudioContext,
    blip: Blip,
    when: number,
    fraction: number,
    wave: OscillatorType,
  ): void {
    if (!this.master) return

    const oscillator = context.createOscillator()
    const gain = context.createGain()

    oscillator.type = wave
    oscillator.frequency.value = blip.hz * droopAt(fraction)

    // A hard start and stop on a square wave is a click on every letter, which
    // over a sentence is a machine gun. Two milliseconds each side is inaudible
    // as an envelope and removes all of it.
    gain.gain.setValueAtTime(0, when)
    gain.gain.linearRampToValueAtTime(blip.gain, when + 0.002)
    gain.gain.setValueAtTime(blip.gain, when + blip.duration - 0.002)
    gain.gain.linearRampToValueAtTime(0, when + blip.duration)

    oscillator.connect(gain)
    gain.connect(this.master)
    oscillator.start(when)
    oscillator.stop(when + blip.duration)

    this.live.push(oscillator)
    oscillator.onended = () => {
      gain.disconnect()
      oscillator.disconnect()
      this.live = this.live.filter((node) => node !== oscillator)
    }
  }

  /** Silence, now. Everything scheduled and not yet played is thrown away. */
  stop(): void {
    for (const node of this.live) {
      try {
        node.stop()
      } catch {
        // Already finished between the schedule and here. Nothing to stop.
      }
    }
    this.live = []
  }

  /** For unmount. The context is a hardware handle and does not free itself. */
  close(): void {
    this.stop()
    void this.context?.close()
    this.context = null
    this.master = null
    this.sink = null
  }

  /**
   * A voice with its own silent graph, for a take with no dialogue.
   *
   * `MediaRecorder` is handed the track either way. A stream whose audio track
   * appears only for some shots would mean two code paths through the recorder
   * and two kinds of file out the other end, one of which some editors refuse
   * to import.
   */
  silence(): void {
    this.open()
  }
}
