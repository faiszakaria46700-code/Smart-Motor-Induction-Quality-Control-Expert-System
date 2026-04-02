import { Rule } from '../constants/rules';

export const getVibrationSymbol = (vibration: number, kw: number): string => {
  // Based on ISO 2372 boundaries for "Good" and "Baik"
  let thresholds = [0.7, 1.8]; // Default for Class I (< 15kW)
  if (kw >= 15 && kw <= 75) thresholds = [1.1, 2.8]; // Class II
  else if (kw > 75) thresholds = [1.8, 4.5]; // Class III

  if (vibration < thresholds[0]) return "<";
  if (vibration <= thresholds[1]) return "&&";
  return ">";
};

export const getNoiseSymbol = (noise: number, kw: number): string => {
  // Based on IEC 60034-9
  let threshold = 79;
  if (kw >= 15 && kw <= 75) threshold = 83;
  else if (kw > 75) threshold = 88;

  if (noise < threshold - 5) return "<";
  if (noise <= threshold) return "&&";
  return ">";
};

export const getTemperatureSymbol = (temp: number, kelas: any): string => {
  const k = Number(kelas);
  // Based on IEC 60034 Insulation Classes
  let threshold = 80; // Default Kelas 1 (A)
  if (k === 2) threshold = 105; // B
  else if (k === 3) threshold = 95; // E
  else if (k === 4) threshold = 130; // F

  if (temp < threshold - 10) return "<";
  if (temp <= threshold) return "&&";
  return ">";
};

export const getRPMSymbol = (rpm: number, nameplateRPM: number): string => {
  if (!nameplateRPM) return "&&";
  const deviation = (rpm - nameplateRPM) / nameplateRPM;
  
  if (deviation < -0.05) return "<"; // Terlalu pelan (> 5% below)
  if (Math.abs(deviation) <= 0.05) return "&&"; // Within 5% range
  return ">"; // Terlalu cepat (> 5% above)
};

export const diagnose = (
  rpmSym: string,
  noiseSym: string,
  vibrationSym: string,
  tempSym: string,
  rules: Rule[]
): string => {
  const match = rules.find(
    (r) =>
      r.rpm === rpmSym &&
      r.sound === noiseSym &&
      r.vibration === vibrationSym &&
      r.temperature === tempSym
  );
  return match ? match.result : "Diagnosis Tidak Ditemukan";
};
