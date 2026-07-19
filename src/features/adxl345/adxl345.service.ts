import { getMqttClient } from "@/shared/services/mqtt.service";
import type { Adxl345Event, Adxl345Snapshot, MachineState, TelemetryPoint } from "./adxl345.types";

const STATE_TOPIC = "adxl345/state";
const TELEMETRY_TOPIC = "adxl345/telemetry";
const MAX_TELEMETRY_POINTS = 200;

// How much cumulative running time to watch before locking in a baseline
// vibration threshold, and how far above that baseline counts as abnormal.
const CALIBRATION_WINDOW_MS = 20_000;
const ALERT_MARGIN_MULTIPLIER = 1.5;
const MIN_BASELINE_MAX_RMS = 0.05;

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

let calibrationMaxRms = 0;
let baselineMaxRms: number | null = null;
let alertActive = false;
let lastAlertAt: number | null = null;
let previousRms: number | null = null;
const crossingTimestamps: number[] = [];

const listeners = new Set<(event: Adxl345Event) => void>();

const emit = (event: Adxl345Event) => {
  listeners.forEach((listener) => listener(event));
};

const setState = (next: MachineState) => {
  if (state === next) return;

  const now = Date.now();
  if (state === "on") onDurationMs += now - lastTransitionAt;
  else if (state === "off") offDurationMs += now - lastTransitionAt;
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
    // range. Gate on cumulative running time so an interrupted first run
    // (machine toggled off mid-calibration) still finishes calibrating
    // correctly once it's running again, rather than resetting.
    if (state !== "on") return;

    calibrationMaxRms = Math.max(calibrationMaxRms, rms);

    const liveOnDurationMs = onDurationMs + (now - lastTransitionAt);
    if (liveOnDurationMs >= CALIBRATION_WINDOW_MS) {
      baselineMaxRms = Math.max(calibrationMaxRms * ALERT_MARGIN_MULTIPLIER, MIN_BASELINE_MAX_RMS);
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
