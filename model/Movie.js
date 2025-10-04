import mongoose from "mongoose";

const movieSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: { type: String, required: true },
  video: { type: String, required: true },
  cover: { type: String, default: "" },
  createdAt: { type: Date, default: Date.now },
});

export default mongoose.model("Movie", movieSchema);
