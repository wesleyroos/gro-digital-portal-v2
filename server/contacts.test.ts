import { describe, expect, it } from "vitest";
import { canMarket, normalisePhone, splitEmails, splitName } from "../shared/contacts";

describe("normalisePhone", () => {
  it("reads every format that was already in the portal", () => {
    expect(normalisePhone("082 331 6651")).toBe("+27823316651");
    expect(normalisePhone("0724849014")).toBe("+27724849014");
    expect(normalisePhone("+27 71 896 3934")).toBe("+27718963934");
    expect(normalisePhone("+27724849014")).toBe("+27724849014");
    expect(normalisePhone("066 476 0088")).toBe("+27664760088");
  });

  it("strips the bidi marks wrapped around Indivest's number", () => {
    expect(normalisePhone("‪+27 71 413 2085‬")).toBe("+27714132085");
  });

  it("keeps a non-South-African number rather than mangling it", () => {
    expect(normalisePhone("+44 20 7946 0958")).toBe("+442079460958");
  });

  it("returns null for anything it cannot read as a number", () => {
    expect(normalisePhone(null)).toBeNull();
    expect(normalisePhone("")).toBeNull();
    expect(normalisePhone("n/a")).toBeNull();
    expect(normalisePhone("013 653 8270 PR no: 8216533")).toBeNull();
  });

  it("normalises the same number written two ways to one value", () => {
    expect(normalisePhone("072 484 9014")).toBe(normalisePhone("+27724849014"));
  });
});

describe("splitEmails", () => {
  it("splits the multi-address fields", () => {
    expect(splitEmails("finance2@bisonppe.co.za, wesley@grodigital.co.za")).toEqual([
      "finance2@bisonppe.co.za",
      "wesley@grodigital.co.za",
    ]);
    expect(
      splitEmails("benedictj@fundi.co.za, karienm@fundi.co.za, wesley@grodigital.co.za, ashwellt@fundi.co.za"),
    ).toHaveLength(4);
  });

  it("drops duplicates and junk", () => {
    expect(splitEmails("a@b.co.za, a@b.co.za")).toEqual(["a@b.co.za"]);
    expect(splitEmails("not-an-email")).toEqual([]);
    expect(splitEmails(null)).toEqual([]);
  });
});

describe("splitName", () => {
  it("splits on the first space", () => {
    expect(splitName("Zelda-Mari du Toit")).toEqual({ firstName: "Zelda-Mari", lastName: "du Toit" });
    expect(splitName("Wesley")).toEqual({ firstName: "Wesley", lastName: null });
    expect(splitName(null)).toEqual({ firstName: null, lastName: null });
  });
});

describe("canMarket", () => {
  const base = {
    consentBasis: "existing_customer" as const,
    doNotContact: false,
    optedOutAt: null,
    whatsappOptInAt: null,
    isInternal: false,
    email: "a@b.co.za",
    phone: "+27823316651",
  };

  it("allows email and SMS to an existing customer", () => {
    expect(canMarket(base, "email")).toBe(true);
    expect(canMarket(base, "sms")).toBe(true);
  });

  it("refuses WhatsApp marketing without a WhatsApp opt-in", () => {
    expect(canMarket(base, "whatsapp")).toBe(false);
    expect(canMarket({ ...base, whatsappOptInAt: new Date() }, "whatsapp")).toBe(true);
  });

  it("never markets to our own people", () => {
    expect(canMarket({ ...base, isInternal: true }, "email")).toBe(false);
  });

  it("honours an opt-out over any basis", () => {
    expect(canMarket({ ...base, consentBasis: "explicit_optin", optedOutAt: new Date() }, "email")).toBe(false);
    expect(canMarket({ ...base, doNotContact: true }, "email")).toBe(false);
  });

  it("refuses a contact with no basis recorded", () => {
    expect(canMarket({ ...base, consentBasis: "none" }, "email")).toBe(false);
  });

  it("refuses a rail the contact has no address for", () => {
    expect(canMarket({ ...base, phone: null }, "sms")).toBe(false);
    expect(canMarket({ ...base, email: null }, "email")).toBe(false);
  });
});
