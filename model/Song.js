const mongoose = require("mongoose");

const songSchema = new mongoose.Schema({
  title: { type: String, required: true },
  artist: { type: String, default: "Unknown" },
  category: { type: String, required: true },
  file: { type: String }, // URL or path
  filename: { type: String },
  uploadedAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("Song", songSchema);
