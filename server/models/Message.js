const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
    sender_id: {
        type: Number,
        required: true
    },
    recipient_id: {
        type: Number,
        required: false
    },
    message: {
        type: String,
        required: true
    },
    timestamp: {
        type: Date,
        default: Date.now
    },
    is_read: {
        type: Boolean,
        default: false
    },
    group_chat_id: {
        type: String,
        default: null
    }
});

messageSchema.index({ group_chat_id: 1, timestamp: -1 });
messageSchema.index({ sender_id: 1, recipient_id: 1, timestamp: -1 });

module.exports = mongoose.model('Message', messageSchema); 