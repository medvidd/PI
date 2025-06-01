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
        type: Number,
        default: null
    }
});

module.exports = mongoose.model('Message', messageSchema); 