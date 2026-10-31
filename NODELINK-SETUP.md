# Musik berbasis NodeLink

Bot sekarang **tidak lagi memakai yt-dlp / ffmpeg**. Semua pemutaran (cari lagu, stream, encode, kirim ke voice)
dilakukan oleh **NodeLink** — server audio terpisah (kompatibel Lavalink, ditulis dengan Node.js). Bot memakai library
**Shoukaku** (klien Lavalink untuk Node.js) untuk memerintahnya. Hasilnya: proses bot ringan, suara tidak lagi
patah-patah karena bot sibuk, dan command tidak ikut tersendat.

## 1. Pasang & jalankan NodeLink (sekali saja)
Butuh Node.js terbaru (lihat README NodeLink; saat ini disarankan Node 24) dan git.

```bash
git clone https://github.com/PerformanC/NodeLink.git
cd NodeLink
npm install
copy config.default.ts config.ts      # Linux/macOS: cp config.default.ts config.ts
```
Buka `config.ts` dan **ganti password**:
```ts
server: { host: '0.0.0.0', port: 3000, password: 'passwordmu' }
```
Jalankan: `npm run start` (biarkan terminal itu terbuka / jalankan pakai pm2).

> Port & password bawaan bisa berbeda antarversi NodeLink — **yang penting `.env` bot sama dengan `config.ts` NodeLink**.

## 2. Atur `.env` bot
```
NODELINK_HOST=localhost
NODELINK_PORT=3000
NODELINK_PASSWORD=passwordmu
```
Kalau NodeLink di komputer/VPS lain, isi `NODELINK_HOST` dengan IP/domainnya (dan buka port-nya di firewall).

## 3. Pasang dependensi bot & jalankan
```bash
npm install        # memasang shoukaku, menghapus paket lama
npm run deploy     # mendaftarkan command baru (/volume)
npm start
```
Di log bot akan muncul `[nodelink] NodeLink terhubung`. Urutan menyalakan bebas: kalau NodeLink belum hidup, bot
mencoba menyambung terus (tiap 5 detik) dan `yz play` memberi pesan jelas sampai tersambung.

## Catatan
- Bot dan NodeLink bisa mati/hidup sendiri-sendiri; mode 24/7 dan lagu yang sedang diputar dipulihkan otomatis
  begitu NodeLink tersambung kembali.
- Pencarian memakai prefiks Lavalink (`ytsearch:` dan `scsearch:`). Ubah lewat `MUSIC_SEARCH_YOUTUBE` /
  `MUSIC_SEARCH_SOUNDCLOUD` (mis. `ytmsearch` untuk YouTube Music).
- Kalau YouTube gagal diputar (error 403 / "sign in"), itu soal konfigurasi sumber YouTube di NodeLink — lihat
  bagian `sources.youtube` di `config.ts` NodeLink & dokumentasinya. SoundCloud (`yz sc <lagu>` atau `/search source:SoundCloud`)
  biasanya jalan tanpa login.
- Selalu pakai NodeLink versi terbaru; kalau ada error koneksi voice setelah update Discord, update NodeLink.
- `bin/yt-dlp.exe`, `src/music/ytdlp.js`, dan variabel `YTDLP_*` / `FFMPEG_PATH` sudah tidak dipakai.
