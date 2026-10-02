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
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Staff",
      default: null,
    },
  },
  { timestamps: true }
);

operationsTaskSchema.index({ tenantId: 1, status: 1, dueDate: 1 });

module.exports =
  mongoose.models.OperationsTask || mongoose.model("OperationsTask", operationsTaskSchema);