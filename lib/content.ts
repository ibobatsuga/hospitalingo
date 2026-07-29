export type Domain = "hotel" | "restaurant";

export type HospitalityTerm = {
  id: string;
  term: string;
  domain: Domain;
  meaning: string;
  workplaceUse: string;
  example: string;
  sourcePage: number;
};

export type Lesson = {
  id: string;
  number: number;
  domain: Domain;
  title: string;
  subtitle: string;
  durationMinutes: number;
  termIds: string[];
  guestLine: string;
  listeningQuestion: string;
  listeningOptions: string[];
  listeningAnswer: number;
  grammarPrompt: string;
  grammarOptions: string[];
  grammarAnswer: number;
  speakingPrompt: string;
  modelAnswer: string;
  roleScenario: {
    role: string;
    objective: string;
    guestMessage: string;
    safetyRule: string;
  };
};

export const hospitalityTerms: HospitalityTerm[] = [
  {
    id: "walk-in-guest",
    term: "Walk-in guest",
    domain: "hotel",
    meaning: "Calon tamu yang datang langsung tanpa reservasi sebelumnya.",
    workplaceUse: "Dipakai ketika memeriksa ketersediaan kamar dan menjelaskan harga saat kedatangan.",
    example: "Let me check which rooms are available for a walk-in guest tonight.",
    sourcePage: 88,
  },
  {
    id: "room-assignment",
    term: "Room assignment",
    domain: "hotel",
    meaning: "Proses menentukan kamar tertentu sesuai kategori, preferensi, dan kesiapan kamar.",
    workplaceUse: "Dipakai saat mengalokasikan kamar sebelum atau ketika tamu check-in.",
    example: "Your room assignment is ready, and the room has been inspected.",
    sourcePage: 85,
  },
  {
    id: "early-check-in",
    term: "Early check-in",
    domain: "hotel",
    meaning: "Akses kamar sebelum waktu check-in standar, bergantung pada kebijakan dan ketersediaan.",
    workplaceUse: "Jangan menjanjikan kamar sebelum status kesiapan dikonfirmasi.",
    example: "Early check-in is subject to room availability.",
    sourcePage: 94,
  },
  {
    id: "handling-guest-complaint",
    term: "Handling guest complaint",
    domain: "hotel",
    meaning: "Proses mendengarkan, mencatat, dan menyelesaikan ketidakpuasan tamu secara empatik.",
    workplaceUse: "Dipakai untuk memulihkan kepercayaan tanpa memberi janji di luar kewenangan.",
    example: "I understand your concern. Let me check what I can arrange for you.",
    sourcePage: 131,
  },
  {
    id: "cover",
    term: "Cover",
    domain: "restaurant",
    meaning: "Satu tamu yang dilayani di outlet dalam periode tertentu.",
    workplaceUse: "Dipakai untuk menghitung jumlah tamu, beban kerja, dan penggunaan kapasitas restoran.",
    example: "We served eighty covers during breakfast.",
    sourcePage: 357,
  },
  {
    id: "open-check",
    term: "Open check",
    domain: "restaurant",
    meaning: "Transaksi POS yang masih aktif dan belum ditutup melalui pembayaran.",
    workplaceUse: "Dipakai ketika pesanan masih berjalan dan item baru masih dapat ditambahkan.",
    example: "Please keep the check open because the guests may order dessert.",
    sourcePage: 368,
  },
  {
    id: "void",
    term: "Void",
    domain: "restaurant",
    meaning: "Pembatalan item atau transaksi POS yang harus memiliki alasan dan otorisasi yang jelas.",
    workplaceUse: "Jangan melakukan void tanpa mengikuti approval dan audit trail outlet.",
    example: "The supervisor approved the void after the guest changed the order.",
    sourcePage: 370,
  },
  {
    id: "beo",
    term: "Banquet Event Order (BEO)",
    domain: "restaurant",
    meaning: "Dokumen operasional acara yang merangkum jadwal, tata ruang, menu, peralatan, dan instruksi khusus.",
    workplaceUse: "Dipakai sebagai acuan bersama lintas departemen sebelum dan selama acara.",
    example: "Please confirm the coffee-break timing in the latest BEO.",
    sourcePage: 378,
  },
];

export const lessons: Lesson[] = [
  {
    id: "restaurant-allergy-request",
    number: 1,
    domain: "restaurant",
    title: "Handle an allergy request",
    subtitle: "Respond safely without guessing ingredients",
    durationMinutes: 12,
    termIds: ["open-check", "void", "cover"],
    guestLine: "Excuse me, does this chicken satay contain peanuts? I have a serious allergy.",
    listeningQuestion: "What must the server confirm before taking the order?",
    listeningOptions: ["The table number", "The ingredients with the kitchen", "The guest's room rate"],
    listeningAnswer: 1,
    grammarPrompt: "Choose the safest and most natural response.",
    grammarOptions: [
      "This dish is safe, I think.",
      "Let me check with the kitchen whether this dish contains peanuts.",
      "You can try a little first.",
    ],
    grammarAnswer: 1,
    speakingPrompt: "Tell the guest what you will do next. Do not guess or promise that the dish is safe.",
    modelAnswer: "Thank you for telling me. Let me check the ingredients with the kitchen before I confirm your order.",
    roleScenario: {
      role: "Restaurant server",
      objective: "Acknowledge the allergy, avoid guessing, and escalate the ingredient check to the kitchen.",
      guestMessage: "I need to know whether the sauce contains peanuts before I order.",
      safetyRule: "Never declare a dish allergen-free without an approved kitchen confirmation.",
    },
  },
  {
    id: "hotel-walk-in-arrival",
    number: 2,
    domain: "hotel",
    title: "Welcome a walk-in guest",
    subtitle: "Check availability without overpromising",
    durationMinutes: 12,
    termIds: ["walk-in-guest", "room-assignment", "early-check-in"],
    guestLine: "Good evening. I do not have a reservation. Do you have a room available tonight?",
    listeningQuestion: "What should the front desk agent check first?",
    listeningOptions: ["The guest's restaurant bill", "Current room availability", "A banquet schedule"],
    listeningAnswer: 1,
    grammarPrompt: "Choose the response that is polite and operationally accurate.",
    grammarOptions: [
      "Yes, your room is guaranteed.",
      "Let me check our current availability and the rate for tonight.",
      "You need to book online first.",
    ],
    grammarAnswer: 1,
    speakingPrompt: "Welcome the guest and explain that you will check availability and tonight's rate.",
    modelAnswer: "Good evening. I will be happy to check our current room availability and the best available rate for tonight.",
    roleScenario: {
      role: "Front desk agent",
      objective: "Welcome the walk-in guest, verify availability, and avoid guaranteeing a room before checking.",
      guestMessage: "I have had a long trip. Can I get a room right away?",
      safetyRule: "Do not promise a room, upgrade, or early access before availability and room status are confirmed.",
    },
  },
];

export function getLesson(domain?: Domain, lessonNumber = 1): Lesson {
  if (domain) return lessons.find((lesson) => lesson.domain === domain) ?? lessons[0];
  return lessons[(Math.max(1, lessonNumber) - 1) % lessons.length];
}

export function getTerms(ids: string[]): HospitalityTerm[] {
  return ids.flatMap((id) => {
    const term = hospitalityTerms.find((entry) => entry.id === id);
    return term ? [term] : [];
  });
}

export function scoreHospitalityResponse(transcript: string, domain: Domain) {
  const normalized = transcript.trim().toLowerCase();
  const hasText = normalized.split(/\s+/).filter(Boolean).length >= 5;
  const polite = /thank you|please|let me|i understand|happy to|good (morning|afternoon|evening)/.test(normalized);
  const safeRestaurant = /check|confirm/.test(normalized) && /kitchen|ingredient/.test(normalized);
  const safeHotel = /check|confirm/.test(normalized) && /availability|available|room/.test(normalized);
  const safetyMet = domain === "restaurant" ? safeRestaurant : safeHotel;
  const riskyRestaurant = /is safe|allergen[- ]free|no peanut|does not contain/.test(normalized) && !safeRestaurant;
  const riskyHotel = /guarantee|definitely available|your room is ready/.test(normalized) && !safeHotel;
  const criticalError = domain === "restaurant" ? riskyRestaurant : riskyHotel;
  const score = Math.max(0, Math.min(100, 45 + (hasText ? 15 : 0) + (polite ? 15 : 0) + (safetyMet ? 25 : 0) - (criticalError ? 40 : 0)));

  return {
    score,
    status: criticalError ? "Needs practice" : score >= 75 ? "Ready" : "Developing",
    criticalError,
    corrections: [
      !polite ? "Open with a polite acknowledgement before explaining the next step." : null,
      !safetyMet
        ? domain === "restaurant"
          ? "Say that you will check the ingredients with the kitchen."
          : "Say that you will check current room availability before confirming."
        : null,
      !hasText ? "Give a complete response of at least one clear sentence." : null,
    ].filter((value): value is string => Boolean(value)).slice(0, 3),
  };
}

