// Seeded on first user login. Colors are chart-safe and distinct.
export const DEFAULT_EXPENSE_CATEGORIES = [
  { name: "Food & Dining",     type: "expense", color: "#E74C3C", icon: "restaurant" },
  { name: "Transport",         type: "expense", color: "#3498DB", icon: "car" },
  { name: "Shopping",          type: "expense", color: "#9B59B6", icon: "bag" },
  { name: "Entertainment",     type: "expense", color: "#E67E22", icon: "film" },
  { name: "Health & Medical",  type: "expense", color: "#1ABC9C", icon: "medkit" },
  { name: "Bills & Utilities", type: "expense", color: "#34495E", icon: "flash" },
  { name: "Education",         type: "expense", color: "#2980B9", icon: "book" },
  { name: "Personal Care",     type: "expense", color: "#F39C12", icon: "person" },
  { name: "Travel",            type: "expense", color: "#16A085", icon: "airplane" },
  { name: "Other",             type: "expense", color: "#95A5A6", icon: "ellipse" },
];

export const DEFAULT_INCOME_CATEGORIES = [
  { name: "Employment",  type: "income", color: "#27AE60", icon: "briefcase" },
  { name: "Freelance",   type: "income", color: "#2ECC71", icon: "laptop" },
  { name: "Business",    type: "income", color: "#4A8A66", icon: "storefront" },
  { name: "Investment",  type: "income", color: "#F39C12", icon: "trending-up" },
  { name: "Gift",        type: "income", color: "#E91E63", icon: "gift" },
  { name: "Rental",      type: "income", color: "#00BCD4", icon: "home" },
  { name: "Government",  type: "income", color: "#607D8B", icon: "shield" },
  { name: "Other",       type: "income", color: "#95A5A6", icon: "ellipse" },
];

export const DEFAULT_INCOME_TYPES = [
  "Salary", "Freelance", "Business Revenue", "Investment Return",
  "Dividend", "Rental Income", "Gift", "Government Benefit",
  "Side Income", "Other",
];
