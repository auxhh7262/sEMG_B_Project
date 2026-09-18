// ============================================================
// 文件名: StorageManager.h
// 模块:   存储管理
// 职责:   EEPROM 持久化接口——WiFi 凭证、用户个人校准数据、个人信息的读写与清除，基于 RA4M1 Data Flash 8KB 地址布局
// 关键类/函数:
//   - PersonalCalibData_t: 个人校准数据结构体（relax/active RMS、MDF、endMDF、时间戳）
//   - UserProfileData_t: 用户个人信息结构体（姓名、年龄、性别、利手）
//   - StorageManager: EEPROM 管理类
//     - Init(): 初始化 EEPROM 库
//     - LoadWifiCredentials() / SaveWifiCredentials(): WiFi 凭证读写
//     - GetPersonalCalib() / UpdatePersonalCalib() / ClearPersonalCalib(): 校准数据 CRUD
//     - GetUserProfile() / SetUserProfile(): 个人信息读写
// ============================================================
#ifndef STORAGE_MANAGER_H
#define STORAGE_MANAGER_H

#include <Arduino.h>
#include <EEPROM.h>
#include "0_Base/Globals.h"
// ==================== EEPROM 地址布局 ====================
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
    bool ClearPersonalCalib();   // 彻底清除：数据区清零 + 清有效标记，开机判定为无校准

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
