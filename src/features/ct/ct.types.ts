export type MachineState = "on" | "off";

export type CtTelemetryPoint = {
  current: number;
  timestamp: number;
};

export type CtSnapshot = {
  state: MachineState | null;
  stateUpdatedAt: number | null;
  onDurationMs: number;
  offDurationMs: number;
  telemetry: CtTelemetryPoint[];
  peakCurrent: number | null;
  avgCurrent: number | null;
};

export type CtEvent =
  | {
      type: "state";
      data: {
        state: MachineState;
        stateUpdatedAt: number;
        onDurationMs: number;
        offDurationMs: number;
      };
    }
  | { type: "telemetry"; data: CtTelemetryPoint }
  | { type: "stats"; data: { peakCurrent: number; avgCurrent: number | null } };
