const mongoose = require('mongoose');

const DepositSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  amount: {
    type: Number,
    required: [true, 'Please add a deposit amount']
  },
  paymentMethod: {
    type: String,
    required: [true, 'Please specify payment method']
  },
  screenshot: {
    type: String,
    required: [true, 'Please upload a screenshot of the payment']
  },
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending'
  },
  transactionId: {
    type: String
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Deposit', DepositSchema);
