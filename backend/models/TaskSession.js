const mongoose = require("mongoose");

const taskSessionSchema = new mongoose.Schema(
  {
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tenant",
      required: true,
      index: true,
    },
    staffId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Staff",
      required: true,
      index: true,
    },
    taskName: { type: String, required: true, trim: true, maxlength: 160 },
    startedAt: { type: Date, required: true, default: Date.now },
    endedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

taskSessionSchema.index(
  { tenantId: 1, staffId: 1 },
  { unique: true, partialFilterExpression: { endedAt: null } }
);
taskSessionSchema.index({ tenantId: 1, staffId: 1, startedAt: -1 });

module.exports =
  mongoose.models.TaskSession || mongoose.model("TaskSession", taskSessionSchema);