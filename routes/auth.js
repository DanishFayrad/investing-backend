const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Commission = require('../models/Commission');
const Partner = require('../models/Partner');
const Deposit = require('../models/Deposit');
const jwt = require('jsonwebtoken');
const { protect, authorize } = require('../middleware/auth');

const {
    SUCCESSFUL_REFERRALS_THRESHOLD,
    REFERRAL_MILESTONE_BONUS,
} = require('../config/referralConfig');
const { countSuccessfulReferrals } = require('../config/affiliateHelpers');

// @route   POST /api/auth/register
// @desc    Register user
// @access  Public
router.post('/register', async (req, res) => {
  try {
    const { firstName, lastName, email, password, referralCode: refCode } = req.body;

    // Check if user exists
    let user = await User.findOne({ email });
    if (user) {
      return res.status(400).json({ success: false, message: 'User already exists' });
    }

    // Handle referral — partner code takes priority, then user code
    let referredBy = null;
    let referredByPartner = null;
    if (refCode) {
        const partner = await Partner.findOne({ code: String(refCode).toUpperCase() });
        if (partner) {
            referredByPartner = partner._id;
        } else {
            const referrer = await User.findOne({ referralCode: refCode });
            if (referrer) referredBy = referrer._id;
        }
    }

    // Generate unique referral code for new user
    const newReferralCode = Math.random().toString(36).substring(2, 10).toUpperCase();

    // Create user
    user = await User.create({
      firstName,
      lastName,
      email,
      password,
      referralCode: newReferralCode,
      referredBy,
      referredByPartner
    });

    // Create token
    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET || 'fallback_secret', {
      expiresIn: '30d'
    });

    res.status(201).json({
      success: true,
      token,
      user: {
        id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        role: user.role,
        referralCode: user.referralCode
      }
    });
  } catch (error) {
    console.error(error);
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(val => val.message);
      return res.status(400).json({ success: false, message: messages.join(', ') });
    }
    res.status(500).json({ success: false, message: 'Server Error' });
  }
});

// @route   POST /api/auth/login
// @desc    Login user
// @access  Public
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validate email and password
    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Please provide email and password' });
    }

    // Check for user
    const user = await User.findOne({ email }).select('+password');
    if (!user) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    // Check if password matches
    const isMatch = await user.matchPassword(password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    // Create token
    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET || 'fallback_secret', {
      expiresIn: '30d'
    });

    res.status(200).json({
      success: true,
      token,
      user: {
        id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        role: user.role,
        referralCode: user.referralCode
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
});

// @route   GET /api/auth/referrals
// @desc    Get user's referrals
// @access  Private
router.get('/referrals', async (req, res) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        if (!token) return res.status(401).json({ success: false, message: 'Unauthorized' });

        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback_secret');
        const referrals = await User.find({ referredBy: decoded.id }).select('firstName lastName email createdAt');

        res.status(200).json({ success: true, data: referrals });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
});

// @route   GET /api/auth/affiliate
// @desc    Get user's affiliate balance + commission history
// @access  Private
router.get('/affiliate', async (req, res) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        if (!token) return res.status(401).json({ success: false, message: 'Unauthorized' });

        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback_secret');
        const user = await User.findById(decoded.id).select('affiliateBalance affiliateEarnedTotal referralBonusGiven');
        if (!user) return res.status(404).json({ success: false, message: 'User not found' });

        const commissions = await Commission.find({ user: decoded.id })
            .populate('referredUser', 'firstName lastName email')
            .sort('-createdAt')
            .limit(50);

        const successfulReferrals = await countSuccessfulReferrals(decoded.id);
        const fastWithdrawalEligible = successfulReferrals >= SUCCESSFUL_REFERRALS_THRESHOLD;

        res.status(200).json({
            success: true,
            data: {
                balance: user.affiliateBalance || 0,
                earnedTotal: user.affiliateEarnedTotal || 0,
                commissions,
                successfulReferrals,
                referralsThreshold: SUCCESSFUL_REFERRALS_THRESHOLD,
                fastWithdrawalEligible,
                milestoneBonusGiven: !!user.referralBonusGiven,
                milestoneBonusAmount: REFERRAL_MILESTONE_BONUS,
            }
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
});

// @route   GET /api/auth/admin/referrals
// @desc    Admin view of all referrers and the users they invited
// @access  Private/Admin
router.get('/admin/referrals', protect, authorize('admin'), async (req, res) => {
    try {
        const referredUsers = await User.find({ referredBy: { $ne: null } })
            .select('firstName lastName email createdAt referredBy')
            .sort('-createdAt');

        const referrerIds = [...new Set(referredUsers.map(u => String(u.referredBy)))];
        const referrers = await User.find({ _id: { $in: referrerIds } })
            .select('firstName lastName email referralCode affiliateBalance affiliateEarnedTotal');

        const groups = referrers.map(r => ({
            _id: r._id,
            firstName: r.firstName,
            lastName: r.lastName,
            email: r.email,
            referralCode: r.referralCode,
            affiliateBalance: r.affiliateBalance || 0,
            affiliateEarnedTotal: r.affiliateEarnedTotal || 0,
            referredUsers: referredUsers
                .filter(u => String(u.referredBy) === String(r._id))
                .map(u => ({
                    _id: u._id,
                    firstName: u.firstName,
                    lastName: u.lastName,
                    email: u.email,
                    createdAt: u.createdAt,
                })),
        }));

        groups.sort((a, b) => b.referredUsers.length - a.referredUsers.length);

        res.status(200).json({ success: true, data: groups });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
});

// @route   GET /api/auth/admin/partners
// @desc    List all partners with registered/active counts
// @access  Private/Admin
router.get('/admin/partners', protect, authorize('admin'), async (req, res) => {
    try {
        const partners = await Partner.find().sort('-createdAt').lean();
        const partnerIds = partners.map(p => p._id);

        const referredUsers = await User.find({ referredByPartner: { $in: partnerIds } })
            .select('_id referredByPartner');

        const userIds = referredUsers.map(u => u._id);
        const activeDeposits = await Deposit.distinct('user', {
            user: { $in: userIds },
            status: 'approved',
        });
        const activeSet = new Set(activeDeposits.map(String));

        const stats = partners.map(p => {
            const usersOfPartner = referredUsers.filter(u => String(u.referredByPartner) === String(p._id));
            const registered = usersOfPartner.length;
            const active = usersOfPartner.filter(u => activeSet.has(String(u._id))).length;
            return { ...p, registered, active };
        });

        res.status(200).json({ success: true, data: stats });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
});

// @route   POST /api/auth/admin/partners
// @desc    Create a new partner
// @access  Private/Admin
router.post('/admin/partners', protect, authorize('admin'), async (req, res) => {
    try {
        const { name, email, notes } = req.body;
        if (!name) return res.status(400).json({ success: false, message: 'Name is required' });

        let code = (req.body.code || '').toUpperCase().trim();
        if (!code) {
            code = 'P' + Math.random().toString(36).substring(2, 9).toUpperCase();
        }

        const existing = await Partner.findOne({ code });
        if (existing) return res.status(400).json({ success: false, message: 'Code already exists' });

        const partner = await Partner.create({ name, email, code, notes });
        res.status(201).json({ success: true, data: partner });
    } catch (error) {
        console.error(error);
        if (error.code === 11000) {
            return res.status(400).json({ success: false, message: 'Code already exists' });
        }
        res.status(500).json({ success: false, message: 'Server Error' });
    }
});

// @route   DELETE /api/auth/admin/partners/:id
// @desc    Delete a partner
// @access  Private/Admin
router.delete('/admin/partners/:id', protect, authorize('admin'), async (req, res) => {
    try {
        const partner = await Partner.findByIdAndDelete(req.params.id);
        if (!partner) return res.status(404).json({ success: false, message: 'Partner not found' });
        res.status(200).json({ success: true, message: 'Partner deleted' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
});

// @route   GET /api/auth/admin/partners/:id/users
// @desc    Detailed list of users under a partner
// @access  Private/Admin
router.get('/admin/partners/:id/users', protect, authorize('admin'), async (req, res) => {
    try {
        const users = await User.find({ referredByPartner: req.params.id })
            .select('firstName lastName email createdAt')
            .sort('-createdAt')
            .lean();

        const userIds = users.map(u => u._id);
        const activeUserIds = await Deposit.distinct('user', { user: { $in: userIds }, status: 'approved' });
        const activeSet = new Set(activeUserIds.map(String));

        const enriched = users.map(u => ({ ...u, isActive: activeSet.has(String(u._id)) }));
        res.status(200).json({ success: true, data: enriched });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
});

module.exports = router;
