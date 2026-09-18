// ============================================================
// 文件名: Globals.h
// 模块:   基础驱动/全局变量与枚举
// 职责:   定义系统错误码、设备状态机枚举、网络模式、云端指令、WiFi 凭证结构体及致命错误全局变量的 extern 声明
// 关键类/函数:
//   - SystemError_t: 校准流程错误码枚举（力度不足、信号干扰、等待超时、肢体乱动、佩戴松动）
//   - SystemState_t: 系统主状态枚举（ST_BOOT / ST_RUNNING / ST_ERROR）
//   - NetMode_t: 网络工作模式枚举（空闲/BLE配网/WiFi连接中/WiFi在线）
//   - AppCommand_t: 小程序/云端下行指令枚举
//   - WifiCredentials_t: WiFi SSID + 密码 + 有效性标志
//   - g_systemFatalError: 全局致命错误状态变量（volatile，跨中断上下文安全）
// ============================================================
#ifndef GLOBALS_H
#define GLOBALS_H

#include <Arduino.h>
#include "Config.h"

// 1. 错误码枚举 (映射协议字典 err_calib_failed 的 msg)
typedef enum {
    ERROR_NONE = 0,
    ERROR_CALIB_INVALID,  // 力度不足
    ERROR_SIGNAL_NOISE,   // 信号干扰
    ERROR_ARM_TIMEOUT,    // 等待超时
    ERROR_BODY_MOVE,      // 肢体乱动
    ERROR_CALIB_DRIFT     // 佩戴松动
} SystemError_t;

// 2. 系统状态枚举 (M3 阶段简化版状态机，为后续完整 SOP 预留扩展)
typedef enum {
    ST_BOOT = 0,
    ST_RUNNING,
    ST_ERROR
} SystemState_t;

// ==========================================
// 网络与云端扩展定义
// ==========================================

// 4. 网络工作模式枚举
typedef enum {
    NET_MODE_IDLE = 0,
    NET_MODE_BLE_CONFIG,    // 蓝牙等待配网中
    NET_MODE_WIFI_CONNECTING,// 正在连接路由器
    NET_MODE_WIFI_ONLINE    // WiFi已连接，业务在线
} NetMode_t;

// 5. 小程序/云端下行 统一指令枚举
typedef enum {
    CMD_NONE = 0,
    CMD_STOP,
    CMD_GET_STATUS,
    CMD_START_STREAM
} AppCommand_t;

// 6. WiFi 凭证结构体
typedef struct {
    char ssid[32];
    char pass[64];
    bool isValid;
} WifiCredentials_t;

// 7. 特征值长度宏 (给 BLE 用)
#define BLE_WIFI_CHAR_MAX_LEN 128

// 8. 【关键防御】全局致命错误状态变量
extern volatile SystemError_t g_systemFatalError;
#endif // GLOBALS_H