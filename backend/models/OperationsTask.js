const mongoose = require("mongoose");

const operationsTaskSchema = new mongoose.Schema(
  {
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tenant",
      required: true,
      index: true,
    },
    title: { type: String, required: true, trim: true, maxlength: 120 },
    details: { type: String, trim: true, maxlength: 2000, default: "" },
    status: {
      type: String,
      enum: ["todo", "doing", "done"],
      default: "todo",
      index: true,
    },
    dueDate: { type: Date, default: null },
    reminderAt: { type: Date, default: null },
    reminderTimeZone: { type: String, trim: true, maxlength: 64, default: "" },
    reminderEmail: { type: String, trim: true, lowercase: true, maxlength: 254, default: "" },
    reminderEmailSentAt: { type: Date, default: null },
    reminderPushSentAt: { type: Date, default: null },
    reminderLockUntil: { type: Date, default: null },
    assignedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Staff",
      default: null,
      index: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Staff",
      default: null,
    },
  },
  { timestamps: true }
);

operationsTaskSchema.index({ tenantId: 1, assignedTo: 1, status: 1, dueDate: 1 });
operationsTaskSchema.index({ reminderAt: 1, status: 1, reminderLockUntil: 1 });

module.exports =
  mongoose.models.OperationsTask || mongoose.model("OperationsTask", operationsTaskSchema);