/**
 * GMAIL PARSER — CLEAN & SIMPLE
 * Only parses: HDFC Bank + Zerodha
 * Balance emails: extracts balance but skips as transaction
 */

export interface ParsedTransaction {
  amount: number;
  type: "debit" | "credit";
  merchant: string;
  description: string;
  date: string;
  account_last4?: string;
  raw_subject: string;
  email_id: string;
  source: string;
  vpa?: string;
}

export interface ParsedBalance {
  balance: number;
  date: string;
  emailId: string;
}

// Only these 2 senders matter
export const BANK_SENDERS = [
  "alerts@hdfcbank.bank.in",
  "noreply-cashier@mailer.zerodha.com",
];

export function buildGmailQuery(daysBack = 90): string {
  const fromQuery = BANK_SENDERS.map((s) => `from:${s}`).join(" OR ");
  return `(${fromQuery}) newer_than:${daysBack}d`;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function extractAmount(text: string): number {
  // Handles: Rs.1234 / Rs. 1,234.56 / INR 1234 / ₹1,234 / Rs.INR 16,964.90
  const match = text.match(/(?:Rs\.(?:INR\s*)?|INR\s*|₹\s*)([0-9,]+(?:\.[0-9]{1,2})?)/i);
  if (!match) return 0;
  return parseFloat(match[1].replace(/,/g, "")) || 0;
}

function extractDate(text: string, fallback: string): string {
  const patterns = [
    /(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})/,
    /(\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{2,4})/i,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) {
      try {
        const d = new Date(m[1]);
        if (!isNaN(d.getTime()) && d <= new Date()) return d.toISOString().split("T")[0];
      } catch {}
    }
  }
  return fallback;
}

function clean(raw: string): string {
  return raw.trim().replace(/\s+/g, " ").replace(/[*]+/g, "").substring(0, 60);
}

// ─── BALANCE PARSER ───────────────────────────────────────────────────────────
// Extracts real balance from ANY HDFC email that mentions it.
// Returns null if no balance found.
export function parseBalanceAlert(
  emailBody: string,
  subject: string,
  emailId: string,
  emailDate: string
): ParsedBalance | null {
  const text = `${subject}\n${emailBody}`;
  const lower = text.toLowerCase();

  if (!lower.includes("balance")) return null;

  // For the "dropped below threshold" email:
  // "Balance as of yesterday: Rs. INR 445.00" — this is the REAL balance, use it
  const patterns = [
    /[Bb]alance as of yesterday:\s*Rs\.\s*(?:INR\s*)?([0-9,]+(?:\.[0-9]{1,2})?)/i,
    /available balance in your account[^i]*is\s+Rs\.\s*(?:INR\s*)?([0-9,]+(?:\.[0-9]{1,2})?)/i,
    /available balance[^:]*:\s*(?:Rs\.?|INR|₹)\s*(?:INR\s*)?([0-9,]+(?:\.[0-9]{1,2})?)/i,
    /[Tt]he available balance in your account is Rs\.\s*(?:INR\s*)?([0-9,]+(?:\.[0-9]{1,2})?)/i,
  ];

  for (const p of patterns) {
    const m = text.match(p);
    if (m) {
      const balance = parseFloat(m[1].replace(/,/g, ""));
      if (balance >= 0) return { balance, date: emailDate, emailId };
    }
  }
  return null;
}

// ─── MAIN PARSER ──────────────────────────────────────────────────────────────
export function parseTransactionEmail(
  emailBody: string,
  subject: string,
  emailId: string,
  emailDate: string,
  senderEmail: string
): ParsedTransaction | null {
  const text = `${subject}\n${emailBody}`;
  const lower = text.toLowerCase();
  const sender = senderEmail.toLowerCase();

  // ── ZERODHA ───────────────────────────────────────────────────────────────
  if (sender.includes("zerodha.com")) {
    // Only process payout emails (money coming INTO bank)
    if (!lower.includes("instant payout") && !lower.includes("deposited to your primary bank")) {
      return null;
    }
    const amount = extractAmount(text);
    if (amount <= 0) return null;

    return {
      amount,
      type: "credit",
      merchant: "Zerodha Payout",
      description: subject.substring(0, 100),
      date: extractDate(text, emailDate),
      account_last4: text.match(/account ending with\s+(\d{4})/i)?.[1],
      raw_subject: subject,
      email_id: emailId,
      source: "Zerodha",
    };
  }

  // ── HDFC BANK ─────────────────────────────────────────────────────────────
  if (!sender.includes("hdfcbank")) return null;

  // SKIP: balance-only / threshold / promotional emails (no real transaction)
  // These have "threshold" or "dropped below" or "minimum balance" etc.
  // but do NOT have debit/credit transaction phrases.
  const isRealTransaction =
    lower.includes("is successfully credited to your account") ||
    lower.includes("successfully credited to your account") ||
    lower.includes("successfully added to your account") ||
    lower.includes("neft cr") ||
    lower.includes("neft dr") ||
    lower.includes("imps cr") ||
    lower.includes("imps dr") ||
    lower.includes("debited from account") ||
    lower.includes("has been debited");

  if (!isRealTransaction) return null; // balance alerts, low balance, promo — all skipped

  const amount = extractAmount(text);
  if (amount <= 0) return null;

  // ── Credit vs Debit ───────────────────────────────────────────────────────
  const isCredit =
    lower.includes("is successfully credited to your account") ||
    lower.includes("successfully credited to your account") ||
    lower.includes("successfully added to your account") ||
    lower.includes("neft cr") ||
    lower.includes("imps cr");

  const type: "debit" | "credit" = isCredit ? "credit" : "debit";

  // ── Merchant name ─────────────────────────────────────────────────────────
  let merchant = "Unknown";
  let vpa: string | undefined;

  if (type === "credit") {
    if (lower.includes("by vpa")) {
      // UPI credit: "credited to your account **1745 by VPA skp@okhdfcbank SACHIN CONSUL on"
      const m = text.match(/by VPA\s+(\S+)\s+([A-Z][A-Za-z0-9\s]{1,40}?)(?:\s+on\s|\.|$)/i);
      if (m) {
        vpa = m[1];
        merchant = clean(m[2]) || "UPI Credit";
      } else {
        merchant = "UPI Credit";
      }
    } else if (lower.includes("neft cr") || lower.includes("successfully added to your account")) {
      // NEFT credit: "from NEFT Cr-YESB0000001-ZERODHA BROKING LTD-DSCNB"
      const m = text.match(/NEFT\s+Cr-[^-]+-([A-Z][A-Za-z\s&.]{2,50})-/i);
      if (m) {
        merchant = clean(m[1]);
      } else {
        // Fallback: try to grab sender name from the body
        const m2 = text.match(/from\s+([A-Z][A-Za-z\s&.]{2,40})(?:\s+on|\s*\.)/i);
        merchant = m2 ? clean(m2[1]) : "NEFT Credit";
      }
    } else {
      merchant = "Bank Credit";
    }
  } else {
    // Debit — UPI: "debited from account 1234 to VPA merchant@upi MERCHANT NAME on"
    const m = text.match(/to VPA\s+(\S+)\s+([A-Z][A-Za-z0-9\s]{1,40}?)(?:\s+on\s|\.|$)/i);
    if (m) {
      vpa = m[1];
      const name = m[2].trim();
      // If it looks like a 10-digit phone number, use generic label
      merchant = /^\d{10}$/.test(name.replace(/\s/g, "")) ? "UPI Payment" : clean(name);
    } else {
      merchant = "UPI Payment";
    }
  }

  const acct = text.match(/(?:a\/c|account)[^0-9]*[Xx*]+(\d{4})/i)
    || text.match(/[Xx*]{2,}(\d{4})/);

  return {
    amount,
    type,
    merchant: merchant || "Unknown",
    description: subject.substring(0, 100),
    date: extractDate(text, emailDate),
    account_last4: acct?.[1],
    raw_subject: subject,
    email_id: emailId,
    source: "HDFC Bank",
    vpa,
  };
}