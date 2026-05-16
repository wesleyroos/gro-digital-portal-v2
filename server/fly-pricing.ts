const VM_RATES_PER_HOUR: Record<string, number> = {
  "shared-cpu-1x":        0.0028,
  "shared-cpu-2x":        0.0056,
  "shared-cpu-4x":        0.0112,
  "shared-cpu-8x":        0.0224,
  "performance-1x":       0.0148,
  "performance-2x":       0.0296,
  "performance-4x":       0.0592,
  "performance-8x":       0.1184,
  "performance-16x":      0.2368,
  "a100-40gb":            2.50,
  "a100-80gb":            3.50,
  "l40s":                 1.50,
};

const VOLUME_RATE_PER_GB_MONTH = 0.15;

function hoursElapsedThisMonth(now: Date): number {
  const start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
  return (now.getTime() - start.getTime()) / 3_600_000;
}

function daysInMonth(now: Date): number {
  return new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
}

export type MtdEstimate = {
  vmCents: number;
  volumeCents: number;
  totalCents: number;
  isEstimate: true;
};

export type FlyMachineState = {
  state: string;
  size?: string;
  image_ref?: { registry?: string };
  config?: { guest?: { cpus?: number; memory_mb?: number; cpu_kind?: string } };
  created_at?: string;
};

export type FlyVolume = {
  size_gb?: number;
  attached_machine_id?: string | null;
};

function resolveVmSize(machine: FlyMachineState): string {
  const guest = machine.config?.guest;
  if (!guest) return "shared-cpu-1x";
  const kind = guest.cpu_kind ?? "shared";
  const cpus = guest.cpus ?? 1;
  const prefix = kind === "performance" ? "performance" : "shared-cpu";
  return `${prefix}-${cpus}x`;
}

export function estimateMachineMtdCost(machine: FlyMachineState, now: Date): MtdEstimate {
  const isRunning = machine.state === "started";
  if (!isRunning) return { vmCents: 0, volumeCents: 0, totalCents: 0, isEstimate: true };

  const size = resolveVmSize(machine);
  const ratePerHour = VM_RATES_PER_HOUR[size] ?? VM_RATES_PER_HOUR["shared-cpu-1x"];
  const hours = hoursElapsedThisMonth(now);
  const vmCents = Math.round(ratePerHour * hours * 100);

  return { vmCents, volumeCents: 0, totalCents: vmCents, isEstimate: true };
}

export function estimateVolumeMtdCost(volume: FlyVolume, now: Date): number {
  const gb = volume.size_gb ?? 0;
  const elapsed = hoursElapsedThisMonth(now) / 24;
  const total = daysInMonth(now);
  const fraction = elapsed / total;
  return Math.round(gb * VOLUME_RATE_PER_GB_MONTH * fraction * 100);
}

export function sumEstimates(
  machines: FlyMachineState[],
  volumes: FlyVolume[],
  now: Date,
): MtdEstimate {
  let vmCents = 0;
  let volumeCents = 0;
  for (const m of machines) {
    vmCents += estimateMachineMtdCost(m, now).vmCents;
  }
  for (const v of volumes) {
    volumeCents += estimateVolumeMtdCost(v, now);
  }
  return { vmCents, volumeCents, totalCents: vmCents + volumeCents, isEstimate: true };
}
