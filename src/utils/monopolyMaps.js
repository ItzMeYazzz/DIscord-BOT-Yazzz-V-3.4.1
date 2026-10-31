'use strict';

/**
 * Peta (papan) Monopoly. Semua peta memakai tata letak 40 petak yang sama
 * (START=0, Penjara=10, Parkir=20, Masuk Penjara=30), tapi nama kota, harga, kartu,
 * aturan khusus, dan tema warna berbeda.
 *
 * Tiap peta: { id, name, emoji, desc, subtitle, theme, startCash, goSalary, jailFine,
 *              parkingPot, rentBoost, board, groups, groupMembers, rails, utils, chance, chest, tokens }
 */

const GROUPS = {
  brown: { name: 'Cokelat', color: '#8b5a2b', emoji: '🟫' },
  lightblue: { name: 'Biru Muda', color: '#9bd8f2', emoji: '🟦' },
  pink: { name: 'Pink', color: '#e0509f', emoji: '🩷' },
  orange: { name: 'Oranye', color: '#f08a24', emoji: '🟧' },
  red: { name: 'Merah', color: '#d62d2d', emoji: '🟥' },
  yellow: { name: 'Kuning', color: '#f4d03f', emoji: '🟨' },
  green: { name: 'Hijau', color: '#2e9e5b', emoji: '🟩' },
  darkblue: { name: 'Biru Tua', color: '#1f3fa6', emoji: '🔷' },
};

// Tangga harga & sewa standar (dikalikan `scale` per peta). [harga, biaya rumah, sewa 0..5 rumah]
const T = {
  b1: [60, 50, [2, 10, 30, 90, 160, 250]],
  b2: [60, 50, [4, 20, 60, 180, 320, 450]],
  l1: [100, 50, [6, 30, 90, 270, 400, 550]],
  l2: [100, 50, [6, 30, 90, 270, 400, 550]],
  l3: [120, 50, [8, 40, 100, 300, 450, 600]],
  p1: [140, 100, [10, 50, 150, 450, 625, 750]],
  p2: [140, 100, [10, 50, 150, 450, 625, 750]],
  p3: [160, 100, [12, 60, 180, 500, 700, 900]],
  o1: [180, 100, [14, 70, 200, 550, 750, 950]],
  o2: [180, 100, [14, 70, 200, 550, 750, 950]],
  o3: [200, 100, [16, 80, 220, 600, 800, 1000]],
  r1: [220, 150, [18, 90, 250, 700, 875, 1050]],
  r2: [220, 150, [18, 90, 250, 700, 875, 1050]],
  r3: [240, 150, [20, 100, 300, 750, 925, 1100]],
  y1: [260, 150, [22, 110, 330, 800, 975, 1150]],
  y2: [260, 150, [22, 110, 330, 800, 975, 1150]],
  y3: [280, 150, [24, 120, 360, 850, 1025, 1200]],
  g1: [300, 200, [26, 130, 390, 900, 1100, 1275]],
  g2: [300, 200, [26, 130, 390, 900, 1100, 1275]],
  g3: [320, 200, [28, 150, 450, 1000, 1200, 1400]],
  d1: [350, 200, [35, 175, 500, 1100, 1300, 1500]],
  d2: [400, 200, [50, 200, 600, 1400, 1700, 2000]],
};

// Urutan 40 petak: kunci tipe untuk dipetakan ke nama per peta
const LAYOUT = [
  'go', 'b1', 'chest', 'b2', 'tax1', 'rail1', 'l1', 'chance', 'l2', 'l3',
  'jail', 'p1', 'util1', 'p2', 'p3', 'rail2', 'o1', 'chest', 'o2', 'o3',
  'parking', 'r1', 'chance', 'r2', 'r3', 'rail3', 'y1', 'y2', 'util2', 'y3',
  'gotojail', 'g1', 'g2', 'chest', 'g3', 'rail4', 'chance', 'd1', 'tax2', 'd2',
];
const GROUP_OF = {
  b: 'brown', l: 'lightblue', p: 'pink', o: 'orange', r: 'red', y: 'yellow', g: 'green', d: 'darkblue',
};

/**
 * Bangun satu peta dari definisi ringkas.
 * def.names: { b1..d2 (22 properti), rail1..rail4, util1, util2, tax1, tax2 }
 */
function buildMap(def) {
  const scale = def.scale ?? 1;
  const r5 = (n) => Math.round(n * scale);
  const board = LAYOUT.map((key, index) => {
    if (key === 'go') return { type: 'go', name: def.labels?.go ?? 'START', index };
    if (key === 'jail') return { type: 'jail', name: def.labels?.jail ?? 'Penjara', index };
    if (key === 'parking') return { type: 'parking', name: def.labels?.parking ?? 'Parkir Gratis', index };
    if (key === 'gotojail') return { type: 'gotojail', name: def.labels?.gotojail ?? 'Masuk Penjara', index };
    if (key === 'chest') return { type: 'chest', name: def.labels?.chest ?? 'Dana Umum', index };
    if (key === 'chance') return { type: 'chance', name: def.labels?.chance ?? 'Kesempatan', index };
    if (key === 'tax1') return { type: 'tax', name: def.names.tax1, amount: r5(200), index };
    if (key === 'tax2') return { type: 'tax', name: def.names.tax2, amount: r5(100), index };
    if (key.startsWith('rail')) return { type: 'rail', name: def.names[key], price: r5(200), index };
    if (key.startsWith('util')) return { type: 'util', name: def.names[key], price: r5(150), index, icon: def.utilIcons?.[key] };
    const [price, house, rent] = T[key];
    return {
      type: 'property', name: def.names[key], group: GROUP_OF[key[0]], index,
      price: r5(price), house: r5(house), rent: rent.map(r5),
    };
  });

  const groupMembers = {};
  for (const sq of board) if (sq.type === 'property') (groupMembers[sq.group] ??= []).push(sq.index);
  const rails = board.filter((s) => s.type === 'rail').map((s) => s.index);
  const utils = board.filter((s) => s.type === 'util').map((s) => s.index);

  const idx = (key) => LAYOUT.indexOf(key);
  const pf = (n) => `**${def.names[n]}**`;
  const m = (n) => r5(n);
  const f = def.flavor;
  const go = def.labels?.go ?? 'START';

  const chance = [
    { text: `Maju ke **${go}**, terima ${'$'}${m(200)}.`, type: 'moveTo', target: 0 },
    { text: `Maju ke ${pf('r3')}. Lewat ${go} terima $${m(200)}.`, type: 'moveTo', target: idx('r3') },
    { text: `Maju ke ${pf('d2')}.`, type: 'moveTo', target: idx('d2') },
    { text: `Maju ke ${pf('rail1')}. Lewat ${go} terima $${m(200)}.`, type: 'moveTo', target: idx('rail1') },
    { text: `${f.railNear} Bayar sewa **2×** jika sudah ada pemiliknya.`, type: 'nearest', kind: 'rail' },
    { text: `${f.railNear} Bayar sewa **2×** jika sudah ada pemiliknya.`, type: 'nearest', kind: 'rail' },
    { text: `${f.utilNear} Jika dimiliki, bayar **10×** dadu.`, type: 'nearest', kind: 'util' },
    { text: f.gain1, type: 'money', amount: m(50) },
    { text: 'Kartu **Bebas dari Penjara**. Simpan sampai dibutuhkan.', type: 'jailCard' },
    { text: 'Mundur **3 petak**.', type: 'back', steps: 3 },
    { text: `Langsung **masuk ${def.labels?.jail ?? 'Penjara'}**. Tidak lewat ${go}.`, type: 'jail' },
    { text: f.repair1, type: 'repairs', house: m(25), hotel: m(100) },
    { text: f.loss1, type: 'money', amount: -m(15) },
    { text: f.payEach, type: 'payEach', amount: m(50) },
    { text: f.gain2, type: 'money', amount: m(150) },
    { text: f.gain3, type: 'money', amount: m(100) },
  ];
  const chest = [
    { text: f.chest1, type: 'money', amount: m(200) },
    { text: f.chestLoss1, type: 'money', amount: -m(50) },
    { text: f.chest2, type: 'money', amount: m(50) },
    { text: 'Kartu **Bebas dari Penjara**. Simpan sampai dibutuhkan.', type: 'jailCard' },
    { text: `Langsung **masuk ${def.labels?.jail ?? 'Penjara'}**. Tidak lewat ${go}.`, type: 'jail' },
    { text: f.chest3, type: 'money', amount: m(100) },
    { text: f.chest4, type: 'money', amount: m(20) },
    { text: f.collect, type: 'collectEach', amount: m(10) },
    { text: f.chest5, type: 'money', amount: m(100) },
    { text: f.chestLoss2, type: 'money', amount: -m(100) },
    { text: f.chestLoss3, type: 'money', amount: -m(50) },
    { text: f.chest6, type: 'money', amount: m(25) },
    { text: f.repair2, type: 'repairs', house: m(40), hotel: m(115) },
    { text: f.chest7, type: 'money', amount: m(10) },
    { text: f.chest8, type: 'money', amount: m(100) },
    { text: `Maju ke **${go}**, terima $${m(200)}.`, type: 'moveTo', target: 0 },
  ];

  return {
    id: def.id, name: def.name, emoji: def.emoji, desc: def.desc, subtitle: def.subtitle,
    theme: def.theme, tokens: def.tokens,
    startCash: def.startCash ?? 1500, goSalary: def.goSalary ?? r5(200), jailFine: def.jailFine ?? r5(50),
    parkingPot: !!def.parkingPot, rentBoost: def.rentBoost ?? 1, rule: def.rule ?? '',
    labels: def.labels ?? {}, groups: def.groupNames ? withNames(def.groupNames) : GROUPS,
    board, groupMembers, rails, utils, chance, chest,
  };
}

const withNames = (names) => Object.fromEntries(Object.entries(GROUPS).map(([k, g]) => [k, { ...g, name: names[k] ?? g.name }]));

const DEFAULT_TOKENS = [
  { emoji: '🚗', name: 'Mobil', color: '#e63946' },
  { emoji: '🛵', name: 'Motor', color: '#2a9d8f' },
  { emoji: '🚲', name: 'Sepeda', color: '#f4a261' },
  { emoji: '⛵', name: 'Perahu', color: '#457b9d' },
  { emoji: '🛺', name: 'Bajaj', color: '#8e44ad' },
  { emoji: '🚁', name: 'Heli', color: '#e9c46a' },
];

// ============================================================ 1. NUSANTARA (peta asli)
const nusantara = buildMap({
  id: 'nusantara', name: 'Nusantara', emoji: '🏝️', subtitle: 'Edisi Indonesia',
  desc: 'Peta klasik: kota-kota Indonesia dari Pontianak sampai Jakarta. Aturan standar.',
  theme: { bg: '#cfe5cf', center: '#e9f4e6', tile: '#f4faf1', line: '#2b3b2b', title: '#d62828', titleText: '#ffffff', sub: '#385', railIcon: '═╬═' },
  tokens: DEFAULT_TOKENS,
  names: {
    b1: 'Pontianak', b2: 'Samarinda', l1: 'Banjarmasin', l2: 'Kupang', l3: 'Manado',
    p1: 'Padang', p2: 'Palembang', p3: 'Pekanbaru', o1: 'Makassar', o2: 'Batam', o3: 'Balikpapan',
    r1: 'Semarang', r2: 'Solo', r3: 'Yogyakarta', y1: 'Malang', y2: 'Denpasar', y3: 'Bogor',
    g1: 'Bandung', g2: 'Surabaya', g3: 'Medan', d1: 'Bali', d2: 'Jakarta',
    rail1: 'Stasiun Gambir', rail2: 'Stasiun Bandung', rail3: 'Stasiun Surabaya', rail4: 'Stasiun Yogyakarta',
    util1: 'PLN Listrik', util2: 'PDAM Air', tax1: 'Pajak Penghasilan', tax2: 'Pajak Mewah',
  },
  utilIcons: { util1: '⚡', util2: '≋' },
  flavor: {
    railNear: 'Maju ke stasiun terdekat.', utilNear: 'Maju ke utilitas terdekat.',
    gain1: 'Bank membayar dividen **$50**.', loss1: 'Denda ngebut **$15**.', repair1: 'Renovasi properti: bayar **$25** per rumah dan **$100** per hotel.',
    payEach: 'Kamu terpilih jadi ketua RT: bayar **$50** ke setiap pemain.', gain2: 'Pinjaman bangunan jatuh tempo: terima **$150**.', gain3: 'Menang undian arisan: terima **$100**.',
    chest1: 'Kesalahan bank menguntungkanmu: terima **$200**.', chestLoss1: 'Biaya dokter: bayar **$50**.', chest2: 'Jual saham: terima **$50**.',
    chest3: 'Dana liburan cair: terima **$100**.', chest4: 'Pengembalian pajak: terima **$20**.', collect: 'Hari ulang tahunmu: terima **$10** dari setiap pemain.',
    chest5: 'Asuransi jatuh tempo: terima **$100**.', chestLoss2: 'Biaya rumah sakit: bayar **$100**.', chestLoss3: 'Biaya sekolah: bayar **$50**.',
    chest6: 'Komisi konsultasi: terima **$25**.', repair2: 'Perbaikan jalan: bayar **$40** per rumah dan **$115** per hotel.',
    chest7: 'Juara 2 lomba kecantikan: terima **$10**.', chest8: 'Warisan keluarga: terima **$100**.',
  },
});

// ============================================================ 2. DUNIA
const dunia = buildMap({
  id: 'dunia', name: 'Keliling Dunia', emoji: '🌍', subtitle: 'World Tour',
  desc: 'Jelajahi kota-kota dunia dengan bandara internasional. Pajak lebih galak, gaji START lebih besar.',
  theme: { bg: '#cfe0f5', center: '#eaf2fc', tile: '#f6f9fe', line: '#1d3557', title: '#1d4e89', titleText: '#ffffff', sub: '#2a5d9f', railIcon: '✈' },
  tokens: [
    { emoji: '✈️', name: 'Pesawat', color: '#e63946' }, { emoji: '🚢', name: 'Kapal', color: '#2a9d8f' },
    { emoji: '🚄', name: 'Kereta Cepat', color: '#f4a261' }, { emoji: '🎈', name: 'Balon Udara', color: '#457b9d' },
    { emoji: '🏍️', name: 'Motor', color: '#8e44ad' }, { emoji: '🛶', name: 'Kano', color: '#e9c46a' },
  ],
  goSalary: 250, jailFine: 75, startCash: 1800,
  rule: '✈️ Gaji START **$250**, denda penjara **$75**, uang awal **$1.800**.',
  names: {
    b1: 'Kairo', b2: 'Nairobi', l1: 'Mumbai', l2: 'Bangkok', l3: 'Singapura',
    p1: 'Istanbul', p2: 'Athena', p3: 'Roma', o1: 'Madrid', o2: 'Berlin', o3: 'Amsterdam',
    r1: 'Seoul', r2: 'Beijing', r3: 'Sydney', y1: 'Toronto', y2: 'Rio', y3: 'Dubai',
    g1: 'Paris', g2: 'London', g3: 'Los Angeles', d1: 'Tokyo', d2: 'New York',
    rail1: 'Bandara Soekarno-Hatta', rail2: 'Bandara Heathrow', rail3: 'Bandara Changi', rail4: 'Bandara JFK',
    util1: 'Satelit Global', util2: 'Kabel Laut', tax1: 'Pajak Bea Cukai', tax2: 'Biaya Visa',
  },
  utilIcons: { util1: '✦', util2: '≋' },
  labels: { go: 'START', jail: 'Imigrasi', parking: 'Lounge VIP', gotojail: 'Ke Imigrasi' },
  flavor: {
    railNear: 'Terbang ke bandara terdekat.', utilNear: 'Maju ke layanan terdekat.',
    gain1: 'Cashback kartu kredit: terima **$50**.', loss1: 'Bagasi kelebihan berat: bayar **$15**.', repair1: 'Renovasi hotel: bayar **$25** per rumah dan **$100** per hotel.',
    payEach: 'Kamu traktir semua rekan perjalanan: bayar **$50** ke setiap pemain.', gain2: 'Klaim asuransi perjalanan: terima **$150**.', gain3: 'Tiket promo kamu laku dijual: terima **$100**.',
    chest1: 'Kurs menguntungkanmu: terima **$200**.', chestLoss1: 'Biaya vaksin & asuransi: bayar **$50**.', chest2: 'Jual suvenir: terima **$50**.',
    chest3: 'Hadiah lomba foto travel: terima **$100**.', chest4: 'Refund tiket: terima **$20**.', collect: 'Ulang tahunmu di perjalanan: terima **$10** dari setiap pemain.',
    chest5: 'Bonus pemandu wisata: terima **$100**.', chestLoss2: 'Biaya rumah sakit luar negeri: bayar **$100**.', chestLoss3: 'Taksi bandara mahal: bayar **$50**.',
    chest6: 'Komisi penerjemah: terima **$25**.', repair2: 'Pajak properti: bayar **$40** per rumah dan **$115** per hotel.',
    chest7: 'Juara 2 lomba masak: terima **$10**.', chest8: 'Warisan dari paman di luar negeri: terima **$100**.',
  },
});

// ============================================================ 3. JAKARTA
const jakarta = buildMap({
  id: 'jakarta', name: 'Jakarta Raya', emoji: '🌆', subtitle: 'Jakarta Edition',
  desc: 'Kuasai kawasan-kawasan Ibu Kota! Jackpot Parkir: pajak & denda masuk kas parkir, siapa mampir menang semuanya.',
  theme: { bg: '#e7d9c4', center: '#f3eadb', tile: '#fbf6ec', line: '#4a3b2a', title: '#c0392b', titleText: '#fff6e0', sub: '#7a5c3a', railIcon: '═╬═' },
  tokens: [
    { emoji: '🛺', name: 'Bajaj', color: '#e63946' }, { emoji: '🚌', name: 'TransJakarta', color: '#2a9d8f' },
    { emoji: '🛵', name: 'Ojol', color: '#f4a261' }, { emoji: '🚆', name: 'KRL', color: '#457b9d' },
    { emoji: '🚕', name: 'Taksi', color: '#8e44ad' }, { emoji: '🚲', name: 'Ontel', color: '#e9c46a' },
  ],
  parkingPot: true,
  rule: '🅿️ **Jackpot Parkir**: semua pajak & denda masuk kas Parkir. Mendarat di Parkir = ambil seluruh kas!',
  names: {
    b1: 'Kampung Melayu', b2: 'Tanah Abang', l1: 'Kebayoran Lama', l2: 'Cempaka Putih', l3: 'Kelapa Gading',
    p1: 'Rawamangun', p2: 'Cikini', p3: 'Matraman', o1: 'Tebet', o2: 'Pasar Minggu', o3: 'Kemang',
    r1: 'Blok M', r2: 'Senayan', r3: 'Menteng', y1: 'Kuningan', y2: 'Tomang', y3: 'Pluit',
    g1: 'Pondok Indah', g2: 'Kota Tua', g3: 'Ancol', d1: 'SCBD', d2: 'Bundaran HI',
    rail1: 'Stasiun Gambir', rail2: 'Stasiun Manggarai', rail3: 'Stasiun MRT Bundaran HI', rail4: 'Terminal Pulogebang',
    util1: 'PLN Jakarta', util2: 'PAM Jaya', tax1: 'PBB Tahunan', tax2: 'Denda Ganjil-Genap',
  },
  utilIcons: { util1: '⚡', util2: '≋' },
  labels: { go: 'START', jail: 'Rutan', parking: 'Jackpot Parkir', gotojail: 'Ke Rutan' },
  flavor: {
    railNear: 'Naik transportasi umum ke stasiun terdekat.', utilNear: 'Maju ke utilitas terdekat.',
    gain1: 'Dividen BUMD Jakarta: terima **$50**.', loss1: 'Tilang parkir liar: bayar **$15**.', repair1: 'Renovasi gedung: bayar **$25** per rumah dan **$100** per hotel.',
    payEach: 'Kamu traktir kopi satu RW: bayar **$50** ke setiap pemain.', gain2: 'Ganti rugi proyek MRT: terima **$150**.', gain3: 'Menang undian Jakarta Fair: terima **$100**.',
    chest1: 'Tanahmu kena pembebasan lahan: terima **$200**.', chestLoss1: 'Banjir bulanan: bayar **$50** perbaikan.', chest2: 'Jual saham di bursa: terima **$50**.',
    chest3: 'Bonus akhir tahun: terima **$100**.', chest4: 'Restitusi pajak: terima **$20**.', collect: 'Syukuran HUT Jakarta: terima **$10** dari setiap pemain.',
    chest5: 'Asuransi cair: terima **$100**.', chestLoss2: 'Biaya rumah sakit: bayar **$100**.', chestLoss3: 'Biaya sekolah: bayar **$50**.',
    chest6: 'Komisi makelar: terima **$25**.', repair2: 'Normalisasi kali: bayar **$40** per rumah dan **$115** per hotel.',
    chest7: 'Juara 2 lomba Abang None: terima **$10**.', chest8: 'Warisan keluarga Betawi: terima **$100**.',
  },
});

// ============================================================ 4. ANTARIKSA
const antariksa = buildMap({
  id: 'antariksa', name: 'Antariksa', emoji: '🚀', subtitle: 'Space Frontier',
  desc: 'Bangun koloni di planet & bulan! Semua angka lebih besar (×2), sewa sedikit lebih mahal, uang awal melimpah.',
  theme: { bg: '#141a33', center: '#1d2547', tile: '#242d57', line: '#8892d6', title: '#7c4dff', titleText: '#ffffff', sub: '#aab4ff', text: '#e8ecff', price: '#c5ccff', railIcon: '☄' },
  tokens: [
    { emoji: '🚀', name: 'Roket', color: '#ff5d73' }, { emoji: '🛸', name: 'UFO', color: '#2ee6c5' },
    { emoji: '🛰️', name: 'Satelit', color: '#ffb347' }, { emoji: '☄️', name: 'Komet', color: '#6ea8ff' },
    { emoji: '👨‍🚀', name: 'Astronot', color: '#c77dff' }, { emoji: '🌠', name: 'Meteor', color: '#ffe066' },
  ],
  scale: 2, startCash: 3000, goSalary: 400, jailFine: 100, rentBoost: 1,
  rule: '🚀 Semua harga **×2**, uang awal **$3.000**, gaji START **$400**.',
  names: {
    b1: 'Bulan', b2: 'Phobos', l1: 'Deimos', l2: 'Merkurius', l3: 'Venus',
    p1: 'Mars', p2: 'Ceres', p3: 'Vesta', o1: 'Jupiter', o2: 'Europa', o3: 'Ganymede',
    r1: 'Callisto', r2: 'Io', r3: 'Saturnus', y1: 'Titan', y2: 'Enceladus', y3: 'Uranus',
    g1: 'Triton', g2: 'Neptunus', g3: 'Pluto', d1: 'Proxima b', d2: 'Andromeda',
    rail1: 'Stasiun ISS', rail2: 'Gerbang Lunar', rail3: 'Pangkalan Mars', rail4: 'Portal Warp',
    util1: 'Reaktor Fusi', util2: 'Tambang Es', tax1: 'Pajak Bahan Bakar', tax2: 'Denda Debu Kosmik',
  },
  utilIcons: { util1: '☢', util2: '❄' },
  groupNames: { brown: 'Satelit Kecil', lightblue: 'Planet Dalam', pink: 'Planet Merah', orange: 'Raksasa Gas', red: 'Bulan Es', yellow: 'Cincin Saturnus', green: 'Dunia Jauh', darkblue: 'Galaksi' },
  labels: { go: 'LAUNCH', jail: 'Karantina', parking: 'Orbit Santai', gotojail: 'Ke Karantina', chance: 'Sinyal Misterius', chest: 'Kapsul Logistik' },
  flavor: {
    railNear: 'Warp ke stasiun terdekat.', utilNear: 'Maju ke fasilitas energi terdekat.',
    gain1: 'Hadiah misi sains: terima **$100**.', loss1: 'Denda sampah antariksa: bayar **$30**.', repair1: 'Perbaikan modul koloni: bayar **$50** per rumah dan **$200** per hotel.',
    payEach: 'Kamu traktir seluruh kru makanan beku: bayar **$100** ke setiap pemain.', gain2: 'Kontrak penambangan asteroid: terima **$300**.', gain3: 'Menang lotre galaksi: terima **$200**.',
    chest1: 'Penemuan mineral langka: terima **$400**.', chestLoss1: 'Kebocoran oksigen: bayar **$100**.', chest2: 'Jual data teleskop: terima **$100**.',
    chest3: 'Subsidi koloni: terima **$200**.', chest4: 'Pengembalian bahan bakar: terima **$40**.', collect: 'Ulang tahun kru: terima **$20** dari setiap pemain.',
    chest5: 'Klaim asuransi roket: terima **$200**.', chestLoss2: 'Biaya medis gravitasi nol: bayar **$200**.', chestLoss3: 'Biaya pelatihan astronot: bayar **$100**.',
    chest6: 'Royalti paten: terima **$50**.', repair2: 'Perisai radiasi: bayar **$80** per rumah dan **$230** per hotel.',
    chest7: 'Juara 2 lomba balap roket: terima **$20**.', chest8: 'Warisan dari koloni lama: terima **$200**.',
  },
});

// ============================================================ 5. SAMUDRA
const samudra = buildMap({
  id: 'samudra', name: 'Samudra Bajak Laut', emoji: '🏴‍☠️', subtitle: 'Pirate Seas',
  desc: 'Jarah pulau-pulau harta karun! Sewa ×1,5 lebih galak — game lebih cepat bangkrut, harta lebih cepat berpindah.',
  theme: { bg: '#bcd9d6', center: '#dff0ec', tile: '#f1faf7', line: '#1f4e5f', title: '#7a3e12', titleText: '#ffe7b8', sub: '#2f6f6a', railIcon: '⚓' },
  tokens: [
    { emoji: '🏴‍☠️', name: 'Kapal Hantu', color: '#e63946' }, { emoji: '⛵', name: 'Sekoci', color: '#2a9d8f' },
    { emoji: '🦜', name: 'Beo', color: '#f4a261' }, { emoji: '🐙', name: 'Kraken', color: '#8e44ad' },
    { emoji: '💎', name: 'Permata', color: '#457b9d' }, { emoji: '🗡️', name: 'Pedang', color: '#e9c46a' },
  ],
  rentBoost: 1.5, startCash: 1500, goSalary: 200, jailFine: 50,
  rule: '🏴‍☠️ Semua **sewa ×1,5** — harta berpindah lebih cepat!',
  names: {
    b1: 'Pulau Kerang', b2: 'Teluk Karang', l1: 'Laguna Biru', l2: 'Pantai Mutiara', l3: 'Muara Buaya',
    p1: 'Benteng Karat', p2: 'Dermaga Tua', p3: 'Teluk Badai', o1: 'Gua Harta', o2: 'Pulau Tengkorak', o3: 'Karang Hiu',
    r1: 'Pelabuhan Rum', r2: 'Selat Kabut', r3: 'Tebing Elang', y1: 'Pulau Emas', y2: 'Atol Perak', y3: 'Teluk Permata',
    g1: 'Kota Corsair', g2: 'Benteng Naga', g3: 'Pulau Misteri', d1: 'Palung Kraken', d2: 'Istana Raja Laut',
    rail1: 'Dermaga Utara', rail2: 'Dermaga Timur', rail3: 'Dermaga Selatan', rail4: 'Dermaga Barat',
    util1: 'Mercusuar', util2: 'Sumur Air Tawar', tax1: 'Upeti Kapten', tax2: 'Denda Bea Laut',
  },
  utilIcons: { util1: '⚑', util2: '≋' },
  groupNames: { brown: 'Pasir', lightblue: 'Laguna', pink: 'Karang Pink', orange: 'Gua Harta', red: 'Pelabuhan Merah', yellow: 'Pulau Emas', green: 'Hutan Bakau', darkblue: 'Palung Dalam' },
  labels: { go: 'BERLAYAR', jail: 'Brig Kapal', parking: 'Teluk Santai', gotojail: 'Ke Brig', chance: 'Peta Harta', chest: 'Peti Kapten' },
  flavor: {
    railNear: 'Berlayar ke dermaga terdekat.', utilNear: 'Maju ke fasilitas terdekat.',
    gain1: 'Hasil menjarah kapal dagang: terima **$50**.', loss1: 'Layar sobek: bayar **$15**.', repair1: 'Perbaikan kapal: bayar **$25** per rumah dan **$100** per hotel.',
    payEach: 'Kamu traktir seluruh awak rum: bayar **$50** ke setiap pemain.', gain2: 'Menemukan peta harta karun: terima **$150**.', gain3: 'Menang taruhan adu ayam di dermaga: terima **$100**.',
    chest1: 'Peti emas terdampar di pantai: terima **$200**.', chestLoss1: 'Biaya tabib kapal: bayar **$50**.', chest2: 'Jual rampasan: terima **$50**.',
    chest3: 'Bagi hasil jarahan: terima **$100**.', chest4: 'Pengembalian upeti: terima **$20**.', collect: 'Pesta ulang tahun kapten: terima **$10** dari setiap pemain.',
    chest5: 'Hadiah dari gubernur: terima **$100**.', chestLoss2: 'Kapal bocor, biaya tambal: bayar **$100**.', chestLoss3: 'Gaji awak kapal: bayar **$50**.',
    chest6: 'Komisi penyelundup: terima **$25**.', repair2: 'Perbaikan benteng: bayar **$40** per rumah dan **$115** per hotel.',
    chest7: 'Juara 2 lomba minum rum: terima **$10**.', chest8: 'Warisan peta dari kakek bajak laut: terima **$100**.',
  },
});

for (const m of Object.values({ nusantara, dunia, jakarta, antariksa, samudra })) {
  m.theme = { text: '#1b2a1b', price: '#333', ...m.theme };
}

const MAPS = { nusantara, dunia, jakarta, antariksa, samudra };
const MAP_LIST = Object.values(MAPS);
const DEFAULT_MAP = 'nusantara';
const getMap = (id) => MAPS[id] ?? MAPS[DEFAULT_MAP];
const isOwnable = (sq) => sq.type === 'property' || sq.type === 'rail' || sq.type === 'util';

module.exports = { MAPS, MAP_LIST, DEFAULT_MAP, getMap, GROUPS, isOwnable, buildMap };
