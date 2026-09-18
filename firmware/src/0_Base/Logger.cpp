// ============================================================
// 文件名: Logger.cpp
// 模块: 0_Base 基础模块
// 职责: 轻量级日志系统 — 自实现 snprintf + 串口输出
//       避免引入标准库 sprintf（体积约 8KB → 仅 ~1KB）
// 关键函数:
//   - _format_to_buf(): 极简格式化引擎，支持 %d %u %x %X %s %c %f
//   - _log_impl():       LOG 宏底层实现，静态 256B 缓冲防栈溢出
// ============================================================
#include "Logger.h"
#include <stdarg.h>
#include <string.h>
#include <math.h>

// ===== 极简版 snprintf — 将 va_list 按 fmt 格式化到 buf =====
// 支持 %d %u %x %X %s %c %f 及宽度/精度/零填充，避免引入标准库浮点格式化导致固件体积膨胀
static int _format_to_buf(char* buf, int bufsize, const char* fmt, va_list args) {
    int oi = 0;
    const char* p = fmt;

    #define PUTC(c) do { if (oi < bufsize - 1) buf[oi++] = (c); } while(0)
    #define PUTS(s) do { const char* _q = (s); while (*_q) PUTC(*_q++); } while(0)

    while (*p && oi < bufsize - 1) {
        if (*p != '%') { PUTC(*p++); continue; }
        p++; // 跳过 '%'

        if (*p == '%') { PUTC('%'); p++; continue; }
        if (*p == '\0') break;

        // 跳过标志位
        while (*p == '-' || *p == '+' || *p == '0' || *p == ' ' || *p == '#') p++;

        // 宽度
        int width = 0;
        while (*p >= '0' && *p <= '9') { width = width * 10 + (*p - '0'); p++; }

        // 精度
        int prec = -1;
        if (*p == '.') {
            p++;
            prec = 0;
            while (*p >= '0' && *p <= '9') { prec = prec * 10 + (*p - '0'); p++; }
        }

        // 长度修饰符
        int isLong = 0;
        if (*p == 'l') { isLong = 1; p++; }

        switch (*p) {
            case 'd': case 'i': {
                long v = isLong ? va_arg(args, long) : (long)va_arg(args, int);
                char tb[16]; ltoa(v, tb, 10); PUTS(tb);
                break;
            }
            case 'u': {
                unsigned long v = isLong ? va_arg(args, unsigned long)
                                         : (unsigned long)va_arg(args, unsigned int);
                char tb[16]; ultoa(v, tb, 10); PUTS(tb);
                // %0Xd zero-padding (width parsed, use it)
                int ulen = strlen(tb);
                if (width > ulen) {
                    int upad = width - ulen;
                    memmove(buf + oi - ulen + upad, buf + oi - ulen, ulen);
                    for (int j = 0; j < upad; j++) buf[oi - ulen + j] = '0';
                    oi += upad;  // advance oi to include padded zeros
                }
                break;
            }
            case 'x': case 'X': {
                unsigned long v = isLong ? va_arg(args, unsigned long)
                                         : (unsigned long)va_arg(args, unsigned int);
                char tb[16]; ultoa(v, tb, 16); PUTS(tb);
                // %0Xd zero-padding
                int xlen = strlen(tb);
                if (width > xlen) {
                    int xpad = width - xlen;
                    memmove(buf + oi - xlen + xpad, buf + oi - xlen, xlen);
                    for (int j = 0; j < xpad; j++) buf[oi - xlen + j] = '0';
                    oi += xpad;  // advance oi to include padded zeros
                }
                break;
            }
            case 's': {
                const char* s = va_arg(args, const char*);
                if (s) PUTS(s);
                break;
            }
            case 'c': {
                int c = va_arg(args, int);
                PUTC((char)c);
                break;
            }
            case 'f': case 'F': {
                double v = va_arg(args, double);
                char fb[24];
                int fw = width;  // 0=no padding (was 7 default, caused extra spaces)
                int fp = (prec >= 0) ? prec : 2;
                dtostrf(v, fw, fp, fb);
                PUTS(fb);
                break;
            }
            default:
                PUTC('?');
                break;
        }
        if (*p) p++; // 跳过格式符本身
    }

    buf[oi] = '\0';
    #undef PUTC
    #undef PUTS
    return oi;
}

// 静态全局缓冲，避免深层调用链栈溢出
static char g_logBuf[256];

// ===== 底层日志实现 — 格式化并通过 SERIAL_COMM 输出 =====
// LOG 宏的实际落地函数；使用静态全局缓冲（256B）避免深层调用链栈溢出
// 参数: fmt 为 printf 风格格式串，... 为可变参数
void _log_impl(const char* fmt, ...) {
    va_list args;
    va_start(args, fmt);
    _format_to_buf(g_logBuf, sizeof(g_logBuf), fmt, args);
    va_end(args);
    SERIAL_COMM.print(g_logBuf);
    SERIAL_COMM.flush();
}
