const mongoose = require('mongoose');

const WithdrawalSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.ObjectId,
    ref: 'User',
    required: true
  },
  amount: {
    type: Number,
    required: [true, 'Please add an amount']
  },
  paymentMethod: {
    type: String,
    required: [true, 'Please select a payment method'],
    enum: ['easypaisa', 'jazzcash', 'bank', 'solana', 'tron', 'bnb']
  },
  accountDetails: {
    type: String,
    required: [true, 'Please add account details (number/address)']
  },
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending'
  },
  fastTrack: {
    type: Boolean,
    default: false
  },
  eta: {
    type: String,
    default: '24 hours'
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Withdrawal', WithdrawalSchema);
