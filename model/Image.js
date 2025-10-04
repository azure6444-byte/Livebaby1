import mongoose from "mongoose";

const imageSchema = new mongoose.Schema({
  image: { type: String, required: true },
  prompt: { type: String, default: "" },
  createdAt: { type: Date, default: Date.now },
});

export default mongoose.model("Image", imageSchema);
