import { getMqttClient } from "@/shared/services/mqtt.service";
import type { Adxl345Event, Adxl345Snapshot, MachineState, TelemetryPoint } from "./adxl345.types";

const STATE_TOPIC = "adxl345/state";
const TELEMETRY_TOPIC = "adxl345/telemetry";
const MAX_TELEMETRY_POINTS = 200;

let state: MachineState | null = null;
let stateUpdatedAt: number | null = null;
const telemetry: TelemetryPoint[] = [];

const listeners = new Set<(event: Adxl345Event) => void>();

const emit = (event: Adxl345Event) => {
  listeners.forEach((listener) => listener(event));
};

const setState = (next: MachineState) => {
  state = next;
  stateUpdatedAt = Date.now();
  emit({ type: "state", data: { state, stateUpdatedAt } });
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
  const { rms, mag, state: telemetryState } = parsed as Record<string, unknown>;
  if (typeof rms !== "number") return;

  const point: TelemetryPoint = {
    rms,
    mag: typeof mag === "number" ? mag : 0,
    timestamp: Date.now(),
  };

  telemetry.push(point);
  if (telemetry.length > MAX_TELEMETRY_POINTS) telemetry.shift();

  if (typeof telemetryState === "string") {
    const parsedState = parseState(telemetryState);
    if (parsedState) setState(parsedState);
  }

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
    telemetry: [...telemetry],
  }),

  subscribe: (listener: (event: Adxl345Event) => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};
