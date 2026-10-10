# AI-robubardo

AI Visual Studio - Local Product Visualization & Generation Studio berbasis Next.js, Express.js, dan ComfyUI API (Dioptimalkan untuk NVIDIA GeForce RTX 2050 4GB VRAM).

## 🚀 Fitur Utama
- **Text-to-Image Studio**: Generate visual produk affiliate dengan preset prompt dan kontrol parameter terpandu.
- **Product + Scene (img2img)**: Menempatkan foto produk nyata ke scene atau latar belakang baru.
- **Hardware Optimized**: Dikonfigurasi khusus untuk GPU 4GB VRAM dengan ComfyUI `--lowvram` dan sequential worker.
- **Local Persistence**: Database SQLite lokal (`jobs.db`) untuk riwayat render.

## 🛠️ Cara Menjalankan
Gunakan file batch launcher di root direktori:
- `start_all.bat`: Menjalankan ComfyUI, Backend API, dan Frontend UI secara bersamaan dalam jendela konsol terpisah.
- `start_comfyui.bat`: Menjalankan ComfyUI Portable (Port 8188).
- `start_backend.bat`: Menjalankan Backend Express API (Port 3001).
- `start_frontend.bat`: Menjalankan Frontend Next.js Studio (Port 3000).
