const express = require("express");
const cors = require("cors");
const pumpRoutes = require("./routes/pump");
const sensorRoutes = require("./routes/sensor");

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());

app.use("/api/pump", pumpRoutes);
app.use("/api/sensor", sensorRoutes);

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Water automation server running on http://0.0.0.0:${PORT}`);
});
