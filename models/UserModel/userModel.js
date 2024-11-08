const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  discordId: { type: String, required: true, unique: true },
  lastHit: { type: Date },
  lastAmount: { type: Number },
  process: { type: String },
});

const UserModel = mongoose.model("user", UserSchema);

module.exports = UserModel;