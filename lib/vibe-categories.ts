/**
 * VIBE CATEGORIES
 * Maps merchants/keywords to fun Gen Z spending categories
 */

export interface VibeCategory {
  id: string;
  name: string;
  emoji: string;
  color: string; // tailwind color class
  bgColor: string;
  keywords: string[];
  vibe: string; // personality descriptor
}

export const VIBE_CATEGORIES: VibeCategory[] = [
  {
    id: "midnight-cravings",
    name: "Midnight Cravings",
    emoji: "🍜",
    color: "text-orange-600",
    bgColor: "bg-orange-50 dark:bg-orange-950/30",
    keywords: [
      "swiggy", "zomato", "dominos", "pizza", "burger", "kfc", "mcdonalds",
      "mcd", "blinkit", "zepto", "dunzo", "food", "restaurant", "cafe",
      "starbucks", "chaayos", "chai", "coffee", "biryani", "subway",
    ],
    vibe: "chaotic",
  },
  {
    id: "retail-therapy",
    name: "Retail Therapy",
    emoji: "🛍️",
    color: "text-pink-600",
    bgColor: "bg-pink-50 dark:bg-pink-950/30",
    keywords: [
      "amazon", "flipkart", "myntra", "nykaa", "meesho", "ajio", "snapdeal",
      "shopify", "zara", "h&m", "uniqlo", "clothing", "fashion", "shoes",
      "electronics", "gadget",
    ],
    vibe: "impulsive",
  },
  {
    id: "main-character",
    name: "Main Character",
    emoji: "✈️",
    color: "text-sky-600",
    bgColor: "bg-sky-50 dark:bg-sky-950/30",
    keywords: [
      "makemytrip", "goibibo", "irctc", "ola", "uber", "rapido", "redbus",
      "airline", "hotel", "oyo", "airbnb", "train", "flight", "cab",
      "travel", "trip", "booking",
    ],
    vibe: "adventurous",
  },
  {
    id: "glow-up",
    name: "Glow Up Fund",
    emoji: "💅",
    color: "text-purple-600",
    bgColor: "bg-purple-50 dark:bg-purple-950/30",
    keywords: [
      "salon", "spa", "parlour", "gym", "fitness", "cult", "cure", "pharmacy",
      "medicine", "doctor", "hospital", "clinic", "health", "wellness",
      "cult.fit", "beauty", "skincare",
    ],
    vibe: "self-care",
  },
  {
    id: "digital-dopamine",
    name: "Digital Dopamine",
    emoji: "📱",
    color: "text-violet-600",
    bgColor: "bg-violet-50 dark:bg-violet-950/30",
    keywords: [
      "netflix", "spotify", "hotstar", "prime", "youtube", "apple", "google",
      "microsoft", "gaming", "steam", "playstation", "xbox", "subscription",
      "app store", "play store", "adobe", "canva",
    ],
    vibe: "chronically online",
  },
  {
    id: "adulting-pain",
    name: "Adulting Pain",
    emoji: "💀",
    color: "text-slate-600",
    bgColor: "bg-slate-50 dark:bg-slate-950/30",
    keywords: [
      "electricity", "water", "gas", "rent", "maintenance", "society",
      "insurance", "lic", "tax", "bill", "recharge", "airtel", "jio",
      "vi", "bsnl", "broadband", "internet", "emi",
    ],
    vibe: "responsible (unfortunately)",
  },
  {
    id: "invest-era",
    name: "Invest Era",
    emoji: "📈",
    color: "text-emerald-600",
    bgColor: "bg-emerald-50 dark:bg-emerald-950/30",
    keywords: [
      "zerodha", "groww", "upstox", "angelone", "paytm money", "mutual fund",
      "sip", "stock", "share", "investment", "nse", "bse", "fd", "ppf",
      "nps", "gold",
    ],
    vibe: "sigma investor",
  },
  {
    id: "social-butterfly",
    name: "Social Butterfly",
    emoji: "🎉",
    color: "text-yellow-600",
    bgColor: "bg-yellow-50 dark:bg-yellow-950/30",
    keywords: [
      "movie", "pvr", "inox", "bookmyshow", "concert", "event", "party",
      "bar", "pub", "lounge", "nightclub", "bowling", "arcade", "game",
    ],
    vibe: "fomo victim",
  },
  {
    id: "transfer",
    name: "Money Moves",
    emoji: "💸",
    color: "text-blue-600",
    bgColor: "bg-blue-50 dark:bg-blue-950/30",
    keywords: [
      "transfer", "sent", "upi", "neft", "rtgs", "imps", "paytm", "phonepe",
      "gpay", "google pay", "bank", "wallet",
    ],
    vibe: "generous",
  },
  {
    id: "miscellaneous",
    name: "Random Arc",
    emoji: "🌀",
    color: "text-gray-600",
    bgColor: "bg-gray-50 dark:bg-gray-950/30",
    keywords: [],
    vibe: "chaotic neutral",
  },
];

export function categorizeTransaction(merchant: string, description: string): VibeCategory {
  const searchText = `${merchant} ${description}`.toLowerCase();

  for (const category of VIBE_CATEGORIES.slice(0, -1)) {
    if (category.keywords.some((kw) => searchText.includes(kw.toLowerCase()))) {
      return category;
    }
  }

  return VIBE_CATEGORIES[VIBE_CATEGORIES.length - 1]; // miscellaneous
}

// Monthly vibe personality based on spending
export interface VibePersonality {
  title: string;
  subtitle: string;
  emoji: string;
  color: string;
  description: string;
}

export function getVibePersonality(
  totalSpent: number,
  topCategory: string,
  savingsRate: number
): VibePersonality {
  if (savingsRate > 50) {
    return {
      title: "Zen Saver",
      subtitle: "who are you?",
      emoji: "🧘",
      color: "text-emerald-600",
      description: "Saved over 50% this month. Either very disciplined or just forgot to spend.",
    };
  }

  if (topCategory === "midnight-cravings") {
    return {
      title: "Chaotic Gremlin",
      subtitle: "the food app knows your face",
      emoji: "💀",
      color: "text-orange-600",
      description: "Food apps are basically your subscription service at this point.",
    };
  }

  if (topCategory === "retail-therapy") {
    return {
      title: "Retail Menace",
      subtitle: "cart going brrr",
      emoji: "🛍️",
      color: "text-pink-600",
      description: "Your package tracking app deserves a tip. Truly.",
    };
  }

  if (topCategory === "main-character") {
    return {
      title: "Main Character",
      subtitle: "living the plot",
      emoji: "✈️",
      color: "text-sky-600",
      description: "Moving, traveling, vibing. The world is your Airbnb.",
    };
  }

  if (topCategory === "digital-dopamine") {
    return {
      title: "Chronically Online",
      subtitle: "subscribed to everything",
      emoji: "📱",
      color: "text-violet-600",
      description: "You pay for streaming services you forgot you had.",
    };
  }

  if (savingsRate < 0) {
    return {
      title: "Financially Deceased",
      subtitle: "the bank account said no",
      emoji: "⚰️",
      color: "text-red-600",
      description: "Spent more than earned. The economy is a scam anyway.",
    };
  }

  return {
    title: "Soft Life Era",
    subtitle: "balanced, as all things should be",
    emoji: "🌸",
    color: "text-purple-600",
    description: "Spending balanced across life categories. Actually thriving.",
  };
}
