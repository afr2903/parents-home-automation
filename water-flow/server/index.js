const express = require("express");
const cors = require("cors");
const pumpRoutes = require("./routes/pump");

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());

app.use("/api/pump", pumpRoutes);

app.listen(PORT, () => {
  console.log(`Water pump server running on http://localhost:${PORT}`);
});
