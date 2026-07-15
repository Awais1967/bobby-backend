const mongoose = require("mongoose");

const responseSchema = new mongoose.Schema({
  teamId: { type: mongoose.Schema.Types.ObjectId, ref: "Team", required: true },
  teamName: { type: String, required: true, trim: true },
  answerText: { type: String, trim: true, default: "" },
  submittedAt: { type: Date, default: null },
  reviewStatus: { type: String, enum: ["pending", "correct", "incorrect"], default: "pending" },
  result: { type: String, enum: ["pending", "winner", "not_winner"], default: "pending" },
  pointsAwarded: { type: Number, min: 0, default: 0 },
}, { _id: false });

const questionSnapshotSchema = new mongoose.Schema({
  questionText: { type: String, required: true },
  category: { type: String, default: "" },
  type: { type: String, default: "open_text" },
  options: [{ label: String, text: String }],
  fiftyFiftyOptions: [{ type: String }],
  imageUrl: { type: String, default: "" },
  audioUrl: { type: String, default: "" },
  correctAnswer: { type: String, default: "" },
  correctAnswers: [{ type: String }],
  orderingAnswer: [{ type: String }],
  numericAnswer: { type: Number, default: null },
  notes: { type: String, default: "" },
  explanation: { type: String, default: "" },
  points: { type: Number, min: 0, default: 10 },
}, { _id: false });

const tieBreakerSchema = new mongoose.Schema({
  matchDbId: { type: mongoose.Schema.Types.ObjectId, ref: "Match", required: true, index: true },
  matchId: { type: String, required: true, uppercase: true, trim: true },
  questionId: { type: mongoose.Schema.Types.ObjectId, ref: "Question", required: true },
  question: { type: questionSnapshotSchema, required: true },
  status: { type: String, enum: ["open", "closed"], default: "open", index: true },
  responses: [responseSchema],
  revealedAt: { type: Date, default: null },
  closedAt: { type: Date, default: null },
}, { timestamps: true });

tieBreakerSchema.index({ matchDbId: 1, status: 1 });

module.exports = mongoose.model("TieBreaker", tieBreakerSchema);
