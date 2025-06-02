const mongoose = require('mongoose');

const groupChatSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true
    },
    creator_id: { // ID користувача з вашої MySQL таблиці users
        type: Number,
        required: true
    },
    members: [{ // Масив ID користувачів з вашої MySQL таблиці users
        type: Number,
        required: true
    }],
    created_at: {
        type: Date,
        default: Date.now
    }
});

// Індекси для оптимізації
groupChatSchema.index({ members: 1 });
groupChatSchema.index({ creator_id: 1 });

module.exports = mongoose.model('GroupChat', groupChatSchema); 