import Echo from "laravel-echo";
import Pusher from "pusher-js";

export default defineNuxtPlugin(() => {
  const config = useRuntimeConfig();

  (window as any).Pusher = Pusher;

  const backendBase = (config.public.apiBase as string).replace(/\/api\/?$/, "");

  // Electron: передаём ws-конфиг в main-процесс при каждом запуске,
  // чтобы realtime работал и у давно залогиненных касс (не только после логина)
  if ((window as any).electronAPI?.saveWsConfig) {
    (window as any).electronAPI
      .saveWsConfig({
        wsHost: config.public.wsHost,
        wsPort: config.public.wsPort,
        wsKey: config.public.wsKey,
        wsTLS: !!config.public.wsTLS,
        apiBase: resolveApiBase(config.public.apiBase as string),
      })
      .catch(console.error);
  }

  const useTLS = !!config.public.wsTLS;

  const echo = new Echo({
    broadcaster: "pusher",
    key: config.public.wsKey,
    cluster: "mt1",
    wsHost: config.public.wsHost,
    wsPort: config.public.wsPort,
    wssPort: config.public.wsPort,
    forceTLS: useTLS,
    disableStats: true,
    enabledTransports: useTLS ? ["ws", "wss"] : ["ws"],
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
