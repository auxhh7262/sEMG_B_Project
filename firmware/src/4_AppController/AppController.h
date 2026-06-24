#ifndef APP_CONTROLLER_H
#define APP_CONTROLLER_H

#include <stdint.h>
#include "0_Base/Globals.h"
#include "0_Base/SystemStateMachine.h"
#include "1_Signal/SignalProcessor.h"
#include "2_Storage/StorageManager.h"
#include "3_Network/NetManager.h"

class AppController {
public:
    AppController(
        StateManager* stateMgr,
        SignalProcessor* signalProc,
        StorageManager* storageMgr,
        NetManager* netMgr
    );

    void init(void);
    void tick(void);
    void onCommandReceived(AppCommand_t cmd);

    // Calibration command handlers (no WS response — cloud version)
    void handleSaveCalib(int userScore = -1,
                         const char* name = nullptr, int age = 0,
                         int gender = 0, int handedness = 0);
    void handleResetCalib();
    void handleRecordRelax();
    void handleRecordActive();

private:
    void _handleRunningState(float rms, float mdf, float fatigue,
                             uint8_t quality, float activation);
    void _handleErrorState(void);

    // Calibration phase tracking
    enum CalibPhase { CALIB_NONE, CALIB_RELAX, CALIB_ACTIVE };
    CalibPhase _calibPhase = CALIB_NONE;
    uint32_t _calibStartMs = 0;
    uint32_t _calibTargetMs = 0;
    uint16_t _calibSampleCount = 0;
    float _calibAccumSum1 = 0.0f;
    float _calibAccumSum2 = 0.0f;
    float _calibMinRms = 1e9f;
    float _calibRelaxMaxRms = 0.0f;
    float _calibMinMdf = 1e9f;
    float _calibRelaxMaxMdf = 0.0f;

    // Calibration results
    float _calibRelaxMdf = 0.0f;
    float _calibActiveMdf = 0.0f;
    float _calibEndMdf = 0.0f;

    // Dependencies
    StateManager* _stateMgr;
    SignalProcessor* _signalProc;
    StorageManager* _storageMgr;
    NetManager* _netMgr;
};

#endif // APP_CONTROLLER_H
