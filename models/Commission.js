const mongoose = require('mongoose');

const CommissionSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  referredUser: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  deposit: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Deposit',
    required: true,
    unique: true
  },
  depositAmount: {
    type: Number,
    required: true
  },
  amount: {
    type: Number,
    required: true
  },
  percentage: {
    type: Number,
    required: true
  },
  status: {
    type: String,
    enum: ['credited', 'reversed'],
    default: 'credited'
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Commission', CommissionSchema);
