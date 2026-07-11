#include "0_Base/Board.h"
#include "0_Base/Logger.h"
#include "SignalProcessor.h"

#include <Arduino.h>
#include <cmath>
#include <cstring>

// ==================== 调试日志宏 ====================

// ==================== 初始化与重置 ====================
#ifndef RING_BUFFER_SIZE
#define RING_BUFFER_SIZE 512
#endif
#ifndef RING_BUFFER_MASK
#define RING_BUFFER_MASK 511
#endif
#ifndef MAX_FFT_SIZE
#define MAX_FFT_SIZE 256
#endif

// 开路检测阈值：被陷波移除的 50Hz 工频 RMS 超过此值(mV)即判为开路/未佩戴
// 实测：开路 50Hz RMS≈500-1500mV，佩戴静息≈5-8mV，重新佩戴过渡瞬间瞬态≈20-40mV。
// 阈值取 80mV：既消除重新佩戴时 2 行短暂"请佩戴"闪动，又离开路 500mV 余量极大，
// 不影响开路检测（原 40mV 会把过渡瞬态误判为开路）。
#ifndef MAINS_OPEN_ENTER_MV
#define MAINS_OPEN_ENTER_MV 700.0f   // 进入开路：高于佩戴实测工频上界(~600mV)留裕度
#endif
#ifndef MAINS_OPEN_EXIT_MV
#define MAINS_OPEN_EXIT_MV 400.0f    // 退出开路：低于真开路实测下界(~800mV)留裕度
#endif

// ==================== 调试日志宏（已修复快捷键缺失问题）====================
#define SP_LOG(level, fmt, ...) do { \
    if (m_debugEnabled && level <= m_debugLevel) \
        LOG("[SIGNAL] " fmt, ##__VA_ARGS__); \
} while(0)

#define SP_LOG_MINIMAL(fmt, ...) SP_LOG(DEBUG_MINIMAL, fmt, ##__VA_ARGS__)
#define SP_LOG_NORMAL(fmt, ...) SP_LOG(DEBUG_NORMAL, fmt, ##__VA_ARGS__)
#define SP_LOG_VERBOSE(fmt, ...) SP_LOG(DEBUG_VERBOSE, fmt, ##__VA_ARGS__)
#define SP_LOG_FULL(fmt, ...) SP_LOG(DEBUG_FULL, fmt, ##__VA_ARGS__)

// ==================== 初始化与重置 ====================
SignalProcessor::SignalProcessor() :
    m_writeIndex(0), m_readIndex(0),
    m_fatigue(0.0f), m_activation(0.0f),
    m_relaxRMS_mV(0.0f), m_activeRMS_mV(0.0f),  // 0=未校准,避免默认计算出100%activation
    m_relaxMDF_hz(100.0f),
    m_activeMDF_hz(0.0f),  // 0=未校准，与m_relaxRMS_mV保持一致
    m_mdfRange(0.0f),
    m_calibTimestampMs(0),
    m_isCalibrated(false),
    m_isContracting(false),
    m_signalInvalid(false),
    m_invalidFrames(0),
    m_validFrames(0),
    m_currentMDF(0.0f), m_lastValidMDF(0.0f), m_isMdfValid(false),
    m_signalQuality(0.0f),
    m_fftWindowSize(DEFAULT_FFT_SIZE),
    m_mdfMinFreq(20.0f), m_mdfMaxFreq(250.0f),  // 20Hz下限对齐传感器有效频谱（20~500Hz）
    m_lastTotalPower(0.0f), m_rawMDF(0.0f),
    m_debugEnabled(false), m_debugLevel(DEBUG_NONE),
    m_fftTwiddleInitialized(false),
    m_lastSampleTime(0), m_loopRateHz(1000.0f),
    m_sampleCount(0), m_sampleTimeAccum(0),
    m_availableSamples(0),
    m_droppedSamples(0),
    m_consecutivePhysioFrames(0),
    m_qualityContinuityEma(0.0f),
    m_snapshotDCBias(0.0f), m_snapshotValid(false), m_snapshotSize(0),
    m_mvPerAdcUnit(0.0f),
    m_adcPerMvUnit(0.0f),
    m_currentRMS(0.0f),
    m_rmsTrendEma(0.0f),
    m_rmsColdStartCnt(0),
    m_rmsColdStartSum(0.0f),
    // 校准MDF缓冲区初始化
    m_calibMdfCount(0),
    m_calibMdfPeak(0.0f),
    m_calibMdfEnd(0.0f),
    m_mainsPowerEma(0.0f), m_mainsRms(0.0f),
    m_endMDF_hz(0.0f),
    m_calibRelaxRMS_mV(0.0f), m_calibActiveRMS_mV(0.0f),
    m_calibRelaxMDF_hz(0.0f), m_calibActiveMDF_hz(0.0f), m_calibEndMDF_hz(0.0f),
    m_restFrames(0),
    m_recoveryFactor(0.998f),
    m_contractConfident(false),
    m_contractDebounce(0),
    m_contractExitCnt(0)
{
    memset(m_ringBuffer, 0, sizeof(m_ringBuffer));
    memset(m_fftInputBuffer, 0, sizeof(m_fftInputBuffer));
    memset(m_fftImagBuffer, 0, sizeof(m_fftImagBuffer));
    memset(m_powerSpectrum, 0, sizeof(m_powerSpectrum));
    memset(m_fftTwiddleReal, 0, sizeof(m_fftTwiddleReal));
    memset(m_fftTwiddleImag, 0, sizeof(m_fftTwiddleImag));
    memset(m_snapshot, 0, sizeof(m_snapshot));
}

// ==================== 初始化与重置 ====================
void SignalProcessor::init() {
    m_writeIndex = 0; m_readIndex = 0;
    m_fatigue = 0.0f; m_activation = 0.0f;     m_isCalibrated = false;
    m_isContracting = false;
    m_contractConfident = false;
    m_contractDebounce = 0;
    m_contractExitCnt = 0;
    m_signalInvalid = false;
    m_invalidFrames = 0;
    m_validFrames = 0;
    m_currentMDF = 0.0f; m_lastValidMDF = 0.0f; m_isMdfValid = false;
    m_signalQuality = 0.0f; m_lastTotalPower = 0.0f; m_rawMDF = 0.0f;
    m_debugEnabled = false; m_debugLevel = DEBUG_NONE;
    m_lastSampleTime = micros();
    m_loopRateHz = 1000.0f;
    m_sampleCount = 0; m_sampleTimeAccum = 0;
    m_availableSamples = 0; m_droppedSamples = 0;
    m_consecutivePhysioFrames = 0;
    m_qualityContinuityEma = 0.0f;
    m_snapshotDCBias = 0.0f; m_snapshotValid = false; m_snapshotSize = 0;
    m_rmsTrendEma = 0.0f;
    m_rmsColdStartCnt = 0;
    m_rmsColdStartSum = 0.0f;
    
    m_mvPerAdcUnit = ADC_REF_MV / (float)ADC_MAX_VALUE;
    m_adcPerMvUnit = 1.0f / m_mvPerAdcUnit;  // 预计算倒数，ISR内用乘法替代除法
    // 配置 50/60Hz 工频陷波（采样率固定 1000Hz，见 main.cpp adc_timer）
    // Q=25 → 陷波带宽≈2Hz(48-52Hz / 58-62Hz)，足以清除稳定工频且对真实肌电影响极小
    m_notch50.configure(1000.0f, 50.0f, 25.0f);
    m_notch60.configure(1000.0f, 60.0f, 25.0f);
    m_mainsPowerEma = 0.0f; m_mainsRms = 0.0f;
    initializeFFTTwiddles();
    SP_LOG_NORMAL("SignalProcessor initialized.\n");
}


// drain all available new samples from ring buffer
uint16_t SignalProcessor::drainNewSamples(int16_t* outBuf, uint16_t maxCount) {
    noInterrupts();
    uint16_t avail = m_availableSamples;
    if (avail == 0) {
        interrupts();
        return 0;
    }
    uint16_t count = (avail < maxCount) ? avail : maxCount;
    // oldest samples first: read from (writeIndex - avail)
    uint16_t startIdx = (m_writeIndex - avail) & RING_BUFFER_MASK;
    for (uint16_t i = 0; i < count; i++) {
        outBuf[i] = m_ringBuffer[(startIdx + i) & RING_BUFFER_MASK];
    }
    m_availableSamples -= count;
    m_readIndex = (startIdx + count) & RING_BUFFER_MASK;
    interrupts();
    return count;
}

void SignalProcessor::resetBuffer() {
    noInterrupts();
    m_writeIndex = 0;
    m_availableSamples = 0;
    interrupts();
    SP_LOG_NORMAL("Buffer reset\n");
}

// ==================== ISR安全环形缓冲区 ====================
uint16_t SignalProcessor::safeGetStartIndex(uint16_t window_size) {
    if (window_size > RING_BUFFER_SIZE) window_size = RING_BUFFER_SIZE;
    uint32_t write_idx = m_writeIndex;
    if (write_idx >= window_size)
        return static_cast<uint16_t>(write_idx - window_size);
    return RING_BUFFER_SIZE - (window_size - static_cast<uint16_t>(write_idx));
}

void SignalProcessor::pushSample(int16_t sample) {
    // 原始 ADC 计数值 → 电压(mV)
    float raw = sample * m_mvPerAdcUnit;
    // 50/60Hz 工频陷波：弱信号时 50Hz 干扰会主导频谱（把 MDF 拉到≈50Hz），
    // 陷波后 MDF/RMS/疲劳回到真实生理值
    float n50 = m_notch50.process(raw);
    float notched = m_notch60.process(n50);
    // 开路检测特征量：被陷波移除的分量即工频总能量（50Hz + 60Hz）。
    // 开路——电极悬空拾取强工频共模干扰 → 能量极大；
    // 佩戴——被人体/放大器 CMRR 衰减 → 能量极小。两者差 ~100 倍。
    float diff = raw - notched;
    float diffSq = diff * diff;
    // EMA平滑（α=0.01，时间常数~0.1s @1kHz）
    m_mainsPowerEma = 0.01f * diffSq + 0.99f * m_mainsPowerEma;
    // ISR内顺手算好RMS，主循环直接读这个原子float
    // 避免主循环重复计算，也解决ISR↔主循环数据竞争问题
    m_mainsRms = sqrtf(m_mainsPowerEma > 0.0f ? m_mainsPowerEma : 0.0f);

    // 存储陷波后的计数值（下游 RMS/MDF/疲劳均基于干净信号）
    // 用预计算的倒数替代除法，ISR内性能更优
    int16_t notchedSample = (m_adcPerMvUnit > 0.0f)
        ? (int16_t)(notched * m_adcPerMvUnit)
        : sample;
    noInterrupts();
    m_ringBuffer[m_writeIndex] = notchedSample;
    m_writeIndex = (m_writeIndex + 1) & RING_BUFFER_MASK;
    if (m_availableSamples < RING_BUFFER_SIZE) {
        m_availableSamples++;
    } else {
        m_droppedSamples++;
    }
    interrupts();
}

// ==================== 采样率统计 ====================
void SignalProcessor::updateSampleRateStats() {
    uint32_t currentTime = micros();
    if (m_lastSampleTime > 0 && m_lastSampleTime < currentTime) {
        uint32_t interval = currentTime - m_lastSampleTime;
        m_sampleTimeAccum += interval;
        m_sampleCount++;
        if (m_sampleCount >= 100) {
            float avgIntervalSec = m_sampleTimeAccum / 1000000.0f / m_sampleCount;
            if (avgIntervalSec > 0.0f) {
                m_loopRateHz = 1.0f / avgIntervalSec;
            }
            m_sampleCount = 0;
            m_sampleTimeAccum = 0;
        }
    }
    m_lastSampleTime = currentTime;
}

// ==================== 快照缓存 ====================
// 不再原地排序！排序会破坏时序，导致RMS计算错误
// DC偏移用简单均值（512样本已足够稳定，无需裁剪均值）
void SignalProcessor::takeSnapshotIfNeeded(uint16_t window_size) {
    if (m_snapshotValid && m_snapshotSize == window_size) return;
    if (window_size == 0 || window_size > RING_BUFFER_SIZE) return;

    noInterrupts();
    uint16_t start_idx = safeGetStartIndex(window_size);
    float sum = 0.0f;
    for (uint16_t i = 0; i < window_size; i++) {
        m_snapshot[i] = m_ringBuffer[(start_idx + i) & RING_BUFFER_MASK];
        sum += m_snapshot[i];
    }
    interrupts();

    // 简单均值计算DC偏移（保留时序完整性）
    m_snapshotDCBias = (sum / (float)window_size) * m_mvPerAdcUnit;
    m_snapshotSize = window_size;
    m_snapshotValid = true;

    // 原始ADC诊断：打印min/max/mean
    static uint32_t _lastSnapDbgMs = 0;
    if (millis() - _lastSnapDbgMs >= 2000) {
        _lastSnapDbgMs = millis();
        int16_t snapMin = m_snapshot[0], snapMax = m_snapshot[0];
        for (uint16_t i = 1; i < window_size; i++) {
            if (m_snapshot[i] < snapMin) snapMin = m_snapshot[i];
            if (m_snapshot[i] > snapMax) snapMax = m_snapshot[i];
        }
        float snapMean = sum / (float)window_size;
        // [SNAP_DBG] removed - was spamming boot output
        // LOG("[SNAP_DBG] N=%u min=%d max=%d mean=%.1f DCbias=%.2fmV\n",
        //     window_size, snapMin, snapMax, snapMean, m_snapshotDCBias);
    }
}

// ==================== RMS 计算 + P1 疲劳度 ====================
float SignalProcessor::calculateRMS() {
    const uint16_t window_size = m_fftWindowSize;
    if (m_availableSamples < window_size) return 0.0f;
    takeSnapshotIfNeeded(window_size);

    float sum_squares = 0.0f;
    for (uint16_t i = 0; i < window_size; i++) {
        float voltage = m_snapshot[i] * m_mvPerAdcUnit;
        float ac = voltage - m_snapshotDCBias;
        sum_squares += ac * ac;
    }
    return sqrtf(sum_squares / (float)window_size);
}

// ==================== FFT 核心 ====================
void SignalProcessor::initializeFFTTwiddles() {
    if (m_fftTwiddleInitialized) return;
    uint16_t half_n = m_fftWindowSize / 2;
    for (uint16_t i = 0; i < half_n; i++) {
        float theta = -2.0f * PI * i / m_fftWindowSize;
        m_fftTwiddleReal[i] = cosf(theta);
        m_fftTwiddleImag[i] = sinf(theta);
    }
    m_fftTwiddleInitialized = true;
}

void SignalProcessor::bitReverse(float* real, float* imag, uint16_t n) {
    uint16_t j = 0;
    for (uint16_t i = 0; i < n - 1; i++) {
        if (i < j) {
            float tr = real[i], ti = imag[i];
            real[i] = real[j]; imag[i] = imag[j];
            real[j] = tr; imag[j] = ti;
        }
        uint16_t k = n >> 1;
        while (k <= j) { j -= k; k >>= 1; }
        j += k;
    }
}

void SignalProcessor::fftRealInPlace(float* real, float* imag, uint16_t n) {
    bitReverse(real, imag, n);
    for (uint16_t len = 2; len <= n; len <<= 1) {
        uint16_t half_len = len >> 1;
        uint16_t step = n / len;
        for (uint16_t i = 0; i < n; i += len) {
            for (uint16_t j = 0; j < half_len; j++) {
                uint16_t tidx = j * step;
                float wr = m_fftTwiddleReal[tidx];
                float wi = m_fftTwiddleImag[tidx];
                uint16_t u = i + j, v = i + j + half_len;
                float tr = real[v] * wr - imag[v] * wi;
                float ti = real[v] * wi + imag[v] * wr;
                real[v] = real[u] - tr; imag[v] = imag[u] - ti;
                real[u] += tr; imag[u] += ti;
            }
        }
    }
}

// ==================== 功率谱计算 ====================
void SignalProcessor::calculatePowerSpectrum() {
    if (m_fftWindowSize < 2) return;
    if (!m_fftTwiddleInitialized) initializeFFTTwiddles();
    memset(m_fftImagBuffer, 0, sizeof(float) * m_fftWindowSize);

    for (uint16_t i = 0; i < m_fftWindowSize; i++) {
        float v = m_snapshot[i] * m_mvPerAdcUnit - m_snapshotDCBias;
        float w = 0.5f * (1.0f - cosf(2.0f * PI * i / (m_fftWindowSize - 1)));
        m_fftInputBuffer[i] = v * w;
    }

    fftRealInPlace(m_fftInputBuffer, m_fftImagBuffer, m_fftWindowSize);

    uint16_t half_n = m_fftWindowSize / 2;
    m_lastTotalPower = 0.0f;
    bool hasNaN = false;
    
    for (uint16_t i = 0; i < half_n; i++) {
        float real = m_fftInputBuffer[i];
        float imag = m_fftImagBuffer[i];
        float p = (real * real + imag * imag) / (float)m_fftWindowSize;
        // NaN/Inf保护：ADC饱和导致FFT结果异常
        if (!isnan(p) && !isinf(p)) {
            m_powerSpectrum[i] = p;
            m_lastTotalPower += p;
        } else {
            m_powerSpectrum[i] = 0.0f;  // 静默替换异常值
            hasNaN = true;
        }
    }
    if (hasNaN) {
#ifdef MDF_DBG_ENABLED
        LOG("[MDF_DBG] NaN_IN_FFT!");
#endif
    }
}

// ==================== MDF 计算 ====================
float SignalProcessor::findMedianFrequency(
    const float* power_spectrum,
    uint16_t num_bins,
    float sample_rate,
    float min_freq,
    float max_freq
) {
    // 入口参数诊断
#ifdef MDF_DBG_ENABLED
    LOG("[MDF_DBG] ENTER sr=%.0f fmin=%.0f fmax=%.0f bins=%d",
        (double)sample_rate, (double)min_freq, (double)max_freq, (int)num_bins);
#endif

    // 异常时返回-1.0f（错误标记），不返回m_lastValidMDF
    // 旧代码返回m_lastValidMDF导致自引用循环：
    // resetEMA()设m_lastValidMDF=80.0 → fallback返回80.0 → 被当rawMDF → EMA接受80.0 → 锁死
    if (sample_rate < 100.0f) {
#ifdef MDF_DBG_ENABLED
        LOG("[MDF_DBG] BAD_SR sr=%.1f", (double)sample_rate);
#endif
        return -1.0f;
    }

    float nyquist = sample_rate / 2.0f;
    float effective_max = fmin(max_freq, nyquist);
    float freq_res = sample_rate / m_fftWindowSize;

    float total_power = 0.0f;
    for (uint16_t i = 3; i < num_bins; i++) {
        float freq = i * freq_res;
        if (freq >= min_freq && freq <= effective_max) {
            total_power += power_spectrum[i];
        }
    }
    // 打印total_power（关键诊断：1e-12f阈值判断）
    if (total_power < 1e-12f) {
#ifdef MDF_DBG_ENABLED
        LOG("[MDF_DBG] LOW_POWER tp=%.8f < 1e-12", (double)total_power);
#endif
        return -1.0f;
    }

    float half_power = total_power * 0.5f;
    float accumulated = 0.0f, prev_accumulated = 0.0f;
    float prev_freq = 0.0f;

    for (uint16_t i = 1; i < num_bins; i++) {
        float freq = i * freq_res;
        if (freq >= min_freq && freq <= effective_max) {
            float bp_val = power_spectrum[i];
            // 跳过NaN/Inf bins
            if (isnan(bp_val) || isinf(bp_val)) continue;
            prev_accumulated = accumulated;
            accumulated += bp_val;
            if (accumulated >= half_power) {
                if (bp_val > 0.0f) {
                    float ratio = (half_power - prev_accumulated) / bp_val;
                    float mdf_result = prev_freq + ratio * freq_res;
#ifdef MDF_DBG_ENABLED
                    LOG("[MDF_DBG] OK tp=%.4f MDF=%.1f", (double)total_power, (double)mdf_result);
#endif
                    return mdf_result;
                }
                return freq;
            }
        }
        prev_freq = freq;
    }
    // 诊断：为何accumulated未达half_power
#ifdef MDF_DBG_ENABLED
    LOG("[MDF_DBG] LOOP_END tp=%.4f acc=%.4f hp=%.4f bins=%d fmin=%.0f fmax=%.0f",
        (double)total_power, (double)accumulated, (double)half_power,
        (int)num_bins, (double)min_freq, (double)effective_max);
#endif
    return -1.0f;  // 频谱异常无法定位MDF
}

float SignalProcessor::calculateMDF() {
    if (m_availableSamples < m_fftWindowSize) {
        m_isMdfValid = false;
        return 0.0f;
    }

    takeSnapshotIfNeeded(m_fftWindowSize);
    calculatePowerSpectrum();

    // 使用ADC定时器固定采样率，不用m_loopRateHz
    // m_loopRateHz测量的是loop迭代速率，不是ADC真实采样率
    // WiFi通信会拖慢loop，导致m_loopRateHz崩到17-25Hz
    // ADC定时器配置为1000Hz（见main.cpp adc_timer.begin(1000.0f)）
    constexpr float ADC_SAMPLE_RATE = 1000.0f;
    m_rawMDF = findMedianFrequency(
        m_powerSpectrum,
        m_fftWindowSize / 2,
        ADC_SAMPLE_RATE,
        m_mdfMinFreq,
        m_mdfMaxFreq
    );
#ifdef MDF_DBG_ENABLED
    LOG("[MDF_DBG] rawMDF=%.2f curMDF=%.2f lastValid=%.2f",
        (double)m_rawMDF, (double)m_currentMDF, (double)m_lastValidMDF);
#endif

    // findMedianFrequency异常时返回-1.0f，跳过本次EMA更新
    if (m_rawMDF < 0.0f) {
        // FFT无效（功率太小或采样率异常），保持上次有效MDF，不更新EMA
        m_consecutivePhysioFrames = 0;
        // 不修改m_currentMDF/m_lastValidMDF/m_isMdfValid
#ifdef MDF_DBG_ENABLED
        LOG("[MDF_DBG] -> rawMDF<0, return m_currentMDF=%.2f (hold)", (double)m_currentMDF);
#endif
        return m_currentMDF;
    }

    // 放宽上限180→250Hz：肌肉收缩时MDF可达200+Hz
    // 之前180Hz上限导致rawMDF被丢弃，EMA永远输出上次值→MAX阶段锁死
    bool is_physiological = (m_rawMDF >= 20.0f && m_rawMDF <= 250.0f);  // 20Hz下限对齐传感器有效频谱
    bool is_acceptable = (m_rawMDF >= 15.0f && m_rawMDF < 20.0f);  // 15-20Hz为过渡区

    if (is_physiological || is_acceptable) {
        m_consecutivePhysioFrames++;
        // ========== MDF EMA α 取值依据 ==========
        // 参考文献:
        // [1] De Luca CJ. The use of surface electromyography in biomechanics.
        //     J Applied Biomechanics, 1997, 13(2):135-163.
        //     → 确立 MDF 为肌肉疲劳评估金标准；推荐使用 0.5-2s 窗口进行频谱估计
        // [2] Merletti R, Knaflitz M, De Luca CJ. Myoelectric manifestations of
        //     fatigue in voluntary and electrically elicited contractions.
        //     J Applied Physiology, 1990, 69(5):1810-1820.
        //     → 证实疲劳过程中 MDF 呈单调下降趋势，下降速率与收缩强度相关
        // [3] Merletti R, Parker PA. Electromyography: Physiology, Engineering,
        //     and Non-Invasive Applications. IEEE Press/Wiley, 2004.
        //     → Ch.9: 频谱估计中 EMA 为实时嵌入式系统的推荐平滑方法
        //
        // α 选择策略：
        // - 收缩期/MDF下降期 α=0.35: 文献[2]表明 MDF 在疲劳时可快速下降
        //   10-30%，需要较大 α 快速跟踪变化，等效时间常数 ≈3帧(150ms)
        // - 稳态期 α=0.15: 对应 0.5-2s 平滑窗口[1]，抑制逐帧波动
        // - 启动过渡(0.5→0.15): 前10帧从快速收敛过渡到稳态平滑，
        //   避免初始值偏差导致的长时间收敛等待
        // ===========================================
        float alpha;
// 收缩状态时使用更高alpha，更快跟踪频谱变化
        if (m_isContracting) {
            alpha = 0.35f;  // 收缩时需要更快响应，避免EMA滞后
        } else if (m_rawMDF < m_lastValidMDF && m_isMdfValid) {
            alpha = 0.35f;  // MDF下降时较快跟踪（疲劳趋势）
        } else {
            if (m_consecutivePhysioFrames >= 10) {
                alpha = 0.15f;  // 稳态下慢速平滑
            } else {
                alpha = 0.5f - 0.35f * (m_consecutivePhysioFrames / 10.0f);
            }
        }
        if (m_isMdfValid && m_lastValidMDF > 0.0f) {
            m_currentMDF = m_lastValidMDF * (1.0f - alpha) + m_rawMDF * alpha;
        } else {
            m_currentMDF = m_rawMDF;
        }
        m_lastValidMDF = m_currentMDF;
        m_isMdfValid = true;
#ifdef MDF_DBG_ENABLED
        LOG("[MDF_DBG] EMA OK: rawMDF=%.2f alpha=%.2f -> m_currentMDF=%.2f",
            (double)m_rawMDF, (double)alpha, (double)m_currentMDF);
#endif
    } else {
        // rawMDF超出[8,250]Hz范围，视为异常
        m_consecutivePhysioFrames = 0;
        if (m_lastValidMDF > 0.0f) {
            m_currentMDF = m_lastValidMDF;
            m_isMdfValid = false;
        } else {
            m_currentMDF = 0.0f;
            m_isMdfValid = false;
        }
    }
    return m_currentMDF;
}

// ==================== 信号质量评估 ====================
void SignalProcessor::evaluateSignalQuality(float rms, float mdf) {
    // 电极开路/未佩戴：输出立即冻结（第1帧疑似即生效），质量分直接置极低
    // 设计说明：稳态标志 m_signalInvalid 需连续3帧才确认，但输出冻结无需等确认
    //   ——确认前的300ms窗口内如果闪出虚假高疲劳度，用户体验会很差。
    //   所以这里用 m_invalidFrames>0（第1帧疑似）就冻结输出，宁可短暂误报
    //   "未佩戴"也绝不让虚假100%疲劳跳出来。
    if (m_signalInvalid || m_invalidFrames > 0) {
        m_signalQuality = 3.0f;
        return;
    }

    float quality_score = 0.0f;
    
    // RMS quality: based on calibrated thresholds
    // For contracted state: good signal if RMS between relax and active levels
    // For relaxed state: good signal if RMS near relax level
    if (m_isContracting) {
        if (m_isCalibrated && m_activeRMS_mV > m_relaxRMS_mV) {
            // Relative thresholds: between 2x relax and active levels
            float minActiveRms = m_relaxRMS_mV * 2.0f;
            float maxActiveRms = m_activeRMS_mV * 1.5f;
            if (rms >= minActiveRms && rms <= maxActiveRms) {
                quality_score += 35.0f;
            } else if (rms > minActiveRms * 0.5f) {
                quality_score += 15.0f;
            }
        } else {
            // Fallback: uncalibrated, use absolute thresholds
            if (rms > 0.1f && rms < 5.0f) {
                quality_score += 35.0f;
            } else if (rms > 0.01f) {
                quality_score += 15.0f;
            }
        }
    } else {
        if (m_isCalibrated) {
            // Relaxed: good if RMS < 2x relax baseline
            if (rms < m_relaxRMS_mV * 2.0f) {
                quality_score += 35.0f;
            } else if (rms < m_relaxRMS_mV * 5.0f) {
                quality_score += 15.0f;
            }
        } else {
            // Fallback: uncalibrated, use absolute threshold
            if (rms < 0.5f) {
                quality_score += 35.0f;
            }
        }
    }

    if (m_isMdfValid) {
        quality_score += 35.0f;
    } else {
        quality_score += 15.0f;
    }

    // Continuity score: EMA of MDF validity ratio (replaces hard-reset sliding window)
    // α=0.05 → time constant ~20 frames (~2s @10Hz), no periodic jump artifacts
    float validSample = m_isMdfValid ? 1.0f : 0.0f;
    m_qualityContinuityEma = m_qualityContinuityEma * 0.95f + validSample * 0.05f;
    float continuity = m_qualityContinuityEma;

    quality_score += 30.0f * continuity;
    m_signalQuality = constrain(quality_score, 0.0f, 100.0f);
}

// ==================== 疲劳度 ====================
void SignalProcessor::updateFatigue(float rms, float mdf) {
    if (mdf <= 0.0f) {
        m_fatigue = 0.0f; m_activation = 0.0f; m_isContracting = false;
        m_contractConfident = false; m_contractDebounce = 0; m_contractExitCnt = 0;
        return;
    }

    // ===== 电极开路/未佩戴：冻结疲劳度，不显示虚假 100% =====
    // 开路时 RMS 暴涨(工频干扰) + MDF 锁在 ~50Hz，会被误判为"最大收缩"
    // 导致疲劳度公式越界截断成 100%。此处直接冻结：保持上次有效值，
    // 不清零也不更新；收缩/激活清零（当前无有效肌电活动）
    // 设计说明：稳态标志 m_signalInvalid 需连续3帧才确认，但输出冻结从第1帧疑似即生效
    //   ——确认前的300ms窗口如果闪出虚假高疲劳度，用户体验会很差。
    //   所以用 m_invalidFrames>0（第1帧疑似）就冻结，宁可短暂误报"未佩戴"
    //   也绝不让虚假100%疲劳跳出来。
    if (m_signalInvalid || m_invalidFrames > 0) {
        m_isContracting = false;
        m_contractConfident = false; m_contractDebounce = 0; m_contractExitCnt = 0;
        m_activation = 0.0f;
        if (m_fatigue > 100.0f) m_fatigue = 100.0f;
        if (m_fatigue < 0.0f) m_fatigue = 0.0f;
        return;
    }

    // Activation: A% = (RMS - relax_rms) / (active_rms - relax_rms) * 100
    // 输出 0-100%，与 fatigue 设计规则统一
    if (m_activeRMS_mV > m_relaxRMS_mV) {
        m_activation = ((rms - m_relaxRMS_mV) / (m_activeRMS_mV - m_relaxRMS_mV)) * 100.0f;
        m_activation = constrain(m_activation, 0.0f, 100.0f);
    } else {
        m_activation = 0.0f;
    }

    // Contraction detection: RMS > 2x relax_rms AND RMS > active_rms × 0.3
    // Dual threshold: relative (2x baseline) + relative-to-max (30% of active_rms)
    // Removed MDF condition to prevent "fatigue ceiling" effect - at extreme fatigue,
    // MDF may drop close to relaxMDF, causing contraction detection to fail
    float activeThreshold = m_activeRMS_mV * 0.3f;  // 30% of max contraction as floor
    float absThreshold = max(activeThreshold, 10.0f);  // Minimum 10mV for noise rejection
    bool rawContract = (rms > m_relaxRMS_mV * 2.0f) && (rms > absThreshold);

    // ===== 收缩状态去抖（Phase 3 收缩门控）=====
    // 问题：放松瞬间 MDF 残余偏高 + 阈值边界帧偶发 rawContract=true，会被误判为收缩
    //       并用 MDF 公式算出偏高的 f_raw，导致疲劳虚高（静息假疲劳）。
    // 修复：进入收缩态需连续 2 帧 rawContract 确认；退出需连续 5 帧非收缩确认。
    //       去抖后的稳定态 m_contractConfident 才驱动疲劳的 MDF 计算；
    //       非收缩态绝不读 MDF（只走恢复衰减），消除静息假疲劳。
    if (rawContract) {
        m_contractDebounce++;
        m_contractExitCnt = 0;
        if (m_contractDebounce >= 2) m_contractConfident = true;
    } else {
        m_contractDebounce = 0;
        m_contractExitCnt++;
        if (m_contractExitCnt >= 5) m_contractConfident = false;
    }
    m_isContracting = m_contractConfident;

    // RMS trend EMA for force-change confound detection
    // Phinyomark et al. (2012): MDF changes with contraction force level,
    // confounding fatigue assessment. Track RMS trend to detect force changes.
    // Progressive cold start: average first 3 frames, then switch to EMA
    if (m_rmsTrendEma < 0.01f) {
        m_rmsColdStartSum += rms;
        m_rmsColdStartCnt++;
        if (m_rmsColdStartCnt >= 3) {
            m_rmsTrendEma = m_rmsColdStartSum / m_rmsColdStartCnt;
            m_rmsColdStartCnt = 0;
            m_rmsColdStartSum = 0.0f;
        }
    } else {
        m_rmsTrendEma = m_rmsTrendEma * 0.97f + rms * 0.03f;  // ~3.3s τ @10Hz
    }

    // Fatigue: anchor formula using calibration reference points
    //   F = (activeMDF - currentMDF) / (activeMDF - endMDF) × 100%
    //   0% = fresh contraction, 100% = fatigued to personal end_mdf (calibrated fatigue floor)
    //   end_mdf 无效时回退 relaxMDF（见 _recomputeMdfRange）
    float f_raw = 0.0f;
    if (m_isContracting && m_mdfRange > 5.0f) {
        // 在线最大用力锚点修正（Phase 2）：仅当肌肉尚新鲜（当前疲劳度低）时，
        // 才把观测到的更高峰值采纳为"真实最大收缩"，修正校准用力不足。
        // 用"疲劳度<阈值"替代原"校准后30s"窗口：疲劳上来后 MDF 下降，
        // 此时观测峰值偏低，若采纳会把锚点改低、越改越错，故仅在新鲜态更新。
        if (m_fatigue < 25.0f) {
            // MDF 超过校准峰值 → 慢抬 activeMDF（钳上限 400Hz）
            if (mdf > m_activeMDF_hz && mdf > m_relaxMDF_hz + 10.0f) {
                m_activeMDF_hz += (mdf - m_activeMDF_hz) * 0.05f;
                if (m_activeMDF_hz > 400.0f) m_activeMDF_hz = 400.0f;
                _recomputeMdfRange();
            }
            // RMS 超过校准峰值 → 慢抬 activeRMS（约束在 calib 参考 0.8~1.5 倍内）
            if (rms > m_activeRMS_mV * 1.05f) {
                float newActive = m_activeRMS_mV * 0.95f + rms * 0.05f;
                newActive = constrain(newActive, m_calibActiveRMS_mV * 0.8f, m_calibActiveRMS_mV * 1.5f);
                m_activeRMS_mV = newActive;
            }
        }
        f_raw = (m_activeMDF_hz - mdf) / m_mdfRange * 100.0f;
        f_raw = constrain(f_raw, 0.0f, 100.0f);

        // Force-stability cross-validation
        // When RMS deviates from recent trend (force changing), reduce
        // confidence in fatigue estimate to mitigate force-confound.
        // Phinyomark (2012): MDF-force relationship is subject-dependent
        // (CF1/CF2/CF3), so we reduce confidence for ANY rapid force change.
        float forceStability = 1.0f;
        if (m_rmsTrendEma > 1.0f) {
            float ratio = rms / m_rmsTrendEma;
            float deviation = fabs(ratio - 1.0f);  // 0=stable
            if (deviation > 0.15f) {
                // RMS deviating >15% → force is changing
                // Scale: 0.15→1.0, 0.50→0.3 (floor at 30% confidence)
                forceStability = 1.0f - constrain((deviation - 0.15f) / 0.35f, 0.0f, 0.7f);
            }
        }
        f_raw *= forceStability;
    }

    // ===== 静息基线在线自校正（Phase 1）=====
    // 确认处于真实静息态（非收缩、接近/低于当前 relax 基线、RMS 稳定）持续若干秒后，
    // 用极慢 EMA 把 relax_rms/relax_mdf 拉向观测静息值，自校正校准误差。
    // 安全约束：以 calib 参考的 0.6~1.4 倍为硬边界，绝不在收缩期更新，
    // 避免基线漂移导致疲劳/激活失真（保留固定 calib_* 作安全锚）。
    if (!m_isContracting) {
        bool stable = (m_rmsTrendEma > 0.01f) &&
                      (fabs(rms - m_rmsTrendEma) < m_relaxRMS_mV * 0.15f);
        if (rms < m_relaxRMS_mV * 1.2f && stable) {
            m_restFrames++;
            const uint32_t REST_ADAPT_FRAMES = 50;  // ~5s @10Hz
            if (m_restFrames >= REST_ADAPT_FRAMES) {
                const float a = 0.02f;  // 极慢 EMA
                float newRelaxRms = m_relaxRMS_mV * (1.0f - a) + rms * a;
                float newRelaxMdf = m_relaxMDF_hz * (1.0f - a) + mdf * a;
                newRelaxRms = constrain(newRelaxRms, m_calibRelaxRMS_mV * 0.6f, m_calibRelaxRMS_mV * 1.4f);
                newRelaxMdf = constrain(newRelaxMdf, m_calibRelaxMDF_hz * 0.6f, m_calibRelaxMDF_hz * 1.4f);
                m_relaxRMS_mV = newRelaxRms;
                m_relaxMDF_hz = newRelaxMdf;
                m_restFrames = 0;  // 收敛一步后重新计数，避免连续累积
            }
        } else {
            m_restFrames = 0;
        }
    }
    // ========== Fatigue Formula ==========
    // 疲劳指数: FI = (activeMDF - currentMDF) / (activeMDF - relaxMDF) × 100%
    // 利用校准阶段已知的 activeMDF(峰值) 和 relaxMDF(静息) 作为锚点，
    // 避免监测阶段动态基线捕获时机过早导致的负值问题。
    //
    // 参考文献:
    // [4] Cifrek M, Medved V, Tonković S, Ostojić S. Surface EMG based
    //     muscle fatigue evaluation in biomechanics.
    //     Clinical Biomechanics, 2009, 24(4):327-340.
    //     → 归一化MDF下降率为标准疲劳指数
    // [5] González-Izal M, Malanda A, Gorostiaga E, Izquierdo M.
    //     Electromyographic models to assess muscle fatigue.
    //     J Electromyography and Kinesiology, 2012, 22(4):501-512.
    //     → 验证MDF下降率与主观疲劳量表(Borg)呈显著相关(r>0.7)
    //
    // α=0.3 选择依据:
    // - Phinyomark 2012: 实时疲劳监测推荐α=0.2-0.4以平衡响应速度和稳定性[7]
    // - De Luca 1997: 频谱参数EMA时间常数建议0.5-2s，α=0.3对应约0.33s
    // - α=0.3 对应时间常数≈3帧(0.33s)，既快速响应真实变化，又抑制逐帧抖动
    // - 当MDF超过activeMDF时f_raw限制为0，避免生理上不合理的负值(Cifrek 2009)[4]
    //
    // ========== Recovery Model ==========
    // During relaxation, fatigue recovers exponentially based on:
    // Elfving B, et al. Recovery of electromyographic median frequency
    // after lumbar muscle fatigue. Eur J Appl Physiol, 2002, 88:85-93.
    //   → MDF recovery half-life ≈ 35s (r²=0.98, n=55)
    //
    // At 10Hz update rate, per-frame decay factor:
    //   factor = 2^(-Δt / half_life) = 2^(-0.1/35) ≈ 0.998
    // More physiologically accurate than pure Hold (never recovers) or
    // fast decay α=0.1 (recovers in 3s, loses real fatigue state).
    // [Phase 2] 该 factor 已改为个人化学习值 m_recoveryFactor（默认0.998，
    //   钳制在半衰期20~60s对应区间 0.9965~0.9989），从放松期实测衰减率 EMA 估计。
    // ==========================================
    if (m_isContracting) {
        if (f_raw < 0.0f) f_raw = 0.0f;
        m_fatigue = m_fatigue * 0.7f + f_raw * 0.3f;
    } else {
        // 个人恢复半衰期（Phase 2）：用学习到的 recoveryFactor 替代固定 0.998。
        // 在放松期根据观测衰减率估计个人恢复速度，钳制在半衰期 20~60s 对应因子区间。
        float fatigueBefore = m_fatigue;
        m_fatigue *= m_recoveryFactor;
        if (fatigueBefore > 1.0f && m_fatigue > 0.5f) {
            float obs = m_fatigue / fatigueBefore;  // <1，本帧实际衰减比
            // 半衰期20s→2^(-0.1/20)=0.99653；60s→2^(-0.1/60)=0.99884
            m_recoveryFactor = constrain(m_recoveryFactor * 0.9f + obs * 0.1f,
                                         0.9965f, 0.9989f);
        }
    }
    if (m_fatigue < 0.0f) m_fatigue = 0.0f;
    if (m_fatigue > 100.0f) m_fatigue = 100.0f;

    // static uint32_t fatigue_log_cnt = 0;
    // if (++fatigue_log_cnt >= 600) {
    //     fatigue_log_cnt = 0;
    //     LOG("[SIG] Fatigue: mdf=%.1f, f_raw=%.1f, f_ema=%.1f, act=%.0f\n",
    //         mdf, f_raw, m_fatigue, activation);
    // }
}

// ==================== 对外接口 ====================
float SignalProcessor::update() {
    if (m_availableSamples < m_fftWindowSize) return 0.0f;
    m_snapshotValid = false;

    float rms = calculateRMS();
    if (rms <= 0.0f) return 0.0f;

    // 更新当前实时值（用于简化校准）
    // rms is already in mV from calculateRMS()
    m_currentRMS = rms;

    float mdf = calculateMDF();

    // ===== 电极开路/未佩戴检测（基于工频总能量，带滞回）=====
    // 修复根因：原逻辑用 MDF 中位数∈[40,60]Hz 判开路，但弱信号下 50Hz 干扰主导
    //   频谱，开路与佩戴静息的 MDF 都≈50Hz，导致佩戴时只要 rms>30 就误报"未佩戴"。
    // 现改为直接度量被陷波移除的工频总能量（m_mainsRms，单位 mV，50Hz+60Hz 合并）：
    //   开路——电极悬空，工频共模干扰极强（RMS≈800-1340mV，实测）；
    //   佩戴——强 50Hz 环境下 CMRR 抑制有限，工频能量仍可达 ~130-600mV（实测）。
    //   两者实测区间存在 ~600-800mV 干净间隙，用双阈值滞回区分（见下）。
    // 注意：m_mainsRms 由 ISR 实时计算，此处直接读取（volatile 保证可见性）
    // 双阈值滞回：进入开路用 MAINS_OPEN_ENTER_MV(700)，退出用 MAINS_OPEN_EXIT_MV(400)，
    //            中间带(400-700mV)维持原状态防临界抖动；输出冻结从第 1 帧疑似即生效。
    float mainsRms = m_mainsRms;  // 读一次 volatile，避免多次重读
    // 双阈值滞回：进入开路用较高阈值(700mV)，退出用较低阈值(400mV)，
    // 中间带(400~700mV)维持原状态，避免临界区抖动。
    bool mainsOpen = (mainsRms > MAINS_OPEN_ENTER_MV);
    bool mainsClosed = (mainsRms < MAINS_OPEN_EXIT_MV);
    if (mainsOpen) {
        // 进入开路：工频能量持续超进入阈，连续 3 帧确认稳态标志
        m_invalidFrames++;
        m_validFrames = 0;
        if (m_invalidFrames >= 3) m_signalInvalid = true;
    } else if (mainsClosed) {
        // 退出开路：工频能量持续低于退出阈，连续 5 帧确认后才清除稳态标志
        m_invalidFrames = 0;
        m_validFrames++;
        if (m_validFrames >= 5) m_signalInvalid = false;
    }
    // else: 处于滞回带(EXIT<=rms<=ENTER)，维持现状，不增不减

    evaluateSignalQuality(rms, mdf);
    updateFatigue(rms, mdf);

    return rms;
}

void SignalProcessor::setCalibration(float relaxRMS_mV, float activeRMS_mV,
                                      float relaxMDF_hz, float activeMDF_hz, float endMDF_hz) {
    m_relaxRMS_mV = relaxRMS_mV;
    m_activeRMS_mV = activeRMS_mV;
    m_relaxMDF_hz = relaxMDF_hz;
    m_activeMDF_hz = activeMDF_hz;
    m_endMDF_hz = endMDF_hz;
    // 保存不可在线改写的原始校准参考，作为在线学习的安全边界
    m_calibRelaxRMS_mV = relaxRMS_mV;
    m_calibActiveRMS_mV = activeRMS_mV;
    m_calibRelaxMDF_hz = relaxMDF_hz;
    m_calibActiveMDF_hz = activeMDF_hz;
    m_calibEndMDF_hz = endMDF_hz;
    _recomputeMdfRange();
    m_calibTimestampMs = millis();  // 记录校准时间，用于动态锚点更新窗口限制
    m_isCalibrated = true;
    LOG("[SIG] Calibration set: relax_rms=%.3f active_rms=%.3f relax_mdf=%.1f active_mdf=%.1f end_mdf=%.1f\n",
        relaxRMS_mV, activeRMS_mV, relaxMDF_hz, activeMDF_hz, endMDF_hz);
}

// 依个人疲劳下限锚点计算疲劳公式分母范围。
// 优先用 end_mdf（校准用力阶段末真实疲劳 MDF）作 100% 锚点，使疲劳更个人化、不再被低估；
// 仅在 end_mdf 无效（未采集 / 与 active 过于接近，说明校准未真正疲劳）时回退到 relax_mdf。
// end_mdf 通常高于 relax_mdf（收缩期 MDF 高于静息）；若异常 end_mdf<relax_mdf 则取较高者，
// 避免疲劳灵敏度反而下降（不改变原行为）。
void SignalProcessor::_recomputeMdfRange() {
    float floor = m_relaxMDF_hz;  // 安全默认：沿用原公式（疲劳跌到静息值=100%）
    if (m_endMDF_hz > 1.0f && m_endMDF_hz < m_activeMDF_hz - 5.0f) {
        floor = (m_endMDF_hz > m_relaxMDF_hz) ? m_endMDF_hz : m_relaxMDF_hz;
    }
    m_mdfRange = m_activeMDF_hz - floor;
    if (m_mdfRange < 5.0f) m_mdfRange = 5.0f;  // 防止分母过小导致疲劳越界
}

void SignalProcessor::clearCalibration() {
    m_isCalibrated = false;
    m_fatigue = 0.0f;
    m_activation = 0.0f;
    m_isContracting = false;
    m_contractConfident = false;
    m_contractDebounce = 0;
    m_contractExitCnt = 0;
    m_signalInvalid = false;
    m_invalidFrames = 0;
    m_validFrames = 0;
    m_mainsPowerEma = 0.0f; m_mainsRms = 0.0f;
    m_mdfRange = 0.0f;  // 重置预计算的MDF范围
    m_endMDF_hz = 0.0f;
    m_calibRelaxRMS_mV = 0.0f; m_calibActiveRMS_mV = 0.0f;
    m_calibRelaxMDF_hz = 0.0f; m_calibActiveMDF_hz = 0.0f; m_calibEndMDF_hz = 0.0f;
    m_restFrames = 0;
    m_recoveryFactor = 0.998f;
    m_calibTimestampMs = 0;
    m_lastValidMDF = 0.0f;
    m_isMdfValid = false;
    m_consecutivePhysioFrames = 0;
    m_rmsTrendEma = 0.0f;
    m_rmsColdStartCnt = 0;
    m_rmsColdStartSum = 0.0f;
}

// 简化校准：获取当前实时RMS
float SignalProcessor::getCurrentRms() const {
    // 返回最近计算的RMS值（m_currentRMS由update()更新）
    // 注意：这是线程安全的近似值，精确值需要调用update()后获取
    return m_currentRMS;
}

// 简化校准：获取当前实时MDF
float SignalProcessor::getCurrentMdf() const {
    return m_currentMDF;
}

// 简化校准：设置放松基线
void SignalProcessor::setRelaxBaseline(float relaxRms, float relaxMdf) {
    m_relaxRMS_mV = relaxRms;
    m_relaxMDF_hz = relaxMdf;
    LOG("[SIG] Relax baseline set: rms=%.3f, mdf=%.1f\n", relaxRms, relaxMdf);
}

// 简化校准：设置收缩阶段参考
void SignalProcessor::setActiveReference(float activeRms) {
    m_activeRMS_mV = activeRms;
    LOG("[SIG] Active reference set: rms=%.3f\n", activeRms);
}

// 校准MDF缓冲区：记录校准阶段MDF值
void SignalProcessor::recordCalibMdf(float mdf_hz) {
    if (m_calibMdfCount < CALIB_MDF_BUF_SIZE) {
        m_calibMdfBuffer[m_calibMdfCount++] = mdf_hz;
    } else {
        // 缓冲区满，覆盖旧值（环形缓冲区）
        for (uint16_t i = 1; i < CALIB_MDF_BUF_SIZE; i++) {
            m_calibMdfBuffer[i-1] = m_calibMdfBuffer[i];
        }
        m_calibMdfBuffer[CALIB_MDF_BUF_SIZE - 1] = mdf_hz;
    }
    SP_LOG_FULL("recordCalibMdf: count=%d, mdf=%.1f\n", m_calibMdfCount, mdf_hz);
}

// 校准MDF缓冲区：计算峰值和末尾值
void SignalProcessor::finalizeCalibMdf() {
    if (m_calibMdfCount == 0) {
        m_calibMdfPeak = 0.0f;
        m_calibMdfEnd = 0.0f;
        LOG("[SIG] finalizeCalibMdf: buffer empty\n");
        return;
    }
    
    // 计算峰值MDF — 跳过前2秒（20帧@10Hz）的瞬态期数据
    // 收缩刚开始时信号未稳定，FFT易产生高频伪峰（如150+Hz噪声尖峰）
    // 跳过瞬态期后取峰值，消除噪声尖峰对锚点的污染
    uint16_t transientSkip = 20;  // 2秒 @ 10Hz
    if (m_calibMdfCount <= transientSkip) {
        transientSkip = 0;  // 数据不足时不禁用跳过
    }
    m_calibMdfPeak = m_calibMdfBuffer[transientSkip];
    for (uint16_t i = transientSkip + 1; i < m_calibMdfCount; i++) {
        if (m_calibMdfBuffer[i] > m_calibMdfPeak) {
            m_calibMdfPeak = m_calibMdfBuffer[i];
        }
    }
    
    // 计算末尾MDF（最后5点去极值均值）
    int startIdx = max(0, (int)m_calibMdfCount - 5);
    int numPoints = m_calibMdfCount - startIdx;
    
    if (numPoints >= 3) {
        // 去极值均值：去掉最小和最大值，剩下的取平均
        float minVal = m_calibMdfBuffer[startIdx];
        float maxVal = m_calibMdfBuffer[startIdx];
        float sum = m_calibMdfBuffer[startIdx];
        
        for (int i = 1; i < numPoints; i++) {
            float val = m_calibMdfBuffer[startIdx + i];
            sum += val;
            if (val < minVal) minVal = val;
            if (val > maxVal) maxVal = val;
        }
        
        m_calibMdfEnd = (sum - minVal - maxVal) / (numPoints - 2);
    } else {
        // 点数不足，用简单平均
        float sum = 0.0f;
        for (int i = 0; i < numPoints; i++) {
            sum += m_calibMdfBuffer[startIdx + i];
        }
        m_calibMdfEnd = sum / numPoints;
    }
    
    LOG("[SIG] finalizeCalibMdf: peak=%.1f, end=%.1f\n", m_calibMdfPeak, m_calibMdfEnd);
}

// 重置校准MDF缓冲区
void SignalProcessor::resetCalibMdfBuffer() {
    m_calibMdfCount = 0;
    m_calibMdfPeak = 0.0f;
    m_calibMdfEnd = 0.0f;
    LOG("[SIG] Calib MDF buffer reset\n");
}

// 校准阶段切换时重置EMA状态
// REST→MAX切换时频谱形态巨变，EMA残值会严重滞后
void SignalProcessor::resetEMA() {
    m_isMdfValid = false;
    m_lastValidMDF = 0.0f;  // 80.0f→0.0f：防止findMedianFrequency fallback自引用锁死
    m_consecutivePhysioFrames = 0;
    m_currentMDF = 0.0f;
    m_rmsTrendEma = 0.0f;
    m_rmsColdStartCnt = 0;
    m_rmsColdStartSum = 0.0f;
}

float SignalProcessor::getMDF() const { return m_currentMDF; }
float SignalProcessor::getFatigue() const { return m_fatigue; }
float SignalProcessor::getSignalQuality() const { return m_signalQuality; }
float SignalProcessor::getActivation() const { return m_activation; }
bool SignalProcessor::isContracting() const { return m_isContracting; }

void SignalProcessor::setFFTWindowSize(uint16_t size) {
    if (size < 64) size = 64;
    if (size > MAX_FFT_SIZE) size = MAX_FFT_SIZE;
    uint16_t pot = 64;
    while (pot < size && pot < MAX_FFT_SIZE) pot <<= 1;
    m_fftWindowSize = pot;
    m_fftTwiddleInitialized = false;
    initializeFFTTwiddles();
}

void SignalProcessor::setMDFFrequencyRange(float min_freq, float max_freq) {
    m_mdfMinFreq = constrain(min_freq, 0.0f, 250.0f);
    m_mdfMaxFreq = constrain(max_freq, m_mdfMinFreq + 1.0f, 250.0f);
}


