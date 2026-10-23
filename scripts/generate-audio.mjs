import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { KokoroTTS } from "kokoro-js";
import { lessons, hospitalityTerms } from "../lib/content.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const audioDir = path.join(root, "public", "audio");
const termsDir = path.join(audioDir, "terms");
const lessonsDir = path.join(audioDir, "lessons");
const tempWav = path.join(audioDir, "temp.wav");

fs.mkdirSync(termsDir, { recursive: true });
fs.mkdirSync(lessonsDir, { recursive: true });

// Realistic diverse voices for guests
const guestVoices = [
  "af_heart",   // US female (warm, friendly)
  "am_michael", // US male (business traveler)
  "af_bella",   // US female (lively)
  "bf_emma",    // UK female (polite British guest)
  "am_fenrir",  // US male (casual)
  "bm_george"   // UK male (British traveler)
];

async function main() {
  console.log("Loading Kokoro-82M AI Voice Model...");
  const tts = await KokoroTTS.from_pretrained("onnx-community/Kokoro-82M-v1.0-ONNX", {
    dtype: "q8"
  });
  console.log("Kokoro AI Model loaded successfully!");

  async function generateMp3(text, outPath, voice = "af_heart") {
    if (fs.existsSync(outPath) && fs.statSync(outPath).size > 100) {
      return false; // already exists
    }
    const cleanText = text.replace(/[\r\n]+/g, " ").trim();
    if (!cleanText) return false;

    const audio = await tts.generate(cleanText, { voice });
    await audio.save(tempWav);
    execSync(`ffmpeg -y -i "${tempWav}" -b:a 64k -ar 24000 "${outPath}" -loglevel error`);
    if (fs.existsSync(tempWav)) fs.unlinkSync(tempWav);
    return true;
  }

  // 1. Generate 50 Lesson Guest Lines & Role Scenarios
  console.log(`\n=== 1. Processing 50 Lessons (${lessons.length}) ===`);
  for (let i = 0; i < lessons.length; i++) {
    const lesson = lessons[i];
    const voice = guestVoices[i % guestVoices.length];

    // Guest Line (Listening Step)
    const guestPath = path.join(lessonsDir, `${lesson.id}-guest.mp3`);
    process.stdout.write(`[Lesson ${i + 1}/${lessons.length}] Guest line (${voice}): "${lesson.guestLine.slice(0, 30)}..." `);
    const createdGuest = await generateMp3(lesson.guestLine, guestPath, voice);
    console.log(createdGuest ? "✓ Done" : "✓ Exists");

    // Role Scenario Guest Message (Role Practice Step)
    if (lesson.roleScenario?.guestMessage) {
      const rolePath = path.join(lessonsDir, `${lesson.id}-role.mp3`);
      process.stdout.write(`  -> Role message: "${lesson.roleScenario.guestMessage.slice(0, 30)}..." `);
      const createdRole = await generateMp3(lesson.roleScenario.guestMessage, rolePath, voice);
      console.log(createdRole ? "✓ Done" : "✓ Exists");
    }
  }

  // 2. Generate 436 Glossary Terms Pronunciation
  console.log(`\n=== 2. Processing 436 Glossary Terms (${hospitalityTerms.length}) ===`);
  let termDoneCount = 0;
  for (let i = 0; i < hospitalityTerms.length; i++) {
    const term = hospitalityTerms[i];
    const termPath = path.join(termsDir, `${term.id}.mp3`);
    const created = await generateMp3(term.term, termPath, "af_heart");
    termDoneCount++;
    if (termDoneCount % 20 === 0 || termDoneCount === hospitalityTerms.length || created) {
      process.stdout.write(`\r[Glossary Terms ${termDoneCount}/${hospitalityTerms.length}] Processing "${term.term}"... `);
    }
  }
  console.log("\n\nAll HospitaLingo audio generated successfully with Kokoro AI!");
}

main().catch((err) => {
  console.error("Audio generation failed:", err);
  process.exit(1);
});
