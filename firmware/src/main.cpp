// 文件: main.cpp — Cloud Version V3.0
// 描述: sEMG 肌电疲劳监测设备 V3.0 (微信云开发 + BLE 简化配网)
// V3.0 变更:
//   - 移除 main 中的 BLE 状态机 (CWAIT/CCONN/CDONE) 和 WiFi 重连计数器
//   - 配网逻辑完全封装在 BleConfigServer + NetManager 中
//   - NetManager 自动重连 + 5 分钟断连超时回调配网模式
//   - BleConfigServer 通过 deviceId 特征暴露固件真实 ID
// ============================================================

#include <Arduino.h>
#include <FspTimer.h>
#include <EEPROM.h>

// 基础驱动
#include "0_Base/Board.h"
#include "0_Base/Logger.h"
#include "0_Base/Globals.h"

// 业务与网络模块
#include "0_Base/SystemStateMachine.h"
#include "1_Signal/SignalProcessor.h"
#include "2_Storage/StorageManager.h"
#include "3_Network/BleConfigServer.h"
#include "3_Network/NetManager.h"

// 调度层
#include "4_AppController/AppController.h"

// ============================================================
// 全局实例
// ============================================================
SignalProcessor gSignal;
StateManager gState;
StorageManager gStorage;
BleConfigServer gBleConfig;
NetManager gNetManager;
AppController gAppController(
    &gState,
    &gSignal,
    &gStorage,
    &gNetManager
);

// 硬件定时器
FspTimer adc_timer;
volatile bool g_adcTimerFlag = false;
volatile uint32_t g_adcCallbackCount = 0;

// ============================================================
// [V3.0] 回调: 云端下发 reset_wifi 命令 → BLE 配网重置
// ============================================================
static void _onCloudResetWifi() {
    LOG("[MAIN] Cloud reset_wifi callback\n");
    gBleConfig.resetNetwork();
}

// [V3.0] 回调: WiFi 断连 > 5 分钟 → 进入 BLE 配网模式
static void _onWifiLostTimeout() {
    LOG("[MAIN] WiFi lost > 5min, entering provisioning mode\n");
    gBleConfig.resetNetwork();
    // resetNetwork() 内部已清除凭证 + 断开WiFi + 重启广播
}

// [V3.0] 校准命令回调
static void _onCloudRecordRelax() {
    LOG("[MAIN] Cloud record_relax command\n");
    gAppController.handleRecordRelax();
}

static void _onCloudRecordActive() {
    LOG("[MAIN] Cloud record_active command\n");
    gAppController.handleRecordActive();
}

static void _onCloudSaveCalib() {
    LOG("[MAIN] Cloud save_calib command\n");
    gAppController.handleSaveCalib();
}

// [V3.0] WiFi 凭证配网处理 — 非阻塞状态机
static bool     _besConnecting = false;
static uint32_t _besConnectStart = 0;

static void _handleBleCredentials() {
    // --- 状态: 消费 BLE 凭证 → 启动 WiFi 连接 ---
    if (!_besConnecting && gBleConfig.hasNewCredentials()) {
        WifiCredentials_t creds = gBleConfig.consumeCredentials();
        if (!creds.isValid) return;

        LOG("[MAIN] WiFi credentials from BLE: %s\n", creds.ssid);

        // 存入 EEPROM
        EEPROM.put(0,  creds.ssid);
        EEPROM.put(64, creds.pass);

        // 连接 WiFi
        WiFi.disconnect();
        delay(100);
        WiFi.begin(creds.ssid, creds.pass);

        // 通知小程序 "正在连接"
        gBleConfig.notifyProvisionResult("CONNECTING");
        _besConnecting = true;
        _besConnectStart = millis();
        LOG("[MAIN] Connecting WiFi: %s...\n", creds.ssid);
        return;
    }

    // --- 状态: 等待 WiFi 连接 ---
    if (!_besConnecting) return;

    if (WiFi.status() == WL_CONNECTED) {
        // 连接成功
        LOG("[MAIN] WiFi connected! IP: %s, SSID: %s\n",
            WiFi.localIP().toString().c_str(), WiFi.SSID());
        // 注: UNO R4 WiFi 库不支持 setAutoReconnect(), 由 NetManager 内部管理重连

        // 通知小程序 "OK" + IP 信息
        char result[64];
        snprintf(result, sizeof(result), "{\"result\":\"OK\",\"ip\":\"%s\"}",
                 WiFi.localIP().toString().c_str());
        gBleConfig.notifyProvisionResult(result);

        // 延迟 500ms 等小程序收到通知后断开 BLE
        delay(500);
        gBleConfig.stopProvisioning();
        _besConnecting = false;
        LOG("[MAIN] BLE provisioning complete, BLE stopped\n");

        // 立即上报状态到云端
        gNetManager.reportStatus();
        return;
    }

    // 超时 (30s)
    if (millis() - _besConnectStart > 30000) {
        LOG("[MAIN] WiFi connect TIMEOUT\n");
        gBleConfig.notifyProvisionResult("{\"result\":\"FAIL\"}");
        _besConnecting = false;
        gBleConfig.startProvisioning();
    }
}

// ============================================================
// 定时器中断 (1kHz ADC)
// ============================================================
void timer_callback(timer_callback_args_t __attribute((unused)) *args) {
    g_adcTimerFlag = true;
    g_adcCallbackCount++;
}

// ============================================================
// setup()
// ============================================================
void setup() {
    delay(3000);
    SERIAL_COMM.begin(115200);
    while (!SERIAL_COMM && millis() < 3000);

    LOG("\n\n========== sEMG V3.0 CLOUD BOOT ==========\n");

    pinMode(PIN_LED_BUILTIN, OUTPUT);
    digitalWrite(PIN_LED_BUILTIN, LOW);

    // 1. 信号处理器
    analogReadResolution(14);
    gSignal.init();

    // 2. EEPROM 初始化
    EEPROM.begin();
    gStorage.Init();

    // 3. BLE 初始化（但不立即广播，等 WiFi 初始化后再决定）
    gBleConfig.init();

    // 4. 网络初始化（WiFi 已配置则连接，否则后续进入配网模式）
    bool netOk = gNetManager.initBlocking(45000);  // [V3.1] 45s timeout for cold boot

    // [V3.0] 设置 deviceId 到 BLE（配网时小程序读取）
    gBleConfig.setDeviceId(gNetManager.getDeviceId());

    // [V3.0] 注册回调
    gNetManager.onResetWifi(_onCloudResetWifi);
    gNetManager.onWifiLostTimeout(_onWifiLostTimeout);
    gNetManager.onRecordRelax(_onCloudRecordRelax);
    gNetManager.onRecordActive(_onCloudRecordActive);
    gNetManager.onSaveCalib(_onCloudSaveCalib);

    if (netOk) {
        // WiFi 从 EEPROM/硬编码连接成功 → 关闭 BLE，正常运行
        LOG("[MAIN] WiFi connected from EEPROM: %s\n", WiFi.SSID());
        gBleConfig.stopProvisioning();
    } else {
        // WiFi 未配置或连接失败 → 进入 BLE 配网模式
        LOG("[MAIN] No WiFi config, entering BLE provisioning...\n");
        gBleConfig.startProvisioning();
    }

    // 5. 1kHz ADC 定时器
    uint8_t timer_type = 0;
    int8_t timer_channel = FspTimer::get_available_timer(timer_type);
    if (timer_channel < 0) {
        timer_channel = FspTimer::get_available_timer(timer_type, true);
    }
    LOG("[MAIN] Timer type=%d, channel=%d\n", timer_type, timer_channel);

    bool begin_ok = adc_timer.begin(
        TIMER_MODE_PERIODIC, timer_type, (uint8_t)timer_channel,
        1000.0f, 0.0f, timer_callback
    );
    if (!begin_ok) {
        LOG("[MAIN] ERROR: Timer begin failed!\n");
    } else {
        LOG("[MAIN] Timer begin OK\n");
        bool irq_ok = adc_timer.setup_overflow_irq(12, nullptr);
        if (!irq_ok) {
            LOG("[MAIN] ERROR: Timer overflow IRQ setup failed!\n");
        } else {
            LOG("[MAIN] Timer IRQ setup OK\n");
            bool open_ok = adc_timer.open();
            if (!open_ok) {
                LOG("[MAIN] ERROR: Timer open failed!\n");
            } else {
                bool start_ok = adc_timer.start();
                if (start_ok) {
                    LOG("[MAIN] Timer start OK - 1kHz sampling\n");
                } else {
                    LOG("[MAIN] ERROR: Timer start failed!\n");
                }
            }
        }
    }

    // 6. 状态机 + 调度器
    gState.init();
    gAppController.init();

    delay(500);
    LOG("[MAIN] V3.0 Cloud init complete, Device: %s\n", gNetManager.getDeviceId());
}

// ============================================================
// loop()
// ============================================================
void loop() {
    // 1. 高频采样 (1kHz)
    if (g_adcTimerFlag) {
        g_adcTimerFlag = false;
        int raw = FAST_ADC_READ(PIN_EMG_ADC);
        gSignal.isrPushSample(raw);
        gSignal.updateSampleRateStats();
    }

    // 2. 10Hz 主调度节拍
    static uint32_t lastTick = 0;
    if (millis() - lastTick < LOOP_INTERVAL_MS) {
        return;
    }
    lastTick = millis();

    // 3. [V3.0] BLE 配网维护（一行搞定）
    gBleConfig.tick();

    // 3.1 [V3.0] 消费 BLE 凭证 → 连接 WiFi
    _handleBleCredentials();

    // 4. 网络维护 + 数据上传
    gNetManager.tick();

    // 5. 业务调度
    gAppController.tick();

    // 6. 心跳日志 (10s)
    static uint32_t _hbTimer = 0;
    static uint32_t _hbCount = 0;
    if (millis() - _hbTimer > 10000) {
        _hbTimer = millis();
        _hbCount++;
        LOG("[HB] #%lu alive, ADC_cb=%lu, WiFi=%d, prov=%d, buf=%u\n",
            (unsigned long)_hbCount,
            (unsigned long)g_adcCallbackCount,
            (int)WiFi.status(),
            (int)gBleConfig.isProvisioning(),
            gSignal.getBufferAvailable());
    }
}
