// ============================================================
// 文件名: AppController.cpp
// 模块: 4_AppController 应用控制器
// 职责: 业务调度主循环 — 信号处理 → 校准流程 → 云端上传 → 状态处理
//       持有 StateManager / SignalProcessor / StorageManager / NetManager 四个模块指针
// 关键流程:
//   - init():       开机从 EEPROM 加载校准数据 + 用户画像，注入 SignalProcessor
//   - tick():       每帧主循环 — 取信号值 → 校准阶段累积/终判 → 数据上云 → LED状态
//   - handleRecordRelax():  静息校准阶段开始（10s，去极值求均值）
//   - handleRecordActive(): 用力校准阶段开始（15s，取峰值RMS + 频谱MDF）
//   - handleSaveCalib():    保存校准到 EEPROM + 云端
//   - handleResetCalib():   清除校准
//   - handleApplyProfile(): 阶段3 云端精炼画像覆盖本地基线
// ============================================================
#include "AppController.h"
#include "0_Base/Logger.h"
#include "0_Base/Board.h"

AppController::AppController(
    StateManager* stateMgr,
    SignalProcessor* signalProc,
    StorageManager* storageMgr,
    NetManager* netMgr
) : _stateMgr(stateMgr),
    _signalProc(signalProc),
    _storageMgr(storageMgr),
    _netMgr(netMgr)
{
}

// init — 开机初始化
//   从 EEPROM 加载 PersonalCalibData + UserProfileData，注入 SignalProcessor 基线
//   之后状态机转入 ST_RUNNING
void AppController::init(void)
{
    PersonalCalibData_t calib = {0};
    bool calibValid = false;
    // 校准有效性由 StorageManager 的 magic + NaN 校验决定；
    // 不再依赖 calib_timestamp_sec（NTP 未同步时该值为 0，会导致每次重启丢弃有效校准）。
    // 兜底：relax/active 至少一个为正，防止"magic 在但全零"的异常结构体被误判为有效。
    if (_storageMgr->GetPersonalCalib(&calib) &&
        (calib.relax_rms_mv > 0.0f || calib.active_rms_mv > 0.0f)) {
        LOG("[CTRL] Boot: loaded calib relax_rms=%.3f active_rms=%.3f relax_mdf=%.1f active_mdf=%.1f end_mdf=%.1f\n",
            calib.relax_rms_mv, calib.active_rms_mv,
            calib.relax_mdf_hz, calib.active_mdf_hz, calib.end_mdf_hz);
        calibValid = true;
    } else {
        LOG("[CTRL] Boot: no calib in EEPROM\n");
    }

    UserProfileData_t profile = {0};
    if (_storageMgr->GetUserProfile(&profile) && profile.name[0]) {
        const char* genderStr = (profile.gender == 1) ? "male" : (profile.gender == 2) ? "female" : "unknown";
        const char* handStr = (profile.handedness == 1) ? "left" : (profile.handedness == 2) ? "right" : "unknown";
        LOG("[CTRL] Boot: loaded profile name=%s age=%u gender=%s hand=%s\n",
            profile.name, (unsigned)profile.age, genderStr, handStr);
    } else {
        LOG("[CTRL] Boot: no profile in EEPROM\n");
    }

    if (calibValid) {
        _signalProc->setCalibration(calib.relax_rms_mv, calib.active_rms_mv,
                                    calib.relax_mdf_hz, calib.active_mdf_hz,
                                    calib.end_mdf_hz);
        _signalProc->setRelaxBaseline(calib.relax_rms_mv, calib.relax_mdf_hz);
    }

    _stateMgr->transitionTo(ST_RUNNING);
    LOG("[CTRL] Boot: entering RUNNING\n");
    LOG("[CTRL] AppController initialized.\n");
}

// tick — 每帧主循环（由 loop() 调用，约 10ms/帧）
//   1) 取 SignalProcessor 输出（rms/mdf/fatigue/activation/quality）
//   2) 校准阶段: RELAX 去极值求均值 / ACTIVE 取峰值 + 频谱终判
//   3) RUNNING 态: pushDataPoint 上云 + 限频日志
//   4) 状态分派: RUNNING→LED颜色更新 / ERROR→LED全灭
void AppController::tick(void)
{
    // ===== Signal processing =====
    float rms = _signalProc->update();
    float mdf = _signalProc->getMDF();
    float fatigue = _signalProc->getFatigue();
    float activation = _signalProc->getActivation();
    uint8_t quality = (uint8_t)_signalProc->getSignalQuality();

    // ===== Calibration phase accumulation =====
    if (_calibPhase == CALIB_RELAX) {
        _calibAccumSum1 += rms;
        _calibAccumSum2 += mdf;
        _calibSampleCount++;
        if (rms < _calibMinRms) _calibMinRms = rms;
        if (rms > _calibRelaxMaxRms) _calibRelaxMaxRms = rms;
        if (mdf < _calibMinMdf) _calibMinMdf = mdf;
        if (mdf > _calibRelaxMaxMdf) _calibRelaxMaxMdf = mdf;
        if (millis() - _calibStartMs >= _calibTargetMs) {
            _calibPhase = CALIB_NONE;
            if (_calibSampleCount > 2) {
                _calibAccumSum1 -= (_calibMinRms + _calibRelaxMaxRms);
                _calibAccumSum2 -= (_calibMinMdf + _calibRelaxMaxMdf);
                _calibSampleCount -= 2;
            }
            float relaxRms = _calibAccumSum1 / _calibSampleCount;
            float relaxMdf = _calibAccumSum2 / _calibSampleCount;
            _signalProc->setRelaxBaseline(relaxRms, relaxMdf);
            _signalProc->resetEMA();
            _calibRelaxMdf = relaxMdf;
            LOG("[CTRL] <<< CALIB RELAX done: rms=%.3f mdf=%.1f (%u samples) <<<\n",
                relaxRms, relaxMdf, _calibSampleCount);
            // 上传静息校准结果到云端
            _netMgr->uploadCalibPhase("relax", relaxRms, relaxMdf);
        }
    }
    else if (_calibPhase == CALIB_ACTIVE) {
        if (rms > _calibAccumSum1) _calibAccumSum1 = rms;
        _signalProc->recordCalibMdf(mdf);
        _calibSampleCount++;
        if (millis() - _calibStartMs >= _calibTargetMs) {
            _calibPhase = CALIB_NONE;
            _signalProc->finalizeCalibMdf();
            float activeRms = _calibAccumSum1;
            _calibActiveMdf = _signalProc->getCalibMdfPeak();
            _calibEndMdf = _signalProc->getCalibMdfEnd();
            _signalProc->setActiveReference(activeRms);
            LOG("[CTRL] <<< CALIB ACTIVE done: rms=%.3f activeMdf=%.1f endMdf=%.1f <<<\n",
                activeRms, _calibActiveMdf, _calibEndMdf);
            // 上传用力校准结果到云端（含 end_mdf）
            _netMgr->uploadCalibPhase("active", activeRms, _calibActiveMdf, _calibEndMdf);
        }
    }

    // ===== Cloud data upload =====
    SystemState_t curState = _stateMgr->getState();
    if (rms > 0.0f && curState == ST_RUNNING) {
        // 云端使用服务器时间，无需上传 ts 字段
        _netMgr->pushDataPoint(rms, activation, mdf, fatigue, quality, _signalProc->isCalibrated());

        // 限频日志（显示相对运行时间）
        const char* phaseTag = "";
        if (_calibPhase == CALIB_RELAX) phaseTag = " [CALIB:RELAX]";
        else if (_calibPhase == CALIB_ACTIVE) phaseTag = " [CALIB:ACTIVE]";

        static uint16_t _dataLogCounter = 0;
        uint16_t logInterval = (_calibPhase == CALIB_RELAX || _calibPhase == CALIB_ACTIVE) ? 10 : 20;
        if (++_dataLogCounter >= logInterval) {
            _dataLogCounter = 0;
            char timeBuf[32];
            if (_netMgr && _netMgr->isTimeSynced()) {
                _netMgr->getTimeString(timeBuf, sizeof(timeBuf));
            } else {
                uint32_t ts = millis();
                unsigned int s = ts / 1000, ms = ts % 1000;
                unsigned int hh = s / 3600, mm = (s / 60) % 60, ss = s % 60;
                snprintf(timeBuf, sizeof(timeBuf), "%02u:%02u:%02u.%03u", hh, mm, ss, (unsigned)ms);
            }
            LOG("[DATA]%s %s rms=%.3f act=%.1f%% mdf=%.1f fatigue=%.1f%% q=%u pmains=%.1f\n",
                phaseTag, timeBuf, rms, activation, mdf, fatigue, quality, _signalProc->getMainsRms());
        }
    }

    // State handlers
    switch (curState) {
        case ST_RUNNING:
            _handleRunningState(rms, mdf, fatigue, quality, activation);
            break;
        case ST_ERROR:
        default:
            _handleErrorState();
            break;
    }
}

void AppController::onCommandReceived(AppCommand_t cmd)
{
    switch (cmd) {
        case CMD_START_STREAM:
            if (_stateMgr->getState() != ST_RUNNING) {
                _stateMgr->transitionTo(ST_RUNNING);
                LOG("[CTRL] start_stream: recovered to RUNNING\n");
            }
            break;
        default:
            break;
    }
}

static void _setRgbLed(float fatigue) {
    if (fatigue < 30.0f) {
        digitalWrite(PIN_RGB_R, LOW);   // 红灭
        digitalWrite(PIN_RGB_G, HIGH);  // 绿亮
        digitalWrite(PIN_RGB_B, LOW);   // 蓝灭
    } else if (fatigue < 70.0f) {
        digitalWrite(PIN_RGB_R, LOW);   // 红灭
        digitalWrite(PIN_RGB_G, LOW);   // 绿灭
        digitalWrite(PIN_RGB_B, HIGH);  // 蓝亮
    } else {
        digitalWrite(PIN_RGB_R, HIGH);  // 红亮
        digitalWrite(PIN_RGB_G, LOW);   // 绿灭
        digitalWrite(PIN_RGB_B, LOW);   // 蓝灭
    }
}

void AppController::_handleRunningState(float rms, float mdf, float fatigue,
                                         uint8_t quality, float activation)
{
    (void)rms; (void)mdf; (void)quality; (void)activation;
    _setRgbLed(fatigue);
}

void AppController::_handleErrorState(void) {
    digitalWrite(PIN_RGB_R, LOW);
    digitalWrite(PIN_RGB_G, LOW);
    digitalWrite(PIN_RGB_B, LOW);
}

// ==================== Calibration Handlers ====================
// 三个校准阶段由云端 record_relax / record_active / save_calib 命令触发
// 流程: RELAX(10s静息) → ACTIVE(15s用力) → SAVE(写入EEPROM+上传云端)

// handleRecordRelax — 启动静息校准阶段
//   目标: 10秒内去除最大最小值后求均值，作为 relax 基线
//   完成后自动调用 uploadCalibPhase("relax") 上云
void AppController::handleRecordRelax()
{
    if (_calibPhase != CALIB_NONE) {
        LOG("[CTRL] record_relax rejected: busy\n");
        return;
    }
    _calibPhase = CALIB_RELAX;
    _calibStartMs = millis();
    _calibTargetMs = 10000;
    _calibSampleCount = 0;
    _calibAccumSum1 = 0.0f;
    _calibAccumSum2 = 0.0f;
    _calibMinRms = 1e9f;
    _calibRelaxMaxRms = 0.0f;
    _calibMinMdf = 1e9f;
    _calibRelaxMaxMdf = 0.0f;
    LOG("[CTRL] >>> CALIB RELAX start (10s) <<<\n");
    _signalProc->resetEMA();
}

// handleRecordActive — 启动用力校准阶段
//   目标: 15秒内记录峰值RMS + 频谱峰值MDF + 结束MDF
//   完成后 finalizeCalibMdf() 触发频谱终判，uploadCalibPhase("active", ..., endMdf) 上云
void AppController::handleRecordActive()
{
    if (_calibPhase != CALIB_NONE) {
        LOG("[CTRL] record_active rejected: busy\n");
        return;
    }
    _calibPhase = CALIB_ACTIVE;
    _calibStartMs = millis();
    _calibTargetMs = 15000;
    _calibSampleCount = 0;
    _calibAccumSum1 = 0.0f;
    _signalProc->resetCalibMdfBuffer();
    LOG("[CTRL] >>> CALIB ACTIVE start (15s) <<<\n");
}

// handleSaveCalib — 保存校准到 EEPROM + 云端
//   参数: userScore=校准评分(-1表示仅存个人信息), name/age/gender/handedness=用户画像
//   流程: 存画像 → NaN校验 → 写入 PersonalCalibData → 注入 SignalProcessor → 上云
void AppController::handleSaveCalib(int userScore,
                                     const char* name, int age, int gender, int handedness)
{
    // Step 1: 个人信息 (if provided)
    if (name && name[0]) {
        UserProfileData_t profile;
        strncpy(profile.name, name, 31);
        profile.name[31] = '\0';
        profile.age = (uint8_t)age;
        profile.gender = (uint8_t)gender;
        profile.handedness = (uint8_t)handedness;
        _storageMgr->SetUserProfile(&profile);
    }

    // Step 2: 仅个人信息 (no userScore)
    if (userScore < 0) {
        // SetUserProfile() 已直接写EEPROM，无需额外操作
        LOG("[CTRL] Profile-only save: OK\n");
        return;
    }

    // Step 3: NaN 检测
    if (_calibRelaxMdf != _calibRelaxMdf || _calibRelaxMdf <= 0.0f ||
        _calibActiveMdf != _calibActiveMdf || _calibActiveMdf <= 0.0f) {
        LOG("[CTRL] save_calib rejected: calib not done\n");
        return;
    }

    // Step 4: 保存校准数据
    float relax_rms = _signalProc->getRelaxRms();
    float active_rms = _signalProc->getActiveRms();

    PersonalCalibData_t pcData = {0};
    pcData.relax_rms_mv = relax_rms;
    pcData.active_rms_mv = active_rms;
    pcData.relax_mdf_hz = _calibRelaxMdf;
    pcData.active_mdf_hz = _calibActiveMdf;
    pcData.end_mdf_hz = _calibEndMdf;
    pcData.calib_timestamp_sec = _netMgr->getCurrentTimeSec();
    pcData.calib_timestamp_ms = _netMgr->getCurrentTimeMs();
    _storageMgr->UpdatePersonalCalib(&pcData);
    _signalProc->setCalibration(relax_rms, active_rms, _calibRelaxMdf, _calibActiveMdf, _calibEndMdf);

    // [CLOUD] 上传校准数据到云端
    _netMgr->uploadCalibration(relax_rms, _calibRelaxMdf,
                                active_rms, _calibActiveMdf);

    LOG("[CTRL] Calib saved & uploaded: relax_rms=%.2f act_rms=%.2f\n",
        relax_rms, active_rms);
}

// handleResetCalib — 清除校准（云端 reset_calib 命令触发）
//   清除 SignalProcessor 基线 → StorageManager.ClearPersonalCalib() → 回到 RUNNING
void AppController::handleResetCalib()
{
    _signalProc->clearCalibration();
    _storageMgr->ClearPersonalCalib();   // 彻底清除：数据清零 + 清有效标记
    if (_stateMgr->getState() != ST_RUNNING) {
        _stateMgr->transitionTo(ST_RUNNING);
    }
    LOG("[CTRL] Calibration reset (EEPROM cleared)\n");
}

// handleApplyProfile — 阶段3 云端纵向画像精炼基线应用
//   NetManager.fetchProfile() 拉到云端聚合基线后通过此回调覆盖本地 EEPROM + 即时生效
//   云端多 session 聚合得到更稳健的 relax/active 基线
void AppController::handleApplyProfile(float relaxRms, float activeRms,
                                       float relaxMdf, float activeMdf, float endMdf)
{
    PersonalCalibData_t pcData = {0};
    pcData.relax_rms_mv = relaxRms;
    pcData.active_rms_mv = activeRms;
    pcData.relax_mdf_hz = relaxMdf;
    pcData.active_mdf_hz = activeMdf;
    pcData.end_mdf_hz = endMdf;
    pcData.calib_timestamp_sec = _netMgr->getCurrentTimeSec();
    pcData.calib_timestamp_ms = _netMgr->getCurrentTimeMs();
    _storageMgr->UpdatePersonalCalib(&pcData);
    _signalProc->setCalibration(relaxRms, activeRms, relaxMdf, activeMdf, endMdf);
    LOG("[CTRL] Cloud profile applied: relax_rms=%.2f act_rms=%.2f end_mdf=%.1f\n",
        relaxRms, activeRms, endMdf);
}
