import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const sourcePath = resolve(process.argv[2] ?? "tmp/pdfs/hospitality_master/master.txt");
const outputPath = resolve(process.argv[3] ?? "content/HOSPITALITY-MASTER.md");
const conversionDate = process.env.HOSPITALITY_CONVERSION_DATE ?? new Date().toISOString().slice(0, 10);

const expectedSections = [
  "Pengertian",
  "Landasan Teoritis",
  "Peran / Fungsi",
  "Parameter / Formulasi",
  "Simulasi",
  "Dampak",
  "Faktor Resiko",
  "Tindakan Pengendalian",
  "Intisari",
];

function slugify(value) {
  return value
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-");
}

function normalizeText(value) {
  return value
    .replace(/\r/g, "")
    .replace(/[\t ]+/g, " ")
    .replace(/\s*\[\[PDF_PAGE_(\d+)\]\]\s*/g, "\n\n<!-- source_pdf_page: $1 -->\n\n")
    .replace(/\s*●\s*/g, "\n- ")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function pageAt(source, position) {
  const prefix = source.slice(0, position);
  const matches = [...prefix.matchAll(/\[\[PDF_PAGE_(\d+)\]\]/g)];
  return Number(matches.at(-1)?.[1] ?? 0);
}

function taxonomyMarkersFor(content) {
  const markerPattern = /((?:PART\s+[IVX]+\s+[–-]\s+[^0-9]{2,100}|BLOCK\s+[A-Z]:\s+[^0-9]{2,100}?))\s+(?=\d{1,3}\.\s+)/g;
  const markers = [];
  let department = "Hospitality Operations";
  let subcategory = department;

  for (const match of content.matchAll(markerPattern)) {
    const label = match[1].replace(/\[\[PDF_PAGE_\d+\]\]/g, "").replace(/\s+/g, " ").trim();
    const part = label.match(/PART\s+[IVX]+\s+[–-]\s+(.+?)(?=\s+BLOCK\s+[A-Z]:|$)/);
    const block = label.match(/BLOCK\s+[A-Z]:\s+(.+)$/);
    if (part) {
      department = part[1].trim();
      subcategory = department;
    }
    if (block) subcategory = block[1].trim();
    markers.push({ position: match.index ?? 0, department, subcategory, sourceLabel: label });
  }
  return markers;
}

function parseSource(raw) {
  const pageMarkers = [...raw.matchAll(/^===== PAGE (\d+) =====\s*$/gm)];
  const pages = pageMarkers.map((match, index) => {
    const start = (match.index ?? 0) + match[0].length;
    const end = pageMarkers[index + 1]?.index ?? raw.length;
    return { number: Number(match[1]), text: raw.slice(start, end).replace(/\s+/g, " ").trim() };
  });

  if (pages.length !== 742) throw new Error(`Expected 742 PDF pages, found ${pages.length}.`);

  const introPages = pages.filter((page) => page.number === 17 || page.number === 18);
  const contentPages = pages.filter((page) => page.number >= 20);
  const content = contentPages.map((page) => `[[PDF_PAGE_${page.number}]] ${page.text}`).join(" ");

  const taxonomyMarkers = taxonomyMarkersFor(content);
  const entryPattern = /(?:^|\s)(\d{1,3})\.\s+(.{2,180}?)\s+Pengertian\s/g;
  const starts = [...content.matchAll(entryPattern)].map((match) => {
    const number = Number(match[1]);
    const title = match[2].replace(/\[\[PDF_PAGE_\d+\]\]/g, "").replace(/\s+/g, " ").trim();
    if (!title || title.length > 150) throw new Error(`Entry ${number} has an invalid title: ${title}`);
    const taxonomy = taxonomyMarkers.filter((marker) => marker.position < (match.index ?? 0)).at(-1);
    return {
      number,
      title,
      start: (match.index ?? 0) + match[0].indexOf(`${number}.`),
      bodyStart: (match.index ?? 0) + match[0].length,
      department: taxonomy?.department ?? "Hospitality Operations",
      subcategory: taxonomy?.subcategory ?? "Hospitality Operations",
    };
  });

  if (starts.length !== 436) throw new Error(`Expected 436 body entries after duplicate-number audit, found ${starts.length}.`);

  const entries = starts.map((entry, index) => {
    const end = starts[index + 1]?.start ?? content.length;
    const body = content.slice(entry.bodyStart, end).trim();
    const sections = {};
    let sectionCursor = 0;

    for (let sectionIndex = 0; sectionIndex < expectedSections.length; sectionIndex += 1) {
      const label = expectedSections[sectionIndex];
      const nextLabel = expectedSections[sectionIndex + 1];
      const nextIndex = nextLabel ? body.indexOf(nextLabel, sectionCursor) : body.length;
      if (nextLabel && nextIndex < 0) throw new Error(`Entry ${entry.number} (${entry.title}) is missing section: ${nextLabel}.`);
      sections[label] = normalizeText(body.slice(sectionCursor, nextIndex));
      sectionCursor = nextLabel ? nextIndex + nextLabel.length : body.length;
    }

    sections.Intisari = sections.Intisari
      .replace(/\s+(?:PART\s+[IVX]+\s+[–-]\s+[A-Z][A-Z& /(),.-]+|BLOCK\s+[A-Z]:\s+[A-Z][A-Z& /(),.-]+)\s*$/g, "")
      .trim();

    return {
      ...entry,
      sourcePage: pageAt(content, entry.start),
      slug: slugify(entry.title),
      sections,
    };
  });

  return { entries, introPages };
}

function renderIntroduction(introPages) {
  return introPages.map(({ number, text }) => {
    const withHeadings = text
      .replace(/^KATA PENGANTAR\s+/, "## Kata Pengantar\n\n")
      .replace(/^PENDAHULUAN\s+/, "## Pendahuluan\n\n");
    return `<!-- source_pdf_page: ${number} -->\n\n${normalizeText(withHeadings)}`;
  }).join("\n\n");
}

function renderEntry(entry) {
  const sectionMarkdown = expectedSections.map((label) => {
    const displayLabel = label === "Faktor Resiko" ? "Faktor Risiko" : label.replace(" / ", " dan ");
    return `### ${displayLabel}\n\n${entry.sections[label]}`;
  }).join("\n\n");

  return [
    `<a id="term-${String(entry.number).padStart(3, "0")}-${entry.slug}"></a>`,
    `## ${entry.number}. ${entry.title}`,
    "",
    `- **Department:** ${entry.department}`,
    `- **Subcategory:** ${entry.subcategory}`,
    `- **Source PDF page:** ${entry.sourcePage}`,
    `- **Content status:** Source conversion - needs learning adaptation review`,
    "",
    sectionMarkdown,
  ].join("\n");
}

function renderDocument(entries, introPages, duplicateNumbers) {
  const toc = entries.map((entry) => (
    `- [${entry.number}. ${entry.title}](#term-${String(entry.number).padStart(3, "0")}-${entry.slug})`
  )).join("\n");

  const groupedEntries = [];
  let lastDepartment = "";
  for (const entry of entries) {
    if (entry.department !== lastDepartment) {
      groupedEntries.push(`# ${entry.department}`);
      lastDepartment = entry.department;
    }
    groupedEntries.push(renderEntry(entry));
  }

  return `---
title: "Hospitality Operations & Governance - Master Edition"
author: "Bobi Agusta"
language: "id"
source_format: "PDF"
source_pages: 742
declared_terminology_entries: 356
body_terminology_entries: ${entries.length}
duplicate_source_numbers: "${duplicateNumbers.join(", ")}"
conversion_date: "${conversionDate}"
content_status: "source-conversion-needs-review"
---

# Hospitality Operations & Governance

## Master Edition - Markdown Source

Dokumen ini dikonversi dari PDF asli karya Bobi Agusta untuk menjadi sumber konten terstruktur HospitaLingo. Isi sumber dipertahankan. Adaptasi bahasa Inggris untuk pembelajaran, pemeriksaan formula, dan persetujuan konten dilakukan pada tahap terpisah.

> **Catatan konversi:** Formula, diagram, atau tabel yang dibuat sebagai elemen visual di PDF mungkin tidak tersedia sebagai teks. Gunakan penanda halaman sumber untuk memverifikasi elemen tersebut terhadap PDF asli sebelum konten dipublikasikan sebagai materi pembelajaran.

> **Catatan validasi sumber:** Metadata dan daftar isi menyatakan 356 istilah, tetapi badan PDF memuat ${entries.length} entri. Nomor ${duplicateNumbers[0]}-${duplicateNumbers.at(-1)} digunakan dua kali untuk dua rangkaian istilah yang berbeda. Seluruh entri dipertahankan agar tidak ada materi karya penulis yang hilang. Penomoran final perlu disetujui sebelum impor ke database produksi.

${renderIntroduction(introPages)}

# Daftar Istilah

${toc}

${groupedEntries.join("\n\n")}
`;
}

const raw = await readFile(sourcePath, "utf8");
const { entries, introPages } = parseSource(raw);
const numberFrequency = new Map();
for (const entry of entries) numberFrequency.set(entry.number, (numberFrequency.get(entry.number) ?? 0) + 1);
const duplicateNumbers = [...numberFrequency.entries()].filter(([, count]) => count > 1).map(([number]) => number);
const markdown = renderDocument(entries, introPages, duplicateNumbers);

const entryHeadings = [...markdown.matchAll(/^## (\d{1,3})\. /gm)].map((match) => Number(match[1]));
if (entryHeadings.length !== entries.length || duplicateNumbers.join(",") !== Array.from({ length: 80 }, (_, index) => index + 81).join(",")) {
  throw new Error("Generated Markdown did not preserve the audited duplicate-number sequence.");
}
for (const label of expectedSections.map((value) => value === "Faktor Resiko" ? "Faktor Risiko" : value.replace(" / ", " dan "))) {
  const count = [...markdown.matchAll(new RegExp(`^### ${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "gm"))].length;
  if (count !== entries.length) throw new Error(`Generated Markdown has ${count} '${label}' sections; expected ${entries.length}.`);
}

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, markdown, "utf8");
console.log(JSON.stringify({ outputPath, pages: 742, declaredEntries: 356, bodyEntries: entries.length, duplicateNumbers, bytes: Buffer.byteLength(markdown) }, null, 2));
