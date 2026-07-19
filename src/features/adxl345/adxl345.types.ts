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
  baselineMaxRms: number | null;
  alertActive: boolean;
  lastAlertAt: number | null;
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
  | { type: "telemetry"; data: TelemetryPoint }
  | {
      type: "alert";
      data: {
        active: boolean;
        rms: number;
        baselineMaxRms: number;
        crossingCount: number;
        timestamp: number;
      };
    };
