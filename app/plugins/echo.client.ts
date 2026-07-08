import Echo from "laravel-echo";
import Pusher from "pusher-js";

export default defineNuxtPlugin(() => {
  const config = useRuntimeConfig();

  (window as any).Pusher = Pusher;

  const backendBase = (config.public.apiBase as string).replace(/\/api\/?$/, "");

  const echo = new Echo({
    broadcaster: "pusher",
    key: config.public.wsKey,
    cluster: "mt1",
    wsHost: config.public.wsHost,
    wsPort: config.public.wsPort,
    forceTLS: false,
    disableStats: true,
    enabledTransports: ["ws"],
    authorizer: (channel: any) => {
      return {
        authorize: (socketId: string, callback: (error: boolean, data: any) => void) => {
          const token = localStorage.getItem("auth_token");
          $fetch(`${backendBase}/broadcasting/auth`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
              Accept: "application/json",
            },
            body: { socket_id: socketId, channel_name: channel.name },
          })
            .then((response: any) => callback(false, response))
            .catch((error: any) => callback(true, error));
        },
      };
    },
  });

  return {
    provide: { echo },
  };
});
