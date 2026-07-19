export type MachineState = "on" | "off";

export type TelemetryPoint = {
  rms: number;
  mag: number;
  timestamp: number;
};

export type Adxl345Snapshot = {
  state: MachineState | null;
  stateUpdatedAt: number | null;
  telemetry: TelemetryPoint[];
};

export type Adxl345Event =
  | { type: "state"; data: { state: MachineState; stateUpdatedAt: number } }
  | { type: "telemetry"; data: TelemetryPoint };
