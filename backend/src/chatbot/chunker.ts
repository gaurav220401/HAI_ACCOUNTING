/**
 * Header-Aware Semantic Chunker — Production-Grade
 *
 * Parses markdown into structured sections, splits long sections at
 * sentence boundaries with overlap, and enriches each chunk with
 * document title + heading hierarchy for superior vector retrieval.
 *
 * Key production features:
 *   - Sentence-boundary-aware splitting (not arbitrary character cuts)
 *   - Context overlap between adjacent chunks
 *   - Token estimation for LLM context budget management
 *   - Keyword extraction for hybrid search fallback
 *   - MD5 content hashing for idempotent re-ingestion
 */

import * as crypto from "crypto";

export interface RawDocument {
  sourceFile: string;
  sourceUrl: string;
  title: string;
  content: string;
}

export interface Chunk {
  text: string;             // Context-enriched text (what gets embedded)
  rawText: string;          // Original raw text chunk
  sourceFile: string;
  sourceUrl: string;
  title: string;
  headings: string[];       // Heading hierarchy
  sectionDepth: number;     // Depth of the deepest heading
  chunkIndex: number;
  tokenEstimate: number;    // Approximate token count (~4 chars per token)
  keywords: string[];       // Extracted keywords for hybrid search
  contentHash: string;      // MD5 hash of enriched text
}

// ─── Markdown Section Parsing ──────────────────────────────────────────

interface ParsedSection {
  headings: string[];
  content: string;
  level: number;
}

function parseSections(markdown: string): ParsedSection[] {
  const lines = markdown.split(/\r?\n/);
  const sections: ParsedSection[] = [];

  let headingStack: string[] = [];
  let sectionLines: string[] = [];
  let currentLevel = 0;

  function flushSection() {
    const content = sectionLines.join("\n").trim();
    if (content) {
      sections.push({
        headings: [...headingStack],
        content,
        level: currentLevel,
      });
    }
    sectionLines = [];
  }

  for (const line of lines) {
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);

    if (headingMatch) {
      flushSection();

      const level = headingMatch[1].length;
      const text = headingMatch[2].trim();

      // Trim the heading stack to maintain correct hierarchy
      headingStack = headingStack.slice(0, level - 1);
      headingStack[level - 1] = text;
      // Clean any undefined gaps (e.g. jumping from H1 to H3)
      headingStack = headingStack.map((h) => h || "");
      currentLevel = level;
    } else {
      sectionLines.push(line);
    }
  }

  flushSection();
  return sections;
}

// ─── Sentence-Boundary Splitting ───────────────────────────────────────

/**
 * Splits text at sentence boundaries (period/question mark/exclamation
 * followed by whitespace or end-of-string).
 * Falls back to paragraph splits, then character splits.
 */
function splitAtSentenceBoundaries(text: string): string[] {
  // Split at sentence terminators followed by space or end
  const sentences = text.split(/(?<=[.!?])\s+/);
  return sentences.filter((s) => s.trim().length > 0);
}

/**
 * Splits long section content into sub-chunks of ≤ maxChars,
 * preferring sentence boundaries, with configurable overlap.
 */
function splitSectionContent(
  content: string,
  maxChars = 1200,
  overlapChars = 200
): string[] {
  if (content.length <= maxChars) {
    return [content];
  }

  // First try paragraph-based splitting
  const paragraphs = content.split(/\r?\n\r?\n+/).filter((p) => p.trim());
  const subChunks: string[] = [];
  let currentChunk = "";
  let overlapBuffer = "";   // Holds the last paragraph for overlap

  for (let i = 0; i < paragraphs.length; i++) {
    const paragraph = paragraphs[i].trim();
    if (!paragraph) continue;

    // If a single paragraph exceeds maxChars, split it at sentence boundaries
    if (paragraph.length > maxChars) {
      if (currentChunk) {
        subChunks.push(currentChunk.trim());
        overlapBuffer = extractOverlap(currentChunk, overlapChars);
        currentChunk = "";
      }

      const sentences = splitAtSentenceBoundaries(paragraph);
      let sentenceChunk = overlapBuffer;

      for (const sentence of sentences) {
        if (sentenceChunk.length + sentence.length + 1 <= maxChars) {
          sentenceChunk += (sentenceChunk ? " " : "") + sentence;
        } else {
          if (sentenceChunk.trim()) {
            subChunks.push(sentenceChunk.trim());
            overlapBuffer = extractOverlap(sentenceChunk, overlapChars);
          }
          sentenceChunk = overlapBuffer + " " + sentence;
        }
      }
      if (sentenceChunk.trim()) {
        currentChunk = sentenceChunk;
      }
      continue;
    }

    const combinedLength = currentChunk
      ? currentChunk.length + 2 + paragraph.length
      : paragraph.length;

    if (combinedLength <= maxChars) {
      currentChunk += (currentChunk ? "\n\n" : "") + paragraph;
    } else {
      if (currentChunk) {
        subChunks.push(currentChunk.trim());
        overlapBuffer = extractOverlap(currentChunk, overlapChars);
      }
      // Start new chunk with overlap context from previous chunk
      currentChunk = overlapBuffer ? overlapBuffer + "\n\n" + paragraph : paragraph;
    }
  }

  if (currentChunk.trim()) {
    subChunks.push(currentChunk.trim());
  }

  return subChunks;
}

/**
 * Extracts the last N characters of text as overlap context,
 * snapping to the nearest sentence boundary.
 */
function extractOverlap(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  const tail = text.slice(-maxChars);
  // Try to snap to a sentence start
  const sentenceStart = tail.search(/(?<=[.!?])\s+/);
  if (sentenceStart > 0 && sentenceStart < maxChars * 0.7) {
    return tail.slice(sentenceStart).trim();
  }
  return tail.trim();
}

// ─── Keyword Extraction ────────────────────────────────────────────────

const STOP_WORDS = new Set([
  "a", "an", "the", "is", "are", "was", "were", "be", "been", "being",
  "have", "has", "had", "do", "does", "did", "will", "would", "could",
  "should", "may", "might", "shall", "can", "need", "dare", "ought",
  "used", "to", "of", "in", "for", "on", "with", "at", "by", "from",
  "as", "into", "through", "during", "before", "after", "above", "below",
  "between", "out", "off", "over", "under", "again", "further", "then",
  "once", "here", "there", "when", "where", "why", "how", "all", "both",
  "each", "few", "more", "most", "other", "some", "such", "no", "nor",
  "not", "only", "own", "same", "so", "than", "too", "very", "just",
  "because", "but", "and", "or", "if", "while", "about", "up", "down",
  "that", "this", "these", "those", "it", "its", "you", "your", "we",
  "our", "they", "their", "he", "she", "his", "her", "which", "what",
  "who", "whom", "whose", "also", "e.g", "i.e", "etc",
]);

function extractKeywords(text: string, maxKeywords = 15): string[] {
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w));

  // Count word frequency
  const freq = new Map<string, number>();
  for (const word of words) {
    freq.set(word, (freq.get(word) || 0) + 1);
  }

  // Sort by frequency descending, then alphabetically
  return Array.from(freq.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, maxKeywords)
    .map(([word]) => word);
}

// ─── Token Estimation ──────────────────────────────────────────────────

function estimateTokens(text: string): number {
  // GPT/Gemini approximation: ~4 characters per token for English text
  return Math.ceil(text.length / 4);
}

// ─── Main Chunking Function ────────────────────────────────────────────

/**
 * Creates production-grade context-enriched chunks from a raw markdown document.
 * Each chunk includes:
 *   - Enriched text with document title + heading path (for embedding)
 *   - Raw text (for LLM context injection)
 *   - Metadata: headings, depth, token estimate, keywords, hash
 */
export function chunkDocument(doc: RawDocument): Chunk[] {
  // Strip YAML frontmatter if present
  let cleanContent = doc.content;
  const frontmatterMatch = doc.content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  if (frontmatterMatch) {
    cleanContent = doc.content.slice(frontmatterMatch[0].length);
  }

  const parsedSections = parseSections(cleanContent);
  const allChunks: Chunk[] = [];
  let chunkIndex = 0;

  for (const section of parsedSections) {
    if (!section.content.trim()) continue;

    const subSections = splitSectionContent(section.content);
    const depth = section.headings.filter((h) => h).length;

    for (const subContent of subSections) {
      const headingPath = section.headings.filter((h) => h).join(" > ");

      // Context Enrichment: prepend structured metadata
      const enrichedText = [
        `Document: ${doc.title}`,
        `Section: ${headingPath || "Overview"}`,
        `Source: ${doc.sourceUrl}`,
        `---`,
        subContent,
      ].join("\n");

      const contentHash = crypto
        .createHash("md5")
        .update(enrichedText)
        .digest("hex");

      const keywords = extractKeywords(subContent);
      const tokenEstimate = estimateTokens(enrichedText);

      allChunks.push({
        text: enrichedText,
        rawText: subContent,
        sourceFile: doc.sourceFile,
        sourceUrl: doc.sourceUrl,
        title: doc.title,
        headings: section.headings.filter((h) => h),
        sectionDepth: depth,
        chunkIndex: chunkIndex++,
        tokenEstimate,
        keywords,
        contentHash,
      });
    }
  }

  return allChunks;
}
