/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState, useRef, useMemo, useCallback, memo } from 'react';
import { ref, onValue, set, off } from 'firebase/database';
import { db } from './lib/firebase';
import { rules } from './constants/rules';
import {
  getVibrationSymbol,
  getNoiseSymbol,
  getTemperatureSymbol,
  getRPMSymbol,
  diagnose,
} from './utils/expertSystem';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  type ChartOptions,
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import { Activity, Thermometer, Volume2, Zap, Download, Settings } from 'lucide-react';
import { motion } from 'motion/react';
import html2pdf from 'html2pdf.js';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend);

// ─── Types ────────────────────────────────────────────────────────────────────

interface SensorData {
  RPM: number;
  SLM: number;
  SUHU: number;
  VIBRASI: number;
}

interface AppData {
  kW: number;
  KELAS: number;
  RPM: number;
}

interface ButtonState {
  RECORD: string;
  SAVE: string;
  CLEAR: string;
}

interface HistoryEntry {
  label: string;
  data: SensorData;
}

// ─── Chart placeholder when history is empty ──────────────────────────────────
// Shows a flat "waiting" line so the chart area is never blank

function makePlaceholderChart(color: string) {
  const labels = Array.from({ length: 20 }, (_, i) => `${i + 1}s`);
  return {
    labels,
    datasets: [
      {
        data: Array(20).fill(0),
        borderColor: color + '33',
        backgroundColor: 'transparent',
        fill: false,
        tension: 0,
        pointRadius: 0,
        borderWidth: 1,
        borderDash: [4, 4],
      },
    ],
  };
}

const PLACEHOLDER_RPM  = makePlaceholderChart('#3b82f6');
const PLACEHOLDER_SLM  = makePlaceholderChart('#a855f7');
const PLACEHOLDER_VIB  = makePlaceholderChart('#10b981');
const PLACEHOLDER_TEMP = makePlaceholderChart('#f97316');

// ─── Shared chart options (static, defined once) ──────────────────────────────

const baseChartOptions: ChartOptions<'line'> = {
  responsive: true,
  maintainAspectRatio: false,
  scales: {
    y: {
      beginAtZero: true,
      grid: { color: 'rgba(255,255,255,0.07)' },
      ticks: { color: '#64748b', maxTicksLimit: 4, font: { size: 10 } },
    },
    x: {
      grid: { display: false },
      ticks: { color: '#64748b', maxTicksLimit: 8, font: { size: 10 } },
    },
  },
  plugins: { legend: { display: false } },
  animation: { duration: 0 },
  elements: { point: { radius: 0 } },
};

// ─── MotorLogo ────────────────────────────────────────────────────────────────

const MotorLogo = memo(function MotorLogo() {
  return (
    <svg viewBox="0 0 100 100" className="w-10 h-10 text-[#60a5fa] fill-current">
      <path d="M20,40 L80,40 L80,70 L20,70 Z" fill="none" stroke="currentColor" strokeWidth="4" />
      <circle cx="50" cy="55" r="15" fill="none" stroke="currentColor" strokeWidth="4" />
      <line x1="10" y1="55" x2="20" y2="55" stroke="currentColor" strokeWidth="4" />
      <line x1="80" y1="55" x2="90" y2="55" stroke="currentColor" strokeWidth="4" />
      <rect x="35" y="30" width="30" height="10" fill="currentColor" />
      <path d="M30,70 L30,80 M70,70 L70,80" stroke="currentColor" strokeWidth="4" />
      <circle cx="50" cy="55" r="5" fill="currentColor" />
    </svg>
  );
});

// ─── GaugeCard ────────────────────────────────────────────────────────────────

interface GaugeCardProps {
  icon: React.ReactNode;
  label: string;
  value: number;
  avg: number;
  unit: string;
  color: 'blue' | 'purple' | 'emerald' | 'orange';
  max: number;
}

const colorMap: Record<GaugeCardProps['color'], { card: string; bar: string }> = {
  blue:    { card: 'text-[#60a5fa] border-[#3b82f633] bg-[#3b82f60d]', bar: 'bg-[#60a5fa]' },
  purple:  { card: 'text-[#c084fc] border-[#a855f733] bg-[#a855f70d]', bar: 'bg-[#c084fc]' },
  emerald: { card: 'text-[#34d399] border-[#10b98133] bg-[#10b9810d]', bar: 'bg-[#34d399]' },
  orange:  { card: 'text-[#fb923c] border-[#f9731633] bg-[#f973160d]', bar: 'bg-[#fb923c]' },
};

const GaugeCard = memo(function GaugeCard({ icon, label, value, avg, unit, color, max }: GaugeCardProps) {
  const progress = Math.min((value / max) * 100, 100);
  const { card, bar } = colorMap[color];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className={`p-3 sm:p-4 rounded-2xl border backdrop-blur-sm ${card}`}
    >
      <div className="flex items-center gap-2 mb-2 opacity-60">
        {icon}
        <span className="text-[10px] font-bold uppercase tracking-widest">{label}</span>
      </div>
      <div className="flex items-baseline gap-1 mb-1">
        <span className="text-xl sm:text-2xl font-mono font-bold text-white">{value.toFixed(1)}</span>
        <span className="text-xs opacity-60">{unit}</span>
      </div>
      <div className="flex items-center gap-1.5 mb-3 opacity-80">
        <div className="w-1.5 h-1.5 rounded-full bg-white/20" />
        <span className="text-[10px] font-mono">AVG: {avg.toFixed(1)} {unit}</span>
      </div>
      <div className="w-full h-1 bg-[#1e293b] rounded-full overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${progress}%` }}
          transition={{ duration: 0.4 }}
          className={`h-full ${bar}`}
        />
      </div>
    </motion.div>
  );
});

// ─── ChartCard ────────────────────────────────────────────────────────────────

interface ChartCardProps {
  title: string;
  children: React.ReactNode;
  color: string;
  isPlaceholder?: boolean;
}

const ChartCard = memo(function ChartCard({ title, children, color, isPlaceholder }: ChartCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="bg-[#0f172a] p-4 sm:p-6 rounded-2xl border border-[#1e293b] h-56 sm:h-64 flex flex-col"
    >
      <h3 className="text-xs font-bold text-[#64748b] uppercase tracking-widest mb-3 sm:mb-4 flex items-center gap-2 flex-shrink-0">
        <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
        <span className="truncate">{title}</span>
        {isPlaceholder && (
          <span className="ml-auto text-[9px] normal-case tracking-normal font-normal text-[#334155] flex-shrink-0">
            — waiting for record
          </span>
        )}
      </h3>
      <div className="flex-1 relative min-h-0">
        {children}
      </div>
    </motion.div>
  );
});

// ─── App ──────────────────────────────────────────────────────────────────────

export default function App() {
  const [sensorData, setSensorData] = useState<SensorData>({ RPM: 0, SLM: 0, SUHU: 0, VIBRASI: 0 });
  const [appData, setAppData]       = useState<AppData>({ kW: 0, KELAS: 1, RPM: 0 });
  const [buttons, setButtons]       = useState<ButtonState>({ RECORD: '0', SAVE: '0', CLEAR: '0' });
  const [history, setHistory]       = useState<HistoryEntry[]>([]);
  const [seconds, setSeconds]       = useState(0);
  const [averages, setAverages]     = useState<SensorData>({ RPM: 0, SLM: 0, SUHU: 0, VIBRASI: 0 });
  const [diagnosis, setDiagnosis]   = useState('Standby');

  const reportRef      = useRef<HTMLDivElement>(null);
  const recordInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const sensorDataRef  = useRef<SensorData>(sensorData);

  useEffect(() => { sensorDataRef.current = sensorData; }, [sensorData]);

  // ── Firebase Listeners ────────────────────────────────────────────────────
  useEffect(() => {
    const dataRef    = ref(db, 'DATA');
    const appDataRef = ref(db, 'DATAAPP');
    const buttonRef  = ref(db, 'BUTTON');

    onValue(dataRef,    (snap) => { if (snap.exists()) setSensorData(snap.val()); });
    onValue(appDataRef, (snap) => { if (snap.exists()) setAppData(snap.val()); });
    onValue(buttonRef,  (snap) => { if (snap.exists()) setButtons(snap.val()); });

    return () => { off(dataRef); off(appDataRef); off(buttonRef); };
  }, []);

  // ── Expert System ─────────────────────────────────────────────────────────
  const symbols = useMemo(() => ({
    rpm:   getRPMSymbol(sensorData.RPM, appData.RPM || 1),
    noise: getNoiseSymbol(sensorData.SLM, appData.kW),
    vib:   getVibrationSymbol(sensorData.VIBRASI, appData.kW),
    temp:  getTemperatureSymbol(sensorData.SUHU, appData.KELAS),
  }), [sensorData, appData]);

  useEffect(() => {
    const result = diagnose(symbols.rpm, symbols.noise, symbols.vib, symbols.temp, rules);
    setDiagnosis(result);
    set(ref(db, 'PAKAR/HASIL'), result);
  }, [symbols]);

  // ── PDF Export ────────────────────────────────────────────────────────────
  const handleExportPDF = useCallback(() => {
    if (!reportRef.current) return;
    const el = reportRef.current;

    // Temporarily move on-screen for html2canvas (far left = no layout shift)
    el.style.left       = '-9999px';
    el.style.top        = '0px';
    el.style.height     = 'auto';
    el.style.overflow   = 'visible';
    el.style.visibility = 'visible';
    el.style.opacity    = '1';

    html2pdf()
      .from(el)
      .set({
        margin: 5,
        filename: `Motor_QC_Report_${Date.now()}.pdf`,
        image: { type: 'jpeg' as const, quality: 1.0 },
        html2canvas: { scale: 3, useCORS: true, backgroundColor: '#020617', logging: false },
        jsPDF: { unit: 'mm' as const, format: 'a4' as const, orientation: 'portrait' as const },
      })
      .save()
      .then(() => {
        el.style.height     = '0';
        el.style.overflow   = 'hidden';
        el.style.visibility = 'hidden';
        el.style.opacity    = '0';
      });
  }, []);

  // ── Button Actions ────────────────────────────────────────────────────────
  useEffect(() => {
    if (buttons.RECORD === '1') {
      if (!recordInterval.current) {
        recordInterval.current = setInterval(() => {
          setSeconds((prevSec) => {
            const nextSec = prevSec + 1;
            const snap = { ...sensorDataRef.current };
            setHistory((prev) => {
              const next = [...prev, { label: `${nextSec}s`, data: snap }];
              const count = next.length;
              const totals = next.reduce(
                (acc, h) => ({
                  RPM:     acc.RPM     + h.data.RPM,
                  SLM:     acc.SLM     + h.data.SLM,
                  SUHU:    acc.SUHU    + h.data.SUHU,
                  VIBRASI: acc.VIBRASI + h.data.VIBRASI,
                }),
                { RPM: 0, SLM: 0, SUHU: 0, VIBRASI: 0 }
              );
              setAverages({
                RPM:     totals.RPM     / count,
                SLM:     totals.SLM     / count,
                SUHU:    totals.SUHU    / count,
                VIBRASI: totals.VIBRASI / count,
              });
              return next;
            });
            return nextSec;
          });
        }, 1000);
      }
    } else {
      if (recordInterval.current) {
        clearInterval(recordInterval.current);
        recordInterval.current = null;
      }
    }
  }, [buttons.RECORD]);

  useEffect(() => {
    if (buttons.SAVE === '1') { handleExportPDF(); set(ref(db, 'BUTTON/SAVE'), '0'); }
  }, [buttons.SAVE, handleExportPDF]);

  useEffect(() => {
    if (buttons.CLEAR === '1') {
      setHistory([]); setSeconds(0);
      setAverages({ RPM: 0, SLM: 0, SUHU: 0, VIBRASI: 0 });
      setDiagnosis('Standby');
      set(ref(db, 'BUTTON/CLEAR'), '0');
    }
  }, [buttons.CLEAR]);

  useEffect(() => () => { if (recordInterval.current) clearInterval(recordInterval.current); }, []);

  // ── Chart data (memoized, falls back to placeholder when empty) ───────────
  const createChartData = useCallback(
    (dataKey: keyof SensorData, color: string) => ({
      labels: history.map((h) => h.label),
      datasets: [{
        data:            history.map((h) => h.data[dataKey]),
        borderColor:     color,
        backgroundColor: color + '33',
        fill:            true,
        tension:         0.4,
        pointRadius:     0,
        borderWidth:     2,
      }],
    }),
    [history]
  );

  const hasHistory = history.length > 0;

  const rpmChartData  = useMemo(() => hasHistory ? createChartData('RPM',     '#3b82f6') : PLACEHOLDER_RPM,  [createChartData, hasHistory]);
  const slmChartData  = useMemo(() => hasHistory ? createChartData('SLM',     '#a855f7') : PLACEHOLDER_SLM,  [createChartData, hasHistory]);
  const vibChartData  = useMemo(() => hasHistory ? createChartData('VIBRASI', '#10b981') : PLACEHOLDER_VIB,  [createChartData, hasHistory]);
  const tempChartData = useMemo(() => hasHistory ? createChartData('SUHU',    '#f97316') : PLACEHOLDER_TEMP, [createChartData, hasHistory]);

  // ── Derived values ────────────────────────────────────────────────────────
  const insulationClass = useMemo(() => {
    const k = Number(appData.KELAS);
    return k === 1 ? 'A' : k === 2 ? 'B' : k === 3 ? 'E' : k === 4 ? 'F' : 'Unknown';
  }, [appData.KELAS]);

  const isLolos     = diagnosis === 'Lolos QC';
  const isRecording = buttons.RECORD === '1';

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <>
      {/* overflow-x-hidden prevents any hidden element from stretching the page */}
      <div className="min-h-screen w-full bg-[#020617] text-[#e2e8f0] font-sans overflow-x-hidden">
        <div className="max-w-7xl mx-auto px-3 py-4 sm:px-4 sm:py-6 md:px-8 md:py-8 space-y-4 sm:space-y-6 md:space-y-8">

          {/* ── Header ── */}
          <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-[#0f172a] p-4 sm:p-6 rounded-2xl border border-[#1e293b]">
            <div className="flex items-center gap-3 sm:gap-4 min-w-0">
              <div className="p-2 bg-[#3b82f61a] rounded-xl border border-[#3b82f633] flex-shrink-0">
                <MotorLogo />
              </div>
              <div className="min-w-0">
                <h1 className="text-base sm:text-2xl font-bold tracking-tight text-white leading-tight">
                  Smart Motor QC Expert System
                </h1>
                <p className="text-[#94a3b8] text-xs sm:text-sm">Industrial IoT Monitoring & Diagnosis</p>
              </div>
            </div>
            <div className="flex items-center gap-2 sm:gap-3 w-full sm:w-auto">
              <div className={`px-3 sm:px-4 py-2 rounded-full text-xs font-bold uppercase tracking-wider flex items-center gap-2 flex-1 sm:flex-none justify-center sm:justify-start ${
                isRecording
                  ? 'bg-[#ef44441a] text-[#f87171] border border-[#ef444433] animate-pulse'
                  : 'bg-[#1e293b] text-[#94a3b8] border border-[#334155]'
              }`}>
                <div className={`w-2 h-2 rounded-full flex-shrink-0 ${isRecording ? 'bg-[#f87171]' : 'bg-[#64748b]'}`} />
                {isRecording ? `Recording — ${seconds}s` : 'Standby'}
              </div>
              <button
                onClick={handleExportPDF}
                className="p-2 bg-[#1e293b] hover:bg-[#334155] active:scale-95 rounded-lg transition-all border border-[#334155] flex-shrink-0"
                title="Export PDF"
              >
                <Download className="w-5 h-5" />
              </button>
            </div>
          </header>

          {/* ── Main Grid — DESKTOP: left col (1/4) + right col (3/4) ── */}
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 sm:gap-6">

            {/* ── LEFT COLUMN ── */}
            <div className="lg:col-span-1 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-4 sm:gap-6">

              {/* Motor Configuration */}
              <section className="bg-[#0f172a] p-4 sm:p-6 rounded-2xl border border-[#1e293b]">
                <h2 className="text-xs font-bold text-[#94a3b8] uppercase tracking-widest mb-4 flex items-center gap-2">
                  <Settings className="w-4 h-4 flex-shrink-0" /> Motor Configuration
                </h2>
                <div className="space-y-3">
                  <div className="p-3 bg-[#020617] rounded-xl border border-[#1e293b]">
                    <span className="text-xs text-[#64748b] block mb-1">Power (kW)</span>
                    <span className="text-lg font-mono text-[#60a5fa]">{appData.kW} kW</span>
                  </div>
                  <div className="p-3 bg-[#020617] rounded-xl border border-[#1e293b]">
                    <span className="text-xs text-[#64748b] block mb-1">Insulation Class</span>
                    <span className="text-lg font-mono text-[#c084fc]">Class {insulationClass}</span>
                  </div>
                  <div className="p-3 bg-[#020617] rounded-xl border border-[#1e293b]">
                    <span className="text-xs text-[#64748b] block mb-1">Nameplate RPM</span>
                    <span className="text-lg font-mono text-[#34d399]">{appData.RPM} RPM</span>
                  </div>
                </div>
              </section>

              {/* Expert Diagnosis */}
              <section className="bg-[#0f172a] p-4 sm:p-6 rounded-2xl border border-[#1e293b] overflow-hidden relative">
                <div className="absolute top-0 right-0 p-4 opacity-10 pointer-events-none">
                  <Activity className="w-20 h-20 sm:w-24 sm:h-24 text-[#94a3b8]" />
                </div>
                <h2 className="text-xs font-bold text-[#94a3b8] uppercase tracking-widest mb-4">Expert Diagnosis</h2>
                <div className="space-y-3">
                  <div className={`p-3 sm:p-4 rounded-xl border text-center ${
                    isLolos
                      ? 'bg-[#10b9811a] border-[#10b98133] text-[#34d399]'
                      : 'bg-[#f973161a] border-[#f9731633] text-[#fb923c]'
                  }`}>
                    <span className="text-xs uppercase font-bold block mb-1">Status</span>
                    <span className="text-lg sm:text-xl font-bold break-words">{diagnosis}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {(
                      [
                        { key: 'RPM',   val: symbols.rpm },
                        { key: 'Noise', val: symbols.noise },
                        { key: 'Vib',   val: symbols.vib },
                        { key: 'Temp',  val: symbols.temp },
                      ] as const
                    ).map(({ key, val }) => (
                      <div key={key} className="p-2 bg-[#020617] rounded-lg border border-[#1e293b] text-center">
                        <span className="text-[10px] text-[#64748b] block">{key}</span>
                        <span className="font-mono text-white text-sm">{val}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </section>
            </div>

            {/* ── RIGHT COLUMN ── */}
            <div className="lg:col-span-3 space-y-4 sm:space-y-6">

              {/* Gauge Cards — 2 col mobile, 4 col md+ */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
                <GaugeCard icon={<Zap         className="text-[#60a5fa] w-4 h-4" />} label="RPM"       value={sensorData.RPM}     avg={averages.RPM}     unit="rpm"  color="blue"    max={appData.RPM * 1.2 || 3600} />
                <GaugeCard icon={<Volume2     className="text-[#c084fc] w-4 h-4" />} label="Noise"     value={sensorData.SLM}     avg={averages.SLM}     unit="dB"   color="purple"  max={120} />
                <GaugeCard icon={<Activity    className="text-[#34d399] w-4 h-4" />} label="Vibration" value={sensorData.VIBRASI}  avg={averages.VIBRASI} unit="mm/s" color="emerald" max={15} />
                <GaugeCard icon={<Thermometer className="text-[#fb923c] w-4 h-4" />} label="Temp"      value={sensorData.SUHU}    avg={averages.SUHU}    unit="°C"   color="orange"  max={150} />
              </div>

              {/* Charts Grid — 1 col mobile, 2 col sm+ */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
                <ChartCard title="RPM Monitoring"          color="#3b82f6" isPlaceholder={!hasHistory}>
                  <Line data={rpmChartData}  options={baseChartOptions} />
                </ChartCard>
                <ChartCard title="Noise Monitoring (SLM)"  color="#a855f7" isPlaceholder={!hasHistory}>
                  <Line data={slmChartData}  options={baseChartOptions} />
                </ChartCard>
                <ChartCard title="Vibration Monitoring"    color="#10b981" isPlaceholder={!hasHistory}>
                  <Line data={vibChartData}  options={baseChartOptions} />
                </ChartCard>
                <ChartCard title="Temperature Monitoring"  color="#f97316" isPlaceholder={!hasHistory}>
                  <Line data={tempChartData} options={baseChartOptions} />
                </ChartCard>
              </div>
            </div>
          </div>

          {/* ── Footer ── */}
          <footer className="text-center text-[#475569] text-xs py-6 sm:py-8 border-t border-[#0f172a]">
            <p>Standard Compliance: ISO 2372 | IEC 60034-9 | Expert System Rule-Based</p>
            <p className="mt-1">© 2026 Industrial Smart QC Systems</p>
          </footer>
        </div>
      </div>

      <div
        ref={reportRef}
        style={{
          position:   'fixed',
          left:       '-9999px',
          top:        0,
          visibility: 'hidden',
          opacity:    0,
          height:     0,
          overflow:   'hidden',
          width:      '794px',
          minWidth:   '794px',
          padding:    '48px',
          backgroundColor: '#020617',
          color:      '#e2e8f0',
          fontFamily: 'sans-serif',
          boxSizing:  'border-box',
        }}
      >
        {/* Report Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #1e293b', paddingBottom: '24px', marginBottom: '32px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div style={{ padding: '12px', borderRadius: '12px', backgroundColor: 'rgba(37,99,235,0.2)', border: '1px solid rgba(59,130,246,0.3)' }}>
              <MotorLogo />
            </div>
            <div>
              <div style={{ fontSize: '22px', fontWeight: 900, color: '#fff', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Motor QC Report</div>
              <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>Industrial Smart Expert Analysis</div>
              <div style={{ fontSize: '9px', color: '#64748b', marginTop: '4px' }}>
                ID: QC-{Date.now().toString().slice(-8)} | {new Date().toLocaleString()}
              </div>
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '9px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '6px' }}>Final QC Result</div>
            <div style={{
              padding: '10px 28px', borderRadius: '14px', fontSize: '22px', fontWeight: 900,
              textTransform: 'uppercase', border: '2px solid',
              backgroundColor: isLolos ? 'rgba(16,185,129,0.1)' : 'rgba(249,115,22,0.1)',
              borderColor:     isLolos ? '#10b981' : '#f97316',
              color:           isLolos ? '#34d399' : '#fb923c',
            }}>
              {diagnosis}
            </div>
          </div>
        </div>

        {/* Technical Config */}
        <div style={{ padding: '20px', borderRadius: '16px', border: '1px solid #1e293b', backgroundColor: 'rgba(15,23,42,0.5)', marginBottom: '32px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
            <div style={{ width: '4px', height: '16px', borderRadius: '2px', backgroundColor: '#3b82f6' }} />
            <div style={{ fontSize: '9px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Technical Configuration</div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
            {[
              { label: 'Power Rating',     value: `${appData.kW} kW`,         color: '#60a5fa' },
              { label: 'Insulation Class', value: `Class ${insulationClass}`, color: '#c084fc' },
              { label: 'Nameplate RPM',    value: `${appData.RPM} RPM`,       color: '#34d399' },
            ].map(({ label, value, color }) => (
              <div key={label} style={{ padding: '12px', borderRadius: '10px', border: '1px solid #1e293b', backgroundColor: '#020617' }}>
                <div style={{ fontSize: '8px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: '4px' }}>{label}</div>
                <div style={{ fontSize: '18px', fontFamily: 'monospace', fontWeight: 700, color }}>{value}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Charts 2×2 — use real data if available, else placeholder */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
          {[
            { title: 'RPM Performance',    data: rpmChartData,  avg: averages.RPM,     unit: 'RPM',  color: '#60a5fa', bg: 'rgba(96,165,250,0.1)'  },
            { title: 'Acoustic Noise',     data: slmChartData,  avg: averages.SLM,     unit: 'dB',   color: '#c084fc', bg: 'rgba(192,132,252,0.1)' },
            { title: 'Vibration Severity', data: vibChartData,  avg: averages.VIBRASI, unit: 'mm/s', color: '#34d399', bg: 'rgba(52,211,153,0.1)'  },
            { title: 'Thermal Stability',  data: tempChartData, avg: averages.SUHU,    unit: '°C',   color: '#fb923c', bg: 'rgba(251,146,60,0.1)'  },
          ].map(({ title, data, avg, unit, color, bg }) => (
            <div key={title} style={{ padding: '16px', borderRadius: '14px', border: '1px solid #1e293b', backgroundColor: 'rgba(15,23,42,0.5)', height: '180px', display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', flexShrink: 0 }}>
                <div style={{ fontSize: '9px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{title}</div>
                <div style={{ fontSize: '9px', fontWeight: 700, padding: '2px 8px', borderRadius: '999px', color, backgroundColor: bg }}>
                  AVG: {avg.toFixed(1)} {unit}
                </div>
              </div>
              <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
                <Line data={data} options={baseChartOptions} />
              </div>
            </div>
          ))}
        </div>

        {/* Report Footer */}
        <div style={{ marginTop: '32px', paddingTop: '16px', borderTop: '1px solid #1e293b', display: 'flex', justifyContent: 'space-between', fontSize: '8px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          <span>Certified by Industrial Smart Expert System</span>
          <span>© 2026 Industrial Smart QC Systems</span>
        </div>
      </div>
    </>
  );
}