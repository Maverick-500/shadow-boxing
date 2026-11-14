import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision'

// Raw signals, unsmoothed on purpose. Thresholds get set from measurement.

const WASM = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm'
const MODEL =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task'

export type Reading = {
  /** True when a face was found at all. Losing the face mid-run is fatal. */
  present: boolean
  /** 0 to 1 per eye, roughly "how shut". */
  blinkLeft: number
  blinkRight: number
  /** Head rotation in degrees, derived from the model's transform matrix. */
  yaw: number
  pitch: number
  /** Milliseconds the detector itself took. */
  latencyMs: number
  // Loop runs ~60Hz, camera ~30, so half of all reads are cached. Without this a cached value gets a fresh timestamp and the latency is of a frame nobody saw.
  frameId: number
}

const EMPTY: Reading = {
  present: false, blinkLeft: 0, blinkRight: 0, yaw: 0, pitch: 0, latencyMs: 0, frameId: 0,
}

export class Detector {
  private landmarker: FaceLandmarker | null = null
  private lastVideoTime = -1
  private last: Reading = EMPTY
  private frames = 0

  async load(): Promise<void> {
    const fileset = await FilesetResolver.forVisionTasks(WASM)
    this.landmarker = await FaceLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: MODEL, delegate: 'GPU' },
      outputFaceBlendshapes: true,
      outputFacialTransformationMatrixes: true,
      runningMode: 'VIDEO',
      numFaces: 1,
    })
  }

  get ready(): boolean {
    return this.landmarker !== null
  }

  // detectForVideo throws on a timestamp it has seen, and most calls are repeats.
  read(video: HTMLVideoElement): Reading {
    if (!this.landmarker || video.readyState < 2) return this.last
    if (video.currentTime === this.lastVideoTime) return this.last
    this.lastVideoTime = video.currentTime

    this.frames++
    const started = performance.now()
    const result = this.landmarker.detectForVideo(video, started)
    const latencyMs = performance.now() - started

    const shapes = result.faceBlendshapes?.[0]?.categories
    const matrix = result.facialTransformationMatrixes?.[0]?.data
    if (!shapes || !matrix) {
      this.last = { ...EMPTY, latencyMs, frameId: this.frames }
      return this.last
    }

    const value = (name: string): number =>
      shapes.find((c) => c.categoryName === name)?.score ?? 0

    // The third column of the rotation part is where the head is pointing. Euler angles from the full matrix invite axis-order mistakes; a single direction vector does not.
    const fx = matrix[8] ?? 0
    const fy = matrix[9] ?? 0
    const fz = matrix[10] ?? 1
    const yaw = (Math.atan2(fx, fz) * 180) / Math.PI
    const pitch = (Math.asin(Math.max(-1, Math.min(1, -fy))) * 180) / Math.PI

    this.last = {
      present: true,
      blinkLeft: value('eyeBlinkLeft'),
      blinkRight: value('eyeBlinkRight'),
      yaw,
      pitch,
      latencyMs,
      frameId: this.frames,
    }
    return this.last
  }
}
