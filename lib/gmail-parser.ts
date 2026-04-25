/**
 * GMAIL PARSER
 *
 * HOW IT WORKS:
 * 1. User connects Gmail via OAuth (gmail.readonly scope)
 * 2. We search for emails from known Indian bank sender addresses
 * 3. For each email, we run regex patterns to extract:
 *    - Amount (debited/credited)
 *    - Merchant / description
 *    - Date of transaction
 *    - Account last 4 digits
 *    - Transaction type (debit/credit)
 * 4. Parsed data is stored in Supabase
 *
 * SUPPORTED BANKS & APPS:
 * - HDFC Bank
 * - SBI (State Bank of India)
 * - ICICI Bank
 * - Axis Bank
 * - Kotak Mahindra Bank
 * - Yes Bank
 * - Google Pay (GPay)
 * - PhonePe
 * - Paytm
 * - Amazon Pay
 * - CRED
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

// ─── Bank email sender patterns ───────────────────────────────────────────────
export const BANK_SENDERS = [
  // HDFC
  "alerts@hdfcbank.net",
  "noreply@hdfcbank.com",
  "hdfc_alerts@hdfcbank.net",
  "alerts@hdfcbank.bank.in",
  "noreply@hdfcbank.bank.in",
  // SBI
  "alerts@sbi.co.in",
  "noreply@sbi.co.in",
  "sbialerts@sbi.co.in",
  // ICICI
  "alerts@icicibank.com",
  "noreply@icicibank.com",
  // Axis
  "alerts@axisbank.com",
  "noreply@axisbank.com",
  "axisalerts@axisbank.com",
  // Kotak
  "alerts@kotak.com",
  "noreply@kotak.com",
  // Yes Bank
  "alerts@yesbank.in",
  // GPay / Google
  "noreply@google.com",
  "googlepay-noreply@google.com",
  // PhonePe
  "noreply@phonepe.com",
  "alerts@phonepe.com",
  // Paytm
  "noreply@paytm.com",
  "alerts@paytm.com",
  // Amazon Pay
  "no-reply@amazon.in",
  "payments@amazon.in",
  // CRED
  "noreply@cred.club",
  "payments@cred.club",
  // Zerodha
  "noreply-cashier@mailer.zerodha.com",
  "noreply@mailer.zerodha.com",
];

// Gmail search query to find transaction emails
export function buildGmailQuery(daysBack = 90): string {
  const fromQuery = BANK_SENDERS.map((s) => `from:${s}`).join(" OR ");
  const keywordsQuery =
    "(debited OR credited OR transaction OR payment OR spent OR UPI OR balance OR payout)";
  return `(${fromQuery}) ${keywordsQuery} newer_than:${daysBack}d`;
}

// ─── Regex patterns per bank ──────────────────────────────────────────────────

interface BankPattern {
  name: string;
  senders: string[];
  patterns: {
    debit?: RegExp;
    credit?: RegExp;
    amount: RegExp;
    merchant: RegExp;
    account?: RegExp;
    date?: RegExp;
  };
}

const BANK_PATTERNS: BankPattern[] = [
  {
    name: "HDFC Bank",
    senders: ["hdfcbank.net", "hdfcbank.com", "hdfcbank.bank.in"],
    patterns: {
      amount:
        /(?:Rs\.|INR|₹)\s*([0-9,]+(?:\.[0-9]{1,2})?)/i,
      merchant:
        /debited from account \d+ to VPA\s+(\S+)\s+([A-Z][A-Za-z0-9\s]{1,39}?)(?:\s+on\s+\d|\.$|$)/i,
      account: /(?:a\/c|account)\s*(?:no\.?|number)?\s*[Xx*]+(\d{4})/i,
      debit:
        /(?:debited|debit|spent|withdrawn|paid|purchase)/i,
      credit: /(?:credited|credit|received|refund)/i,
    },
  },
  {
    name: "SBI",
    senders: ["sbi.co.in"],
    patterns: {
      amount: /(?:Rs\.|INR|₹)\s*([0-9,]+(?:\.[0-9]{1,2})?)/i,
      merchant:
        /(?:at|to|towards|Info:)\s+([A-Z][A-Za-z0-9\s\-&.'*]{2,40})(?:\s+on|\s+via|\.|,|$)/i,
      account: /[Xx*]+(\d{4})/i,
      debit: /(?:debited|debit|withdrawn|paid)/i,
      credit: /(?:credited|credit|received)/i,
    },
  },
  {
    name: "ICICI Bank",
    senders: ["icicibank.com"],
    patterns: {
      amount: /(?:Rs\.|INR|₹)\s*([0-9,]+(?:\.[0-9]{1,2})?)/i,
      merchant:
        /(?:at|to|Info:|merchant:)\s+([A-Z][A-Za-z0-9\s\-&.'*]{2,40})(?:\s+on|\s+Ref|\.|$)/i,
      account: /[Xx*]+(\d{4})/i,
      debit: /(?:debited|debit|spent)/i,
      credit: /(?:credited|credit|received)/i,
    },
  },
  {
    name: "Axis Bank",
    senders: ["axisbank.com"],
    patterns: {
      amount: /(?:Rs\.|INR|₹)\s*([0-9,]+(?:\.[0-9]{1,2})?)/i,
      merchant:
        /(?:at|to|merchant)\s+([A-Z][A-Za-z0-9\s\-&.'*]{2,40})(?:\s+on|\s+via|\.|$)/i,
      account: /[Xx*]+(\d{4})/i,
      debit: /(?:debited|debit|spent)/i,
      credit: /(?:credited|credit)/i,
    },
  },
  {
    name: "Kotak Bank",
    senders: ["kotak.com"],
    patterns: {
      amount: /(?:Rs\.|INR|₹)\s*([0-9,]+(?:\.[0-9]{1,2})?)/i,
      merchant:
        /(?:at|to|towards)\s+([A-Z][A-Za-z0-9\s\-&.'*]{2,40})(?:\s+on|\.|$)/i,
      account: /[Xx*]+(\d{4})/i,
      debit: /(?:debited|debit)/i,
      credit: /(?:credited|credit)/i,
    },
  },
  {
    name: "Zerodha",
    senders: ["mailer.zerodha.com"],
    patterns: {
      amount: /(?:₹|Rs\.?|INR)\s*([0-9,]+(?:\.[0-9]{1,2})?)/i,
      merchant: /(?:instant payout|withdrawal|payout)/i,
      account: /account ending with\s+(\d{4})/i,
      credit: /(?:payout.*processed|deposited to your|instant payout)/i,
      debit: /(?:funds withdrawn|transfer out)/i,
    },
  },
  {
    name: "UPI/GPay",
    senders: ["google.com", "phonepe.com", "paytm.com", "amazon.in"],
    patterns: {
      amount: /(?:Rs\.|INR|₹)\s*([0-9,]+(?:\.[0-9]{1,2})?)/i,
      merchant:
        /(?:to|from|paid to|received from|sent to)\s+([A-Za-z0-9\s\-&.'@]{2,40})(?:\s+via|\s+on|\.|$)/i,
      debit: /(?:sent|paid|debited|deducted)/i,
      credit: /(?:received|credited|refunded)/i,
    },
  },
];

// ─── Date extraction ──────────────────────────────────────────────────────────
function extractDate(text: string, emailDate?: string): string {
  const datePatterns = [
    /(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})/,
    /(\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{2,4})/i,
    /(?:on\s+)(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})/i,
  ];

  for (const pattern of datePatterns) {
    const match = text.match(pattern);
    if (match) {
      try {
        const d = new Date(match[1]);
        if (!isNaN(d.getTime())) {
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          const maxAllowed = new Date(today);
          maxAllowed.setDate(maxAllowed.getDate() + 1);
          if (d <= maxAllowed) return d.toISOString().split("T")[0];
        }
      } catch {}
    }
  }

  // Fall back to email date
  return emailDate || new Date().toISOString().split("T")[0];
}

// ─── Amount cleaner ───────────────────────────────────────────────────────────
function cleanAmount(raw: string): number {
  return parseFloat(raw.replace(/,/g, "")) || 0;
}

// ─── Merchant cleaner ─────────────────────────────────────────────────────────
function cleanMerchant(raw: string): string {
  return raw
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[*]+/g, "")
    .substring(0, 60);
}

export function parseBalanceAlert(
  emailBody: string,
  subject: string,
  emailId: string,
  emailDate: string
): ParsedBalance | null {
  const text = `${subject}\n${emailBody}`;

  const balancePatterns = [
    /available balance in your account[^i]*is\s+Rs\.\s*(?:INR\s*)?([0-9,]+(?:\.[0-9]{1,2})?)/i,
    /[Bb]alance\s+(?:as of[^:]*)?:?\s*Rs\.?\s*(?:INR\s*)?([0-9,]+(?:\.[0-9]{1,2})?)/i,
    /[Aa]vailable\s+[Bb]alance\s*:?\s*(?:Rs\.?|INR|₹)\s*(?:INR\s*)?([0-9,]+(?:\.[0-9]{1,2})?)/i,
    /(?:Rs\.?|INR|₹)\s*([0-9,]+(?:\.[0-9]{1,2})?)(?:\s+is your|\s+as your)\s+(?:current\s+)?balance/i,
  ];

  for (const pattern of balancePatterns) {
    const match = text.match(pattern);
    if (match) {
      const balance = parseFloat(match[1].replace(/,/g, ""));
      if (balance >= 0) {
        return { balance, date: emailDate, emailId };
      }
    }
  }

  return null;
}

// ─── Main parser function ─────────────────────────────────────────────────────
export function parseTransactionEmail(
  emailBody: string,
  subject: string,
  emailId: string,
  emailDate: string,
  senderEmail: string
): ParsedTransaction | null {
  const text = `${subject}\n${emailBody}`;

  const BALANCE_ALERT_PATTERNS = [
    /available balance in your account/i,
    /balance.*has dropped below/i,
    /balance.*threshold/i,
    /please note that deposits or credits may take some time to reflect/i,
    /the balance in your account.*has dropped/i,
    /reflect in your account/i,
    /balance as of yesterday/i,
    /account balance.*alert/i,
    /your.*balance.*is.*rs\./i,
    /low balance/i,
    /minimum.*balance/i,
    // HDFC specific balance emails
    /greetings from hdfc bank.*available balance/i,
    /greetings from hdfc bank.*balance.*dropped/i,
  ];
  if (BALANCE_ALERT_PATTERNS.some((p) => p.test(text))) return null;

  // Block HDFC balance threshold notifications specifically
  // Email says "balance dropped below Rs. 5,000" - 5000 is the threshold not a txn
  const THRESHOLD_PATTERN = /balance.*dropped below\s+Rs\.\s*(?:INR\s*)?([0-9,]+)/i;
  if (THRESHOLD_PATTERN.test(text)) return null;

  const senderDomain = senderEmail.split("@")[1]?.toLowerCase() || "";

  // Find matching bank pattern
  let matchedBank = BANK_PATTERNS.find((b) =>
    b.senders.some((s) => {
      return senderDomain === s || senderDomain.endsWith(`.${s}`) || senderDomain.includes(s);
    })
  );

  // Fallback: try all patterns
  if (!matchedBank) {
    matchedBank = BANK_PATTERNS[BANK_PATTERNS.length - 1]; // UPI fallback
  }

  const p = matchedBank.patterns;

  // Extract amount
  const amountMatch = text.match(p.amount);
  if (!amountMatch) return null;
  const amount = cleanAmount(amountMatch[1]);
  if (amount <= 0) return null;

  // Special case: Zerodha payouts are credits to self
  if (matchedBank.name === "Zerodha") {
    const accountMatch = p.account ? text.match(p.account) : null;
    return {
      amount,
      type: "credit",
      merchant: "Zerodha",
      description: subject.substring(0, 100),
      date: extractDate(text, emailDate),
      account_last4: accountMatch?.[1],
      raw_subject: subject,
      email_id: emailId,
      source: "Zerodha",
    };
  }

  // Extract transaction type
  const isDebit = p.debit ? p.debit.test(text) : true;
  const isCredit = p.credit ? p.credit.test(text) : false;
  const type: "debit" | "credit" = isCredit && !isDebit ? "credit" : "debit";

  // Extract merchant + VPA
  const merchantMatch = text.match(p.merchant);
  let merchant = "Unknown";
  let vpa: string | undefined;

  if (matchedBank.name === "HDFC Bank" && merchantMatch) {
    vpa = merchantMatch[1];
    const rawName = (merchantMatch[2] || "").trim();
    const isPhoneNumber = /^\d{10}$/.test(rawName.replace(/\s/g, ""));
    const isMeaningless = rawName.length < 2 || isPhoneNumber;
    merchant = isMeaningless ? "UPI Payment" : cleanMerchant(rawName);
  } else if (merchantMatch) {
    merchant = cleanMerchant(merchantMatch[1] || merchantMatch[2] || "");
  } else {
    merchant = extractMerchantFromSubject(subject);
  }

  if ((merchant === "Unknown" || merchant === "") && vpa) {
    merchant = "UPI Payment";
  }

  // Extract account
  const accountMatch = p.account ? text.match(p.account) : null;
  const account_last4 = accountMatch ? accountMatch[1] : undefined;

  // Extract date
  const date = extractDate(text, emailDate);

  return {
    amount,
    type,
    merchant: merchant || "Unknown",
    description: subject.substring(0, 100),
    date,
    account_last4,
    raw_subject: subject,
    email_id: emailId,
    source: matchedBank.name,
    vpa,
  };
}

function extractMerchantFromSubject(subject: string): string {
  // Try to pull merchant name from subject line
  const patterns = [
    /(?:at|to|from)\s+([A-Z][A-Za-z0-9\s]{2,30})/i,
    /([A-Z][A-Z\s]{3,20})\s+(?:transaction|payment|purchase)/i,
  ];
  for (const p of patterns) {
    const m = subject.match(p);
    if (m) return cleanMerchant(m[1]);
  }
  return "Unknown";
}
