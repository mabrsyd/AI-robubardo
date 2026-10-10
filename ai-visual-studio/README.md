# AI Visual Studio - Local Product Generation Studio

Aplikasi studio AI generatif lokal berbasis Next.js, Express.js, dan ComfyUI API, dirancang khusus untuk membuat visual produk affiliate dari teks prompt dan reference image dengan optimasi penuh untuk **NVIDIA GeForce RTX 2050 (4 GB VRAM)** dan RAM 16 GB di Windows 11.

---

## 🏗️ Arsitektur Sistem

```
USER INTERFACE (Next.js + React + Tailwind CSS)
      ↓ (HTTP / REST)
EXPRESS BACKEND (Port 3001)
      ↓
SQLITE JOB SYSTEM (QUEUED → PROCESSING → COMPLETED / FAILED)
      ↓ (Node-mapped Workflow Compiler)
COMFYUI LOCAL API (http://127.0.0.1:8188)
      ↓
NVIDIA RTX 2050 4GB (Batch: 1, 512×512 / 512×768)
      ↓
LOCAL STORAGE (storage/outputs)
      ↓
DOWNLOAD / PREVIEW DI FRONTEND
```

---

## 📁 Struktur Direktori

```
ai-visual-studio/
├── frontend/                     # Next.js 16 + React 19 + Tailwind CSS + Lucide
│   ├── src/
│   │   └── app/
│   │       ├── page.tsx          # Studio visual interface utama
│   │       ├── layout.tsx        # Cyber dark theme layout
│   │       └── globals.css       # Style & glow micro-animations
│   ├── .env.local                # NEXT_PUBLIC_API_URL=http://127.0.0.1:3001
│   └── package.json
│
├── backend/                      # Express.js + TypeScript (Node 24 / NodeNext)
│   ├── src/
│   │   ├── config.ts             # Path & hardware limits configuration
│   │   ├── server.ts             # Express HTTP entry point & worker starter
│   │   ├── routes/
│   │   │   ├── generation.ts     # POST /generate, GET /jobs, download & image streaming
│   │   │   ├── health.ts         # GET /health (backend + ComfyUI ping + GPU stats)
│   │   │   ├── upload.ts         # POST /upload (reference image multipart upload)
│   │   │   └── assets.ts         # GET /assets/:filename (safe streaming & traversal protection)
│   │   └── services/
│   │       ├── comfyui.ts        # ComfyUI API client (checkConnection, prompt, history, view)
│   │       ├── workflow.ts       # Dynamic workflow node mapping abstraction
│   │       ├── db.ts             # SQLite job persistence (jobs.db)
│   │       ├── jobQueue.ts       # Sequential single-worker queue (RTX 2050 4GB safety)
│   │       ├── storage.ts        # Path traversal guard & file validation
│   │       └── mockImage.ts      # Pure TS synthetic generator untuk offline fallback
│   ├── .env                      # PORT=3001, COMFYUI_URL, MOCK_GENERATION
│   └── package.json
│
├── workflows/
│   ├── image/
│   │   ├── txt2img.api.json      # ComfyUI prompt graph template (Text-to-Image)
│   │   ├── txt2img.config.json   # Node ID mapping config (sampler, latent, prompt nodes)
│   │   ├── img2img.api.json      # Product reference scene graph template
│   │   └── img2img.config.json   # Mapping config untuk product scene replacement
│   └── video/                    # Placeholder video workflows (Phase 8)
│
├── storage/
│   ├── uploads/                  # Foto produk yang di-upload user (safe sanitized names)
│   ├── outputs/                  # Hasil render gambar produk AI
│   └── temp/                     # File sementara / processing
│
└── README.md
```

---

## ⚙️ Environment Variables

### Backend (`backend/.env`):
```env
PORT=3001
COMFYUI_URL=http://127.0.0.1:8188
NODE_ENV=development
MOCK_GENERATION=true
```
> **Catatan `MOCK_GENERATION`**:
> - Ketika `true`, jika ComfyUI sedang belum dijalankan / offline, backend secara otomatis membuat visual placeholder berkualitas tinggi sehingga seluruh flow (klik Generate, progress polling, preview, download gambar) tetap dapat diuji tanpa error.
> - Ketika ComfyUI aktif di port 8188, backend otomatis memprioritaskan render langsung melalui ComfyUI API dan GPU RTX 2050.

### Frontend (`frontend/.env.local`):
```env
NEXT_PUBLIC_API_URL=http://127.0.0.1:3001
```

---

## 🚀 Cara Menjalankan

### 1. Menjalankan Backend Express
Buka terminal PowerShell:
```powershell
cd d:\project\AI\ai-visual-studio\backend
npm run dev
```
Backend akan aktif di: **`http://127.0.0.1:3001`**

### 2. Menjalankan Frontend Next.js
Buka terminal PowerShell terpisah:
```powershell
cd d:\project\AI\ai-visual-studio\frontend
npm run dev
```
Buka browser di: **`http://localhost:3000`** atau **`http://127.0.0.1:3000`**

### 3. Menjalankan ComfyUI (Local Engine)
Jika ingin melakukan inferensi GPU langsung:
```powershell
cd d:\project\AI\ComfyUI
python main.py --listen 127.0.0.1 --port 8188 --lowvram
```
> **Tips RTX 2050 (4GB VRAM)**:
> Flag `--lowvram` atau `--medvram` sangat disarankan agar ComfyUI mengelola model swap antara RAM dan VRAM secara optimal tanpa crash CUDA out-of-memory.

---

## 🧪 Panduan Testing Manual

Saat ini server Frontend dan Backend sudah **aktif dan berjalan**:
- **Frontend**: [http://127.0.0.1:3000](http://127.0.0.1:3000)
- **Backend API**: [http://127.0.0.1:3001/api/health](http://127.0.0.1:3001/api/health)

### Langkah Pengujian di Browser:
1. Buka browser dan akses **`http://127.0.0.1:3000`**.
2. Periksa indikator di header:
   - Terlihat badge **RTX 2050 (4GB)**.
   - Status ComfyUI akan menampilkan status koneksi secara live (`Ready` jika ComfyUI aktif, atau `Offline / Standby`).
3. Pilih salah satu **Quick Inspiration Preset** (misalnya `✨ Luxury Cosmetic` atau `👟 Modern Sneaker`) atau ketik prompt Anda sendiri.
4. Pilih rasio gambar yang diinginkan (default **1:1 / 512×512** atau **9:16 / 512×768** untuk format Reels/TikTok).
5. Klik tombol **GENERATE PRODUCT VISUAL**.
6. Amati indikator:
   - Status berubah menjadi **QUEUED** lalu **PROCESSING** disertai progress bar animasi.
   - Job dikelola secara sekuensial (batch 1) di database SQLite backend.
7. Setelah generasi selesai:
   - Gambar visual produk akan muncul di canvas tengah.
   - Tombol **Download High-Res** aktif (mengunduh gambar berekstensi PNG dengan nama unik yang aman).
   - Thumbnail generasi otomatis tersimpan di riwayat **Recent Generation History** di bagian bawah.
8. Uji upload gambar produk pada card **Product Reference Image** (Phase 7):
   - Klik atau drag-and-drop foto produk (PNG/JPG/WebP).
   - Foto otomatis tersimpan aman di `storage/uploads` dan siap digunakan pada pipeline perakitan scene baru.

---

## 🛡️ Keamanan & Optimasi VRAM

- **Path Traversal Protection**: Semua akses file di `storage/outputs` dan `storage/uploads` divalidasi dengan `path.basename` dan `path.resolve` containment check.
- **Hardware Safeguard**: Resolusi dikunci maksimal 768px dan batch size dipaksa 1 untuk mencegah error out-of-memory pada VRAM 4GB.
- **Non-blocking Job Architecture**: Request HTTP tidak pernah menggantung (mengembalikan 202 Accepted + Job ID seketika), frontend melakukan polling status setiap 1.5 detik.
