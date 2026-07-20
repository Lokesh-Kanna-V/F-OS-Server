import { getMqttClient } from "@/shared/services/mqtt.service";
import type { Adxl345Event, Adxl345Snapshot, MachineState, TelemetryPoint } from "./adxl345.types";

const STATE_TOPIC = "adxl345/state";
const TELEMETRY_TOPIC = "adxl345/telemetry";
const MAX_TELEMETRY_POINTS = 200;

// How much cumulative running time to watch before locking in a baseline
// vibration threshold, and how far above that baseline counts as abnormal.
const CALIBRATION_WINDOW_MS = 5_000;
const ALERT_MARGIN_MULTIPLIER = 1.3;
const MIN_BASELINE_MAX_RMS = 0.05;
// Anchor the baseline to a high percentile of calibration samples rather
// than the raw max — this signal is bursty (peaks several times higher than
// typical readings show up on every run), so the single highest sample in
// the window is a near-worst-case value, not a representative "usual max".
const CALIBRATION_PERCENTILE = 0.95;
// A run this brief is more likely a flicker in the state signal than the
// machine genuinely stopping — don't lock in calibration off a near-empty
// sample, just keep waiting for a real run.
const MIN_RUN_MS_FOR_EARLY_LOCK = 1_000;

// Alert on repeated crossings, not a single excursion: count how many times
// the signal rises above the baseline within this rolling window, and only
// flag it once that count reaches the minimum.
const CROSSING_WINDOW_MS = 5_000;
const MIN_CROSSINGS_TO_ALERT = 2;
// Ignore re-crossings faster than this — a single shake can make the raw
// signal flicker back and forth right at the threshold, which would
// otherwise look like several distinct events instead of one.
const MIN_CROSSING_GAP_MS = 300;

let state: MachineState | null = null;
let stateUpdatedAt: number | null = null;
let lastTransitionAt = Date.now();
let onDurationMs = 0;
let offDurationMs = 0;
const telemetry: TelemetryPoint[] = [];

const calibrationSamples: number[] = [];
let baselineMaxRms: number | null = null;
let alertActive = false;
let lastAlertAt: number | null = null;
let previousRms: number | null = null;
const crossingTimestamps: number[] = [];

const computeBaselineFromSamples = (): number => {
  const sorted = [...calibrationSamples].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.floor(sorted.length * CALIBRATION_PERCENTILE));
  const percentileRms = sorted[index];
  return Math.max(percentileRms * ALERT_MARGIN_MULTIPLIER, MIN_BASELINE_MAX_RMS);
};

const listeners = new Set<(event: Adxl345Event) => void>();

const emit = (event: Adxl345Event) => {
  listeners.forEach((listener) => listener(event));
};

const setState = (next: MachineState) => {
  if (state === next) return;

  const now = Date.now();
  if (state === "on") {
    onDurationMs += now - lastTransitionAt;
    // Went back to idle before the calibration window elapsed — lock in
    // whatever running time we've accumulated so far rather than waiting on
    // a run that may not resume for a while. Checked against *cumulative*
    // running time, not just this last streak, so a state signal that
    // flickers briefly a few times doesn't reset progress toward this.
    if (
      baselineMaxRms === null &&
      calibrationSamples.length > 0 &&
      onDurationMs >= MIN_RUN_MS_FOR_EARLY_LOCK
    ) {
      baselineMaxRms = computeBaselineFromSamples();
    }
  } else if (state === "off") {
    offDurationMs += now - lastTransitionAt;
  }
  lastTransitionAt = now;

  state = next;
  stateUpdatedAt = now;
  emit({ type: "state", data: { state, stateUpdatedAt, onDurationMs, offDurationMs } });
};

const parseState = (raw: string): MachineState | null => {
  const normalized = raw.trim().toUpperCase();
  if (normalized === "ON") return "on";
  if (normalized === "OFF") return "off";
  return null;
};

const handleStateMessage = (raw: string) => {
  const parsed = parseState(raw);
  if (parsed) setState(parsed);
};

const checkForAnomaly = (rms: number, now: number) => {
  if (baselineMaxRms === null) {
    // Don't start learning "normal" until the machine has actually run —
    // vibration while off/idle isn't representative of its usual operating
    // range. Locks in after CALIBRATION_WINDOW_MS of cumulative running
    // time if it keeps running that long, or as soon as it goes back to
    // idle (see setState) if that happens sooner — whichever comes first.
    if (state !== "on") return;

    calibrationSamples.push(rms);

    const liveOnDurationMs = onDurationMs + (now - lastTransitionAt);
    if (liveOnDurationMs >= CALIBRATION_WINDOW_MS) {
      baselineMaxRms = computeBaselineFromSamples();
    }
    return;
  }

  const wasAtOrBelow = previousRms === null || previousRms <= baselineMaxRms;
  const isAboveNow = rms > baselineMaxRms;
  previousRms = rms;

  if (wasAtOrBelow && isAboveNow) {
    const lastCrossing = crossingTimestamps[crossingTimestamps.length - 1];
    if (lastCrossing === undefined || now - lastCrossing >= MIN_CROSSING_GAP_MS) {
      crossingTimestamps.push(now);
    }
  }

  const windowStart = now - CROSSING_WINDOW_MS;
  while (crossingTimestamps.length && crossingTimestamps[0] < windowStart) {
    crossingTimestamps.shift();
  }

  const isAnomalous = crossingTimestamps.length >= MIN_CROSSINGS_TO_ALERT;
  if (isAnomalous === alertActive) return;

  alertActive = isAnomalous;
  if (isAnomalous) lastAlertAt = now;
  emit({
    type: "alert",
    data: {
      active: alertActive,
      rms,
      baselineMaxRms,
      crossingCount: crossingTimestamps.length,
      timestamp: now,
    },
  });
};

const handleTelemetryMessage = (raw: string) => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return;
  }

  if (typeof parsed !== "object" || parsed === null) return;
  const { rms, mag, state: telemetryState } = parsed as Record<string, unknown>;
  if (typeof rms !== "number") return;

  const now = Date.now();
  const point: TelemetryPoint = {
    rms,
    mag: typeof mag === "number" ? mag : 0,
    timestamp: now,
  };

  telemetry.push(point);
  if (telemetry.length > MAX_TELEMETRY_POINTS) telemetry.shift();

  if (typeof telemetryState === "string") {
    const parsedState = parseState(telemetryState);
    if (parsedState) setState(parsedState);
  }

  checkForAnomaly(rms, now);

  emit({ type: "telemetry", data: point });
};

export const initAdxl345Mqtt = () => {
  const client = getMqttClient();

  client.on("connect", () => {
    client.subscribe([STATE_TOPIC, TELEMETRY_TOPIC], (err) => {
      if (err) {
        console.error(`[adxl345] failed to subscribe`, err);
        return;
      }
      console.log(`[adxl345] subscribed to ${STATE_TOPIC}, ${TELEMETRY_TOPIC}`);
    });
  });

  client.on("message", (topic, payload) => {
    if (topic === STATE_TOPIC) {
      handleStateMessage(payload.toString());
    } else if (topic === TELEMETRY_TOPIC) {
      handleTelemetryMessage(payload.toString());
    }
  });
};

export const adxl345Service = {
  getSnapshot: (): Adxl345Snapshot => ({
    state,
    stateUpdatedAt,
    onDurationMs,
    offDurationMs,
    telemetry: [...telemetry],
    baselineMaxRms,
    alertActive,
    lastAlertAt,
  }),

  subscribe: (listener: (event: Adxl345Event) => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};
