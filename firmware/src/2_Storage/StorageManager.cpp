#include "StorageManager.h"
#include "0_Base/Logger.h"
#include <EEPROM.h>
#include <string.h>

// ==================== 常量 ====================
static const uint8_t CALIB_MAGIC   = 0xAA;
static const uint8_t PROFILE_MAGIC = 0xBB;

// ==================== 私有辅助 ====================
static uint16_t _calcCRC16(const uint8_t* data, uint32_t length, uint16_t init);

// ==================== CRC16-ModBus ====================
static uint16_t _calcCRC16(const uint8_t* data, uint32_t length, uint16_t init) {
    uint16_t crc = init;
    for (uint32_t i = 0; i < length; i++) {
        crc ^= data[i];
        for (uint8_t j = 0; j < 8; j++) {
            if (crc & 1) crc = (crc >> 1) ^ 0xA001;
            else        crc >>= 1;
        }
    }
    return crc;
}

// ==================== StorageManager 类实现 ====================

int StorageManager::Init() {
    LOG("[STORAGE] Init: EEPROM ready (8KB Data Flash)\n");
    LOG("[STORAGE] Manager Initialized. Calib valid: %s\n",
         EEPROM.read(EEPROM_MAGIC_ADDR) == CALIB_MAGIC ? "YES" : "NO");
    return 0;
}

// ==================== 校准数据（EEPROM） ====================

bool StorageManager::GetPersonalCalib(PersonalCalibData_t* data) {
    if (!data) return false;
    if (EEPROM.read(EEPROM_MAGIC_ADDR) != CALIB_MAGIC) return false;

    EEPROM.get(EEPROM_CALIB_ADDR, *data);

    // 验证数值合理性
    if (isnan(data->relax_rms_mv) || isnan(data->active_rms_mv) ||
        isnan(data->relax_mdf_hz) || isnan(data->active_mdf_hz)) {
        LOG("[STORAGE] GetPersonalCalib: NaN detected, invalid\n");
        return false;
    }
    return true;
}

bool StorageManager::UpdatePersonalCalib(const PersonalCalibData_t* data) {
    if (!data) return false;

    // NaN 防御
    if (isnan(data->relax_rms_mv) || isnan(data->active_rms_mv) ||
        isnan(data->relax_mdf_hz) || isnan(data->active_mdf_hz)) {
        LOG("[STORAGE] UpdatePersonalCalib REJECTED: NaN in input\n");
        return false;
    }

    EEPROM.put(EEPROM_CALIB_ADDR, *data);
    EEPROM.update(EEPROM_MAGIC_ADDR, CALIB_MAGIC);

    LOG("[STORAGE] Calib saved to EEPROM (relax=%.3f, active=%.3f)\n",
         data->relax_rms_mv, data->active_rms_mv);
    return true;
}

// ==================== 个人信息（EEPROM） ====================

bool StorageManager::SetUserProfile(const UserProfileData_t* profile) {
    if (!profile) return false;
    EEPROM.put(EEPROM_PROFILE_ADDR, *profile);
    EEPROM.update(EEPROM_PROFILE_ADDR + sizeof(UserProfileData_t), PROFILE_MAGIC);
    LOG("[STORAGE] Profile saved: name='%s' age=%d\n", profile->name, profile->age);
    return true;
}

bool StorageManager::GetUserProfile(UserProfileData_t* profile) {
    if (!profile) return false;
    if (EEPROM.read(EEPROM_PROFILE_ADDR + sizeof(UserProfileData_t)) != PROFILE_MAGIC)
        return false;
    EEPROM.get(EEPROM_PROFILE_ADDR, *profile);
    return true;
}

// ==================== WiFi 操作（EEPROM） ====================

bool StorageManager::LoadWifiCredentials(WifiCredentials_t* outCreds) {
    if (!outCreds) return false;

    uint8_t magic = EEPROM.read(EEPROM_WIFI_VALID_ADDR);
    if (magic != EEPROM_WIFI_MAGIC) {
        outCreds->isValid = false;
        return false;
    }

    for (uint8_t i = 0; i < 32; i++)
        outCreds->ssid[i] = (char)EEPROM.read(EEPROM_WIFI_SSID_ADDR + i);
    outCreds->ssid[32] = '\0';

    for (uint8_t i = 0; i < 64; i++)
        outCreds->pass[i] = (char)EEPROM.read(EEPROM_WIFI_PASS_ADDR + i);
    outCreds->pass[64] = '\0';

    outCreds->isValid = (strlen(outCreds->ssid) > 0);
    LOG("[STORAGE] WiFi creds loaded: SSID='%s'\n", outCreds->ssid);
    return outCreds->isValid;
}

bool StorageManager::SaveWifiCredentials(const WifiCredentials_t* creds) {
    if (!creds) return false;
    for (uint8_t i = 0; i < 32; i++)
        EEPROM.update(EEPROM_WIFI_SSID_ADDR + i, (uint8_t)creds->ssid[i]);
    for (uint8_t i = 0; i < 64; i++)
        EEPROM.update(EEPROM_WIFI_PASS_ADDR + i, (uint8_t)creds->pass[i]);
    EEPROM.update(EEPROM_WIFI_VALID_ADDR, EEPROM_WIFI_MAGIC);
    LOG("[STORAGE] WiFi creds saved: SSID='%s'\n", creds->ssid);
    return true;
}

// ==================== tick() ====================
// 云方案无需 CZone 定期刷盘，tick() 为空函数供兼容
void StorageManager::tick() {
    // 云方案：无操作
    // （原 CZone 定期刷盘逻辑已移除）
}
