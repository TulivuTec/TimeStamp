const mongoose = require("mongoose");

const calendarEventSchema = new mongoose.Schema(
  {
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tenant",
      required: true,
      index: true,
    },
    title: { type: String, required: true, trim: true, maxlength: 120 },
    details: { type: String, trim: true, maxlength: 2000, default: "" },
    startAt: { type: Date, required: true, index: true },
    endAt: { type: Date, default: null },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Staff",
      default: null,
    },
  },
  { timestamps: true }
);

calendarEventSchema.index({ tenantId: 1, startAt: 1 });

module.exports =
  mongoose.models.CalendarEvent || mongoose.model("CalendarEvent", calendarEventSchema);