// AppController.cpp — 业务调度主循环
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

void AppController::init(void)
{
    PersonalCalibData_t calib = {0};
    if (_storageMgr->GetPersonalCalib(&calib) && calib.calib_timestamp_sec > 0) {
        _signalProc->setCalibration(calib.relax_rms_mv, calib.active_rms_mv, calib.relax_mdf_hz);
        _signalProc->setRelaxBaseline(calib.relax_rms_mv, calib.relax_mdf_hz);
        LOG("[CTRL] Boot: loaded calib relax_mdf=%.1f\n", calib.relax_mdf_hz);
    } else {
        LOG("[CTRL] Boot: no calib in EEPROM\n");
    }

    _stateMgr->transitionTo(ST_RUNNING);
    LOG("[CTRL] Boot: entering RUNNING\n");
    LOG("[CTRL] AppController initialized.\n");
}

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
        _netMgr->pushDataPoint(rms, activation, mdf, fatigue, quality);

        // 限频日志（显示相对运行时间）
        const char* phaseTag = "";
        if (_calibPhase == CALIB_RELAX) phaseTag = " [CALIB:RELAX]";
        else if (_calibPhase == CALIB_ACTIVE) phaseTag = " [CALIB:ACTIVE]";

        static uint16_t _dataLogCounter = 0;
        if (++_dataLogCounter >= 60) {
            _dataLogCounter = 0;
            uint32_t ts = millis();
            unsigned int s = ts / 1000, ms = ts % 1000;
            unsigned int mm = (s / 60) % 60, ss = s % 60;
            LOG("[DATA]%s %02u:%02u.%03u rms=%.3f act=%.1f%% mdf=%.1f fatigue=%.1f%% q=%u\n",
                phaseTag, mm, ss, ms, rms, activation, mdf, fatigue, quality);
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

void AppController::_handleRunningState(float rms, float mdf, float fatigue,
                                         uint8_t quality, float activation)
{
    // Data already pushed in tick() via pushDataPoint
    (void)rms; (void)mdf; (void)fatigue; (void)quality; (void)activation;
}

void AppController::_handleErrorState(void) {}

// ==================== Calibration Handlers ====================

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
    uint32_t nowMs = millis();
    pcData.calib_timestamp_sec = nowMs / 1000;
    pcData.calib_timestamp_ms = (uint16_t)(nowMs % 1000);
    _storageMgr->UpdatePersonalCalib(&pcData);
    _signalProc->setCalibration(relax_rms, active_rms, _calibRelaxMdf);

    // [CLOUD] 上传校准数据到云端
    _netMgr->uploadCalibration(relax_rms, _calibRelaxMdf,
                                active_rms, _calibActiveMdf);

    LOG("[CTRL] Calib saved & uploaded: relax_rms=%.2f act_rms=%.2f\n",
        relax_rms, active_rms);
}

void AppController::handleResetCalib()
{
    _signalProc->clearCalibration();
    PersonalCalibData_t emptyData = {0};
    _storageMgr->UpdatePersonalCalib(&emptyData);
    if (_stateMgr->getState() != ST_RUNNING) {
        _stateMgr->transitionTo(ST_RUNNING);
    }
    LOG("[CTRL] Calibration reset\n");
}
