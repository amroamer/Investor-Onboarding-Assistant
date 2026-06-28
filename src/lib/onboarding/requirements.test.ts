import { describe, it, expect } from "vitest";
import { requirementsFor } from "./requirements";
import type { LegalForm } from "./types";

const FORMS: LegalForm[] = [
  "Individual",
  "Limited Partnership",
  "Corporation",
  "Trust",
  "Regulated or Listed Entity",
];

describe("requirementsFor — schema", () => {
  for (const form of FORMS) {
    describe(form, () => {
      const groups = requirementsFor(form);

      it("has at least one group with at least one item", () => {
        expect(groups.length).toBeGreaterThan(0);
        for (const g of groups) {
          expect(g.items.length).toBeGreaterThan(0);
        }
      });

      it("every item has a name", () => {
        for (const g of groups) {
          for (const item of g.items) {
            expect(item.name).toBeTruthy();
            expect(typeof item.name).toBe("string");
          }
        }
      });

      it("every item has at least one piece of guidance (note, mustInclude, examples, acceptedFormats or rejectedIf)", () => {
        for (const g of groups) {
          for (const item of g.items) {
            const hasGuidance =
              !!item.note ||
              (item.mustInclude && item.mustInclude.length > 0) ||
              (item.examples && item.examples.length > 0) ||
              (item.acceptedFormats && item.acceptedFormats.length > 0) ||
              (item.rejectedIf && item.rejectedIf.length > 0);
            expect(hasGuidance, `${form} / ${g.party} / "${item.name}" has no guidance`).toBe(true);
          }
        }
      });

      it("acceptedFormats entries are non-empty strings", () => {
        for (const g of groups) {
          for (const item of g.items) {
            if (!item.acceptedFormats) continue;
            for (const f of item.acceptedFormats) {
              expect(typeof f).toBe("string");
              expect(f.length).toBeGreaterThan(0);
            }
          }
        }
      });
    });
  }

  it("Government-issued photo ID is consistent across legal forms that need it", () => {
    const occurrences: { form: LegalForm; mustInclude?: string[] }[] = [];
    for (const form of FORMS) {
      for (const g of requirementsFor(form)) {
        for (const item of g.items) {
          if (item.name === "Government-issued photo ID") {
            occurrences.push({ form, mustInclude: item.mustInclude });
          }
        }
      }
    }
    expect(occurrences.length).toBeGreaterThan(0);
    // All occurrences must declare the same `mustInclude` (shared constant).
    const first = JSON.stringify(occurrences[0].mustInclude);
    for (const o of occurrences) {
      expect(JSON.stringify(o.mustInclude)).toBe(first);
    }
  });
});
