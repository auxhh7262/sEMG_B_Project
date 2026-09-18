// ============================================================
// 文件名: Logger.h
// 模块:   基础驱动/日志
// 职责:   统一日志输出接口，通过 LOG 宏分发到 UART 或 WiFi UDP，支持分级过滤
// 关键类/函数:
//   - _log_impl(fmt, ...): 底层实现（在 Logger.cpp），负责格式化与实际输出
//   - LOG(fmt, ...): 对外统一日志宏，编译期可按 DEBUG 级别裁剪
// ============================================================
#ifndef LOGGER_H
#define LOGGER_H

#include <Arduino.h>
#include "Board.h"

// 声明：实现在 Logger.cpp
void _log_impl(const char* fmt, ...);

// 统一日志宏
#define LOG(fmt, ...) _log_impl(fmt, ##__VA_ARGS__)

#endif // LOGGER_H
