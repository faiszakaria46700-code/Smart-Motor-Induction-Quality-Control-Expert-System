/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState, useRef } from 'react';
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
  ChartOptions,
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import { Activity, Thermometer, Volume2, Zap, Download, Trash2, Play, Settings, Cpu } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import html2pdf from 'html2pdf.js';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
);

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

export default function App() {
  const [sensorData, setSensorData] = useState<SensorData>({ RPM: 0, SLM: 0, SUHU: 0, VIBRASI: 0 });
  const [appData, setAppData] = useState<AppData>({ kW: 0, KELAS: 1, RPM: 0 });
  const [buttons, setButtons] = useState<ButtonState>({ RECORD: "0", SAVE: "0", CLEAR: "0" });
  const [history, setHistory] = useState<{ label: string; data: SensorData }[]>([]);
  const [seconds, setSeconds] = useState(0);
  const [averages, setAverages] = useState<SensorData>({ RPM: 0, SLM: 0, SUHU: 0, VIBRASI: 0 });
  const [sums, setSums] = useState<SensorData>({ RPM: 0, SLM: 0, SUHU: 0, VIBRASI: 0 });
  const [diagnosis, setDiagnosis] = useState<string>("Standby");
  const [symbols, setSymbols] = useState({ rpm: "", noise: "", vib: "", temp: "" });
  
  const dashboardRef = useRef<HTMLDivElement>(null);
  const reportRef = useRef<HTMLDivElement>(null);
  const recordInterval = useRef<NodeJS.Timeout | null>(null);
  const sensorDataRef = useRef<SensorData>(sensorData);

  // Update ref whenever sensorData changes
  useEffect(() => {
    sensorDataRef.current = sensorData;
  }, [sensorData]);

  // Firebase Listeners
  useEffect(() => {
    const dataRef = ref(db, 'DATA');
    const appDataRef = ref(db, 'DATAAPP');
    const buttonRef = ref(db, 'BUTTON');

    const unsubData = onValue(dataRef, (snapshot) => {
      if (snapshot.exists()) setSensorData(snapshot.val());
    });

    const unsubAppData = onValue(appDataRef, (snapshot) => {
      if (snapshot.exists()) setAppData(snapshot.val());
    });

    const unsubButtons = onValue(buttonRef, (snapshot) => {
      if (snapshot.exists()) setButtons(snapshot.val());
    });

    return () => {
      off(dataRef);
      off(appDataRef);
      off(buttonRef);
    };
  }, []);

  // Expert System Logic
  useEffect(() => {
    const rpmSym = getRPMSymbol(sensorData.RPM, appData.RPM || 1);
    const noiseSym = getNoiseSymbol(sensorData.SLM, appData.kW);
    const vibSym = getVibrationSymbol(sensorData.VIBRASI, appData.kW);
    const tempSym = getTemperatureSymbol(sensorData.SUHU, appData.KELAS);

    setSymbols({ rpm: rpmSym, noise: noiseSym, vib: vibSym, temp: tempSym });

    const result = diagnose(rpmSym, noiseSym, vibSym, tempSym, rules);
    setDiagnosis(result);

    // Update Firebase PAKAR/HASIL
    set(ref(db, 'PAKAR/HASIL'), result);
  }, [sensorData, appData]);

  // Button Actions
  useEffect(() => {
    // RECORD
    if (buttons.RECORD === "1") {
      if (!recordInterval.current) {
        recordInterval.current = setInterval(() => {
          setSeconds(prevSec => {
            const nextSec = prevSec + 1;
            const currentSensor = sensorDataRef.current;
            
            setHistory((prev) => {
              const newHistory = [...prev, { label: `${nextSec}s`, data: { ...currentSensor } }];
              
              // Calculate accurate averages from full history
              const count = newHistory.length;
              const totals = newHistory.reduce((acc, curr) => ({
                RPM: acc.RPM + curr.data.RPM,
                SLM: acc.SLM + curr.data.SLM,
                SUHU: acc.SUHU + curr.data.SUHU,
                VIBRASI: acc.VIBRASI + curr.data.VIBRASI,
              }), { RPM: 0, SLM: 0, SUHU: 0, VIBRASI: 0 });

              setAverages({
                RPM: totals.RPM / count,
                SLM: totals.SLM / count,
                SUHU: totals.SUHU / count,
                VIBRASI: totals.VIBRASI / count,
              });

              return newHistory;
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

    // SAVE
    if (buttons.SAVE === "1") {
      handleExportPDF();
      set(ref(db, 'BUTTON/SAVE'), "0");
    }

    // CLEAR
    if (buttons.CLEAR === "1") {
      setHistory([]);
      setSeconds(0);
      setSums({ RPM: 0, SLM: 0, SUHU: 0, VIBRASI: 0 });
      setAverages({ RPM: 0, SLM: 0, SUHU: 0, VIBRASI: 0 });
      setDiagnosis("Standby");
      set(ref(db, 'BUTTON/CLEAR'), "0");
    }

    return () => {
      // Don't clear interval here to keep it running even if sensorData updates
    };
  }, [buttons.RECORD, buttons.SAVE, buttons.CLEAR]);

  const handleExportPDF = () => {
    if (!reportRef.current) return;
    const element = reportRef.current;
    
    // Temporarily make the report "visible" to the renderer but off-screen
    element.style.position = 'static';
    element.style.visibility = 'visible';
    element.style.height = 'auto';
    element.style.opacity = '1';
    
    const opt = {
      margin: 5,
      filename: `Motor_QC_Expert_Report_${new Date().getTime()}.pdf`,
      image: { type: 'jpeg' as const, quality: 1.0 },
      html2canvas: { 
        scale: 4, // HD Resolution
        useCORS: true,
        backgroundColor: '#020617', // Back to dark blue
        logging: false,
        letterRendering: true
      },
      jsPDF: { unit: 'mm' as const, format: 'a4' as const, orientation: 'portrait' as const }
    };

    html2pdf().from(element).set(opt).save().then(() => {
      element.style.position = 'absolute';
      element.style.visibility = 'hidden';
      element.style.height = '0';
      element.style.opacity = '0';
    });
  };

  const chartOptions: ChartOptions<'line'> = {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      y: { beginAtZero: true, grid: { color: 'rgba(255, 255, 255, 0.1)' }, ticks: { color: '#94a3b8' } },
      x: { grid: { display: false }, ticks: { color: '#94a3b8' } },
    },
    plugins: {
      legend: { display: false },
    },
    animation: { duration: 0 },
  };

  const createChartData = (label: string, dataKey: keyof SensorData, color: string) => ({
    labels: history.map((h) => h.label),
    datasets: [
      {
        label,
        data: history.map((h) => h.data[dataKey]),
        borderColor: color,
        backgroundColor: color + '33',
        fill: true,
        tension: 0.4,
        pointRadius: 0,
      },
    ],
  });

  const MotorLogo = () => (
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

  return (
    <div className="min-h-screen bg-[#020617] text-[#e2e8f0] font-sans p-4 md:p-8">
      <div ref={dashboardRef} className="max-w-7xl mx-auto space-y-8 bg-[#020617] p-4 rounded-3xl">
        {/* Header */}
        <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-[#0f172a] p-6 rounded-2xl border border-[#1e293b] backdrop-blur-xl">
          <div className="flex items-center gap-4">
            <div className="p-2 bg-[#3b82f61a] rounded-xl border border-[#3b82f633]">
              <MotorLogo />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-white">Smart Motor QC Expert System</h1>
              <p className="text-[#94a3b8] text-sm">Industrial IoT Monitoring & Diagnosis</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className={`px-4 py-2 rounded-full text-xs font-bold uppercase tracking-wider flex items-center gap-2 ${buttons.RECORD === "1" ? 'bg-[#ef44441a] text-[#f87171] border border-[#ef444433] animate-pulse' : 'bg-[#1e293b] text-[#94a3b8] border border-[#334155]'}`}>
              <div className={`w-2 h-2 rounded-full ${buttons.RECORD === "1" ? 'bg-[#f87171]' : 'bg-[#64748b]'}`} />
              {buttons.RECORD === "1" ? 'Recording' : 'Standby'}
            </div>
            <button onClick={handleExportPDF} className="p-2 bg-[#1e293b] hover:bg-[#334155] rounded-lg transition-colors border border-[#334155]">
              <Download className="w-5 h-5" />
            </button>
          </div>
        </header>

        {/* Main Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Left Column: Config & Diagnosis */}
          <div className="lg:col-span-1 space-y-6">
            {/* Motor Info */}
            <section className="bg-[#0f172a] p-6 rounded-2xl border border-[#1e293b]">
              <h2 className="text-sm font-bold text-[#94a3b8] uppercase tracking-widest mb-4 flex items-center gap-2">
                <Settings className="w-4 h-4" /> Motor Configuration
              </h2>
              <div className="space-y-4">
                <div className="p-3 bg-[#020617] rounded-xl border border-[#1e293b]">
                  <span className="text-xs text-[#64748b] block mb-1">Power (kW)</span>
                  <span className="text-lg font-mono text-[#60a5fa]">{appData.kW} kW</span>
                </div>
                <div className="p-3 bg-[#020617] rounded-xl border border-[#1e293b]">
                  <span className="text-xs text-[#64748b] block mb-1">Insulation Class</span>
                  <span className="text-lg font-mono text-[#c084fc]">
                    Class {
                      Number(appData.KELAS) === 1 ? 'A' : 
                      Number(appData.KELAS) === 2 ? 'B' : 
                      Number(appData.KELAS) === 3 ? 'E' : 
                      Number(appData.KELAS) === 4 ? 'F' : 'Unknown'
                    }
                  </span>
                </div>
                <div className="p-3 bg-[#020617] rounded-xl border border-[#1e293b]">
                  <span className="text-xs text-[#64748b] block mb-1">Nameplate RPM</span>
                  <span className="text-lg font-mono text-[#34d399]">{appData.RPM} RPM</span>
                </div>
              </div>
            </section>

            {/* Diagnosis Result */}
            <section className="bg-[#0f172a] p-6 rounded-2xl border border-[#1e293b] overflow-hidden relative">
              <div className="absolute top-0 right-0 p-4 opacity-10">
                <Activity className="w-24 h-24 text-[#94a3b8]" />
              </div>
              <h2 className="text-sm font-bold text-[#94a3b8] uppercase tracking-widest mb-4">Expert Diagnosis</h2>
              <div className="space-y-4">
                <div className={`p-4 rounded-xl border text-center ${diagnosis === 'Lolos QC' ? 'bg-[#10b9811a] border-[#10b98133] text-[#34d399]' : 'bg-[#f973161a] border-[#f9731633] text-[#fb923c]'}`}>
                  <span className="text-xs uppercase font-bold block mb-1">Status</span>
                  <span className="text-xl font-bold">{diagnosis}</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="p-2 bg-[#020617] rounded-lg border border-[#1e293b] text-center">
                    <span className="text-[10px] text-[#64748b] block">RPM</span>
                    <span className="font-mono text-white">{symbols.rpm}</span>
                  </div>
                  <div className="p-2 bg-[#020617] rounded-lg border border-[#1e293b] text-center">
                    <span className="text-[10px] text-[#64748b] block">Noise</span>
                    <span className="font-mono text-white">{symbols.noise}</span>
                  </div>
                  <div className="p-2 bg-[#020617] rounded-lg border border-[#1e293b] text-center">
                    <span className="text-[10px] text-[#64748b] block">Vib</span>
                    <span className="font-mono text-white">{symbols.vib}</span>
                  </div>
                  <div className="p-2 bg-[#020617] rounded-lg border border-[#1e293b] text-center">
                    <span className="text-[10px] text-[#64748b] block">Temp</span>
                    <span className="font-mono text-white">{symbols.temp}</span>
                  </div>
                </div>
              </div>
            </section>
          </div>

          {/* Right Column: Gauges & Charts */}
          <div className="lg:col-span-3 space-y-6">
            {/* Real-time Gauges */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <GaugeCard icon={<Zap className="text-[#60a5fa]" />} label="RPM" value={sensorData.RPM} avg={averages.RPM} unit="rpm" color="blue" max={appData.RPM * 1.2 || 3600} />
              <GaugeCard icon={<Volume2 className="text-[#c084fc]" />} label="Noise" value={sensorData.SLM} avg={averages.SLM} unit="dB" color="purple" max={120} />
              <GaugeCard icon={<Activity className="text-[#34d399]" />} label="Vibration" value={sensorData.VIBRASI} avg={averages.VIBRASI} unit="mm/s" color="emerald" max={15} />
              <GaugeCard icon={<Thermometer className="text-[#fb923c]" />} label="Temp" value={sensorData.SUHU} avg={averages.SUHU} unit="°C" color="orange" max={150} />
            </div>

            {/* Charts Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <ChartCard title="RPM Monitoring" color="#3b82f6">
                <Line data={createChartData('RPM', 'RPM', '#3b82f6')} options={chartOptions} />
              </ChartCard>
              <ChartCard title="Noise Monitoring (SLM)" color="#a855f7">
                <Line data={createChartData('Noise', 'SLM', '#a855f7')} options={chartOptions} />
              </ChartCard>
              <ChartCard title="Vibration Monitoring" color="#10b981">
                <Line data={createChartData('Vibration', 'VIBRASI', '#10b981')} options={chartOptions} />
              </ChartCard>
              <ChartCard title="Temperature Monitoring" color="#f97316">
                <Line data={createChartData('Temperature', 'SUHU', '#f97316')} options={chartOptions} />
              </ChartCard>
            </div>
          </div>
        </div>

        {/* Footer Info */}
        <footer className="text-center text-[#475569] text-xs py-8 border-t border-[#0f172a]">
          <p>Standard Compliance: ISO 2372 | IEC 60034-9 | Expert System Rule-Based</p>
          <p className="mt-1">© 2026 Industrial Smart QC Systems</p>
        </footer>
      </div>

      {/* Formal PDF Report Template (Vertical/Portrait Layout) */}
      <div 
        ref={reportRef} 
        style={{ 
          position: 'absolute', 
          visibility: 'hidden', 
          height: 0, 
          overflow: 'hidden', 
          width: '210mm', 
          padding: '12mm', 
          backgroundColor: '#020617', 
          color: '#e2e8f0',
          opacity: 0
        }}
        className="font-sans"
      >
        {/* Header */}
        <div className="flex justify-between items-center border-b pb-6 mb-8" style={{ borderBottomColor: '#1e293b' }}>
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-xl border" style={{ backgroundColor: 'rgba(37, 99, 235, 0.2)', borderColor: 'rgba(59, 130, 246, 0.3)' }}>
              <MotorLogo />
            </div>
            <div>
              <h1 className="text-2xl font-black uppercase tracking-tight" style={{ color: '#ffffff' }}>Motor QC Report</h1>
              <p className="text-xs font-medium mt-0.5" style={{ color: '#94a3b8' }}>Industrial Smart Expert Analysis</p>
              <p className="text-[9px] mt-1" style={{ color: '#64748b' }}>ID: QC-{new Date().getTime().toString().slice(-8)} | {new Date().toLocaleString()}</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: '#64748b' }}>Final QC Result</p>
            <div className={`px-8 py-3 rounded-2xl text-2xl font-black uppercase border-2 shadow-2xl`} style={{
              backgroundColor: diagnosis === 'Lolos QC' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(249, 115, 22, 0.1)',
              borderColor: diagnosis === 'Lolos QC' ? '#10b981' : '#f97316',
              color: diagnosis === 'Lolos QC' ? '#34d399' : '#fb923c'
            }}>
              {diagnosis}
            </div>
          </div>
        </div>

        {/* Configuration Section */}
        <div className="p-5 rounded-2xl border mb-8" style={{ backgroundColor: 'rgba(15, 23, 42, 0.5)', borderColor: '#1e293b' }}>
          <div className="flex items-center gap-2 mb-4">
            <div className="w-1 h-4 rounded-full" style={{ backgroundColor: '#3b82f6' }}></div>
            <h2 className="text-[10px] font-bold uppercase tracking-widest" style={{ color: '#94a3b8' }}>Technical Configuration</h2>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div className="p-3 rounded-xl border" style={{ backgroundColor: '#020617', borderColor: '#1e293b' }}>
              <span className="text-[8px] font-bold uppercase block mb-1" style={{ color: '#64748b' }}>Power Rating</span>
              <span className="text-lg font-mono font-bold" style={{ color: '#60a5fa' }}>{appData.kW} <span className="text-[10px]">kW</span></span>
            </div>
            <div className="p-3 rounded-xl border" style={{ backgroundColor: '#020617', borderColor: '#1e293b' }}>
              <span className="text-[8px] font-bold uppercase block mb-1" style={{ color: '#64748b' }}>Insulation Class</span>
              <span className="text-lg font-mono font-bold" style={{ color: '#c084fc' }}>
                {Number(appData.KELAS) === 1 ? 'A' : Number(appData.KELAS) === 2 ? 'B' : Number(appData.KELAS) === 3 ? 'E' : Number(appData.KELAS) === 4 ? 'F' : 'N/A'}
              </span>
            </div>
            <div className="p-3 rounded-xl border" style={{ backgroundColor: '#020617', borderColor: '#1e293b' }}>
              <span className="text-[8px] font-bold uppercase block mb-1" style={{ color: '#64748b' }}>Nameplate RPM</span>
              <span className="text-lg font-mono font-bold" style={{ color: '#34d399' }}>{appData.RPM} <span className="text-[10px]">RPM</span></span>
            </div>
          </div>
        </div>

        {/* Charts Section - 2x2 Grid for Portrait */}
        <div className="grid grid-cols-2 gap-4">
          <div className="p-4 rounded-2xl border h-44" style={{ backgroundColor: 'rgba(15, 23, 42, 0.5)', borderColor: '#1e293b' }}>
            <div className="flex justify-between items-center mb-2">
              <h3 className="text-[9px] font-bold uppercase tracking-widest" style={{ color: '#94a3b8' }}>RPM Performance History</h3>
              <span className="text-[9px] font-mono font-bold px-2 py-0.5 rounded-full" style={{ color: '#60a5fa', backgroundColor: 'rgba(96, 165, 250, 0.1)' }}>AVG: {averages.RPM.toFixed(1)} RPM</span>
            </div>
            <div className="h-32"><Line data={createChartData('RPM', 'RPM', '#3b82f6')} options={{...chartOptions, scales: {...chartOptions.scales, y: {...chartOptions.scales?.y, ticks: {color: '#94a3b8'}}, x: {...chartOptions.scales?.x, ticks: {color: '#94a3b8'}}}} as any} /></div>
          </div>
          <div className="p-4 rounded-2xl border h-44" style={{ backgroundColor: 'rgba(15, 23, 42, 0.5)', borderColor: '#1e293b' }}>
            <div className="flex justify-between items-center mb-2">
              <h3 className="text-[9px] font-bold uppercase tracking-widest" style={{ color: '#94a3b8' }}>Acoustic Noise Analysis</h3>
              <span className="text-[9px] font-mono font-bold px-2 py-0.5 rounded-full" style={{ color: '#c084fc', backgroundColor: 'rgba(192, 132, 252, 0.1)' }}>AVG: {averages.SLM.toFixed(1)} dB</span>
            </div>
            <div className="h-32"><Line data={createChartData('Noise', 'SLM', '#a855f7')} options={{...chartOptions, scales: {...chartOptions.scales, y: {...chartOptions.scales?.y, ticks: {color: '#94a3b8'}}, x: {...chartOptions.scales?.x, ticks: {color: '#94a3b8'}}}} as any} /></div>
          </div>
          <div className="p-4 rounded-2xl border h-44" style={{ backgroundColor: 'rgba(15, 23, 42, 0.5)', borderColor: '#1e293b' }}>
            <div className="flex justify-between items-center mb-2">
              <h3 className="text-[9px] font-bold uppercase tracking-widest" style={{ color: '#94a3b8' }}>Vibration Severity Monitoring</h3>
              <span className="text-[9px] font-mono font-bold px-2 py-0.5 rounded-full" style={{ color: '#34d399', backgroundColor: 'rgba(52, 211, 153, 0.1)' }}>AVG: {averages.VIBRASI.toFixed(1)} mm/s</span>
            </div>
            <div className="h-32"><Line data={createChartData('Vibration', 'VIBRASI', '#10b981')} options={{...chartOptions, scales: {...chartOptions.scales, y: {...chartOptions.scales?.y, ticks: {color: '#94a3b8'}}, x: {...chartOptions.scales?.x, ticks: {color: '#94a3b8'}}}} as any} /></div>
          </div>
          <div className="p-4 rounded-2xl border h-44" style={{ backgroundColor: 'rgba(15, 23, 42, 0.5)', borderColor: '#1e293b' }}>
            <div className="flex justify-between items-center mb-2">
              <h3 className="text-[9px] font-bold uppercase tracking-widest" style={{ color: '#94a3b8' }}>Thermal Stability Log</h3>
              <span className="text-[9px] font-mono font-bold px-2 py-0.5 rounded-full" style={{ color: '#fb923c', backgroundColor: 'rgba(251, 146, 60, 0.1)' }}>AVG: {averages.SUHU.toFixed(1)} °C</span>
            </div>
            <div className="h-32"><Line data={createChartData('Temperature', 'SUHU', '#f97316')} options={{...chartOptions, scales: {...chartOptions.scales, y: {...chartOptions.scales?.y, ticks: {color: '#94a3b8'}}, x: {...chartOptions.scales?.x, ticks: {color: '#94a3b8'}}}} as any} /></div>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-8 pt-4 border-t flex justify-between items-center text-[8px] font-bold uppercase tracking-widest" style={{ borderTopColor: '#1e293b', color: '#64748b' }}>
          <p>Certified by Industrial Smart Expert System</p>
          <p>© 2026 Industrial Smart QC Systems</p>
        </div>
      </div>
    </div>
  );
}

function GaugeCard({ icon, label, value, avg, unit, color, max }: { icon: React.ReactNode, label: string, value: number, avg: number, unit: string, color: string, max: number }) {
  const colors: Record<string, string> = {
    blue: 'text-[#60a5fa] border-[#3b82f633] bg-[#3b82f60d]',
    purple: 'text-[#c084fc] border-[#a855f733] bg-[#a855f70d]',
    emerald: 'text-[#34d399] border-[#10b98133] bg-[#10b9810d]',
    orange: 'text-[#fb923c] border-[#f9731633] bg-[#f973160d]',
  };

  const progress = Math.min((value / max) * 100, 100);

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className={`p-4 rounded-2xl border backdrop-blur-sm ${colors[color]}`}
    >
      <div className="flex items-center gap-2 mb-2 opacity-60">
        {icon}
        <span className="text-[10px] font-bold uppercase tracking-widest">{label}</span>
      </div>
      <div className="flex items-baseline gap-1 mb-1">
        <span className="text-2xl font-mono font-bold text-white">{value.toFixed(1)}</span>
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
          className={`h-full ${color === 'blue' ? 'bg-[#60a5fa]' : color === 'purple' ? 'bg-[#c084fc]' : color === 'emerald' ? 'bg-[#34d399]' : 'bg-[#fb923c]'}`}
        />
      </div>
    </motion.div>
  );
}

function ChartCard({ title, children, color }: { title: string, children: React.ReactNode, color: string }) {
  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="bg-[#0f172a] p-6 rounded-2xl border border-[#1e293b] h-64 flex flex-col"
    >
      <h3 className="text-xs font-bold text-[#64748b] uppercase tracking-widest mb-4 flex items-center gap-2">
        <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: color }} />
        {title}
      </h3>
      <div className="flex-1 relative">
        {children}
      </div>
    </motion.div>
  );
}
