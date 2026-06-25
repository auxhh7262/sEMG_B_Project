#ifndef BOARD_H
#define BOARD_H
#include <Arduino.h>

// =============== 输入引脚 ===============
#define PIN_EMG_ADC A0 // sEMG 传感器模拟输入


// =============== 板载指示灯 ===============
#define PIN_LED_BUILTIN LED_BUILTIN

// =============== 串口定义 ===============
#define SERIAL_COMM Serial  // USB 调试串口
#define SERIAL_ESP32 Serial1 // 与 ESP32 通信的硬件 UART
#define ESP_BAUDRATE 115200

// =============== ADC 参数（RA4M1 14-bit） ===============
#define ADC_REF_MV 5000.0f   // 默认使用板载 5V 参考电压
#define ADC_MAX_VALUE 16383  // 2^14 - 1

// =============== 校准流程参数 ===============
#define CALIB_RELAX_SEC 10    // 放松采集时长（秒）
#define CALIB_ACTIVE_SEC 15     // 最大收缩采集时长（秒）
#define LOOP_INTERVAL_MS 100 // 主循环时序：10Hz

// 针对 Uno R4 WiFi 高频采样死锁的硬件级修复宏 (14-bit 管道清空版)
#define FAST_ADC_READ(pin) (analogRead(pin), analogRead(pin))

#endif // BOARD_H
