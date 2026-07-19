export type MachineState = "on" | "off";

export type TelemetryPoint = {
  rms: number;
  mag: number;
  timestamp: number;
};

export type Adxl345Snapshot = {
  state: MachineState | null;
  stateUpdatedAt: number | null;
  onDurationMs: number;
  offDurationMs: number;
  telemetry: TelemetryPoint[];
};

export type Adxl345Event =
  | {
      type: "state";
      data: {
        state: MachineState;
        stateUpdatedAt: number;
        onDurationMs: number;
        offDurationMs: number;
      };
    }
  | { type: "telemetry"; data: TelemetryPoint };
