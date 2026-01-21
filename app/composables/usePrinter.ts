
import { KEYUTIL, KJUR, stob64, hextorstr } from "jsrsasign";

declare const qz: any;

const isConnected = ref(false);
const printers = ref<string[]>([]);
const activePrinter = ref("");


if (typeof window !== "undefined") {
  activePrinter.value = localStorage.getItem("selected_printer") || "";
}


const privateKey = `-----BEGIN PRIVATE KEY-----
MIIEvAIBADANBgkqhkiG9w0BAQEFAASCBKYwggSiAgEAAoIBAQDgzSC5PFbex8Kh
KGJb8Yz5ouSQRyVZyeWzs+0BsWtuPAvxdBYrB24uTr+MpGzw3b6Jp3Cmr/d5J6ll
KJFaDN8CZfanFzSi8pOyLHE7P41ALgAKjLNug7hBwfvvRjHRPXAvpbVT/x5iYOGc
OFO9J+LmTFA/2ldCeo0GGz1ChXYYc1BpZW23Y8OGsWgKVTSWrjyB4FQL0PVLFLjn
G1cZTpS3QE5AQnBDrunQuycD7nW4IPlNxgu6ehNfwZ2VLpa9fU8Q7QmSD2myiAtF
9ZcycKIh5qzSG3jHKq+OiHTFh/uYxm8mtEK67tbIhtJbB++3ra2iK9Eo3Acrq+KX
mYWTwln3AgMBAAECggEAGTk6/j3Ue3vLjVykKK/iQxJxdfTdroT2ZqL+KW34YW6Q
Yn/Fiv9y7/Q7DvNWG/KtkfF9NN7StD/shGK4aHPARBsfwWDbsZrpUpkk/WJknXpr
28Ms0O4rqwkylQb5yQINR/NedLXP+XboaahyUOucTH3slTWRC+8HStOcnI2wEg8M
dH6Uk06n/Il5ytrBv6f4x9rpzZheo1ggXOVBo7ieDbm/137PZUOF0vb7rIbjyYoO
9GjbGYd7uhEqxHjSytfjLF+PyWnEKmME2VqZh6g+Bi6hBZPrAQ8RwjyGODHIS6MY
2cRllLOrzHvykwLDbPSrW9rqp8F7P7BFz0juziahQQKBgQDy2ABHD8Adr7WQ8RBp
KgzEmvfPd16R+Rz8EaBwM615OULQnI9s9mg+OjfBKsY5egYObBuG+ZTf908RBvkU
IFz04SiPptTyOOUH3EGvKIRhn+QnRswE9WeCyYCYkQwdJ3Fo9aR6xR/ZArRg0HjL
cS7AkeGE90MaY/7RwYDJoentNwKBgQDs+uVQXXqOzdRDbSZYxQOgdy96ujaa9j4j
80aytmnZWiyS0JpryqRMN5nzutCrNm8mDEROZX1uQhqvlx46cJx6jc69mM5Q91vY
vHS08PPD7k8Rsg9J3r7G/+PmRp8eJ2jiuLh97Riw7yv2ynKCitTDyqLzEMfwsMkX
MBAzpcNZQQKBgD2KP4fClgzv2jNA48fCwDmSi/onZe/YEWBPlzjX3744pJX5Ft+m
EgSy/C4XiORH6AD/pHowBWo8Ye0Ot1BCY0wrQvwkaxJ3GJNFXd/lhKa4vji12D3p
crHSHqSLHWbF+BeBKI10Jv33kX53ViU4KYDjdyMbBgZKEOlXACwYvA9BAoGADvlH
dg2CCfXtfJkv/BnuwbvmLx4HB0GZ6ZGcnPwzsf0lpd0ydK8oNHyq6KCcQMU+vqu1
wTJee5IHt6KX0V9+M6w0LPyzxJ/smMRHp4s2C+JJ8rdKigNeEJronotF0JTy5qh/
V82casmiAIUIOUFmcjyikTM1Pvscqa9qxqipsEECgYBEqsxKKYoGzLJnxKsOxv+z
xDfObLiicP2Pf48a/8J07MRBFYKp8j55TMj+SSA5ROS/Z8NCCwoa5VoCnrMDvRka
sd5ug4NKrAiBMrdpoJIe38y5IUUktF+FK+cCzZ2GVwAFP+vgaZCLiZ7YZVdVKruv
RGRagCN5TlGPHiM0PeJYnw==
-----END PRIVATE KEY-----`;

export const usePrinter = () => {
  const uiStore = useUiStore();

  const initQZ = async () => {
    if (typeof qz === "undefined") return;

    
    qz.security.setCertificatePromise((resolve: any) => {
      resolve(`-----BEGIN CERTIFICATE-----
MIID5zCCAs+gAwIBAgIUWjY6h/u4WjKDr/fF6q6S59w/5jUwDQYJKoZIhvcNAQEL
BQAwgYExCzAJBgNVBAYTAlVTAC4xLDIqBgNVBAoMI1FaIEluZHVzdHJpZXMsIExM
QyAoY29tbXVuaXR5IHN1cHBvcnQpMRMwEQYDVQQDDApxei5pbyBkZW1vMRgwFgYJ
KoZIhvcNABkCCA5sb2NhbGhvc3QxGDAWBgkqhkiG9w0BCQIMCWxvY2FsaG9zdDAe
Fw0yNjAxMTIyMTI2MDZaFw0yNjAyMTIyMTI2MDZaMIGBMQswCQYDVQQGEwJVUzAu
MSwyKgYDQQQKDCNRWiBJbmR1c3RyaWVzLCBMTEMgKGNvbW11bml0eSBzdXBwb3J0
KTETMBEGA1UEAwwKcXouaW8gZGVtbzEYMBYGCSqGSIb3DQEJAgwObG9jYWxob3N0
MRgwFgYJKoZIhvcNABkCDAlsb2NhbGhvc3QwggEiMA0GCSqGSIb3DQEBAQUAA4IB
DwAwggEKAoIBAQDgzSC5PFbex8KhKGJb8Yz5ouSQRyVZyeWzs+0BsWtuPAvxdBYr
B24uTr+MpGzw3b6Jp3Cmr/d5J6llKJFaDN8CZfanFzSi8pOyLHE7P41ALgAKjLNu
g7hBwfvvRjHRPXAvpbVT/x5iYOGcOFO9J+LmTFA/2ldCeo0GGz1ChXYYc1BpZW23
Y8OGsWgKVTSWrjyB4FQL0PVLFLjnG1cZTpS3QE5AQnBDrunQuycD7nW4IPlNxgu6
ehNfwZ2VLpa9fU8Q7QmSD2myiAtF9ZcycKIh5qzSG3jHKq+OiHTFh/uYxm8mtEK67
tbIhtJbB++3ra2iK9Eo3Acrq+KXmYWTwln3AgMBAAGjRDBCMAkGA1UdEwQCMAAw
CwYDVR0PBAQDAgeAMB0GA1UdDgQWBBQyH29/rU2X4F8Vb9dF1aW+2U+WqTAPBgNV
HREBAf8EBTAHgAAwDQYJKoZIhvcNAQELBQADggEBAE4W0xVb9G0pQ4i5V177j5mB
89eD0xW93aH7Y8Q4/cQ5x3005Q1J3LwN/y8a4T4LwA/1D6R+j4W/8x9z9Z6y4o4k
c8H005v7v7u4tJ5n8w9y2x2q2z5l0p9j5k4x4d4c8v6u6w5x5y5t7z8v9x9n0o1r
2s3t4u5v6w6x7y8z9A0b1c2d3e4f5g6h7i8j9k0l0m0n0o1p2q3r4s5t6u7v8w9x
+z0r1t2u3v4w5x6y7z809B1c2d3e4f5g6h7i8j9k0l0m0n0o1p2q3r4s5t6u7v8w
9x+z0r1t2u3v4w5x6y7z809B1c2d3e4f5g6h7i8j9k0l0m0n0o2r3s4t6u7v8w9x
+J0r1t2u3v4w5x6y7z809B1c2d3e4f5g6h7i8j9k0l0m0n0o1p2q3r4s5t6u7v8w
9x+z0r1t2u3v4w5x6y7z809B1c2d3e4f5g6h7i8j9k0l0m0n0o1p2q3r4s5t6u7v
8w9x+z0r1t2u3v4w5x6y7z809B1c2d3e4f5g6h7i8j9k0l0m0n0o1p2q3r4s5t6u
7v8w9x+z0r1t2u3v4w5x6y7z809B1c2d3e4f5g6h7i8j9k0l0m0n0o1p2q3r4s5t
6u7v8w9x+z0r1t2u3v4w5x6y7z809B1c2d3e4f5g6h7i8j9k0l0m0n0o1p2q3r4s
5t6u7v8w9x+z0r1t2u3v4w5x6y7z809B1c2d3e4f5g6h7i8=\n-----END CERTIFICATE-----`);
    });

    qz.security.setSignaturePromise((toSign: string) => {
      return function (resolve: any, reject: any) {
        try {
          var pk = KEYUTIL.getKey(privateKey);
          var sig = new KJUR.crypto.Signature({ alg: "SHA1withRSA" });
          sig.init(pk);
          sig.updateString(toSign);
          var hex = sig.sign();
          resolve(stob64(hextorstr(hex)));
        } catch (e: any) {
          console.error(e);
          reject(e);
        }
      };
    });

    if (qz.websocket.isActive()) {
      isConnected.value = true;
      await fetchPrinters();
      return;
    }

    try {
      await qz.websocket.connect();
      isConnected.value = true;
      console.log("QZ Tray Connected");
      await fetchPrinters();
    } catch (e: any) {
      
      if (e.message && e.message.includes("Open")) {
        isConnected.value = true;
        return;
      }
      console.error("QZ Connection Error:", e);
      isConnected.value = false;
    }
  };

  const fetchPrinters = async () => {
    if (!isConnected.value) return;
    try {
      const list = await qz.printers.find();
      printers.value = list;
    } catch (e) {
      console.error("Failed to fetch printers:", e);
    }
  };

  const setPrinter = (name: string) => {
    activePrinter.value = name;
    localStorage.setItem("selected_printer", name);
  };

  const printReceipt = async (
    orderId: string | number,
    type: "thermal" | "full" = "thermal"
  ) => {
    if (!isConnected.value) {
      await initQZ();
    }

    if (!activePrinter.value) {
      uiStore.addToast("Принтер не выбран в настройках кассы", "warning");
      return;
    }

    try {
      const { getAuthToken, baseURL } = useApi();
      const token = getAuthToken();

      uiStore.addToast("Получение данных чека...", "info");

      const endpoint =
        type === "thermal"
          ? `/reports/order/${orderId}/thermal/html`
          : `/reports/order/${orderId}/html`;

      const url = `${baseURL}${endpoint}`;

      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error(
          `Не удалось загрузить данные (Статус: ${response.status})`
        );
      }

      const htmlContent = await response.text();

      if (!htmlContent || htmlContent.length < 100) {
        throw new Error("Файл документа пустой или не загружен");
      }

      uiStore.addToast("Отправка на принтер...", "info");

      const config = qz.configs.create(activePrinter.value);
      const printData = [
        {
          type: "html",
          format: "plain",
          data: htmlContent,
        },
      ];

      await qz.print(config, printData);
      uiStore.addToast("Чек успешно напечатан", "success");
    } catch (e: any) {
      console.error("Printing failed:", e);
      uiStore.addToast("Ошибка печати: " + (e.message || e), "error");
    }
  };

  const testPrint = async () => {
    if (!isConnected.value) {
      await initQZ();
    }

    if (!activePrinter.value) {
      uiStore.addToast("Сначала выберите принтер в настройках", "warning");
      return;
    }

    try {
      const config = qz.configs.create(activePrinter.value);
      
      const printData = [
        {
          type: "html",
          format: "plain",
          data: `
            <div style="font-family: sans-serif; padding: 20px; border: 2px solid black; text-align: center;">
              <h2 style="margin: 0;">ТЕСТ ПЕЧАТИ</h2>
              <p>Магазин: ${window.location.hostname}</p>
              <p>Принтер: ${activePrinter.value}</p>
              <hr>
              <p>Если вы видите этот текст, значит система настроена верно!</p>
              <p style="font-size: 12px; color: gray;">Дата: ${new Date().toLocaleString()}</p>
            </div>
          `,
        },
      ];

      await qz.print(config, printData);
      uiStore.addToast("Тестовая страница отправлена", "success");
    } catch (e: any) {
      uiStore.addToast("Тест не прошел: " + e, "error");
    }
  };

  return {
    isConnected,
    printers,
    activePrinter,
    initQZ,
    fetchPrinters,
    setPrinter,
    printReceipt,
    testPrint,
  };
};
