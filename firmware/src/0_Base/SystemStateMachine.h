// ============================================================
// 文件名: SystemStateMachine.h
// 模块:   基础驱动/状态管理
// 职责:   管理设备运行状态机，处理 Boot → Running → Error 的状态转换、校准阶段计时与错误状态维护
// 关键类/函数:
//   - StateManager: 封装状态枚举、转换校验、校准阶段计时与错误消息的单例式管理器
//   - init(): 初始化状态机到 ST_BOOT
//   - transitionTo(newState): 请求状态转换（内部校验合法性）
//   - startCalibPhase(durationSec): 启动倒计时式校准阶段
//   - setError(msg): 记录错误并切到 ST_ERROR
// ============================================================
#ifndef SYSTEM_STATE_MACHINE_H
#define SYSTEM_STATE_MACHINE_H

#include <Arduino.h>
#include "0_Base/Globals.h"

class StateManager {
public:
    void init();

    bool transitionTo(SystemState_t newState);
    SystemState_t getState() const;
    const char* getStateName() const;

    void startCalibPhase(uint16_t durationSec);
    bool isCalibPhaseComplete() const;
    uint8_t getCalibProgress() const;  // 0~100

    void setError(const char* msg);
    const char* getErrorMsg() const;

private:
    SystemState_t _state, _prevState;
    uint32_t _phaseStartMs;
    uint16_t _phaseDurationMs;
    bool _phaseActive;
    char _errorMsg[64];

    bool _validTransition(SystemState_t from, SystemState_t to);
};

#endif // SYSTEM_STATE_MACHINE_H
