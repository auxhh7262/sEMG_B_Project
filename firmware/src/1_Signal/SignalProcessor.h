// 文件: SignalProcessor.h
// 描述: 肌电信号处理器头文件

#ifndef SIGNAL_PROCESSOR_H
#define SIGNAL_PROCESSOR_H

#include <stdint.h>

// 数学常量定义
#ifndef PI
#define PI 3.1415926535f
#endif

// 二阶 IIR 陷波器：用于抑制 50/60Hz 工频干扰
// 传递函数：y = (b0*x + b1*x1 + b2*x2 - a1*y1 - a2*y2) / a0
// configure(sampleRate, centerFreq, Q)：Q 越大陷波越窄（带宽 ≈ f0/Q）
// 注：process() 仅做乘加，无三角函数，可安全在 ADC ISR 中调用
class NotchFilter {
public:
    NotchFilter() : b0(1), b1(0), b2(0), a0(1), a1(0), a2(0), x1(0), x2(0), y1(0), y2(0) {}
    void configure(float sampleRate, float centerFreq, float q) {
        float w0 = 2.0f * PI * centerFreq / sampleRate;
        float alpha = sinf(w0) / (2.0f * q);
        float cw = cosf(w0);
        b0 = 1.0f;
        b1 = -2.0f * cw;
        b2 = 1.0f;
        a0 = 1.0f + alpha;
        a1 = -2.0f * cw;
        a2 = 1.0f - alpha;
    }
    float process(float x) {
        float y = (b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0;
        x2 = x1; x1 = x;
        y2 = y1; y1 = y;
        return y;
    }
    void reset() { x1 = x2 = y1 = y2 = 0.0f; }
private:
    float b0, b1, b2, a0, a1, a2;
    float x1, x2, y1, y2;
};

class SignalProcessor {
public:
    // 调试级别枚举
    enum DebugLevel {
        DEBUG_NONE = 0,
        DEBUG_MINIMAL = 1,
        DEBUG_NORMAL = 2,
        DEBUG_VERBOSE = 3,
        DEBUG_FULL = 4
    };

    SignalProcessor();
    void init();

    // ---- 采样接口（在主循环中调用，非ISR上下文）----
    void pushSample(int16_t sample);  // 推入采样数据（陷波+工频检测+环形缓冲）
    void updateSampleRateStats();     // 更新主循环迭代速率统计

    // 核心信号处理方法
    float update();
    float getFatigue() const;
    float getActivation() const;

    // 校准接口
    void setCalibration(float relaxRMS_mV, float activeRMS_mV,
                        float relaxMDF_hz, float activeMDF_hz, float endMDF_hz);
    void clearCalibration();
    bool isCalibrated() const { return m_isCalibrated; }
    float getRelaxRms() const { return m_relaxRMS_mV; }
    float getActiveRms() const { return m_activeRMS_mV; }
    float getRelaxMdf() const { return m_relaxMDF_hz; }
    float getCurrentRms() const;
    float getCurrentMdf() const;
    void setRelaxBaseline(float relaxRms, float relaxMdf);
    void setActiveReference(float activeRms);
    // 校准MDF缓冲区接口
    void recordCalibMdf(float mdf_hz);  // 记录校准阶段MDF值
    void finalizeCalibMdf();             // 计算峰值和末尾MDF
    float getCalibMdfPeak() const { return m_calibMdfPeak; }
    float getCalibMdfEnd() const { return m_calibMdfEnd; }
    void resetCalibMdfBuffer();
    float getFatigueLevel() const { return m_fatigue; }

    // MDF相关方法
    float calculateMDF();
    float getMDF() const;
    float getSignalQuality() const;
    bool isContracting() const;
    bool isSignalInvalid() const { return m_signalInvalid; }  // 电极开路/未佩戴
    void setFFTWindowSize(uint16_t size);
    void setMDFFrequencyRange(float min_freq, float max_freq);
    void resetEMA();  // 校准阶段切换时重置 EMA

    // 调试和诊断方法
    void enableDebug(bool enable) { m_debugEnabled = enable; m_debugLevel = enable ? DEBUG_NORMAL : DEBUG_NONE; }
    void setDebugLevel(DebugLevel level) { m_debugLevel = level; }
    DebugLevel getDebugLevel() const { return m_debugLevel; }

    // 测试信号注入
    void injectTestSignal(float frequency_hz, float amplitude_mv, uint16_t samples);

    // 获取功率谱总功率
    float getLastTotalPower() const { return m_lastTotalPower; }
    float getRawMDF() const { return m_rawMDF; }
    float getMainsRms() const { return m_mainsRms; }  // 被陷波移除的工频RMS(mV)，开路检测特征量（50+60Hz合并）

    // 缓冲区状态监控
    uint16_t getBufferAvailable() const { return m_availableSamples; }
    uint16_t getBufferCapacity() const { return RING_BUFFER_SIZE; }
    float getLoopRateHz() const { return m_loopRateHz; }  // 主循环迭代速率，非ADC采样率
    uint32_t getDroppedSamples() const { return m_droppedSamples; }

    void resetBuffer();

    // v2: drain all new samples from ring buffer into user buffer
    // returns number of samples drained (0 if empty)
    uint16_t drainNewSamples(int16_t* outBuf, uint16_t maxCount);
    void resetSampleRateStats();

private:
    // 缓冲区大小定义
    static const uint16_t RING_BUFFER_SIZE = 512;
    static const uint16_t RING_BUFFER_MASK = 511;
    static const uint16_t MAX_FFT_SIZE = 256;
    static const uint16_t DEFAULT_FFT_SIZE = 256;

    // 环形缓冲区
    int16_t m_ringBuffer[RING_BUFFER_SIZE];
    volatile uint16_t m_writeIndex;
    uint16_t m_readIndex;

    // 信号处理状态
    float m_fatigue;         // 0-100 (%)
    float m_activation;      // 0-100 (%)
    float m_relaxRMS_mV;
    float m_activeRMS_mV;
    float m_relaxMDF_hz;
    float m_activeMDF_hz;         // 校准Active阶段峰值MDF，疲劳度锚点公式分母
    float m_mdfRange;             // 预计算的MDF范围 = activeMDF - fatigueFloor，避免重复计算
    float m_endMDF_hz;            // 个人疲劳下限锚点（校准 end_mdf）：F=100% 对应 MDF 跌到此值
    // 原始校准参考（不可在线改写）：约束在线学习的漂移边界，作为安全锚
    float m_calibRelaxRMS_mV;
    float m_calibActiveRMS_mV;
    float m_calibRelaxMDF_hz;
    float m_calibActiveMDF_hz;
    float m_calibEndMDF_hz;
    uint32_t m_restFrames;        // 静息持续帧计数（在线自校正 gate）
    float m_recoveryFactor;       // 学习到的放松期恢复因子（替换固定 0.998）
    uint32_t m_calibTimestampMs;  // 校准完成时间戳（ms），用于限制动态锚点更新窗口
    bool m_isCalibrated;
    bool m_isContracting;
    bool m_contractConfident;   // 收缩状态去抖后的稳定态（Phase3 收缩门控）
    uint32_t m_contractDebounce; // 进入收缩态所需的连续确认帧计数
    uint32_t m_contractExitCnt;  // 退出收缩态所需的连续非收缩帧计数
    bool m_signalInvalid;       // 电极开路/未佩戴标志（50Hz工频能量超限）
    uint8_t m_invalidFrames;    // 连续异常帧计数（进入开路去抖，防误判）
    uint8_t m_validFrames;      // 连续正常帧计数（退出开路去抖/滞回）

    // 50/60Hz 工频陷波 + 开路检测（基于被移除的工频总能量，而非被污染的 MDF）
    NotchFilter m_notch50;      // 50Hz 陷波
    NotchFilter m_notch60;      // 60Hz 陷波
    volatile float m_mainsPowerEma;  // 工频能量 EMA（(raw-notched)^2，单位 mV^2），ISR写/主循环读
    volatile float m_mainsRms;       // 工频 RMS 估计（mV），ISR内计算，主循环直接读

    // MDF计算相关
    float m_currentMDF;
    float m_lastValidMDF;
    bool m_isMdfValid;
    float m_signalQuality;
    uint16_t m_fftWindowSize;
    float m_mdfMinFreq;
    float m_mdfMaxFreq;

    // 调试和诊断
    float m_lastTotalPower;
    float m_rawMDF;
    bool m_debugEnabled;
    DebugLevel m_debugLevel;

    // 静态FFT缓冲区
    float m_fftInputBuffer[MAX_FFT_SIZE];
    float m_fftImagBuffer[MAX_FFT_SIZE];
    float m_powerSpectrum[MAX_FFT_SIZE / 2];
    float m_fftTwiddleReal[MAX_FFT_SIZE / 2];
    float m_fftTwiddleImag[MAX_FFT_SIZE / 2];
    bool m_fftTwiddleInitialized;

    // 采样率统计
    uint32_t m_lastSampleTime;
    float m_loopRateHz;           // 主循环迭代速率（Hz），非ADC采样率（ADC由硬件定时器保证1kHz）
    uint32_t m_sampleCount;
    uint32_t m_sampleTimeAccum;

    // 缓冲区状态跟踪
    volatile uint16_t m_availableSamples;
    uint32_t m_droppedSamples;

    // 状态机辅助变量
    uint16_t m_consecutivePhysioFrames;
    float m_qualityContinuityEma;     // EMA平滑的连续性比例（替代硬重置窗口）

    // 共享快照缓存
    int16_t m_snapshot[MAX_FFT_SIZE];
    float m_snapshotDCBias;
    bool m_snapshotValid;
    uint16_t m_snapshotSize;

    // 单位换算系数（预计算避免ISR内除法）
    float m_mvPerAdcUnit;       // mV per ADC count = VREF / ADC_MAX
    float m_adcPerMvUnit;       // ADC counts per mV = 1/m_mvPerAdcUnit（ISR内用乘法替代除法）

    // 私有方法
    float calculateRMS();
    void takeSnapshotIfNeeded(uint16_t window_size);
    void updateFatigue(float rms, float mdf);
    void _recomputeMdfRange();    // 依 end_mdf(优先)/relax_mdf 计算疲劳公式分母范围
    void evaluateSignalQuality(float rms, float mdf);
    uint16_t safeGetStartIndex(uint16_t window_size);

    void initializeFFTTwiddles();
    static void bitReverse(float* real, float* imag, uint16_t n);
    void fftRealInPlace(float* data_real, float* data_imag, uint16_t n);
    void calculatePowerSpectrum();
    float findMedianFrequency(const float* power_spectrum,
                              uint16_t num_bins,
                              float sample_rate,
                              float min_freq,
                              float max_freq);

    float m_currentRMS;           // 当前实时RMS

    // RMS趋势EMA - 用于检测收缩力变化（力混杂效应）
    // Phinyomark et al. (2012)[12]: MDF随收缩力变化，是疲劳评估的已知混杂因子
    float m_rmsTrendEma;           // RMS慢速EMA，作为力稳定性的基准
    uint8_t m_rmsColdStartCnt;     // 冷启动计数（前3帧平均）
    float m_rmsColdStartSum;       // 冷启动累加和

    // 校准MDF缓冲区
    static const uint16_t CALIB_MDF_BUF_SIZE = 200;
    float m_calibMdfBuffer[CALIB_MDF_BUF_SIZE];  // 校准阶段MDF值环形缓冲
    uint16_t m_calibMdfCount;                         // 缓冲区有效样本数
    float m_calibMdfPeak;                             // 校准阶段MDF峰值
    float m_calibMdfEnd;                               // 校准阶段结束时MDF
};

#endif // SIGNAL_PROCESSOR_H