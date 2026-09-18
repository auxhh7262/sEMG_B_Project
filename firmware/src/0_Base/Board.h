// ============================================================
// 文件名: Board.h
// 模块:   基础驱动/硬件板卡
// 职责:   板卡级引脚分配、ADC 硬件常量、校准流程时序参数以及 UNO R4 WiFi ADC 死锁修复宏
// 关键类/函数:
//   - PIN_EMG_ADC / PIN_RGB_RGB_G / PIN_RGB_B: 硬件引脚定义
//   - ADC_REF_MV / ADC_MAX_VALUE: RA4M1 14-bit ADC 参数（5V 参考）
//   - CALIB_RELAX_SEC / CALIB_ACTIVE_SEC / LOOP_INTERVAL_MS: 校准与主循环时序
//   - FAST_ADC_READ(pin): 针对 Uno R4 WiFi 高频采样死锁的硬件级修复宏
// ============================================================
#ifndef BOARD_H
#define BOARD_H
#include <Arduino.h>

// =============== 输入引脚 ===============
#define PIN_EMG_ADC A0 // sEMG 传感器模拟输入


// =============== 板载指示灯 ===============
#define PIN_LED_BUILTIN LED_BUILTIN

// =============== RGB LED 引脚 ===============
#define PIN_RGB_R 2   // 红色通道
#define PIN_RGB_G 3   // 绿色通道
#define PIN_RGB_B 4   // 蓝色通道

// =============== 串口定义 ===============
#define SERIAL_COMM Serial  // USB 调试串口
#define SERIAL_ESP32 Serial1 // 对接 UNO R4 WiFi 板载 ESP32-S3-MINI-1-N8 的硬件 UART
#define ESP_BAUDRATE 115200

// =============== ADC 参数（RA4M1 14-bit） ===============
// UNO R4 WiFi 是 5V 板：RA4M1 与 GPIO 均运行在 5V，DEFAULT 模拟参考 = 5V。
// （Arduino 规则：5V 板 DEFAULT=5V，3.3V 板 DEFAULT=3.3V；R4 WiFi 属前者。）
// 传感器输出量程 0~3.0V（以 1.5V 为基准），< 5V 不会削顶。
#define ADC_REF_MV 5000.0f   // UNO R4 WiFi DEFAULT 参考 = 5V
#define ADC_MAX_VALUE 16383  // 2^14 - 1

// =============== 校准流程参数 ===============
#define CALIB_RELAX_SEC 10    // 放松采集时长（秒）
#define CALIB_ACTIVE_SEC 15     // 最大收缩采集时长（秒）
#define LOOP_INTERVAL_MS 100 // 主循环时序：10Hz

// 针对 Uno R4 WiFi 高频采样死锁的硬件级修复宏 (14-bit 管道清空版)
#define FAST_ADC_READ(pin) (analogRead(pin), analogRead(pin))

#endif // BOARD_H
