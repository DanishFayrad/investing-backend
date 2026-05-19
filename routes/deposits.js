const express = require('express');
const router = express.Router();
const Deposit = require('../models/Deposit');
const User = require('../models/User');
const Commission = require('../models/Commission');
const { protect, authorize } = require('../middleware/auth');
const { uploadScreenshot, cloudinary } = require('../config/cloudinary');

const REFERRAL_PERCENTAGE = 10;

async function creditReferralCommission(deposit) {
  const existing = await Commission.findOne({ deposit: deposit._id });
  if (existing && existing.status === 'credited') return;

  const depositor = await User.findById(deposit.user).select('referredBy');
  if (!depositor || !depositor.referredBy) return;

  const commissionAmount = (Number(deposit.amount) || 0) * (REFERRAL_PERCENTAGE / 100);
  if (commissionAmount <= 0) return;

  if (existing && existing.status === 'reversed') {
    existing.status = 'credited';
    existing.amount = commissionAmount;
    existing.depositAmount = deposit.amount;
    existing.percentage = REFERRAL_PERCENTAGE;
    await existing.save();
  } else {
    await Commission.create({
      user: depositor.referredBy,
      referredUser: deposit.user,
      deposit: deposit._id,
      depositAmount: deposit.amount,
      amount: commissionAmount,
      percentage: REFERRAL_PERCENTAGE,
      status: 'credited',
    });
  }

  await User.findByIdAndUpdate(depositor.referredBy, {
    $inc: { affiliateBalance: commissionAmount, affiliateEarnedTotal: commissionAmount },
  });
}

async function reverseReferralCommission(deposit) {
  const commission = await Commission.findOne({ deposit: deposit._id, status: 'credited' });
  if (!commission) return;

  commission.status = 'reversed';
  await commission.save();

  await User.findByIdAndUpdate(commission.user, {
    $inc: { affiliateBalance: -commission.amount },
  });
}

const handleUpload = (req, res, next) => {
  uploadScreenshot(req, res, (err) => {
    if (err) {
      const message = err.code === 'LIMIT_FILE_SIZE'
        ? 'Screenshot must be under 8MB'
        : err.message || 'Upload failed';
      return res.status(400).json({ success: false, message });
    }
    next();
  });
};

// @route   POST /api/deposits
// @desc    Submit a deposit request (multipart, screenshot uploaded to Cloudinary)
// @access  Private
router.post('/', protect, handleUpload, async (req, res) => {
  try {
    const { amount, paymentMethod, transactionId, planName } = req.body;

    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Please upload a screenshot' });
    }

    const deposit = await Deposit.create({
      user: req.user.id,
      amount,
      paymentMethod,
      transactionId,
      planName,
      screenshot: req.file.path,
      screenshotPublicId: req.file.filename,
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

    const previousStatus = deposit.status;
    deposit.status = status;
    if (status === 'approved') {
      deposit.approvedAt = new Date();
    }
    await deposit.save();

    if (status === 'approved' && previousStatus !== 'approved') {
      await creditReferralCommission(deposit);
    } else if (status !== 'approved' && previousStatus === 'approved') {
      await reverseReferralCommission(deposit);
    }

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

    if (deposit.status === 'approved') {
      await reverseReferralCommission(deposit);
    }

    if (deposit.screenshotPublicId) {
      try {
        await cloudinary.uploader.destroy(deposit.screenshotPublicId);
      } catch (err) {
        console.error('Cloudinary cleanup failed:', err.message);
      }
    }

    await deposit.deleteOne();

    res.status(200).json({ success: true, message: 'Deposit deleted' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
});

module.exports = router;
