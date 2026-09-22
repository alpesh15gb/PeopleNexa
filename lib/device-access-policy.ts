export type DeviceAccessMode = "all" | "restricted";

export function deviceAccessPayload(
  mode: DeviceAccessMode,
  selectedDeviceIds: string[],
  activeDeviceIds: string[],
) {
  if (mode === "restricted" && selectedDeviceIds.length === 0) {
    throw new Error("Select at least one active device for restricted access.");
  }

  return {
    mode,
    // Send the concrete active scope even though the API derives all-device access
    // from mode, so every client request is an unambiguous policy decision.
    deviceIds: mode === "all" ? activeDeviceIds : selectedDeviceIds,
  };
}
