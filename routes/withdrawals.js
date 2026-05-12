const express = require('express');
const router = express.Router();
const Withdrawal = require('../models/Withdrawal');
const { protect, authorize } = require('../middleware/auth');

// @route   POST /api/withdrawals
// @desc    Submit a withdrawal request
// @access  Private
router.post('/', protect, async (req, res) => {
  try {
    const { amount, paymentMethod, accountDetails } = req.body;

    if (!amount || !paymentMethod || !accountDetails) {
      return res.status(400).json({ success: false, message: 'Please provide all details' });
    }

    const withdrawal = await Withdrawal.create({
      user: req.user.id,
      amount,
      paymentMethod,
      accountDetails
    });

    res.status(201).json({
      success: true,
      data: withdrawal
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
});

// @route   GET /api/withdrawals/my
// @desc    Get current user's withdrawals
// @access  Private
router.get('/my', protect, async (req, res) => {
  try {
    const withdrawals = await Withdrawal.find({ user: req.user.id }).sort('-createdAt');
    res.status(200).json({ success: true, data: withdrawals });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server Error' });
  }
});

// @route   GET /api/withdrawals/admin
// @desc    Get all withdrawals (Admin only)
// @access  Private/Admin
router.get('/admin', protect, authorize('admin'), async (req, res) => {
  try {
    const withdrawals = await Withdrawal.find().populate('user', 'firstName lastName email').sort('-createdAt');
    res.status(200).json({ success: true, data: withdrawals });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server Error' });
  }
});

// @route   PATCH /api/withdrawals/:id/status
// @desc    Approve or reject a withdrawal (Admin only)
// @access  Private/Admin
router.patch('/:id/status', protect, authorize('admin'), async (req, res) => {
  try {
    const { status } = req.body;
    
    if (!['approved', 'rejected'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status' });
    }

    const withdrawal = await Withdrawal.findById(req.params.id);

    if (!withdrawal) {
      return res.status(404).json({ success: false, message: 'Withdrawal not found' });
    }

    withdrawal.status = status;
    await withdrawal.save();

    res.status(200).json({ success: true, data: withdrawal });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server Error' });
  }
});

module.exports = router;
