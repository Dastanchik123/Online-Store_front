import { useApi } from "./useApi";

// Тяжёлые PDF-отчёты (весь каталог, все долги) генерируются в очереди на
// бэке (App\Jobs\GenerateReportExport) — здесь просто ждём готовности вместо
// того, чтобы держать открытый HTTP-запрос на время рендера dompdf.
export const useReportExport = () => {
  const api = useApi();

  const POLL_INTERVAL_MS = 1500;
  const MAX_ATTEMPTS = 80; // ~2 минуты

  const runExport = async (
    type: "products_pdf" | "debts_pdf",
    params: Record<string, any>,
    fileName: string,
  ) => {
    const created = await api.apiFetch("/reports/exports", {
      method: "POST",
      body: { type, params },
    });

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const status = await api.apiFetch(`/reports/exports/${created.id}`);

      if (status.status === "done") {
        await api.downloadFile(
          `/reports/exports/${created.id}/download`,
          fileName,
        );
        return;
      }
      if (status.status === "failed") {
        throw new Error(status.error || "Не удалось сформировать отчёт");
      }

      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    }

    throw new Error("Формирование отчёта заняло слишком много времени");
  };

  return { runExport };
};
