'use client';

import { useEffect, useRef } from 'react';
import { detectMotion } from '@/lib/video/motion';

/**
 * Camera capture for the video sensing blocks.
 *
 * Only the plumbing lives here — getUserMedia, a hidden video element, and a
 * small offscreen canvas to sample frames from. The maths is in
 * `lib/video/motion.ts`, tested against frames built by hand, because "is the
 * direction right" is not a question a camera can answer.
 *
 * Deliberate choices, all of them about children:
 *
 * - **The camera is off until a script turns it on.** A shared game must not
 *   open a stranger's webcam because someone clicked Play. `turn video on` is
 *   an explicit block a child has to place.
 * - **Nothing leaves the browser.** Frames are compared in memory and
 *   discarded. No upload, no recording, no frame ever touches the server.
 * - **The stream is stopped the moment video is turned off or the player
 *   unmounts**, so the browser's camera indicator tells the truth.
 *
 * Sampling runs at ~15fps rather than every frame: motion between two frames
 * 16ms apart is mostly noise, and this shares a machine with a 3D scene.
 */

/** Downscaled sampling size. A hand is huge at this resolution; a laptop is not fast. */
const SAMPLE_W = 160;
const SAMPLE_H = 120;
const SAMPLE_INTERVAL_MS = 66;

export interface VideoSensingHandle {
  /** Turn capture on, off, or on with a mirrored image. */
  setState(state: 'on' | 'off' | 'flipped'): void;
  setTransparency(value: number): void;
}

export function VideoSensing({
  onMotion,
  onError,
  onReady,
  handleRef,
}: {
  /** Called with each reading while the camera is on. */
  onMotion: (amount: number, direction: number) => void;
  /** Called if the camera cannot be opened — blocked permission, no device. */
  onError?: (message: string) => void;
  /**
   * Hands the controller to whoever needs it — in practice the RuntimeWorld,
   * because the video blocks run inside per-object components that cannot see
   * this one.
   */
  onReady?: (controller: VideoSensingHandle) => void;
  handleRef: React.RefObject<VideoSensingHandle | null>;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const previousRef = useRef<Uint8ClampedArray | null>(null);
  /**
   * Frames still to discard after the camera starts.
   *
   * A camera's first frames are auto-exposure settling, not movement: measured
   * against Chromium's synthetic device the opening reading saturates at 100
   * while everything after it sits around 40-60. Reporting that would fire
   * `when video motion > 10` the instant a child turns video on, before they
   * had moved at all.
   */
  const settleRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const flippedRef = useRef(false);
  const transparencyRef = useRef(50);
  /**
   * The latest callback, so the sampling interval always calls the current one
   * without being torn down and restarted every render.
   *
   * Assigned in an effect rather than during render: writing a ref while
   * rendering is what react-hooks/refs forbids, and this file is new code —
   * the exemption list in eslint.config.mjs is for patterns that predate the
   * rule, not a place to put fresh violations.
   */
  const onMotionRef = useRef(onMotion);
  useEffect(() => {
    onMotionRef.current = onMotion;
  }, [onMotion]);

  useEffect(() => {
    const stop = () => {
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = null;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      previousRef.current = null;
      if (videoRef.current) videoRef.current.srcObject = null;
    };

    const start = async () => {
      if (streamRef.current) return;
      if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
        onError?.("This browser can't use the camera.");
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: SAMPLE_W * 2, height: SAMPLE_H * 2 },
          audio: false,
        });
        streamRef.current = stream;

        const video = videoRef.current ?? document.createElement('video');
        videoRef.current = video;
        video.srcObject = stream;
        video.muted = true;
        video.playsInline = true;
        await video.play().catch(() => {});

        const canvas = canvasRef.current ?? document.createElement('canvas');
        canvasRef.current = canvas;
        canvas.width = SAMPLE_W;
        canvas.height = SAMPLE_H;
        const ctx2d = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx2d) return;

        timerRef.current = setInterval(() => {
          if (!video.videoWidth) return;
          ctx2d.save();
          if (flippedRef.current) {
            ctx2d.translate(SAMPLE_W, 0);
            ctx2d.scale(-1, 1);
          }
          ctx2d.drawImage(video, 0, 0, SAMPLE_W, SAMPLE_H);
          ctx2d.restore();

          const frame = ctx2d.getImageData(0, 0, SAMPLE_W, SAMPLE_H).data;
          const previous = previousRef.current;
          if (settleRef.current > 0) {
            settleRef.current--;
            previousRef.current = new Uint8ClampedArray(frame);
            return;
          }
          if (previous) {
            const { amount, direction } = detectMotion(previous, frame, SAMPLE_W, SAMPLE_H);
            onMotionRef.current(amount, direction);
          }
          // Copy: getImageData reuses its buffer in some engines.
          previousRef.current = new Uint8ClampedArray(frame);
        }, SAMPLE_INTERVAL_MS);
      } catch (e: any) {
        onError?.(
          e?.name === 'NotAllowedError'
            ? 'Camera permission was blocked. Allow it to use the video blocks.'
            : "Couldn't start the camera."
        );
      }
    };

    const controller: VideoSensingHandle = {
      setState: (state) => {
        if (state === 'off') {
          stop();
          onMotionRef.current(0, 0);
          return;
        }
        flippedRef.current = state === 'flipped';
        // Two sampling intervals (~130ms) of settling before the first reading.
        settleRef.current = 2;
        void start();
      },
      setTransparency: (value) => {
        transparencyRef.current = Math.max(0, Math.min(100, value));
      },
    };
    handleRef.current = controller;
    onReady?.(controller);

    return () => {
      handleRef.current = null;
      stop();
    };
  }, [handleRef, onError, onReady]);

  // Nothing to render: the video element is offscreen and the canvas is only a
  // sampling buffer. Drawing the feed behind the scene is a separate concern.
  return null;
}

export default VideoSensing;
