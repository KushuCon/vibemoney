/**
 * GMAIL PARSER
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
  bankName: string;
}

export const BANK_SENDERS = [
  "alerts@hdfcbank.bank.in",
  "noreply-cashier@mailer.zerodha.com",
  // Axis Bank
  "info@alerts.axisbankmail.in",
  "info@digital.axisbankmail.com",
  // SBI / YONO
  "alerts@sbi.co.in",
  "noreply@sbi.co.in",
  // ICICI (likely sender - verify with real email)
  "alerts@icicibank.com",
  // Kotak (likely sender - verify with real email)
  "alerts@kotak.com",
  // Equitas (confirmed)
  "esfb-alerts@equitasbank.com",
  // Groww (likely sender - verify with real email)
  "no-reply@groww.in",
];

export function buildGmailQuery(daysBack = 90): string {
  const fromQuery = BANK_SENDERS.map((s) => `from:${s}`).join(" OR ");
  return `(${fromQuery}) newer_than:${daysBack}d`;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function extractAmount(text: string): number {
  // Handles: Rs.1234 / Rs. 1,234.56 / Rs. INR 1234 / INR 1234 / ₹1,234 / Rs.INR 16,964.90
  const match = text.match(/(?:Rs\.\s*(?:INR\s*)?|INR\s*|₹\s*)([0-9,]+(?:\.[0-9]{1,2})?)/i);
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
        const raw = m[1];
        // Handle DD-MM-YY or DD-MM-YYYY (Indian bank format)
        const ddmmMatch = raw.match(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{2,4})$/);
        if (ddmmMatch) {
          let [, dd, mm, yy] = ddmmMatch;
          const yyyy = yy.length === 2 ? `20${yy}` : yy;
          const d = new Date(`${yyyy}-${mm.padStart(2,'0')}-${dd.padStart(2,'0')}`);
          if (!isNaN(d.getTime()) && d <= new Date()) return d.toISOString().split("T")[0];
        }
        // Fallback for month-name formats
        const d = new Date(raw);
        if (!isNaN(d.getTime()) && d <= new Date()) return d.toISOString().split("T")[0];
      } catch {}
    }
  }
  return fallback;
}

function clean(raw: string): string {
  return raw.trim().replace(/\s+/g, " ").replace(/[*]+/g, "").substring(0, 60);
}

function detectBank(sender: string): string {
  if (sender.includes("hdfcbank")) return "HDFC Bank";
  if (sender.includes("axisbankmail")) return "Axis Bank";
  if (sender.includes("sbi.co.in")) return "SBI";
  if (sender.includes("icicibank")) return "ICICI Bank";
  if (sender.includes("kotak")) return "Kotak Bank";
  if (sender.includes("equitasbank")) return "Equitas Bank";
  if (sender.includes("zerodha")) return "Zerodha";
  if (sender.includes("groww")) return "Groww";
  return "Unknown Bank";
}

// ─── BALANCE PARSER ───────────────────────────────────────────────────────────
// Extracts real balance from ANY HDFC email that mentions it.
// Returns null if no balance found.
export function parseBalanceAlert(
  emailBody: string,
  subject: string,
  emailId: string,
  emailDate: string,
  senderEmail: string
): ParsedBalance | null {
  const text = `${subject}\n${emailBody}`;
  const lower = text.toLowerCase();
  if (!lower.includes("balance")) return null;

  const patterns = [
    /[Bb]alance as of yesterday:\s*Rs\.\s*(?:INR\s*)?([0-9,]+(?:\.[0-9]{1,2})?)/i,
    /available balance in your account[^i]*is\s+Rs\.\s*(?:INR\s*)?([0-9,]+(?:\.[0-9]{1,2})?)/i,
    /available balance[^:]*:\s*(?:Rs\.?|INR|₹)\s*(?:INR\s*)?([0-9,]+(?:\.[0-9]{1,2})?)/i,
    /[Tt]he available balance in your account is Rs\.\s*(?:INR\s*)?([0-9,]+(?:\.[0-9]{1,2})?)/i,
    /[Aa]vailable [Bb]alance[:\s]+(?:INR\s*|Rs\.?\s*)?([0-9,]+(?:\.[0-9]{1,2})?)/i,
    /[Yy]our available balance is\s+(?:Rs\.?\s*|INR\s*)?([0-9,]+(?:\.[0-9]{1,2})?)/i,
  ];

  for (const p of patterns) {
    const m = text.match(p);
    if (m) {
      const balance = parseFloat(m[1].replace(/,/g, ""));
      if (balance >= 0) {
        const bankName = detectBank(senderEmail.toLowerCase());
        return { balance, date: emailDate, emailId, bankName };
      }
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
  // ── AXIS BANK ─────────────────────────────────────────────────────────────
  if (sender.includes("axisbankmail")) {
    const isDebit = lower.includes("debited") || lower.includes("debit");
    const isCredit = lower.includes("credited") || lower.includes("credit");
    if (!isDebit && !isCredit) return null;
    const amount = extractAmount(text);
    if (amount <= 0) return null;

    let merchant = "Unknown";
    let vpa: string | undefined;
    const upiM = text.match(/(?:at|to)\s+([A-Z][A-Za-z0-9\s&.]{1,40}?)(?:\s+on\s|\s+via\s|\.)/i);
    const vpaM = text.match(/VPA[:\s]+(\S+)/i);
    if (vpaM) vpa = vpaM[1];
    if (upiM) merchant = clean(upiM[1]);

    return {
      amount,
      type: isDebit ? "debit" : "credit",
      merchant: merchant || (isDebit ? "Axis Debit" : "Axis Credit"),
      description: subject.substring(0, 100),
      date: extractDate(text, emailDate),
      account_last4: text.match(/[Xx*]{2,}(\d{4})/)?.[1],
      raw_subject: subject,
      email_id: emailId,
      source: "Axis Bank",
      vpa,
    };
  }

  // ── SBI ───────────────────────────────────────────────────────────────────
  if (sender.includes("sbi.co.in")) {
    const isDebit = lower.includes("debited") || lower.includes("withdrawn");
    const isCredit = lower.includes("credited") || lower.includes("deposited");
    if (!isDebit && !isCredit) return null;
    const amount = extractAmount(text);
    if (amount <= 0) return null;

    let merchant = "SBI Transfer";
    let vpa: string | undefined;
    const vpaM = text.match(/(?:to|from)\s+VPA\s+(\S+)/i);
    if (vpaM) { vpa = vpaM[1]; merchant = vpa; }
    const neftM = text.match(/(?:NEFT|IMPS)[^-]*-[^-]*-([A-Z][A-Za-z\s&.]{2,40})/i);
    if (neftM) merchant = clean(neftM[1]);

    return {
      amount,
      type: isDebit ? "debit" : "credit",
      merchant,
      description: subject.substring(0, 100),
      date: extractDate(text, emailDate),
      account_last4: text.match(/[Xx*]{2,}(\d{4})/)?.[1]
        || text.match(/[Aa]\/c\s*(?:no\.?\s*)?[Xx*]*(\d{4})/i)?.[1],
      raw_subject: subject,
      email_id: emailId,
      source: "SBI",
      vpa,
    };
  }

  // ── EQUITAS BANK ──────────────────────────────────────────────────────────
  if (sender.includes("equitasbank")) {
    const isDebit = lower.includes("debited") || lower.includes("debit");
    const isCredit = lower.includes("credited") || lower.includes("credit");
    if (!isDebit && !isCredit) return null;
    const amount = extractAmount(text);
    if (amount <= 0) return null;
    const vpaM = text.match(/(?:to|from)\s+VPA\s+(\S+)/i);
    return {
      amount,
      type: isDebit ? "debit" : "credit",
      merchant: vpaM?.[1] || (isDebit ? "Equitas Debit" : "Equitas Credit"),
      description: subject.substring(0, 100),
      date: extractDate(text, emailDate),
      account_last4: text.match(/[Xx*]{2,}(\d{4})/)?.[1],
      raw_subject: subject,
      email_id: emailId,
      source: "Equitas Bank",
      vpa: vpaM?.[1],
    };
  }

  // ── ICICI BANK ────────────────────────────────────────────────────────────
  if (sender.includes("icicibank")) {
    const isDebit = lower.includes("debited");
    const isCredit = lower.includes("credited");
    if (!isDebit && !isCredit) return null;
    const amount = extractAmount(text);
    if (amount <= 0) return null;
    let merchant = isDebit ? "ICICI Debit" : "ICICI Credit";
    let vpa: string | undefined;
    const vpaM = text.match(/(?:at|to)\s+([A-Za-z0-9@._-]{3,50})\s+on\s/i);
    if (vpaM) { merchant = clean(vpaM[1]); if (vpaM[1].includes("@")) vpa = vpaM[1]; }
    return {
      amount,
      type: isDebit ? "debit" : "credit",
      merchant,
      description: subject.substring(0, 100),
      date: extractDate(text, emailDate),
      account_last4: text.match(/[Xx*]{2,}(\d{4})/)?.[1],
      raw_subject: subject,
      email_id: emailId,
      source: "ICICI Bank",
      vpa,
    };
  }

  // ── KOTAK BANK ────────────────────────────────────────────────────────────
  if (sender.includes("kotak")) {
    const isDebit = lower.includes("debited");
    const isCredit = lower.includes("credited");
    if (!isDebit && !isCredit) return null;
    const amount = extractAmount(text);
    if (amount <= 0) return null;
    const vpaM = text.match(/(?:to|from)\s+VPA\s+(\S+)/i);
    let merchant = vpaM?.[1] || (isDebit ? "Kotak Debit" : "Kotak Credit");
    return {
      amount,
      type: isDebit ? "debit" : "credit",
      merchant: clean(merchant),
      description: subject.substring(0, 100),
      date: extractDate(text, emailDate),
      account_last4: text.match(/[Xx*]{2,}(\d{4})/)?.[1],
      raw_subject: subject,
      email_id: emailId,
      source: "Kotak Bank",
      vpa: vpaM?.[1],
    };
  }

  // ── GROWW ─────────────────────────────────────────────────────────────────
  if (sender.includes("groww")) {
    if (!lower.includes("withdrawal") && !lower.includes("credited") && !lower.includes("payout")) {
      return null;
    }
    const amount = extractAmount(text);
    if (amount <= 0) return null;
    return {
      amount,
      type: "credit",
      merchant: "Groww Payout",
      description: subject.substring(0, 100),
      date: extractDate(text, emailDate),
      account_last4: text.match(/[Xx*]{2,}(\d{4})/)?.[1],
      raw_subject: subject,
      email_id: emailId,
      source: "Groww",
    };
  }

  // ── HDFC BANK ─────────────────────────────────────────────────────────────
  if (!sender.includes("hdfcbank")) return null;

  const isRealTransaction =
    lower.includes("has been successfully added to your account") ||
    lower.includes("neft cr") ||
    lower.includes("neft dr") ||
    lower.includes("imps cr") ||
    lower.includes("imps dr") ||
    lower.includes("rs..*has been debited") ||
    lower.includes("rs..*debited from account") ||
    lower.includes("has been debited from");

  if (!isRealTransaction) {
    const BALANCE_ALERT_PATTERNS = [
      /available balance in your account/i,
      /balance[\s\S]{0,50}has dropped below/i,
      /balance[\s\S]{0,50}threshold/i,
      /please note that deposits or credits may take some time to reflect/i,
      /reflect in your account/i,
      /balance as of yesterday/i,
      /greetings from hdfc bank/i,
      /low balance/i,
      /minimum.*balance/i,
    ];
    if (BALANCE_ALERT_PATTERNS.some((p) => p.test(text))) return null;
  }

  const amount = extractAmount(text);
  if (amount <= 0) return null;

  const isCredit =
    lower.includes("has been successfully added to your account") ||
    lower.includes("neft cr") ||
    lower.includes("imps cr");

  const type: "debit" | "credit" = isCredit ? "credit" : "debit";

  let merchant = "Unknown";
  let vpa: string | undefined;
  const merchantMatch = text.match(/(?:debited from account \d+ to VPA\s+(\S+)\s+([A-Z][A-Za-z0-9\s]{1,39}?)(?:\s+on\s+\d|\.$|$))|(?:from NEFT\s+Cr-[^-]+-([A-Z][A-Za-z\s]{2,40})-)/i);
  if (merchantMatch && merchantMatch[1] && merchantMatch[2]) {
    vpa = merchantMatch[1];
    const rawName = merchantMatch[2].trim();
    const isPhoneNumber = /^\d{10}$/.test(rawName.replace(/\s/g, ""));
    merchant = (rawName.length < 2 || isPhoneNumber) ? "UPI Payment" : clean(rawName);
  } else if (merchantMatch && merchantMatch[3]) {
    merchant = clean(merchantMatch[3]);
  } else if (type === "credit") {
    merchant = lower.includes("neft cr") ? "NEFT Credit" : "Bank Credit";
  } else {
    const m = text.match(/to VPA\s+(\S+)\s+([A-Z][A-Za-z0-9\s]{1,40}?)(?:\s+on\s|\.|$)/i);
    if (m) {
      vpa = m[1];
      const name = m[2].trim();
      merchant = /^\d{10}$/.test(name.replace(/\s/g, "")) ? "UPI Payment" : clean(name);
    } else {
      merchant = "UPI Payment";
    }
  }

  const acct = text.match(/(?:a\/c|account)[^0-9]*[Xx*]+(\d{4})/i) || text.match(/[Xx*]{2,}(\d{4})/);

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