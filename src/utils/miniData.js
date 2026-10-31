'use strict';

/** Bank soal & kata untuk mini games. */

const QUIZ = [
  // [pertanyaan, jawaban benar, [3 pengecoh], kategori]
  ['Ibu kota Indonesia saat ini (2024) secara resmi sebelum pindah ke IKN?', 'Jakarta', ['Bandung', 'Surabaya', 'Medan'], 'Umum'],
  ['Gunung tertinggi di Indonesia?', 'Puncak Jaya', ['Semeru', 'Rinjani', 'Kerinci'], 'Geografi'],
  ['Sungai terpanjang di Indonesia?', 'Kapuas', ['Mahakam', 'Musi', 'Barito'], 'Geografi'],
  ['Pulau terbesar di Indonesia?', 'Kalimantan', ['Sumatra', 'Jawa', 'Sulawesi'], 'Geografi'],
  ['Siapa proklamator kemerdekaan Indonesia bersama Soekarno?', 'Mohammad Hatta', ['Sutan Sjahrir', 'Ki Hajar Dewantara', 'Tan Malaka'], 'Sejarah'],
  ['Tahun Indonesia merdeka?', '1945', ['1942', '1949', '1950'], 'Sejarah'],
  ['Candi Buddha terbesar di dunia ada di?', 'Borobudur', ['Prambanan', 'Mendut', 'Sewu'], 'Budaya'],
  ['Alat musik tradisional Jawa Barat dari bambu?', 'Angklung', ['Sasando', 'Tifa', 'Kolintang'], 'Budaya'],
  ['Tarian dari Bali yang terkenal?', 'Kecak', ['Saman', 'Piring', 'Jaipong'], 'Budaya'],
  ['Rumah adat Minangkabau disebut?', 'Rumah Gadang', ['Joglo', 'Honai', 'Tongkonan'], 'Budaya'],
  ['Planet terdekat dari Matahari?', 'Merkurius', ['Venus', 'Mars', 'Bumi'], 'Sains'],
  ['Planet terbesar di tata surya?', 'Jupiter', ['Saturnus', 'Neptunus', 'Uranus'], 'Sains'],
  ['Rumus kimia air?', 'H2O', ['CO2', 'O2', 'NaCl'], 'Sains'],
  ['Gas yang paling banyak di atmosfer Bumi?', 'Nitrogen', ['Oksigen', 'Karbon dioksida', 'Argon'], 'Sains'],
  ['Hewan tercepat di darat?', 'Cheetah', ['Singa', 'Kuda', 'Rusa'], 'Sains'],
  ['Organ yang memompa darah?', 'Jantung', ['Paru-paru', 'Hati', 'Ginjal'], 'Sains'],
  ['Satuan gaya dalam SI?', 'Newton', ['Joule', 'Watt', 'Pascal'], 'Sains'],
  ['Berapa jumlah provinsi di Indonesia saat ini (2024)?', '38', ['34', '36', '33'], 'Umum'],
  ['Mata uang Jepang?', 'Yen', ['Won', 'Yuan', 'Baht'], 'Umum'],
  ['Ibu kota Australia?', 'Canberra', ['Sydney', 'Melbourne', 'Perth'], 'Geografi'],
  ['Ibu kota Jepang?', 'Tokyo', ['Osaka', 'Kyoto', 'Nagoya'], 'Geografi'],
  ['Negara dengan penduduk terbanyak (2024)?', 'India', ['Tiongkok', 'Amerika Serikat', 'Indonesia'], 'Geografi'],
  ['Samudra terluas di dunia?', 'Pasifik', ['Atlantik', 'Hindia', 'Arktik'], 'Geografi'],
  ['Benua terkecil?', 'Australia', ['Eropa', 'Antartika', 'Amerika Selatan'], 'Geografi'],
  ['Pencipta lagu kebangsaan Indonesia Raya?', 'W.R. Supratman', ['Ismail Marzuki', 'C. Simanjuntak', 'Ibu Sud'], 'Sejarah'],
  ['Hari Sumpah Pemuda diperingati tanggal?', '28 Oktober', ['20 Mei', '17 Agustus', '10 November'], 'Sejarah'],
  ['Hari Pahlawan diperingati tanggal?', '10 November', ['28 Oktober', '1 Juni', '21 April'], 'Sejarah'],
  ['Kerajaan Hindu tertua di Indonesia?', 'Kutai', ['Majapahit', 'Sriwijaya', 'Mataram'], 'Sejarah'],
  ['Sumpah Palapa diucapkan oleh?', 'Gajah Mada', ['Hayam Wuruk', 'Raden Wijaya', 'Airlangga'], 'Sejarah'],
  ['Bahasa pemrograman yang logonya ular piton?', 'Python', ['Java', 'Ruby', 'Go'], 'Teknologi'],
  ['Singkatan CPU?', 'Central Processing Unit', ['Central Program Utility', 'Computer Power Unit', 'Core Processing Update'], 'Teknologi'],
  ['Pendiri Microsoft?', 'Bill Gates', ['Steve Jobs', 'Mark Zuckerberg', 'Elon Musk'], 'Teknologi'],
  ['Mesin pencari milik Google bernama?', 'Google Search', ['Bing', 'DuckDuckGo', 'Yahoo'], 'Teknologi'],
  ['HTML adalah bahasa untuk?', 'Struktur halaman web', ['Basis data', 'Sistem operasi', 'Desain grafis 3D'], 'Teknologi'],
  ['Berapa jumlah pemain sepak bola dalam satu tim di lapangan?', '11', ['9', '10', '12'], 'Olahraga'],
  ['Olahraga dengan raket dan kok?', 'Bulu tangkis', ['Tenis', 'Squash', 'Pingpong'], 'Olahraga'],
  ['Negara penyelenggara Piala Dunia 2022?', 'Qatar', ['Rusia', 'Brasil', 'Jerman'], 'Olahraga'],
  ['Tempat lahir bulu tangkis modern?', 'Inggris', ['Indonesia', 'Tiongkok', 'Denmark'], 'Olahraga'],
  ['Jumlah cincin Olimpiade?', '5', ['4', '6', '7'], 'Olahraga'],
  ['Makanan khas Padang yang terkenal?', 'Rendang', ['Gudeg', 'Papeda', 'Soto'], 'Kuliner'],
  ['Bahan utama tempe?', 'Kedelai', ['Kacang tanah', 'Jagung', 'Gandum'], 'Kuliner'],
  ['Gudeg berasal dari kota?', 'Yogyakarta', ['Semarang', 'Solo', 'Cirebon'], 'Kuliner'],
  ['Papeda terbuat dari?', 'Sagu', ['Singkong', 'Beras', 'Jagung'], 'Kuliner'],
  ['Hasil dari 12 x 12?', '144', ['124', '142', '154'], 'Matematika'],
  ['Akar kuadrat dari 169?', '13', ['11', '12', '14'], 'Matematika'],
  ['Jumlah sisi segi enam?', '6', ['5', '7', '8'], 'Matematika'],
  ['Nilai pi dibulatkan dua desimal?', '3,14', ['3,41', '3,12', '3,16'], 'Matematika'],
  ['Warna campuran biru dan kuning?', 'Hijau', ['Ungu', 'Oranye', 'Cokelat'], 'Umum'],
  ['Hewan khas Pulau Komodo?', 'Komodo', ['Orangutan', 'Badak Jawa', 'Anoa'], 'Umum'],
  ['Bunga nasional Indonesia (puspa pesona)?', 'Anggrek bulan', ['Mawar', 'Melati', 'Teratai'], 'Umum'],
  ['Hewan nasional Indonesia (satwa langka)?', 'Komodo', ['Harimau Sumatra', 'Gajah', 'Cenderawasih'], 'Umum'],
  ['Lambang sila pertama Pancasila?', 'Bintang', ['Rantai', 'Pohon beringin', 'Padi dan kapas'], 'Umum'],
  ['Selat yang memisahkan Pulau Jawa dan Sumatra?', 'Selat Sunda', ['Selat Bali', 'Selat Malaka', 'Selat Makassar'], 'Geografi'],
  ['Danau terbesar di Indonesia?', 'Danau Toba', ['Danau Poso', 'Danau Singkarak', 'Danau Maninjau'], 'Geografi'],
  ['Gunung Krakatau terletak di selat?', 'Sunda', ['Bali', 'Lombok', 'Karimata'], 'Geografi'],
  ['Kota Pahlawan adalah julukan untuk?', 'Surabaya', ['Bandung', 'Semarang', 'Medan'], 'Geografi'],
  ['Kota Kembang adalah julukan untuk?', 'Bandung', ['Bogor', 'Malang', 'Cirebon'], 'Geografi'],
  ['Pulau Dewata adalah julukan untuk?', 'Bali', ['Lombok', 'Sumba', 'Flores'], 'Geografi'],
];

const FLAGS = [
  ['🇮🇩', 'Indonesia'], ['🇯🇵', 'Jepang'], ['🇰🇷', 'Korea Selatan'], ['🇨🇳', 'Tiongkok'], ['🇮🇳', 'India'], ['🇹🇭', 'Thailand'],
  ['🇲🇾', 'Malaysia'], ['🇸🇬', 'Singapura'], ['🇵🇭', 'Filipina'], ['🇻🇳', 'Vietnam'], ['🇦🇺', 'Australia'], ['🇳🇿', 'Selandia Baru'],
  ['🇺🇸', 'Amerika Serikat'], ['🇨🇦', 'Kanada'], ['🇲🇽', 'Meksiko'], ['🇧🇷', 'Brasil'], ['🇦🇷', 'Argentina'], ['🇨🇱', 'Chili'],
  ['🇬🇧', 'Inggris'], ['🇫🇷', 'Prancis'], ['🇩🇪', 'Jerman'], ['🇮🇹', 'Italia'], ['🇪🇸', 'Spanyol'], ['🇵🇹', 'Portugal'],
  ['🇳🇱', 'Belanda'], ['🇧🇪', 'Belgia'], ['🇨🇭', 'Swiss'], ['🇸🇪', 'Swedia'], ['🇳🇴', 'Norwegia'], ['🇩🇰', 'Denmark'],
  ['🇷🇺', 'Rusia'], ['🇹🇷', 'Turki'], ['🇸🇦', 'Arab Saudi'], ['🇪🇬', 'Mesir'], ['🇿🇦', 'Afrika Selatan'], ['🇳🇬', 'Nigeria'],
  ['🇰🇪', 'Kenya'], ['🇲🇦', 'Maroko'], ['🇬🇷', 'Yunani'], ['🇵🇱', 'Polandia'], ['🇺🇦', 'Ukraina'], ['🇮🇷', 'Iran'],
  ['🇵🇰', 'Pakistan'], ['🇧🇩', 'Bangladesh'], ['🇱🇰', 'Sri Lanka'], ['🇳🇵', 'Nepal'], ['🇨🇺', 'Kuba'], ['🇨🇴', 'Kolombia'],
];

// kata untuk tebak kata (hangman) & acak kata — kategori: [kata...]
const WORDS = {
  Hewan: ['harimau', 'gajah', 'kucing', 'burung', 'kelinci', 'buaya', 'jerapah', 'kupu', 'ikan', 'komodo', 'orangutan', 'penyu', 'kerbau', 'bebek', 'monyet', 'singa'],
  Buah: ['mangga', 'durian', 'rambutan', 'pisang', 'jeruk', 'semangka', 'nanas', 'apel', 'manggis', 'salak', 'melon', 'anggur', 'pepaya', 'alpukat'],
  Kota: ['jakarta', 'bandung', 'surabaya', 'medan', 'makassar', 'palembang', 'semarang', 'yogyakarta', 'denpasar', 'pontianak', 'balikpapan', 'padang', 'malang', 'manado'],
  Benda: ['komputer', 'televisi', 'payung', 'jendela', 'sepatu', 'kulkas', 'lemari', 'kacamata', 'telepon', 'sendok', 'kursi', 'keyboard', 'bantal', 'sapu'],
  Makanan: ['rendang', 'bakso', 'sate', 'gado', 'nasi', 'soto', 'martabak', 'pempek', 'rawon', 'tempe', 'gudeg', 'siomay', 'cilok', 'lontong'],
};

// kata 5 huruf untuk Wordle versi Indonesia
const WORDLE = [
  'makan', 'minum', 'tidur', 'bunga', 'rumah', 'pagar', 'buaya', 'cinta', 'dunia', 'hujan', 'kabut', 'lampu', 'malam', 'nanas', 'obat',
  'pantai', 'pasir', 'sapi', 'tanah', 'udara', 'waktu', 'yakin', 'zebra', 'bumi', 'batas', 'cahaya', 'dapur', 'garam', 'hijau', 'jalan',
  'kapal', 'lemak', 'mobil', 'nakal', 'ombak', 'pukul', 'rajin', 'sabun', 'tebal', 'ujian', 'warna', 'api', 'bawah', 'cerah', 'daun',
  'enak', 'fajar', 'gigi', 'hutan', 'ikan', 'jamur', 'kaki', 'laut', 'meja', 'nasib', 'pisau', 'roti', 'surat', 'tahun', 'utara',
].filter((w) => w.length === 5);

const TRUTHS = [
  'Apa hal paling memalukan yang pernah kamu alami di sekolah/kantor?', 'Siapa orang terakhir yang kamu stalk di media sosial?',
  'Apa kebohongan terbesar yang pernah kamu ceritakan?', 'Lagu apa yang jadi guilty pleasure-mu?', 'Apa kebiasaan anehmu yang jarang orang tahu?',
  'Kalau bisa menukar hidup dengan seseorang di server ini selama sehari, siapa?', 'Apa ketakutan terbesarmu yang terdengar konyol?',
  'Pernah naksir teman sendiri? Ceritakan singkat!', 'Apa barang paling aneh yang pernah kamu beli online?', 'Kapan terakhir kali kamu menangis, dan kenapa?',
  'Hal apa yang paling kamu sesali tahun ini?', 'Apa nama panggilan paling memalukan yang pernah kamu punya?', 'Makanan apa yang kamu pura-pura suka padahal tidak?',
  'Apa mimpi teraneh yang pernah kamu ingat?', 'Siapa selebriti yang diam-diam kamu kagumi?',
];
const DARES = [
  'Kirim stiker paling random yang kamu punya ke channel ini.', 'Ganti nickname-mu jadi "Si Paling Sultan" selama 10 menit.', 'Tulis puisi 4 baris tentang gorengan.',
  'Kirim pesan voice note menirukan suara kucing (atau ketik "meow" 10x).', 'Tulis pesan selamat pagi ala pembawa berita di channel ini.',
  'Pakai emoji saja selama 5 menit berikutnya saat chat.', 'Ceritakan lelucon terbaikmu sekarang juga!', 'Deskripsikan harimu dalam 3 kata saja.',
  'Tebak-tebakan: buat satu tebak-tebakan dan biarkan yang lain menjawab.', 'Ketik alfabet mundur tanpa salah secepat mungkin.',
  'Sebutkan 5 nama hewan dalam 10 detik.', 'Ganti foto profilmu jadi gambar lucu selama 1 jam (kalau berani).',
];
const WYR = [
  ['Bisa terbang', 'Bisa menghilang'], ['Hidup tanpa musik', 'Hidup tanpa film'], ['Selalu telat 10 menit', 'Selalu kecepetan 20 menit'],
  ['Makan nasi terus tiap hari', 'Makan mi terus tiap hari'], ['Liburan di gunung', 'Liburan di pantai'], ['Punya banyak teman biasa', 'Punya 1 sahabat sejati'],
  ['Bisa baca pikiran', 'Bisa melihat masa depan'], ['Tidak pernah bisa pakai HP lagi', 'Tidak pernah bisa pakai internet'],
  ['Kaya tapi sibuk terus', 'Pas-pasan tapi santai'], ['Hidup di zaman dulu', 'Hidup di zaman masa depan'], ['Selalu kepedasan', 'Selalu kehujanan'],
  ['Bisa bicara dengan hewan', 'Bisa bicara semua bahasa manusia'],
];

module.exports = { QUIZ, FLAGS, WORDS, WORDLE, TRUTHS, DARES, WYR };
