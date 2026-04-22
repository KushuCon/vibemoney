import OpenAI from "openai";

// AI provider uses an OpenAI-compatible API.
const nvidia = new OpenAI({
  apiKey: process.env.NVIDIA_API_KEY!,
  baseURL: process.env.NVIDIA_BASE_URL || "https://integrate.api.nvidia.com/v1",
});

const MODEL = process.env.NVIDIA_MODEL || "moonshotai/kimi-k2-instruct";

/**
 * Categorize a transaction merchant using AI
 * Returns a category ID from our VIBE_CATEGORIES list
 */
export async function categorizeMerchantAI(
  merchant: string,
  amount: number
): Promise<string> {
  try {
    const completion = await nvidia.chat.completions.create({
      model: MODEL,
      max_tokens: 50,
      messages: [
        {
          role: "system",
          content: `You are a spending categorizer. Given a merchant name, return ONLY one category ID from this list:
midnight-cravings (food delivery, restaurants, groceries)
retail-therapy (online shopping, clothing, electronics)
main-character (travel, transport, hotels, cabs)
glow-up (health, gym, salon, pharmacy, wellness)
digital-dopamine (streaming, apps, gaming, subscriptions)
adulting-pain (bills, rent, insurance, utilities, recharge)
invest-era (stocks, mutual funds, investment)
social-butterfly (movies, events, entertainment, nightlife)
transfer (bank transfer, UPI send, wallet)
miscellaneous (anything else)
Return ONLY the category-id, nothing else.`,
        },
        {
          role: "user",
          content: `Merchant: ${merchant}, Amount: ₹${amount}`,
        },
      ],
    });

    const result = completion.choices[0]?.message?.content?.trim().toLowerCase();
    const validCategories = [
      "midnight-cravings", "retail-therapy", "main-character",
      "glow-up", "digital-dopamine", "adulting-pain",
      "invest-era", "social-butterfly", "transfer", "miscellaneous",
    ];

    return validCategories.includes(result || "") ? result! : "miscellaneous";
  } catch (error) {
    console.error("AI categorization error:", error);
    return "miscellaneous";
  }
}

/**
 * Generate monthly vibe personality using AI
 * Takes spending summary and returns a fun personality report
 */
export async function generateVibePersonality(spendingSummary: {
  totalSpent: number;
  topCategories: { name: string; amount: number; emoji: string }[];
  transactionCount: number;
  avgTransaction: number;
  month: string;
}): Promise<{
  title: string;
  subtitle: string;
  description: string;
  roast: string;
  emoji: string;
}> {
  try {
    const prompt = `Month: ${spendingSummary.month}
Total spent: ₹${spendingSummary.totalSpent.toLocaleString("en-IN")}
Transactions: ${spendingSummary.transactionCount}
Average transaction: ₹${Math.round(spendingSummary.avgTransaction)}
Top spending categories: ${spendingSummary.topCategories.map((c) => `${c.emoji} ${c.name}: ₹${c.amount}`).join(", ")}

Generate a fun Gen Z spending personality report. Return JSON only:
{
  "title": "2-3 word personality title (e.g. Chaotic Gremlin, Soft Life Era)",
  "subtitle": "one short ironic phrase",
  "description": "2 sentences about their spending personality. Be funny and slightly roasty.",
  "roast": "One brutal one-liner roast about their spending (kind but funny)",
  "emoji": "single most fitting emoji"
}`;

    const completion = await nvidia.chat.completions.create({
      model: MODEL,
      max_tokens: 300,
      messages: [
        {
          role: "system",
          content:
            "You are a brutally honest but funny Gen Z financial personality analyzer. You roast people's spending habits lovingly. Always respond in valid JSON only.",
        },
        { role: "user", content: prompt },
      ],
    });

    const raw = completion.choices[0]?.message?.content?.trim() || "{}";
    // Strip markdown code blocks if present
    const cleaned = raw.replace(/```json\n?|\n?```/g, "").trim();
    const parsed = JSON.parse(cleaned);
    return {
      title: parsed.title || "Mystery Spender",
      subtitle: parsed.subtitle || "we have no idea what happened",
      description: parsed.description || "Your spending defies categorization.",
      roast: parsed.roast || "The bank statement speaks for itself.",
      emoji: parsed.emoji || "💸",
    };
  } catch (error) {
    console.error("AI personality error:", error);
    return {
      title: "Mystery Spender",
      subtitle: "the AI gave up",
      description: "Your spending patterns are truly one of a kind.",
      roast: "Even AI can't explain your financial decisions.",
      emoji: "🤷",
    };
  }
}

/**
 * Generate shareable Wrapped caption
 */
export async function generateWrappedCaption(
  personality: string,
  totalSpent: number,
  topMerchant: string
): Promise<string> {
  try {
    const completion = await nvidia.chat.completions.create({
      model: MODEL,
      max_tokens: 80,
      messages: [
        {
          role: "system",
          content:
            "Generate a funny 1-2 line Instagram/WhatsApp caption for a spending wrapped card. Keep it under 100 chars, Gen Z tone, include 1-2 emojis.",
        },
        {
          role: "user",
          content: `Personality: ${personality}, Spent: ₹${totalSpent.toLocaleString("en-IN")}, Top merchant: ${topMerchant}`,
        },
      ],
    });
    return completion.choices[0]?.message?.content?.trim() || "my wallet said no 💀";
  } catch {
    return "my wallet said no 💀";
  }
}
