// ============================================================
// 文件名: SystemStateMachine.cpp
// 模块: 0_Base 基础模块
// 职责: 设备三态状态机 + 校准阶段计时
//       状态流转: BOOT → RUNNING ↔ ERROR（3态，非法转移自动降级为ERROR）
//       校准阶段: startCalibPhase() 启动倒计时，isCalibPhaseComplete() 查询完成
// 关键函数:
//   - init():              重置为 BOOT 态
//   - transitionTo():      状态转移入口（含合法性校验，非法→ERROR）
//   - _validTransition():  合法转移表（BOOT→RUNNING, RUNNING↔ERROR, 允许自转移）
//   - startCalibPhase():   启动校准阶段倒计时（durationSec 秒）
//   - isCalibPhaseComplete(): 检查倒计时是否结束
//   - setError():          直接进入 ERROR 态并记录错误消息
// ============================================================
#include "SystemStateMachine.h"
#include "0_Base/Logger.h"

void StateManager::init()
{
    _state = ST_BOOT;
    _prevState = ST_BOOT;
    _phaseActive = false;
    _phaseDurationMs = 0;
    _errorMsg[0] = '\0';
}

// _validTransition — 合法转移表
//   3态简化机: BOOT→RUNNING(唯一出口), RUNNING→ERROR, ERROR→RUNNING
//   允许自转移（RUNNING→RUNNING），避免 reset_calib 等操作误入 ERROR
bool StateManager::_validTransition(SystemState_t from, SystemState_t to)
{
    // 允许自转换（RUNNING→RUNNING），避免 reset_calib 等操作误入 ERROR
    if (from == to) return true;
    // 3-state machine: BOOT→RUNNING, ERROR→RUNNING, RUNNING→ERROR
    if (from == ST_BOOT) return (to == ST_RUNNING);
    if (from == ST_RUNNING) return (to == ST_ERROR);
    if (from == ST_ERROR) return (to == ST_RUNNING);
    return false;
}

// transitionTo — 状态转移入口
//   校验合法性 → 记录 prev_state → 更新 state → 重置 phaseActive / errorMsg
//   非法转移自动降级为 ERROR 态，返回 false
bool StateManager::transitionTo(SystemState_t newState)
{
    if (!_validTransition(_state, newState)) {
        snprintf(_errorMsg, sizeof(_errorMsg), "Bad transition from %s", getStateName());
        LOG("[STATE] ERROR: %s\n", _errorMsg);
        _prevState = _state;
        _state = ST_ERROR;
        return false;
    }

    LOG("[STATE] %s -> %s\n", getStateName(),
        newState == ST_RUNNING     ? "RUNNING" :
        newState == ST_ERROR       ? "ERROR"  : "???");

    _prevState = _state;
    _state = newState;
    _phaseActive = false;
    _errorMsg[0] = '\0';
    return true;
}

SystemState_t StateManager::getState() const
{
    return _state;
}

const char* StateManager::getStateName() const
{
    switch (_state) {
        case ST_BOOT:        return "BOOT";
        case ST_RUNNING:     return "RUNNING";
        case ST_ERROR:       return "ERROR";
        default:             return "?";
    }
}

// startCalibPhase — 启动校准阶段倒计时
//   记录起始时刻 millis()，设置总时长 durationSec 秒
void StateManager::startCalibPhase(uint16_t durationSec)
{
    _phaseStartMs = millis();
    _phaseDurationMs = (uint32_t)durationSec * 1000UL;
    _phaseActive = true;
}

// isCalibPhaseComplete — 检查校准阶段倒计时是否结束
//   返回: true=已到达 durationSec，业务层应切换到下一阶段
//   注意: phase 未激活时会打印前10次调试日志（避免刷屏）
bool StateManager::isCalibPhaseComplete() const
{
    if (!_phaseActive) {
        // 只在前10次打印（避免刷屏）
        static uint8_t _dbgCount = 0;
        if (_dbgCount++ < 10) {
            LOG("[STATE] isCalibPhaseComplete: NOT active (state=%s)\n", getStateName());
        }
        return false;
    }
    uint32_t elapsed = millis() - _phaseStartMs;
    if (elapsed >= _phaseDurationMs) {
        LOG("[STATE] Phase COMPLETE! elapsed=%lu >= dur=%lu\n",
            (unsigned long)elapsed, (unsigned long)_phaseDurationMs);
        return true;
    }
    return false;
}

uint8_t StateManager::getCalibProgress() const
{
    if (!_phaseActive) return 0;
    uint32_t elapsed = millis() - _phaseStartMs;
    if (elapsed >= _phaseDurationMs) return 100;
    // 倒计时百分比（校准阶段通过 3-10 秒）
    uint8_t pct = (uint8_t)((elapsed * 100UL) / _phaseDurationMs);
    return pct;
}

// setError — 直接进入 ERROR 态并记录错误消息
//   用于业务层检测到致命错误时的快速降级（跳过 transitionTo 合法性校验）
void StateManager::setError(const char* msg)
{
    strncpy(_errorMsg, msg, sizeof(_errorMsg) - 1);
    _errorMsg[sizeof(_errorMsg) - 1] = '\0';
    LOG("[STATE] ERROR: %s\n", _errorMsg);
    _prevState = _state;
    _state = ST_ERROR;
}

const char* StateManager::getErrorMsg() const
{
    return _errorMsg;
}
