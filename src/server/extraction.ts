import "dotenv/config";
import Anthropic from "@anthropic-ai/sdk";
import { withAnthropicRetry } from "./anthropic-errors";

const client = new Anthropic();
const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-opus-4-7";

const SYSTEM_PROMPT = `You are a document extraction tool for KYC onboarding.

Your job: convert the provided document to faithful Markdown that preserves ALL information.

Output rules:
- Output ONLY Markdown content. No preamble, no commentary, no surrounding code fences.
- Preserve ALL text verbatim, including names, dates, numbers, addresses, and identifiers.
- Preserve ALL tables as proper GitHub-flavored Markdown tables with header rows and aligned columns. This is critical — never flatten a table into prose.
- Preserve document structure: use # / ## / ### for headings, blank lines between paragraphs, * for bullet lists, 1. for ordered lists.
- For images, logos, stamps, signatures, or other visual elements embedded in the document, describe them inline as ![alt text describing what is shown]
- For handwritten content, transcribe what you can read and mark uncertain words with [?].
- Do NOT summarize, paraphrase, or shorten anything. The output should be a complete and accurate Markdown representation.
- If the document is multi-page, preserve page boundaries with a horizontal rule (---) between pages.`;

export interface ExtractionInput {
  fileBytes: Buffer;
  mimeType: string;
  fileName: string;
}

export async function extractToMarkdown(input: ExtractionInput): Promise<string> {
  const { fileBytes, mimeType, fileName } = input;
  const isPdf = mimeType === "application/pdf";
  const isImage = mimeType.startsWith("image/");

  if (!isPdf && !isImage) {
    throw new Error(
      `Unsupported file type: ${mimeType}. Only PDF and image files (PNG, JPEG, WebP) can be processed.`,
    );
  }

  const base64 = fileBytes.toString("base64");

  const mediaBlock: Anthropic.ContentBlockParam = isPdf
    ? {
        type: "document",
        source: { type: "base64", media_type: "application/pdf", data: base64 },
      }
    : {
        type: "image",
        source: {
          type: "base64",
          media_type: mimeType as "image/png" | "image/jpeg" | "image/webp" | "image/gif",
          data: base64,
        },
      };

  const response = await withAnthropicRetry(
    () =>
      client.messages.create({
        model: MODEL,
        max_tokens: 16000,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: [
              mediaBlock,
              {
                type: "text",
                text: `Extract the full content of "${fileName}" as faithful Markdown. Preserve every table as a proper Markdown table.`,
              },
            ],
          },
        ],
      }),
    { label: `Extraction of "${fileName}"` },
  );

  const textBlock = response.content.find(
    (b): b is Anthropic.TextBlock => b.type === "text",
  );
  if (!textBlock) {
    throw new Error("Extraction returned no text content.");
  }
  return textBlock.text;
}
