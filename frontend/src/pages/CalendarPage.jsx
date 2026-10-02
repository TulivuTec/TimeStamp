import React from "react";
import { SignedIn, SignedOut } from "@clerk/clerk-react";
import { Navigate } from "react-router-dom";
import Calendar from "../components/Calendar";

export default function CalendarPage() {
  return (
    <>
      <SignedIn>
        <div className="container">
          <h1 className="pageTitle">Calendar</h1>
          <p className="pageSubtitle">
            Shared events and published activities for your facility.
          </p>
          <Calendar />
        </div>
      </SignedIn>
      <SignedOut>
        <Navigate to="/sign-in" replace />
      </SignedOut>
    </>
  );
}
