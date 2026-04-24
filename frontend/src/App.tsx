import { useState, useEffect, useCallback } from "react";
import { Landing } from "./pages/Landing";
import { Dashboard } from "./pages/Dashboard";

export default function App() {
  const [page, setPage] = useState<"landing" | "dashboard">(
    () => (window.location.hash === "#dashboard" ? "dashboard" : "landing")
  );

  useEffect(() => {
    window.location.hash = page === "dashboard" ? "#dashboard" : "";
  }, [page]);

  if (page === "landing") {
    return <Landing onEnter={() => setPage("dashboard")} />;
  }
  return <Dashboard onHome={() => setPage("landing")} />;
}
