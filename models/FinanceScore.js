import mongoose from "mongoose";

const metricsSchema = new mongoose.Schema({
  balance:     { type: Number, default: 0 },
  income:      { type: Number, default: 0 },
  expenses:    { type: Number, default: 0 },
  savingsRate: { type: String, default: "0%" },
  avgIncome:   { type: Number, default: 0 },
  avgExpenses: { type: Number, default: 0 },
  activeGoals: { type: Number, default: 0 },
}, { _id: false });

const historyEntrySchema = new mongoose.Schema({
  score:        { type: Number, required: true },
  rating:       { type: String, required: true },
  calculatedAt: { type: Date,   required: true },
  scoreChange:  { type: Number, default: null },
  summary:      { type: String, default: "" },
}, { _id: false });

const financeScoreSchema = new mongoose.Schema({
  userId: { type: String, required: true, unique: true, index: true },

  score: { type: Number, required: true, min: 0, max: 500 },
  rating: {
    type: String,
    required: true,
    enum: ["Poor", "Fair", "Good", "Great", "Excellent"],
  },

  summary:         { type: String, required: true, maxlength: 500 },
  strengths:       [{ type: String, maxlength: 200 }],
  weaknesses:      [{ type: String, maxlength: 200 }],
  recommendations: [{ type: String, maxlength: 200 }],

  previousScore: { type: Number, default: null },
  scoreChange:   { type: Number, default: null },

  calculatedAt:      { type: Date, required: true },
  nextCalculationAt: { type: Date, required: true, index: true },

  metrics: { type: metricsSchema, default: () => ({}) },

  // Newest-first history, capped at 26 entries (~1 year of bi-weekly scores)
  history: { type: [historyEntrySchema], default: [] },
}, { timestamps: true, versionKey: false });

export default mongoose.model("FinanceScore", financeScoreSchema);
