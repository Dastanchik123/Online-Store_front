const DEVICE_TYPE_KEY = "pos_device_type";

const deviceType = ref<"desktop" | "monoblock">("desktop");

if (typeof window !== "undefined") {
  const saved = localStorage.getItem(DEVICE_TYPE_KEY);
  if (saved === "monoblock" || saved === "desktop") {
    deviceType.value = saved;
  }
}

export const useDeviceMode = () => {
  const setDeviceType = (value: "desktop" | "monoblock") => {
    deviceType.value = value;
    if (typeof window !== "undefined") {
      localStorage.setItem(DEVICE_TYPE_KEY, value);
    }
  };

  return { deviceType, setDeviceType };
};
