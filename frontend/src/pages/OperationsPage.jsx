import React from "react";
import Header from "../components/Header";
import ShiftNoteTemplate from "../components/ShiftNoteTemplate";
import TrainingTrackerPanel from "../components/TrainingTrackerPanel";
import ActivitySchedulePanel from "../components/ActivitySchedulePanel";
import OperationsWorkspacePanel from "../components/OperationsWorkspacePanel";

export default function OperationsPage() {
  return (
    <div style={{ padding: 24, maxWidth: 1200, margin: "0 auto" }}>
      <Header title="Operations" />
      <OperationsWorkspacePanel />
      <ShiftNoteTemplate />
      <TrainingTrackerPanel />
      <ActivitySchedulePanel />
    </div>
  );
}
