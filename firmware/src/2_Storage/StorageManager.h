#ifndef STORAGE_MANAGER_H
#define STORAGE_MANAGER_H

#include <Arduino.h>
#include <EEPROM.h>
#include "0_Base/Globals.h"==================== EEPROM 地址布局 ====================
// RA4M1 Data Flash 8KB，通过 EEPROM 库访问
#define EEPROM_WIFI_SSID_ADDR   0x00   // 32 bytes
#define EEPROM_WIFI_PASS_ADDR   0x20   // 64 bytes (offset 32)
#define EEPROM_WIFI_VALID_ADDR 0x60   // 1 byte (offset 96)
#define EEPROM_WIFI_MAGIC       0xA5   // 有效标记

#define EEPROM_CALIB_ADDR       0x70   // 校准数据 (offset 112, 32 bytes)
#define EEPROM_PROFILE_ADDR     0x90   // 个人信息 (offset 144, 36 bytes)
#define EEPROM_MAGIC_ADDR       0xB4   // 校准数据有效标记 (offset 180)
#define EEPROM_MAGIC            0xAA   // 有效标记值

// ==================== 公共类型定义 ====================

typedef struct {
    float relax_rms_mv;
    float active_rms_mv;
    uint32_t calib_timestamp_sec;
    uint16_t calib_timestamp_ms;
    float relax_mdf_hz;
    float active_mdf_hz;
    float end_mdf_hz;
} PersonalCalibData_t;

typedef struct {
    char name[32];
    uint8_t age;
    uint8_t gender;      // 1:男, 2:女
    uint8_t handedness;   // 1:左手腕, 2:右手腕
} UserProfileData_t;

// ==================== C++ StorageManager 类 ====================
class StorageManager {
public:
    // 初始化 EEPROM
    int Init();

    // 校准数据（EEPROM）
    bool GetPersonalCalib(PersonalCalibData_t* data);
    bool UpdatePersonalCalib(const PersonalCalibData_t* data);

    // 个人信息（EEPROM）
    bool GetUserProfile(UserProfileData_t* profile);
    bool SetUserProfile(const UserProfileData_t* profile);

    // WiFi 凭据（EEPROM）
    bool LoadWifiCredentials(WifiCredentials_t* outCreds);
    bool SaveWifiCredentials(const WifiCredentials_t* creds);

    // tick() — 云方案无需操作，保留空函数供兼容
    void tick();
};

#endif // STORAGE_MANAGER_H
