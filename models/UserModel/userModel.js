const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  discordId: { type: String, required: true, unique: true },
  lastHit: { type: Date },
  astHit: { type: Number }
});

const UserModel = mongoose.model("user", UserSchema);

module.exports = UserModel;