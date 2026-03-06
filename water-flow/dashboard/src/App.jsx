import { useState, useEffect } from "react";

import ControlTab from "./components/ControlTab";
import HistoryTab from "./components/HistoryTab";
import StatsTab   from "./components/StatsTab";

export default function App() {
  const [activeTab, setActiveTab] = useState("control");
  const [tankConfig, setTankConfig] = useState(null);

  useEffect(() => {
    fetch("/api/sensor/config")
      .then((r) => r.json())
      .then(setTankConfig)
      .catch(() => {});
  }, []);

  return (
    <div className="container">
      <h1>Water Automation</h1>
      <div className="tabs">
        <button className={`tab ${activeTab === "control"  ? "active" : ""}`} onClick={() => setActiveTab("control")}>Control</button>
        <button className={`tab ${activeTab === "history"  ? "active" : ""}`} onClick={() => setActiveTab("history")}>History</button>
        <button className={`tab ${activeTab === "stats"    ? "active" : ""}`} onClick={() => setActiveTab("stats")}>Statistics</button>
      </div>
      {activeTab === "control" ? <ControlTab tankConfig={tankConfig} /> :
       activeTab === "history" ? <HistoryTab tankConfig={tankConfig} /> :
                                 <StatsTab />}
    </div>
  );
}
