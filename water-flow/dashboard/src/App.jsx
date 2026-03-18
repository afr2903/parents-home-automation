import { useState, useEffect, useCallback } from "react";
import { GoogleOAuthProvider, GoogleLogin } from "@react-oauth/google";

import ControlTab from "./components/ControlTab";
import HistoryTab from "./components/HistoryTab";
import StatsTab   from "./components/StatsTab";
import { apiFetch } from "./utils/api";

function parseJwt(token) {
  try {
    const base64Url = token.split(".")[1];
    const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(base64));
  } catch {
    return null;
  }
}

function isTokenExpired(token) {
  const payload = parseJwt(token);
  if (!payload || !payload.exp) return true;
  return Date.now() >= payload.exp * 1000;
}

function getStoredToken() {
  const token = localStorage.getItem("google_id_token");
  if (!token) return null;
  if (isTokenExpired(token)) {
    localStorage.removeItem("google_id_token");
    return null;
  }
  return token;
}

function getUserName(token) {
  const payload = parseJwt(token);
  return payload?.name || payload?.email || "User";
}

function AppContent() {
  const [activeTab, setActiveTab] = useState("control");
  const [tankConfig, setTankConfig] = useState(null);
  const [token, setToken] = useState(getStoredToken);

  const clearToken = useCallback(() => {
    localStorage.removeItem("google_id_token");
    setToken(null);
  }, []);

  const handleLoginSuccess = useCallback((credentialResponse) => {
    const idToken = credentialResponse.credential;
    if (idToken && !isTokenExpired(idToken)) {
      localStorage.setItem("google_id_token", idToken);
      setToken(idToken);
    }
  }, []);

  useEffect(() => {
    if (!token) return;
    apiFetch("/api/sensor/config")
      .then((r) => {
        if (r.status === 401 || r.status === 403) { clearToken(); return; }
        return r.json();
      })
      .then((data) => { if (data) setTankConfig(data); })
      .catch(() => {});
  }, [token, clearToken]);

  if (!token) {
    return (
      <div style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100vh",
        gap: "24px",
      }}>
        <h1>Water Automation</h1>
        <p>Sign in to continue</p>
        <GoogleLogin
          onSuccess={handleLoginSuccess}
          onError={() => console.error("Google Sign-In failed")}
        />
      </div>
    );
  }

  return (
    <div className="container">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1>Water Automation</h1>
        <div style={{ display: "flex", alignItems: "center", gap: "12px", fontSize: "14px" }}>
          <span>{getUserName(token)}</span>
          <button
            onClick={clearToken}
            style={{
              background: "none",
              border: "1px solid #cbd5e1",
              borderRadius: "6px",
              padding: "4px 12px",
              cursor: "pointer",
              fontSize: "13px",
            }}
          >
            Sign Out
          </button>
        </div>
      </div>
      <div className="tabs">
        <button className={`tab ${activeTab === "control"  ? "active" : ""}`} onClick={() => setActiveTab("control")}>Control</button>
        <button className={`tab ${activeTab === "history"  ? "active" : ""}`} onClick={() => setActiveTab("history")}>History</button>
        <button className={`tab ${activeTab === "stats"    ? "active" : ""}`} onClick={() => setActiveTab("stats")}>Statistics</button>
      </div>
      {activeTab === "control" ? <ControlTab tankConfig={tankConfig} onAuthError={clearToken} /> :
       activeTab === "history" ? <HistoryTab tankConfig={tankConfig} onAuthError={clearToken} /> :
                                 <StatsTab onAuthError={clearToken} />}
    </div>
  );
}

export default function App() {
  return (
    <GoogleOAuthProvider clientId={import.meta.env.VITE_GOOGLE_CLIENT_ID}>
      <AppContent />
    </GoogleOAuthProvider>
  );
}
