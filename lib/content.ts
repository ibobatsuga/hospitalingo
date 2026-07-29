import { generatedGlossary } from "./generated-glossary";

export type Domain = "hotel" | "restaurant";

export type HospitalityTerm = {
  id: string;
  sourceNumber: number;
  term: string;
  department: string;
  subcategory: string;
  domain: Domain;
  meaning: string;
  workplaceUse: string;
  controlNote: string;
  example: string;
  sourcePage: number;
};

export type Lesson = {
  id: string;
  number: number;
  trackNumber: number;
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

function sentenceFor(term: string, domain: Domain) {
  const natural = term.toLowerCase().replace(/\s*\([^)]*\)/g, "").trim();
  return domain === "restaurant"
    ? `Let me confirm the ${natural} with the restaurant team before I update you.`
    : `Let me check the ${natural} in our hotel system before I confirm it for you.`;
}

export const hospitalityTerms: HospitalityTerm[] = generatedGlossary.map((entry) => ({
  ...entry,
  domain: entry.domain as Domain,
  example: sentenceFor(entry.term, entry.domain as Domain),
}));

type LessonSeed = {
  title: string;
  subtitle: string;
  terms: string[];
  guestMessage: string;
  objective: string;
};

const hotelSeeds: LessonSeed[] = [
  ["Confirm a reservation", "Verify the booking before making promises", ["RESERVATION", "CONFIRMATION LETTER", "GUEST IDENTITY VERIFICATION"], "I booked online. Can you find my reservation?", "Verify the booking details and explain the next step."],
  ["Welcome a walk-in guest", "Check availability without overpromising", ["WALK-IN GUEST", "ROOM ASSIGNMENT", "ROOM STATUS (CLEAN, DIRTY, INSPECTED)"], "I do not have a booking. Is a room available tonight?", "Welcome the guest and check live room availability."],
  ["Explain early check-in", "Set expectations with empathy", ["EARLY CHECK-IN", "ROOM STATUS (CLEAN, DIRTY, INSPECTED)", "PRE-ARRIVAL ENGAGEMENT"], "Can I enter my room at ten this morning?", "Explain that early access depends on room readiness and policy."],
  ["Handle a room assignment", "Match the room to confirmed needs", ["ROOM ASSIGNMENT", "PRE-ASSIGNMENT & BLOCKING", "CONNECTING & ADJACENT ROOMS"], "We need two rooms next to each other.", "Check the request and explain what can be confirmed."],
  ["Manage a special request", "Record and coordinate guest preferences", ["SPECIAL REQUEST COORDINATION", "GUEST REQUEST LOGGING (G-LOG)", "FRONT OFFICE COMMUNICATION LOG (LOG BOOK)"], "Could you arrange a baby cot before we arrive?", "Acknowledge, record, and coordinate the request."],
  ["Offer a room upgrade", "Upsell transparently", ["ROOM UPGRADE & DOWNGRADE", "UP-SELLING (FRONT DESK EXECUTION)", "BEST AVAILABLE RATE (BAR)"], "Do you have a room with a better view?", "Present an available upgrade and its price clearly."],
  ["Process a late check-out", "Check policy and availability first", ["LATE CHECK-OUT", "DEPARTURE LIST", "ROOM READINESS TIME"], "May I keep the room until four o'clock?", "Check availability and explain any applicable charge."],
  ["Respond to a guest complaint", "Recover service without false promises", ["HANDLING GUEST COMPLAINT", "SERVICE RECOVERY PARADOX", "GUEST FEEDBACK LOOP"], "The air conditioner has not worked all night.", "Acknowledge the impact, log the issue, and offer an authorized next step."],
  ["Log a maintenance problem", "Coordinate an urgent room issue", ["WORK ORDER (WO)", "CORRECTIVE MAINTENANCE", "DOWNTIME"], "There is water leaking under the bathroom sink.", "Confirm the location and escalate a work order."],
  ["Protect guest privacy", "Verify identity before sharing information", ["DATA PRIVACY & COMPLIANCE (PDP/GDPR)", "GUEST IDENTITY VERIFICATION", "GUEST HISTORY & PROFILE MANAGEMENT"], "Can you tell me which room Mr. Arif is staying in?", "Protect guest information and offer a safe alternative."],
  ["Coordinate luggage storage", "Tag and secure every item", ["GUEST LUGGAGE HANDLING", "BAGGAGE STORAGE POLICY", "BELL DESK CONTROL"], "Can you keep these bags after I check out?", "Explain the storage and collection procedure."],
  ["Arrange transportation", "Confirm timing and destination", ["SHUTTLE & TRANSPORTATION COORDINATION", "PORTER SERVICE", "CONCIERGE INFORMATION SERVICE"], "I need a car to the airport at five tomorrow morning.", "Confirm the journey details and transport arrangement."],
  ["Handle lost property", "Create a clear audit trail", ["LOST & FOUND LOGIC", "GUEST REQUEST LOGGING (G-LOG)", "FRONT OFFICE SHIFT HANDOVER"], "I think I left my watch in room 612.", "Collect accurate details and explain the search process."],
  ["Give a wake-up call", "Repeat time and room details", ["MORNING CALL SERVICE (WAKE-UP CALL)", "TELEPHONE ETIQUETTE & PBX LOGIC", "IN-HOUSE GUEST MANAGEMENT"], "Please wake me at six fifteen tomorrow.", "Repeat and confirm the wake-up call details."],
  ["Explain a deposit", "Communicate payment holds accurately", ["ADVANCE DEPOSIT POLICY", "CREDIT CARD PRE-AUTHORIZATION", "AUTHORIZATION HOLD VS CHARGE"], "Why is there an extra amount pending on my card?", "Explain the difference between a hold and a charge."],
  ["Handle a cancellation", "Apply the booked rate conditions", ["CANCELLATION POLICY GOVERNANCE", "REFUNDABLE VS NON-REFUNDABLE RATE", "AMENDMENT HANDLING"], "I need to cancel tonight. Will I get a refund?", "Check the reservation terms before explaining the outcome."],
  ["Explain a no-show charge", "Use the reservation record", ["NO-SHOW", "GUARANTEED VS NON-GUARANTEED RESERVATION", "RESERVATION AUDIT TRAIL"], "I did not arrive yesterday. Why was I charged?", "Explain the confirmed guarantee and no-show terms."],
  ["Complete guest check-in", "Verify, register, and orient", ["CHECK-IN PROCEDURE", "REGISTRATION CARD (REGCARD)", "ROOM KEY MANAGEMENT"], "What do you need from me to check in?", "Guide the guest through a secure check-in."],
  ["Resolve a room discrepancy", "Check two operational records", ["ROOM DISCREPANCY", "HOUSEKEEPING STATUS", "ROOM INSPECTION"], "The system says the room is ready, but housekeeping is inside.", "Apologize and verify the room status before reassignment."],
  ["Support a VIP arrival", "Personalize within approved standards", ["VIP HANDLING (PROCEDURAL)", "VIP AMENITIES & HANDLING", "ARRIVAL LIST"], "The company director will arrive in twenty minutes.", "Confirm the approved arrival arrangement and ownership."],
  ["Close a guest folio", "Review charges before settlement", ["GUEST FOLIO AUDIT", "FRONT OFFICE SETTLEMENT", "CASH OVER/SHORT"], "I do not recognize this minibar charge.", "Review the folio and investigate before settlement."],
  ["Conduct a shift handover", "Pass on unresolved guest needs", ["FRONT OFFICE SHIFT HANDOVER", "FRONT OFFICE COMMUNICATION LOG (LOG BOOK)", "GUEST REQUEST LOGGING (G-LOG)"], "Will the evening team know about my airport transfer?", "Confirm that the request is documented for handover."],
  ["Respond to an emergency", "Prioritize safety and escalation", ["EMERGENCY PROCEDURES (FRONT OFFICE)", "GUEST REQUEST LOGGING (G-LOG)", "FRONT OFFICE COMMUNICATION LOG (LOG BOOK)"], "I smell smoke near the lift.", "Follow the emergency procedure and avoid speculation."],
  ["Prepare a departure", "Confirm time, transport, and folio", ["DEPARTURE LIST", "LATE CHECK-OUT", "FRONT OFFICE SETTLEMENT"], "Can I settle my bill now and leave at noon?", "Review departure details and settlement."],
  ["Final hotel service recovery", "Integrate safe front-office communication", ["HANDLING GUEST COMPLAINT", "SERVICE RECOVERY PARADOX", "FRONT OFFICE SHIFT HANDOVER"], "This is the second time my room key has failed.", "Own the concern, verify identity, solve it, and document the handover."],
].map(([title, subtitle, terms, guestMessage, objective]) => ({ title, subtitle, terms, guestMessage, objective })) as LessonSeed[];

const restaurantSeeds: LessonSeed[] = [
  ["Welcome and count covers", "Seat guests and update capacity", ["COVER", "TABLE TURNOVER", "POS (POINT OF SALE)"], "A table for four, please.", "Welcome the party and confirm seating availability."],
  ["Handle an allergy request", "Never guess about ingredients", ["FOOD SAFETY", "HACCP (HAZARD ANALYSIS & CRITICAL CONTROL POINTS)", "STANDARD RECIPE"], "Does this sauce contain peanuts? I have a serious allergy.", "Acknowledge the allergy and confirm ingredients with the kitchen."],
  ["Explain the menu", "Describe options accurately", ["MENU ENGINEERING", "STANDARD RECIPE", "PORTION CONTROL"], "What is your most popular main course?", "Describe an appropriate option without inventing ingredients."],
  ["Take a complete order", "Confirm items and modifications", ["CAPTAIN ORDER", "POS (POINT OF SALE)", "OPEN CHECK"], "I would like the steak medium and no sauce.", "Repeat the order and record the modification."],
  ["Keep a check open", "Manage an active table transaction", ["OPEN CHECK", "BAR TAB", "POS (POINT OF SALE)"], "We may order dessert later. Can we pay at the end?", "Explain that the check will remain active."],
  ["Correct an order with a void", "Follow approval and audit controls", ["VOID", "DISCOUNT AUTHORIZATION", "POS (POINT OF SALE)"], "I did not order this drink.", "Acknowledge the error and follow the approved void process."],
  ["Explain service charge", "Clarify the bill politely", ["SERVICE CHARGE", "AVERAGE CHECK", "OPEN CHECK"], "What is this service charge on my bill?", "Explain the charge using the outlet policy."],
  ["Split a restaurant bill", "Confirm the requested settlement", ["MASTER ACCOUNT", "OPEN CHECK", "POS (POINT OF SALE)"], "Can you split the food evenly between these two cards?", "Repeat the split and confirm before payment."],
  ["Recommend within a budget", "Use price and guest needs", ["MENU ENGINEERING", "AVERAGE CHECK", "PORTION CONTROL"], "What can two people share for under five hundred thousand rupiah?", "Recommend suitable items without pressuring the guest."],
  ["Coordinate a banquet event", "Use the latest event document", ["BANQUET EVENT ORDER (BEO)", "EVENT FLOW", "SET-UP TIME"], "Has the coffee break been moved to three o'clock?", "Verify the latest BEO before confirming a change."],
  ["Handle a last-minute event change", "Record approval and impact", ["BANQUET EVENT ORDER (BEO)", "FUNCTION SPACE UTILIZATION", "GROUP BLOCK (BANQUET CONTEXT)"], "We need twenty more seats for tonight.", "Check capacity and authorized event changes."],
  ["Explain menu tasting", "Set expectations before an event", ["MENU TASTING", "STANDARD RECIPE", "BANQUET EVENT ORDER (BEO)"], "Can we change the wedding menu after the tasting?", "Explain how approved changes are documented."],
  ["Report breakage", "Record damaged operating equipment", ["BREAKAGE", "WASTE LOG", "INVENTORY VARIANCE PERCENTAGE"], "Several glasses broke during set-up.", "Secure the area and document the breakage."],
  ["Receive food safely", "Check quality before acceptance", ["RECEIVING REPORT", "APPROVED VENDOR LIST (AVL)", "FOOD SAFETY"], "The seafood delivery feels warmer than usual.", "Hold acceptance and escalate the temperature check."],
  ["Apply FIFO and FEFO", "Choose stock using safe rotation", ["FIFO (FIRST IN, FIRST OUT)", "FEFO (FIRST EXPIRED, FIRST OUT)", "PAR STOCK"], "Which carton of milk should I use first?", "Check expiry and rotation labels before choosing stock."],
  ["Record food waste", "Separate waste from unexplained loss", ["WASTE LOG", "SPOILAGE LOSS", "ACTUAL VS THEORETICAL COST"], "This tray was overcooked and cannot be served.", "Record the reason and quantity in the waste process."],
  ["Control buffet service", "Maintain safety and availability", ["BUFFET CONTROL", "BATCH COOKING", "FOOD SAFETY"], "The breakfast eggs have been on the buffet for a long time.", "Check holding controls and replace food when required."],
  ["Explain portion consistency", "Use the approved recipe", ["PORTION CONTROL", "STANDARD RECIPE", "YIELD TEST"], "Why does this serving look smaller than yesterday?", "Acknowledge the concern and verify the standard portion."],
  ["Manage stock availability", "Check inventory before promising", ["PAR STOCK", "INVENTORY TURNOVER", "STOCK OPNAME"], "Can I order the imported sparkling water?", "Confirm current stock in the approved system."],
  ["Escalate a kitchen delay", "Give honest timing updates", ["PRODUCTION PLANNING", "BATCH COOKING", "KITCHEN HIERARCHY (BRIGADE SYSTEM)"], "We have waited forty minutes for our main course.", "Apologize, check with the kitchen, and give a verified update."],
  ["Handle an unauthorized discount", "Follow outlet approval limits", ["DISCOUNT AUTHORIZATION", "OUTLET P&L (PROFIT & LOSS)", "AVERAGE CHECK"], "Your colleague gave me a discount last week.", "Check eligibility and obtain approval before changing the bill."],
  ["Close a cash shift", "Protect the payment audit trail", ["CASH DROP", "POS (POINT OF SALE)", "CASH OVER/SHORT"], "The cash total is lower than the POS report.", "Pause closing and report the discrepancy accurately."],
  ["Prevent cross-contact", "Coordinate allergen-safe handling", ["HACCP (HAZARD ANALYSIS & CRITICAL CONTROL POINTS)", "FOOD SAFETY", "STANDARD RECIPE"], "Can you simply remove the nuts from the finished dessert?", "Explain that the kitchen must assess cross-contact risk."],
  ["Recover a dining complaint", "Listen, verify, and resolve", ["FOOD SAFETY", "VOID", "DISCOUNT AUTHORIZATION"], "My chicken is still raw in the middle.", "Remove the dish safely and escalate immediately."],
  ["Final restaurant service recovery", "Integrate safe outlet communication", ["OPEN CHECK", "FOOD SAFETY", "BANQUET EVENT ORDER (BEO)"], "Our event meal is late and one guest has an allergy.", "Prioritize allergy safety, verify timing, and coordinate the approved recovery."],
].map(([title, subtitle, terms, guestMessage, objective]) => ({ title, subtitle, terms, guestMessage, objective })) as LessonSeed[];

function findTermId(name: string) {
  return hospitalityTerms.find((entry) => entry.term === name)?.id ?? hospitalityTerms[0].id;
}

function buildLesson(seed: LessonSeed, domain: Domain, trackIndex: number): Lesson {
  const role = domain === "restaurant" ? "Restaurant service team member" : "Hotel front office team member";
  const termIds = seed.terms.map(findTermId);
  const primary = hospitalityTerms.find((term) => term.id === termIds[0])!;
  const safetyRule = domain === "restaurant"
    ? "Never guess about food safety, ingredients, payment, or an approval; verify with the responsible team."
    : "Never disclose private information or promise room, price, or service availability before verification."
  return {
    id: `${domain}-${String(trackIndex + 1).padStart(2, "0")}-${seed.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`,
    number: domain === "hotel" ? trackIndex + 1 : trackIndex + 26,
    trackNumber: trackIndex + 1,
    domain,
    title: seed.title,
    subtitle: seed.subtitle,
    durationMinutes: 12,
    termIds,
    guestLine: seed.guestMessage,
    listeningQuestion: "What is the safest first response in this situation?",
    listeningOptions: [
      "Confirm the answer immediately so the guest does not wait.",
      `Acknowledge the request and verify the relevant ${primary.term.toLowerCase()} before confirming.`,
      "Transfer the guest without explaining what will happen next.",
    ],
    listeningAnswer: 1,
    grammarPrompt: "Choose the clearest, safest, and most professional response.",
    grammarOptions: [
      "That is definitely possible.",
      `Thank you for letting me know. Let me verify the details before I confirm that for you.`,
      "You need to ask somebody else.",
    ],
    grammarAnswer: 1,
    speakingPrompt: `${seed.objective} Respond in two or three natural English sentences.`,
    modelAnswer: `Thank you for letting me know. Let me check the details with the responsible team, and I will update you as soon as I have confirmed information.`,
    roleScenario: { role, objective: seed.objective, guestMessage: seed.guestMessage, safetyRule },
  };
}

export const lessons: Lesson[] = [
  ...hotelSeeds.map((seed, index) => buildLesson(seed, "hotel", index)),
  ...restaurantSeeds.map((seed, index) => buildLesson(seed, "restaurant", index)),
];

export function getLesson(domain?: Domain, lessonNumber = 1): Lesson {
  if (!domain) return lessons[(Math.max(1, lessonNumber) - 1) % lessons.length];
  const track = lessons.filter((lesson) => lesson.domain === domain);
  const domainPosition = domain === "hotel" ? Math.max(1, lessonNumber) : Math.max(1, lessonNumber - 25);
  return track[(domainPosition - 1) % track.length];
}

export function getTerms(ids: string[]): HospitalityTerm[] {
  const byId = new Map(hospitalityTerms.map((entry) => [entry.id, entry]));
  return ids.flatMap((id) => byId.get(id) ?? []);
}

export function searchTerms(query = "", department = "", limit = 30, offset = 0) {
  const needle = query.trim().toLocaleLowerCase("id-ID");
  const departmentNeedle = department.trim().toLocaleLowerCase("id-ID");
  return hospitalityTerms
    .filter((entry) => !departmentNeedle || entry.department.toLocaleLowerCase("id-ID") === departmentNeedle)
    .filter((entry) => !needle || `${entry.term} ${entry.department} ${entry.subcategory} ${entry.meaning} ${entry.workplaceUse}`.toLocaleLowerCase("id-ID").includes(needle))
    .slice(Math.max(0, offset), Math.max(0, offset) + Math.min(100, Math.max(1, limit)));
}

export const glossaryDepartments = [...new Set(hospitalityTerms.map((term) => term.department))].sort();

export function scoreHospitalityResponse(transcript: string, domain: Domain) {
  const normalized = transcript.trim().toLowerCase();
  const hasText = normalized.split(/\s+/).filter(Boolean).length >= 5;
  const polite = /thank you|please|let me|i understand|happy to|good (morning|afternoon|evening)/.test(normalized);
  const verifies = /check|confirm|verify|contact|ask/.test(normalized);
  const relevantTeam = domain === "restaurant" ? /kitchen|chef|team|system|supervisor|manager|ingredient/.test(normalized) : /availability|available|room|system|team|supervisor|manager|record/.test(normalized);
  const safetyMet = verifies && relevantTeam;
  const riskyRestaurant = /is safe|allergen[- ]free|no peanut|does not contain|definitely/.test(normalized) && !safetyMet;
  const riskyHotel = /guarantee|definitely available|your room is ready|room number is/.test(normalized) && !safetyMet;
  const criticalError = domain === "restaurant" ? riskyRestaurant : riskyHotel;
  const score = Math.max(0, Math.min(100, 45 + (hasText ? 15 : 0) + (polite ? 15 : 0) + (safetyMet ? 25 : 0) - (criticalError ? 40 : 0)));
  return {
    score,
    status: criticalError ? "Needs practice" : score >= 75 ? "Ready" : "Developing",
    criticalError,
    corrections: [
      !polite ? "Open with a polite acknowledgement before explaining the next step." : null,
      !safetyMet ? "State what you will verify and which responsible team or system you will check." : null,
      !hasText ? "Give a complete response of at least one clear sentence." : null,
    ].filter((value): value is string => Boolean(value)).slice(0, 3),
  };
}
