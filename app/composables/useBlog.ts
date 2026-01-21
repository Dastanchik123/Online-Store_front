export const useBlog = () => {
  const api = useApi();

  const getPosts = async (params = {}) => {
    return await api.apiFetch("/blog", { query: params });
  };

  const getPost = async (slug: string) => {
    return await api.apiFetch(`/blog/${slug}`);
  };

  const getAdminPost = async (id: number | string) => {
    return await api.apiFetch(`/blog-admin/${id}`);
  };

  const createPost = async (formData: FormData) => {
    return await api.apiFetch("/blog-admin", {
      method: "POST",
      body: formData,
    });
  };

  const updatePost = async (id: number, formData: FormData) => {
    if (!formData.has("_method")) formData.append("_method", "PUT");
    return await api.apiFetch(`/blog-admin/${id}`, {
      method: "POST",
      body: formData,
    });
  };

  const deletePost = async (id: number) => {
    return await api.apiFetch(`/blog-admin/${id}`, {
      method: "DELETE",
    });
  };

  return {
    getPosts,
    getPost,
    getAdminPost,
    createPost,
    updatePost,
    deletePost,
  };
};
