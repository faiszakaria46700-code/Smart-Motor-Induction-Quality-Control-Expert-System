# 🚀 Smart Motor QC Expert System

## 📌 Overview
**Smart Motor QC Expert System** adalah aplikasi *smart quality control* untuk motor induksi yang dirancang untuk meningkatkan akurasi dan efisiensi dalam proses inspeksi serta maintenance.

Aplikasi ini mengintegrasikan berbagai alat ukur dan sistem pakar berbasis standar internasional untuk mendukung **preventive** dan **predictive maintenance** secara presisi.

---

## ⚙️ Features
- 📊 Monitoring kualitas motor induksi secara real-time
- 📈 Analisis berbasis *expert system*
- 🔧 Integrasi berbagai alat ukur:
  - Vibration Meter
  - Sound Level Meter
  - Tachometer
  - Thermogun
- 🧠 Sistem pakar berdasarkan:
  - ISO 2372 (standar vibrasi)
  - IEC 60334 (standar motor listrik)
- ☁️ Penyimpanan data berbasis cloud (Firebase)
- 📡 Integrasi IoT untuk pengambilan data otomatis

---

## 🏗️ Tech Stack
- **Frontend:** React JS
- **Backend / Database:** Firebase
- **IoT Integration:** Sensor & perangkat monitoring
- **Expert System:** Rule-based system berbasis standar industri

---

## 🧩 System Architecture
```
IoT Sensors → Firebase → React App → Expert System → QC Result
```

---

## 🎯 Use Case
Aplikasi ini digunakan untuk:
- Quality control motor induksi di industri
- Deteksi dini kerusakan mesin
- Monitoring performa motor secara berkala
- Mendukung keputusan maintenance berbasis data

---

## 🚀 Installation

1. Clone repository
```bash
git clone https://github.com/faiszakaria46700-code/Smart-Motor-Induction-Quality-Control-Expert-System.git
```

2. Masuk ke folder project
```bash
cd Smart-Motor-Induction-Quality-Control-Expert-System
```

3. Install dependencies
```bash
npm install
```

4. Jalankan aplikasi
```bash
npm run dev
```

---

## 🔑 Environment Setup
Buat file `.env` dan tambahkan konfigurasi Firebase:

```env
VITE_FIREBASE_API_KEY=your_api_key
VITE_FIREBASE_AUTH_DOMAIN=your_auth_domain
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_storage_bucket
VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
VITE_FIREBASE_APP_ID=your_app_id
```

---

## 📊 Future Improvements
- Machine Learning untuk prediksi kerusakan
- Dashboard analytics yang lebih advanced
- Integrasi lebih banyak sensor IoT
- Mobile app version

---

## 👨‍💻 Author
**Fairus Zakaria**

---

## 📄 License
This project is licensed under the MIT License.