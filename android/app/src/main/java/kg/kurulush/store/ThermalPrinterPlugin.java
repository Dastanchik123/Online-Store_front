package kg.kurulush.store;

import android.Manifest;
import android.app.PendingIntent;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothSocket;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.hardware.usb.UsbConstants;
import android.hardware.usb.UsbDevice;
import android.hardware.usb.UsbDeviceConnection;
import android.hardware.usb.UsbEndpoint;
import android.hardware.usb.UsbInterface;
import android.hardware.usb.UsbManager;
import android.os.Build;
import android.util.Base64;
import androidx.core.app.ActivityCompat;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.PermissionState;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.util.Arrays;
import java.util.UUID;

/**
 * Печать чеков/этикеток на чековые термопринтеры (58/80мм) напрямую из
 * WebView, минуя системный диалог печати — принтеры такого класса обычно
 * не имеют Android print service. Поддерживает два транспорта: классический
 * Bluetooth SPP (принтер должен быть заранее сопряжён в настройках Android) и
 * USB Host (bulk-транспорт, printer class интерфейс).
 *
 * Печатаемый контент приходит уже растеризованным в PNG с JS-стороны
 * (html2canvas) — так сохраняется реальная вёрстка чека/этикетки
 * (штрихкоды, шрифты) без необходимости переписывать её в ESC/POS текстовые
 * команды.
 */
@CapacitorPlugin(
    name = "ThermalPrinter",
    permissions = { @Permission(strings = { Manifest.permission.BLUETOOTH_CONNECT }, alias = "bluetooth") }
)
public class ThermalPrinterPlugin extends Plugin {

    private static final UUID SPP_UUID = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB");
    private static final String ACTION_USB_PERMISSION = "kg.kurulush.store.USB_PRINTER_PERMISSION";

    private BluetoothSocket btSocket;
    private OutputStream btOutput;

    private UsbDeviceConnection usbConnection;
    private UsbInterface usbInterface;
    private UsbEndpoint usbEndpointOut;

    private String connectedType; // "bluetooth" | "usb"
    private String connectedName;

    private PluginCall pendingUsbCall;
    private UsbDevice pendingUsbDevice;
    private BroadcastReceiver usbPermissionReceiver;

    @Override
    public void load() {
        usbPermissionReceiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context context, Intent intent) {
                if (!ACTION_USB_PERMISSION.equals(intent.getAction())) return;
                synchronized (this) {
                    UsbDevice device = intent.getParcelableExtra(UsbManager.EXTRA_DEVICE);
                    boolean granted = intent.getBooleanExtra(UsbManager.EXTRA_PERMISSION_GRANTED, false);
                    PluginCall call = pendingUsbCall;
                    pendingUsbCall = null;
                    pendingUsbDevice = null;
                    if (call == null) return;
                    if (granted && device != null) {
                        doUsbConnect(device, call);
                    } else {
                        call.reject("USB: пользователь не разрешил доступ к устройству");
                    }
                }
            }
        };
        IntentFilter filter = new IntentFilter(ACTION_USB_PERMISSION);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            getContext().registerReceiver(usbPermissionReceiver, filter, Context.RECEIVER_NOT_EXPORTED);
        } else {
            getContext().registerReceiver(usbPermissionReceiver, filter);
        }
    }

    @Override
    protected void handleOnDestroy() {
        super.handleOnDestroy();
        try {
            getContext().unregisterReceiver(usbPermissionReceiver);
        } catch (Exception ignored) {}
        disconnectInternal();
    }

    @PluginMethod
    public void listDevices(PluginCall call) {
        JSObject result = new JSObject();
        result.put("bluetooth", listBondedBluetoothDevices());
        result.put("usb", listUsbDevices());
        call.resolve(result);
    }

    private JSArray listBondedBluetoothDevices() {
        JSArray array = new JSArray();
        BluetoothAdapter adapter = BluetoothAdapter.getDefaultAdapter();
        if (adapter == null || !hasBluetoothConnectPermission()) return array;
        try {
            for (BluetoothDevice device : adapter.getBondedDevices()) {
                JSObject item = new JSObject();
                item.put("name", device.getName() != null ? device.getName() : device.getAddress());
                item.put("address", device.getAddress());
                array.put(item);
            }
        } catch (SecurityException ignored) {}
        return array;
    }

    private JSArray listUsbDevices() {
        JSArray array = new JSArray();
        UsbManager usbManager = (UsbManager) getContext().getSystemService(Context.USB_SERVICE);
        if (usbManager == null) return array;
        for (UsbDevice device : usbManager.getDeviceList().values()) {
            JSObject item = new JSObject();
            String name = device.getProductName();
            item.put("name", name != null && !name.isEmpty() ? name : ("USB " + device.getDeviceName()));
            item.put("deviceId", device.getDeviceId());
            item.put("vendorId", device.getVendorId());
            item.put("productId", device.getProductId());
            item.put("isPrinterClass", hasPrinterInterface(device));
            array.put(item);
        }
        return array;
    }

    private boolean hasPrinterInterface(UsbDevice device) {
        for (int i = 0; i < device.getInterfaceCount(); i++) {
            if (device.getInterface(i).getInterfaceClass() == UsbConstants.USB_CLASS_PRINTER) return true;
        }
        return false;
    }

    private boolean hasBluetoothConnectPermission() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return true;
        return ActivityCompat.checkSelfPermission(getContext(), Manifest.permission.BLUETOOTH_CONNECT)
            == PackageManager.PERMISSION_GRANTED;
    }

    @PluginMethod
    public void requestBluetoothPermission(PluginCall call) {
        if (hasBluetoothConnectPermission()) {
            JSObject ret = new JSObject();
            ret.put("granted", true);
            call.resolve(ret);
            return;
        }
        requestPermissionForAlias("bluetooth", call, "bluetoothPermsCallback");
    }

    @PermissionCallback
    private void bluetoothPermsCallback(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("granted", getPermissionState("bluetooth") == PermissionState.GRANTED);
        call.resolve(ret);
    }

    @PluginMethod
    public void connect(PluginCall call) {
        String type = call.getString("type", "");
        if ("bluetooth".equals(type)) {
            connectBluetooth(call);
        } else if ("usb".equals(type)) {
            connectUsb(call);
        } else {
            call.reject("Неизвестный тип подключения: " + type);
        }
    }

    private void connectBluetooth(PluginCall call) {
        String address = call.getString("address");
        if (address == null || address.isEmpty()) {
            call.reject("Не передан адрес Bluetooth-устройства");
            return;
        }
        if (!hasBluetoothConnectPermission()) {
            call.reject("Нет разрешения BLUETOOTH_CONNECT");
            return;
        }
        BluetoothAdapter adapter = BluetoothAdapter.getDefaultAdapter();
        if (adapter == null) {
            call.reject("Bluetooth недоступен на устройстве");
            return;
        }
        new Thread(() -> {
            try {
                BluetoothDevice device = adapter.getRemoteDevice(address);
                BluetoothSocket socket = device.createRfcommSocketToServiceRecord(SPP_UUID);
                try {
                    adapter.cancelDiscovery();
                } catch (SecurityException ignored) {}
                socket.connect();

                disconnectInternal();
                btSocket = socket;
                btOutput = socket.getOutputStream();
                connectedType = "bluetooth";
                connectedName = device.getName() != null ? device.getName() : address;

                JSObject ret = new JSObject();
                ret.put("connected", true);
                ret.put("name", connectedName);
                call.resolve(ret);
            } catch (SecurityException e) {
                call.reject("Нет разрешения на Bluetooth-соединение: " + e.getMessage());
            } catch (Exception e) {
                call.reject("Не удалось подключиться по Bluetooth: " + e.getMessage());
            }
        }).start();
    }

    private void connectUsb(PluginCall call) {
        int deviceId = call.getInt("deviceId", -1);
        UsbManager usbManager = (UsbManager) getContext().getSystemService(Context.USB_SERVICE);
        if (usbManager == null) {
            call.reject("USB Host недоступен на устройстве");
            return;
        }
        UsbDevice target = null;
        for (UsbDevice d : usbManager.getDeviceList().values()) {
            if (d.getDeviceId() == deviceId) {
                target = d;
                break;
            }
        }
        if (target == null) {
            call.reject("USB-устройство не найдено (переподключите принтер и обновите список)");
            return;
        }

        if (!usbManager.hasPermission(target)) {
            pendingUsbCall = call;
            pendingUsbDevice = target;
            int flags = Build.VERSION.SDK_INT >= Build.VERSION_CODES.S ? PendingIntent.FLAG_MUTABLE : 0;
            PendingIntent pi = PendingIntent.getBroadcast(getContext(), 0, new Intent(ACTION_USB_PERMISSION), flags);
            usbManager.requestPermission(target, pi);
            return;
        }
        doUsbConnect(target, call);
    }

    private void doUsbConnect(UsbDevice device, PluginCall call) {
        UsbManager usbManager = (UsbManager) getContext().getSystemService(Context.USB_SERVICE);
        UsbInterface targetInterface = null;
        UsbEndpoint targetEndpoint = null;

        for (int i = 0; i < device.getInterfaceCount(); i++) {
            UsbInterface iface = device.getInterface(i);
            for (int e = 0; e < iface.getEndpointCount(); e++) {
                UsbEndpoint endpoint = iface.getEndpoint(e);
                if (endpoint.getType() == UsbConstants.USB_ENDPOINT_XFER_BULK && endpoint.getDirection() == UsbConstants.USB_DIR_OUT) {
                    targetInterface = iface;
                    targetEndpoint = endpoint;
                    if (iface.getInterfaceClass() == UsbConstants.USB_CLASS_PRINTER) break;
                }
            }
            if (targetInterface != null && targetInterface.getInterfaceClass() == UsbConstants.USB_CLASS_PRINTER) break;
        }

        if (targetInterface == null || targetEndpoint == null) {
            call.reject("У USB-устройства не найден bulk OUT endpoint для печати");
            return;
        }

        UsbDeviceConnection connection = usbManager.openDevice(device);
        if (connection == null || !connection.claimInterface(targetInterface, true)) {
            call.reject("Не удалось открыть USB-соединение с принтером");
            return;
        }

        disconnectInternal();
        usbConnection = connection;
        usbInterface = targetInterface;
        usbEndpointOut = targetEndpoint;
        connectedType = "usb";
        connectedName = device.getProductName() != null ? device.getProductName() : device.getDeviceName();

        JSObject ret = new JSObject();
        ret.put("connected", true);
        ret.put("name", connectedName);
        call.resolve(ret);
    }

    @PluginMethod
    public void disconnect(PluginCall call) {
        disconnectInternal();
        call.resolve();
    }

    @PluginMethod
    public void getStatus(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("connected", connectedType != null);
        ret.put("type", connectedType);
        ret.put("name", connectedName);
        call.resolve(ret);
    }

    @PluginMethod
    public void printImage(PluginCall call) {
        String base64 = call.getString("base64");
        if (base64 == null || base64.isEmpty()) {
            call.reject("Не передано изображение (base64)");
            return;
        }
        if (connectedType == null) {
            call.reject("Принтер не подключён");
            return;
        }
        new Thread(() -> {
            try {
                byte[] imageBytes = Base64.decode(base64, Base64.DEFAULT);
                Bitmap bitmap = BitmapFactory.decodeByteArray(imageBytes, 0, imageBytes.length);
                if (bitmap == null) throw new IOException("Не удалось декодировать изображение");
                writeBytes(rasterizeToEscPos(bitmap));
                call.resolve();
            } catch (Exception e) {
                call.reject("Ошибка печати: " + e.getMessage());
            }
        }).start();
    }

    @PluginMethod
    public void printText(PluginCall call) {
        if (connectedType == null) {
            call.reject("Принтер не подключён");
            return;
        }
        String text = call.getString("text", "");
        new Thread(() -> {
            try {
                ByteArrayOutputStream out = new ByteArrayOutputStream();
                out.write(new byte[] { 0x1B, 0x40 }); // ESC @ — инициализация
                out.write(text.getBytes("UTF-8"));
                out.write(new byte[] { 0x0A, 0x0A, 0x0A, 0x0A });
                writeBytes(out.toByteArray());
                call.resolve();
            } catch (Exception e) {
                call.reject("Ошибка печати: " + e.getMessage());
            }
        }).start();
    }

    private void writeBytes(byte[] data) throws IOException {
        if ("bluetooth".equals(connectedType)) {
            if (btOutput == null) throw new IOException("Bluetooth-соединение потеряно");
            btOutput.write(data);
            btOutput.flush();
        } else if ("usb".equals(connectedType)) {
            if (usbConnection == null || usbEndpointOut == null) throw new IOException("USB-соединение потеряно");
            int chunkSize = 4096;
            int offset = 0;
            while (offset < data.length) {
                int len = Math.min(chunkSize, data.length - offset);
                byte[] chunk = Arrays.copyOfRange(data, offset, offset + len);
                int res = usbConnection.bulkTransfer(usbEndpointOut, chunk, chunk.length, 5000);
                if (res < 0) throw new IOException("Сбой USB-передачи данных");
                offset += len;
            }
        } else {
            throw new IOException("Принтер не подключён");
        }
    }

    /** Конвертирует Bitmap в монохромную ESC/POS растровую команду (GS v 0). */
    private byte[] rasterizeToEscPos(Bitmap bitmap) throws IOException {
        int width = bitmap.getWidth();
        int height = bitmap.getHeight();
        int widthBytes = (width + 7) / 8;

        ByteArrayOutputStream out = new ByteArrayOutputStream();
        out.write(new byte[] { 0x1B, 0x40 }); // ESC @ — инициализация
        out.write(new byte[] { 0x1D, 0x76, 0x30, 0x00 }); // GS v 0 m — normal raster
        out.write(widthBytes & 0xFF);
        out.write((widthBytes >> 8) & 0xFF);
        out.write(height & 0xFF);
        out.write((height >> 8) & 0xFF);

        int[] pixels = new int[width * height];
        bitmap.getPixels(pixels, 0, width, 0, 0, width, height);
        byte[] rowBytes = new byte[widthBytes];
        for (int y = 0; y < height; y++) {
            Arrays.fill(rowBytes, (byte) 0);
            for (int x = 0; x < width; x++) {
                int pixel = pixels[y * width + x];
                int alpha = (pixel >> 24) & 0xFF;
                int r = (pixel >> 16) & 0xFF;
                int g = (pixel >> 8) & 0xFF;
                int b = pixel & 0xFF;
                int gray = (r + g + b) / 3;
                boolean black = alpha > 32 && gray < 160;
                if (black) {
                    rowBytes[x / 8] |= (byte) (0x80 >> (x % 8));
                }
            }
            out.write(rowBytes, 0, widthBytes);
        }
        out.write(new byte[] { 0x0A, 0x0A, 0x0A, 0x0A }); // прогон бумаги под отрез
        return out.toByteArray();
    }

    private void disconnectInternal() {
        try {
            if (btOutput != null) btOutput.close();
        } catch (Exception ignored) {}
        try {
            if (btSocket != null) btSocket.close();
        } catch (Exception ignored) {}
        btOutput = null;
        btSocket = null;

        try {
            if (usbInterface != null && usbConnection != null) usbConnection.releaseInterface(usbInterface);
        } catch (Exception ignored) {}
        try {
            if (usbConnection != null) usbConnection.close();
        } catch (Exception ignored) {}
        usbConnection = null;
        usbInterface = null;
        usbEndpointOut = null;

        connectedType = null;
        connectedName = null;
    }
}
