const mongoose = require("mongoose");

const mealSchema = new mongoose.Schema(
  {
    day: { type: Number, required: true, min: 0, max: 6 },
    mealName: { type: String, required: true, trim: true, maxlength: 60 },
    description: { type: String, trim: true, maxlength: 1000, default: "" },
  },
  { _id: true }
);

const weeklyMenuSchema = new mongoose.Schema(
  {
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tenant",
      required: true,
      index: true,
    },
    weekStartDate: { type: Date, required: true },
    status: {
      type: String,
      enum: ["draft", "published"],
      default: "draft",
      index: true,
    },
    meals: { type: [mealSchema], default: [] },
  },
  { timestamps: true }
);

weeklyMenuSchema.index({ tenantId: 1, weekStartDate: 1 }, { unique: true });

module.exports = mongoose.models.WeeklyMenu || mongoose.model("WeeklyMenu", weeklyMenuSchema);