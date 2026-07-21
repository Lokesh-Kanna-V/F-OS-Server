import { getMqttClient } from "@/shared/services/mqtt.service";
import type { CtEvent, CtSnapshot, CtTelemetryPoint, MachineState } from "./ct.types";

const STATE_TOPIC = "ct/status";
const TELEMETRY_TOPIC = "ct/telemetry";
const MAX_TELEMETRY_POINTS = 200;

let state: MachineState | null = null;
let stateUpdatedAt: number | null = null;
let lastTransitionAt = Date.now();
let onDurationMs = 0;
let offDurationMs = 0;
const telemetry: CtTelemetryPoint[] = [];

let peakCurrent: number | null = null;
// Averaged only over samples taken while current was actually being drawn,
// so idle/off-state near-zero noise doesn't pull the average down.
let sumCurrentOn = 0;
let sampleCountOn = 0;

const listeners = new Set<(event: CtEvent) => void>();

const emit = (event: CtEvent) => {
  listeners.forEach((listener) => listener(event));
};

const setState = (next: MachineState) => {
  if (state === next) return;

  const now = Date.now();
  if (state === "on") {
    onDurationMs += now - lastTransitionAt;
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

const handleTelemetryMessage = (raw: string) => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return;
  }

  if (typeof parsed !== "object" || parsed === null) return;
  const { current, state: telemetryState } = parsed as Record<string, unknown>;
  if (typeof current !== "number") return;

  const now = Date.now();
  const point: CtTelemetryPoint = { current, timestamp: now };

  telemetry.push(point);
  if (telemetry.length > MAX_TELEMETRY_POINTS) telemetry.shift();

  if (typeof telemetryState === "string") {
    const parsedState = parseState(telemetryState);
    if (parsedState) setState(parsedState);
  }

  peakCurrent = peakCurrent === null ? current : Math.max(peakCurrent, current);
  if (state === "on") {
    sumCurrentOn += current;
    sampleCountOn += 1;
  }

  emit({ type: "telemetry", data: point });
  emit({
    type: "stats",
    data: { peakCurrent, avgCurrent: sampleCountOn > 0 ? sumCurrentOn / sampleCountOn : null },
  });
};

export const initCtMqtt = () => {
  const client = getMqttClient();

  client.on("connect", () => {
    client.subscribe([STATE_TOPIC, TELEMETRY_TOPIC], (err) => {
      if (err) {
        console.error(`[ct] failed to subscribe`, err);
        return;
      }
      console.log(`[ct] subscribed to ${STATE_TOPIC}, ${TELEMETRY_TOPIC}`);
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

export const ctService = {
  getSnapshot: (): CtSnapshot => ({
    state,
    stateUpdatedAt,
    onDurationMs,
    offDurationMs,
    telemetry: [...telemetry],
    peakCurrent,
    avgCurrent: sampleCountOn > 0 ? sumCurrentOn / sampleCountOn : null,
  }),

  subscribe: (listener: (event: CtEvent) => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};
