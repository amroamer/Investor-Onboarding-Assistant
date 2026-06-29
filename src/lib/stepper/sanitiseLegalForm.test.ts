import { describe, it, expect } from "vitest";
import {
  sanitiseLegalForm,
  requiresSourceOfWealth,
  requiresSourceOfFunds,
  STEPPER_LEGAL_FORMS,
} from "./types";

describe("sanitiseLegalForm", () => {
  it("returns undefined for empty / null / whitespace inputs", () => {
    expect(sanitiseLegalForm(undefined)).toBeUndefined();
    expect(sanitiseLegalForm(null)).toBeUndefined();
    expect(sanitiseLegalForm("")).toBeUndefined();
    expect(sanitiseLegalForm("   ")).toBeUndefined();
  });

  it("identity-maps the five canonical forms", () => {
    for (const f of STEPPER_LEGAL_FORMS) {
      expect(sanitiseLegalForm(f)).toBe(f);
    }
  });

  it("remaps deprecated value 'LLC' onto Corporation or Private Trust Corporation", () => {
    expect(sanitiseLegalForm("LLC")).toBe("Corporation or Private Trust Corporation");
  });

  it("remaps deprecated value 'Corporation' onto Corporation or Private Trust Corporation", () => {
    expect(sanitiseLegalForm("Corporation")).toBe(
      "Corporation or Private Trust Corporation",
    );
  });

  it("remaps Foundation / Estate onto Trust", () => {
    expect(sanitiseLegalForm("Foundation")).toBe("Trust");
    expect(sanitiseLegalForm("Estate")).toBe("Trust");
  });

  it("remaps Investment Fund / Pension Fund / Government onto Regulated or Listed Entity", () => {
    expect(sanitiseLegalForm("Investment Fund")).toBe("Regulated or Listed Entity");
    expect(sanitiseLegalForm("Pension Fund")).toBe("Regulated or Listed Entity");
    expect(sanitiseLegalForm("Government / Sovereign")).toBe(
      "Regulated or Listed Entity",
    );
  });

  it("remaps General Partnership / LLP onto Limited Partnership", () => {
    expect(sanitiseLegalForm("General Partnership / LLP")).toBe("Limited Partnership");
  });

  it("falls back to Regulated or Listed Entity for any unknown string", () => {
    expect(sanitiseLegalForm("Some Totally Unknown Form")).toBe(
      "Regulated or Listed Entity",
    );
    expect(sanitiseLegalForm("xyzzy")).toBe("Regulated or Listed Entity");
  });
});

describe("requiresSourceOfWealth", () => {
  it("Individual / Corporation / Trust require SoW", () => {
    expect(requiresSourceOfWealth("Individual")).toBe(true);
    expect(requiresSourceOfWealth("Corporation or Private Trust Corporation")).toBe(true);
    expect(requiresSourceOfWealth("Trust")).toBe(true);
  });

  it("Limited Partnership and Regulated/Listed waive SoW", () => {
    expect(requiresSourceOfWealth("Limited Partnership")).toBe(false);
    expect(requiresSourceOfWealth("Regulated or Listed Entity")).toBe(false);
  });
});

describe("requiresSourceOfFunds", () => {
  it("everyone except LP needs a Source of Funds narrative", () => {
    expect(requiresSourceOfFunds("Individual")).toBe(true);
    expect(requiresSourceOfFunds("Corporation or Private Trust Corporation")).toBe(true);
    expect(requiresSourceOfFunds("Trust")).toBe(true);
    expect(requiresSourceOfFunds("Regulated or Listed Entity")).toBe(true);
  });

  it("LP waives SoF — covered by GP authority", () => {
    expect(requiresSourceOfFunds("Limited Partnership")).toBe(false);
  });
});
