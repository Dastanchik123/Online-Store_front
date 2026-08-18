export const useSelfServiceDevices = () => {
  const api = useApi();

  const getDevices = async () => {
    return await api.apiFetch("/self-service-devices");
  };

  const createDevice = async (data: { terminal_id: string; label?: string }) => {
    return await api.apiFetch("/self-service-devices", {
      method: "POST",
      body: data,
    });
  };

  const issuePairingCode = async (deviceId: number) => {
    return await api.apiFetch(`/self-service-devices/${deviceId}/pairing-code`, {
      method: "POST",
    });
  };

  const revokeDevice = async (deviceId: number) => {
    return await api.apiFetch(`/self-service-devices/${deviceId}/revoke`, {
      method: "POST",
    });
  };

  return {
    getDevices,
    createDevice,
    issuePairingCode,
    revokeDevice,
  };
};
