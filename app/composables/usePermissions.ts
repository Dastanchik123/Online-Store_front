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

  const getRoles = async () => {
    return await api.apiFetch("/roles");
  };

  const createRole = async (name: string, label: string) => {
    return await api.apiFetch("/roles", {
      method: "POST",
      body: { name, label },
    });
  };

  const deleteRole = async (roleId: number) => {
    return await api.apiFetch(`/roles/${roleId}`, {
      method: "DELETE",
    });
  };

  return {
    myPermissions,
    fetchMyPermissions,
    hasPermission,
    getPermissionsByRole,
    updateRolePermissions,
    getRoles,
    createRole,
    deleteRole,
  };
};
