const express = require('express');
const router = express.Router();
const Deposit = require('../models/Deposit');
const { protect, authorize } = require('../middleware/auth');

// @route   POST /api/deposits
// @desc    Submit a deposit request (Base64 Image)
// @access  Private
router.post('/', protect, async (req, res) => {
  try {
    const { amount, paymentMethod, transactionId, screenshot } = req.body;

    if (!screenshot) {
      return res.status(400).json({ success: false, message: 'Please provide a screenshot (Base64)' });
    }

    const deposit = await Deposit.create({
      user: req.user.id,
      amount,
      paymentMethod,
      transactionId,
      screenshot: screenshot // Storing Base64 string directly
    });

    res.status(201).json({
      success: true,
      data: deposit
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
});

// @route   GET /api/deposits/my
// @desc    Get current user's deposits
// @access  Private
router.get('/my', protect, async (req, res) => {
  try {
    const deposits = await Deposit.find({ user: req.user.id }).sort('-createdAt');
    res.status(200).json({ success: true, data: deposits });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server Error' });
  }
});

// @route   GET /api/deposits/admin
// @desc    Get all deposits (Admin only)
// @access  Private/Admin
router.get('/admin', protect, authorize('admin'), async (req, res) => {
  try {
    const deposits = await Deposit.find().populate('user', 'firstName lastName email').sort('-createdAt');
    res.status(200).json({ success: true, data: deposits });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server Error' });
  }
});

// @route   PATCH /api/deposits/:id/status
// @desc    Approve or reject a deposit (Admin only)
// @access  Private/Admin
router.patch('/:id/status', protect, authorize('admin'), async (req, res) => {
  try {
    const { status } = req.body;
    
    if (!['approved', 'rejected'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status' });
    }

    const deposit = await Deposit.findById(req.params.id);

    if (!deposit) {
      return res.status(404).json({ success: false, message: 'Deposit not found' });
    }

    deposit.status = status;
    if (status === 'approved') {
      deposit.approvedAt = new Date();
    }
    await deposit.save();

    res.status(200).json({ success: true, data: deposit });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server Error' });
  }
});

// @route   DELETE /api/deposits/:id
// @desc    Delete a deposit (Admin only)
// @access  Private/Admin
router.delete('/:id', protect, authorize('admin'), async (req, res) => {
  try {
    const deposit = await Deposit.findById(req.params.id);

    if (!deposit) {
      return res.status(404).json({ success: false, message: 'Deposit not found' });
    }

    await deposit.deleteOne();

    res.status(200).json({ success: true, message: 'Deposit deleted' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
});

module.exports = router;
