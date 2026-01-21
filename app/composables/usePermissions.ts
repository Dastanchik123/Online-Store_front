export const usePermissions = () => {
  const api = useApi();
  const myPermissions = useState<string[]>("my_permissions", () => []);

  const fetchMyPermissions = async () => {
    try {
      myPermissions.value = (await api.apiFetch("/my-permissions")) as string[];
    } catch (e) {
      console.error(e);
    }
  };

  const hasPermission = (permission: string) => {
    return myPermissions.value.includes(permission);
  };

  const getPermissionsByRole = async (role: string) => {
    return await api.apiFetch(`/permissions/role/${role}`);
  };

  const updateRolePermissions = async (role: string, permissions: string[]) => {
    return await api.apiFetch(`/permissions/role/${role}`, {
      method: "POST",
      body: { permissions },
    });
  };

  return {
    myPermissions,
    fetchMyPermissions,
    hasPermission,
    getPermissionsByRole,
    updateRolePermissions,
  };
};
