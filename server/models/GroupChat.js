const mongoose = require('mongoose');

const groupChatSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true
    },
    creator_id: { 
        type: Number,
        required: true
    },
    members: [{ 
        type: Number,
        required: true
    }],
    created_at: {
        type: Date,
        default: Date.now
    }
});

groupChatSchema.index({ members: 1 });
groupChatSchema.index({ creator_id: 1 });

module.exports = mongoose.model('GroupChat', groupChatSchema); 